# D4: Flip motion-success-report live — schema drift was already fixed

**Date:** 2026-04-26
**Class:** FEATURE (config flip + verification, multi-file)
**Source:** `docs/handoff/2026-04-26-product-audit-deferred.md` D4
**Audit reference:** Product audit P3#13 (motion-success-report — `judge_motion_outcome_rates.judge_id` schema drift)

## Problem

Product audit (PR #162) reported "schema drift" on `judge_motion_outcome_rates.judge_id` and ship-blocked motion-success-report by setting `live: false` + `isActive: false`.

VERIFIED 2026-04-26: the audit claim was based on stale info. The actual production schema has `author_id` (not `judge_id`), and every callsite in the codebase uses `author_id` correctly. The "drift" never existed in current code.

## Verification (completed 2026-04-26)

Ran live integration check against production Supabase (`jxjbjmgdukwkoclydqdr`):

| Check | Result |
|------|--------|
| `judge_motion_outcome_rates.author_id` query | succeeded, 3 sample rows returned with valid filed/granted/rate |
| Distinct authors with `filed_count >= 10` | 652 (sampled 2000 rows) |
| `motion_outcome_rates` for `dui-dwi` | 14 rows |
| `motion_outcome_rates` for `drug-trafficking` | 13 rows |
| `motion_outcome_rates` for `drug-possession-cocaine` | 10 rows |
| `motion_outcome_rates` `(all)` national baseline | 22 rows |
| `motion_outcome_rates_by_circuit` Cir-9 `(all)` | 19 rows |
| `entities_judges` → `cl_person_id` resolution | succeeds (5 sample judges with linked author IDs) |
| `charge_type_top_authorities` (`drug-trafficking`) | 7 rows |
| `citation_authority_criminal` fallback | 620,193 rows with `source_url` |
| Vitest suite `motion-success-report.test.ts` | 12/12 pass |

All three sections of the report (motion patterns, judge-specific patterns, top-cited authorities) have live data and the resolver returns rows for production-ready charge types. Where `charge_type_top_authorities` is sparse (dui, theft = 0 rows), the citation_authority_criminal fallback (620K rows) covers Section 3.

## Decision

PROCEED with flip. Schema drift claim is invalid; resolver works end-to-end against live data; tests pass.

## Changes

| File | Change |
|------|--------|
| `src/lib/tiers.ts` | `motion-success-report.live: false` → `true` |
| `src/lib/products.ts` | `motion-success-report.isActive: false` → `true` |

Both edits annotated with comment: `// 2026-04-26: flipped live — D4 verified schema + resolver e2e (audit P3#13 closed)`

## Unchanged

- Price: $197 (no change)
- URL slug: `motion-success-report` (no change)
- DB tier_slug: `motion-success-report` (no change)
- Edge Function generator: already deployed and live
- Render layer: existing tests pass

## Verification gates (post-flip)

1. `tsc --noEmit --skipLibCheck` clean (clear `.next/types` first)
2. `npx vitest run src/lib/tier9-reports/__tests__/motion-success-report.test.ts` — 12/12 green
3. Re-grep: both files agree (`live: true` AND `isActive: true`)

## Rollback

If post-flip metrics show resolver failure: revert by setting both flags back to `false`. No data writes; no migrations; cosmetic config flip only.
