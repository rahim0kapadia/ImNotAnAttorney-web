# PR #162 review-finding fixes (2026-04-26)

## Context
PR #162 (`fix/audit-products-hygiene`) flips broken products to `isActive: false` per audit triage. Code review (sonnet) returned 3 valid findings (one was a line-mapping false positive — line 352 is `arrest-survival-kit`, not `motion-success-report`).

## Files to modify
1. `src/lib/tiers.ts` — `arrest-survival-kit` block (line 352): flip `live: true` → `live: false` to match products.ts isActive:false. Add reason comment.
2. `src/lib/products.ts` — `judge-profile` (line 339): `stripePriceId` placeholder string → `null`. Reason: placeholder was unverified in live Stripe mode; isActive:false is the only guard, defense-in-depth needs null ID.
3. `src/lib/products.ts` — `motion-opportunity-scan` (line 364): same null-out as above.
4. `src/lib/products.ts` — `arrest-survival-kit` entry: move the existing reason comment from before the opening `{` to immediately above the `isActive: false` line, matching the consistent placement pattern of the other flips in this PR.

## Files to create
None.

## Numbered tasks
1. Edit tiers.ts arrest-survival-kit live=false.
2. Edit products.ts judge-profile stripePriceId=null with comment.
3. Edit products.ts motion-opportunity-scan stripePriceId=null with comment.
4. Edit products.ts arrest-survival-kit comment placement.
5. Run tsc — must be 0 errors.
6. Commit with conventional message linking to review findings.
7. Push to update PR #162.

## Out of scope
- Other reviewer findings flagged on PR #163 + PR #164 (separate fix passes).
- Re-running PR #163 review (blocked by hook keyword issue, will re-spawn with opus).
- Documenting deferred audit items (Task #7).

## Cascade
- us: PR review findings closed → merge unblocked
- direct counterparty (Stripe webhook code): no orphan placeholder IDs → no spurious 4xx if isActive guard ever has a hole
- downstream (future operator): clear comment pattern → easier to review the next flip pass
- ecosystem: products.ts + tiers.ts back in agreement
- future-us: pristine baseline before more product additions
