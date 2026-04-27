# D-T1 — Flip district-court-intelligence ($147) live

**Date:** 2026-04-26
**Branch:** `fix/dt1-district-court-flip-live`
**Class:** FEATURE (2 file edits, but feature-class because it makes a paid SKU purchasable in production)
**Sibling pattern:** Mirrors D4 (charge-authority-pack) flipped earlier today — same "verify data + RLS posture, flip both flags together" closeout from the deferred Tier 9 darks audit.

## Goal

Flip Courthouse Intelligence Pack (slug: `district-court-intelligence`, $147) from `live: false` / `isActive: false` to live in both `tiers.ts` and `products.ts` so it becomes purchasable on the production checkout. Audit PR #162 already aligned the two flags to false; this is the verified closeout.

## Why now

The 2026-04-23 deferred Tier 9 darks audit blocked this product on **"awaiting E2E + RLS verification"**. The 3 dependencies have since been populated, the resolver is fully wired (`generate.ts` cases at line 277), the unit suite is comprehensive (13 tests covering UPL guardrails, tier monotonicity, empty-state, apex gate line, deviation formatting), and live integration smoke against TX / FL / CA returns non-empty across all 3 sections of the report.

## Verification (already executed pre-plan)

### Row counts (live prod, 2026-04-26)
| Table | Rows |
|---|---|
| `judge_demographics` | 1,126 |
| `outcome_benchmarks` | 19 |
| `motion_outcome_rates_by_circuit` | 237 |
| `ussc_districts` | 94 |
| `judge_disposition_profile` | 983 |
| `ussc_sentencing_all` | 739,213 |

### Resolver smoke (mirrors `queryCourthouseIntelligence` logic exactly)
| State | Circuit | Districts | Judges | Circuit motions | USSC sample |
|---|---|---|---|---|---|
| TX | 5 | 4 | 10 | 5 | 5 |
| FL | 11 | 3 | 10 | 5 | 5 |
| CA | 9 | 4 | 10 | 5 | 5 |

All 3 sample states return non-empty across all 3 report sections.

### RLS posture
- Anon client returns ERROR (denied) on every dependency table — same posture as sibling Tier 9 darks (`charge-authority-pack`, `motion-success-report`, `sentencing-fingerprint`).
- Resolver uses `createAdminClient()` (service-role) per the file header HARD constraint: "Service-role only; never exposed to anon."
- This is the correct posture, not a gap.

### Tests
- `courthouse-intelligence.test.ts`: 13/13 pass
- Full `src/lib/tier9-reports/__tests__/`: 145/145 pass (10 files)

## Changes

1. `src/lib/tiers.ts` — `district-court-intelligence`: `live: false` → `live: true`. Comment updated to flip note.
2. `src/lib/products.ts` — `district-court-intelligence`: `isActive: false` → `isActive: true`. Comment updated to flip note.

## What stays unchanged

- `price: 14700` ($147)
- `priceDisplay: "$147"`
- URL slug `district-court-intelligence`
- DB tier_slug `district-court-intelligence`
- Resolver / render code (already shipped 2026-04-23 in M5)
- Stripe wiring (Edge Function dispatches via slug; case at `generate.ts:277`)
- All test files

## Verification gate (post-edit)

- `tsc --noEmit --skipLibCheck` clean (clear `.next/types/` first)
- All tests still pass

## Cascade

- **Customers:** $147 instant courthouse intelligence becomes available; aggregate-only, UPL-clean.
- **Us:** another deferred Tier 9 dark closed; closeout pace mirrors D4.
- **Future-us:** sibling pattern (verify data + RLS + tests → flip both flags) is now repeatable for the remaining deferred darks.
- **Ecosystem:** raises the floor for "courthouse-aggregate intelligence" tier — competitors typically gate this behind 4-figure subscriptions.
- **Adjacent players:** Judge Question Brief $197 upsell is correctly cross-referenced; tier monotonicity preserved.

No node loses.
