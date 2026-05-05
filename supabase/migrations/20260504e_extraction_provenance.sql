-- 20260504e_extraction_provenance.sql
-- Adds entity-extraction columns to classified_opinions and provenance columns
-- to entities_officers. All ADD COLUMN IF NOT EXISTS for idempotent re-apply.
--
-- Powers Tasks 27-30 (opinion-entity extractor + NRE officer extractor).
-- After Task 29 ships, mv_judge_officer_motion_rates v2 can JOIN on officer_names.

-- (A) Extraction columns on classified_opinions.
-- Source: cl_opinion_bodies.plain_text via Task 27 bulk-extract-opinion-entities.mjs
-- Provenance: entity_extractor_version + entities_extracted_at carry the audit trail.
ALTER TABLE public.classified_opinions
  ADD COLUMN IF NOT EXISTS officer_names              text[],
  ADD COLUMN IF NOT EXISTS witness_names              text[],
  ADD COLUMN IF NOT EXISTS expert_witness_names       text[],
  ADD COLUMN IF NOT EXISTS prosecutor_names           text[],
  ADD COLUMN IF NOT EXISTS defense_attorney_names     text[],
  ADD COLUMN IF NOT EXISTS sentence_months_extracted  int[],
  ADD COLUMN IF NOT EXISTS fine_dollars_extracted     bigint[],
  ADD COLUMN IF NOT EXISTS restitution_dollars_extracted bigint[],
  ADD COLUMN IF NOT EXISTS entity_extractor_version   text,
  ADD COLUMN IF NOT EXISTS entities_extracted_at      timestamptz;

-- GIN index for officer-name lookups (matview JOIN substrate for J3 v2).
CREATE INDEX IF NOT EXISTS idx_classified_opinions_officer_names
  ON public.classified_opinions USING gin (officer_names)
  WHERE officer_names IS NOT NULL;

-- GIN index for prosecutor/defense lookup paths (future SKUs).
CREATE INDEX IF NOT EXISTS idx_classified_opinions_prosecutor_names
  ON public.classified_opinions USING gin (prosecutor_names)
  WHERE prosecutor_names IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_classified_opinions_defense_attorney_names
  ON public.classified_opinions USING gin (defense_attorney_names)
  WHERE defense_attorney_names IS NOT NULL;

-- Btree on extractor_version for delta-refresh queries (find unprocessed rows).
CREATE INDEX IF NOT EXISTS idx_classified_opinions_extractor_version
  ON public.classified_opinions (entity_extractor_version)
  WHERE entity_extractor_version IS NOT NULL;

COMMENT ON COLUMN public.classified_opinions.officer_names IS
  'Extracted from cl_opinion_bodies.plain_text by scripts/bulk-extract-opinion-entities.mjs. Patterns: Officer/Detective/Sergeant/Lieutenant/Trooper + Title-Case name. Provenance: entity_extractor_version column.';

COMMENT ON COLUMN public.classified_opinions.witness_names IS
  'Extracted from cl_opinion_bodies.plain_text. Patterns: "X testified" / "witness X". Excludes officers (separate column). Provenance: entity_extractor_version.';

COMMENT ON COLUMN public.classified_opinions.expert_witness_names IS
  'Extracted from cl_opinion_bodies.plain_text. Patterns: "Dr. X" / "expert witness X" / "X, an expert". Provenance: entity_extractor_version.';

COMMENT ON COLUMN public.classified_opinions.prosecutor_names IS
  'Extracted from cl_opinion_bodies.plain_text. Patterns: "ADA X" / "Assistant District Attorney X" / "prosecutor X" / "the State''s attorney X". Provenance: entity_extractor_version.';

COMMENT ON COLUMN public.classified_opinions.defense_attorney_names IS
  'Extracted from cl_opinion_bodies.plain_text. Patterns: "defense counsel X" / "defense attorney X". Provenance: entity_extractor_version.';

COMMENT ON COLUMN public.classified_opinions.sentence_months_extracted IS
  'Sentence lengths in months extracted from opinion text. Patterns: "sentenced to N months" / "N-month sentence" / "N year[s] sentence" (years*12).';

COMMENT ON COLUMN public.classified_opinions.fine_dollars_extracted IS
  'Fine amounts extracted from opinion text. Patterns: "fine of $N" / "$N fine". Stored as bigint dollars.';

COMMENT ON COLUMN public.classified_opinions.restitution_dollars_extracted IS
  'Restitution amounts extracted from opinion text. Patterns: "restitution of $N" / "ordered to pay $N restitution".';

COMMENT ON COLUMN public.classified_opinions.entity_extractor_version IS
  'Version tag of the extractor that populated this row. Format: <source-table>.<field>@v<N>@<YYYY-MM-DD>. Example: cl_opinion_bodies.plain_text@v1@2026-05-04.';

COMMENT ON COLUMN public.classified_opinions.entities_extracted_at IS
  'Timestamp when entity extraction last ran for this row. Used by delta-refresh logic.';

-- (B) Provenance columns on entities_officers.
-- Each row tracks which source produced it: cpd_officers, nypd_officers,
-- officer_external_intel, exonerations.case_summary.
ALTER TABLE public.entities_officers
  ADD COLUMN IF NOT EXISTS provenance_source        text,
  ADD COLUMN IF NOT EXISTS provenance_record_id     text,
  ADD COLUMN IF NOT EXISTS provenance_extracted_at  timestamptz;

CREATE INDEX IF NOT EXISTS idx_entities_officers_provenance
  ON public.entities_officers (provenance_source)
  WHERE provenance_source IS NOT NULL;

COMMENT ON COLUMN public.entities_officers.provenance_source IS
  'Source table or pipeline that produced this row. Values: cpd_officers, nypd_officers, officer_external_intel, exonerations (case_summary text-mined).';

COMMENT ON COLUMN public.entities_officers.provenance_record_id IS
  'Source record id (as text). For cpd_officers/nypd_officers/exonerations: source row id::text. For officer_external_intel: officer_external_intel.id::text.';

COMMENT ON COLUMN public.entities_officers.provenance_extracted_at IS
  'Timestamp when this row was inserted from its provenance source.';
