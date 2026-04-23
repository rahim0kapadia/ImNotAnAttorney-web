-- Judge Fingerprint v3 — Signal 4 total-authored column + Signal 5 table
-- Plan: docs/plans/2026-04-23-judge-sentencing-fingerprint-execute.md

BEGIN;

-- Signal 4 additive columns: n_total_authored + true_reversal_rate
ALTER TABLE public.judge_reversal_rate
  ADD COLUMN IF NOT EXISTS n_total_authored INTEGER,
  ADD COLUMN IF NOT EXISTS true_reversal_rate NUMERIC(6,5),
  ADD COLUMN IF NOT EXISTS review_coverage_rate NUMERIC(5,4);

-- Signal 5: per-judge demographic sentencing delta
CREATE TABLE IF NOT EXISTS public.judge_demographic_sentencing (
  id BIGSERIAL PRIMARY KEY,
  judge_canonical_id UUID REFERENCES public.entities_judges(canonical_id) ON DELETE CASCADE,
  judge_name_normalized TEXT NOT NULL,
  judge_name TEXT,
  district TEXT,
  defendant_race TEXT NOT NULL,
  total_cases INTEGER NOT NULL,
  median_sentence_months NUMERIC(8,2),
  mean_sentence_months NUMERIC(8,2),
  guideline_departure_rate NUMERIC(5,4),
  avg_departure_pct NUMERIC(6,2),
  delta_vs_judge_overall_median_months NUMERIC(8,2),
  delta_vs_district_median_months NUMERIC(8,2),
  source_urls TEXT[],
  data_as_of TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (judge_name_normalized, district, defendant_race),
  CONSTRAINT jds_min_cell CHECK (total_cases >= 5)
);
CREATE INDEX IF NOT EXISTS idx_jds_judge ON public.judge_demographic_sentencing (judge_canonical_id);
CREATE INDEX IF NOT EXISTS idx_jds_judge_norm ON public.judge_demographic_sentencing (judge_name_normalized);
CREATE INDEX IF NOT EXISTS idx_jds_delta ON public.judge_demographic_sentencing (delta_vs_judge_overall_median_months DESC NULLS LAST);
COMMENT ON TABLE public.judge_demographic_sentencing IS
  'Per-judge per-defendant-race sentencing delta. Source: judge_sentencing_demographics (3155 rows, osf.io/nseh5) projected to canonical-judge layer. Shows "Judge X sentences [race] Y months harsher than overall/district median". k-anonymity: total_cases >= 5. Sentencing Fingerprint Signal 5.';

ALTER TABLE public.judge_demographic_sentencing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jds_public_read ON public.judge_demographic_sentencing;
CREATE POLICY jds_public_read ON public.judge_demographic_sentencing FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.judge_demographic_sentencing FROM anon, authenticated;

COMMIT;
