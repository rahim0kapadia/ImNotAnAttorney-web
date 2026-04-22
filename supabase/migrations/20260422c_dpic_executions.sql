-- DPIC Executions table
-- Every US execution since 1976 from the Death Penalty Information Center
-- (DPIC) executions database. One row per execution event.
--
-- Source: http://deathpenaltyinfo.org/query/executions.csv
-- Cadence: DPIC updates the CSV on weekdays at ~12 PM ET.
-- Scope: all US executions (state + federal) from 1976-Jan-01 forward.
-- Size: ~1,600 rows as of 2026-04-22, grows ~15-25/year.
--
-- Use cases for INAA:
--   - Capital defense playbook unlock (state-by-state execution trends)
--   - Execution rate stats on per-state landing pages (pSEO)
--   - Content: historical context in blog + defender guides
--
-- Load: scripts/ingest/ingest-dpic.mjs --apply
--   - Default dry-run prints first 5 normalized rows + total count
--   - --apply streams via COPY FROM STDIN (pattern: cl-bulk-data-defensive #18)
--   - ON CONFLICT (execution_date, inmate_name, state_code) DO NOTHING

CREATE TABLE IF NOT EXISTS public.dpic_executions (
  id BIGSERIAL PRIMARY KEY,
  execution_date DATE NOT NULL,
  inmate_name TEXT NOT NULL,
  inmate_race TEXT,
  inmate_sex CHAR(1),
  inmate_age SMALLINT,
  state_code CHAR(2) NOT NULL,
  region TEXT,
  method TEXT,
  federal_flag BOOLEAN NOT NULL DEFAULT FALSE,
  foreign_national BOOLEAN,
  juvenile_at_crime BOOLEAN,
  volunteer BOOLEAN,
  victim_count SMALLINT,
  victim_races TEXT[],
  victim_sexes TEXT[],
  county TEXT,
  source_url TEXT NOT NULL DEFAULT 'http://deathpenaltyinfo.org/query/executions.csv',
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (execution_date, inmate_name, state_code)
);

CREATE INDEX IF NOT EXISTS idx_dpic_state_year ON public.dpic_executions(state_code, execution_date DESC);
CREATE INDEX IF NOT EXISTS idx_dpic_date ON public.dpic_executions(execution_date DESC);

COMMENT ON TABLE public.dpic_executions IS
  'DPIC every US execution since 1976. Source: http://deathpenaltyinfo.org/query/executions.csv. Cadence: updated weekdays 12 PM ET. Load: scripts/ingest/ingest-dpic.mjs --apply. Use: capital defense content, execution rate stats, niche playbook unlock.';
