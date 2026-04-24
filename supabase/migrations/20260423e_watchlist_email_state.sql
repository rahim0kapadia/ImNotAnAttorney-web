-- Precedent Watchlist $47 Tier 9 SKU — 30-day weekly email drip state.
--
-- Adds a JSON column to `orders` tracking the state of the 4-email drip that
-- accompanies each watchlist purchase (M3 of the 2026-04-23 autonomous plan).
--
-- Shape of the JSON blob (written by intake + cron):
--   {
--     "started_at": "2026-04-23T00:00:00Z",       -- first-tick ISO 8601 UTC
--     "last_sent_at": "2026-04-30T00:00:00Z",     -- last successful send
--     "emails_sent": 1,                             -- count of sends (0..4)
--     "last_velocity_snapshot": [                   -- top-10 opinion_ids on last cycle
--       {"cited_opinion_id": 3185469, "velocity": 55.2, "rank": 1},
--       ...
--     ],
--     "charge_type": "drug-possession",
--     "state": "FL"
--   }
--
-- Null on orders that didn't buy this SKU. Cron route
-- `/api/cron/precedent-watchlist-emails` reads + writes this column.
-- Drip ends automatically when emails_sent >= 4 OR now() > started_at + 30d.
--
-- Per plan: docs/plans/2026-04-23-data-to-product-autonomous-execution.md M3

BEGIN;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS watchlist_email_state JSONB;

-- Partial index for the cron scan (only rows with state present).
-- Lets the weekly cron fetch watchlist-drip orders with one index seek
-- instead of scanning the whole orders table.
CREATE INDEX IF NOT EXISTS idx_orders_watchlist_email_state
    ON public.orders ((watchlist_email_state->>'started_at'))
    WHERE watchlist_email_state IS NOT NULL;

COMMENT ON COLUMN public.orders.watchlist_email_state IS
    'Precedent Watchlist $47 SKU 30-day email drip state. Written by intake + /api/cron/precedent-watchlist-emails. Null for non-watchlist orders. Shape: {started_at, last_sent_at, emails_sent, last_velocity_snapshot[], charge_type, state}. Drip ends when emails_sent >= 4 OR now() > started_at + 30d.';

COMMIT;
