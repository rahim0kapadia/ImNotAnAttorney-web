-- Tier 9 — Data-Driven Defense Intelligence Layer
-- 9 new tables + judge_profiles extensions. All applied via Supabase Management
-- API on 2026-04-09 during the Phase B migration (bulk scripts couldn't run
-- without the target tables existing). This file captures the state
-- retroactively so fresh rebuilds and staging envs match production.
--
-- See: docs/handoffs/2026-04-09-tier9-scripts-built.md
-- Data populated by: scripts/bulk-master-extractor.mjs, scripts/bulk-similar-case-matcher.mjs,
-- scripts/bulk-appeal-outcome-correlator.mjs

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. appellate_trends — circuit-level argument reversal rates
-- Populated by: bulk-appeal-outcome-correlator.mjs
-- Queried by: IB, X-Ray, WR, SR
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appellate_trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  argument_type text,
  jurisdiction text,
  year integer,
  reverse_rate numeric,
  affirm_rate numeric,
  sample_size integer DEFAULT 0,
  source_urls text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. bench_jury_divergence — how often a judge acquits at bench trial vs jury
-- Populated by: bulk-master-extractor.mjs
-- Queried by: WR, SR, Judge Report Card standalone SKU
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bench_jury_divergence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_id uuid REFERENCES judge_profiles(id),
  charge_slug text,
  bench_acquittal_rate numeric,
  jury_acquittal_rate numeric,
  bench_sample integer DEFAULT 0,
  jury_sample integer DEFAULT 0,
  source_urls text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. case_feature_vectors — k-NN feature vectors for similar-case lookup
-- Populated by: bulk-similar-case-matcher.mjs
-- Queried by: X-Ray, WR, SR, Similar Cases Analyzer standalone SKU
-- Note: PK is cluster_id (text), not uuid. This is a feature lookup, not a log.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS case_feature_vectors (
  cluster_id text PRIMARY KEY,
  features jsonb DEFAULT '{}'::jsonb,
  jurisdiction text,
  charge_slug text,
  created_at timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. co_defendant_analysis — outcome divergence between co-defendants
-- Populated by: bulk-master-extractor.mjs
-- Queried by: SR
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS co_defendant_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_case_id text,
  co_defendant_case_id text,
  outcome_diff text,
  divergence_factors jsonb DEFAULT '{}'::jsonb,
  source_urls text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. judge_prosecutor_pairings — motion grant rates per judge×prosecutor pair
-- Populated by: bulk-master-extractor.mjs
-- Queried by: WR, SR
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS judge_prosecutor_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_id uuid REFERENCES judge_profiles(id),
  prosecutor_name text NOT NULL,
  motion_type text,
  grant_rate numeric,
  sample_size integer DEFAULT 0,
  source_urls text[] DEFAULT '{}'::text[],
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. judge_quotes — attributable judicial quotations with source URLs
-- Populated by: bulk-master-extractor.mjs
-- Queried by: IB, X-Ray, WR, SR, Judge Report Card standalone SKU
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS judge_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_id uuid REFERENCES judge_profiles(id),
  quote text NOT NULL,
  topic text,
  case_cited text,
  source_url text,
  cluster_id text,
  created_at timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. officer_reliability — cross-case officer credibility tracking
-- Populated by: bulk-master-extractor.mjs
-- Queried by: X-Ray, WR, SR, Officer Background Check standalone SKU
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS officer_reliability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_name text NOT NULL,
  court text,
  jurisdiction text,
  testimony_count integer DEFAULT 0,
  discredited_count integer DEFAULT 0,
  reliability_score numeric,
  brady_history jsonb DEFAULT '[]'::jsonb,
  source_urls text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. plea_discount_curves — plea discount shrinkage as trial approaches
-- Populated by: bulk-master-extractor.mjs
-- Queried by: SR
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plea_discount_curves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction text,
  charge_slug text,
  base_sentence numeric,
  plea_sentence numeric,
  cooperation_bonus numeric,
  sample_size integer DEFAULT 0,
  source_urls text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. sentencing_distributions — per-judge sentencing p25/median/p75 per charge
-- Populated by: bulk-master-extractor.mjs
-- Queried by: X-Ray, WR, SR, Judge Report Card standalone SKU
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sentencing_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_id uuid REFERENCES judge_profiles(id),
  jurisdiction text,
  charge_slug text,
  median_months numeric,
  p25 numeric,
  p75 numeric,
  sample_size integer DEFAULT 0,
  source_urls text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- judge_profiles extensions — aggregate rollups written by bulk-master-extractor
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE judge_profiles ADD COLUMN IF NOT EXISTS sentencing_distributions jsonb;
ALTER TABLE judge_profiles ADD COLUMN IF NOT EXISTS judicial_quotes jsonb;
ALTER TABLE judge_profiles ADD COLUMN IF NOT EXISTS bench_acquittal_rate numeric;
ALTER TABLE judge_profiles ADD COLUMN IF NOT EXISTS jury_acquittal_rate numeric;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — service_role only (identical policy applied to all 9 tables)
-- These tables hold aggregated case-law data. No per-user scoping — service
-- role reads for server-side report generation.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE appellate_trends          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bench_jury_divergence     ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_feature_vectors      ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_defendant_analysis     ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_prosecutor_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_quotes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE officer_reliability       ENABLE ROW LEVEL SECURITY;
ALTER TABLE plea_discount_curves      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentencing_distributions  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='appellate_trends' AND policyname='service_all') THEN
    CREATE POLICY service_all ON appellate_trends FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bench_jury_divergence' AND policyname='service_all') THEN
    CREATE POLICY service_all ON bench_jury_divergence FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='case_feature_vectors' AND policyname='service_all') THEN
    CREATE POLICY service_all ON case_feature_vectors FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='co_defendant_analysis' AND policyname='service_all') THEN
    CREATE POLICY service_all ON co_defendant_analysis FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='judge_prosecutor_pairings' AND policyname='service_all') THEN
    CREATE POLICY service_all ON judge_prosecutor_pairings FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='judge_quotes' AND policyname='service_all') THEN
    CREATE POLICY service_all ON judge_quotes FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='officer_reliability' AND policyname='service_all') THEN
    CREATE POLICY service_all ON officer_reliability FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='plea_discount_curves' AND policyname='service_all') THEN
    CREATE POLICY service_all ON plea_discount_curves FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sentencing_distributions' AND policyname='service_all') THEN
    CREATE POLICY service_all ON sentencing_distributions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
