-- War Room $4,997 per-case monthly precedent-delta cron state (E3).
--
-- Adds a JSONB column to `orders` tracking the state of the never-ending
-- monthly per-case rising/falling precedent delta drip for War Room and
-- Situation Room buyers. Distinct from:
--   - watchlist_email_state (M3 $47, 30d/4-email drip, charge-level, ends)
--   - rising_precedent_alerts_log (Sprint 6c WR/SR weekly, charge-level,
--     uses a dedicated table; E3 uses per-case JSON state so the monthly
--     cadence + per-case snapshot diff are independent of the weekly cron)
--
-- Shape of the JSON blob (written by /api/cron/warroom-monthly-precedent-delta):
--   {
--     "first_run_at": "2026-04-24T00:00:00Z",        -- first-tick ISO 8601 UTC
--     "last_sent_at": "2026-05-24T00:00:00Z",        -- last successful send
--     "runs_sent": 1,                                 -- total deltas emailed
--     "last_snapshot": [                              -- top-10 rising ids from last run
--       {"cited_opinion_id": 3185469, "velocity": 55.2, "rank": 1},
--       ...
--     ],
--     "charge_type": "drug-possession",              -- resolved from linked case intake
--     "state": "FL",                                  -- resolved from linked case intake
--     "case_id": "abcd-1234-..."                      -- the specific case this state belongs to
--   }
--
-- Null on orders that are not War Room / Situation Room, or that haven't had
-- their first monthly tick yet. The cron creates the initial state on first
-- encounter (emails a baseline snapshot with no deltas — the TRUE delta starts
-- on the second monthly run once the baseline is stored).
--
-- Tier monotonicity:
--   - PER-CASE (not charge-level) — exceeds M3 $47 personalization
--   - MONTHLY forever (not 30d/4-email capped) — exceeds M3 duration
--   - PRE-TRIAL steady-state — stays below Situation Room $9,997 trial-phase depth
--
-- Per plan: docs/plans/2026-04-23-data-to-product-autonomous-execution.md E3

BEGIN;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS warroom_precedent_delta_state JSONB;

-- Partial index for the monthly cron scan — only the small subset of orders
-- with state populated need to be considered each run. Lets the cron fetch
-- active per-case deltas in one index seek instead of a full orders scan.
CREATE INDEX IF NOT EXISTS idx_orders_warroom_precedent_delta_state
    ON public.orders ((warroom_precedent_delta_state->>'last_sent_at'))
    WHERE warroom_precedent_delta_state IS NOT NULL;

COMMENT ON COLUMN public.orders.warroom_precedent_delta_state IS
    'War Room $4,997 / Situation Room $9,997 per-case monthly precedent-delta drip state (E3). Written by /api/cron/warroom-monthly-precedent-delta. Null for non-WR/SR orders or orders that have not received their first monthly tick. Shape: {first_run_at, last_sent_at, runs_sent, last_snapshot[], charge_type, state, case_id}. Never-ending drip (monthly, gated by 30-day cadence + significance threshold).';

COMMIT;
