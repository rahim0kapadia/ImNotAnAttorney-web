# Handoff: Network Switch Pause, Tier 9 Pipeline Ready

**Date:** 2026-04-09 evening
**Continues from:** `docs/handoffs/2026-04-09-tier9-scripts-built.md`
**Reason for pause:** Network switch

## State at pause

### Motion extraction (bulk-extract-motion-legal-issues.mjs)
- **Status:** KILLED mid-stream at 3.0M / ~10M rows (1,454 extractions, 1h 14min in)
- **DB impact:** ZERO. Script buffers all results in memory and only writes after stream completes. Apply phase never reached.
- **Restart cost:** ~1h of re-streaming to get back to the 1,454 mark, then 3-4h to complete.

### Master extractor (bulk-master-extractor.mjs), NEW FILE, 1,824 lines
Combines 7 separate Tier 9 extractors + appeal Phase 2 into ONE 50GB CSV pass. Replaces 21-28h of sequential streaming with 3-4h single-pass.

**Syntax verified.** Built by Backend Architect agent, reviewed by code-reviewer agent, 4 critical bugs fixed.

## Critical fixes applied this session

Code reviewer found 20 issues. Fixed the 4 critical ones that would have wasted a 3-4h run:

### Fix 1: SUPABASE_SERVICE_ROLE_KEY slice off-by-one (line 182)
**Before:** `line.slice(25)` returns `"=eyJ..."` with leading `=` → all REST calls 401 → judge_map empty → 4 extractors produce zero results.
**After:** `line.slice("SUPABASE_SERVICE_ROLE_KEY=".length)`, length-correct.

### Fix 2: Dump schema mismatch (added jurisdiction_statutes resolver)
**Problem:** `statute-case-law-dump.json` has `jurisdiction_statute_id` (FK) but NOT `jurisdiction`, `charge_slug`, `statute_slug`. Sentencing/plea/bench-jury/appeal all collapsed to `"unknown|unknown"`. This is a PRE-EXISTING bug in all 7 individual scripts too, they were written against an old dump schema.
**Fix:** Added paginated fetch of `jurisdiction_statutes` (all 4,699 rows via PostgREST Range header, 1000 per page). Enriches each dump row with `jurisdiction`, `charge_slug`, `statute_slug`, `charge_type` at startup.
**Verified:** 34,564/34,564 dump rows resolve. Top jurisdictions: FL 1,901, IL 955, AK 692, AZ 597, IN 540.

### Fix 3: Removed processedClusters dedupe (line 1291)
**Before:** Master processed only FIRST opinion per cluster. Originals process EVERY opinion (majority + concurring + dissent).
**After:** Process every opinion. `, limit` now counts unique clusters tracked via a separate Set.
**Impact:** ~30-60% more extractions (holdings often in concurrences/dissents).

### Fix 4: Per-extractor text length gating (line 1288)
**Before:** Single `text.length < 200` floor fed short orders to extractors designed for 500-char minimums.
**After:** `haveShort` (200) for judge_quotes, `haveMid` (300) for plea_discount, `haveLong` (500) for sentencing/officer/pairing/bench-jury/co-def.

## Outstanding review findings (NOT yet fixed)

### HIGH
- **#5/#6:** Substring judge match false positives in pairing/bench-jury. Master uses shared `matchJudge()` (bidirectional indexOf). Originals use exact `judgeByNameLower.get()`. Fix: inside `extractJudgeProsecutorPairing` and `extractBenchJuryDivergence`, use exact-match lookup.
- **#8:** Pairing key `|` collision risk. Low probability but the `parts.slice(2).join("|")` direction is wrong, prosecutor could contain `|`, motion_type cannot. Fix: use composite object Map values instead of stringified keys.

### MEDIUM
- **#9:** Prosecutor name extraction diverges from original on non-ASCII characters. Fix: align exactly with `bulk-judge-prosecutor-pairing.mjs:189,195`.
- **#10:** Co-defendant signals list differs (added `co-conspirator`). Fix: match original or document.
- **#11:** Appeal correlator `clusterToJurisdiction[clusterId]` looks up CITING cluster, not CITED cluster. `clusterToJurisdiction` is populated only for target (cited) clusters. Pre-existing in original script too.
- **#12:** `citingMap` populated but never read, memory waste during 50GB stream. Delete the Map population, keep only `citingOpinionIds` Set.
- **#13:** No resume/retry checkpoint. A crash at 3h45m loses all state. Fix: after Phase 1, write accumulators to disk as JSON in OUTPUT_DIR. Add `, resume-from-phase2` flag.
- **#14:** Rate-limit retry decrement bug, non-429 errors drop a batch of 500 statements silently. Fix: retry all transient errors, log dropped batches to `failed-statements.sql`.
- **#15:** `array_cat` without dedupe accumulates duplicate URLs on re-runs. Fix: wrap in `ARRAY(SELECT DISTINCT unnest(...))`.

### LOW
- **#16:** `esc(number)` wraps numbers in single-quotes unnecessarily (lines 1518-1521). May fail on integer columns.
- **#19:** `relax_column_count: true` silently accepts mal-rowed records. Add a counter.
- **#20:** Phase 0 bzcat exit code not checked, partial citation-map could cause silent failure.

## Execution sequence for next session

### Step 1: Restart motion extraction (bottleneck, nothing else can use opinions CSV)
```bash
cd C:/Users/email/projects/ImNotAnAttorney-web
node scripts/bulk-extract-motion-legal-issues.mjs,apply
```
Runtime: ~4-5h. Buffers in memory, writes all 34,564 rows at the end. Do NOT interrupt.

### Step 2: Before running master extractor, address HIGH findings #5/#6/#8 at minimum
These affect data quality but not data loss. Can run master WITHOUT these fixes and accept some noise. Recommended: fix before the 3-4h run.

### Step 3: Run master extractor (single pass)
```bash
node scripts/bulk-master-extractor.mjs,apply
```
Runtime: ~3-4h. Populates 8 Tier 9 tables + updates judge_profiles bench/jury rates.

Flags:
- `, dry-run`, stats only, no SQL
- `, skip-appeal-phase0`, skip citation-map streaming if already built
- `, tables judge_quotes,sentencing_distributions,...`, run specific tables only
- `, limit N`, cap at N unique clusters (post-fix: counts clusters, not first-seen)

### Step 4: Re-run similar-case matcher (now has motion data)
```bash
node scripts/bulk-similar-case-matcher.mjs,apply
```
DB-only. ~5 min. Fills case_feature_vectors with motion_types/legal_issues features.

### Step 5: Frontend integration (Tasks 15-21 from execution plan)
- `src/lib/intelligence-brief/prompts.ts`, 9 new section builders
- `src/lib/intelligence-brief/render.ts`, 9 new render blocks
- `src/lib/tiers.ts`, 3 new SKUs (Judge Report Card $197, Officer Background Check $97, Similar Cases Analyzer $297)
- 3 new standalone SKU pages (requires accessibility-lead review FIRST)
- `src/lib/playbook-configs.ts`, Tier 9 field additions

## Files changed this session (not yet committed)

- `scripts/bulk-master-extractor.mjs`, NEW (1,824 lines, 4 critical fixes applied)
- `docs/handoffs/2026-04-09-network-switch-pause.md`, NEW (this file)

## Key files

- Execution plan: `docs/plans/2026-04-09-data-driven-defense-intelligence-layer.md`
- Strategic plan: `docs/plans/2026-04-09-data-driven-intelligence-ULTRA-PLAN.md`
- Prior handoff: `docs/handoffs/2026-04-09-tier9-scripts-built.md`
- Previous handoff: `docs/handoffs/2026-04-09-data-driven-defense-intelligence.md`

## Database state at pause (unchanged from session start)

| Table | Rows | Notes |
|-------|---, :|-------|
| statute_case_law | 34,564 | motion_types still 0 populated (extraction killed mid-stream) |
| case_law | 3,407 | Promoted from good_law |
| judge_profiles | 15,613 | Fully loaded |
| prosecution_counters | 64 | |
| case_feature_vectors | 991 | Regression from prior 3,307, investigate next session |
| judge_quotes | 0 | Empty, waiting for master extractor |
| sentencing_distributions | 0 | Empty |
| officer_reliability | 0 | Empty |
| judge_prosecutor_pairings | 0 | Empty |
| bench_jury_divergence | 0 | Empty |
| appellate_trends | 0 | Empty |
| co_defendant_analysis | 0 | Empty |
| plea_discount_curves | 0 | Empty |

## Verified facts (for next session)

- 50GB opinions CSV at `data/bulk-verify/cl-bulk/opinions-2026-03-31.csv.bz2`, intact
- 522MB citation-map at `data/bulk-verify/cl-bulk/citation-map-2026-03-31.csv.bz2`, intact
- Dump file at `data/bulk-verify/statute-case-law-dump.json`, 34,564 rows, 77MB
- jurisdiction_statutes table, 4,699 rows, all verified (100% source_urls)
- bzcat path: `C:\Program Files\Git\usr\bin\bzcat.exe`
- No competing bzcat processes
