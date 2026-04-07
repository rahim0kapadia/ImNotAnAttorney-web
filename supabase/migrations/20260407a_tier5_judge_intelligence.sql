-- =============================================================================
-- Court Case -> INAA Port — Wave 1 — Tier 5: Judge Intelligence
-- =============================================================================
--
-- Spec: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-06-court-case-port\05-judge-intelligence.md
-- Wave: 1 of 4 (Foundation + Net-New Positioning)
-- Order: FIRST — Tier 1's case_motion_opportunities.judge_id FK references judge_profiles(id)
--
-- This migration:
--   1. ALTERs existing judge_profiles table to add 10 intelligence columns
--      (table already exists via Management API writes — do NOT CREATE it)
--   2. CREATEs prosecution_arguments library table (statewide, no case FK)
--   3. CREATEs trap_escapes library table (statewide, no case FK)
--   4. CREATEs case_judge_audit_results per-case scoring table
--   5. Enables RLS on new tables with service_role_full_access + anon_no_access
--   6. Installs moddatetime triggers for updated_at maintenance
--   7. Creates indexes for query hot paths
--
-- Feature flag gating: judge_intelligence_profile (Phase 0 — currently OFF).
-- Workers and Edge Function consume new columns ONLY when flag is enabled.
--
-- NAMING DISCREPANCY RESOLVED: Plan source had both intelligence_status/updated_at
-- (used in §5.1 worker logic + rollback) and intelligence_extracted_at/source (in
-- an out-of-date ALTER pass). Worker code wins — this migration uses
-- intelligence_status + intelligence_updated_at. Rollback script drops both
-- defensively, so either choice unwinds cleanly.
--
-- SEED DATA: NOT included in this migration. Seed rows for prosecution_arguments
-- (21 rows, post delta-8 scrub) and trap_escapes (16 rows, post FL-only scrub)
-- are extracted from Court Case judge_auditor.db via a follow-up extraction
-- script and appended in a subsequent migration. Schema ships empty; workers
-- handle empty library gracefully via JSON file fallback until seed lands.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. judge_profiles ALTER — 10 new intelligence columns
-- -----------------------------------------------------------------------------
-- Table already exists via Management API. ALTER ADD COLUMN IF NOT EXISTS is
-- idempotent and safe for re-apply.

ALTER TABLE public.judge_profiles
  ADD COLUMN IF NOT EXISTS magic_words jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.judge_profiles
  ADD COLUMN IF NOT EXISTS forbidden_words jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.judge_profiles
  ADD COLUMN IF NOT EXISTS pet_peeves jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.judge_profiles
  ADD COLUMN IF NOT EXISTS persuasion_triggers jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.judge_profiles
  ADD COLUMN IF NOT EXISTS judicial_philosophy text;
ALTER TABLE public.judge_profiles
  ADD COLUMN IF NOT EXISTS ruling_style text;
ALTER TABLE public.judge_profiles
  ADD COLUMN IF NOT EXISTS suppression_grant_rate real;
ALTER TABLE public.judge_profiles
  ADD COLUMN IF NOT EXISTS reversal_rate real;
ALTER TABLE public.judge_profiles
  ADD COLUMN IF NOT EXISTS intelligence_status text DEFAULT 'pending';
ALTER TABLE public.judge_profiles
  ADD COLUMN IF NOT EXISTS intelligence_updated_at timestamptz;

-- Partial index: only rows with extracted intelligence are queried by
-- motion-judge-scoring worker; avoids scanning pending rows.
CREATE INDEX IF NOT EXISTS idx_judge_profiles_intelligence_complete
  ON public.judge_profiles (intelligence_updated_at)
  WHERE intelligence_status = 'complete';

-- -----------------------------------------------------------------------------
-- 2. prosecution_arguments — statewide library table
-- -----------------------------------------------------------------------------
-- Court Case source had `florida_authority` column; renamed to `authority` +
-- new `authority_jurisdiction` column (default 'federal', Florida rows tagged
-- 'florida'). `jurisdiction` column added for worker filtering: queries filter
-- by (jurisdiction IS NULL OR jurisdiction = $caseState).

CREATE TABLE IF NOT EXISTS public.prosecution_arguments (
  id serial PRIMARY KEY,
  motion_type text NOT NULL,
  argument_name text NOT NULL,
  argument_template text NOT NULL,
  counter_patterns text,
  authority text NOT NULL,
  authority_jurisdiction text DEFAULT 'federal',
  jurisdiction text,
  frequency real DEFAULT 0.5,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT prosecution_arguments_motion_type_name_key
    UNIQUE (motion_type, argument_name)
);

CREATE INDEX IF NOT EXISTS idx_pa_motion_type
  ON public.prosecution_arguments (motion_type);
CREATE INDEX IF NOT EXISTS idx_pa_active
  ON public.prosecution_arguments (is_active)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pa_jurisdiction
  ON public.prosecution_arguments (jurisdiction)
  WHERE jurisdiction IS NOT NULL;

ALTER TABLE public.prosecution_arguments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_prosecution_arguments"
  ON public.prosecution_arguments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_prosecution_arguments"
  ON public.prosecution_arguments
  FOR ALL
  TO anon
  USING (false);

CREATE TRIGGER update_prosecution_arguments_updated_at
  BEFORE UPDATE ON public.prosecution_arguments
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

-- -----------------------------------------------------------------------------
-- 3. trap_escapes — statewide library table
-- -----------------------------------------------------------------------------
-- Same jurisdiction pattern as prosecution_arguments. `severity` is text with
-- CHECK constraint because PostgreSQL enum migration cost is high and the
-- domain is small.

CREATE TABLE IF NOT EXISTS public.trap_escapes (
  id serial PRIMARY KEY,
  trap_name text NOT NULL,
  escape_name text NOT NULL,
  escape_pattern text NOT NULL,
  vulnerability_check text,
  fix_template text NOT NULL,
  severity text NOT NULL DEFAULT 'HIGH',
  jurisdiction text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT trap_escapes_trap_escape_key
    UNIQUE (trap_name, escape_name),
  CONSTRAINT trap_escapes_severity_check
    CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW'))
);

CREATE INDEX IF NOT EXISTS idx_te_trap_name
  ON public.trap_escapes (trap_name);
CREATE INDEX IF NOT EXISTS idx_te_severity
  ON public.trap_escapes (severity);
CREATE INDEX IF NOT EXISTS idx_te_jurisdiction
  ON public.trap_escapes (jurisdiction)
  WHERE jurisdiction IS NOT NULL;

ALTER TABLE public.trap_escapes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_trap_escapes"
  ON public.trap_escapes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_trap_escapes"
  ON public.trap_escapes
  FOR ALL
  TO anon
  USING (false);

CREATE TRIGGER update_trap_escapes_updated_at
  BEFORE UPDATE ON public.trap_escapes
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

-- -----------------------------------------------------------------------------
-- 4. case_judge_audit_results — per-case per-motion scoring
-- -----------------------------------------------------------------------------
-- Populated by motion-judge-scoring.mjs worker (War Room + Situation Room only).
-- FK to judge_profiles(id) establishes the canonical Tier 5 -> Tier 1 bridge;
-- Tier 1's case_motion_opportunities.judge_id also references judge_profiles(id).
-- CASCADE on case_id: per-case scoring dies with the case (correct direction).

CREATE TABLE IF NOT EXISTS public.case_judge_audit_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  judge_profile_id uuid NOT NULL REFERENCES public.judge_profiles(id),
  motion_type text NOT NULL,
  motion_label text,
  prosecution_score integer,
  judge_alignment_score integer,
  trap_strength_score integer,
  overall_score integer,
  grant_probability real,
  denial_reasons jsonb DEFAULT '[]'::jsonb,
  prosecution_gaps jsonb DEFAULT '[]'::jsonb,
  forbidden_words_found jsonb DEFAULT '[]'::jsonb,
  escape_routes jsonb DEFAULT '[]'::jsonb,
  recommendations jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cjar_case_id
  ON public.case_judge_audit_results (case_id);
CREATE INDEX IF NOT EXISTS idx_cjar_judge
  ON public.case_judge_audit_results (judge_profile_id);
CREATE INDEX IF NOT EXISTS idx_cjar_motion_type
  ON public.case_judge_audit_results (motion_type);
CREATE INDEX IF NOT EXISTS idx_cjar_grant_probability
  ON public.case_judge_audit_results (grant_probability DESC NULLS LAST);

ALTER TABLE public.case_judge_audit_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_case_judge_audit_results"
  ON public.case_judge_audit_results
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_case_judge_audit_results"
  ON public.case_judge_audit_results
  FOR ALL
  TO anon
  USING (false);

CREATE TRIGGER update_case_judge_audit_results_updated_at
  BEFORE UPDATE ON public.case_judge_audit_results
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

-- =============================================================================
-- Verification queries (run manually post-apply):
--
-- -- New columns on judge_profiles (expect 10 rows):
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'judge_profiles' AND column_name IN (
--   'magic_words','forbidden_words','pet_peeves','persuasion_triggers',
--   'judicial_philosophy','ruling_style','suppression_grant_rate','reversal_rate',
--   'intelligence_status','intelligence_updated_at'
-- ) ORDER BY column_name;
--
-- -- New tables exist (expect 3 rows):
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN ('prosecution_arguments','trap_escapes','case_judge_audit_results')
-- ORDER BY tablename;
--
-- -- RLS enabled (expect 3 rows, all t):
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('prosecution_arguments','trap_escapes','case_judge_audit_results');
--
-- -- Seed counts (expect 0 for all — seed data ships in follow-up migration):
-- SELECT 'prosecution_arguments' AS t, count(*) FROM prosecution_arguments
-- UNION ALL SELECT 'trap_escapes', count(*) FROM trap_escapes;
--
-- =============================================================================
