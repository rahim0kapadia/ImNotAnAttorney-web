-- BJS Federal Justice Statistics Program (FJSP) ingest tables
--
-- Three-table schema for FJSP annual files distributed via ICPSR series 73
-- (~120K federal defendants/year, FY1994-present). Covers pretrial release,
-- bond, prosecution declinations, indictment, disposition, sentence — the
-- federal-criminal layers USSC does NOT cover (USSC starts at sentencing).
-- FJSP is the ONLY public-data bridge from arrest → declination → pretrial →
-- prosecution → conviction for federal cases.
--
-- Source:   https://www.icpsr.umich.edu/web/ICPSR/series/73  (BJS FJSP)
-- Cadence:  annual (~18-month lag; e.g. FY2021 released 2023)
-- License:  public domain (US government work) — free with ICPSR account
-- Loader:   scripts/ingest/ingest-fjsp.mjs  (per-study, COPY FROM STDIN)
-- Handoff:  docs/handoff/2026-04-22-icpsr-openicpsr-registration.md
--
-- Access:   REQUIRES free ICPSR account (MyData) — cannot be automated.
--           Rahim must register + download study archives before loader runs.
--
-- Use cases (INAA):
--   - Federal pretrial base rates for $97-$9,997 playbooks: bond amount
--     distributions, detention-hearing outcomes, time-to-indictment, by
--     district + offense category. No other public-data source covers this.
--   - Declination rates per district × offense category for Case Decoder
--     ($197) and Intelligence Brief ($997): "In ND-TX, wire-fraud cases were
--     declined at X% in FY2020" — context no defense attorney has today.
--   - Conviction + sentencing distribution cross-signal feeding the Similar
--     Cases Analyzer ($297) and the X-Ray ($2,497) judge/prosecutor profiles.
--
-- Schema notes:
--   - study_id = ICPSR study number (e.g. "38492" for FY2020 FJSP). Lets a
--     single table hold multiple study years without collision — (study_id,
--     defendant_id) is unique.
--   - raw JSONB preserves the full fixed-width row for every record so new
--     columns can be projected later without re-ingesting the source .dat.
--   - Codebook varies per study year — the loader's column-offset parser is
--     driven by the per-study SAS/Stata setup file, NOT hardcoded offsets.

-- ── fjsp_defendants ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fjsp_defendants (
  id BIGSERIAL PRIMARY KEY,
  study_id TEXT NOT NULL,                    -- ICPSR study number (e.g. "38492")
  fiscal_year SMALLINT NOT NULL,             -- federal fiscal year (Oct-Sep)
  defendant_id TEXT NOT NULL,                -- FJSP defendant identifier
  district_code SMALLINT,                    -- federal district (AO/USSC code)
  offense_category TEXT,                     -- FJSP offense category (major class)
  offense_detail TEXT,                       -- FJSP sub-category / statute
  age SMALLINT,
  sex CHAR(1),                               -- M / F / U
  race TEXT,                                 -- FJSP race code mapped to label
  citizenship TEXT,                          -- US citizen / non-citizen / unknown
  raw JSONB NOT NULL,                        -- full fixed-width row, keyed by codebook name
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (study_id, defendant_id)
);

CREATE INDEX IF NOT EXISTS idx_fjsp_defendants_year_district
  ON public.fjsp_defendants (fiscal_year, district_code);

COMMENT ON TABLE public.fjsp_defendants IS
  'BJS Federal Justice Statistics Program defendant master rows. '
  'Source: https://www.icpsr.umich.edu/web/ICPSR/series/73. '
  'Cadence: annual with ~18-month lag. Registration required (free ICPSR account). '
  'Loader: scripts/ingest/ingest-fjsp.mjs.';

-- ── fjsp_pretrial ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fjsp_pretrial (
  id BIGSERIAL PRIMARY KEY,
  study_id TEXT NOT NULL,
  fiscal_year SMALLINT NOT NULL,
  defendant_id TEXT NOT NULL,
  pretrial_release_status TEXT,              -- released / detained / mixed
  bond_type TEXT,                            -- unsecured / secured / property / none
  bond_amount NUMERIC,                       -- dollars (NULL when no bond set)
  detention_hearing_outcome TEXT,            -- granted / denied / waived
  magistrate_id TEXT,                        -- FJSP magistrate identifier (when present)
  time_from_arrest_to_indictment_days SMALLINT,
  raw JSONB NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (study_id, defendant_id)
);

CREATE INDEX IF NOT EXISTS idx_fjsp_pretrial_year
  ON public.fjsp_pretrial (fiscal_year);

COMMENT ON TABLE public.fjsp_pretrial IS
  'BJS FJSP pretrial-stage rows (bond, detention, time-to-indictment). '
  'Source: https://www.icpsr.umich.edu/web/ICPSR/series/73. '
  'Cadence: annual with ~18-month lag. Registration required (free ICPSR account). '
  'Loader: scripts/ingest/ingest-fjsp.mjs.';

-- ── fjsp_prosecutions ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fjsp_prosecutions (
  id BIGSERIAL PRIMARY KEY,
  study_id TEXT NOT NULL,
  fiscal_year SMALLINT NOT NULL,
  defendant_id TEXT NOT NULL,
  declined BOOLEAN,                          -- USAO declined prosecution
  declined_reason TEXT,                      -- FJSP declination code mapped to label
  indicted BOOLEAN,
  disposition TEXT,                          -- convicted / acquitted / dismissed / other
  conviction BOOLEAN,
  sentence_months NUMERIC,                   -- total prison months (NULL if no prison)
  raw JSONB NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (study_id, defendant_id)
);

CREATE INDEX IF NOT EXISTS idx_fjsp_prosecutions_year
  ON public.fjsp_prosecutions (fiscal_year);

COMMENT ON TABLE public.fjsp_prosecutions IS
  'BJS FJSP prosecution-stage rows (declination, indictment, disposition, sentence). '
  'Source: https://www.icpsr.umich.edu/web/ICPSR/series/73. '
  'Cadence: annual with ~18-month lag. Registration required (free ICPSR account). '
  'Loader: scripts/ingest/ingest-fjsp.mjs.';
