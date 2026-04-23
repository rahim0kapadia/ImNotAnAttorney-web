-- Sprint 6b + tier-ladder Worry-to-Pristine round 1 finding C10.
-- Tracks every LLM generation from the operator-facing routes
-- (motion-drafts, trial-strategy-memo) so post-hoc evals, drift detection,
-- and Critique Shadowing Stage 2 (Hamel's framework) can consume the corpus.
--
-- Plan: docs/plans/2026-04-22-tier-ladder-data-differentiation.md

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS llm_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID,
    route TEXT NOT NULL,
    model TEXT NOT NULL,
    temperature NUMERIC(3,2),
    system_prompt_hash TEXT,
    precedents_used JSONB,
    output TEXT,
    fabrication_warnings TEXT[],
    upl_warnings TEXT[],
    operator_accepted BOOLEAN,
    operator_edited_output TEXT,
    operator_critique TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_gen_case_created
    ON llm_generations (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_gen_route_status
    ON llm_generations (route, status, created_at DESC);

COMMENT ON TABLE llm_generations IS
    'Operator-facing LLM route output log. Feeds Stage-2 Critique Shadowing (Hamel) and drift detection. status ∈ {pending, returned, flagged, accepted, rejected}. fabrication_warnings captures cites not in input precedent list; upl_warnings captures directive-to-defendant language.';
