-- 2026-04-23e — Playbook Circuit Addendum token column (E4)
--
-- Adds an orders column that gates the post-purchase addendum page at
-- /playbook-addendum/[slug]/[state]?t=<token>. The plaintext token is
-- delivered to the customer in the post-purchase email; only the SHA-256
-- hash is stored in the DB (ARCHITECTURE invariant #5 timing-safe token
-- posture, consistent with standalone_report_token_hash / report_token_hash
-- precedent — see migrations 20260408j_standalone_intake_token_hash.sql
-- and 20250101000034_report-token-hash.sql).
--
-- Forward-only, idempotent. Zero backfill: existing orders predate the
-- addendum product and cannot retroactively receive an addendum link.
-- Column is nullable; post-purchase email cron populates it for
-- PLAYBOOK_SLUGS tiers only.
--
-- Referenced by:
--   src/app/playbook-addendum/[slug]/[state]/page.tsx        (read path)
--   src/app/api/playbook-addendum/[slug]/[state]/pdf/route.ts (print/PDF)
--   src/lib/playbook-addendum/generate.ts                     (query layer)
--
-- Apply via Supabase Management API on 2026-04-23.
--
-- migrationApproved: true (ADD COLUMN + partial unique index only; no DROP / no ALTER TYPE).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS playbook_addendum_token_hash text;

-- Partial unique index on the hash column — only enforces uniqueness on
-- non-NULL values so legacy orders without an addendum token don't collide.
-- Matches pattern from migration 20260408j_standalone_intake_token_hash.sql.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_playbook_addendum_token_hash
  ON public.orders (playbook_addendum_token_hash)
  WHERE playbook_addendum_token_hash IS NOT NULL;

COMMENT ON COLUMN public.orders.playbook_addendum_token_hash IS
  'SHA-256 hex digest of the plaintext playbook-addendum token. The plaintext '
  'is sent to the customer in the post-purchase addendum-ready email and is '
  'NEVER stored server-side. Populated by post-purchase email cron for '
  'PLAYBOOK_SLUGS tiers only. Consumed by '
  'src/app/playbook-addendum/[slug]/[state]/page.tsx and the matching PDF '
  'download route.';
