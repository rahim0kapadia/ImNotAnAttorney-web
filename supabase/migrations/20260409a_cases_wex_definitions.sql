-- Add wex_definitions JSONB column to cases table.
-- Column was added via Management API, used by engine legal-research.mjs
-- and generate-report Edge Function. Capturing in migration for rebuild safety.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS wex_definitions jsonb;
