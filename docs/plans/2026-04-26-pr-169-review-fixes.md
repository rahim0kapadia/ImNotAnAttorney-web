# PR #169 Review Fixes — D3 Officer BG Check Coverage

Date: 2026-04-26
Branch: `fix/d3-officer-bg-check-coverage`
PR: #169

## Findings

2 CRITICAL + 3 WARN + 3 SUGGESTION from PR review.

### C1 — Caption uses array.length but query is .limit(20)

`src/lib/tier9-reports/render.ts:1193` decides "thin-state" via
`data.externalIntel.length < 50`, but `query.ts:880` caps that array at
`.limit(20)`. So caption fires for rich-coverage states (GA/CA/AZ ~239k
rows) where pre-purchase banner does NOT fire. Pre/post parity broken.

**Fix:** parallel COUNT query in `queryOfficerBackground`, store as
`externalIntelStateCount` on returned shape, render gate uses real count.

### C2 — Ambiguous NYPD asymmetry

Caption only suppresses on `status==="single"`. Pre-purchase banner
suppresses on ANY NYPD roster match (`nypdOfficers > 0`, including
ambiguous). Customer in NY with ambiguous match sees no banner but DOES
see caption.

**Fix:** mirror the AvailabilityChecker condition exactly — caption
suppressed when CPD or NYPD has any data presence (`data.cpd != null` /
`data.nypd != null`).

### W1 — Misleading "nationwide" count

`coverage.officers` is state-filtered first; banner mislabels as
"nationwide".

**Fix:** expose `officersState` and `officersNationwide` separately
in `coverage.ts`; banner uses the right one for the right label.

### W2 — Serial COUNT query adds latency

The new external-intel COUNT runs serially after the reliability
lookup on hot-path checkout endpoint.

**Fix:** move into the existing `Promise.all` block at the top of
`checkOfficerCoverage`, alongside the new state/nationwide reliability
counts from W1.

### W3 — Caption placement orphaned

Caption appended AFTER per-officer block but BEFORE External Intelligence.
On 0-row states with only nationwide name matches, caption renders mid-
report before a non-existent section.

**Fix:** move caption to render at top of `renderOfficerBackground`
right after first section opens, when thin-state condition met.

### S1 — Test pre/post parity directly

Existing tests assert local boolean, not production gating. Caption
condition + bug C1 not caught.

**Fix:** add `renderOfficerBackground` test calling render directly
with thin-state mock data. Add parity tests for thin-state, rich-state,
thin+CPD, thin+NYPD, thin+ambiguous-NYPD scenarios.

### S2 — Document coverage shape

`CoverageResult.coverage` is `Record<string, number>` — add JSDoc
listing well-known keys.

### S3 — Hoist slug literal

Extract `slug === 'officer-background-check'` to a const at top of
component, parallel to existing `isSimilarCases`.

## Files Changed

- `src/lib/tier9-reports/query.ts` — interface field + parallel COUNT
- `src/lib/tier9-reports/render.ts` — caption gate uses count not length;
  CPD/NYPD presence parity; placement at top
- `src/lib/tier9-reports/coverage.ts` — `officersState` +
  `officersNationwide`; Promise.all batching; JSDoc keys
- `src/components/tier9/AvailabilityChecker.tsx` — `isOfficerBgCheck`
  hoisted; banner reads correct count
- `src/lib/tier9-reports/__tests__/officer-coverage.test.ts` — parity
  scenarios
- `tests/lib/officer-render.test.ts` — caption rendering tests

## Verification

- `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck` clean
- `npx vitest run src/lib/tier9-reports/__tests__/officer-coverage.test.ts`
- `npx vitest run tests/lib/officer-render.test.ts`
- Existing tier9 suites green

## Cascade

- us: PR #169 merges clean, parity contract enforced
- direct counterparty (customer): no false captions in rich-coverage
  states; ambiguous-NYPD sees consistent disclosure
- downstream (future Tier 9 SKUs): coverage-shape JSDoc compounds
- ecosystem: pre/post parity pattern documented for replication
- future-us: parity tests catch regressions before they hit prod
