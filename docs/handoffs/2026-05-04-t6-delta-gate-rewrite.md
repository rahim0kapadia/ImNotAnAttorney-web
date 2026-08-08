# Handoff: T6 charge-extractor delta-gate rewrite
Date: 2026-05-04 05:50 ET

## Task
Refactor `scripts/bulk-extract-charge-types.mjs` to gate against already-classified clusters before processing. Eliminates 95% of wasted CPU when re-running against full historical bulk CSV.

## Why (incident)
2026-05-04 04:00 launched T6 against fresh 19.8 GB `opinions-criminal.csv` (post filter-criminal-opinions.py). After 30 min of processing 1.2M rows, `pg_stat_user_tables.n_tup_upd` showed only **264 actual UPDATEs** vs. 5,154 script-reported "classified". Killed at 05:50 to save 2.5hr.

Root cause: `classified_opinions` was already comprehensively populated (1,462,909 rows / 0 NULL / avg 1.43 charges/row, 6,275 total tags). T6's `WHERE NOT (charge_types @> new_charges)` correctly skips no-op writes — but spends most CPU pattern-matching against rows that already have those exact charges.

Memory: `learning-bulk-reclassify-needs-delta-gate-2026-05-04.md`

## Approach
Three viable patterns. Recommend **Option A** (cluster_id pre-filter) as token-cheapest:

### Option A — Pre-filter source rows by cluster_id NOT in classified_opinions
At script start, load `Set<cluster_id>` of already-classified clusters from DB. In the per-row loop, skip the row if `record.cluster_id` is in the set. ~1.46M Set entries = ~30 MB heap (acceptable).

```js
async function loadAlreadyClassifiedClusters() {
  const set = new Set();
  const rows = await query(`SELECT cluster_id FROM classified_opinions WHERE charge_types IS NOT NULL`);
  for (const r of rows) set.add(r.cluster_id);
  return set;
}
// In main loop:
const skipSet = await loadAlreadyClassifiedClusters();
console.log(`Skipping ${skipSet.size} already-classified clusters`);
// per-row:
if (skipSet.has(record.cluster_id)) { skippedAlreadyDone++; continue; }
```

### Option B — Materialized view of clusters-to-classify
`CREATE MATERIALIZED VIEW cl_clusters_to_classify AS SELECT cluster_id FROM cl_opinion_clusters c WHERE NOT EXISTS (SELECT 1 FROM classified_opinions co WHERE co.cluster_id = c.cluster_id::text)` — refresh on cl-bulk-loader completion. Source CSV stream then JOINs against this view. More infrastructure, but durable for ongoing delta runs.

### Option C — Source-side date filter
If CSV has `date_modified`, gate on `record.date_modified > last_classified_at`. Requires tracking last run timestamp. Lower payoff if CL bulk doesn't give a clean date_modified for all rows.

## Files Modified (this session)
- `scripts/link-quotes-to-judges.mjs` — line 41 OPINIONS_CSV env override + full csv-parse rewrite (PR #302 closed-as-superseded, PR #304 MERGED commit `eb4ed45b`)
- `docs/handoffs/2026-05-04-t5-csv-parser-rewrite.md` — T5 rewrite plan (PR #303)
- `~/.claude/projects/.../memory/learning-bulk-reclassify-needs-delta-gate-2026-05-04.md` — learning entry
- `~/.claude/projects/.../memory/MEMORY.md` — index updated

## What Didn't Work
- Running T6 against the full historical CSV — 95% no-op rate because `classified_opinions` was already populated
- Trusting the script's "classified" counter over `pg_stat_user_tables.n_tup_upd` — script counters reflect pattern engine activity, not DB writes

## Remaining Steps
1. Implement Option A in `scripts/bulk-extract-charge-types.mjs`:
   - Add `loadAlreadyClassifiedClusters()` at startup
   - Add `skippedAlreadyDone` counter + log it in the heartbeat
   - Skip the per-row classify+queue work when in skip-set
2. Smoke test: run with --dry-run against 100K rows, expect ~1.46M skipped + ~25K-100K candidate processings (depending on filter overlap)
3. If smoke shows >10% candidates remaining, full re-run is justified. If <2%, skip the run entirely until next bulk-loader delta lands.
4. Re-run T5 against full 19.8GB CSV using the now-merged csv-parse parser:
   ```
   nohup node scripts/link-quotes-to-judges.mjs --apply > .tmp-session/t5-link-quotes-v2.log 2>&1 &
   ```
   Should now match hundreds-thousands of author_ids vs. the 0 it matched tonight.
5. After T5 re-run, run T5b aggregator: `node scripts/aggregate-judge-quotes-to-profiles.mjs --apply`

## Verification
- After Option A lands: `SELECT COUNT(*) FROM classified_opinions WHERE charge_types IS NOT NULL` should NOT change after a re-run unless new clusters were ingested via cl-bulk-loader
- After T5 re-run: `SELECT COUNT(*) FROM judge_quotes WHERE judge_id IS NOT NULL` should jump from 35,242 toward something closer to the 5,946 unique-cluster ceiling × N quotes/cluster (~10K-30K linked is realistic)

## Cascade
- Atlas: stops the "30min for 264 updates" failure mode
- Rahim: zero false-progress in handoffs (script-reported counters now backed by DB writes)
- direct counterparty (DB): no idle CPU burn
- downstream (other queries): unblocked DB connections
- ecosystem: pattern publishable as `pre-filter-target-population` rule for any classifier
- future-us: every classifier ships with delta-gate from day one
