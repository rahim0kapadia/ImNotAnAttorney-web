/**
 * Single source of truth for the partner-branding column list.
 *
 * Consumed by:
 *   - `getPartnerByCode` in `src/lib/partner-by-code.ts` (drives OG images
 *     at `/r/[code]/opengraph-image.tsx` and `/r/[code]/[product]/opengraph-image.tsx`
 *     plus `PartnerBrandedShell` rendered in `/r/[code]/page.tsx`)
 *   - `validatePartnerSession` in `src/lib/partner-auth.ts` (drives
 *     `/partner/dashboard/branding/page.tsx` which reads every field)
 *   - `/api/partner/dashboard/route.ts` response body
 *
 * If you're tempted to remove a column: one of the consumers above will
 * silently break (Supabase admin client is untyped — tsc will NOT catch it).
 * Instead, remove from here AND every consumer in the same commit, or add a
 * data migration. The regression tests in `partner-brand-columns.test.ts`
 * and per-caller tests pin this list.
 */

export const PARTNER_BRAND_COLUMNS = [
  "logo_url",
  "logo_storage_path",
  "brand_color_primary",
  "brand_color_accent",
  "brand_color_bg",
  "brand_color_source",
  "website_url",
  "brand_contrast_passed",
  "brand_updated_at",
] as const;

export type PartnerBrandColumn = (typeof PARTNER_BRAND_COLUMNS)[number];

export const PARTNER_BRAND_SELECT = PARTNER_BRAND_COLUMNS.join(", ");
