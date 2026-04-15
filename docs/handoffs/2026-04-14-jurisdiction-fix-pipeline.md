# Defense Intelligence: Jurisdiction Fix Pipeline — Handoff

## What was built this session

### Root cause diagnosed
The bulk classifier stored **judge names** (author_str) in the `court` column and used text heuristics for jurisdiction — catching only "circuit"/"district court" patterns. Result: 200K federal opinions correctly jurisdictioned, ~655K state opinions all set to "unknown". Zero state jurisdiction coverage → charge extraction failed for all state cases.

### Fix: 3-layer jurisdiction resolution
Built a pipeline: `cluster_id → docket_id → court_id → jurisdiction`

**Scripts created:**
1. `scripts/build-court-jurisdiction-map.mjs` — parses CL courts CSV using actual `jurisdiction` column. 87.4% coverage (2,937/3,360 courts). Output: `court-jurisdiction-map.json`
2. `scripts/extract-cluster-jurisdictions.mjs` — streams 2.4GB clusters bz2, extracts `case_name_full` jurisdictions + `cluster_id → docket_id` mapping. Output: `cluster-jurisdiction-map.json` + `cluster-docket-map.json`
3. `scripts/extract-docket-courts.mjs` — streams 5GB dockets bz2, extracts `docket_id → court_id`. With `--merge` flag, combines all 3 maps into `cluster-jurisdiction-map-v2.json`
4. `scripts/diagnose-charges.mjs` — diagnostic query tool (temp, can delete)

**Downloaded:**
- `data/bulk-verify/cl-bulk/dockets-2026-03-31.csv.bz2` (5GB) — new bulk data file

**Bulk classifier patched (3 changes):**
1. Added `loadClusterJurisdictionMap()` + `loadCourtJurisdictionMap()` functions
2. Jurisdiction derivation: `clusterJurisdictions.get(cluster_id)` → existing DB → text heuristic → "unknown"
3. Court column: stores "unknown" instead of author_str (judge names)

### Parallel work completed
- **Quote linking**: 1,359 linked (35,242/129,506 = 27.2%). Per curiam (4,448) unlinked by design.
- **Gold-set eval**: Baseline logged. 0% verified — needs human labels. 200 cluster IDs at `data/defense-intelligence/gold-set-cluster-ids.json`.
- **Statute map audit**: 100% coverage across all 52 jurisdictions (4,699 entries). NOT the bottleneck.
- **Filter check**: opinions-criminal.csv is complete and usable (15GB, 246M rows).

## Extraction status (ALL COMPLETE)

- ✅ `cluster-docket-map.json` (94MB) — 4.3M cluster→docket mappings
- ✅ `cluster-jurisdiction-map.json` (71MB) — **4,222,767 clusters resolved** (98.3% coverage)
- ✅ `court-jurisdiction-map.json` — 2,937 courts mapped (87.4%)
- ❌ `docket-court-map.json` — NOT NEEDED (build-final-jurisdiction-map.mjs bypasses it)

## Next session steps (in order)

### 1. Run classification (THE MAIN EVENT)
```bash
node scripts/bulk-classify-full-corpus.mjs --apply
```
- Runtime: 2-6 hours (includes ~30 min loading 855K existing jurisdictions from DB)
- Uses opinions-criminal.csv (15GB, 246M rows, fast path — no bzcat needed)
- Jurisdiction map: cluster-jurisdiction-map.json (4.2M entries, already in place)
- ON CONFLICT idempotent — safe to interrupt and re-run

**NOTE:** loadExistingJurisdictions() paginates 855K rows at 1000/page via SQL — takes ~30min.
Could be optimized but not blocking.

### 2. Re-compute pattern tables
```bash
node scripts/compute-pattern-tables.mjs --apply
```

### 3. Git push
```bash
git add scripts/build-court-jurisdiction-map.mjs scripts/extract-cluster-jurisdictions.mjs scripts/extract-docket-courts.mjs scripts/build-final-jurisdiction-map.mjs
git add scripts/bulk-classify-full-corpus.mjs
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

## Expected outcome
Before: 200K federal + 655K "unknown" jurisdiction → 0% state charge extraction
After: ~800K+ with correct jurisdiction → statute lookup works → charge extraction should jump from 0.3% to 15-40%+
