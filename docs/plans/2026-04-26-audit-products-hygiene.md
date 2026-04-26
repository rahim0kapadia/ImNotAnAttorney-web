# Plan: Product Audit Hygiene — Flag Broken SKUs Dark + Dedupe + Drop dripSequenceKey

**Branch:** fix/audit-products-hygiene
**Audit source:** docs/plans/2026-04-26-product-audit-triage.md

## Files to Modify
- `src/lib/products.ts` — all changes below

## Files to Create
- `docs/plans/2026-04-26-audit-products-hygiene.md` — this plan

## Numbered Tasks

1. **P0#1** — Flip `arrest-survival-kit` isActive → false. `agency_incidents` table missing in prod; every paid order ships empty section.
2. **P2#10** — Flip `judge-profile` isActive → false. Stripe price ID unverified; header says ships dark per Wave 1 review.
3. **P2#11** — Flip `motion-opportunity-scan` isActive → false. Same reason as judge-profile.
4. **P2#12** — Align 4 flag-split products: `district-court-intelligence`, `motion-success-report`, `federal-jury-instruction-brief`, `charge-authority-pack`. Rule: conservative-false-wins. products.ts isActive must equal tiers.ts live; if either is false, both end up false.
5. **P4#15** — Delete `dripSequenceKey` field from StandaloneProduct interface and all product entries. Confirmed zero consumers outside products.ts.
6. **P4#16** — Dedupe 9 duplicate slug keys in STANDALONE_PRODUCTS. Confirmed: no duplicates exist in current file — task is a no-op, already clean.

## Verification
- `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck` must exit 0
- Each of the 9 Tier 9 slugs appears as key exactly once (already true)
