-- =============================================================================
-- Migration 003: Payment intent index + updated_at auto-trigger
-- =============================================================================
--
-- Purpose: Two performance and reliability improvements for the payment pipeline.
--
-- Change 1 (T1-11): Index on orders.stripe_payment_intent_id
--   The Stripe charge.refunded webhook looks up orders by payment intent ID.
--   Without this index, the lookup is a full table scan on the orders table.
--   As order volume grows, this would cause webhook timeouts (Stripe retries
--   after 20s, giving up after multiple failures).
--
-- Change 2 (T1-12): Auto-update trigger for cases.updated_at
--   Some code paths update cases rows without explicitly setting updated_at.
--   This trigger ensures updated_at is ALWAYS set to now() on any UPDATE,
--   which is critical for the stuck-case detection cron job that identifies
--   cases that haven't been touched in N days.
--
-- Run via: Supabase Dashboard SQL Editor (direct DB connection can also be used
--          via `npm install pg --no-save`, see CLAUDE.md for connection details).
--
-- Idempotent: Yes -- uses IF NOT EXISTS and OR REPLACE, safe to run multiple times.
-- =============================================================================

-- Index for refund lookups (charge.refunded webhook)
CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent
  ON orders(stripe_payment_intent_id);

-- Auto-update updated_at on every cases row update
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_cases_updated_at ON cases;
CREATE TRIGGER update_cases_updated_at
  BEFORE UPDATE ON cases
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

-- =============================================================================
-- Change 3 (T2-4): Atomic array_append RPC for file_urls
-- The upload endpoint needs to append file paths to cases.file_urls without a
-- read-modify-write race condition. This function uses array_append() which is
-- atomic at the database level — concurrent uploads won't lose file paths.
-- =============================================================================
CREATE OR REPLACE FUNCTION append_file_url(case_id uuid, new_url text)
RETURNS void AS $$
BEGIN
  UPDATE cases
  SET file_urls = array_append(COALESCE(file_urls, ARRAY[]::text[]), new_url)
  WHERE id = case_id;
END;
$$ language 'plpgsql' SECURITY DEFINER;
