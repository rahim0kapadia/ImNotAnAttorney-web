-- Migration 003: Case Priority Column
-- Date: 2026-03-26
-- Context: Situation Room ($9,997) cases get priority = 1 at purchase,
--          signaling the engine and operator to handle them before all others.
--          Lower number = higher priority (1 = top priority, null = normal).

-- =============================================================================
-- CASES TABLE — Priority flag for Situation Room
-- =============================================================================
ALTER TABLE cases ADD COLUMN IF NOT EXISTS priority integer DEFAULT NULL;

-- Index for fast operator queue ordering (priority ASC NULLS LAST, created_at ASC)
CREATE INDEX IF NOT EXISTS idx_cases_priority ON cases(priority) WHERE priority IS NOT NULL;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- After running, verify with:
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'cases' AND column_name = 'priority';
