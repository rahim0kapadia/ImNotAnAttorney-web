-- NHTSA FARS (Fatality Analysis Reporting System) ingest tables
--
-- Three-table schema for the annual NHTSA FARS bulk drops (1975-present,
-- ~40K fatalities/year). FARS ST_CASE is unique only within (year, state_code)
-- so every table keys on the composite (year, state_code, st_case). Persons
-- and vehicles FK back to crashes for referential integrity + easy joins.
--
-- Source:   https://www.nhtsa.gov/file-downloads (FARS NationalCSV ZIPs)
-- Cadence:  annual (usually released ~18 months after year-end)
-- License:  public domain (US government work)
-- Loader:   scripts/ingest/ingest-fars.mjs  (per-year, COPY FROM STDIN)
--
-- Use cases (INAA):
--   - DUI $97 playbook / $197 Case Decoder context: alcohol_test_result
--     base-rate distributions per state/year so "average DUI defendant BAC"
--     comparisons are grounded, not invented.
--   - Crash-context signals for DUI/vehicular-homicide report tiers (X-Ray,
--     War Room): light condition, weather, drunk_drivers flag.
--   - Federal sentencing distribution cross-signal: fatal-crash density by
--     state/year feeds the "Similar Cases Analyzer" $297 product for
--     vehicular-offense buckets.
--
-- Code dictionaries (state/injury/body type/weather/etc.) are left as raw
-- SMALLINT codes per FARS convention; lookup tables can be added later
-- alongside the existing USSC district pattern if product demand warrants.

-- ── fars_crashes ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fars_crashes (
  year SMALLINT NOT NULL,
  state_code SMALLINT NOT NULL,             -- FIPS state code (FARS STATE column)
  st_case INT NOT NULL,                     -- FARS ST_CASE (unique within year+state)
  state_name TEXT,
  county_code SMALLINT,
  city_code INT,
  month SMALLINT,
  day SMALLINT,
  day_of_week SMALLINT,
  hour SMALLINT,
  minute SMALLINT,
  fatalities SMALLINT NOT NULL,             -- FARS FATALS
  persons_involved SMALLINT,                -- FARS PERSONS
  vehicles_involved SMALLINT,               -- FARS VE_TOTAL
  road_function_class SMALLINT,             -- FARS FUNC_SYS
  weather_code SMALLINT,                    -- FARS WEATHER (1-digit legacy; WEATHER1 newer years)
  light_condition SMALLINT,                 -- FARS LGT_COND
  drunk_drivers SMALLINT,                   -- FARS DRUNK_DR
  raw JSONB,                                -- full row preserved for year-to-year column drift
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (year, state_code, st_case)
);

CREATE INDEX IF NOT EXISTS idx_fars_crashes_year
  ON public.fars_crashes (year);
CREATE INDEX IF NOT EXISTS idx_fars_crashes_state_year
  ON public.fars_crashes (state_code, year);

COMMENT ON TABLE public.fars_crashes IS
  'NHTSA FARS crash-level records — one row per fatal crash (1975-present, ~40K/year). Composite key (year, state_code, st_case) because FARS ST_CASE is reused across states. Source: https://www.nhtsa.gov/file-downloads. Loader: scripts/ingest/ingest-fars.mjs (annual). INAA use: DUI base-rate context (alcohol_test_result distributions via fars_persons), vehicular-offense sentencing signals for $997/$2,497/$297 products.';

-- ── fars_persons ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fars_persons (
  person_key BIGSERIAL PRIMARY KEY,
  year SMALLINT NOT NULL,
  state_code SMALLINT NOT NULL,
  st_case INT NOT NULL,
  person_type SMALLINT,                     -- FARS PER_TYP (driver, passenger, pedestrian...)
  age SMALLINT,                             -- FARS AGE (998/999 = unknown in source; kept raw)
  sex SMALLINT,                             -- FARS SEX
  race SMALLINT,                            -- FARS RACE
  injury_severity SMALLINT,                 -- FARS INJ_SEV (0-4, 9)
  alcohol_test_result REAL,                 -- FARS ALC_RES (0.00-0.99 BAC); 0.995+ = unknown codes
  alcohol_test_type SMALLINT,               -- FARS ATST_TYP
  drug_test_results SMALLINT,               -- FARS DRUGRES1 (first panel result)
  drunk_driver BOOLEAN,                     -- derived: alcohol_test_result >= 0.08 when valid
  raw JSONB,
  FOREIGN KEY (year, state_code, st_case)
    REFERENCES public.fars_crashes (year, state_code, st_case) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fars_persons_alcohol
  ON public.fars_persons (alcohol_test_result)
  WHERE alcohol_test_result IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fars_persons_case
  ON public.fars_persons (year, state_code, st_case);

COMMENT ON TABLE public.fars_persons IS
  'NHTSA FARS person-level records — one row per person involved in a fatal crash (driver/passenger/pedestrian). Links to fars_crashes via (year, state_code, st_case). alcohol_test_result (BAC 0.00-0.99) is the load-bearing column for INAA DUI base-rate analysis — powers "how does my BAC compare to fatal-crash median" messaging in the $97 DUI Playbook + $197 Case Decoder. Source: https://www.nhtsa.gov/file-downloads. Loader: scripts/ingest/ingest-fars.mjs.';

-- ── fars_vehicles ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fars_vehicles (
  vehicle_key BIGSERIAL PRIMARY KEY,
  year SMALLINT NOT NULL,
  state_code SMALLINT NOT NULL,
  st_case INT NOT NULL,
  vehicle_number SMALLINT,                  -- FARS VEH_NO
  body_type SMALLINT,                       -- FARS BODY_TYP
  model_year SMALLINT,                      -- FARS MOD_YEAR
  driver_presence SMALLINT,                 -- FARS DR_PRES
  speeding_related SMALLINT,                -- FARS SPEEDREL
  hit_and_run SMALLINT,                     -- FARS HIT_RUN
  raw JSONB,
  FOREIGN KEY (year, state_code, st_case)
    REFERENCES public.fars_crashes (year, state_code, st_case) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fars_vehicles_case
  ON public.fars_vehicles (year, state_code, st_case);

COMMENT ON TABLE public.fars_vehicles IS
  'NHTSA FARS vehicle-level records — one row per vehicle in a fatal crash. Links to fars_crashes via (year, state_code, st_case). Fields like speeding_related, hit_and_run, body_type feed vehicular-offense signal columns in the $2,497 X-Ray + $4,997 War Room similar-case buckets. Source: https://www.nhtsa.gov/file-downloads. Loader: scripts/ingest/ingest-fars.mjs.';
