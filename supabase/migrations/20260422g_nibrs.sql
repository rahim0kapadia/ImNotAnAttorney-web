-- FBI NIBRS (National Incident-Based Reporting System) ingest table
--
-- Incident-level crime reports from state/local/federal agencies that report
-- to the FBI via NIBRS. Superseded Summary Reporting System (SRS/UCR) in 2021
-- as the FBI's primary crime-data input. ~10M incidents/year at full coverage.
--
-- Source:   https://www.openicpsr.org/openicpsr/project/118281
--           (Kaplan concatenated 1991-2024, CC-BY, ~5GB gzipped CSV)
-- Cadence:  annual (~6-month lag; Kaplan re-concatenates when FBI releases)
-- License:  CC-BY (cite Kaplan, Jacob — Uniform Crime Reporting Program Data:
--           NIBRS)
-- Loader:   scripts/ingest/ingest-nibrs-kaplan.mjs  (per-year, COPY FROM STDIN)
-- Handoff:  docs/handoff/2026-04-22-icpsr-openicpsr-registration.md
--
-- Access:   REQUIRES free openICPSR account — different portal than ICPSR,
--           separate registration. Cannot be automated. Rahim must register
--           + download project archive before loader runs.
--
-- Why Kaplan instead of raw FBI files: FBI ships NIBRS as per-state, per-year
-- fixed-width segment files (Admin / Offense / Victim / Offender / Arrestee /
-- Property) keyed on internal IDs. Kaplan flattens into incident-level CSV
-- with offense arrays, victim counts, etc. — ~50× less ingest work, one
-- maintained schema across 1991-2024.
--
-- Use cases (INAA):
--   - County-level crime base rates for Case Decoder ($197) and Intelligence
--     Brief ($997): "Assaults in [county] declined X% 2019→2024" — crisis
--     buyers searching at 2AM get grounded context, not invented averages.
--   - Arrest-to-clearance lag distributions for DUI / drug / assault playbooks
--     — feeds the "what to expect next" timeline in playbook PDFs.
--   - Similar Cases Analyzer ($297): local-offense density as a bucketing
--     signal alongside federal USSC data.
--
-- Schema notes:
--   - incident_id = FBI-assigned incident number, unique only within data_year
--     + ORI. We key on (data_year, incident_id) and index (data_year, ori) +
--     (incident_date DESC).
--   - offense_codes TEXT[] — one incident can have multiple offense classes
--     (e.g. burglary + assault). GIN index on the array powers fast "any
--     incidents with offense X in county Y 2020-2024" queries.
--   - raw JSONB optional (NULL when loader strips to save disk). Preserves
--     full Kaplan row when enabled for future column-projection needs.

CREATE TABLE IF NOT EXISTS public.nibrs_incidents (
  id BIGSERIAL PRIMARY KEY,
  data_year SMALLINT NOT NULL,               -- NIBRS data year (1991-present)
  incident_id TEXT NOT NULL,                 -- FBI incident number (unique within year)
  ori TEXT NOT NULL,                         -- Originating Agency Identifier (agency code)
  incident_date DATE,
  incident_hour SMALLINT,                    -- 0-23 (NULL when unknown)
  offense_codes TEXT[] NOT NULL,             -- NIBRS offense codes (one incident → many)
  offense_attempted BOOLEAN,                 -- TRUE = attempted, FALSE = completed
  location_type SMALLINT,                    -- NIBRS location-type code
  weapon_codes TEXT[],                       -- NIBRS weapon-type codes (can be empty)
  victim_count SMALLINT,
  offender_count SMALLINT,
  arrestee_count SMALLINT,
  victim_types TEXT[],                       -- L (law enforcement) / I (individual) / etc.
  cleared BOOLEAN,                           -- any clearance flag set
  cleared_exceptionally_code CHAR(1),        -- A-F exceptional-clearance code, NULL if not
  raw JSONB,                                 -- optional full-row preservation
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (data_year, incident_id)
);

CREATE INDEX IF NOT EXISTS idx_nibrs_incidents_year_ori
  ON public.nibrs_incidents (data_year, ori);

CREATE INDEX IF NOT EXISTS idx_nibrs_incidents_date
  ON public.nibrs_incidents (incident_date DESC);

CREATE INDEX IF NOT EXISTS idx_nibrs_incidents_offense_codes
  ON public.nibrs_incidents USING gin(offense_codes);

COMMENT ON TABLE public.nibrs_incidents IS
  'FBI NIBRS incident-level crime reports (Kaplan 1991-2024 concatenated). '
  'Source: https://www.openicpsr.org/openicpsr/project/118281. '
  'Cadence: annual with ~6-month lag. License: CC-BY (Kaplan). '
  'Registration required (free openICPSR account — separate from ICPSR). '
  'Loader: scripts/ingest/ingest-nibrs-kaplan.mjs.';
