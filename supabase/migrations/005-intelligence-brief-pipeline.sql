-- Migration 005: Intelligence Brief Pipeline
-- Adds columns needed for multi-phase IB generation (Phase A + Phase B)
--
-- New columns on cases:
--   section_outputs    — JSONB storing Phase A section results (keyed by section name)
--   judge_research_data — JSONB storing operator-entered judge research
--   prior_case_id      — FK to the prior Case Decoder case (for context in IB generation)
--   phase_a_completed_at — Timestamp when Phase A finished
--   phase_b_completed_at — Timestamp when Phase B finished
--
-- New column on intakes:
--   phase2_data — JSONB storing Phase 2 intake form data (already exists in prod, adding migration)
--
-- New statuses used by IB pipeline (no enum — status is text):
--   auto-generating — Phase A in progress
--   researching     — Phase A done, waiting for judge research
--   compiling       — Phase B in progress

-- Cases: IB pipeline columns
ALTER TABLE cases ADD COLUMN IF NOT EXISTS section_outputs JSONB;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS judge_research_data JSONB;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS prior_case_id UUID REFERENCES cases(id);
ALTER TABLE cases ADD COLUMN IF NOT EXISTS phase_a_completed_at TIMESTAMPTZ;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS phase_b_completed_at TIMESTAMPTZ;

-- Intakes: Phase 2 data (may already exist in production)
ALTER TABLE intakes ADD COLUMN IF NOT EXISTS phase2_data JSONB;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cases_prior_case ON cases(prior_case_id) WHERE prior_case_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cases_status_updated ON cases(status, updated_at);
