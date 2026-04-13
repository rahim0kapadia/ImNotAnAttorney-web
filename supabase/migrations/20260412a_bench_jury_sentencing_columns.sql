-- Add USSC sentencing divergence columns to bench_jury_divergence
-- The original schema had acquittal_rate columns (for CL opinion mining — 0 results).
-- USSC Individual Offender Datafiles provide sentencing-level bench vs jury data instead.
-- Both column sets coexist; render.ts auto-detects which to display.

ALTER TABLE bench_jury_divergence ADD COLUMN IF NOT EXISTS district text;
ALTER TABLE bench_jury_divergence ADD COLUMN IF NOT EXISTS bench_median_sentence numeric;
ALTER TABLE bench_jury_divergence ADD COLUMN IF NOT EXISTS jury_median_sentence numeric;
ALTER TABLE bench_jury_divergence ADD COLUMN IF NOT EXISTS bench_mean_sentence numeric;
ALTER TABLE bench_jury_divergence ADD COLUMN IF NOT EXISTS jury_mean_sentence numeric;
ALTER TABLE bench_jury_divergence ADD COLUMN IF NOT EXISTS trial_penalty_pct numeric;
ALTER TABLE bench_jury_divergence ADD COLUMN IF NOT EXISTS plea_median_sentence numeric;
ALTER TABLE bench_jury_divergence ADD COLUMN IF NOT EXISTS plea_sample integer DEFAULT 0;
ALTER TABLE bench_jury_divergence ADD COLUMN IF NOT EXISTS fiscal_year_range text;
ALTER TABLE bench_jury_divergence ADD COLUMN IF NOT EXISTS offense_category text;

-- Unique index for USSC district-level upserts (district + charge_slug)
-- Partial index: only district-level rows (judge_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS bench_jury_div_district_charge_uniq
  ON bench_jury_divergence (district, charge_slug)
  WHERE judge_id IS NULL;

-- B-tree index for state-based ILIKE lookups in query.ts
CREATE INDEX IF NOT EXISTS bench_jury_div_district_idx
  ON bench_jury_divergence (district)
  WHERE district IS NOT NULL;
