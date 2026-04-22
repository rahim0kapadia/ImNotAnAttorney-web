-- Judge Sentencing Fingerprint — 2 per-judge outcome tables.
-- Plan: docs/plans/2026-04-23-judge-sentencing-fingerprint-execute.md
--
-- Per-judge anchor: cl_dockets.assigned_to_id → entities_judges.cl_person_id.
--
-- Security (per L1 auto-security findings 2026-04-22):
--   ENABLE RLS on both tables with permissive SELECT to anon/authenticated
--   REVOKE write privileges from anon/authenticated (defense-in-depth)
--   k-anonymity CHECK: n_cases >= 5 (prevents small-cell re-identification)

BEGIN;

CREATE TABLE IF NOT EXISTS public.judge_disposition_profile (
  id BIGSERIAL PRIMARY KEY,
  judge_canonical_id UUID NOT NULL REFERENCES public.entities_judges(canonical_id) ON DELETE CASCADE,
  author_id BIGINT NOT NULL,
  judge_name TEXT NOT NULL,
  offense_category TEXT,
  n_cases INTEGER NOT NULL,
  n_disposed INTEGER NOT NULL,
  n_plea INTEGER NOT NULL,
  n_trial INTEGER NOT NULL,
  n_dismissed INTEGER NOT NULL,
  n_convicted INTEGER NOT NULL,
  plea_rate NUMERIC(5,4),
  trial_rate NUMERIC(5,4),
  dismissal_rate NUMERIC(5,4),
  conviction_rate NUMERIC(5,4),
  district_id TEXT,
  district_plea_rate NUMERIC(5,4),
  deviation_vs_district NUMERIC(5,4),
  baseline_source TEXT DEFAULT 'fjc_integrated_database (dataset_source=4) x cl_dockets',
  data_as_of TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (judge_canonical_id, offense_category),
  CONSTRAINT judge_disposition_profile_min_cell CHECK (n_cases >= 5)
);
CREATE INDEX IF NOT EXISTS idx_jdp_judge ON public.judge_disposition_profile (judge_canonical_id);
CREATE INDEX IF NOT EXISTS idx_jdp_district ON public.judge_disposition_profile (district_id);
CREATE INDEX IF NOT EXISTS idx_jdp_offense_category ON public.judge_disposition_profile (offense_category);
COMMENT ON TABLE public.judge_disposition_profile IS
  'Per-judge plea/trial/dismissal/conviction rates on federal criminal dockets. Source: cl_dockets x fjc_integrated_database (dataset_source=4). k-anonymity: n_cases >= 5.';

CREATE TABLE IF NOT EXISTS public.judge_reversal_rate (
  id BIGSERIAL PRIMARY KEY,
  judge_canonical_id UUID NOT NULL REFERENCES public.entities_judges(canonical_id) ON DELETE CASCADE,
  author_id BIGINT NOT NULL,
  judge_name TEXT NOT NULL,
  n_appealable_opinions INTEGER NOT NULL,
  n_affirmed INTEGER NOT NULL,
  n_reversed INTEGER NOT NULL,
  n_vacated INTEGER NOT NULL,
  n_remanded INTEGER NOT NULL,
  reversal_rate NUMERIC(5,4),
  baseline_rate NUMERIC(5,4),
  deviation_from_baseline NUMERIC(5,4),
  baseline_source TEXT DEFAULT 'cl_opinion_bodies (appellate) x cl_citation_map',
  data_as_of TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (judge_canonical_id),
  CONSTRAINT judge_reversal_rate_min_cell CHECK (n_appealable_opinions >= 5)
);
CREATE INDEX IF NOT EXISTS idx_jrr_judge ON public.judge_reversal_rate (judge_canonical_id);
CREATE INDEX IF NOT EXISTS idx_jrr_reversal_rate ON public.judge_reversal_rate (reversal_rate DESC NULLS LAST);
COMMENT ON TABLE public.judge_reversal_rate IS
  'Per-judge reversal rate from appellate citation graph. For each district/circuit-authored opinion, scan citing opinions from higher courts and detect disposition keywords. k-anonymity: n_appealable_opinions >= 5.';

ALTER TABLE public.judge_disposition_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.judge_reversal_rate       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jdp_public_read ON public.judge_disposition_profile;
CREATE POLICY jdp_public_read ON public.judge_disposition_profile FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS jrr_public_read ON public.judge_reversal_rate;
CREATE POLICY jrr_public_read  ON public.judge_reversal_rate       FOR SELECT TO anon, authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.judge_disposition_profile FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.judge_reversal_rate       FROM anon, authenticated;

COMMIT;
