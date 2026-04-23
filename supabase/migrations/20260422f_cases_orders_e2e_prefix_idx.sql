-- Round-2 finding W9: partial indexes for the Phase 2 E2E-orphan cleanup cron.
--
-- The cron at src/app/api/cron/cleanup-e2e-orphans/route.ts runs a daily
-- DELETE ... WHERE email LIKE 'phase2-e2e-%@test.invalid' AND created_at < cutoff.
-- With no supporting index, that LIKE + created_at scan walks the full cases
-- and orders tables — linear in row count. Phase 2 ships to a live DB that is
-- already ~10k+ rows per table and growing; by Q4 the cron would burn minutes.
--
-- Partial indexes on (created_at) scoped by the E2E email prefix keep the
-- index microscopic (only test rows are indexed) while making the cleanup
-- cron O(log n) regardless of real-customer growth.
--
-- Defensive session settings per cl-bulk-data-defensive.md #17.

SET statement_timeout = '30min';
SET tcp_keepalives_idle = 60;
SET tcp_keepalives_interval = 10;
SET tcp_keepalives_count = 6;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_e2e_prefix
  ON cases (created_at)
  WHERE email LIKE 'phase2-e2e-%@test.invalid';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_e2e_prefix
  ON orders (created_at)
  WHERE email LIKE 'phase2-e2e-%@test.invalid';

COMMENT ON INDEX idx_cases_e2e_prefix IS
  'Phase 2 (round-2 W9): partial index for /api/cron/cleanup-e2e-orphans. Scoped to test rows only — tiny on disk, keeps cleanup O(log n) regardless of real-customer table growth.';
COMMENT ON INDEX idx_orders_e2e_prefix IS
  'Phase 2 (round-2 W9): partial index for /api/cron/cleanup-e2e-orphans. Scoped to test rows only — tiny on disk, keeps cleanup O(log n) regardless of real-customer table growth.';
