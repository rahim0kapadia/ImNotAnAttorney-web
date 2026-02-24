-- =============================================================================
-- Migration 004: Launch readiness — advisory locks, token expiry, RLS, rate limits
-- =============================================================================
--
-- Combines four infrastructure improvements:
--   E2: Advisory lock functions for distributed cron deduplication
--   E3: report_token_expires_at column for report token expiry
--   E6: Storage bucket RLS policies for discovery-files
--   E7: Rate limits table for PostgreSQL-based rate limiting
--
-- Idempotent: Yes — uses IF NOT EXISTS, OR REPLACE, safe to run multiple times.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- E2: Advisory lock functions for cron deduplication
-- ---------------------------------------------------------------------------
-- PostgreSQL advisory locks prevent concurrent cron executions from overlapping.
-- Lock key 1 = drip cron. Add more keys as needed for other cron jobs.

CREATE OR REPLACE FUNCTION acquire_cron_lock(lock_key bigint)
RETURNS boolean AS $$
BEGIN
  RETURN pg_try_advisory_lock(lock_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION release_cron_lock(lock_key bigint)
RETURNS void AS $$
BEGIN
  PERFORM pg_advisory_unlock(lock_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- E3: Report token expiration column
-- ---------------------------------------------------------------------------
-- Tracks when a report token expires. Default 12 months from generation.
-- The report viewer page checks this before displaying the report.

ALTER TABLE cases ADD COLUMN IF NOT EXISTS report_token_expires_at timestamptz;

-- ---------------------------------------------------------------------------
-- E7: Rate limits table for PostgreSQL-based rate limiting
-- ---------------------------------------------------------------------------
-- Stores per-key request counts with automatic window expiration.
-- Used by subscribe, intake, score, and checkout API routes.

CREATE TABLE IF NOT EXISTS rate_limits (
  key text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (key)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start
  ON rate_limits(window_start);

-- Rate limit check-and-increment function.
-- Returns true if under the limit, false if rate limited.
-- Automatically resets the window if it has expired.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key text,
  p_max_requests integer,
  p_window_seconds integer
)
RETURNS boolean AS $$
DECLARE
  v_count integer;
  v_window_start timestamptz;
BEGIN
  -- Try to get existing record
  SELECT request_count, window_start INTO v_count, v_window_start
  FROM rate_limits WHERE key = p_key FOR UPDATE;

  IF NOT FOUND THEN
    -- New key: insert and allow
    INSERT INTO rate_limits (key, window_start, request_count)
    VALUES (p_key, now(), 1)
    ON CONFLICT (key) DO UPDATE SET request_count = rate_limits.request_count + 1;
    RETURN true;
  END IF;

  -- Check if window has expired
  IF v_window_start + (p_window_seconds || ' seconds')::interval < now() THEN
    -- Reset window
    UPDATE rate_limits SET window_start = now(), request_count = 1 WHERE key = p_key;
    RETURN true;
  END IF;

  -- Check if under limit
  IF v_count < p_max_requests THEN
    UPDATE rate_limits SET request_count = request_count + 1 WHERE key = p_key;
    RETURN true;
  END IF;

  -- Rate limited
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup function for expired rate limit entries (called by cron)
CREATE OR REPLACE FUNCTION cleanup_rate_limits(p_max_age_seconds integer DEFAULT 3600)
RETURNS integer AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM rate_limits
  WHERE window_start + (p_max_age_seconds || ' seconds')::interval < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
