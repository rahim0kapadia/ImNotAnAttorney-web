-- Migration 029: cron_executions table for distributed idempotency guard
--
-- Replaces pg_try_advisory_lock() which is unreliable with Supabase's
-- connection pooler (locks are session-scoped; pooled connections are shared
-- across requests, so the same lock key can be acquired simultaneously on
-- different physical connections).
--
-- This table-based approach works across all serverless instances and
-- survives function restarts without leaving stale in-memory state.

CREATE TABLE IF NOT EXISTS cron_executions (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name      text        NOT NULL,
  status        text        NOT NULL DEFAULT 'running'
                            CHECK (status IN ('running', 'completed', 'failed')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for fast recent-run lookups (the hot query path in acquireCronLock)
CREATE INDEX IF NOT EXISTS idx_cron_executions_job_recent
  ON cron_executions (job_name, started_at DESC);

-- Secondary index to support future cleanup queries by age
CREATE INDEX IF NOT EXISTS idx_cron_executions_created_at
  ON cron_executions (created_at);

COMMENT ON TABLE cron_executions IS
  'Distributed idempotency log for cron jobs. Each row represents one execution attempt. '
  'Rows in status=running act as distributed locks. Stale running rows (>5min) are '
  'automatically recovered by acquireCronLock() on the next invocation.';

COMMENT ON COLUMN cron_executions.job_name IS
  'Unique identifier for the cron job, e.g. ''drip'', ''reconcile''. '
  'Must match the jobName passed to acquireCronLock().';

COMMENT ON COLUMN cron_executions.status IS
  'running = lock held (job executing), completed = success, failed = error or stale';

COMMENT ON COLUMN cron_executions.started_at IS
  'When this execution began. Used for window checks (e.g. "has this job run in the last 23h?").';

COMMENT ON COLUMN cron_executions.completed_at IS
  'When releaseCronLock() was called. NULL for running and abandoned rows.';
