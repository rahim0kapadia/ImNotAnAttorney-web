-- Migration 033: Atomic cron lock acquisition via RPC
--
-- Replaces the SELECT-then-INSERT two-step in cron-idempotency.ts with an
-- atomic operation. Eliminates the race window where two concurrent instances
-- can both pass the SELECT check and both INSERT successfully.
--
-- For the drip route (which sends crisis emails to defendants), "both may run"
-- means defendants get duplicate Day 2/4/7 emails. This RPC eliminates that risk.

-- Drop legacy advisory-lock version (took bigint key, replaced by cron_executions table in migration 028)
DROP FUNCTION IF EXISTS acquire_cron_lock(bigint);

CREATE OR REPLACE FUNCTION acquire_cron_lock(
  p_job_name TEXT,
  p_interval_ms BIGINT,
  p_stale_threshold_ms BIGINT DEFAULT 300000
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_interval INTERVAL;
  v_stale_threshold INTERVAL;
BEGIN
  -- Convert milliseconds to intervals
  v_interval := (p_interval_ms || ' milliseconds')::INTERVAL;
  v_stale_threshold := (p_stale_threshold_ms || ' milliseconds')::INTERVAL;

  -- Mark stale locks as failed (crashed previous runs)
  UPDATE cron_executions
  SET status = 'failed', completed_at = NOW()
  WHERE job_name = p_job_name
    AND status = 'running'
    AND started_at < NOW() - v_stale_threshold;

  -- Atomic insert-if-no-recent-run
  -- Only inserts if no completed or running execution exists within the interval
  INSERT INTO cron_executions (job_name, status, started_at)
  SELECT p_job_name, 'running', NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM cron_executions
    WHERE job_name = p_job_name
      AND started_at > NOW() - v_interval
      AND status IN ('running', 'completed')
  )
  RETURNING id INTO v_id;

  -- Returns the new execution ID if lock acquired, NULL if another instance won
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Restrict to service role only (no public/anon access)
REVOKE ALL ON FUNCTION acquire_cron_lock(TEXT, BIGINT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION acquire_cron_lock(TEXT, BIGINT, BIGINT) FROM anon;
REVOKE ALL ON FUNCTION acquire_cron_lock(TEXT, BIGINT, BIGINT) FROM authenticated;

COMMENT ON FUNCTION acquire_cron_lock IS
  'Atomic cron lock acquisition. Returns UUID if lock acquired, NULL if skipped. '
  'Handles stale lock cleanup in the same transaction.';
