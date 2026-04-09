-- Add research_source text column to case_law_references table.
-- Column was added via Management API, used by engine pre-research pipeline
-- and generate-report Edge Function filtering. Capturing in migration for rebuild safety.
ALTER TABLE case_law_references ADD COLUMN IF NOT EXISTS research_source text;
