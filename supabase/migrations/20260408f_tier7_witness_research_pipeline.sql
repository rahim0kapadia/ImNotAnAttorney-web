-- =============================================================================
-- Court Case -> INAA Port -- Wave 3 -- Tier 7: Witness Research Pipeline
-- =============================================================================
--
-- Spec: C:\Users\email\projects\ImNotAnAttorney\docs\plans\
--       2026-04-06-court-case-port\07-witness-research-pipeline.md
-- Wave: 3 of 4 (parallel with Tier 3 Detector Engineering + Tier 8B)
-- Order: AFTER Wave 1 (Tier 5 + Tier 1) and Wave 2 (Tier 2 + Tier 6)
--
-- This migration:
--   1. CREATEs witness_research_prompts     (per-Gemini-call state machine)
--   2. CREATEs witness_research_results     (raw response + 5 extraction JSONs)
--   3. CREATEs witness_source_urls          (per-witness URL provenance ledger)
--   4. CREATEs witness_template_performance (continuous improvement metrics)
--   5. CREATEs cross_witness_patterns       (multi-witness pattern detection)
--   6. CREATEs witness_discovery_demands    (pre-built demand letters per witness)
--   7. ALTERs case_witnesses to add 6 rollup/path columns
--   8. Installs 3 plpgsql rollup triggers
--   9. Seeds witness_template_performance with 13 INAA templates
--  10. Enables RLS + service_role/anon policies on all new tables
--  11. Installs moddatetime trigger on witness_discovery_demands
--
-- Feature flag gating: witness_research_pipeline (Phase 0 -- currently OFF).
-- Workers and Edge Function consume new tables ONLY when flag is enabled.
--
-- Hard rules:
--   - Every person research call MUST use Gemini (never Claude)
--   - Every customer-facing witness fact MUST trace to a real source URL
--     stored in witness_source_urls
--   - No AI/Claude/ML disclosure in customer-facing copy
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. witness_research_prompts -- per-Gemini-call state machine
-- -----------------------------------------------------------------------------
-- One row per Gemini deep research call attempt. Tracks the full lifecycle:
-- pending -> generated -> sent -> received -> processed (or needs_reprompt).
-- The worker creates the row at 'generated', fires deepResearch(), then
-- updates through the remaining states. Retry creates a NEW row linked
-- via previous_prompt_id.

CREATE TABLE IF NOT EXISTS public.witness_research_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  witness_id uuid NOT NULL REFERENCES public.case_witnesses(id) ON DELETE CASCADE,
  witness_name text NOT NULL,
  witness_type text,
  template_name text NOT NULL,
  template_version text DEFAULT '1.0',
  prompt_text text,
  status text DEFAULT 'pending' NOT NULL,
    -- pending | generated | sent | received | processed | needs_reprompt | budget_exceeded
  wave_id integer,
  wave_priority integer,
  severity_score real,
  priority_rank integer,
  created_at timestamptz DEFAULT now() NOT NULL,
  generated_at timestamptz,
  sent_at timestamptz,
  received_at timestamptz,
  processed_at timestamptz,
  extraction_score real,
  case_law_extracted integer DEFAULT 0,
  motions_extracted integer DEFAULT 0,
  findings_extracted integer DEFAULT 0,
  conflicts_found integer DEFAULT 0,
  retry_count integer DEFAULT 0,
  previous_prompt_id uuid REFERENCES public.witness_research_prompts(id),
  retry_reason text,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_witness_research_prompts_case
  ON public.witness_research_prompts(case_id);
CREATE INDEX IF NOT EXISTS idx_witness_research_prompts_witness
  ON public.witness_research_prompts(witness_id);
CREATE INDEX IF NOT EXISTS idx_witness_research_prompts_status
  ON public.witness_research_prompts(status);
CREATE INDEX IF NOT EXISTS idx_witness_research_prompts_template
  ON public.witness_research_prompts(template_name);

-- -----------------------------------------------------------------------------
-- 2. witness_research_results -- raw Gemini response + structured extractions
-- -----------------------------------------------------------------------------
-- Stores the raw deepResearch() response plus 5 structured JSON extractions
-- (disciplinary, lawsuits, testimony, certifications, scandals). The
-- witness-dossier worker reads from here instead of re-calling Gemini.
-- processed=false means the dossier worker has not yet consumed this row.

CREATE TABLE IF NOT EXISTS public.witness_research_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  witness_id uuid NOT NULL REFERENCES public.case_witnesses(id) ON DELETE CASCADE,
  prompt_id uuid REFERENCES public.witness_research_prompts(id) ON DELETE SET NULL,
  prompt_generated_date timestamptz,
  research_completed_date timestamptz DEFAULT now(),
  raw_response text,
  extracted_disciplinary jsonb,
  extracted_lawsuits jsonb,
  extracted_testimony jsonb,
  extracted_certifications jsonb,
  extracted_scandals jsonb,
  url_verification_status jsonb,
  source_verification_status text,
  processed boolean DEFAULT false NOT NULL,
  dossier_updated boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_witness_research_results_case
  ON public.witness_research_results(case_id);
CREATE INDEX IF NOT EXISTS idx_witness_research_results_witness
  ON public.witness_research_results(witness_id);
CREATE INDEX IF NOT EXISTS idx_witness_research_results_processed
  ON public.witness_research_results(witness_id, processed);

-- -----------------------------------------------------------------------------
-- 3. witness_source_urls -- per-witness URL provenance ledger
-- -----------------------------------------------------------------------------
-- One row per source URL returned by Gemini grounding. url_hash is sha256 of
-- the normalized URL for deduplication. The UNIQUE constraint on
-- (witness_id, url_hash) prevents the same URL being recorded twice for the
-- same witness even across retries.
--
-- status values track HTTP HEAD verification:
--   unverified | verified_200 | verified_redirect | broken_404 |
--   broken_5xx | timeout | unreachable
--
-- source_type classifies the URL domain:
--   press_release | court_record | news_article | government_db |
--   personal_blog | social_media

CREATE TABLE IF NOT EXISTS public.witness_source_urls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  witness_id uuid NOT NULL REFERENCES public.case_witnesses(id) ON DELETE CASCADE,
  witness_name text NOT NULL,
  source_name text,
  url text NOT NULL,
  url_hash text,
  status text DEFAULT 'unverified' NOT NULL,
  http_status integer,
  verified_at timestamptz,
  source_type text,
  excerpt text,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT witness_source_urls_unique_per_witness UNIQUE (witness_id, url_hash)
);

CREATE INDEX IF NOT EXISTS idx_witness_source_urls_case
  ON public.witness_source_urls(case_id);
CREATE INDEX IF NOT EXISTS idx_witness_source_urls_witness
  ON public.witness_source_urls(witness_id);
CREATE INDEX IF NOT EXISTS idx_witness_source_urls_status
  ON public.witness_source_urls(status);

-- -----------------------------------------------------------------------------
-- 4. witness_template_performance -- continuous improvement metrics
-- -----------------------------------------------------------------------------
-- Single row per template_name (text PK, not UUID). The witness-research
-- worker UPSERTs after each Gemini call to track which templates produce
-- the highest extraction scores. No case FK -- this is a global lookup.
-- No CASCADE -- template rows outlive any individual case.

CREATE TABLE IF NOT EXISTS public.witness_template_performance (
  template_name text PRIMARY KEY,
  times_used integer DEFAULT 0 NOT NULL,
  avg_extraction_score real DEFAULT 0 NOT NULL,
  total_case_law integer DEFAULT 0 NOT NULL,
  total_motions integer DEFAULT 0 NOT NULL,
  total_findings integer DEFAULT 0 NOT NULL,
  success_rate real DEFAULT 0 NOT NULL,
  last_used timestamptz,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- -----------------------------------------------------------------------------
-- 5. cross_witness_patterns -- multi-witness pattern detection
-- -----------------------------------------------------------------------------
-- Detects relationships between witnesses in the same case: same agency,
-- same unit, shared findings, supervisory chains, etc. Created by the
-- witness-research worker inline after each witness research completes.
-- Tier 2 (Cross-Exam Library) also writes to this table.
--
-- CHECK: source and target witness must be different.
-- UNIQUE: one pattern_type per directional witness pair per case.

CREATE TABLE IF NOT EXISTS public.cross_witness_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  source_witness_id uuid NOT NULL REFERENCES public.case_witnesses(id) ON DELETE CASCADE,
  target_witness_id uuid NOT NULL REFERENCES public.case_witnesses(id) ON DELETE CASCADE,
  pattern_type text NOT NULL,
    -- SAME_AGENCY | SAME_UNIT | SAME_INCIDENT | SAME_SUPERVISOR | SAME_FINDING |
    -- UNIT_CULTURE | AGENCY_POLICY | TRAINING_ISSUE | SHARED_DISCIPLINE | SHARED_LAWSUIT
  description text,
  strategic_value text,
  shared_finding_ids uuid[],
  evidence_excerpts jsonb,
  verified boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT cross_witness_patterns_no_self
    CHECK (source_witness_id <> target_witness_id),
  CONSTRAINT cross_witness_patterns_unique
    UNIQUE (case_id, source_witness_id, target_witness_id, pattern_type)
);

CREATE INDEX IF NOT EXISTS idx_cross_witness_patterns_case
  ON public.cross_witness_patterns(case_id);
CREATE INDEX IF NOT EXISTS idx_cross_witness_patterns_source
  ON public.cross_witness_patterns(source_witness_id);
CREATE INDEX IF NOT EXISTS idx_cross_witness_patterns_target
  ON public.cross_witness_patterns(target_witness_id);

-- -----------------------------------------------------------------------------
-- 6. witness_discovery_demands -- pre-built demand letters per witness
-- -----------------------------------------------------------------------------
-- 3-4 demand letters per witness on average (Court Case had 414 demands for
-- 120 prompts). Each letter is a ready-to-file discovery demand tied to
-- specific research findings. Ships in War Room and Situation Room reports.
--
-- source_research FK uses SET NULL so the demand survives even if the
-- underlying research result is deleted.
-- shipped_in_report_id tracks which report included this demand.

CREATE TABLE IF NOT EXISTS public.witness_discovery_demands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  witness_id uuid NOT NULL REFERENCES public.case_witnesses(id) ON DELETE CASCADE,
  demand_type text NOT NULL,
    -- IA_FILES | BRADY_DISCLOSURES | TRAINING_RECORDS | PERSONNEL_FILE |
    -- PRIOR_TESTIMONY_TRANSCRIPTS | LAB_PROFICIENCY_TESTS | CALIBRATION_RECORDS |
    -- BODY_CAM_FOOTAGE | CHAIN_OF_CUSTODY | POLICY_DOCUMENTS
  priority text DEFAULT 'MEDIUM' NOT NULL,
    -- HIGH | MEDIUM | LOW
  description text,
  letter_text text,
  source_research uuid REFERENCES public.witness_research_results(id) ON DELETE SET NULL,
  status text DEFAULT 'pending' NOT NULL,
    -- pending | drafted | reviewed | shipped_in_report
  motion_package_id uuid,
  shipped_in_report_id uuid REFERENCES public.cases(id),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_witness_discovery_demands_case
  ON public.witness_discovery_demands(case_id);
CREATE INDEX IF NOT EXISTS idx_witness_discovery_demands_witness
  ON public.witness_discovery_demands(witness_id);
CREATE INDEX IF NOT EXISTS idx_witness_discovery_demands_status
  ON public.witness_discovery_demands(status);

-- -----------------------------------------------------------------------------
-- 7. ALTER case_witnesses -- 6 rollup/path columns
-- -----------------------------------------------------------------------------
-- Individual ALTER statements for idempotent re-apply. These columns are
-- maintained by the 3 triggers below (demands count, source URL counts,
-- extraction score) plus direct writes from the dossier workers (paths).

ALTER TABLE public.case_witnesses
  ADD COLUMN IF NOT EXISTS dossier_path text;
ALTER TABLE public.case_witnesses
  ADD COLUMN IF NOT EXISTS dossier_part2_path text;
ALTER TABLE public.case_witnesses
  ADD COLUMN IF NOT EXISTS discovery_demands_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.case_witnesses
  ADD COLUMN IF NOT EXISTS source_url_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.case_witnesses
  ADD COLUMN IF NOT EXISTS verified_source_url_count integer DEFAULT 0 NOT NULL;
ALTER TABLE public.case_witnesses
  ADD COLUMN IF NOT EXISTS research_extraction_score real;

-- -----------------------------------------------------------------------------
-- 8. Rollup triggers (3 plpgsql functions + triggers)
-- -----------------------------------------------------------------------------

-- 8a. Trigger: maintain discovery_demands_count on case_witnesses
CREATE OR REPLACE FUNCTION public.update_witness_discovery_demands_count()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.case_witnesses
  SET discovery_demands_count = (
    SELECT count(*) FROM public.witness_discovery_demands
    WHERE witness_id = COALESCE(NEW.witness_id, OLD.witness_id)
  ),
  updated_at = now()
  WHERE id = COALESCE(NEW.witness_id, OLD.witness_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_witness_discovery_demands_rollup
  ON public.witness_discovery_demands;
CREATE TRIGGER trg_witness_discovery_demands_rollup
  AFTER INSERT OR UPDATE OR DELETE ON public.witness_discovery_demands
  FOR EACH ROW
  EXECUTE FUNCTION public.update_witness_discovery_demands_count();

-- 8b. Trigger: maintain source_url_count + verified_source_url_count
CREATE OR REPLACE FUNCTION public.update_witness_source_url_counts()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.case_witnesses
  SET source_url_count = (
    SELECT count(*) FROM public.witness_source_urls
    WHERE witness_id = COALESCE(NEW.witness_id, OLD.witness_id)
  ),
  verified_source_url_count = (
    SELECT count(*) FROM public.witness_source_urls
    WHERE witness_id = COALESCE(NEW.witness_id, OLD.witness_id)
      AND status IN ('verified_200', 'verified_redirect')
  ),
  updated_at = now()
  WHERE id = COALESCE(NEW.witness_id, OLD.witness_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_witness_source_url_rollup
  ON public.witness_source_urls;
CREATE TRIGGER trg_witness_source_url_rollup
  AFTER INSERT OR UPDATE OR DELETE ON public.witness_source_urls
  FOR EACH ROW
  EXECUTE FUNCTION public.update_witness_source_url_counts();

-- 8c. Trigger: maintain research_extraction_score (latest score from prompts)
CREATE OR REPLACE FUNCTION public.update_witness_research_extraction_score()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.case_witnesses
  SET research_extraction_score = NEW.extraction_score,
      updated_at = now()
  WHERE id = NEW.witness_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_witness_research_extraction_score
  ON public.witness_research_prompts;
CREATE TRIGGER trg_witness_research_extraction_score
  AFTER UPDATE OF extraction_score ON public.witness_research_prompts
  FOR EACH ROW WHEN (NEW.extraction_score IS NOT NULL)
  EXECUTE FUNCTION public.update_witness_research_extraction_score();

-- -----------------------------------------------------------------------------
-- 9. Seed witness_template_performance -- 13 INAA templates with Court Case priors
-- -----------------------------------------------------------------------------
-- Bootstrap data from the 120 historical Court Case research_prompts, aggregated
-- by template_name and mapped to INAA template names. Gives the worker a
-- starting prior for weighted template selection from the first run.
-- ON CONFLICT DO NOTHING: safe re-apply if seed already exists.
--
-- ADMINISTRATIVE has 0% success rate (3 attempts, 0 above 50) -- intentional.
-- DEFENSE-ATTORNEY has 0 uses -- template exists but was never exercised.

INSERT INTO public.witness_template_performance
  (template_name, times_used, avg_extraction_score, total_case_law, total_findings, success_rate, last_used)
VALUES
  ('LEO-DETECTIVE',       19, 70.26, 0,  85, 0.6842, now()),
  ('LEO-PATROL',          32, 72.97, 0, 121, 0.7500, now()),
  ('LEO-SUPERVISOR',      10, 64.50, 0,  27, 0.6000, now()),
  ('FORENSIC-LAB',         3, 73.33, 0,  18, 0.6667, now()),
  ('FORENSIC-SCENE',       3, 73.33, 0,  18, 0.6667, now()),
  ('EXPERT-WITNESS',       2, 80.00, 0,  10, 0.7500, now()),
  ('CI-INFORMANT',         1, 85.00, 0,   5, 1.0000, now()),
  ('CIVILIAN-WITNESS',     2, 60.00, 0,   8, 0.5000, now()),
  ('PROSECUTION-TEAM',     1, 50.00, 0,   3, 0.5000, now()),
  ('JUDGE-PROFILE',        1, 70.00, 0,   2, 0.5000, now()),
  ('INTELLIGENCE-ANALYST', 2, 75.00, 0,   8, 0.7500, now()),
  ('ADMINISTRATIVE',       3, 33.33, 0,  18, 0.0000, now()),
  ('DEFENSE-ATTORNEY',     0,  0.00, 0,   0, 0.0000, now())
ON CONFLICT (template_name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 10. RLS policies -- service_role full access, anon blocked
-- -----------------------------------------------------------------------------
-- Matches the pattern from Wave 1 (prosecution_arguments, trap_escapes,
-- case_judge_audit_results). Workers use service_role key; anon gets nothing.

-- witness_research_prompts
ALTER TABLE public.witness_research_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_witness_research_prompts"
  ON public.witness_research_prompts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_witness_research_prompts"
  ON public.witness_research_prompts
  FOR ALL
  TO anon
  USING (false);

-- witness_research_results
ALTER TABLE public.witness_research_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_witness_research_results"
  ON public.witness_research_results
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_witness_research_results"
  ON public.witness_research_results
  FOR ALL
  TO anon
  USING (false);

-- witness_source_urls
ALTER TABLE public.witness_source_urls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_witness_source_urls"
  ON public.witness_source_urls
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_witness_source_urls"
  ON public.witness_source_urls
  FOR ALL
  TO anon
  USING (false);

-- witness_template_performance
ALTER TABLE public.witness_template_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_witness_template_performance"
  ON public.witness_template_performance
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_witness_template_performance"
  ON public.witness_template_performance
  FOR ALL
  TO anon
  USING (false);

-- cross_witness_patterns (table + RLS may already exist from Tier 2 migration)
ALTER TABLE public.cross_witness_patterns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_all_cross_witness_patterns"
    ON public.cross_witness_patterns FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "anon_no_access_cross_witness_patterns"
    ON public.cross_witness_patterns FOR ALL TO anon
    USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- witness_discovery_demands
ALTER TABLE public.witness_discovery_demands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_witness_discovery_demands"
  ON public.witness_discovery_demands
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_witness_discovery_demands"
  ON public.witness_discovery_demands
  FOR ALL
  TO anon
  USING (false);

-- -----------------------------------------------------------------------------
-- 11. moddatetime trigger for updated_at maintenance
-- -----------------------------------------------------------------------------
-- Only witness_discovery_demands and witness_template_performance have
-- updated_at columns among the new tables. case_witnesses already has its
-- own moddatetime trigger from the initial schema.

CREATE TRIGGER update_witness_discovery_demands_updated_at
  BEFORE UPDATE ON public.witness_discovery_demands
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

CREATE TRIGGER update_witness_template_performance_updated_at
  BEFORE UPDATE ON public.witness_template_performance
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');

-- =============================================================================
-- Verification queries (run manually post-apply):
--
-- -- New tables exist (expect 6 rows):
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN (
--     'witness_research_prompts', 'witness_research_results',
--     'witness_source_urls', 'witness_template_performance',
--     'cross_witness_patterns', 'witness_discovery_demands'
--   ) ORDER BY tablename;
--
-- -- New columns on case_witnesses (expect 6 rows):
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'case_witnesses' AND column_name IN (
--   'dossier_path', 'dossier_part2_path', 'discovery_demands_count',
--   'source_url_count', 'verified_source_url_count', 'research_extraction_score'
-- ) ORDER BY column_name;
--
-- -- RLS enabled (expect 6 rows, all true):
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN (
--     'witness_research_prompts', 'witness_research_results',
--     'witness_source_urls', 'witness_template_performance',
--     'cross_witness_patterns', 'witness_discovery_demands'
--   ) ORDER BY tablename;
--
-- -- Seed data present (expect 13 rows):
-- SELECT template_name, times_used, avg_extraction_score, success_rate
--   FROM witness_template_performance ORDER BY times_used DESC;
--
-- -- Triggers installed (expect 5 triggers):
-- SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_witness%'
--    OR tgname LIKE 'update_witness_%_updated_at';
--
-- =============================================================================
