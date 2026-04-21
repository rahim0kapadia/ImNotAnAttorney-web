-- SCOTUS cases from walkerdb/supreme_court_transcripts (Oyez-sourced)
-- Plan: ImNotAnAttorney/docs/plans/2026-04-21-walkerdb-scotus-ingest.md
--
-- 8,415 upstream Oyez cases → 8,411 loaded (4 skipped: invalid ID / JSON
-- parse error in source). Per-turn oral-argument transcripts are deferred
-- to a follow-up ingest.
--
-- Data source: https://github.com/walkerdb/supreme_court_transcripts (Oyez API mirror, weekly refresh)

BEGIN;

CREATE TABLE IF NOT EXISTS public.scotus_cases (
  case_id                     BIGINT PRIMARY KEY,
  oyez_href                   TEXT,
  name                        TEXT,
  term                        TEXT,
  docket_number               TEXT,
  additional_docket_numbers   JSONB,
  citation_volume             TEXT,
  citation_page               TEXT,
  citation_year               TEXT,
  first_party                 TEXT,
  first_party_label           TEXT,
  second_party                TEXT,
  second_party_label          TEXT,
  facts_of_the_case           TEXT,
  question                    TEXT,
  conclusion                  TEXT,
  description                 TEXT,
  manner_of_jurisdiction      TEXT,
  location_json               JSONB,
  lower_court_json            JSONB,
  decided_by_json             JSONB,
  heard_by_json               JSONB,
  advocates_json              JSONB,
  decisions_json              JSONB,
  related_cases_json          JSONB,
  written_opinion_json        JSONB,
  opinion_announcement_json   JSONB,
  oral_argument_audio_json    JSONB,
  argument2_url               TEXT,
  justia_url                  TEXT,
  timeline_json               JSONB,
  decided_unix                BIGINT,
  decided_date                DATE,
  view_count                  INTEGER,
  loaded_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.scotus_cases IS
  'SCOTUS cases from walkerdb/supreme_court_transcripts (Oyez mirror). 8,411 loaded (from 8,415 upstream; 4 skipped for missing ID / JSON parse errors). Transcripts in a separate table (deferred).';

CREATE INDEX IF NOT EXISTS scotus_cases_term_idx
  ON public.scotus_cases (term);

CREATE INDEX IF NOT EXISTS scotus_cases_citation_year_idx
  ON public.scotus_cases (citation_year);

CREATE INDEX IF NOT EXISTS scotus_cases_decided_date_idx
  ON public.scotus_cases (decided_date);

-- FTS index over narrative fields. coalesce handles NULL (older cases
-- often lack facts/question/conclusion but always have name).
CREATE INDEX IF NOT EXISTS scotus_cases_fts_idx
  ON public.scotus_cases
  USING GIN (
    to_tsvector(
      'english',
      COALESCE(name, '') || ' ' ||
      COALESCE(first_party, '') || ' ' ||
      COALESCE(second_party, '') || ' ' ||
      COALESCE(question, '') || ' ' ||
      COALESCE(facts_of_the_case, '') || ' ' ||
      COALESCE(conclusion, '') || ' ' ||
      COALESCE(description, '')
    )
  );

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS scotus_cases_name_trgm_idx
  ON public.scotus_cases
  USING GIN (name gin_trgm_ops);

COMMIT;
