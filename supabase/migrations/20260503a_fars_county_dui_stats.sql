-- TICKET-11 — FARS County DUI Stats Materialized View
--
-- Per-county / per-year DUI fatality counts, density vs. driving-age
-- population, and intra-state percentile rank. Powers the Case Decoder
-- ($197) county-context paragraph and the DUI Playbook county-stat
-- sidebar.
--
-- Source data:
--   public.fars_crashes  — NHTSA Fatality Analysis Reporting System,
--     2010-2024, 510K rows, ~101K alcohol-involved (drunk_drivers > 0).
--     state_code = SMALLINT FIPS (1, 12, ...).
--     county_code = SMALLINT FIPS (1, 81, 113, ...).
--
--   public.acs_county_demographics — Census ACS 2022 5-year, 3,144
--     counties. geoid = char(5) zero-padded FIPS (state(2)+county(3)).
--     pop_18_plus is used as the driving-age denominator.
--
-- Denominator note (UPL-relevant): the ticket asks for "fatalities per
-- 100K licensed drivers" but FHWA county-level licensed-driver counts
-- are not in our schema. pop_18_plus is the closest proxy already
-- loaded (driving-age population). The matview labels the column
-- `fatalities_per_100k_adults` so callers stay honest about what the
-- denominator actually is. Wording in customer-facing copy MUST match
-- — "per 100K driving-age adults", never "per 100K licensed drivers".
--
-- The percentile column ranks each (state, year) bucket so a county can
-- be described as "in the top quartile for DUI fatality density in
-- [state] in [year]" without making any outcome prediction.
--
-- Refresh cadence: annual (after each FARS release; FARS lags ~18mo).
--   REFRESH MATERIALIZED VIEW CONCURRENTLY public.fars_county_dui_stats;
-- (CONCURRENTLY requires the unique index defined below.)

CREATE MATERIALIZED VIEW IF NOT EXISTS public.fars_county_dui_stats AS
WITH crash_county AS (
  -- Project FARS crash rows into the ACS-compatible (state_fips,
  -- county_fips) char-padded shape, filtering to alcohol-involved
  -- crashes (drunk_drivers > 0) and rows with a usable county code.
  SELECT
    LPAD(state_code::text,  2, '0') AS state_fips,
    LPAD(county_code::text, 3, '0') AS county_fips,
    year,
    fatalities,
    1 AS dui_crash
  FROM public.fars_crashes
  WHERE drunk_drivers > 0
    AND county_code IS NOT NULL
    AND county_code > 0
    AND state_code  IS NOT NULL
    AND state_code  > 0
),
county_year AS (
  -- Aggregate to (state, county, year): DUI crash count + DUI fatalities.
  SELECT
    state_fips,
    county_fips,
    year,
    SUM(dui_crash)::int  AS dui_crashes,
    SUM(fatalities)::int AS dui_fatalities
  FROM crash_county
  GROUP BY state_fips, county_fips, year
),
joined AS (
  -- Left-join ACS demographics for the denominator + display name.
  -- Counties without ACS coverage (e.g., FIPS code retired between
  -- FARS year and ACS vintage) keep the row but produce a NULL
  -- per-100k-adults rate — caller must handle NULL.
  SELECT
    cy.state_fips,
    cy.county_fips,
    cy.year,
    cy.dui_crashes,
    cy.dui_fatalities,
    acs.county_name,
    acs.state_name,
    acs.pop_18_plus,
    CASE
      WHEN acs.pop_18_plus IS NOT NULL AND acs.pop_18_plus > 0
        THEN ROUND(
          (cy.dui_fatalities::numeric / acs.pop_18_plus) * 100000,
          2
        )
      ELSE NULL
    END AS fatalities_per_100k_adults
  FROM county_year cy
  LEFT JOIN public.acs_county_demographics acs
    ON acs.state_fips  = cy.state_fips
   AND acs.county_fips = cy.county_fips
)
SELECT
  state_fips,
  county_fips,
  year,
  county_name,
  state_name,
  dui_crashes,
  dui_fatalities,
  pop_18_plus,
  fatalities_per_100k_adults,
  -- Within-state percentile for the same year. Counties with NULL
  -- per-100k get NULL percentile so callers cannot accidentally rank
  -- them. Window partitions by (state, year) so ranks are bounded
  -- inside the comparable cohort.
  CASE
    WHEN fatalities_per_100k_adults IS NOT NULL THEN
      ROUND(
        (PERCENT_RANK() OVER (
          PARTITION BY state_fips, year
          ORDER BY fatalities_per_100k_adults
        ))::numeric * 100,
        1
      )
    ELSE NULL
  END AS state_year_percentile
FROM joined;

-- Unique index supports REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS fars_county_dui_stats_pk
  ON public.fars_county_dui_stats (state_fips, county_fips, year);

-- Lookup index for the helper (single county across years).
CREATE INDEX IF NOT EXISTS fars_county_dui_stats_county_year_idx
  ON public.fars_county_dui_stats (state_fips, county_fips, year DESC);

-- Lookup index for state-year leaderboards (used by quartile context).
CREATE INDEX IF NOT EXISTS fars_county_dui_stats_state_year_idx
  ON public.fars_county_dui_stats (state_fips, year, fatalities_per_100k_adults DESC NULLS LAST);

COMMENT ON MATERIALIZED VIEW public.fars_county_dui_stats IS
  'Per-county / per-year DUI fatality stats from NHTSA FARS, with ACS pop_18_plus denominator. Powers Case Decoder county paragraph + DUI Playbook county sidebar (TICKET-11). Denominator = driving-age adults (NOT licensed drivers — county-level licensed-driver counts are not in the schema). Refresh annually after FARS release: REFRESH MATERIALIZED VIEW CONCURRENTLY public.fars_county_dui_stats. Source: 20260503a_fars_county_dui_stats.sql.';
