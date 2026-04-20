# Plan: White-Label Infrastructure for Partner-Branded Bondsman Referral Funnel

**Date:** 2026-04-19
**Scope:** FEATURE (multi-file, DB migration, component split, storage, API integration)
**Trigger:** Deferred from `docs/plans/2026-04-19-bondsman-referral-audit-master.md` (strategic decisions #1-#3). Bondsman referral funnel pre-quiz surfaces should render partner brand (logo + colors) so the arrested defendant sees the bondsman they already trust, not a cold "INAA" site. Post-quiz + paid-funnel reverts to INAA brand (authority transfer at trust crossover).

## Strategic Grounding

- **Expert / cascade:** Next.js Multi-Tenant guide (official) + Vercel Multi-Tenant Template establish middleware + dynamic routing as the canonical pattern. We extend our existing path-based partner scoping (`/r/[code]`) rather than subdomains — lower ops cost, no DNS automation, stays in the free tier.
- **Brand data source (bootstrap-mode):** Brandfetch Logo API is free forever, 60M brands, 500K req/mo soft limit ([brandfetch.com/developers/pricing](https://brandfetch.com/developers/pricing), [docs.brandfetch.com/logo-api/rate-limits](https://docs.brandfetch.com/logo-api/rate-limits)). Paid Brand API ($99/mo) gives richer color/font data but is NOT required — Color Thief v3 on the fetched logo PNG gives us the same color data for $0.
- **Extraction + accessibility:** Color Thief v3 ships WCAG contrast ratios, `textColor`, `isDark`/`isLight` per extracted color object ([lokeshdhakar.com/projects/color-thief](https://lokeshdhakar.com/projects/color-thief/)). Contrast guard is built-in — no separate library needed.
- **Cascade mapping:**
  - **Us:** partner acquisition lever (bondsmen sign up because their brand shows up in the moment that matters most).
  - **Partners (bondsmen):** brand-in-crisis-context = trust transfer; their client sees them at the jail-desk moment AND on the quiz entry page.
  - **Downstream (arrested defendants / family):** less cognitive friction at 3AM — a logo they already trust bridges them into the INAA tool instead of a cold intake.
  - **Ecosystem:** raises the floor for partner-branded legal products (attorneys, PO officers, treatment centers can all plug in later).
  - **Future-us:** shell is reusable across any future partner type. Not a bondsman-only carve-out.

## Trust-Crossover Rule (HARD)

| Surface | Shell | Why |
|---------|-------|-----|
| `/r/[code]` bondsman landing | `<PartnerBrandedShell>` | Bondsman's logo + colors. Client is handed the link at the jail desk; seeing "the guy who just helped me" is continuity, not confusion. |
| Pre-quiz referral pages (e.g. `/r/[code]/start`) | `<PartnerBrandedShell>` | Same trust layer, still in pre-transact. |
| Quiz (`/score` and any scored intake with partner context) | `<InaaBrandedShell>` | Trust crossover. Anonymous-by-necessity authority now leads. Partner code persists invisibly for attribution. |
| Checkout, paid funnel, delivery, all post-quiz | `<InaaBrandedShell>` | INAA guarantees the product; partner is not the seller. UPL + refund language must be ours. |
| Admin + Partner dashboards | existing INAA + partner mixed as today | No change. |

**Do not blend shells on one page.** Flickering between brands = trust loss.

## Files to Create / Modify

### Phase 1 — DB schema migration

New migration file: `supabase/migrations/<YYYYMMDDHHMMSS>_partner_branding.sql`

```sql
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS logo_url              text,
  ADD COLUMN IF NOT EXISTS logo_storage_path     text,      -- supabase/storage key, null if using remote Brandfetch URL
  ADD COLUMN IF NOT EXISTS brand_color_primary   text,      -- #RRGGBB, validated on write
  ADD COLUMN IF NOT EXISTS brand_color_accent    text,
  ADD COLUMN IF NOT EXISTS brand_color_bg        text,      -- optional surface bg override
  ADD COLUMN IF NOT EXISTS brand_color_source    text,      -- 'brandfetch' | 'colorthief' | 'manual'
  ADD COLUMN IF NOT EXISTS website_url           text,
  ADD COLUMN IF NOT EXISTS brand_contrast_passed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS brand_updated_at      timestamptz;

-- Hex validator (check constraints; null allowed)
ALTER TABLE public.partners
  ADD CONSTRAINT partners_primary_hex_format
    CHECK (brand_color_primary IS NULL OR brand_color_primary ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT partners_accent_hex_format
    CHECK (brand_color_accent  IS NULL OR brand_color_accent  ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT partners_bg_hex_format
    CHECK (brand_color_bg      IS NULL OR brand_color_bg      ~ '^#[0-9A-Fa-f]{6}$');

-- Source enum guard
ALTER TABLE public.partners
  ADD CONSTRAINT partners_brand_color_source_valid
    CHECK (brand_color_source IS NULL OR brand_color_source IN ('brandfetch','colorthief','manual'));

CREATE INDEX IF NOT EXISTS partners_brand_updated_at_idx ON public.partners(brand_updated_at);
```

Update `supabase/SCHEMA.md` with new columns. Per project rule: save migration file BEFORE applying (gotcha `gotcha-migration-file-before-apply.md`).

### Phase 2 — Brandfetch Logo API client

New file: `src/lib/partner-branding/brandfetch-client.ts`
- `fetchLogoByDomain(domain: string): Promise<{ pngUrl, svgUrl?, width, height } | null>`
- Uses Logo API (free): `https://cdn.brandfetch.io/{domain}/w/400/h/400` (image endpoint, no key needed for basic use)
- Fallback: if 404, return null — do not throw. Caller handles missing logo.
- No Brand API ($99/mo); Color Thief extraction handles color data.

Env var: `BRANDFETCH_CLIENT_ID` (optional — unlocks higher rate limits if we register for one). Do not block if unset.

### Phase 3 — Color Thief v3 palette extraction

Add dependency: `colorthief@^3` or vanilla `color-thief` v3 (confirm exact package name at install).

New file: `src/lib/partner-branding/palette.ts`
- `extractPalette(logoUrl: string): Promise<{ primary: HexColor, accent: HexColor, primaryContrastOnBlack: number, primaryContrastOnWhite: number, textColor: 'black' | 'white' }>`
- Uses Color Thief v3 async variant (server-side via node-canvas or client-side via `<img>`). Decide at implementation time; prefer server-side at signup so the extraction result is deterministic and cached in DB.
- Returns WCAG contrast ratios for the brand primary against our site's black `#000` bg and against a potential white text — we reject colors where neither passes AA (4.5:1).

### Phase 4 — Supabase Storage bucket for partner logo uploads

New migration or dashboard config: Storage bucket `partner-logos` (public read, partner-scoped write via RLS).
RLS policy sketch:
```sql
-- Insert: partner can only write to their own prefix
CREATE POLICY "partner can upload own logo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'partner-logos'
  AND (storage.foldername(name))[1] = (SELECT promo_code FROM public.partners WHERE id = auth.uid())
);
```
Max file size: 2MB. Allowed MIME: `image/png`, `image/jpeg`, `image/svg+xml`, `image/webp`.

### Phase 5 — Shell components (the CORE of this plan)

New: `src/components/shells/PartnerBrandedShell.tsx`
- Props: `{ partner: PartnerBrand, children }`
- Top bar: partner logo (left) + "Powered by ImNotAnAttorney" microtext (right, small, amber-400).
- Color variables injected via inline `<style>` scoped to shell: `--partner-primary`, `--partner-accent`, `--partner-bg`, `--partner-text`.
- CSS tokens so child components (CTAs, buttons, accent text) pick up partner colors.
- Footer: dual attribution (partner business name + "ImNotAnAttorney research").

New: `src/components/shells/InaaBrandedShell.tsx`
- Existing INAA chrome (existing Header + Footer components). No partner branding. Partner code stored invisibly in `data-partner-code` on body for analytics only.

Update routes using the shells:
- `src/app/r/[code]/page.tsx` → wrap in `<PartnerBrandedShell>`
- Any pre-quiz `/r/[code]/...` subpages → wrap in `<PartnerBrandedShell>`
- `src/app/score/page.tsx` → wrap in `<InaaBrandedShell>` (revert brand at crossover)
- All checkout + post-quiz pages → already INAA; no change, document the invariant in `ARCHITECTURE.md`.

### Phase 6 — OG image refactor for partner brand

Update: `src/app/r/[code]/opengraph-image.tsx`
- Consume `partner.brand_color_primary` and `partner.logo_url` from the existing partner lookup.
- Keep "Powered by ImNotAnAttorney" microtext.
- Contrast fallback: if WCAG contrast of partner primary on our dark bg fails, render with default INAA amber + small partner logo inset (never ship illegible OG).

### Phase 7 — Partner dashboard upload UI

New: `src/app/partners/dashboard/branding/page.tsx` (or extend existing dashboard)
- Website URL input → on blur, trigger Brandfetch lookup → show preview
- Manual logo upload (with preview) — goes to Supabase Storage
- Color override inputs (3 hex fields: primary / accent / bg) — with live contrast indicators
- "Use extracted palette" toggle (writes `brand_color_source = 'colorthief'`) vs "Manual override" (writes `'manual'`)
- Save button persists all fields + stamps `brand_updated_at`.

### Phase 8 — Contrast guard (enforcement)

New: `src/lib/partner-branding/contrast-guard.ts`
- `assertWcagAA(fg: HexColor, bg: HexColor): { passes: boolean, ratio: number }`
- Called on every write (dashboard save + Brandfetch auto-extract).
- If primary fails AA against both `#000` and `#FFF`, reject the save with a friendly error OR downgrade to fallback (default INAA amber). Decision at implementation: prefer REJECT at save so partners cannot ship illegible brands.
- Store `brand_contrast_passed` boolean. Shell components SHORT-CIRCUIT partner branding if `false` — render INAA default. No silent ugly pages.

### Phase 9 — Documentation + verification

- Update `ARCHITECTURE.md` with new invariant: "Trust-crossover rule: partner brand pre-quiz, INAA brand quiz+." Include the shell decision tree.
- Update `CLAUDE.md` Key Architectural Files table with `partner-branding/*`.
- E2E test `tests/partner-branding.spec.ts`: load `/r/testcode`, assert partner logo visible; navigate to `/score`, assert INAA brand visible.
- Unit test contrast guard with known-fail hex pair.
- Run `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1` before every commit (per feedback rule).

## Files NOT in Scope

- Custom subdomains per partner (future — requires DNS automation, Vercel domain API, cert mgmt).
- Multi-domain SSO (future).
- Editing the quiz copy — quiz stays INAA-voiced.
- Paid funnel / checkout branding changes.
- Email templates — drip + delivery emails stay INAA-branded (UPL + refund language is ours).
- Admin dashboard redesign.

## Out-of-Band Dependencies

- **Brandfetch:** no signup strictly required for public logo CDN, but registering for a client ID is free and raises rate limits. Add to `.env.local` if we go that path.
- **Color Thief:** npm install `colorthief` (v3). No auth.
- **Supabase Storage:** bucket must be created via dashboard or migration before Phase 7.

## Phases + Estimate

| Phase | Est | Blocker-for |
|-------|-----|-------------|
| 1 DB migration | 30 min | everything |
| 2 Brandfetch client | 45 min | 3, 7 |
| 3 Color Thief extraction | 1 hr | 7 |
| 4 Storage bucket + RLS | 45 min | 7 |
| 5 Shell components | 2 hr | 6, 7, e2e |
| 6 OG refactor | 45 min | — |
| 7 Dashboard UI | 2 hr | — |
| 8 Contrast guard | 45 min | 5, 6, 7 |
| 9 Docs + tests | 1 hr | ship |

**Total:** ~10 hrs serial. Phases 2+3+4 parallelizable after Phase 1.

## Rollback

All changes behind a feature flag: `NEXT_PUBLIC_PARTNER_BRANDING_ENABLED` (default `false` until Phase 9 verification clean). Shells check flag; if false, always render INAA.

DB migration is additive-only (new columns, new constraints, new bucket) — safe to keep even if rolled back in code.

## Session Handoff Prompt

```
Execute the implementation plan at
  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-19-white-label-infrastructure.md

Start at Phase 1 (DB migration). Save migration file BEFORE applying
(gotcha-migration-file-before-apply rule). Use scripts/lib/db.mjs direct
Postgres pooler, not Management API. Verify each phase with tsc + a grep
for the intended artifact before moving to the next.

Feature flag NEXT_PUBLIC_PARTNER_BRANDING_ENABLED stays false until
Phase 9 verification is clean.
```
