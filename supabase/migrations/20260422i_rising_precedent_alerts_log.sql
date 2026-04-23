-- Sprint 6c of the tier-ladder plan. Tracks alert sends per order so the
-- cron route /api/cron/rising-precedent-alerts can enforce per-tier cadence
-- (War Room 7-day, Situation Room 3-day).
--
-- Plan: docs/plans/2026-04-22-tier-ladder-data-differentiation.md
-- Worry-to-Pristine round 1 finding C1 + C2 (migration missing + pgcrypto
-- dependency not declared) — 2026-04-22.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS rising_precedent_alerts_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    email TEXT NOT NULL,
    tier TEXT NOT NULL,
    charge_type TEXT,
    state TEXT,
    alerted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cited_opinion_ids BIGINT[] NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rpa_order_id
    ON rising_precedent_alerts_log (order_id, alerted_at DESC);

COMMENT ON TABLE rising_precedent_alerts_log IS
    'War Room / Situation Room rising-precedent alert send log. Populated by /api/cron/rising-precedent-alerts. Query pattern: latest alerted_at per order_id to enforce cadence window (3 days SR, 7 days WR).';
