-- =============================================================================
-- Court Case -> INAA Port -- Wave 4 -- Tier 4: Multi-Persona QA Loop
-- =============================================================================
--
-- Spec: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-06-court-case-port\04-persona-qa-loop.md
-- Wave: 4 of 4 (Final -- Internal Quality Infrastructure)
-- Order: NINTH -- after 20260408h (Tier 8B) and 20260408g (Tier 3 detector engineering)
-- Reason: References case_motions (Tier 1, 20260407b), audit_gaps + quality_issues (Tier 3, 20260408g)
--
-- This migration:
--   1. CREATEs 8 per-case tables for the multi-persona QA convergence loop:
--      persona_audit_log, qa_loop_state, qa_certifications, persona_intel,
--      factum_log, pari_handoff_queue, veri_handoff_queue, veri_claim_alignments
--   2. All tables FK to cases(id) with CASCADE
--   3. Per-motion tables FK to case_motions(id) with CASCADE
--   4. Nullable FKs to Tier 3 tables (audit_gaps, quality_issues) for cross-reference
--   5. RLS enabled on all tables (service_role only -- operator-facing, never customer-facing)
--   6. moddatetime triggers on tables with updated_at
--   7. Indexes for operator triage queries
--
-- CUSTOMER-FACING SURFACE: ZERO. Persona names (JUDGEY/VERI/CASE/COUNT/FACTUM/
-- PARI/ARTY) are operator-only nomenclature. They NEVER appear in any customer
-- artifact, report HTML, email, sales page, or public-facing string.
--
-- Convergence: 3-iteration hard cap per motion (Decision 2 from plan).
-- Per-motion granularity: each case_motion converges independently (Decision 8).
--
-- DEPENDENCIES (must exist before this migration runs):
--   - cases (00001_initial_schema.sql)
--   - case_motions (20260407b -- Tier 1)
--   - audit_gaps, quality_issues (20260408g -- Tier 3)
--
-- =============================================================================


-- -----------------------------------------------------------------------------
-- SECTION 1: persona_audit_log (Court Case: audit_log, 1357 rows)
-- -----------------------------------------------------------------------------
-- Purpose: Records each persona's verdict on each motion at each iteration.
-- Named persona_audit_log (not audit_log) to avoid collision with any existing
-- audit_log table or future naming conflicts.
--
-- Key design decisions:
--   - persona column uses CHECK constraint with the 7 canonical persona codes
--   - case_motion_id FK to case_motions(id) replaces Court Case motion_path
--   - strategic_motion_code is denormalized for query convenience (e.g., "A-S1")
--   - verdict is PASS/FAIL/BLOCKED (BLOCKED = PASS-with-warning for operator triage)
--   - iteration tracks which convergence iteration this audit belongs to

CREATE TABLE IF NOT EXISTS public.persona_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  case_motion_id uuid NOT NULL REFERENCES public.case_motions(id) ON DELETE CASCADE,
  strategic_motion_code text,
    -- denormalized motion identifier (e.g., "A-S1", "B1-S3")
  persona text NOT NULL,
  verdict text NOT NULL,
  issues_count integer NOT NULL DEFAULT 0,
  issues jsonb,
    -- structured issue details from the reviewing worker
  content_hash text,
    -- sha256 of motion content_html at audit time
  iteration smallint NOT NULL DEFAULT 0,
  report_path text,
    -- nullable -- may not always produce a separate report file
  audited_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT persona_audit_log_persona_check
    CHECK (persona IN ('JUDGEY', 'VERI', 'CASE', 'COUNT', 'FACTUM', 'PARI', 'ARTY')),
  CONSTRAINT persona_audit_log_verdict_check
    CHECK (verdict IN ('PASS', 'FAIL', 'BLOCKED'))
);

-- Latest verdict per persona for a given motion
CREATE INDEX IF NOT EXISTS idx_pal_motion_persona_latest
  ON public.persona_audit_log (case_motion_id, persona, audited_at DESC);

-- Operator triage: all FAILs for a case
CREATE INDEX IF NOT EXISTS idx_pal_case_fail
  ON public.persona_audit_log (case_id, verdict)
  WHERE verdict = 'FAIL';

-- Iteration lookup
CREATE INDEX IF NOT EXISTS idx_pal_motion_iteration
  ON public.persona_audit_log (case_motion_id, iteration);


-- -----------------------------------------------------------------------------
-- SECTION 2: qa_loop_state (Court Case: qa_loop_state, 7 rows)
-- -----------------------------------------------------------------------------
-- Purpose: Tracks convergence state per motion. One row per case_motion.
-- Iteration hard-capped at 3 (Decision 2). Content hash comparison drives
-- convergence detection: if hash is unchanged between iterations, motion has
-- stabilized.
--
-- forced_convergence = true means the loop hit the 3-iteration cap without
-- natural convergence. An operator_task is created for human review.

CREATE TABLE IF NOT EXISTS public.qa_loop_state (
  case_motion_id uuid PRIMARY KEY REFERENCES public.case_motions(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  iteration smallint NOT NULL DEFAULT 0,
  last_content_hash text,
    -- sha256 of motion content_html after latest iteration
  is_converged boolean NOT NULL DEFAULT false,
  converged_at timestamptz,
  forced_convergence boolean NOT NULL DEFAULT false,
    -- true when iteration cap reached without natural convergence
  last_persona text,
    -- last persona that ran (useful for debugging stalled loops)
  last_run_at timestamptz DEFAULT now(),
  arty_approved boolean NOT NULL DEFAULT false,
    -- final approval gate -- only true when all 6 prior personas PASS
  total_changes integer NOT NULL DEFAULT 0,
    -- running count of content modifications across all iterations
  notes text,
    -- e.g., 'forced_convergence_max_iter' for cap-hit motions
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT qa_loop_state_iteration_cap
    CHECK (iteration <= 3),
  CONSTRAINT qa_loop_state_persona_check
    CHECK (last_persona IS NULL OR last_persona IN ('JUDGEY', 'VERI', 'CASE', 'COUNT', 'FACTUM', 'PARI', 'ARTY'))
);

-- Operator view: unconverged motions across all cases
CREATE INDEX IF NOT EXISTS idx_qls_unconverged
  ON public.qa_loop_state (is_converged, forced_convergence)
  WHERE is_converged = false;

-- Per-case convergence overview
CREATE INDEX IF NOT EXISTS idx_qls_case
  ON public.qa_loop_state (case_id);


-- -----------------------------------------------------------------------------
-- SECTION 3: qa_certifications (Court Case: qa_certifications, 92 rows)
-- -----------------------------------------------------------------------------
-- Purpose: Snapshot at convergence. Written once per motion when the loop
-- terminates (either naturally or forced). Contains the per-persona scorecard
-- that operators use for quality dashboards.
--
-- UNIQUE on (case_motion_id, certified_at) allows re-certification if a motion
-- is reopened for another pass (edge case, not expected in normal flow).

CREATE TABLE IF NOT EXISTS public.qa_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  case_motion_id uuid NOT NULL REFERENCES public.case_motions(id) ON DELETE CASCADE,
  certified_at timestamptz NOT NULL DEFAULT now(),
  converged_iteration smallint NOT NULL,
    -- which iteration the loop terminated at
  total_iterations smallint NOT NULL,
    -- total iterations run (may differ from converged_iteration if re-run)
  persona_results jsonb,
    -- full structured results: { "JUDGEY": { verdict, score, ... }, ... }

  -- Per-persona scorecard columns (denormalized for fast operator queries)
  judgey_score smallint,
  judgey_kill_shots smallint,
  veri_citations smallint,
  veri_mismatches smallint,
  case_strong smallint,
  case_invalid smallint,
  count_danger_cases smallint,
  pari_issues smallint,
  pari_blocked smallint,
  arty_filled smallint,
  arty_remaining smallint,

  -- Case law quality indicators
  binding_authority_count smallint,
  reversal_case_count smallint,

  -- Filing status (operator workflow)
  filed_status text NOT NULL DEFAULT 'READY',
    -- READY / FILED / DEFERRED
  filed_date date,
  filed_by text,

  -- Content integrity
  content_hash text,
    -- sha256 of motion content_html at certification time
  arty_approved boolean NOT NULL DEFAULT false,
    -- mirrors qa_loop_state.arty_approved at certification time

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT qa_certifications_motion_time_key
    UNIQUE (case_motion_id, certified_at)
);

-- Latest certification per motion
CREATE INDEX IF NOT EXISTS idx_qc_motion_latest
  ON public.qa_certifications (case_motion_id, certified_at DESC);

-- Operator dashboard: all certifications for a case
CREATE INDEX IF NOT EXISTS idx_qc_case
  ON public.qa_certifications (case_id);

-- Operator triage: motions that certified without ARTY approval
CREATE INDEX IF NOT EXISTS idx_qc_no_arty
  ON public.qa_certifications (arty_approved)
  WHERE arty_approved = false;


-- -----------------------------------------------------------------------------
-- SECTION 4: persona_intel -- THE LOAD-BEARING TABLE (Court Case: 1283 rows)
-- -----------------------------------------------------------------------------
-- Purpose: Structured ammunition ledger. Every observation made by every persona
-- reviewer, tagged with severity, weaponization method, narrative score,
-- escalation flag, and downstream target worker/persona.
--
-- This is the novel value proposition of the persona QA loop. All 25 columns
-- from Court Case are preserved -- none is dead weight. Each captures a distinct
-- dimension of "what reviewer X found that reviewer Y or worker Z needs to act
-- on next."
--
-- Nullable FK to audit_gaps (Tier 3) for cross-referencing persona findings
-- with formal audit gaps.

CREATE TABLE IF NOT EXISTS public.persona_intel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  case_motion_id uuid NOT NULL REFERENCES public.case_motions(id) ON DELETE CASCADE,
  iteration smallint NOT NULL DEFAULT 0,
  reporting_persona text NOT NULL,
    -- which persona reported this finding

  -- Finding details
  finding text NOT NULL,
  finding_tag text,
    -- classification tag: #ci, #chain, #foundation, #constitutional, #threshold, #counter
  section_id text,
    -- section of the motion where the finding applies
  source_reference text,
    -- citation or evidence reference backing the finding

  -- Weaponization potential
  weaponization_potential text,
    -- how this finding can be used offensively in the motion
  elite_attorney_method text,
    -- e.g., "Lichtman CI destruction", "Scheck foundation attack"

  -- Routing
  target_personas text[],
    -- which downstream personas/workers should act on this finding
  narrative_connection text,
    -- how this finding connects to the overall case narrative
  narrative_score smallint DEFAULT 5,
    -- 1-10 scale of narrative relevance

  -- Preemptive preparation
  preemptive_prep text,
    -- preparation steps to address the finding before it becomes an issue

  -- Severity and escalation
  severity text NOT NULL DEFAULT 'MEDIUM',
  escalate_to_human boolean NOT NULL DEFAULT false,
  escalation_reason text,

  -- Weaponization tracking (filled when the finding is acted upon)
  weaponized_by text,
    -- which persona/worker acted on this finding
  weaponized_at timestamptz,
  weaponization_outcome text,
  success_pattern text,
    -- what pattern emerged from successful weaponization

  -- Fallback path (when weaponization is not possible)
  unable_to_weaponize boolean NOT NULL DEFAULT false,
  fallback_action text,

  -- Cross-reference to Tier 3 audit_gaps (nullable -- only populated when
  -- a persona finding corresponds to a formal audit gap)
  audit_gap_id uuid REFERENCES public.audit_gaps(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT persona_intel_persona_check
    CHECK (reporting_persona IN ('JUDGEY', 'VERI', 'CASE', 'COUNT', 'FACTUM', 'PARI', 'ARTY')),
  CONSTRAINT persona_intel_severity_check
    CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  CONSTRAINT persona_intel_narrative_score_check
    CHECK (narrative_score >= 1 AND narrative_score <= 10),
  CONSTRAINT persona_intel_weaponization_outcome_check
    CHECK (weaponization_outcome IS NULL OR weaponization_outcome IN ('SUCCESS', 'PARTIAL', 'FAILED'))
);

-- Operator triage: high-severity intel for a case
CREATE INDEX IF NOT EXISTS idx_pi_case_severity
  ON public.persona_intel (case_id, severity);

-- Per-motion per-iteration lookup (the primary query pattern)
CREATE INDEX IF NOT EXISTS idx_pi_motion_iteration
  ON public.persona_intel (case_motion_id, iteration);

-- Escalated items requiring human attention
CREATE INDEX IF NOT EXISTS idx_pi_escalated
  ON public.persona_intel (escalate_to_human)
  WHERE escalate_to_human = true;

-- Cross-reference to audit gaps
CREATE INDEX IF NOT EXISTS idx_pi_audit_gap
  ON public.persona_intel (audit_gap_id)
  WHERE audit_gap_id IS NOT NULL;


-- -----------------------------------------------------------------------------
-- SECTION 5: factum_log (FACTUM persona gap tracking)
-- -----------------------------------------------------------------------------
-- Purpose: Records placeholder/gap counts found by the FACTUM persona
-- (motion-generation worker). Each row represents one iteration's gap scan
-- for one motion. The ARTY gating logic checks gaps_unfilled = 0 before
-- approving.

CREATE TABLE IF NOT EXISTS public.factum_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  case_motion_id uuid NOT NULL REFERENCES public.case_motions(id) ON DELETE CASCADE,
  iteration smallint NOT NULL DEFAULT 0,

  -- Gap counts by marker type
  needs_markers integer NOT NULL DEFAULT 0,
    -- count of [NEEDS:...] placeholders
  placeholder_markers integer NOT NULL DEFAULT 0,
    -- count of {PLACEHOLDER} markers
  verify_markers integer NOT NULL DEFAULT 0,
    -- count of [VERIFY] markers
  gaps_unfilled integer NOT NULL DEFAULT 0,
    -- total unfilled gaps (sum of above or custom count)
  gaps_total integer NOT NULL DEFAULT 0,
    -- total gaps found (including already-filled ones)

  -- Details
  gap_details jsonb,
    -- structured list of each gap: { marker, section, context }
  verdict text NOT NULL DEFAULT 'FAIL',
    -- PASS when gaps_unfilled = 0, FAIL otherwise
  content_hash text,
    -- sha256 of motion content at scan time

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT factum_log_verdict_check
    CHECK (verdict IN ('PASS', 'FAIL'))
);

-- Latest factum scan per motion per iteration
CREATE INDEX IF NOT EXISTS idx_fl_motion_iteration
  ON public.factum_log (case_motion_id, iteration DESC);

-- Per-case factum overview
CREATE INDEX IF NOT EXISTS idx_fl_case
  ON public.factum_log (case_id);


-- -----------------------------------------------------------------------------
-- SECTION 6: pari_handoff_queue (PARI persona handoff items)
-- -----------------------------------------------------------------------------
-- Purpose: Tracks items that VERI or PARI persona found needing counterplay
-- review. The operator triage queue filters on resolved_at IS NULL to show
-- pending items. ARTY checks for unresolved BLOCKING items before approving.

CREATE TABLE IF NOT EXISTS public.pari_handoff_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  case_motion_id uuid NOT NULL REFERENCES public.case_motions(id) ON DELETE CASCADE,
  iteration smallint NOT NULL DEFAULT 0,

  -- Source
  source_persona text NOT NULL,
    -- which persona created this handoff item
  issue_type text NOT NULL,
    -- TRUNCATED_SENTENCE / NEEDS_MARKER / QUOTE_TRUNCATED / EVIDENCE_TYPE_MISMATCH /
    -- STRUCTURAL_ISSUE / COUNTERPLAY_GAP
  severity text NOT NULL DEFAULT 'MEDIUM',

  -- Details
  description text,
  target_persona text,
    -- which persona should handle this (usually 'PARI')
  section_id text,
    -- section of the motion where the issue lives
  source_reference text,

  -- Resolution tracking
  resolved_at timestamptz,
  resolved_by text,
  resolution_notes text,

  -- Cross-reference to quality_issues (Tier 3, nullable)
  quality_issue_id uuid REFERENCES public.quality_issues(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pari_handoff_persona_check
    CHECK (source_persona IN ('JUDGEY', 'VERI', 'CASE', 'COUNT', 'FACTUM', 'PARI', 'ARTY')),
  CONSTRAINT pari_handoff_severity_check
    CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'BLOCKING'))
);

-- Operator triage: unresolved handoff items per case
CREATE INDEX IF NOT EXISTS idx_phq_unresolved
  ON public.pari_handoff_queue (case_id, target_persona)
  WHERE resolved_at IS NULL;

-- Per-motion iteration lookup
CREATE INDEX IF NOT EXISTS idx_phq_motion_iteration
  ON public.pari_handoff_queue (case_motion_id, iteration);

-- BLOCKING items (ARTY gating check)
CREATE INDEX IF NOT EXISTS idx_phq_blocking
  ON public.pari_handoff_queue (severity)
  WHERE severity = 'BLOCKING' AND resolved_at IS NULL;


-- -----------------------------------------------------------------------------
-- SECTION 7: veri_handoff_queue (VERI persona handoff items)
-- -----------------------------------------------------------------------------
-- Purpose: Items flagged by VERI (citation verification) for follow-up.
-- Similar structure to pari_handoff_queue but routed to citation-specific
-- downstream workers.

CREATE TABLE IF NOT EXISTS public.veri_handoff_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  case_motion_id uuid NOT NULL REFERENCES public.case_motions(id) ON DELETE CASCADE,
  iteration smallint NOT NULL DEFAULT 0,

  -- Source
  source_persona text NOT NULL DEFAULT 'VERI',
  issue_type text NOT NULL,
    -- CITATION_MISSING / CITATION_WRONG / QUOTE_TRUNCATED / HOLDING_MISMATCH /
    -- NEGATIVE_TREATMENT / SUPERSEDED / WRONG_JURISDICTION
  severity text NOT NULL DEFAULT 'MEDIUM',

  -- Citation details
  citation_text text,
    -- the citation string that has the issue
  expected_text text,
    -- what the citation should say (if known)
  case_law_id uuid,
    -- FK to case_law table if applicable (nullable, not enforced as FK
    -- since case_law may not exist for all citations)

  -- Details
  description text,
  target_persona text,
    -- which persona should handle this (usually 'CASE' or 'COUNT')
  section_id text,

  -- Resolution tracking
  resolved_at timestamptz,
  resolved_by text,
  resolution_notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT veri_handoff_persona_check
    CHECK (source_persona IN ('JUDGEY', 'VERI', 'CASE', 'COUNT', 'FACTUM', 'PARI', 'ARTY')),
  CONSTRAINT veri_handoff_severity_check
    CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'BLOCKING'))
);

-- Operator triage: unresolved VERI items per case
CREATE INDEX IF NOT EXISTS idx_vhq_unresolved
  ON public.veri_handoff_queue (case_id, target_persona)
  WHERE resolved_at IS NULL;

-- Per-motion iteration lookup
CREATE INDEX IF NOT EXISTS idx_vhq_motion_iteration
  ON public.veri_handoff_queue (case_motion_id, iteration);


-- -----------------------------------------------------------------------------
-- SECTION 8: veri_claim_alignments (VERI citation verification details)
-- -----------------------------------------------------------------------------
-- Purpose: Per-citation verification results from the VERI persona. Each row
-- represents one citation checked against its source. Used by the ARTY
-- gating logic and operator dashboards to see citation-level detail.

CREATE TABLE IF NOT EXISTS public.veri_claim_alignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  case_motion_id uuid NOT NULL REFERENCES public.case_motions(id) ON DELETE CASCADE,
  iteration smallint NOT NULL DEFAULT 0,

  -- Citation identification
  citation_text text NOT NULL,
    -- the full citation string as it appears in the motion
  section_id text,
    -- section of the motion where the citation appears
  case_law_id uuid,
    -- FK to case_law table if applicable (nullable, not enforced)

  -- Alignment result
  alignment_status text NOT NULL DEFAULT 'UNCHECKED',
    -- ALIGNED / MISALIGNED / PARTIAL / UNCHECKED / NOT_FOUND
  holding_match boolean,
    -- does the cited holding match the actual holding
  quote_match boolean,
    -- does any quoted text match the source
  jurisdiction_match boolean,
    -- is the case from the correct jurisdiction

  -- Details
  source_text text,
    -- actual text from the source opinion
  discrepancy_notes text,
    -- what specifically is wrong
  confidence_score smallint,
    -- 0-100 confidence in the alignment assessment

  -- Verification source
  verified_via text,
    -- 'courtlistener' / 'cap' / 'manual' / 'westlaw'
  verification_url text,
    -- URL used for verification (MANDATORY per no-hallucinated-legal-data rule)

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vca_alignment_check
    CHECK (alignment_status IN ('ALIGNED', 'MISALIGNED', 'PARTIAL', 'UNCHECKED', 'NOT_FOUND'))
);

-- Per-motion alignment overview
CREATE INDEX IF NOT EXISTS idx_vca_motion_iteration
  ON public.veri_claim_alignments (case_motion_id, iteration);

-- Misaligned citations (operator triage)
CREATE INDEX IF NOT EXISTS idx_vca_misaligned
  ON public.veri_claim_alignments (alignment_status)
  WHERE alignment_status IN ('MISALIGNED', 'NOT_FOUND');

-- Per-case overview
CREATE INDEX IF NOT EXISTS idx_vca_case
  ON public.veri_claim_alignments (case_id);


-- =============================================================================
-- SECTION 9: RLS -- enable on all 8 tables
-- =============================================================================
-- All tables are operator-facing only. Service role gets full access.
-- Anonymous role gets zero access. No customer-facing queries ever touch these.

ALTER TABLE public.persona_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_loop_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_intel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factum_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pari_handoff_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veri_handoff_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veri_claim_alignments ENABLE ROW LEVEL SECURITY;

-- Service role full access + anon no access (DO block applies to all 8 tables)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'persona_audit_log', 'qa_loop_state', 'qa_certifications', 'persona_intel',
    'factum_log', 'pari_handoff_queue', 'veri_handoff_queue', 'veri_claim_alignments'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "service_role_all_%I" ON public.%I',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY "service_role_all_%I" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t, t
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS "anon_no_access_%I" ON public.%I',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY "anon_no_access_%I" ON public.%I FOR ALL TO anon USING (false)',
      t, t
    );
  END LOOP;
END $$;


-- =============================================================================
-- SECTION 10: moddatetime triggers
-- =============================================================================
-- Only on tables that have updated_at columns. factum_log, qa_certifications,
-- and veri_claim_alignments are append-only (no updated_at), so no trigger needed.

DROP TRIGGER IF EXISTS update_persona_audit_log_updated_at ON public.persona_audit_log;
-- persona_audit_log has no updated_at (append-only per audit event)

DROP TRIGGER IF EXISTS update_qa_loop_state_updated_at ON public.qa_loop_state;
CREATE TRIGGER update_qa_loop_state_updated_at
  BEFORE UPDATE ON public.qa_loop_state
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

DROP TRIGGER IF EXISTS update_persona_intel_updated_at ON public.persona_intel;
CREATE TRIGGER update_persona_intel_updated_at
  BEFORE UPDATE ON public.persona_intel
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

DROP TRIGGER IF EXISTS update_pari_handoff_queue_updated_at ON public.pari_handoff_queue;
CREATE TRIGGER update_pari_handoff_queue_updated_at
  BEFORE UPDATE ON public.pari_handoff_queue
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

DROP TRIGGER IF EXISTS update_veri_handoff_queue_updated_at ON public.veri_handoff_queue;
CREATE TRIGGER update_veri_handoff_queue_updated_at
  BEFORE UPDATE ON public.veri_handoff_queue
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');


-- =============================================================================
-- Verification queries (run manually post-apply):
--
-- -- New tables exist (expect 8 rows):
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN ('persona_audit_log', 'qa_loop_state', 'qa_certifications',
--     'persona_intel', 'factum_log', 'pari_handoff_queue', 'veri_handoff_queue',
--     'veri_claim_alignments')
--   ORDER BY tablename;
--
-- -- RLS enabled on all:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN ('persona_audit_log', 'qa_loop_state', 'qa_certifications',
--     'persona_intel', 'factum_log', 'pari_handoff_queue', 'veri_handoff_queue',
--     'veri_claim_alignments');
--
-- -- Trigger smoke test (qa_loop_state):
-- INSERT INTO qa_loop_state (case_motion_id, case_id)
--   SELECT id, case_id FROM case_motions LIMIT 1;
-- UPDATE qa_loop_state SET iteration = 1 WHERE true;
-- SELECT updated_at > created_at FROM qa_loop_state LIMIT 1; -- should be true
-- DELETE FROM qa_loop_state WHERE true;
--
-- -- FK integrity: persona_intel -> audit_gaps cross-reference
-- -- (only valid after Tier 3 is applied)
-- SELECT COUNT(*) FROM persona_intel pi
--   LEFT JOIN audit_gaps ag ON pi.audit_gap_id = ag.id
--   WHERE pi.audit_gap_id IS NOT NULL AND ag.id IS NULL; -- should be 0
--
-- =============================================================================
