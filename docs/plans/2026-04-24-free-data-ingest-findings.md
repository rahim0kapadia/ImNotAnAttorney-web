# Free-Data Ingest P0 — Findings (2026-04-24)

Session resumed from 8e26e321. Complete: OPP (33/33), FARS (2010-2024), Cal Bar (delta to 2026-04-24), Federal Register (delta to 2026-04-24).

## End-of-Session Row Counts (verified live against Supabase)

| Dataset | Table | Rows at start | Rows now | Delta |
|--------|--------|------:|------:|------:|
| Stanford Open Policing | `public.police_stops` | 144,959,467 | **187,397,678** | **+42,438,211** |
| NHTSA FARS crashes | `public.fars_crashes` | 473,590 | **509,887** | **+36,297** (2024) |
| NHTSA FARS persons | `public.fars_persons` | 1,249,530 | 1,337,856 | +88,326 |
| NHTSA FARS vehicles | `public.fars_vehicles` | 771,471 | 827,482 | +56,011 |
| CA Bar attorneys | `public.attorneys` | 1,076 | **1,773** | **+697** |
| CA Bar discipline events | `public.attorney_discipline_events` | 1,325 | **3,348** | **+2,023** |
| Federal Register CJ actions | `public.federal_register_actions` | 1,749 | **1,752** | **+3** |
| DPIC executions (scoped out) | `public.dpic_executions` | 1,662 | 1,662 | 0 |

FARS year span extended: **2010–2023** → **2010–2024**.

## OPP — Per-State Totals (new this session)

All 33 statewide agencies now populated. States loaded this wave (14 total):

| State | Rows | Duration |
|-------|------:|------:|
| ND | 274,773 | 0.8 min |
| NE | 9,031,494 | 18.6 min |
| NH | 239,357 | 0.9 min |
| NJ | 3,845,334 | 8.5 min |
| NV | 737,285 | 2.0 min |
| NY | 7,962,169 | 15.8 min |
| OR | 1,143,017 | 5.2 min |
| RI | 509,681 | 1.1 min |
| SC | 8,983,810 | 29.9 min |
| SD | 435,895 | 1.3 min |
| TN | 3,829,082 | 7.6 min |
| VA | 5,006,847 | 8.6 min |
| VT | 283,285 | 0.7 min |
| WY | 156,182 | 0.5 min |
| **Total wave** | **42,438,211** | **101 min** |

## Compute Tier

Start: XL (16 GB RAM). End: XL (re-upgraded after brief premature Medium downgrade — sibling FL-statute session in-flight, hard rule `decision-xl-until-bulk-complete` requires XL until all bulk done including FL statutes).

## Code-Review + Security-Audit Findings (both dispatched in parallel)

Full detail: [2026-04-24-free-data-ingest-review-findings.md](./2026-04-24-free-data-ingest-review-findings.md).

Fixed this session:
- **C2** Federal Register: `bulk-insert-justified` header added; per-row ON CONFLICT DO UPDATE is legitimate at 2k-rows/year scale.
- **C3** `ingest-openpolicing.mjs`: `windowsHide: true` on powershell `spawnSync`.
- **C4** Federal Register: removed outer BEGIN/COMMIT; per-row upserts are already atomic.
- **C5** `opp-psql-load.ps1`: entry-point whitelist regex on `$Agency`/`$StateCode`/`$Druid`/`$Csv` (SQL + command injection defense).
- **C5b** `ingest-openpolicing.mjs`: argv whitelist regex before interpolation.
- **W2** `scrape-calbar-discipline.mjs`: `__filename` TDZ fix on `--help` branch.
- **W3** `scrape-calbar-discipline.mjs`: `--limit` NaN guard.
- **W4** `scrape-calbar-discipline.mjs`: `WHERE order_date IS NOT NULL` filter (NULLS DISTINCT dup-guard).
- **W5** `ingest-federal-register.mjs`: `PER_PAGE` const replaces hardcoded 1000.
- **W6** `run-opp-sequential.mjs`: tcp_keepalives_* per cl-bulk-data-defensive #17.
- **W7** `ingest-openpolicing.mjs`: stale-cache min-size check (<1 MB rejected as 404-HTML body).
- **SUGGESTION** fetch timeout via `AbortSignal.timeout(30_000)` on Federal Register.

Deferred to follow-up PR (tracked):
- **C7** switch `.ps1` files to `PGPASSWORD` env var (modify `opp-load-all-remaining.ps1` which was active during this session).
- **W8** `pg-bulk-defaults.mjs` tier-safe defaults (shared library).
- **W9** capture stderr in orchestrators instead of `Out-Null`.
- **Pre-existing bug** `opp-load-all-remaining.ps1:248` — `$r['Pass']` on array (Write-Output leak in `Load-OneState` makes `$r` an array, not hashtable). Non-fatal because `$ErrorActionPreference='Continue'` — states load correctly but final summary reports `OK: 14 | FAILED: 602` (602 = leaked Write-Output strings). Fix: explicitly `$null =` or `| Out-Null` on function interior writes.

## Hard-Rule Compliance Checkpoints

- `cl-bulk-data-defensive #7` (tier-sized work_mem): opp-psql-load.ps1 sets 256 MB on XL (ceiling 1 GB) ✓
- `cl-bulk-data-defensive #17` (statement_timeout + tcp_keepalives): all bulk scripts set session vars ✓
- `cl-bulk-data-defensive #18` (COPY over per-row INSERT): OPP uses `\copy`, Cal Bar uses `bulkCopyRows`, FARS uses `bulkCopyRows`, Federal Register has `bulk-insert-justified` header ✓
- `cl-bulk-data-defensive #19` (csv-bulk-checked header): all 5 new ingest scripts + 2 modified scripts carry header ✓
- `decision-xl-until-bulk-complete`: XL maintained (after brief self-correction) ✓
- `no-hallucinated-legal-data`: Cal Bar stores `source_url` per row; Federal Register stores `html_url` + `pdf_url`; OPP stores `source_druid` ✓
- Port 5432 (session mode) for all bulk ✓
- Bootstrap mode: all free/public APIs (Stanford, NHTSA, Fed Reg, CA State Bar) ✓

## Out of Scope (sibling session)

- FL statute ingest (`scripts/ingest/seed-statutes-fl.mjs`, `scripts/ingest/lib/`, migration `20260423e`, docs plan `2026-04-23-state-statutes-scaling-findings.md`)
- FL Bar discipline scraper (new file `scripts/ingest/scrape-flbar-discipline.mjs` appeared mid-session — not in handoff list, leaving to sibling)
- Twitter queue post `2026-04-24-field-sobriety-test-standards-5103.md`
- Handoff doc `2026-04-23-crash-recovery-and-drift-cleanup.md`

## Next Session Hand-off Prompt

```
Finish the free-data P0 follow-up PR for ImNotAnAttorney-web at
  C:\Users\email\projects\ImNotAnAttorney-web\

Deferred findings from 2026-04-24 wave (in docs/plans/2026-04-24-free-data-ingest-review-findings.md):
- C7 switch three .ps1 orchestrators to PGPASSWORD env var
- W8 retune scripts/lib/pg-bulk-defaults.mjs defaults to tier-safe
- W9 capture stderr in orchestrators instead of Out-Null
- Pre-existing: opp-load-all-remaining.ps1:248 $r['Pass'] bug (Load-OneState Write-Output leak)

Verify current row counts against docs/plans/2026-04-24-free-data-ingest-findings.md before making any claims about table state.
```
