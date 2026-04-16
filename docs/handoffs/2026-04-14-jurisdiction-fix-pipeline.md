# Defense Intelligence: Jurisdiction Fix Pipeline, Handoff

## What was built this session

### Root cause diagnosed
The bulk classifier stored **judge names** (author_str) in the `court` column and used text heuristics for jurisdiction, catching only "circuit"/"district court" patterns. Result: 200K federal opinions correctly jurisdictioned, ~655K state opinions all set to "unknown". Zero state jurisdiction coverage → charge extraction failed for all state cases.

### Fix: 3-layer jurisdiction resolution
Built a pipeline: `cluster_id → docket_id → court_id → jurisdiction`

**Scripts created:**
1. `scripts/build-court-jurisdiction-map.mjs`, parses CL courts CSV using actual `jurisdiction` column. 87.4% coverage (2,937/3,360 courts). Output: `court-jurisdiction-map.json`
2. `scripts/extract-cluster-jurisdictions.mjs`, streams 2.4GB clusters bz2, extracts `case_name_full` jurisdictions + `cluster_id → docket_id` mapping. Output: `cluster-jurisdiction-map.json` + `cluster-docket-map.json`
3. `scripts/extract-docket-courts.mjs`, streams 5GB dockets bz2, extracts `docket_id → court_id`. With `, merge` flag, combines all 3 maps into `cluster-jurisdiction-map-v2.json`
4. `scripts/diagnose-charges.mjs`, diagnostic query tool (temp, can delete)

**Downloaded:**
- `data/bulk-verify/cl-bulk/dockets-2026-03-31.csv.bz2` (5GB), new bulk data file

**Bulk classifier patched (3 changes):**
1. Added `loadClusterJurisdictionMap()` + `loadCourtJurisdictionMap()` functions
2. Jurisdiction derivation: `clusterJurisdictions.get(cluster_id)` → existing DB → text heuristic → "unknown"
3. Court column: stores "unknown" instead of author_str (judge names)

### Parallel work completed
- **Quote linking**: 1,359 linked (35,242/129,506 = 27.2%). Per curiam (4,448) unlinked by design.
- **Gold-set eval**: Baseline logged. 0% verified, needs human labels. 200 cluster IDs at `data/defense-intelligence/gold-set-cluster-ids.json`.
- **Statute map audit**: 100% coverage across all 52 jurisdictions (4,699 entries). NOT the bottleneck.
- **Filter check**: opinions-criminal.csv is complete and usable (15GB, 246M rows).

## Extraction status (ALL COMPLETE)

- ✅ `cluster-docket-map.json` (94MB), 4.3M cluster→docket mappings
- ✅ `cluster-jurisdiction-map.json` (71MB), **4,222,767 clusters resolved** (98.3% coverage)
- ✅ `court-jurisdiction-map.json`, 2,937 courts mapped (87.4%)
- ❌ `docket-court-map.json`, NOT NEEDED (build-final-jurisdiction-map.mjs bypasses it)

## Next session steps (in order)

### 0. Rebuild jurisdiction map (court map was fixed for MT/AK prefix ordering)
```bash
node scripts/build-final-jurisdiction-map.mjs
```
Runtime: ~55 min. Streams 65M dockets, filters to 4.1M needed. Overwrites cluster-jurisdiction-map.json.

### 1. Run classification (THE MAIN EVENT)
```bash
node scripts/bulk-classify-full-corpus.mjs,apply
```
- Runtime: 2-6 hours (includes ~30 min loading 855K existing jurisdictions from DB)
- Uses opinions-criminal.csv (15GB, 246M rows, fast path, no bzcat needed)
- Jurisdiction map: cluster-jurisdiction-map.json (4.2M entries, already in place)
- ON CONFLICT idempotent, safe to interrupt and re-run

**NOTE:** loadExistingJurisdictions() paginates 855K rows at 1000/page via SQL, takes ~30min.
Could be optimized but not blocking.

### 2. Re-compute pattern tables
```bash
node scripts/compute-pattern-tables.mjs,apply
```

### 3. Implement IB Defense Matrix
Spec at: `docs/superpowers/specs/2026-04-14-ib-defense-matrix-design.md`
Mechanical render layer in Edge Function, 5 changes, 1 file.

### 4. Git push
```bash
git push origin master
```

## Key files
| File | Purpose |
|------|---------|
| `scripts/bulk-classify-full-corpus.mjs` | Main classifier (PATCHED) |
| `scripts/build-court-jurisdiction-map.mjs` | Courts CSV → jurisdiction map |
| `scripts/extract-cluster-jurisdictions.mjs` | Clusters CSV → docket map + case_name jurisdictions |
| `scripts/extract-docket-courts.mjs` | Dockets CSV → court_id map + merge step |
| `data/bulk-verify/cl-bulk/court-jurisdiction-map.json` | 2,937 court → jurisdiction |
| `data/bulk-verify/cl-bulk/cluster-jurisdiction-map.json` | Loaded by classifier |
| `data/bulk-verify/cl-bulk/dockets-2026-03-31.csv.bz2` | 5GB new download |

## Deferred review fixes (do after classification)

### SECURITY, Token rotation needed
Supabase Management API tokens (`sbp_fea5e71...` and `sbp_c48b0dc1...`) are hardcoded in COMMITTED files:
`scripts/verify-tasks-applied.mjs`, `scripts/task-3-apply-cl-urls.mjs`, `scripts/task-2-apply-cap-verification.mjs`, `scripts/task-2-3-final-apply.mjs`, `scripts/task-1-apply-enrichment.mjs`, `scripts/migrate-009-tier-inclusion.mjs`.
**Rotate both tokens in Supabase dashboard, then scrub from code and load from env vars.**

### Code quality (from 3-agent review, 2026-04-14)
- **W1**: `source_urls` grows unbounded on re-runs (array_cat in ON CONFLICT). Fix: conditional append checking existence.
- **W2**: `date_created` used as `decision_date`, should be `date_filed` from clusters. Needs cluster data join.
- **W4**: No bzcat error/stderr handlers in `build-court-jurisdiction-map.mjs` and `extract-cluster-jurisdictions.mjs`. Add `bzcat.on('error')` + `bzcat.stderr.on('data')`.
- **W7**: `stripQuotes()` duplicated in 4 scripts. Extract to `scripts/lib/csv-utils.mjs`.
- **W9/W10**: Delete `extract-docket-courts.mjs` (superseded by `build-final-jurisdiction-map.mjs`). Delete any remaining `parse-cl-courts.mjs`.
- **W11**: Dry-run upserts array grows unbounded. Flush/discard periodically when `!applyMode`.

## Expected outcome
Before: 200K federal + 655K "unknown" jurisdiction → 0% state charge extraction
After: ~800K+ with correct jurisdiction → statute lookup works → charge extraction should jump from 0.3% to 15-40%+
