-- NIST Forensic Validation Studies — P1 #6
-- Plan: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-23-free-data-sources-full-load.md
--
-- Public-domain NIST research on forensic-method reliability + error rates.
-- Powers X-Ray $2,497 "Challenge the Forensics" appendix: every method the
-- prosecution will likely use, paired with published error rates + documented
-- limitations defendants can take to their attorney.
--
-- Source: https://www.nist.gov/forensic-science (hub) + per-method program
-- pages + NIST publications (Interagency Reports, journal papers).

CREATE TABLE IF NOT EXISTS nist_forensic_methods (
  method_slug     text        PRIMARY KEY,
  display_name    text        NOT NULL,
  category        text        NOT NULL
                  CHECK (category IN (
                    'pattern_identification',
                    'impression_evidence',
                    'biological',
                    'chemical',
                    'digital',
                    'physical_comparison'
                  )),
  description     text        NOT NULL,
  source_url      text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nist_forensic_studies (
  id                bigserial   PRIMARY KEY,
  method_slug       text        NOT NULL REFERENCES nist_forensic_methods(method_slug)
                                ON UPDATE CASCADE ON DELETE RESTRICT,
  title             text        NOT NULL,
  authors           text,
  year              smallint,
  publication_url   text        NOT NULL,
  error_rate_pct    numeric(6,3),
  error_rate_desc   text        NOT NULL,
  sample_size       integer,
  peer_reviewed     boolean     NOT NULL DEFAULT false,
  defense_angle     text        NOT NULL,
  source_url        text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (method_slug, publication_url)
);

CREATE INDEX IF NOT EXISTS nist_forensic_studies_method_idx
  ON nist_forensic_studies (method_slug, year DESC);

CREATE INDEX IF NOT EXISTS nist_forensic_studies_year_idx
  ON nist_forensic_studies (year DESC)
  WHERE year IS NOT NULL;

-- RLS: public-domain reference data, service-role only (consistent with Tier 9 pattern).
ALTER TABLE nist_forensic_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE nist_forensic_studies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nist_forensic_methods_service_all ON nist_forensic_methods;
CREATE POLICY nist_forensic_methods_service_all ON nist_forensic_methods
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS nist_forensic_studies_service_all ON nist_forensic_studies;
CREATE POLICY nist_forensic_studies_service_all ON nist_forensic_studies
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE nist_forensic_methods IS
  'NIST-tracked forensic disciplines. Populated by scripts/ingest/load-nist-forensic.mjs.';
COMMENT ON TABLE nist_forensic_studies IS
  'Published NIST validation studies with error-rate findings + defense angles. Every row has a publication_url that attorneys can cite.';
COMMENT ON COLUMN nist_forensic_studies.error_rate_pct IS
  'Headline numeric error rate from the study (percent, 0-100). NULL when the study reports no single numeric rate — read error_rate_desc.';
COMMENT ON COLUMN nist_forensic_studies.defense_angle IS
  'One-sentence framing: what the defendant should ask their attorney about this method in their case.';
