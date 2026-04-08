-- 2026-04-08 — Add updated_at column to orders
--
-- Discovered during W3 UPL audit: the generate-standalone Edge Function writes
-- `updated_at` on every PATCH, but the column did not exist in the orders table.
-- Every PATCH from the Edge Function was returning 400, silently breaking report
-- generation for every standalone product (collateral-consequences, license-risk,
-- and all Wave 1+4 $97 research SKUs that had been deployed but never exercised
-- with a real completed purchase).
--
-- This migration adds the column and backfills existing rows to created_at so
-- the audit trail is consistent. No data loss — forward-only, safe to re-run.
--
-- Applied via Supabase Management API on 2026-04-08.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Backfill existing rows so they aren't NULL
UPDATE public.orders
SET updated_at = created_at
WHERE updated_at IS NULL;
