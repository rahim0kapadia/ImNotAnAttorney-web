-- Fix increment_counter overload: add updated_at, restrict permissions
-- Fix half-credit rollover: atomic function to prevent TOCTOU race

-- ── Fix the 2-param increment_counter overload ──
-- The 20260409i migration created this without updated_at or GRANT restrictions.
CREATE OR REPLACE FUNCTION increment_counter(counter_key text, amount bigint DEFAULT 1)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO counters (id, value, updated_at)
  VALUES (counter_key, amount, now())
  ON CONFLICT (id) DO UPDATE
  SET value = counters.value + EXCLUDED.value,
      updated_at = now();
$$;

-- Lock down permissions to match the original 1-param overload (migration 025)
REVOKE EXECUTE ON FUNCTION increment_counter(text, bigint) FROM public;
REVOKE EXECUTE ON FUNCTION increment_counter(text, bigint) FROM anon;
GRANT EXECUTE ON FUNCTION increment_counter(text, bigint) TO service_role;

-- ── Atomic half-credit rollover RPC ──
-- Replaces the read-check-write pattern in the Stripe webhook.
-- Uses FOR UPDATE row lock to prevent concurrent double-grants.
CREATE OR REPLACE FUNCTION rollover_scholarship_half_credits(month_key text)
RETURNS integer -- returns number of whole scholarships granted (0 or 1+)
LANGUAGE plpgsql
AS $$
DECLARE
  current_halves bigint;
  granted integer := 0;
BEGIN
  -- Lock the half-credits row to prevent concurrent access
  SELECT value INTO current_halves
  FROM counters
  WHERE id = 'scholarship_half_credits'
  FOR UPDATE;

  IF current_halves IS NULL OR current_halves < 2 THEN
    RETURN 0;
  END IF;

  -- Calculate how many whole scholarships to grant
  granted := (current_halves / 2)::integer;

  -- Subtract used half-credits
  UPDATE counters
  SET value = value - (granted * 2), updated_at = now()
  WHERE id = 'scholarship_half_credits';

  -- Add whole scholarships to total and monthly counters
  INSERT INTO counters (id, value, updated_at)
  VALUES ('scholarships_total', granted, now())
  ON CONFLICT (id) DO UPDATE
  SET value = counters.value + granted, updated_at = now();

  INSERT INTO counters (id, value, updated_at)
  VALUES (month_key, granted, now())
  ON CONFLICT (id) DO UPDATE
  SET value = counters.value + granted, updated_at = now();

  RETURN granted;
END;
$$;

REVOKE EXECUTE ON FUNCTION rollover_scholarship_half_credits(text) FROM public;
REVOKE EXECUTE ON FUNCTION rollover_scholarship_half_credits(text) FROM anon;
GRANT EXECUTE ON FUNCTION rollover_scholarship_half_credits(text) TO service_role;
