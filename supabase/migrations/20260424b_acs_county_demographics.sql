-- Census ACS 2022 5-year County Demographics — P1 #9
-- Plan: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-23-free-data-sources-full-load.md
--
-- Public-domain American Community Survey 2022 5-year estimates (2018-2022)
-- at county level. Powers War Room $4,997 jury demographics appendix —
-- defendants facing jury trials can see how representative their venire
-- pool is relative to county ACS demographics (Batson / fair-cross-section
-- challenges) and argue venue-change motions from demographic data.
--
-- Source: https://api.census.gov/data/2022/acs/acs5 (unauthenticated path
-- works at this one-shot volume; Census allows batch county queries).

CREATE TABLE IF NOT EXISTS acs_county_demographics (
  -- 5-character FIPS: 2 state + 3 county. PK.
  geoid                   char(5)     PRIMARY KEY,
  state_fips              char(2)     NOT NULL,
  county_fips             char(3)     NOT NULL,
  county_name             text        NOT NULL,
  state_name              text        NOT NULL,

  -- Population + age structure
  total_pop               integer,
  pop_18_plus             integer,
  median_age              numeric(4,1),

  -- Race + ethnicity (ACS race questions are separate from Hispanic ethnicity)
  pop_white_nh            integer,  -- non-Hispanic white
  pop_black_nh            integer,
  pop_native_nh           integer,
  pop_asian_nh            integer,
  pop_pacific_nh          integer,
  pop_other_nh            integer,
  pop_two_plus_nh         integer,
  pop_hispanic            integer,  -- any race

  -- Education (25+ population)
  pop_25_plus             integer,
  hs_diploma_plus         integer,
  bachelors_plus          integer,

  -- Economic
  median_hh_income        integer,   -- dollars
  poverty_count           integer,
  poverty_universe        integer,   -- denominator for poverty rate
  unemployed              integer,
  labor_force             integer,   -- denominator for unemployment rate

  -- Housing
  median_home_value       integer,   -- dollars
  total_housing_units     integer,
  owner_occupied          integer,
  renter_occupied         integer,

  -- Language
  pop_5_plus              integer,
  speak_english_only      integer,
  speak_spanish_home      integer,

  -- Source metadata
  vintage                 smallint    NOT NULL DEFAULT 2022,
  dataset                 text        NOT NULL DEFAULT 'acs5',
  ingested_at             timestamptz NOT NULL DEFAULT now(),

  -- Derived guards
  CONSTRAINT acs_county_geoid_format
    CHECK (geoid ~ '^[0-9]{5}$'),
  CONSTRAINT acs_county_geoid_matches_parts
    CHECK (geoid = state_fips || county_fips)
);

CREATE INDEX IF NOT EXISTS acs_county_state_idx
  ON acs_county_demographics (state_fips);

CREATE INDEX IF NOT EXISTS acs_county_state_name_idx
  ON acs_county_demographics (state_name, county_name);

-- Derived percent views — computed, not stored, to avoid stale recalculation
-- when the underlying counts refresh. Downstream queries read from the view.
CREATE OR REPLACE VIEW acs_county_pct AS
SELECT
  geoid,
  state_fips,
  county_fips,
  county_name,
  state_name,
  total_pop,
  pop_18_plus,
  median_age,
  CASE WHEN total_pop > 0 THEN ROUND((pop_white_nh::numeric    / total_pop) * 100, 2) END AS pct_white_nh,
  CASE WHEN total_pop > 0 THEN ROUND((pop_black_nh::numeric    / total_pop) * 100, 2) END AS pct_black_nh,
  CASE WHEN total_pop > 0 THEN ROUND((pop_native_nh::numeric   / total_pop) * 100, 2) END AS pct_native_nh,
  CASE WHEN total_pop > 0 THEN ROUND((pop_asian_nh::numeric    / total_pop) * 100, 2) END AS pct_asian_nh,
  CASE WHEN total_pop > 0 THEN ROUND((pop_pacific_nh::numeric  / total_pop) * 100, 2) END AS pct_pacific_nh,
  CASE WHEN total_pop > 0 THEN ROUND((pop_other_nh::numeric    / total_pop) * 100, 2) END AS pct_other_nh,
  CASE WHEN total_pop > 0 THEN ROUND((pop_two_plus_nh::numeric / total_pop) * 100, 2) END AS pct_two_plus_nh,
  CASE WHEN total_pop > 0 THEN ROUND((pop_hispanic::numeric    / total_pop) * 100, 2) END AS pct_hispanic,
  CASE WHEN pop_25_plus > 0 THEN ROUND((hs_diploma_plus::numeric / pop_25_plus) * 100, 2) END AS pct_hs_plus,
  CASE WHEN pop_25_plus > 0 THEN ROUND((bachelors_plus::numeric  / pop_25_plus) * 100, 2) END AS pct_bachelors_plus,
  median_hh_income,
  CASE WHEN poverty_universe > 0 THEN ROUND((poverty_count::numeric / poverty_universe) * 100, 2) END AS pct_poverty,
  CASE WHEN labor_force > 0 THEN ROUND((unemployed::numeric / labor_force) * 100, 2) END AS pct_unemployed,
  median_home_value,
  CASE WHEN total_housing_units > 0 THEN ROUND((owner_occupied::numeric  / total_housing_units) * 100, 2) END AS pct_owner_occupied,
  CASE WHEN total_housing_units > 0 THEN ROUND((renter_occupied::numeric / total_housing_units) * 100, 2) END AS pct_renter_occupied,
  CASE WHEN pop_5_plus > 0 THEN ROUND((speak_english_only::numeric / pop_5_plus) * 100, 2) END AS pct_english_only,
  CASE WHEN pop_5_plus > 0 THEN ROUND((speak_spanish_home::numeric / pop_5_plus) * 100, 2) END AS pct_spanish_home,
  vintage,
  dataset
FROM acs_county_demographics;

-- RLS — public-domain reference data, service-role only.
ALTER TABLE acs_county_demographics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS acs_county_demographics_service_all ON acs_county_demographics;
CREATE POLICY acs_county_demographics_service_all ON acs_county_demographics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE acs_county_demographics IS
  'US Census ACS 5-year 2022 county-level demographics. 3,143 counties + equivalents. Populated by scripts/ingest/load-acs-county.mjs. Source: api.census.gov/data/2022/acs/acs5.';
COMMENT ON VIEW acs_county_pct IS
  'Derived percent metrics computed from acs_county_demographics counts. Use this for jury-composition comparisons rather than raw counts.';
