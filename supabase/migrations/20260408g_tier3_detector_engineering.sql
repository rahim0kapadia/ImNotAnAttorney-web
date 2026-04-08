-- =============================================================================
-- Court Case -> INAA Port -- Wave 3 -- Tier 3: Detector Engineering
-- =============================================================================
--
-- Spec: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-06-court-case-port\03-detector-engineering.md
-- Wave: 3 of 4 (parallel with Tier 7 + Tier 8B)
-- Purpose: Detector registry, false-positive measurement infrastructure,
--          operator review queues, and pattern lifecycle audit trail.
--
-- This migration creates 8 tables:
--   1. detectors              -- registry of all detection patterns (LIBRARY, no CASCADE)
--   2. detector_tuning        -- append-only FP sample log with auto-recommendations
--   3. detector_performance   -- running aggregate counters per detector per period
--   4. detector_synthesis_candidates -- proposed new detectors for human review
--   5. pattern_expansion_log  -- append-only detector lifecycle audit trail
--   6. audit_gaps             -- granular gap items below audit_runs (per-case, CASCADE)
--   7. quality_issues         -- granular quality issue queue per file (per-case, CASCADE)
--   8. detector_emissions     -- lightweight per-emission log
--
-- Plus: indexes, RLS policies, helper functions, trigger, and operator RPC.
--
-- All CREATE TABLE IF NOT EXISTS for idempotency.
-- All tables use service_role-only RLS (operator-facing, never customer-facing).
--
-- Tier 4 (Wave 4) depends on audit_gaps and quality_issues existing.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- SECTION 1: detectors (LIBRARY table)
-- -----------------------------------------------------------------------------
-- Purpose: Combined registry of Court Case 75 + INAA detection-patterns.json 24
-- + worker-internal patterns. Every detector that can emit a finding must have
-- a row here. PK is text detector_id (e.g., 'BRADY_MATERIAL_INDICATOR').
-- LIBRARY table: NO CASCADE to core tables. Detectors exist independently.

CREATE TABLE IF NOT EXISTS public.detectors (
  detector_id text PRIMARY KEY,
  finding_type text UNIQUE,
  display_name text NOT NULL,
  tier text NOT NULL DEFAULT 'UNCLASSIFIED',
    -- Court Case taxonomy: A-K + CROSS_DOC + UNCLASSIFIED (text, not enum)
  severity text NOT NULL DEFAULT 'MEDIUM',
    -- CRITICAL / HIGH / MEDIUM / LOW
  pattern_description text,
  version text NOT NULL DEFAULT '1.0',
  false_positive_rate real,
    -- NULL until measured; 0.0-1.0 scale
  last_tuned_date timestamptz,
    -- Court Case stored as TEXT; we use timestamptz for proper querying

  -- INAA extensions beyond Court Case schema
  source_systems jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- e.g., ["court_case"], ["inaa_json"], ["court_case","inaa_json","inaa_worker"]
  inaa_worker_name text,
    -- which engine worker emits this detector; NULL if static-data only
  attack_pattern_link text,
    -- links to attack pattern in system/libraries/attack-patterns.json
  charge_types text[] DEFAULT '{all}',
    -- e.g., {all}, {drug_trafficking,drug_possession}
  requires_fields text[] DEFAULT '{}',
    -- fields the detector needs to operate

  is_active boolean NOT NULL DEFAULT true,
    -- operator kill switch: worker checks this before emitting

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_detectors_active
  ON public.detectors (is_active, severity);

ALTER TABLE public.detectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_detectors"
  ON public.detectors
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_detectors"
  ON public.detectors
  FOR ALL
  TO anon
  USING (false);


-- -----------------------------------------------------------------------------
-- SECTION 2: detector_tuning (append-only FP sample log)
-- -----------------------------------------------------------------------------
-- Purpose: Each row is one empirical FP measurement sample. An operator or the
-- measure-detector-fp.mjs harness inserts a row after marking an emission as
-- verified / false_positive / needs_review. The trigger auto-fills
-- recommendation and recommended_action based on false_positive_rate.

CREATE TABLE IF NOT EXISTS public.detector_tuning (
  tuning_id bigserial PRIMARY KEY,
  detector_id text NOT NULL REFERENCES public.detectors(detector_id),

  -- Sample data
  sample_size integer NOT NULL DEFAULT 0,
  false_positives integer NOT NULL DEFAULT 0,
  false_positive_rate real NOT NULL DEFAULT 0.0,
    -- computed: false_positives / sample_size

  -- Auto-generated recommendation (filled by trigger)
  recommendation text,
    -- e.g., "CRITICAL: 74% FP rate. Consider disabling or major pattern revision."
  recommended_action text,
    -- enum-like: disable, revise, monitor, accept

  -- Status tracking
  status text NOT NULL DEFAULT 'pending',
    -- pending / applied / ignored
  applied_at timestamptz,
    -- set when operator marks as applied

  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_detector_tuning_pending
  ON public.detector_tuning (status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_detector_tuning_detector
  ON public.detector_tuning (detector_id);

ALTER TABLE public.detector_tuning ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_detector_tuning"
  ON public.detector_tuning
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_detector_tuning"
  ON public.detector_tuning
  FOR ALL
  TO anon
  USING (false);


-- -----------------------------------------------------------------------------
-- SECTION 3: detector_performance (running aggregate per detector per period)
-- -----------------------------------------------------------------------------
-- Purpose: Per-detector running counters over time windows. Each row represents
-- a time period for a specific detector. Recomputed by SQL function from
-- detector_emissions + detector_tuning data.

CREATE TABLE IF NOT EXISTS public.detector_performance (
  performance_id bigserial PRIMARY KEY,
  detector_id text NOT NULL REFERENCES public.detectors(detector_id),

  -- Time window
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  window_days integer NOT NULL DEFAULT 30,

  -- Counters
  total_emissions integer NOT NULL DEFAULT 0,
  verified_count integer NOT NULL DEFAULT 0,
  false_positive_count integer NOT NULL DEFAULT 0,
  needs_review_count integer NOT NULL DEFAULT 0,
  unverified_count integer NOT NULL DEFAULT 0,

  -- Computed rate for this window
  false_positive_rate real,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_detector_performance_recent
  ON public.detector_performance (detector_id, period_end DESC);

ALTER TABLE public.detector_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_detector_performance"
  ON public.detector_performance
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_detector_performance"
  ON public.detector_performance
  FOR ALL
  TO anon
  USING (false);


-- -----------------------------------------------------------------------------
-- SECTION 4: detector_synthesis_candidates (proposed new detectors)
-- -----------------------------------------------------------------------------
-- Purpose: Auto-proposed or manually-proposed new detectors awaiting human
-- review. Court Case had this table but never built automated synthesis.
-- INAA inherits for forward compatibility; manual proposals only in v1.

CREATE TABLE IF NOT EXISTS public.detector_synthesis_candidates (
  candidate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Proposed detector definition
  proposed_detector_id text NOT NULL,
  proposed_display_name text NOT NULL,
  proposed_tier text DEFAULT 'UNCLASSIFIED',
  proposed_severity text DEFAULT 'MEDIUM',
  proposed_pattern_description text,

  -- Synthesis metadata
  synthesis_method text NOT NULL DEFAULT 'manual_proposal',
    -- manual_proposal / eval_gap_synthesis / frequency_analysis
  source_gap_ids uuid[],
    -- references audit_gaps rows that inspired this candidate
  regex_pattern text,
  keywords text[],
  test_match_count integer DEFAULT 0,

  -- Review status
  status text NOT NULL DEFAULT 'pending',
    -- pending / approved / rejected / deployed
  reviewed_by text,
  reviewed_at timestamptz,
  rejection_reason text,

  -- If approved, the detector_id it became
  deployed_detector_id text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_synthesis_candidates_status
  ON public.detector_synthesis_candidates (status)
  WHERE status = 'pending';

ALTER TABLE public.detector_synthesis_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_detector_synthesis_candidates"
  ON public.detector_synthesis_candidates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_detector_synthesis_candidates"
  ON public.detector_synthesis_candidates
  FOR ALL
  TO anon
  USING (false);


-- -----------------------------------------------------------------------------
-- SECTION 5: pattern_expansion_log (append-only audit trail)
-- -----------------------------------------------------------------------------
-- Purpose: Every detector lifecycle event: created, approved, rejected,
-- deployed, disabled, re-enabled, tuned, version_bumped. This is the long-term
-- substrate that proves detector improvements worked (Decision 6 in the plan).
-- No FK to detectors -- uses logical ref so deleted detectors still have history.

CREATE TABLE IF NOT EXISTS public.pattern_expansion_log (
  log_id bigserial PRIMARY KEY,
  detector_id text NOT NULL,
    -- logical reference, not FK (deleted detectors keep their history)
  event_type text NOT NULL,
    -- created / approved / rejected / deployed / disabled / re_enabled /
    -- tuned / version_bumped / fp_threshold_breach / manual_edit
  actor text NOT NULL DEFAULT 'system',
    -- system / operator / measure_harness / eval_pipeline
  previous_value jsonb,
    -- snapshot of the changed field(s) before this event
  new_value jsonb,
    -- snapshot of the changed field(s) after this event
  notes text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pattern_expansion_log_actor
  ON public.pattern_expansion_log (actor, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pattern_expansion_log_detector
  ON public.pattern_expansion_log (detector_id, created_at DESC);

ALTER TABLE public.pattern_expansion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_pattern_expansion_log"
  ON public.pattern_expansion_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_pattern_expansion_log"
  ON public.pattern_expansion_log
  FOR ALL
  TO anon
  USING (false);


-- -----------------------------------------------------------------------------
-- SECTION 6: audit_gaps (granular gap items below audit_runs)
-- -----------------------------------------------------------------------------
-- Purpose: When an eval run fails a team criterion, each individual failure
-- becomes a row here. This is the granular layer below the run-level audit_runs
-- table. Per-case table with CASCADE on cases deletion.
--
-- EXTENSIBILITY NOTE: Tier 4 (Wave 4) consumes this table for the QA loop.
-- The gap_type and status enums are text (not Postgres enum) for easy extension.
-- source_criterion stores the eval team criterion ID (e.g., 'U7', 'L3').

CREATE TABLE IF NOT EXISTS public.audit_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_id uuid REFERENCES public.audit_runs(id) ON DELETE SET NULL,
    -- nullable: some gaps surface outside a formal audit run
  case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE,
    -- nullable for system-level gaps not tied to a specific case

  -- Gap classification
  gap_type text NOT NULL,
    -- arsenal / attack_pattern / finding / argument / case_law /
    -- attorney_deliverable / trial_document / case_law_sync /
    -- eval_team_fail / eval_team_needs_work
  severity text NOT NULL DEFAULT 'MEDIUM',
    -- CRITICAL / HIGH / MEDIUM / LOW
  source_criterion text,
    -- e.g., 'U7', 'L3', 'D14' -- the eval team criterion that surfaced this

  -- Gap details
  item_id text,
    -- logical ref to the specific item (finding_id, pattern_id, etc.)
  target_file text,
    -- file path or deliverable identifier where the gap was found
  description text,
  remediation_notes text,

  -- Status tracking
  status text NOT NULL DEFAULT 'open',
    -- open / reviewed / remediated / accepted_risk / deferred
  resolved_by text,
  resolved_at timestamptz,

  -- Extensibility: arbitrary metadata for Tier 4+ consumers
  metadata jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_gaps_open
  ON public.audit_gaps (status, severity)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_audit_gaps_case
  ON public.audit_gaps (case_id)
  WHERE case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_gaps_run
  ON public.audit_gaps (audit_run_id)
  WHERE audit_run_id IS NOT NULL;

ALTER TABLE public.audit_gaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_audit_gaps"
  ON public.audit_gaps
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_audit_gaps"
  ON public.audit_gaps
  FOR ALL
  TO anon
  USING (false);


-- -----------------------------------------------------------------------------
-- SECTION 7: quality_issues (granular quality issue queue per file)
-- -----------------------------------------------------------------------------
-- Purpose: Tracks quality issues per deliverable file. Keyed by file_path +
-- file_type, not by finding_id. Per-case table with CASCADE on cases deletion.
--
-- EXTENSIBILITY NOTE: Tier 4 (Wave 4) consumes this for the recompletable
-- artifact queue. file_type and status are text for easy extension.

CREATE TABLE IF NOT EXISTS public.quality_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE,

  -- File identification
  file_path text NOT NULL,
  file_type text NOT NULL,
    -- motion / dossier_p1 / dossier_p2 / report_html / report_md /
    -- update_html / email_html
  file_hash text,
    -- optional content hash for deduplication

  -- Issue details
  issue_type text NOT NULL,
    -- e.g., hallucinated_finding / missing_section / formatting_error /
    -- upl_violation / expert_attribution_error / stale_data
  severity text NOT NULL DEFAULT 'MEDIUM',
    -- CRITICAL / HIGH / MEDIUM / LOW
  description text,
  line_number integer,
    -- if applicable, the line in the source file

  -- Recompletable flag (can the eval pipeline re-run to fix this?)
  is_recompletable boolean NOT NULL DEFAULT false,

  -- Loop tracking (which iteration of the fix loop found this)
  loop_iteration integer NOT NULL DEFAULT 1,

  -- Status tracking
  status text NOT NULL DEFAULT 'pending',
    -- pending / fixed / manual_required / deferred / wont_fix
  resolved_by text,
  resolved_at timestamptz,

  -- Link back to the detector that produced the finding (if applicable)
  detector_id text,
    -- logical ref to detectors.detector_id
  finding_id uuid,
    -- logical ref to case_findings.id

  -- Extensibility: arbitrary metadata for Tier 4+ consumers
  metadata jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_issues_pending
  ON public.quality_issues (status, file_type)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_quality_issues_case
  ON public.quality_issues (case_id)
  WHERE case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quality_issues_detector
  ON public.quality_issues (detector_id)
  WHERE detector_id IS NOT NULL;

ALTER TABLE public.quality_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_quality_issues"
  ON public.quality_issues
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_quality_issues"
  ON public.quality_issues
  FOR ALL
  TO anon
  USING (false);


-- -----------------------------------------------------------------------------
-- SECTION 8: detector_emissions (lightweight per-emission log)
-- -----------------------------------------------------------------------------
-- Purpose: Every time a worker emits a finding through the detector registry,
-- one row is written here. This is the raw data that detector_performance
-- aggregates and detector_tuning samples from. Lightweight: no large payloads.
-- ON DELETE SET NULL for case_id, finding_id, job_id (observability log -- safe
-- to orphan rows when source records are deleted).

CREATE TABLE IF NOT EXISTS public.detector_emissions (
  emission_id bigserial PRIMARY KEY,
  detector_id text NOT NULL REFERENCES public.detectors(detector_id),
  finding_id uuid REFERENCES public.case_findings(id) ON DELETE SET NULL,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.processing_jobs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'unverified',
    -- unverified / verified / false_positive / needs_review
  context_snippet text,
    -- first 200 chars of the finding description for quick operator scanning

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_detector_emissions_detector
  ON public.detector_emissions (detector_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_detector_emissions_case
  ON public.detector_emissions (case_id)
  WHERE case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_detector_emissions_status
  ON public.detector_emissions (status)
  WHERE status IN ('unverified', 'needs_review');

ALTER TABLE public.detector_emissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_detector_emissions"
  ON public.detector_emissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_detector_emissions"
  ON public.detector_emissions
  FOR ALL
  TO anon
  USING (false);


-- =============================================================================
-- SECTION 9: SQL Helper Functions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 9a: compute_detector_recommendation(fp_rate)
-- -----------------------------------------------------------------------------
-- Deterministic recommendation text based on FP rate thresholds.
-- Decision 5 in the plan: no LLM, no cost, instant, sufficient.

CREATE OR REPLACE FUNCTION public.compute_detector_recommendation(fp_rate real)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  pct integer;
BEGIN
  IF fp_rate IS NULL THEN
    RETURN 'UNMEASURED: No FP data available.';
  END IF;

  pct := round(fp_rate * 100)::integer;

  IF fp_rate >= 0.95 THEN
    RETURN format('CRITICAL: %s%% FP rate. Consider disabling.', pct);
  ELSIF fp_rate >= 0.50 THEN
    RETURN format('CRITICAL: %s%% FP rate. Consider disabling or major pattern revision.', pct);
  ELSIF fp_rate >= 0.20 THEN
    RETURN format('HIGH: %s%% FP rate. Pattern needs revision.', pct);
  ELSIF fp_rate >= 0.05 THEN
    RETURN format('MEDIUM: %s%% FP rate. Acceptable but monitor.', pct);
  ELSE
    RETURN format('GOOD: %s%% FP rate.', pct);
  END IF;
END;
$$;


-- -----------------------------------------------------------------------------
-- 9b: Tuning recommendation trigger
-- -----------------------------------------------------------------------------
-- BEFORE INSERT on detector_tuning: auto-fills recommendation and
-- recommended_action so the operator sees them immediately.

CREATE OR REPLACE FUNCTION public.tuning_recommendation_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Auto-fill recommendation text from the deterministic function
  NEW.recommendation := public.compute_detector_recommendation(NEW.false_positive_rate);

  -- Auto-fill recommended_action enum
  IF NEW.false_positive_rate IS NULL THEN
    NEW.recommended_action := 'monitor';
  ELSIF NEW.false_positive_rate >= 0.50 THEN
    NEW.recommended_action := 'disable';
  ELSIF NEW.false_positive_rate >= 0.20 THEN
    NEW.recommended_action := 'revise';
  ELSIF NEW.false_positive_rate >= 0.05 THEN
    NEW.recommended_action := 'monitor';
  ELSE
    NEW.recommended_action := 'accept';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tuning_recommendation ON public.detector_tuning;
CREATE TRIGGER trg_tuning_recommendation
  BEFORE INSERT ON public.detector_tuning
  FOR EACH ROW
  EXECUTE FUNCTION public.tuning_recommendation_trigger();


-- -----------------------------------------------------------------------------
-- 9c: recompute_detector_performance(detector_id, window_days)
-- -----------------------------------------------------------------------------
-- Refreshes the running counters for a given detector over a given window.
-- Aggregates from detector_emissions. UPSERTs into detector_performance.

CREATE OR REPLACE FUNCTION public.recompute_detector_performance(
  p_detector_id text,
  p_window_days integer DEFAULT 30
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_total integer;
  v_verified integer;
  v_fp integer;
  v_needs_review integer;
  v_unverified integer;
  v_fp_rate real;
BEGIN
  v_period_end := now();
  v_period_start := v_period_end - (p_window_days || ' days')::interval;

  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'verified'),
    count(*) FILTER (WHERE status = 'false_positive'),
    count(*) FILTER (WHERE status = 'needs_review'),
    count(*) FILTER (WHERE status = 'unverified')
  INTO v_total, v_verified, v_fp, v_needs_review, v_unverified
  FROM public.detector_emissions
  WHERE detector_id = p_detector_id
    AND created_at >= v_period_start
    AND created_at <= v_period_end;

  -- FP rate: false_positives / (verified + false_positives), NULL if no labeled data
  IF (v_verified + v_fp) > 0 THEN
    v_fp_rate := v_fp::real / (v_verified + v_fp)::real;
  ELSE
    v_fp_rate := NULL;
  END IF;

  -- Upsert: one row per detector per window_days value per period_end day
  INSERT INTO public.detector_performance (
    detector_id, period_start, period_end, window_days,
    total_emissions, verified_count, false_positive_count,
    needs_review_count, unverified_count, false_positive_rate,
    updated_at
  ) VALUES (
    p_detector_id, v_period_start, v_period_end, p_window_days,
    v_total, v_verified, v_fp, v_needs_review, v_unverified, v_fp_rate,
    now()
  );

  -- Also update the detector's own false_positive_rate + last_tuned_date
  UPDATE public.detectors
  SET false_positive_rate = v_fp_rate,
      last_tuned_date = now(),
      updated_at = now()
  WHERE detectors.detector_id = p_detector_id
    AND v_fp_rate IS NOT NULL;
END;
$$;


-- -----------------------------------------------------------------------------
-- 9d: get_top_fp_detectors(limit) -- operator dashboard RPC
-- -----------------------------------------------------------------------------
-- Returns the top N detectors by false_positive_rate for the operator queue.

CREATE OR REPLACE FUNCTION public.get_top_fp_detectors(p_limit integer DEFAULT 10)
RETURNS TABLE(
  detector_id text,
  display_name text,
  tier text,
  severity text,
  false_positive_rate real,
  last_tuned_date timestamptz,
  is_active boolean,
  recommendation text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.detector_id,
    d.display_name,
    d.tier,
    d.severity,
    d.false_positive_rate,
    d.last_tuned_date,
    d.is_active,
    public.compute_detector_recommendation(d.false_positive_rate) AS recommendation
  FROM public.detectors d
  WHERE d.false_positive_rate IS NOT NULL
  ORDER BY d.false_positive_rate DESC
  LIMIT p_limit;
END;
$$;


-- =============================================================================
-- SECTION 10: moddatetime triggers for updated_at columns
-- =============================================================================

DROP TRIGGER IF EXISTS update_detectors_updated_at ON public.detectors;
CREATE TRIGGER update_detectors_updated_at
  BEFORE UPDATE ON public.detectors
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

DROP TRIGGER IF EXISTS update_detector_performance_updated_at ON public.detector_performance;
CREATE TRIGGER update_detector_performance_updated_at
  BEFORE UPDATE ON public.detector_performance
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

DROP TRIGGER IF EXISTS update_detector_synthesis_candidates_updated_at ON public.detector_synthesis_candidates;
CREATE TRIGGER update_detector_synthesis_candidates_updated_at
  BEFORE UPDATE ON public.detector_synthesis_candidates
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

DROP TRIGGER IF EXISTS update_audit_gaps_updated_at ON public.audit_gaps;
CREATE TRIGGER update_audit_gaps_updated_at
  BEFORE UPDATE ON public.audit_gaps
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

DROP TRIGGER IF EXISTS update_quality_issues_updated_at ON public.quality_issues;
CREATE TRIGGER update_quality_issues_updated_at
  BEFORE UPDATE ON public.quality_issues
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');


-- =============================================================================
-- Verification queries (run manually post-apply):
--
-- -- New tables exist (expect 8 rows):
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN ('detectors', 'detector_tuning', 'detector_performance',
--     'detector_synthesis_candidates', 'pattern_expansion_log', 'audit_gaps',
--     'quality_issues', 'detector_emissions')
--   ORDER BY tablename;
--
-- -- RLS enabled on all:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'
--   AND tablename LIKE 'detector%' OR tablename IN ('pattern_expansion_log', 'audit_gaps', 'quality_issues');
--
-- -- Trigger smoke test:
-- INSERT INTO detectors (detector_id, display_name) VALUES ('TEST_SMOKE', 'Smoke Test');
-- INSERT INTO detector_tuning (detector_id, sample_size, false_positives, false_positive_rate)
--   VALUES ('TEST_SMOKE', 100, 74, 0.74);
-- SELECT recommendation, recommended_action FROM detector_tuning WHERE detector_id = 'TEST_SMOKE';
--   -- expect: "CRITICAL: 74% FP rate. Consider disabling or major pattern revision.", "disable"
-- DELETE FROM detector_tuning WHERE detector_id = 'TEST_SMOKE';
-- DELETE FROM detectors WHERE detector_id = 'TEST_SMOKE';
--
-- -- Helper function smoke test:
-- SELECT public.compute_detector_recommendation(0.74);
--   -- expect: "CRITICAL: 74% FP rate. Consider disabling or major pattern revision."
-- SELECT public.compute_detector_recommendation(0.03);
--   -- expect: "GOOD: 3% FP rate."
-- SELECT public.compute_detector_recommendation(NULL);
--   -- expect: "UNMEASURED: No FP data available."
-- =============================================================================
