# D-T4: Ship arrest-survival-kit — derive `agency_incidents` view + state-coverage banner

**Date:** 2026-04-26
**Class:** FEATURE (migration + multi-file flip + tests)
**Source:** `docs/handoff/2026-04-26-product-audit-deferred.md` D-T4
**Audit reference:** Product audit P0#1 — `agency_incidents` table missing in prod, arrest-survival-kit DARK

## Worry

`arrest-survival-kit` ($47) was scoped against a hypothetical `agency_incidents` table. The audit found:

- The table does not exist in production.
- No ingestion script was ever written for it.
- The resolver `queryArrestSurvivalKit` returns `agencyIncidentsStatus = "data_unavailable"` for every customer.
- D6 (PR #164 sibling pattern) added the status union but the underlying data still has nowhere to come from.

Result: the SKU is shipped at `live: false` / `isActive: false` and customers cannot purchase.

## Decision (cascade-mapped)

We do NOT need a new ingestion. `officer_external_intel` (454,288 rows, already loaded) carries the same agency-level fields the resolver expects:

| Field | officer_external_intel column | Aggregation in view |
|---|---|---|
| `state` | `state` (text, ISO-2) | GROUP BY |
| `agency` | `agency` (text) | GROUP BY |
| `use_of_force_count` | `use_of_force_count` (int) | SUM |
| `complaint_count` | `complaint_count` (int) | SUM |
| `sustained_complaints` | `sustained_complaints` (int) | SUM |
| `source_urls` | `source_urls` (text[]) | DISTINCT-flattened ARRAY_AGG |

Verified live (2026-04-26):
- 454,288 rows total in `officer_external_intel`.
- 5,342 rows have `use_of_force_count > 0` — these are the rows the view will surface.
- Per-state UoF-positive counts: GA=235, CA=370, TX=445, NY=103, HI=8, AZ=96, FL=214, IL=154.
- `complaint_count` is currently 0 across all rows (NPI baseline; will populate when CCRB/CPD enrichment lands per existing roadmap).

Approach: ship `agency_incidents` as a `CREATE OR REPLACE VIEW` (zero ingestion, replay-safe, zero risk to source data). Filter via `HAVING SUM(use_of_force_count) > 0 OR SUM(complaint_count) > 0` so empty-officer-roster rows are not surfaced as bogus "agencies."

D6 status union (`ok` / `no_incidents` / `data_unavailable`) handles graceful degradation — the resolver flips from `data_unavailable` to `ok` (states with rows) or `no_incidents` (states without) automatically once the view exists.

D3 (PR #169) shipped a state-coverage banner for `officer_external_intel`. The same coverage gap applies here since the view is over the same source. Adding a thin-state banner for arrest-survival-kit mirrors the D3 pattern with threshold 50 rows.

### Cascade

- Us / future-us: deferred SKU ships at $0 incremental ingestion cost; same data powers two products (officer-bg-check + arrest-survival-kit).
- Direct counterparty (defendant): rights checklist ships universal + agency context for major states + transparent banner when state coverage is thin. Pre-purchase honesty.
- Downstream (attorney consult): defendant arrives with named local agencies + UoF context tied to public sources.
- Ecosystem: invisible.institute (NPI) gets cited as source on every agency card. Their data drives a paid product, raising the floor for transparent-policing infrastructure.
- Adjacent players: any future legal-tech building on NPI inherits the same precedent — bulk public dataset, clear citation.

## Changes

### Migration (new)

| File | Purpose |
|------|---------|
| `supabase/migrations/20260426a_agency_incidents_view.sql` | `CREATE OR REPLACE VIEW agency_incidents` over `officer_external_intel` rolled up by `(state, agency)` with SUM aggregates and ARRAY_AGG source_urls. Idempotent. |

Apply via Supabase Management API (`scripts/apply-via-management-api.mjs` pattern).

### Code

| File | Change |
|------|---------|
| `src/lib/tier9-reports/coverage.ts` | Extend `checkArrestKitCoverage` with `agencyIncidentsState` count + thin-state surfacing (D3-mirror). |
| `src/components/tier9/AvailabilityChecker.tsx` | Add arrest-survival-kit thin-state banner condition (`isArrestKit && agencyIncidentsState < 50`). |
| `src/lib/tier9-reports/render.ts` | Caption when state coverage thin (mirror D3 `renderFederalFallbackNote` / D6 status pattern); existing `agencyIncidentsStatus` branches stay as-is. |
| `src/lib/tiers.ts` | `arrest-survival-kit.live: false` → `true` |
| `src/lib/products.ts` | `arrest-survival-kit.isActive: false` → `true` |

Both flag flips annotated: `// 2026-04-26: flipped live — D-T4 agency_incidents view shipped + state-coverage banner (audit P0#1 closed)`

### Tests

| File | Change |
|---|---|
| `src/lib/defense-intelligence/__tests__/query-arrest-survival-kit.test.ts` | No changes needed — existing mocks cover all three status paths (`ok`, `no_incidents`, `data_unavailable`); the view simply makes `ok` reachable in prod. |
| `src/lib/tier9-reports/__tests__/coverage.test.ts` (extend if exists) | Add coverage test for `agencyIncidentsState` thin-state branch. |

## Out of scope

- Changing `officer_external_intel` ingestion path (D-something else).
- Stripe price changes ($47 holds).
- URL slug changes (`/arrest-survival-kit` holds).
- DB `tier_slug` changes (`arrest-survival-kit` holds).
- Adding new data sources (Fatal Encounters, MPV) — the existing copy says "Fatal Encounters" but the underlying source is NPI; existing render.ts text retained for compatibility, future enrichment is a separate plan.
- Promoting `complaint_count` aggregation as a sales claim — it's 0 across all rows today, so the view exposes the field but the renderer continues to show only UoF until CCRB enrichment lands.

## Success criteria

1. Migration applied: `SELECT COUNT(*) FROM agency_incidents` returns > 0.
2. Major states (GA, CA, TX, NY) return rows when filtered on state.
3. Resolver `queryArrestSurvivalKit('GA')` returns `agencyIncidentsStatus: "ok"` with non-empty `agencyIncidents`.
4. Thin-state banner fires for low-coverage states (e.g. HI with 8 rows).
5. `arrest-survival-kit.live === true` AND `arrest-survival-kit.isActive === true`.
6. `tsc --noEmit --skipLibCheck` clean.
7. Existing tier9 + defense-intelligence tests pass.

## Rollback

If post-flip telemetry shows resolver failure or banner false-positives: revert by setting both flags back to `false` and dropping the view (`DROP VIEW agency_incidents`). View is non-destructive; no source data touched.
