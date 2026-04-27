# D-T2: Charge Authority Pack — Flip Live (2026-04-26)

## Context

Second of the deferred Tier 9 darks closeout (after D-T1 District Court Filing Snapshot).
Product was built and merged earlier in the data-to-product wave but parked at
`live: false` + `isActive: false` pending live-data verification. Today's verification
confirms both data sources are populated and the resolver returns non-empty results
for sample charges.

## Verified data state (2026-04-26)

| Source | Rows | Used by resolver |
|--------|------|------------------|
| `charge_type_top_authorities` | 548 | Primary — Step 1 |
| `citation_authority_criminal` | 620,193 | Fallback — Step 2 |
| `authority_quotes_criminal` | 254 | Enrichment — Step 3 |
| `citation_velocity_criminal` | 1.13M | Enrichment — Step 4 |

Live smoke (`scripts/smoke-charge-authority-pack.mjs`) confirms:
- `dui` → 10 rows, top: State v. Toohill (seminal, 52 cites), URL present
- `drug-trafficking` → 10 rows, top: State v. Benitez (frequent, 8 cites), URL present
- `theft` → 10 rows, top: State v. Toohill (seminal, 72 cites), URL present
- Fallback table populated (Ashcroft v. Iqbal, Twombly, Anderson — all with URLs)

Unit tests: 13/13 pass (`vitest run src/lib/tier9-reports/__tests__/charge-authority-pack.test.ts`).

## Changes

1. `src/lib/tiers.ts` — `charge-authority-pack.live: false → true`
2. `src/lib/products.ts` — `charge-authority-pack.isActive: false → true`

No price change ($97). No URL slug change. No DB tier_slug change. No code-path
changes — resolver is unchanged from merged spec.

## Verification

- `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck` — must be 0 errors
- `node node_modules/vitest/vitest.mjs run src/lib/tier9-reports/__tests__/charge-authority-pack.test.ts` — must pass

## Mirrors

D-T1 District Court Filing Snapshot flip (same day, same pattern).

## Cascade

- Defendant: $97 entry-tier authority pack now purchasable (top-10 must-cite precedents)
- INAA: revenue unblocked on already-built SKU
- Future-us: clears another deferred-tier closeout from the audit punch-list
- Ecosystem: better-cited defense filings raise the floor on pro-se quality
