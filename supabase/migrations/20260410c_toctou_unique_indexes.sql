-- TOCTOU race condition guards: partial unique indexes.
--
-- These prevent duplicate rows that can be created when concurrent requests
-- pass an application-level "check then insert" guard simultaneously.

-- Prevent duplicate standalone purchases (same email + same product while paid)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_standalone_unique
ON orders (email, standalone_product_slug)
WHERE status = 'paid' AND product_type = 'standalone';

-- Prevent duplicate included deliverables (e.g., two CD cases for one IB order)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cases_included_unique
ON cases (order_id, tier)
WHERE is_included_deliverable = true;

-- Prevent duplicate cron locks (only one running execution per job at a time)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cron_running_unique
ON cron_executions (job_name)
WHERE status = 'running';
