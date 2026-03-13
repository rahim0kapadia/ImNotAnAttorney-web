-- Migration 009: Add score context columns to subscribers table
-- Purpose: Enable score-band-segmented nurture email sequences
-- The score page passes band, score value, and charge type when a defendant
-- subscribes after viewing their Defense Milestone Score results.
--
-- These columns are nullable because not all subscribers come from the score page.

ALTER TABLE subscribers
  ADD COLUMN IF NOT EXISTS score_band TEXT,
  ADD COLUMN IF NOT EXISTS score_value INTEGER,
  ADD COLUMN IF NOT EXISTS charge_type TEXT;

-- Index on score_band for drip sequence branching
CREATE INDEX IF NOT EXISTS idx_subscribers_score_band ON subscribers (score_band)
  WHERE score_band IS NOT NULL;
