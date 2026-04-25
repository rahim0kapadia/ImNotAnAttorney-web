-- 20260424e_ao_criminal_by_offense_district.sql
--
-- Administrative Office of the U.S. Courts (AO) — Federal Court Management
-- Statistics Table D-3: Criminal Defendants Commenced (Excluding Transfers),
-- by Offense and District. Annual Dec-31 snapshot across all 94 US federal
-- district courts + 4 territories (DC, PR, VI, GU, NMI).
--
-- Source: https://www.uscourts.gov/sites/default/files/document/stfj_d3_<MMDD>.<YYYY>.xlsx
-- Publisher: Administrative Office of the U.S. Courts, Statistical Tables for
-- the Federal Judiciary (STFJ). Public domain federal research.
--
-- Long-format: one row per (district, period_end, offense_category). Sum of
-- offense_category counts within a (district, period_end) = district_total.
-- Powers IB $997 "your district workload" + "offense-mix in your district".

CREATE TABLE IF NOT EXISTS public.ao_district_criminal_by_offense (
  id                    BIGSERIAL   PRIMARY KEY,
  district_code         TEXT        NOT NULL,        -- 'DC','CA,N','PA,E','PR','VI','GU','NMI', etc.
  state_code            CHAR(2),                      -- 'CA','PA','DC','PR','VI','GU','MP' (NMI → MP)
  division              TEXT,                         -- 'N','E','S','W','C','M' or NULL for single-district states
  circuit               SMALLINT,                     -- 1..11, DC=12, Federal=13 (DC circuit = 12 per AO standard)
  period_end            DATE        NOT NULL,         -- 12-month period ending, e.g. 2025-12-31
  offense_category      TEXT        NOT NULL,         -- 'homicide','robbery','assault','other_violent', etc.
  defendant_count       INT,
  source_url            TEXT        NOT NULL,
  ingested_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (district_code, period_end, offense_category)
);

CREATE INDEX IF NOT EXISTS ao_district_crim_state_idx
  ON public.ao_district_criminal_by_offense (state_code, period_end);

CREATE INDEX IF NOT EXISTS ao_district_crim_offense_idx
  ON public.ao_district_criminal_by_offense (offense_category, period_end);

COMMENT ON TABLE public.ao_district_criminal_by_offense
  IS 'AO Table D-3 — federal criminal defendants commenced by offense and district, long-format. Source: uscourts.gov STFJ. One row per (district, 12-month period, offense category).';
