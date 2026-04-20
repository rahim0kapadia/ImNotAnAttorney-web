-- 20260420c: Harden partner-branding columns against client-side bypass + XSS/SSRF.
--
-- Round-9 and round-10 reviewer fan-outs surfaced three concrete risks on
-- the white-label surface shipped in 20260419f + phases 2-9:
--
--   1. website_url has no scheme check. A partner can store
--      `javascript:alert(1)` and PartnerBrandedShell renders it as an
--      <a href>. Stored XSS. Fix: CHECK that enforces https?:// prefix.
--
--   2. logo_url is server-fetched by Satori when building the /r/[code]
--      OG image (og-template.tsx <img src>). If logo_url is a partner-
--      controlled URL pointing at 169.254.169.254 or an internal
--      hostname, the OG renderer becomes an SSRF probe. Fix: CHECK that
--      pins logo_url to the Supabase storage CDN allowlist.
--
--   3. brand_contrast_passed is a plain writable column. An authenticated
--      partner can UPDATE it directly via PostgREST, bypass the
--      contrast guard, and ship illegible partner branding. Fix: trigger
--      that resets brand_contrast_passed = false on any write to
--      brand_color_primary / brand_color_accent / brand_color_bg,
--      forcing a server-validated re-save via /api/partner/branding/save.
--
-- Idempotent. Existing rows pass the checks today (no colors yet; URLs
-- admin-seeded with https).

BEGIN;

-- 1. website_url scheme guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'partners_website_url_scheme'
      AND conrelid = 'public.partners'::regclass
  ) THEN
    ALTER TABLE public.partners
      ADD CONSTRAINT partners_website_url_scheme
      CHECK (website_url IS NULL OR website_url ~* '^https?://');
  END IF;
END;
$$;

-- 2. logo_url allowlist — Supabase storage OR Brandfetch CDN. Both are
-- fixed trusted hostnames, so the Satori fetch inside og-template.tsx can
-- never resolve to an internal address, a cloud metadata endpoint, or a
-- partner-controlled host. Eliminates the SSRF surface even if the
-- prefetchPartnerLogoAsDataUri function is later reused.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'partners_logo_url_allowlist'
      AND conrelid = 'public.partners'::regclass
  ) THEN
    ALTER TABLE public.partners DROP CONSTRAINT partners_logo_url_allowlist;
  END IF;
  ALTER TABLE public.partners
    ADD CONSTRAINT partners_logo_url_allowlist
    CHECK (
      logo_url IS NULL
      OR logo_url ~ '^https://[a-z0-9-]+\.supabase\.(co|in)/storage/v1/object/public/partner-logos/'
      OR logo_url ~ '^https://cdn\.brandfetch\.io/'
    );
END;
$$;

-- 3. brand_contrast_passed reset trigger. Any write to the color columns
-- drops contrast_passed back to false; the /api/partner/branding/save
-- route (service_role only, server-validated) is the only writer that
-- may re-raise it.
CREATE OR REPLACE FUNCTION public.partners_reset_brand_contrast_passed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.brand_color_primary IS DISTINCT FROM OLD.brand_color_primary
       OR NEW.brand_color_accent  IS DISTINCT FROM OLD.brand_color_accent
       OR NEW.brand_color_bg      IS DISTINCT FROM OLD.brand_color_bg THEN
      -- Only touch contrast_passed if the row itself did NOT set it in
      -- this write. This lets the save route (which recomputes and sets
      -- both color + contrast atomically) land true; a PostgREST client
      -- bypass that writes color alone flips to false.
      IF NEW.brand_contrast_passed IS NOT DISTINCT FROM OLD.brand_contrast_passed THEN
        NEW.brand_contrast_passed := false;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partners_reset_brand_contrast_passed_trg ON public.partners;
CREATE TRIGGER partners_reset_brand_contrast_passed_trg
  BEFORE UPDATE ON public.partners
  FOR EACH ROW
  EXECUTE FUNCTION public.partners_reset_brand_contrast_passed();

COMMENT ON FUNCTION public.partners_reset_brand_contrast_passed() IS
  'Forces brand_contrast_passed = false whenever a brand_color_* column is modified without the row also updating brand_contrast_passed. Server save route (service_role) sets both atomically, so it passes through; direct PostgREST color writes from authenticated partners get zeroed.';

COMMIT;
