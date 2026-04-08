-- 2026-04-08 — Hash standalone intake tokens (W6 security polish)
--
-- Context: standalone_intake_token was previously stored as plaintext in the
-- orders table. The corresponding report delivery uses standalone_report_token_hash
-- (SHA-256). This migration brings the intake token into the same pattern.
--
-- After this migration:
--   - Webhook writes the HASH of the intake token, not the plaintext
--   - Customer still receives the plaintext token in their intake email (unchanged UX)
--   - Intake endpoint hashes the incoming token and looks up by hash
--   - The old plaintext column standalone_intake_token is kept for now (nullable).
--     It is populated by the webhook to NULL on new orders. A follow-up migration
--     will drop the column once all code paths are confirmed hash-only.
--
-- Zero existing standalone orders at apply time (verified via COUNT query) —
-- no backfill needed. Forward-only, safe to re-run.
--
-- Applied via Supabase Management API on 2026-04-08.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS standalone_intake_token_hash text;

-- Unique index on the hash column (partial — only enforces uniqueness on
-- non-NULL values so legacy orders without a hash don't collide)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_standalone_intake_token_hash
  ON orders(standalone_intake_token_hash)
  WHERE standalone_intake_token_hash IS NOT NULL;
