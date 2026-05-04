# Handoff: T5/T6 truth-check + delta-gate substrate work
Date: 2026-05-04 06:00 ET

## Task
Continuation of overnight data-leverage session. Filter-criminal-opinions.py (pid 882980) completed at 00:02 ET producing 19.8GB `opinions-criminal.csv`. Per wakeup-trigger: launch T6 charge-extractor + T5 judge-quotes linker in parallel. Mid-session pivoted to truth-check (user: "is this all being ingested?") which surfaced two substrate bugs.

## Approach
1. Launched T6 + T5 against `data/bulk-verify/cl-bulk/opinions-criminal.csv`
2. T5 hit immediate ENOENT (hardcoded `opinions-filtered.csv` path) → hot-fixed in-process + shipped PR #302
3. T5 finished step-2 with 0 author_id matches → diagnosed CL bulk CSV's non-standard `\"` escape vs. line-based quote-parity parser → handoff PR #303 → Sonnet executor rewrite via PR #304 MERGED
4. PR #298 (CI stub) merged to unblock 30+ pending PRs from verify-architecture gate
5. T6 ran 30min producing 5,154 "classified" claims → direct pg_stat_user_tables probe revealed only 264 actual UPDATEs (95% no-op) → killed T6, learning written, delta-gate handoff PR #305

## Files Modified
- `scripts/link-quotes-to-judges.mjs` — line 41 OPINIONS_CSV env override + full csv-parse rewrite (PRs #302/#304)
- `scripts/smoke-link-quotes-csv.mjs` — new smoke fixture (PR #304)
- `docs/handoffs/2026-05-04-t5-csv-parser-rewrite.md` — T5 rewrite plan (PR #303)
- `docs/handoffs/2026-05-04-t6-delta-gate-rewrite.md` — T6 delta-gate plan (PR #305)
- `~/.claude/projects/.../memory/learning-bulk-reclassify-needs-delta-gate-2026-05-04.md` — learning entry
- `~/.claude/projects/.../memory/MEMORY.md` — index updated
- `.tmp-session/probe-row-counts.mjs` — read-only count probe (kept as reference)
- `.tmp-session/probe-t6-stats.mjs` — direct-pg stat probe (kept as reference)
- `.tmp-session/probe-t6-target.mjs` — classified_opinions row probe

## PRs Shipped This Continuation
- `#298` MERGED (commit `f67282e5`) — CI stub unblocker
- `#302` CLOSED (superseded by #304)
- `#303` OPEN — T5 csv-parse rewrite handoff (CI re-running post-#298)
- `#304` MERGED (commit `eb4ed45b`) — T5 csv-parse rewrite (parser bug fixed)
- `#305` OPEN — T6 delta-gate rewrite handoff
- engine `#9` MERGED — AZ orchestrator (was already done)
- engine `#12` MERGED (commit `c094a833`) — NH orchestrator

## What Didn't Work
- Hot-edit + git-stash to share the T5 fix across the running process and the disk — fix on disk reverted before stash pop; running process unaffected (in-memory copy) but next launch would have failed again. Resolved by stash-pop.
- T5 line-based quote-parity parser — broken on CL bulk's `\"` escape. Produced false row boundaries (1.9M rows from 325M lines = 168 lines/row average vs. real <50). Yielded 0 author_ids. Now rewritten via csv-parse with `relax_quotes:true` + `escape:'\\'`.
- T6 against full historical CSV — 95% no-op rate. Script-reported "5,154 classified" was pattern-engine activity, not DB writes. `pg_stat_user_tables.n_tup_upd = 264` is the actual write count.

## DB-Verified Net Tonight
- `entities_statutes` +7,640 rows (statute PRs ✓)
- `doctrine_quotes` 835 rows (T10 per-batch flush ✓)
- `case_feature_vectors` 40,497 (matches 5/3 baseline + CA top-up)
- `judge_quotes` linkage: 0 net-new tonight (T5 parser bug — fix MERGED, ready for re-run)
- `classified_opinions` charges: 264 net-new (T6 killed at 5% yield)

## Remaining Steps (next session priority order)
1. **Re-run T5 against full 19.8GB CSV** with merged csv-parse parser:
   ```
   nohup node scripts/link-quotes-to-judges.mjs --apply > .tmp-session/t5-link-quotes-v2.log 2>&1 &
   ```
   Expect 10K-30K judge_id linkages (vs. tonight's 0).
2. **Run T5b aggregator** after T5 completes:
   ```
   node scripts/aggregate-judge-quotes-to-profiles.mjs --apply
   ```
3. **Implement T6 Option A delta gate** (per `docs/handoffs/2026-05-04-t6-delta-gate-rewrite.md`):
   - Add `loadAlreadyClassifiedClusters()` returning `Set<cluster_id>`
   - Skip per-row work when cluster in skip-set
   - Smoke 100K rows, expect ~95% skip rate
4. **Mass-merge ready PRs** post-#298 CI re-run:
   - Check `gh pr list --json number,mergeStateStatus` for CLEAN PRs
   - Auto-merge dedup deps `#264/#266/#269` to unblock dedup `#300`
5. **Re-probe NM Justia** (still 403 at 04:25 ET, ban exceeded 24-48hr window — may be permanent tier escalation)

## Verification
- `node .tmp-session/probe-row-counts.mjs` — confirms statute / quote / vector / doctrine counts
- `node .tmp-session/probe-t6-stats.mjs` — direct pg_stat for any classifier you launch (use this as ground truth, not script logs)
- `gh pr view <N> --json mergeStateStatus` — CLEAN means CI green + ready
- `SELECT COUNT(*) FROM judge_quotes WHERE judge_id IS NOT NULL` — should jump from 35,242 toward 50,000+ after T5 re-run
- After T6 delta-gate: re-run should report ~1.46M skipped immediately, with classify work only on net-new clusters

## Key Learnings (already in memory)
- `learning-bulk-reclassify-needs-delta-gate-2026-05-04.md` — always probe target population before bulk re-runs; trust pg_stat over script counters
- T5/T6 use different parsers (T6 had csv-parse already; T5 had broken line-based) — parser audit any sibling script that touches CL bulk CSV next session
