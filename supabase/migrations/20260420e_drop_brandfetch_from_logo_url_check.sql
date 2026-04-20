-- Migration: Drop cdn.brandfetch.io from partners.logo_url CHECK allowlist
-- Date: 2026-04-20
-- Plan: docs/plans/2026-04-19-white-label-infrastructure.md (Brandfetch removal)
--
-- 20260420c added a CHECK constraint that allowed logo_url to live on
-- EITHER our Supabase Storage bucket OR cdn.brandfetch.io. Brandfetch
-- was ripped out in favor of server-side website-scraper.ts (all
-- scraped logos are now downloaded + uploaded to our bucket, so the
-- stored logo_url host is always *.supabase.co).
--
-- Tighten the CHECK — Supabase Storage is the only allowed host.
-- Any partner row currently storing a cdn.brandfetch.io URL (none
-- in prod today per pre-flight scan) would fail the new constraint;
-- NULL them out first so the constraint can land cleanly.

BEGIN;

-- 1. Null out any existing Brandfetch-hosted logo_url so the new
-- constraint doesn't reject an existing row on ADD.
UPDATE public.partners
   SET logo_url = NULL,
       logo_storage_path = NULL,
       brand_contrast_passed = false,
       brand_updated_at = NOW()
 WHERE logo_url IS NOT NULL
   AND logo_url ~ '^https://cdn\.brandfetch\.io/';

-- 2. Drop the old permissive constraint, add the tight one.
ALTER TABLE public.partners DROP CONSTRAINT IF EXISTS partners_logo_url_allowlist;

ALTER TABLE public.partners
  ADD CONSTRAINT partners_logo_url_allowlist
  CHECK (
    logo_url IS NULL
    OR logo_url ~ '^https://[a-z0-9-]+\.supabase\.(co|in)/storage/v1/object/public/partner-logos/'
  );

COMMENT ON CONSTRAINT partners_logo_url_allowlist ON public.partners IS
  'Partner logo URLs must live on our Supabase Storage partner-logos bucket. Scraped logos from partner websites are downloaded + re-uploaded by POST /api/partner/branding/fetch-website so this invariant holds regardless of source.';

COMMIT;
