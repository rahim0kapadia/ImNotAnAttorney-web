-- CourtListener Docket-Entries Cache — JIT report-fetch dedupe
--
-- Existing pipeline: ImNotAnAttorney-engine docket-fetch worker calls
-- CourtListener v4 /docket-entries/?docket=<cl_docket_id> for every
-- federal case during report generation, then writes to
-- public.docket_entries keyed on case_id. Two of our customers on the
-- same federal docket (co-defendants, federal multi-defendant cases)
-- each fetch the same docket from CL — duplicate API hits, slower
-- report delivery.
--
-- This cache adds a shared layer keyed on the CourtListener docket id.
-- The fetcher checks this cache first; on hit (within freshness window)
-- it serves cached entries; on miss it fetches CL with pagination,
-- upserts here, and continues the existing per-case write to
-- docket_entries. The per-case table stays unchanged.

CREATE TABLE IF NOT EXISTS cl_docket_entries (
  cl_docket_id      bigint      NOT NULL,
  cl_entry_id       bigint      NOT NULL,
  entry_number      integer,
  date_filed        date,
  description       text,
  short_description text,
  recap_sequence    text,
  pacer_sequence    text,
  raw_json          jsonb       NOT NULL,
  ingested_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cl_docket_id, cl_entry_id)
);

-- Hot path query: "give me everything for this docket, newest first."
CREATE INDEX IF NOT EXISTS cl_docket_entries_by_docket_idx
  ON cl_docket_entries (cl_docket_id, date_filed DESC);

-- Freshness scan: "which dockets have I refreshed in the last N days?"
CREATE INDEX IF NOT EXISTS cl_docket_entries_ingested_idx
  ON cl_docket_entries (cl_docket_id, ingested_at DESC);

-- RLS — service-role only (matches Tier 9 + sec_litigation_releases pattern).
ALTER TABLE cl_docket_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cl_docket_entries_service_all ON cl_docket_entries;
CREATE POLICY cl_docket_entries_service_all ON cl_docket_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE cl_docket_entries IS
  'CourtListener v4 /docket-entries/ cache, keyed on (cl_docket_id, cl_entry_id). Read-through cache used by ImNotAnAttorney-engine docket-fetcher.mjs to dedupe per-case fetches. The per-case projection still lands in public.docket_entries (case_id-keyed) for report consumption.';
COMMENT ON COLUMN cl_docket_entries.raw_json IS
  'Full CourtListener entry JSON. Preserved so future analysis can mine fields the parser does not currently extract (e.g., recap_documents array for full-text PDFs).';
