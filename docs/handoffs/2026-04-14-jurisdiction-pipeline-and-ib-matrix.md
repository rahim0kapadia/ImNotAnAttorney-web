# Handoff: Jurisdiction Pipeline + IB Defense Matrix
Date: 2026-04-14 21:15

## Task
Fix the defense intelligence charge extraction gap (0.3% → target 15-40%+) by resolving jurisdiction for 655K "unknown" state opinions, then wire the data into the Intelligence Brief as a mechanical render layer.

## Approach
Built a 3-layer jurisdiction resolution pipeline: cluster_id → docket_id → court_id → jurisdiction. 4.2M clusters resolved (98.3% coverage). The IB Defense Matrix renders verified court data mechanically (no Claude) with Claude only handling personalization. Tier-gated: IB gets jurisdiction-level, X-Ray gets judge-level.

## What Was Done This Session
- Diagnosed root cause: `court` column had judge names, not courts. Only federal opinions had jurisdiction.
- Downloaded CL dockets bulk CSV (5GB) — new data source
- Built 4 pipeline scripts + patched classifier (3 changes)
- Ran 3-agent code review: fixed 7 critical + 6 warnings
- Deleted 12 temp files with hardcoded Supabase tokens
- Designed IB Defense Matrix spec (reviewed by code-reviewer agent)
- Re-generated opinions-criminal.csv (24.7GB)
- Quote linking: 1,359 linked (35,242/129,506 = 27.2%)
- Gold-set eval baseline logged (needs human labels)

## Files Modified
- `scripts/bulk-classify-full-corpus.mjs` — jurisdiction from cluster map, escArr fix, dead code removed, DC added
- `scripts/build-court-jurisdiction-map.mjs` — NEW: CL courts CSV → 2,937 court mappings, prefix sort fix
- `scripts/build-final-jurisdiction-map.mjs` — NEW: memory-efficient merge, 4.2M clusters
- `scripts/extract-cluster-jurisdictions.mjs` — NEW: clusters CSV → docket map + case_name jurisdictions
- `scripts/extract-docket-courts.mjs` — NEW: full docket extraction (superseded by build-final, keep for reference)
- `docs/handoffs/2026-04-14-jurisdiction-fix-pipeline.md` — detailed handoff with deferred review fixes
- `docs/superpowers/specs/2026-04-14-ib-defense-matrix-design.md` — IB matrix spec (reviewed)
- `data/defense-intelligence/*.sql` — seed SQL for pattern tables
- `data/defense-intelligence/gold-set-cluster-ids.json` — 200 cluster IDs for gold-set labeling

## What Didn't Work
- CL API `id__in` filter — not supported, can't batch-query dockets
- `extract-docket-courts.mjs` OOM'd at 65M rows (4GB heap). Fixed with `build-final-jurisdiction-map.mjs` (targeted, only stores needed docket IDs)
- Case name heuristic only 6% coverage across all clusters (but 98%+ via docket→court pipeline)
- Classification test run ECONNRESET during 855K-row existing jurisdiction load (~30 min pagination)

## Remaining Steps

### Step 0: Rebuild jurisdiction map (prefix fix applied to court map)
```bash
node scripts/build-final-jurisdiction-map.mjs
```
~55 min. Streams 65M dockets, filters to 4.1M needed.

### Step 1: Run classification
```bash
node scripts/bulk-classify-full-corpus.mjs --apply
```
2-6 hours. Uses opinions-criminal.csv (24.7GB). ON CONFLICT idempotent.

### Step 2: Re-compute pattern tables
```bash
node scripts/compute-pattern-tables.mjs --apply
```

### Step 3: Implement IB Defense Matrix
Spec: `docs/superpowers/specs/2026-04-14-ib-defense-matrix-design.md`
5 changes in `supabase/functions/generate-report/index.ts`:
1. `fetchDefenseIntelligenceForIB()` — raw PostgREST queries
2. `renderDefenseMatrix()` — mechanical HTML, no Claude
3. Add `tier9-data-appendix` slot to Edge Function's `renderIBReportHtml()`
4. Inject data summary into `buildIBPrompt()` for Claude sections
5. Pass mechanical HTML as `allOutputs["tier9-data-appendix"]`

### Step 4: Deferred review fixes
See full list in `docs/handoffs/2026-04-14-jurisdiction-fix-pipeline.md` under "Deferred review fixes":
- **SECURITY**: Rotate Supabase tokens (sbp_fea5e71, sbp_c48b0dc1) — hardcoded in committed files
- W1: source_urls unbounded growth
- W2: date_created vs date_filed
- W7: stripQuotes shared module
- W9/W10: delete competing scripts

### Step 5: Git push
```bash
git push origin master
```

## Verification
- `ls -la data/bulk-verify/cl-bulk/cluster-jurisdiction-map.json` — should be ~71MB after rebuild
- `ls -la data/bulk-verify/cl-bulk/opinions-criminal.csv` — 24.7GB, exists
- `npm test` — 221 tests, 12 files, all passing
- After classification: query `SELECT count(*) FROM classified_opinions WHERE jurisdiction != 'unknown' AND jurisdiction != 'federal'` — should be >>0 (currently 0)

## Key Decisions
- **Mechanical matrix over Claude for data**: Verified court data renders as HTML tables without LLM. Claude only personalizes connection to defendant's facts. Zero hallucination risk on statistics.
- **Tier boundary**: IB = jurisdiction-wide patterns (judge_id IS NULL). X-Ray = judge-specific. Hard gate via PostgREST filter.
- **Raw PostgREST in Edge Function**: Matches existing pattern (no Supabase SDK in Deno). Diverges from query.ts intentionally for tier gating.
- **Lowercase jurisdiction convention**: Cluster map outputs uppercase, classifier normalizes to lowercase via `.toLowerCase()`.
