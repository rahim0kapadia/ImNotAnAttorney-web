-- SEC Litigation Releases — P1 #11
-- Plan: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-23-free-data-sources-full-load.md
--
-- Enforcement actions the SEC has filed in federal court. Powers War Room
-- (white-collar) and IB ($997 federal charging-pattern context) —
-- defendants and counsel can look up prior SEC actions against the same
-- person/entity or similar conduct.
--
-- Source: https://www.sec.gov/enforcement-litigation/litigation-releases
-- (paginated HTML, ~110 pages × 100 entries = ~11,000 releases LR-16000
-- through current).

CREATE TABLE IF NOT EXISTS sec_litigation_releases (
  lr_number        integer     PRIMARY KEY,                 -- e.g. 26537 from "LR-26537"
  title            text        NOT NULL,                    -- respondent name(s) as shown in the index
  release_date     date        NOT NULL,
  release_ts       timestamptz NOT NULL,                    -- full publish timestamp from <time datetime=...>
  url              text        NOT NULL,                    -- canonical SEC URL
  see_also         jsonb,                                   -- optional related PDFs ("Final Judgment", "Complaint", etc.)
  ingested_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sec_lr_number_positive CHECK (lr_number > 0)
);

CREATE INDEX IF NOT EXISTS sec_litreleases_date_idx
  ON sec_litigation_releases (release_date DESC);

-- GIN on title lowercased — defendant-name lookup across 11K rows.
CREATE INDEX IF NOT EXISTS sec_litreleases_title_trgm_idx
  ON sec_litigation_releases USING GIN (title gin_trgm_ops);

-- pg_trgm extension — safe IF NOT EXISTS (matches convention in other migrations).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- RLS — public-domain reference data, service-role only (matches Tier 9 pattern).
ALTER TABLE sec_litigation_releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sec_litreleases_service_all ON sec_litigation_releases;
CREATE POLICY sec_litreleases_service_all ON sec_litigation_releases
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE sec_litigation_releases IS
  'SEC enforcement Litigation Releases — scraped from www.sec.gov. Populated by scripts/ingest/scrape-sec-litreleases.mjs; refreshed daily by /api/cron/sec-litreleases-sync. UA required on every fetch.';
COMMENT ON COLUMN sec_litigation_releases.title IS
  'Respondent name(s) as shown in the SEC index table. May be a single person, an entity, or a long chain of co-defendants and relief defendants.';
COMMENT ON COLUMN sec_litigation_releases.see_also IS
  'Ordered array of {label, url} objects for related PDFs the SEC links next to the release entry ("Final Judgment", "Complaint", etc.). NULL when the release has no linked PDFs.';
