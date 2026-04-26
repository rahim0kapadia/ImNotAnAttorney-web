# D6 — officer_external_intel status union (PR #164 sibling gap)

**Date:** 2026-04-26
**Branch:** `fix/d6-officer-external-intel-status`
**Class:** FEATURE (3 files: query.ts, render.ts, test file)

## Worry verbatim (from `docs/handoff/2026-04-26-product-audit-deferred.md`, D6)

> PR #164 hardened the agency_incidents resolver. Reviewer noted `officerResult.error`
> in the same file (`src/lib/defense-intelligence/query.ts:506`) is also unhandled —
> silent swallow if `officer_external_intel` errors.
>
> Apply the same status-union pattern to officer_external_intel queries.
> Add officerStatus union ("ok" | "no_officers" | "data_unavailable").
> Update arrest-survival-kit + officer-background-check renderers.
> Add tests covering the table-missing case for officer_external_intel.

## Reference pattern

PR #164 introduced for agency_incidents:

- `AgencyIncidentsStatus = "ok" | "no_incidents" | "data_unavailable"`
- `PGRST_RELATION_NOT_FOUND = "PGRST200"` constant
- Branch on `result.error` (with PGRST200 → console.warn, else console.error → all map to `data_unavailable`)
- Branch on empty rows → `no_incidents`
- Otherwise → `ok` + populated rows
- Renderer renders three message variants
- 5 unit tests cover the matrix

This PR mirrors the same pattern byte-for-byte structurally, swapping `agency` → `officer`.

## Files to modify

### 1. `src/lib/defense-intelligence/query.ts`

- Add type `OfficerStatsStatus = "ok" | "no_officers" | "data_unavailable"`.
- Extend `ArrestSurvivalKitData.officerStats` to include `status: OfficerStatsStatus`.
- In `queryArrestSurvivalKit` after `Promise.all`, mirror the agency_incidents handling for `officerResult`:
  - PGRST200 → console.warn → `data_unavailable`
  - other errors → console.error → `data_unavailable`
  - empty rows → `no_officers` (officers stays `[]`)
  - populated rows → `ok` + officers populated
- Pass `status: officerStatsStatus` into the returned `officerStats` object alongside the existing aggregates (totalAgencies/totalOfficers/wanderingOfficerCount remain — they compute correctly from `[]` in `data_unavailable`/`no_officers` branches).

### 2. `src/lib/tier9-reports/render.ts`

- Update arrest-survival-kit "Officer Intelligence Coverage" block (currently renders only when `data.officerStats.totalOfficers > 0`) to handle the 3 status branches:
  - `'data_unavailable'`: clinical message —
    `Officer-data is not yet available for this jurisdiction. This section will be enriched when local data sources are ingested.`
  - `'no_officers'`: clinical message —
    `No officer reliability records found for this state's available agencies.`
  - `'ok'`: existing render (totalAgencies, totalOfficers, wanderingOfficerCount)

### 3. `src/lib/defense-intelligence/__tests__/query-arrest-survival-kit.test.ts`

Append a second describe block `queryArrestSurvivalKit — officerStatsStatus` mirroring the agency tests:

1. PGRST200 on officer_external_intel → `officerStatsStatus = 'data_unavailable'`, totalOfficers = 0
2. Unexpected error (e.g., `code: "PGRST500"`) → `'data_unavailable'`
3. Empty rows → `'no_officers'`, totalOfficers = 0
4. Populated rows → `'ok'`, totalOfficers > 0, aggregates correct
5. Independence: agency-error doesn't affect officer status (agency `data_unavailable` + officer `ok` co-exist)

## Out of scope

- The `officer-background-check` resolver (different file path; D3 already touched it under a separate PR).
- Any data ingestion (D3 covers ingestion gaps).
- Renaming/refactoring beyond what the status branch demands.

## Success criteria

- `tsc --noEmit --skipLibCheck` is clean (0 errors).
- `vitest run src/lib/defense-intelligence/__tests__/` passes 100% (existing 5 + new 5).
- `tests/lib/officer-render.test.ts` does not exist in repo (per Glob); skip — `.next/types` clear + tsc + vitest = sufficient.
- PR description references PR #164 as the pattern source.

## Cascade

- us: same hardening pattern applied uniformly across both Promise.all branches; future regressions caught at edit-time.
- defendants: when officer_external_intel ingestion lags, the report explains "not yet available" instead of silently rendering empty rows that look like "no problem officers found."
- future-us: the type union becomes the precedent for similar Promise.all pairs in this file.
- ecosystem: the status-union pattern publishable as the canonical PostgREST relation-missing handling.
- No node loses.
