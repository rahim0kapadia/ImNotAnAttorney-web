# Handoff: Data-Driven Defense Intelligence Layer
Date: 2026-04-09 18:30

## Task
Fill the empty engine tables and build the data-driven defense intelligence layer (Tier 9) to unlock premium tier products (X-Ray $2,497, War Room $4,997, Situation Room $9,997). Two-day session that went from bulk case law ingestion → verification → discovering 53% bad law → designing 9 new statistical angles → writing plans.

## Approach
1. Download CourtListener bulk data (50 GB opinions CSV, 522 MB citation-map, 455 KB judges, 273 MB parentheticals, 267 MB FJC, 127 MB citations, 80 KB courts)
2. Build bulk pipeline scripts using csv-parse with `escape: "\\"` for CL's backslash-escaped quotes
3. Additive COALESCE verification pattern — never overwrite, only fill gaps, accumulate source URLs
4. Update by `courtlistener_cluster_id` (not row id) for 3.8:1 row expansion
5. Expert-grounded approach per Mike Lissner (Free Law Project) — citation-map graph + opinions CSV scan ±6 sentences
6. Haiku-first agent execution with $30 cost ceiling

## Key Findings This Session
- **53% of case law is BAD LAW (overruled)** — 18,303 of 34,564 rows. Only 1,958 confirmed good. Production filter verified safe (`is_good_law=eq.true` in generate-report/index.ts:2200-2229)
- **CL opinions CSV uses backslash-escaped quotes** — `escape: "\\"` in csv-parse fixes all parsing. Previous hand-rolled parsers (quote-counting, isRowStart) failed on multi-line HTML
- **CL clusters CSV wraps ALL IDs in double-quotes** — fast-path `slice(0, firstComma)` must strip quotes before Set lookup
- **Haiku agents self-impose conservative limits** — judge_profiles got 426/~8,000 (agent capped at 500), case_law got 500/2,814, prosecution_counters got 64 (possibly real). ALL need re-run without caps.

## Currently Running (DO NOT INTERRUPT)
- **Terminal 1:** `node scripts/bulk-good-law-by-cluster.mjs --limit 9999` — second run with new `negative_treatment_checked_at IS NULL` filter. Additive cross-verification. ~13-15h runtime.
- **Terminal 2:** `node scripts/bulk-classify-from-opinions.mjs --apply` — streaming 50 GB opinions CSV via csv-parse. At 5.0M/~10M rows, 2,840 of 6,718 clusters classified. ~2h remaining. When done, the 50 GB CSV is freed for the next extractor.

## Files Modified
- `scripts/bulk-is-good-law.mjs` — quote-stripping fix, cluster_id WHERE clause, additive COALESCE, removed is_good_law IS NULL filter
- `scripts/bulk-classify-cases.mjs` — quote-stripping fix, cluster_id WHERE clause, batch size 100→500
- `scripts/bulk-good-law-from-graph.mjs` — isRowStart detection, streamCsv vs streamCsvSimple split (still has parsing issues — needs csv-parse port)
- `scripts/legal-research-all.mjs` — added `--unverified-only` flag (line 55, 559)

## Files Created
- `scripts/bulk-add-reference-urls.mjs` — TRUE BULK UPDATE FROM VALUES pattern, 351 rows/sec, uuid cast
- `scripts/bulk-good-law-by-cluster.mjs` — cluster-deduped API loop, 3.8x faster than row-based
- `scripts/bulk-classify-from-opinions.mjs` — csv-parse streaming of 50 GB opinions CSV for party_side/holding/key_quote/outcome
- `scripts/bulk-extract-motion-legal-issues.mjs` — READY TO RUN after Terminal 2 finishes. Extracts motion_types[], legal_issues[], supporting_rulings[] from opinion text
- `scripts/bulk-populate-judge-profiles.mjs` — loads CL judges from people-db CSV (needs re-run without cap)
- `scripts/promote-to-engine-tier.mjs` — copies statute_case_law → case_law/case_law_references/verified_case_law (needs re-run without cap)
- `scripts/bulk-populate-prosecution-counters.mjs` — groups prosecution cases by statute (needs audit for cap)
- `scripts/run-full-good-law-pipeline.mjs` — chains dump → 4-phase good-law pipeline → reference URLs
- `docs/plans/2026-04-09-data-driven-defense-intelligence-layer.md` — execution plan (30 tasks, 5 waves)
- `docs/plans/2026-04-09-data-driven-intelligence-ULTRA-PLAN.md` — strategic master plan (Tier 9, SKU mapping, Q2-Q4 roadmap)
- `docs/plans/2026-04-09-bulk-classify-from-opinions.md` — execution plan for csv-parse script

## Downloaded bulk data (on disk at data/bulk-verify/cl-bulk/)
- `opinions-2026-03-31.csv.bz2` — 50 GB (full opinion text)
- `citation-map-2026-03-31.csv.bz2` — 522 MB (opinion-to-opinion graph)
- `opinion-clusters-2026-03-31.csv.bz2` — 2.3 GB (cluster metadata)
- `people-db-people-2026-03-31.csv.bz2` — 455 KB (judges)
- `people-db-positions-2026-03-31.csv.bz2` — 1 MB (judge court assignments)
- `parentheticals-2026-03-31.csv.bz2` — 273 MB (case summaries)
- `courts-2026-03-31.csv.bz2` — 80 KB (court metadata)
- `fjc-integrated-database-2026-03-31.csv.bz2` — 267 MB (federal case outcomes)
- `citations-2026-03-31.csv.bz2` — 127 MB (bibliographic citations, NOT the graph)

## Migration Applied (via Supabase Management API)
- Added `motion_types text[]`, `legal_issues text[]`, `supporting_rulings text[]` to `statute_case_law`

## What Didn't Work
- **Hand-rolled CSV parsers for opinions CSV** — quote-counting heuristic and isRowStart detection both failed on multi-line HTML content with embedded commas/quotes. Solution: `csv-parse` npm package with `escape: "\\"`.
- **bulk-is-good-law citation_count=0 fast path** — only 67 of 4,730 clusters had zero citations (our cases are pre-filtered to statute-citing opinions, most have citations). Marginal impact.
- **bulk-classify-cases.mjs from clusters CSV** — clusters CSV syllabus/summary/disposition fields are MOSTLY EMPTY. Only 79 classifications from 2,252 matches. Need full opinion text from opinions CSV instead.
- **Haiku agents for data loading** — self-imposed conservative limits on every table. Need explicit "load ALL" instructions or manual re-run without caps.

## Remaining Steps

### IMMEDIATE (after Terminal 2 finishes, ~2h)

1. **Audit + uncap haiku agent limits** — for each table (judge_profiles, case_law, prosecution_counters, verified_case_law):
   - Read the script that populated it
   - Find the LIMIT clause or cap
   - Remove or raise the cap
   - Re-run with full data
   - Expected: judges 426→3,000-8,000, case_law 500→2,814, prosecution_counters 64→500-1,000

2. **Run `bulk-extract-motion-legal-issues.mjs --apply`** — streams 50 GB CSV (freed by Terminal 2), fills motion_types[] + legal_issues[] + supporting_rulings[] for all cases. ~4-5h runtime.

3. **Port csv-parse fix to `bulk-good-law-from-graph.mjs`** — phases 1+3 still use broken streamCsvSimple. Replace with csv-parse import + `escape: "\\"`. Then run all 4 phases for citation-graph-based is_good_law verification (second source complementing API).

### NEXT SESSION (after motion extraction completes)

4. Build + run `bulk-populate-case-law-applicability.mjs` — reads motion_types from statute_case_law, inserts into case_law_applicability per (cluster_id, motion_type) pair with applicability_score
5. Build + run `bulk-enrich-judge-intelligence.mjs` — extracts suppression_grant_rate, magic_words, forbidden_words from opinions authored by loaded judges
6. Build remaining Tier 9 workers per execution plan (tasks 1-23)
7. Update architecture docs per plan (tasks 24-30)
8. Frontend integration (prompts.ts, render.ts, 3 new SKU pages) — requires accessibility-lead delegation

## Verification
- `node scripts/bulk-dump-cases.mjs` — check total/good_law/bad_law/null counts
- `SELECT COUNT(*) FROM judge_profiles;` — should be 3,000-8,000 after uncap
- `SELECT COUNT(*) FROM case_law;` — should be 2,814 after uncap
- `SELECT COUNT(*) FROM case_law_applicability;` — should be populated after step 4
- Check production filter: `supabase/functions/generate-report/index.ts:2200-2229` uses `is_good_law=eq.true` (CONFIRMED SAFE this session)

## Key Decisions
- **COALESCE additive verification** — every source runs on every case, never overwrite, only fill gaps
- **csv-parse with `escape: "\\"` is the canonical pattern** for ALL CL bulk CSV streaming. No more hand-rolled parsers.
- **Tier 9 = Data-Driven Defense Intelligence** — 9 new statistical angles, stacks on top of MASTER-PLAN tiers 1-8
- **Positioning is ADDITIVE** — "Know What They Know" never changes. Premium tiers extend what's in the gap, never replace the foundation.
- **$30 cost ceiling** — haiku for 80%, sonnet for adaptation, opus only for novel critical logic
- **Production filter verified safe** — `is_good_law=eq.true` excludes both bad law AND unverified from customer reports

## Plan Files
- Execution: `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-09-data-driven-defense-intelligence-layer.md`
- Strategic: `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-09-data-driven-intelligence-ULTRA-PLAN.md`
