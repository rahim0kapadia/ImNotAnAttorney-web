# Apex Fix #1 — Sales Surface for 3 Invisible Tier 9 SKUs

**Parent diagnosis:** `docs/plans/2026-04-26-apex-catalog-health-pass.md` F-L4-1
**Branch:** `fix/apex-3-invisible-skus`
**Layer:** L4 Distribution
**Cited expert:** Andy Crestodina, *Content Chemistry* — "Content nobody can find converts at zero." Cached at `~/.claude/experts/andy-crestodina.md`.

## Problem

Three SKUs flipped `live: true` on 2026-04-26 with zero sales surface:

| Slug | Price | live since | Sales surface |
|------|-------|-----------|---------------|
| `motion-success-report` | $197 | 2026-04-26 (D4) | NONE |
| `federal-jury-instruction-brief` | $97 | 2026-04-26 (D5) | NONE |
| `federal-sentencing-distribution` | $297 | shipped earlier, never surfaced | NONE |

All 3 buyable via direct `/checkout?standaloneProduct=<slug>` URL. None discoverable. Estimated lost revenue: 100% of these SKUs' revenue until sales surface ships.

## Cascade

- **us:** revenue activation on 3 dark SKUs ($197/$97/$297 each)
- **customer:** narrow-need defendants find narrow-priced products instead of paying $997 IB for one slice
- **downstream:** customer's attorney gets sharper questions in a sharper meeting
- **ecosystem:** raises legal-info-product floor for granular SKUs
- **future-us:** template — landing-page-before-flip becomes the sequence
- **No node loses.** SHIP.

## Files Created

1. `src/app/motion-success-report/page.tsx` — dedicated landing
2. `src/app/federal-jury-instruction-brief/page.tsx` — dedicated landing
3. `src/app/federal-sentencing-distribution/page.tsx` — dedicated landing

## Files Modified

1. `src/components/tier9/AvailabilityChecker.tsx` — Slug union widened to include `motion-success-report` + `federal-sentencing-distribution`; per-slug intake branches added (chargeType select + optional judge/circuit for MSR; chargeType + optional state for FSD).
2. `src/lib/tier9-reports/coverage.ts` — `checkMotionSuccessCoverage` + `checkFederalSentencingCoverage` helpers added.
3. `src/app/api/check-availability/[slug]/route.ts` — switch cases for `motion-success-report` + `federal-sentencing-distribution`.
4. `src/app/sitemap.ts` — `DEDICATED_ROUTE_SLUGS` extended; per-route entries appended.

## Hard Constraints (verified)

- Stripe price IDs UNCHANGED ($197 / $97 / $297) — no Stripe touches in this PR.
- URL slugs UNCHANGED — `/motion-success-report`, `/federal-jury-instruction-brief`, `/federal-sentencing-distribution`.
- DB tier_slugs UNCHANGED.
- No banned UPL phrases ("you should", "consult your attorney", "we recommend", "your best option", "publicly available", "ask your attorney").
- Mandatory gate line per SKU per spec.
- Tone: clinical, defendant-empathetic.
- Pattern matches existing dedicated landings byte-for-byte structurally (header, hero, FAQ, JSON-LD shape, sticky CTA).

## Verification

- `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck` — 0 errors after `.next/types` cleared
- `npx vitest run src/lib/tier9-reports/__tests__/`
- Routes resolve in build; AvailabilityChecker mounts on each slug
