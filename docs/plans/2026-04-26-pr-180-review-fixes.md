# PR #180 Review Fixes — D-T4 Arrest Survival Kit

**Branch:** `fix/dt4-arrest-survival-kit-ship`
**Plan date:** 2026-04-26
**Pristine-Or-Nothing:** all 4 WARN + 5 SUG fixed in single commit (severity = ORDER, not SCOPE).

## Findings

| ID | Severity | Area | Fix shape |
|----|----------|------|-----------|
| W1 | CRITICAL ship-blocker | render copy | NPI/Invisible Institute attribution, drop fatalencounters.org link |
| W2 | CRITICAL ship-blocker | render copy | "use-of-force incident" replaces "fatal encounter" |
| W3 | WARN | threshold mismatch | data-shape pattern (mirror D3 `externalIntelStateCount`) — pass `agencyIncidentsStateCount` from coverage into renderer |
| W4 | WARN | view aggregation | LATERAL unnest over source_urls → handles multi-URL rows safely |
| S1 | SUG | migration atomicity | `CREATE OR REPLACE VIEW` (column-set unchanged); drop the DROP+CREATE |
| S2 | SUG | test rigor | assert `agency_incidents` table queried via queryLog mock |
| S3 | SUG | fallback chain | drop `coverage.agencies` fallback in AvailabilityChecker (paired data-flow with W3) |
| S4 | SUG | aliasing docs | inline comment explaining `agencies` vs `agencyIncidentsState` in coverage.ts |
| S5 | SUG | forward-compat | comment in migration + resolver about HAVING vs ORDER BY semantics |

## Phases

### Phase 1 — Code (W1, W2, S3, S4)
- `src/lib/tier9-reports/render.ts:2174-2175` — replace Fatal Encounters attribution with NPI/Invisible Institute. No external link (no canonical NPI URL).
- `src/lib/tier9-reports/render.ts:2191` — `${count} use-of-force incident${plural}`.
- `src/components/tier9/AvailabilityChecker.tsx:481-486` — drop `coverage.agencies` fallback; threshold now reads from real per-state count via data shape.
- `src/lib/tier9-reports/coverage.ts:340-345` — inline comment for `agencies` vs `agencyIncidentsState` aliasing.

### Phase 2 — Data shape (W3)
- `src/lib/defense-intelligence/query.ts` — add `agencyIncidentsStateCount: number` to `ArrestSurvivalKitData`. Run a parallel COUNT on `agency_incidents` filtered by state (mirrors D3 pattern at `src/lib/tier9-reports/query.ts:888-900`).
- `src/lib/tier9-reports/render.ts:2181` — gate caption on `data.agencyIncidentsStateCount < 50` (aligned with AvailabilityChecker).

### Phase 3 — Migration (W4, S1, S5)
- `supabase/migrations/20260426a_agency_incidents_view.sql`:
  - Replace DROP+CREATE with `CREATE OR REPLACE VIEW` (column-set unchanged) → atomic.
  - Replace `array_remove(array_agg(DISTINCT source_urls[1]), NULL)` with LATERAL unnest:
    ```sql
    ARRAY(
      SELECT DISTINCT u
      FROM unnest(array_agg(source_urls)) AS arr
      CROSS JOIN LATERAL unnest(COALESCE(arr, ARRAY[]::text[])) AS u
      WHERE u IS NOT NULL
    ) AS source_urls
    ```
    Actually a cleaner form using a subquery in SELECT is non-trivial inside a GROUP BY. Use:
    ```sql
    (
      SELECT array_agg(DISTINCT u)
      FROM unnest(array_agg(oei.source_urls)) AS sub(arr)
      CROSS JOIN LATERAL unnest(COALESCE(arr, ARRAY[]::text[])) AS u
      WHERE u IS NOT NULL
    ) AS source_urls
    ```
  - Add HAVING forward-compat comment (intentional surface of complaint-only agencies once data lands).

### Phase 4 — Resolver mirror comment (S5)
- `src/lib/defense-intelligence/query.ts` — add comment near agency_incidents query about ORDER BY use_of_force_count DESC and complaint-only forward-compat ordering.

### Phase 5 — Test (S2)
- `src/lib/tier9-reports/__tests__/arrest-kit-coverage.test.ts` — append a test that asserts `agency_incidents` was queried exactly once (data-flow lock).

### Phase 6 — Apply migration via Management API
- New script `scripts/apply-agency-incidents-view-rebuild.mjs` (one-shot, mirrors `scripts/apply-platform-posts-migration.mjs`).
- Run script. Verify post-rebuild perf (CA query <1s) via `EXPLAIN ANALYZE` round-trip.
- Verify row count unchanged (5,342 agencies).

### Phase 7 — Verify + commit + push
- `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck` (clean `.next/types` first) → 0 errors.
- `npx vitest run src/lib/tier9-reports/__tests__/arrest-kit-coverage.test.ts src/lib/defense-intelligence/__tests__/query-arrest-survival-kit.test.ts` → all pass.
- Single commit per task spec.
- `git push`.

## Cascade
- us: PR #180 ships pristine, no review-tail debt.
- direct counterparty (defendants in thin-coverage states): no overstated severity (W2), no mis-cited source (W1), pre-purchase + in-report disclosure aligned (W3).
- downstream (NPI / Invisible Institute): correctly credited as data source rather than misattributed competitor.
- ecosystem (legal data community): forward-compat HAVING + multi-URL aggregation lets enrichment land cleanly.
- future-us: data-shape pattern (W3) reuses D3 plumbing — no new infra.
