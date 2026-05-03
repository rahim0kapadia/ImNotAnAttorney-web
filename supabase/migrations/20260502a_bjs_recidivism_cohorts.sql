-- BJS Recidivism Cohorts
--
-- Stores normalized recidivism statistics from Bureau of Justice Statistics
-- per-publication CSV ZIP releases (rpr34s, rpr24s, etc).
--
-- Source pattern: BJS publishes per-study ZIP archives at
--   https://bjs.ojp.gov/BJS_PUB/<pubcode>/csv/<pubcode>.zip
--   https://bjs.ojp.gov/redirect-legacy/content/pub/sheets/<pubcode>.zip
-- Each ZIP contains 30-40 wide-format CSV publication tables.
--
-- This table normalizes ONE row per (cohort x demographic x outcome x year)
-- so downstream BOFU surfaces (Case Decoder, Intelligence Brief) can render
-- charge-type recidivism stats without re-parsing wide tables at query time.
--
-- See docs/data-sources/bjs-recidivism.md for ingest mechanics.

CREATE TABLE IF NOT EXISTS bjs_recidivism_cohorts (
  canonical_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_release_year    integer NOT NULL,
  state                  text,
  offense_category       text NOT NULL,
  offense_subcategory    text,
  follow_up_years        integer NOT NULL,
  outcome_type           text NOT NULL,
  cohort_size            integer,
  outcome_count          integer,
  outcome_rate_pct       numeric(5,2),
  demographic_segment    text NOT NULL,
  source_url             text NOT NULL,
  source_dataset_name    text,
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bjs_recidivism_outcome_chk CHECK (outcome_type IN
    ('rearrested', 'reconvicted', 'returned-to-prison')),
  CONSTRAINT bjs_recidivism_followup_chk CHECK (follow_up_years BETWEEN 1 AND 10),
  CONSTRAINT bjs_recidivism_rate_chk CHECK (outcome_rate_pct IS NULL OR
    (outcome_rate_pct >= 0 AND outcome_rate_pct <= 100))
);

CREATE UNIQUE INDEX IF NOT EXISTS bjs_recidivism_cohorts_uq
  ON bjs_recidivism_cohorts (
    cohort_release_year,
    COALESCE(state, '__national__'),
    offense_category,
    COALESCE(offense_subcategory, '__none__'),
    follow_up_years,
    outcome_type,
    demographic_segment
  );

CREATE INDEX IF NOT EXISTS bjs_recidivism_cohorts_offense_idx
  ON bjs_recidivism_cohorts (offense_category, offense_subcategory, follow_up_years);

CREATE INDEX IF NOT EXISTS bjs_recidivism_cohorts_source_idx
  ON bjs_recidivism_cohorts (source_url);

COMMENT ON TABLE bjs_recidivism_cohorts IS 'BJS recidivism statistics: one row per (cohort x demographic x outcome x follow-up-year). Source: bjs.ojp.gov per-publication CSV ZIPs.';
