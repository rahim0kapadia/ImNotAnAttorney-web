-- Migration 027: Add batch_id for Anthropic Batch API integration.
-- Stores the batch ID for async generation polling by cron batch poller.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS batch_id text;

-- Partial index: only rows with active batches (used by poller query)
CREATE INDEX IF NOT EXISTS idx_cases_batch_id
  ON cases (batch_id)
  WHERE batch_id IS NOT NULL;
