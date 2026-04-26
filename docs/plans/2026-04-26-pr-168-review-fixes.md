# PR #168 Review Findings Fix Plan

**Branch:** `fix/d2-similar-cases-state-coverage`
**Date:** 2026-04-26
**Source:** PR #168 review — 4 WARN + 3 SUG findings
**Pristine-Or-Nothing:** every finding fixed, no severity-based skip.

## Findings to fix

### W1 — Sentencing state count corrected (7 states + federal, was incorrectly 8)

The query.ts comments at lines 342 and 990 claim "8 states + federal" but
actually enumerate only seven ISO codes (AZ, DE, IL, MI, NE, VA, WI).
The numeric codes seen elsewhere in `sentencing_distributions.jurisdiction`
are federal-district codes, not US states.

**Files:**
- `src/lib/tier9-reports/query.ts` lines 339-344, 989-990 — comment fix
- Add a `SENTENCING_SUPPORTED_STATES` Set near the federal-fallback block
  with the seven ISO codes for future single-source-of-truth use.

### W2 — AvailabilityChecker banner covers sentencing-state gap too

Banner currently only fires on `pleaState===0 && pleaFederal>0`. A
defendant with state plea data but no state sentencing data sees the
federal-fallback caption inside the rendered report's sentencing
section without pre-purchase disclosure.

**File:** `src/components/tier9/AvailabilityChecker.tsx`
**Fix:** Branch on coverage shape:
- both plea + sentencing missing state → combined banner copy
- only plea state missing → existing copy
- only sentencing state missing → new sentencing-only copy

### W3 — Don't show pleaFederal in coverage list when pleaState>0

When `pleaState>0`, the report only consumes state plea data — showing
`pleaFederal: N` in the dl grid implies it's separate, used inventory.
Same logic for `outcomeNational` when state-level data covers the path.

**File:** `src/components/tier9/AvailabilityChecker.tsx`
**Fix:** Filter `pleaFederal` from `entries` when `pleaState>0`. Filter
`outcomeNational` only when sentencing or plea fall back.

### W4 — Test asserts federal query NOT issued on state-data path

Existing "pleaSource === 'state'" test never verifies the federal
fallback query was skipped. A regression that always fires both
queries would silently pass.

**File:** `src/lib/tier9-reports/__tests__/similar-cases-fallback.test.ts`
**Fix:** Add `expect(queryLog.filter(q => q.table === 'plea_discount_curves').length).toBe(1)`
in the state-source test. Mirror for sentencing-state path.

### S1 — renderFederalFallbackNote helper extracted (DRY render.ts captions)

Two near-identical caption blocks at lines 1319-1325 and 1367-1373.
Same inline style, only differ in section label.

**File:** `src/lib/tier9-reports/render.ts`
**Fix:** Extract `renderFederalFallbackNote(stateCode: string, sectionLabel: string): string`
helper at the top of file. Both caption sites call helper.

### S2 — Error-path test (table-missing → pleaSource='none')

Production code has `vectors.count ?? 0` defensive coalesce but no
test exercises the supabase-error path.

**File:** `src/lib/tier9-reports/__tests__/similar-cases-fallback.test.ts`
**Fix:** Add test where the supabase mock returns
`{ data: null, error: { code: 'PGRST200' }, count: null }` for
`plea_discount_curves`. Assert pleaSource === 'none'.

### S3 — stateNameOrCode normalizes fallback to uppercase

`stateNameOrCode("XY")` returns "XY", `stateNameOrCode("xy")`
returns "xy" — inconsistent fallback case for unknown codes.

**File:** `src/lib/states.ts`
**Fix:** Uppercase the fallback return; JSDoc note "case-insensitive
lookup; fallback returns uppercase".

## Verification

- `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck` — 0 errors
- `npx vitest run src/lib/tier9-reports/__tests__/similar-cases-fallback.test.ts`
  — all green including new error-path test (W4 + S2 add new assertions)
- Existing tier9 suite still 115/115

## Cascade

- us: PR ships pristine, no review-debt rolling forward
- direct counterparty (defendant in 38 unsupported states): pre-purchase
  disclosure when state sentencing data is missing too — no surprise inside
  the rendered report
- downstream (future Tier 9 SKUs hitting same coverage cliff):
  `renderFederalFallbackNote` helper + `SENTENCING_SUPPORTED_STATES` Set are
  reusable
- future-us: tests now lock in the federal-query-skip invariant; regression
  protection compounds
- ecosystem: defensive states.ts pattern (uppercase fallback) generalizes
- No node loses.

## Commit

Single commit on top of existing branch with the message specified by the
session prompt.
