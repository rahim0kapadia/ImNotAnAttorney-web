-- Add completed_at timestamp for monitoring engagement closure
-- Per Martin Fowler's Temporal Property pattern: event-specific timestamps
-- live in dedicated per-event columns (like delivered_at, phase_a_completed_at).
-- Spec: docs/plans/2026-04-09-monitoring-terminal-state.md ("Decision on closure timestamp column")

ALTER TABLE cases ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cases_completed_at
  ON cases (completed_at)
  WHERE completed_at IS NOT NULL;
