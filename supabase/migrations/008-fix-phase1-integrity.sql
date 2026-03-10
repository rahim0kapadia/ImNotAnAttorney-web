-- Migration 008: Fix Phase 1 data integrity issues
-- Addresses gaps in 007-phase1-xray-tracking.sql that was already applied.
--
-- Fix 1: source_document_id FK should NULL out when a discovery_documents row is
--        deleted, not block deletion (Postgres defaults to RESTRICT).
-- Fix 2: Array columns should default to empty array, not null, so callers can
--        safely use array_append() without a null check.

-- ── timeline_events.source_document_id: RESTRICT → ON DELETE SET NULL ────────
ALTER TABLE timeline_events
  DROP CONSTRAINT timeline_events_source_document_id_fkey,
  ADD CONSTRAINT timeline_events_source_document_id_fkey
    FOREIGN KEY (source_document_id)
    REFERENCES discovery_documents(id)
    ON DELETE SET NULL;

-- ── timeline_events.mentioned_in_documents: default empty uuid array ──────────
ALTER TABLE timeline_events
  ALTER COLUMN mentioned_in_documents SET DEFAULT ARRAY[]::uuid[];

-- ── case_analysis_results: default empty text arrays ─────────────────────────
ALTER TABLE case_analysis_results
  ALTER COLUMN key_weaknesses SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN key_strengths  SET DEFAULT ARRAY[]::text[];
