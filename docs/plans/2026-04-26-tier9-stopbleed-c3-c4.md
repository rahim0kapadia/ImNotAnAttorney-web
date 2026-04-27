# Tier 9 Stop-the-Bleed: C3 + C4 (+ revert of C1, C2 + W1 copy refresh)

**Date:** 2026-04-26
**Branch:** `fix/tier9-stopbleed-c3-c4`
**Plan source:** `docs/plans/2026-04-26-worry-tier9-flipped-live.md` (worry-to-pristine output)

## Context

The 2026-04-26 D-T1 through D-T4 wave flipped six Tier 9 SKUs to `live: true`
and `isActive: true`. A worry-to-pristine sweep surfaced four CRITICAL
findings against the just-flipped subset:

| ID | Severity | Issue |
|----|----------|-------|
| C1 | CRITICAL | `charge-authority-pack` has no dedicated landing page; checkout reaches generic fallback. |
| C2 | CRITICAL | `precedent-watchlist` has no dedicated landing page; AvailabilityChecker `Slug` union excludes it; same fallback risk. |
| C3 | CRITICAL | `/api/check-availability/[slug]` ships a local drifted `TIER9_SLUGS` Set (six entries) — the canonical at `src/lib/tier9-reports/constants.ts` has ten. The two 2026-04-26 additions return 400 even when products are live. |
| C4 | CRITICAL | `checkDistrictCoverage` queries `judge_demographics.district` ilike `%state name%` — that column stores numeric district codes such as `"30"`, `"40"`, `"73"`, `"90"`. Plus `outcome_benchmarks.jurisdiction_name` is national-only. Returns `available: false` for every state, so the district-court product is gated to zero customers. |
| W1 | WARNING  | `/district-court-intelligence` page copy still describes the old $97 JUSTFAIR-only SKU. Product was upgraded to $147 Courthouse Intelligence Pack on 2026-04-23. |

C1 and C2 require new dedicated landing pages — out of scope for this
stop-the-bleed PR. They will land in a follow-up PR. This PR pulls C1 and C2
dark via a revert and ships C3 and C4 and W1 together.

## Cascade

- us: stop the bleed without holding the fix on a four-hour landing-page build
- direct counterparty (customers reaching old links to charge-authority-pack
  or precedent-watchlist): see no broken checkout that forwards them to a
  generic fallback page; the products are simply offline until landings ship
- direct counterparty (customers in any state visiting district-court-
  intelligence): the gate stops returning `available: false` for every state
  the moment C4 lands, so checkout works
- ecosystem (the canonical TIER9_SLUGS contract): one source of truth restored
- future-us: drift between the route's local Set and `constants.ts` cannot
  recur because the route now imports the canonical export
- adjacent (Slug union in AvailabilityChecker): unchanged, still excludes the
  two reverted slugs — coherent with `live: false`

## Fixes

### 1. Revert C1 plus C2 (immediate stop-the-bleed)

**Files:** `src/lib/tiers.ts`, `src/lib/products.ts`

- `charge-authority-pack`: `live: true` becomes `live: false`, and
  `isActive: true` becomes `isActive: false`. Comment:
  `2026-04-26 reverted dark — no dedicated landing page yet (C1 from worry-tier9-flipped-live audit)`
- `precedent-watchlist`: `live: true` becomes `live: false`, and
  `isActive: true` becomes `isActive: false`. Comment:
  `2026-04-26 reverted dark — no dedicated landing + Slug union excludes (C2)`

Both SKUs will be re-flipped in a follow-up PR after dedicated landings ship.

### 2. C3 — Canonical TIER9_SLUGS import

**File:** `src/app/api/check-availability/[slug]/route.ts`

Replace the local `const TIER9_SLUGS = new Set(...)` (six entries) with
`import { TIER9_SLUGS } from "@/lib/tier9-reports/constants"`. Switch and
case branches in the same file already handle the slugs they need; the dark
slugs just need `available: false` via the `isActive` boolean check
downstream of this gate, and they should not 400 at this layer.

### 3. C4 — District-Court coverage gate rewritten

**File:** `src/lib/tier9-reports/coverage.ts`

`checkDistrictCoverage(stateCode)` rewritten to mirror the post-purchase
resolver in `src/lib/tier9-reports/courthouse-intelligence.ts`:

1. Look up `ussc_districts` rows where `state_code === stateCode` to get a
   list of `cl_court_id` and `circuit` values.
2. Count `judge_disposition_profile` rows where `district_id` is IN the
   collected `cl_court_id` set.
3. Normalize circuit format (`"5th"` becomes `"5"`) and count
   `motion_outcome_rates_by_circuit` rows where `circuit` matches and
   `charge_type === "(all)"`.
4. Return `{ available: districts > 0, coverage: { districts, judges, circuitMotions }, matchedName, matchedCourt }`.

Banner-trip on the frontend remains keyed off `available: false`. Available
flips truthy for any state with at least one indexed federal district —
which is every state plus DC.

### 4. W1 — District-Court page copy refresh

**File:** `src/app/district-court-intelligence/page.tsx`

Hero, subhead, `CHECK_ITEMS`, `SAMPLE_ROWS`, and FAQ rewritten to the upgraded
$147 Courthouse Intelligence Pack scope per
`src/lib/tier9-reports/courthouse-intelligence.ts` lines 1-37:

- District-aggregate judge caseload (volume only — no predictive signals)
- Circuit-wide motion grant rates with national baseline plus deviation
- USSC FY14-23 sentencing aggregates per district
- Prosecutors section deliberately suppressed
- Hold the URL slug (`/district-court-intelligence`) and the price ($147)
- No banned UPL phrases ("you should", "consult your attorney", "we recommend")

## Verification

1. `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck` returns zero errors.
2. Live Node script (temp, deleted after run): replicate the new
   `checkDistrictCoverage` query path against FL, TX, CA, NY — assert each
   returns `districts >= 1`.
3. Vitest: `npx vitest run src/lib/tier9-reports/__tests__/ src/lib/defense-intelligence/__tests__/`
4. New unit test `src/lib/tier9-reports/__tests__/district-coverage.test.ts`
   with a mocked Supabase client; FL, TX, CA, NY each assert `districts >= 1`.

## Out of scope

- C1 dedicated landing page for `charge-authority-pack`.
- C2 dedicated landing page for `precedent-watchlist` plus
  `AvailabilityChecker` Slug union extension.
- Re-flip of those two SKUs (follow-up PR after C1 plus C2 land).
- arrest-survival-kit (already covered by D-T4 tests).
- All other Tier 9 SKUs not listed above.

## Hard constraints

- Stripe price IDs unchanged.
- URL slugs unchanged.
- DB tier_slugs unchanged.
- `arrest-survival-kit` unchanged.
- `district-court-intelligence` stays `live: true` — it works once C4 lands.
- `SKIP_TSC=1` and `SKIP_BUILD=1` permitted only if Windows tsc / next-build
  PATH issue surfaces, and any usage documented in the PR body.
