# Plan — Apex C1+C2 Dark-SKU Landings + Re-Flip Live

Date: 2026-04-27
Branch: `fix/apex-c1c2-dark-skus-landings`
Repo: `C:/Users/email/projects/ImNotAnAttorney-web`
Closes: `docs/plans/2026-04-26-worry-tier9-flipped-live.md` C1 + C2 + S1 (last
two deferred items in the audit thread).

## Summary

PR #188 stop-the-bleed reverted `charge-authority-pack` ($97) and
`precedent-watchlist` ($47) to `live: false / isActive: false` because both
were live but had no dedicated landing route. Customers reaching them got the
generic `/services/[slug]` fallback with no AvailabilityChecker — no way to
collect `chargeType` (and optional `state`) pre-purchase, so the post-purchase
intake was the only collection point. PR #188 was correct to dark them.

This PR closes that loop:
- Build dedicated `/charge-authority-pack` landing page mirroring the 8 prior
  Tier 9 dedicated landings (most recent template:
  `src/app/federal-jury-instruction-brief/page.tsx`).
- Build dedicated `/precedent-watchlist` landing page in the same shape, with
  drip explainer surfaced as part of the value prop (30-day, 4-email cadence).
- Widen `AvailabilityChecker` `Slug` union to include both slugs and route
  per-slug intake-payload branches in `handleCheck`, `handleWaitlist`,
  `buildCheckoutUrl`.
- Re-flip both `live: true` (`tiers.ts`) + `isActive: true` (`products.ts`).

## Files to create

1. `src/app/charge-authority-pack/page.tsx` — server component landing page,
   mounts `<AvailabilityChecker slug="charge-authority-pack" .../>`. Mirrors
   FJB landing structure (Metadata, FAQ, CHECK_ITEMS, JSON-LD Product +
   BreadcrumbList, methodology disclaimer, mandatory gate line). Sample data
   uses verified DUI / drug-trafficking / drug-possession-cocaine baseline
   counts (the three CHARGE_TYPE_AUTHORITY_MAP keys with dense coverage per
   audit W3).
2. `src/app/precedent-watchlist/page.tsx` — same shape; surfaces the 30-day
   drip cadence on the page. Sample data references the
   `citation_velocity_criminal` 1.13M-row corpus + the rising/fading shape.

## Files to modify

3. `src/components/tier9/AvailabilityChecker.tsx`
   - Extend `Slug` union to add `'charge-authority-pack'` and
     `'precedent-watchlist'`.
   - Per-slug intake-payload branches in `handleCheck` (POST body), in
     `handleWaitlist` (waitlist payload), and in `buildCheckoutUrl` (URL
     params): both pass `chargeType` (required) + optional `state`.
   - Charge-type select condition (`slug === 'similar-cases-analyzer' || ...`)
     extended to include both new slugs.
   - "Check a different X" button label condition extended (X = "charge").
   - Add a per-charge-authority-pack fallback transparency banner: when the
     selected `chargeType` resolves to zero `charge_type_top_authorities`
     rows but the criminal national fallback exists, display a yellow info
     banner so the customer knows the report uses national authorities.
     Mirrors the `pleaStateMissing` / `arrestKitThinState` D-T4 pattern.
4. `src/lib/tier9-reports/coverage.ts` — append two helpers:
   - `checkChargeAuthorityPackCoverage(chargeType, state)` — counts
     `charge_type_top_authorities` rows for the bridged internal slugs (via
     `CHARGE_TYPE_AUTHORITY_MAP`). Returns `{ available: true, coverage:
     { authoritiesCharge, authoritiesNational }, ... }`. `available` always
     true (national fallback is real data); banner condition lives in
     AvailabilityChecker.
   - `checkPrecedentWatchlistCoverage(chargeType, state)` — counts
     `citation_velocity_criminal WHERE charge_type_slug = ANY(bridged) AND
     rising_flag = true` plus a fading-flag count. Returns
     `{ available: true, coverage: { risingPrecedents, fadingPrecedents }, ... }`.
5. `src/app/api/check-availability/[slug]/route.ts` — add two `case`
   branches calling the new helpers. Reuse the existing `chargeType`
   validation (`isValidChargeType`).
6. `src/components/tier9/AvailabilityChecker.tsx` `COVERAGE_LABELS` — add
   labels for `authoritiesCharge`, `authoritiesNational`, `risingPrecedents`,
   `fadingPrecedents`.
7. `src/app/sitemap.ts` — extend `DEDICATED_ROUTE_SLUGS` set to include both
   slugs (so `/services/<slug>` is deduped) and emit explicit
   sitemap entries for the two new dedicated routes (priority 0.8).
8. `src/lib/tiers.ts` — flip `charge-authority-pack.live` + `precedent-
   watchlist.live` from `false` → `true`. Update inline comments to cite
   2026-04-27 closure.
9. `src/lib/products.ts` — flip both `isActive: false` → `true` with same
   comment update.

## Tests

10. `src/lib/tier9-reports/__tests__/charge-authority-pack-coverage.test.ts` —
    mock pattern from `arrest-kit-coverage.test.ts`. Asserts the helper
    returns `available: true` and surfaces both `authoritiesCharge` (via
    bridged internal slugs) and `authoritiesNational`.
11. `src/lib/tier9-reports/__tests__/precedent-watchlist-coverage.test.ts` —
    same pattern. Asserts rising + fading counters surface and `available:
    true` even when zero rising rows (the resolver uses national fallback).
12. `src/components/tier9/__tests__/availability-checker-slugs.test.ts` —
    sync test asserting the AvailabilityChecker `Slug` union literally
    contains all 9 slugs (the 7 active + 2 new). Mirror of the FJB-charges
    sync test pattern.

## Out of scope

- Data ingestion / pipeline changes
- Renderer copy refactors (charge-authority-pack.ts + precedent-watchlist.ts
  resolvers untouched)
- Stripe price ID changes (UNCHANGED — $97 / $47)
- DB migrations
- Cron route changes (the precedent-watchlist drip cron stays as-is)
- `content/blog/`, `blog-pipeline/`, `scripts/blog-pipeline/` (sibling
  session territory per branch protection)

## Hard constraints

- URL slugs UNCHANGED: `/charge-authority-pack`, `/precedent-watchlist`.
- DB `tier_slug` UNCHANGED.
- Stripe price IDs UNCHANGED.
- Mandatory gate line per SKU rendered on the page:
  - charge-authority-pack: "Top-cited authorities are aggregate frequencies.
    Use them to ask sharper questions, not to predict your case."
  - precedent-watchlist: "Citation velocity reflects which precedents are
    gaining or fading. Use it as a starting point for research, not a
    verdict."
- No banned UPL phrases — `UPL_BANNED_PHRASES` from
  `src/lib/charge-slug-maps.ts`.
- Tone: clinical + defendant-empathetic.
- Pattern parity: byte-for-byte structural mirror of FJB landing.

## Verification

- `rm -rf .next/types && node node_modules/typescript/bin/tsc --noEmit
  --skipLibCheck` → 0 errors.
- `npx vitest run src/lib/tier9-reports/__tests__ src/components/tier9/__tests__`
  → all green.
- Grep verify no banned UPL phrases in either new landing.
- Grep verify mandatory gate line per SKU present on the new pages.
- Grep verify `Slug` union literal includes both new slugs.

## Cascade

- us (Atlas): closes the audit loop; both SKUs sellable end-to-end.
- direct counterparty (defendants): pre-purchase intake collects `chargeType`
  + `state`, so the report (and the precedent-watchlist drip) seeds correctly
  on day one — no fragile post-purchase fallback.
- their downstream (defendants' families, attorneys): correctly-seeded report
  is sharper context for the representation conversation.
- ecosystem (Tier 9 catalog): all 10 Tier 9 slugs end up at parity — every
  one has a dedicated route + intake. No silent fallback to `/services/<slug>`
  for products that need slug-specific intake.
- future-us (next Tier 9 SKU): the AvailabilityChecker Slug union expansion
  is now in the canonical pattern; future SKUs follow the same recipe.

No node loses. Cascade-positive.
