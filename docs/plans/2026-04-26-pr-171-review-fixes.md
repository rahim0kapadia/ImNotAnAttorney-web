# PR #171 Review Fixes — D5 FJIB Circuit Coverage

Date: 2026-04-26
Branch: `fix/d5-fjib-circuit-coverage`
Findings: 2 WARN + 3 SUG (5 total — pristine-or-nothing closure)

## Why this exists

PR #171 shipped the circuit-coverage banner for the Federal Jury Instruction
Brief ($97 SKU). Review found 5 follow-ups that gate against post-purchase
disappointment and a couple of latent bugs. Closing all five before the merge
preserves the pre/post-purchase parity contract that D2/D3/D5 share.

## W1 — Charge-specific PJI count

**Problem.** `checkFJIBCoverage` only counts ALL PJI rows in the user's
circuit. The resolver in `queryFederalJuryBrief` filters those rows by
`statutePatterns` + `titleKeywords` and may find ZERO rows for the user's
charge even when the circuit has 44 unrelated PJI rows. Customer pays $97 and
sees a closest-match limitation post-purchase.

**Fix.**
- `checkFJIBCoverage(circuit, state, federalCharge?)` accepts a third arg.
- When `federalCharge` is supplied AND found in `FEDERAL_CHARGES`, run two
  additional Supabase counts:
  - `pjiInCircuitMatchingCharge`: rows in `v_pji_public` filtered by circuit
    AND title matching the charge's `titleKeywords` via PostgREST `or`
    ILIKE — the same server-side pre-filter used by `queryFederalJuryBrief`.
  - `pjiInAnyCircuitMatchingCharge`: same title filter, no circuit restriction.
- Title-keyword extraction reuses the regex-source-stripping logic already
  in `queryFederalJuryBrief` so the pre-filter shape stays identical (false
  negatives on statute-only matches are tolerable here — banner is pre-purchase
  disclosure, not the binding gate).
- The route layer calls `checkFJIBCoverage(rawCircuit || null, state, federalCharge)`.
- Banner rule (in `AvailabilityChecker.tsx`):
  - `pjiInAnyCircuitMatchingCharge === 0` (charge missing entirely): stronger
    banner.
  - `pjiInCircuitMatchingCharge === 0 && pjiInAnyCircuitMatchingCharge > 0`
    (charge exists in another circuit): existing closest-circuit banner.
- Tests cover both new branches.

## W2 — Waitlist row collision on circuit

**Problem.** `handleWaitlist(result, federalCharge, federalCharge)` uses
`federalCharge` as both `searchName` and `chargeTypeOverride`. Two customers
in VA — one waitlisting circuit-4, one explicitly picking circuit-2 — collide
on the unique key `(product_slug, search_name, search_state, email)`. The
upsert silently merges both into one row.

**Fix.** Change the FJIB case to call:
```ts
const waitlistKey = circuit
  ? `${federalCharge}|c${rawCircuit}`
  : `${federalCharge}|auto`;
return handleWaitlist(result, waitlistKey, federalCharge);
```
Search-name carries the circuit; `search_charge_type` stays `federalCharge`
so future operator filters by charge still work.

## S1 — FJB_CHARGES sync test

**Problem.** `FJB_CHARGES` (client) duplicates `FEDERAL_CHARGES` (server).
Drift = silent UI-vs-server mismatch.

**Fix.** Add a test in `fjib-coverage.test.ts` that imports `FEDERAL_CHARGES`
and the client-side slug list. Since `FEDERAL_CHARGES` lives in the FJIB
module (which imports `createAdminClient`), we extract the slug list to a
client-safe module: `src/lib/tier9-reports/fjib-charges.ts` exports
`FJB_CHARGE_SLUGS: readonly string[]` derived from `Object.keys(FEDERAL_CHARGES)`
at import time. The client imports the slug list from the new module; the
test asserts `FJB_CHARGES.map(c => c.value).sort()` equals
`[...FJB_CHARGE_SLUGS].sort()`. Drift trips the test on next edit.

Implementation note: `FEDERAL_CHARGES` itself is fine to read at import time
because it's a plain object literal — but the FJIB module also exports
`queryFederalJuryBrief` which imports the supabase admin client. We can't
let the client bundle pull that. So the new `fjib-charges.ts` module
re-exports JUST the slug list extracted at module load time, no admin imports.

## S2 — Fallback string grammar

**Problem.** When `matchedName` is null and circuit is empty, the banner
renders "Pattern jury instructions for the your are not yet ingested".

**Fix.** Replace `'your'` with `'this'` in the FJIB circuit-label fallback
in `AvailabilityChecker.tsx`.

## S3 — Tighten Promise.resolve type in coverage.ts

**Problem.** `Promise.resolve({ count: 0 } as { count: number | null })` does
not match the Supabase response shape (`{ count, data, error }`). Future
destructuring on the result tuple fails.

**Fix.** Change to
`Promise.resolve({ count: 0, data: null, error: null })`. Three call sites
in `checkFJIBCoverage` (W1 adds two more parallel queries that need the same
shape).

## Verification

- `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck`
  (clear `.next/types` first) — 0 errors
- `npx vitest run src/lib/tier9-reports/__tests__/fjib-coverage.test.ts`
  — all green
- `npx vitest run src/lib/tier9-reports/__tests__/` — full tier9 suite passes

## Files touched

- `src/app/api/check-availability/[slug]/route.ts` — W1 third-arg, W2 waitlist key
- `src/lib/tier9-reports/coverage.ts` — W1 charge-specific counts, S3 type tighten
- `src/lib/tier9-reports/fjib-charges.ts` — NEW client-safe slug list (S1)
- `src/components/tier9/AvailabilityChecker.tsx` — W1 new banner branch, S2 grammar, S1 import slugs
- `src/lib/tier9-reports/__tests__/fjib-coverage.test.ts` — W1 tests + S1 sync test

## Cascade (Pristine-Or-Nothing closure)

- Us: PR #171 merges clean; no carry-forward worry.
- Customer: pays $97 only when the report will actually find their charge in
  their circuit (W1) — not just any PJI in the circuit. Pre-purchase banner
  matches post-purchase reality.
- Operator: per-circuit waitlist rows (W2) so operator can prioritize by
  ingest target.
- Future-us: drift catcher (S1) blocks silent slug divergence on the next
  client/server edit.
- Ecosystem: pattern reusable for any future SKU using the same data-coverage
  banner shape.
