-- 2026-04-27 — Add plaintext report token + shared TTL column for in-page delivery (IDv2)
--
-- Plan: docs/plans/2026-04-27-immediate-download-v2.md §2.1 + §4 Task 1
--
-- Context:
--   standalone_intake_token (plaintext, declared in 20260406_standalone_products.sql:35)
--   was deferred-to-NULL by migration 20260408j_standalone_intake_token_hash.sql when
--   intake tokens moved to hash-only storage. Migration j comment (lines 11-13) read:
--   "kept for now... follow-up migration will drop the column once all code paths are
--   confirmed hash-only."
--
--   This migration REACTIVATES that column with new TTL semantics rather than dropping
--   it. The webhook will now write the plaintext intake token here for a 30-minute window
--   so the /checkout/success page can surface an in-page "Continue to Intake" CTA without
--   requiring the customer to check email. After 30 min the hourly scrub cron NULLs all
--   three plaintext fields.
--
--   The permanent drop of standalone_intake_token is permanently deferred — the column
--   is now part of the IDv2 plaintext-TTL contract.
--
-- Operations (all idempotent via IF NOT EXISTS):
--   1. ADD standalone_report_token_plaintext — plaintext report token for archetype-B
--      in-page poll (Tier 9 instant SKUs). Scrubbed by cron after TTL.
--   2. ADD plaintext_tokens_expires_at — single shared TTL for both plaintext fields.
--      One column, one cron predicate, no race between intake vs report scrub windows.
--   3. CREATE PARTIAL INDEX on plaintext_tokens_expires_at WHERE IS NOT NULL — used by
--      the cron WHERE predicate and the verify endpoint TTL guard. Non-unique.
--
-- NOT changed:
--   - standalone_intake_token (already exists, now re-activated with TTL semantics)
--   - standalone_intake_token_hash UNIQUE index (untouched)
--   - standalone_report_token_hash UNIQUE index (untouched)
--   - Any existing order rows (all new columns nullable, no defaults, no backfill)
--
-- Applied via: npx supabase db query --linked (per gotcha-migration-approval-gate.md)

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS standalone_report_token_plaintext text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS plaintext_tokens_expires_at timestamptz;

-- Non-unique partial index for cron query optimisation.
-- The cron predicate: WHERE plaintext_tokens_expires_at IS NOT NULL AND plaintext_tokens_expires_at < NOW()
-- The verify TTL guard: WHERE plaintext_tokens_expires_at IS NOT NULL AND plaintext_tokens_expires_at > NOW()
-- Partial (WHERE IS NOT NULL) keeps the index small — NULL rows (>99% of all-time orders) excluded.
CREATE INDEX IF NOT EXISTS idx_orders_plaintext_tokens_expires_at
  ON public.orders (plaintext_tokens_expires_at)
  WHERE plaintext_tokens_expires_at IS NOT NULL;
