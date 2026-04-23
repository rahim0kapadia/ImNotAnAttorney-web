-- 20260422d_police_stops.sql
--
-- Stanford Open Policing Project (OPP) — ingested traffic stops.
-- License: Open Data Commons Attribution (ODC-By 1.0)
-- Source index: https://openpolicing.stanford.edu/data/
-- Bulk CSVs: https://stacks.stanford.edu/file/druid:<id>/<id>_<state>_<city>_<date>.csv.zip
--
-- Schema: normalized across 21 state patrols + 29 municipal PDs (~200M stops total).
-- Columns mirror OPP's standardized schema (subject_race/sex/age, search, contraband,
-- outcome) so downstream analytics work uniformly across agencies.
--
-- Powers: officer pattern analysis ($97 Officer Background Check), search-rate
-- disparity surfacing, agency-level discrimination pattern detection for IB/X-Ray.

-- ── Main table ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.police_stops (
  id                 BIGSERIAL PRIMARY KEY,
  agency             TEXT NOT NULL,                 -- e.g., tx_statewide, ca_san_francisco
  state_code         CHAR(2) NOT NULL,
  city               TEXT,                          -- NULL for statewide datasets
  stop_date          DATE,
  stop_time          TIME,
  subject_race       TEXT,
  subject_sex        CHAR(1),
  subject_age        SMALLINT,
  officer_id         TEXT,
  officer_race       TEXT,
  officer_sex        CHAR(1),
  stop_type          TEXT,                          -- vehicular / pedestrian
  violation          TEXT,
  arrest_made        BOOLEAN,
  citation_issued    BOOLEAN,
  warning_issued     BOOLEAN,
  outcome            TEXT,
  search_conducted   BOOLEAN,
  search_person      BOOLEAN,
  search_vehicle     BOOLEAN,
  contraband_found   BOOLEAN,
  contraband_drugs   BOOLEAN,
  contraband_weapons BOOLEAN,
  frisk_performed    BOOLEAN,
  reason_for_stop    TEXT,
  reason_for_search  TEXT,
  location_lat       DOUBLE PRECISION,
  location_lng       DOUBLE PRECISION,
  district           TEXT,
  county_name        TEXT,
  source_druid       TEXT NOT NULL,                 -- e.g., yg821jf8611
  ingested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.police_stops IS
  'Stanford Open Policing Project (https://openpolicing.stanford.edu/data/). '
  'License: Open Data Commons Attribution (ODC-By 1.0). Source CSVs live under '
  'https://stacks.stanford.edu/file/druid:<source_druid>/. Ingested via '
  'scripts/ingest/ingest-openpolicing.mjs (one agency per invocation, COPY FROM STDIN). '
  'Standardized schema across 21 state patrols + 29 municipal PDs (~200M stops).';

-- ── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_police_stops_agency_date
  ON public.police_stops (agency, stop_date DESC);

CREATE INDEX IF NOT EXISTS idx_police_stops_officer
  ON public.police_stops (officer_id)
  WHERE officer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_police_stops_race
  ON public.police_stops (state_code, subject_race);

CREATE INDEX IF NOT EXISTS idx_police_stops_search
  ON public.police_stops (agency)
  WHERE search_conducted = TRUE;

-- ── Officer Pattern Matview ────────────────────────────────────────────────
-- Powers $97 Officer Background Check + X-Ray officer-level analysis.
-- Per (agency, officer_id): total volume, race breakdowns, search/hit/arrest
-- rates both overall and by race. NULL officer_id excluded (aggregate-only).

CREATE MATERIALIZED VIEW IF NOT EXISTS public.officer_stop_patterns
WITH (fillfactor = 90) AS
WITH base AS (
  SELECT
    agency,
    officer_id,
    subject_race,
    search_conducted,
    contraband_found,
    arrest_made,
    stop_date
  FROM public.police_stops
  WHERE officer_id IS NOT NULL
),
by_officer AS (
  SELECT
    agency,
    officer_id,
    COUNT(*)::BIGINT                                                  AS total_stops,
    MIN(stop_date)                                                    AS first_stop,
    MAX(stop_date)                                                    AS last_stop,
    AVG(CASE WHEN search_conducted THEN 1 ELSE 0 END)::NUMERIC(6,4)   AS search_rate,
    AVG(CASE
          WHEN search_conducted AND contraband_found THEN 1
          WHEN search_conducted THEN 0
          ELSE NULL END)::NUMERIC(6,4)                                AS contraband_hit_rate
  FROM base
  GROUP BY agency, officer_id
),
stops_by_race AS (
  SELECT
    agency,
    officer_id,
    jsonb_object_agg(
      COALESCE(subject_race, 'unknown'),
      cnt
    ) AS stops_by_race
  FROM (
    SELECT agency, officer_id, subject_race, COUNT(*)::BIGINT AS cnt
    FROM base
    GROUP BY agency, officer_id, subject_race
  ) s
  GROUP BY agency, officer_id
),
search_rate_by_race AS (
  SELECT
    agency,
    officer_id,
    jsonb_object_agg(
      COALESCE(subject_race, 'unknown'),
      rate
    ) AS search_rate_by_race
  FROM (
    SELECT
      agency, officer_id, subject_race,
      AVG(CASE WHEN search_conducted THEN 1 ELSE 0 END)::NUMERIC(6,4) AS rate
    FROM base
    GROUP BY agency, officer_id, subject_race
  ) s
  GROUP BY agency, officer_id
),
hit_rate_by_race AS (
  SELECT
    agency,
    officer_id,
    jsonb_object_agg(
      COALESCE(subject_race, 'unknown'),
      rate
    ) AS contraband_hit_rate_by_race
  FROM (
    SELECT
      agency, officer_id, subject_race,
      AVG(CASE
            WHEN search_conducted AND contraband_found THEN 1
            WHEN search_conducted THEN 0
            ELSE NULL END)::NUMERIC(6,4) AS rate
    FROM base
    WHERE search_conducted IS TRUE
    GROUP BY agency, officer_id, subject_race
  ) s
  GROUP BY agency, officer_id
),
arrest_rate_by_race AS (
  SELECT
    agency,
    officer_id,
    jsonb_object_agg(
      COALESCE(subject_race, 'unknown'),
      rate
    ) AS arrest_rate_by_race
  FROM (
    SELECT
      agency, officer_id, subject_race,
      AVG(CASE WHEN arrest_made THEN 1 ELSE 0 END)::NUMERIC(6,4) AS rate
    FROM base
    GROUP BY agency, officer_id, subject_race
  ) s
  GROUP BY agency, officer_id
)
SELECT
  o.agency,
  o.officer_id,
  o.total_stops,
  sbr.stops_by_race,
  o.search_rate,
  srbr.search_rate_by_race,
  o.contraband_hit_rate,
  hrbr.contraband_hit_rate_by_race,
  arbr.arrest_rate_by_race,
  daterange(o.first_stop, o.last_stop, '[]') AS date_range
FROM by_officer o
LEFT JOIN stops_by_race         sbr  USING (agency, officer_id)
LEFT JOIN search_rate_by_race   srbr USING (agency, officer_id)
LEFT JOIN hit_rate_by_race      hrbr USING (agency, officer_id)
LEFT JOIN arrest_rate_by_race   arbr USING (agency, officer_id);

-- Unique index required for REFRESH ... CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS uq_officer_stop_patterns_agency_officer
  ON public.officer_stop_patterns (agency, officer_id);

CREATE INDEX IF NOT EXISTS idx_officer_stop_patterns_agency
  ON public.officer_stop_patterns (agency);

COMMENT ON MATERIALIZED VIEW public.officer_stop_patterns IS
  'Per-officer aggregates over police_stops (Stanford OPP). '
  'Powers $97 Officer Background Check + IB/X-Ray officer profiles. '
  'Refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY public.officer_stop_patterns; '
  'Rebuild nightly after any agency re-ingest.';
