# Free-Data Ingest — Review Findings (2026-04-24)

Parallel dispatch of `security-auditor` + `code-reviewer` on the 9 scoped files. Living record of findings + resolution. Pristine-or-nothing: every finding has a disposition (FIX / ACCEPT + rationale / DEFER + tracked).

## Scope

| Severity | Count |
|----------|-------|
| CRITICAL | 7 |
| WARNING | 17 |
| SUGGESTION | 9 |

## Dispositions

### CRITICAL

| # | File:line | Finding | Disposition |
|---|-----------|---------|-------------|
| C1 | `ingest-openpolicing.mjs:63-72` | 9 statewide agencies share `druid='yg821jf8611'` — concern is silent wrong-state tagging | ACCEPT + FIX SEMANTIC: `state_code` is hardcoded per-entry (not DRUID-derived), so no cross-state contamination. Current OPP orchestrator uses `opp-psql-load.ps1` DuckDB path (not this manifest). `source_druid` stored value may be shared across states — INFO loss only, not data corruption. Add comment clarifying shared DRUID is legit Stanford Digital Repository container. |
| C2 | `ingest-federal-register.mjs:122-142` | Per-row INSERT inside loop violates cl-bulk-data-defensive #18 | **FIX**: add `// bulk-insert-justified:` header. ON CONFLICT DO UPDATE with per-row jsonb storage is legitimate non-bulk pattern for this small (~2k rows/year) API source. |
| C3 | `ingest-openpolicing.mjs:138` | `spawnSync('powershell', ...)` missing `windowsHide: true` → conhost flash | **FIX**: add `windowsHide: true` per draft rule enforce-windowshide. |
| C4 | `ingest-federal-register.mjs:106,143` | Single BEGIN/COMMIT wraps multi-minute upsert loop; on >30min timeout, ALL upserts rollback | **FIX**: remove outer BEGIN/COMMIT; each INSERT ON CONFLICT DO UPDATE is already atomic. |
| C5 | `opp-psql-load.ps1:28,51,183,259` | SQL identifier interpolation from `$Agency` / `$StateCode` / `$Druid` / `$Csv` params — operator-only script but SQLi class | **FIX**: add regex whitelist validation at script entry. `Agency: ^[a-z0-9_]+$`, `StateCode: ^[A-Z]{2}$`, `Druid: ^[a-z0-9]+$`, `Csv`: resolve + existence check. |
| C6 | `opp-finish-queue.ps1:99`, `opp-load-all-remaining.ps1:102,210,222,259` | Same SQL interpolation pattern in orchestrators | ACCEPT: orchestrators construct from hardcoded manifest (no argv). Whitelist at opp-psql-load.ps1 entry (C5) covers the downstream risk. |
| C7 | Three `.ps1` files | DB password visible in `psql` CLI via `$dbConnStr` | **FIXED 2026-04-24 (post-orch)**: All three `.ps1` files (`opp-psql-load.ps1`, `opp-finish-queue.ps1`, `opp-load-all-remaining.ps1`) now parse `SUPABASE_DB_URL` once at top, set `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE/PGSSLMODE` env vars, then call `& $psql -c ...` with no conn-string arg. Verified live: `psql` connects + queries DB (`SELECT 1+2 AS check, current_database()` → `3|postgres`). |

### WARNING (selected — full list below)

| # | File:line | Finding | Disposition |
|---|-----------|---------|-------------|
| W1 | `ingest-openpolicing.mjs:339` | `statementTimeout: '2h'` + INSERT..SELECT on stage→police_stops for 20M+ rows (gotcha #15 CTAS pattern preferred) | ACCEPT: OPP largest statewide is ~30M; current runs have succeeded. CTAS swap is future optimization. Tracked. |
| W2 | `scrape-calbar-discipline.mjs:89` | `__filename` TDZ on `--help` branch | **FIX**: move `__filename` decl before `parseArgs()`. |
| W3 | `scrape-calbar-discipline.mjs:87` | `--limit` last-arg = `parseInt(undefined) = NaN` → silent-no-op | **FIX**: guard `if (Number.isNaN(out.limit)) throw`. |
| W4 | `scrape-calbar-discipline.mjs:411` | NULLS DISTINCT on composite unique key → duplicate rows with NULL dates | **FIX**: skip rows with null `order_date` before INSERT. |
| W5 | `ingest-federal-register.mjs:63` | Hardcoded `1000` vs `per_page` var | **FIX**: extract const. |
| W6 | `run-opp-sequential.mjs:42` | Missing tcp_keepalives per #17 | **FIX**: add tcp_keepalives_* even on probe client. |
| W7 | `ingest-openpolicing.mjs:119` | Stale-cache accepts any non-zero zip (404-HTML-body) | **FIX**: minimum size check (>1MB for statewide CSV zips). |
| W8 | `pg-bulk-defaults.mjs:46-48` | Default `maintWorkMemMB=1024` is XL-only | **FIXED 2026-04-24**: defaults now resolved from a tier table keyed off `SUPABASE_COMPUTE_TIER` env (or `opts.tier`). Conservative `small` fallback when env unset. Hard ceiling check throws on explicit override above `RAM/16` (work) or `RAM/4` (maint). 5 smoke cases pass: xlarge default, small explicit, micro+256 throws with correct ceiling, `ci_xlarge` variant, unknown→fallback+stderr-warn. `.env.local` + `.env.example` updated with the new var. |
| W9 | Three `.ps1` files | `2>&1 \| Out-Null` swallows stderr | **FIXED 2026-04-24 (post-orch)**: orchestrators write to `C:\Users\email\AppData\Local\Temp\opp-load\opp-{finish-queue\|load-all-remaining}-<ts>.log`. All `& $psql ... 2>&1` and child `& powershell ... 2>&1` now `Out-File -FilePath $orchLog -Append`. Errors preserved + visible in log; orchestrator pipeline no longer polluted. |
| W10 | `opp-psql-load.ps1:38` | `work_mem='256MB'` hardcoded for XL | ACCEPT: header documents XL-verified; guard via `REQUIRE_XL` env deferred. |

### SUGGESTION

Rolled up into a single note in the findings doc: user-agent contact consideration, Test-Archive on zip cache, timeout wrappers on fetch, retry-on-curl-transient. All LOW impact, all DEFERRED post-PR.

## Files Being Modified This Session

| File | Status | Changes |
|------|--------|---------|
| `ingest-federal-register.mjs` | Not in-flight | C2, C4, W5 |
| `ingest-openpolicing.mjs` | Not in-flight (orchestrator uses ps1 path) | C3, W7, + AGENCY whitelist |
| `scrape-calbar-discipline.mjs` | Not in-flight | W2, W3, W4 |
| `opp-psql-load.ps1` | **In-flight** (called per-state by orchestrator) | C5 entry whitelist — applied between state invocations |
| `run-opp-sequential.mjs` | Not in-flight | W6 |
| `opp-load-all-remaining.ps1` | **ACTIVE ORCHESTRATOR** | DO NOT MODIFY until orchestrator exits |
| `opp-finish-queue.ps1` | Not called | Leave untouched (unused parallel path) |
| `diag-supabase-resource-audit.mjs` | Pending deletion | No fixes (slated for delete) |
| `run-fars-backfill.mjs` | Not in-flight | No required fixes (false alarm on windowsHide per reviewer walkback) |

## Post-Orchestrator Fix Queue (applied after all OPP states done)

| Item | Status |
|------|--------|
| C7: switch `.ps1` files to `PGPASSWORD` env var | **DONE 2026-04-24** |
| W9: capture stderr to log instead of `Out-Null` | **DONE 2026-04-24** |
| W8: retune `pg-bulk-defaults.mjs` defaults to tier-safe | **DONE 2026-04-24** |
| Bug: `Load-OneState` pipeline pollution causing bogus `FAILED:602` | **DONE 2026-04-24** (interior `Write-Output` → `Write-Host`; child `& powershell ... 2>&1` → `Out-File $orchLog -Append`) |

## Convergence

Single review round; worry-to-pristine skipped as wrong shape for mechanical ingest.

**2026-04-24 closing state:**
- Live row counts re-verified at follow-up commit time: `police_stops=187,397,678 / 33 agencies`, `fars_crashes=509,887`, `fars_persons=1,337,856`, `fars_vehicles=827,482`, `attorneys=1,842`, `attorney_discipline_events=3,417`, `federal_register_actions=1,752`. Compute tier `ci_xlarge` (16 GB RAM) — held per `decision-xl-until-bulk-complete`.
- All CRITICALs from the original audit either FIXED in the wave 2 PR (b794097d) or in this follow-up.
- All deferred WARNINGs (C7 / W8 / W9) and the `Load-OneState` bug now FIXED + verified (npm build green, ps1 parser clean, lib smoke 5/5).
- `npm run build` exit 0; `Parser::ParseFile` clean on all three `.ps1`; `psql` env-var path connects + queries live DB.
