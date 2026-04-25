-- entities_statutes — additive columns for the FL seed pipeline.
--
-- Baseline shape was created out-of-band. Live schema (verified 2026-04-24
-- via scripts/ingest/_inspect-entities-statutes.mjs on jxjbjmgdukwkoclydqdr):
--   canonical_id    UUID PRIMARY KEY DEFAULT gen_random_uuid()
--   jurisdiction    TEXT NOT NULL
--   title           TEXT
--   section         TEXT NOT NULL
--   subsection      TEXT
--   effective_date  DATE
--   section_text    TEXT
--   is_current      BOOLEAN DEFAULT true
--   created_at      TIMESTAMPTZ DEFAULT now()
--   updated_at      TIMESTAMPTZ DEFAULT now()
--   wikidata_qid    TEXT
--
-- Existing indexes:
--   entities_statutes_pkey               ON (canonical_id)
--   uq_entities_statutes_coords          UNIQUE ON (jurisdiction, title, section, subsection, effective_date)
--   idx_entities_statutes_lookup         ON (jurisdiction, title, section)
--   entities_statutes_wikidata_qid_uidx  UNIQUE ON (wikidata_qid) WHERE wikidata_qid IS NOT NULL
--
-- This migration is ADDITIVE ONLY. It adds three columns required by the FL
-- seed (docs/plans/2026-04-23-state-statutes-scaling.md + openstates-team
-- expert framework): source_urls, text_hash, scraped_at. No CREATE TABLE
-- (baseline exists); no column retype (would corrupt 2,241 live US rows).
--
-- Idempotent: each ADD COLUMN uses IF NOT EXISTS so replays are safe.

ALTER TABLE entities_statutes
  ADD COLUMN IF NOT EXISTS source_urls TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE entities_statutes
  ADD COLUMN IF NOT EXISTS text_hash TEXT;

ALTER TABLE entities_statutes
  ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMPTZ;

COMMENT ON COLUMN entities_statutes.source_urls IS
  'Verification URLs (primary at [0], fallbacks at [1..N]). Non-empty required for any row claiming verification (no-hallucinated-legal-data rule). Empty array = seed-only, do not cite.';

COMMENT ON COLUMN entities_statutes.text_hash IS
  'SHA-256 of section_text. Used by weekly refresh to detect amendments without re-storing identical text.';

COMMENT ON COLUMN entities_statutes.scraped_at IS
  'Last time a scraper fetched and wrote this row. Drives refresh cadence.';
