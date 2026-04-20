-- Migration: Partner Branding Fields
-- Date: 2026-04-19
-- Plan: docs/plans/2026-04-19-white-label-infrastructure.md (Phase 1)
--
-- Adds brand-theming fields to `partners` so pre-quiz referral surfaces
-- (/r/[code] landing, any /r/[code]/* subpages) can render the partner's
-- logo + colors. Post-quiz + paid-funnel reverts to INAA brand (trust
-- crossover rule). Additive-only; safe to keep even if feature-flag
-- NEXT_PUBLIC_PARTNER_BRANDING_ENABLED stays false.

-- 1. Columns -----------------------------------------------------------
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS logo_url              text,
  ADD COLUMN IF NOT EXISTS logo_storage_path     text,
  ADD COLUMN IF NOT EXISTS brand_color_primary   text,
  ADD COLUMN IF NOT EXISTS brand_color_accent    text,
  ADD COLUMN IF NOT EXISTS brand_color_bg        text,
  ADD COLUMN IF NOT EXISTS brand_color_source    text,
  ADD COLUMN IF NOT EXISTS website_url           text,
  ADD COLUMN IF NOT EXISTS brand_contrast_passed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS brand_updated_at      timestamptz;

COMMENT ON COLUMN public.partners.logo_url              IS 'Public URL to partner logo — Supabase Storage (if logo_storage_path present) or Brandfetch CDN. Null if partner has not branded yet.';
COMMENT ON COLUMN public.partners.logo_storage_path     IS 'Supabase Storage object key under partner-logos bucket. Null when logo_url points to remote Brandfetch CDN.';
COMMENT ON COLUMN public.partners.brand_color_primary   IS 'Hex #RRGGBB. Partner primary brand color. Used for CTAs + accents on /r/[code] pre-quiz.';
COMMENT ON COLUMN public.partners.brand_color_accent    IS 'Hex #RRGGBB. Secondary brand accent.';
COMMENT ON COLUMN public.partners.brand_color_bg        IS 'Hex #RRGGBB. Optional surface-bg override (rare — site stays dark by default).';
COMMENT ON COLUMN public.partners.brand_color_source    IS 'Provenance of brand colors: brandfetch | colorthief | manual. Drives UI affordance (auto vs edited).';
COMMENT ON COLUMN public.partners.website_url           IS 'Partner website URL. Used as Brandfetch lookup key + footer "Visit Partner" link.';
COMMENT ON COLUMN public.partners.brand_contrast_passed IS 'True iff brand_color_primary passes WCAG AA (>= 4.5:1) against either #000 or #FFF. Shell renders INAA default when false (no silent illegible pages).';
COMMENT ON COLUMN public.partners.brand_updated_at      IS 'Stamp on any brand field write. Drives cache invalidation + dashboard "last updated" UI.';

-- 2. Hex-format constraints --------------------------------------------
-- Null allowed (partner may not have branded). Enforce #RRGGBB when set.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'partners_primary_hex_format'
  ) THEN
    ALTER TABLE public.partners
      ADD CONSTRAINT partners_primary_hex_format
        CHECK (brand_color_primary IS NULL OR brand_color_primary ~ '^#[0-9A-Fa-f]{6}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'partners_accent_hex_format'
  ) THEN
    ALTER TABLE public.partners
      ADD CONSTRAINT partners_accent_hex_format
        CHECK (brand_color_accent IS NULL OR brand_color_accent ~ '^#[0-9A-Fa-f]{6}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'partners_bg_hex_format'
  ) THEN
    ALTER TABLE public.partners
      ADD CONSTRAINT partners_bg_hex_format
        CHECK (brand_color_bg IS NULL OR brand_color_bg ~ '^#[0-9A-Fa-f]{6}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'partners_brand_color_source_valid'
  ) THEN
    ALTER TABLE public.partners
      ADD CONSTRAINT partners_brand_color_source_valid
        CHECK (brand_color_source IS NULL OR brand_color_source IN ('brandfetch','colorthief','manual'));
  END IF;
END $$;

-- 3. Index for brand_updated_at (dashboard ordering, cache warmers) ----
CREATE INDEX IF NOT EXISTS partners_brand_updated_at_idx
  ON public.partners(brand_updated_at);
