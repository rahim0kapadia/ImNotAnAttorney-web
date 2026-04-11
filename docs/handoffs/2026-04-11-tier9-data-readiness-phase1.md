# Handoff: Tier 9 Data Readiness — Phase 0 + Phase 1 Partial
Date: 2026-04-11 18:30

## Task
Execute the Tier 9 Data Readiness remediation plan at `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-11-tier9-data-readiness.md`. The plan has 4 phases fixing systemic data quality issues across all 9 Tier 9 tables so the 3 standalone SKUs (Judge Report Card, Officer Background Check, Similar Cases Analyzer) produce reports with real data instead of "insufficient data".

## Approach
Phase 0 first (query code fixes — unblock pipeline), then Phase 1 (data quality remediation — clean/link/populate tables). Verified all column names against live Supabase schema before coding. Used bulk CSV streaming for author→judge linking instead of CL API (API returned null for most authors and doesn't support batch `__in` filter).

## Files Modified
- `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\tier9-reports\query.ts` — Phase 0: fixed `name`→`full_name`, removed nonexistent `court`/`jurisdiction` columns, derive court from positions JSONB, officer jurisdiction fallback (retry without filter when "multi"), sentencing_distributions falls back to charge_slug when judge_id NULL, appellate_trends accepts jurisdiction="unknown"
- `C:\Users\email\projects\ImNotAnAttorney-web\scripts\link-quotes-to-judges.mjs` — NEW: streams opinions-filtered.csv to extract cluster→author_id mapping, matches to judge_profiles.cl_person_id, updates judge_quotes.judge_id. Result: 15,652 quotes linked.
- `C:\Users\email\projects\ImNotAnAttorney-web\scripts\bulk-bench-jury-divergence.mjs` — Fixed 3 bugs: `?select=id,name`→`id,full_name,cl_person_id`, `record.author`→`record.author_id`+`record.author_str`, `.slice(28)`→`.split("=").slice(1).join("=")` for JWT, parent repo path for SUPABASE_ACCESS_TOKEN
- `C:\Users\email\projects\ImNotAnAttorney-web\data\tmp-cleanup-officer-reliability.sql` — NEW: garbage name + dedup cleanup SQL (saved for reference)

## Database Changes Applied (PRODUCTION)
- `officer_reliability`: 11,818 → 2,822 rows (deleted garbage names + duplicates)
- `judge_quotes`: 15,652 of 64,730 now have judge_id linked (was 0)
- `plea_discount_curves`: 46 → 4 rows (deleted 600/600 caps + negative discounts + duplicates)

## What Didn't Work
- **CL API `cluster__in` filter**: doesn't exist. `cluster__id__in` also rejected. Only `cluster=<single_id>` works — too slow for 6,072 clusters.
- **CL API author_id**: returned null for both test clusters (per curiam opinions). Only 24% of opinions have attributed authors.
- **Bench/jury script first run**: 401 auth — `.slice(28)` truncated first 2 chars of JWT key.
- **Bench/jury script second run**: loaded only 1000/15,613 judges due to PostgREST 1000-row default cap (gotcha already documented). Timed out during 50GB CSV stream.
- **sentencing_distributions linking**: impossible — no cluster_id column, rows are pre-aggregated charge-level stats without judge attribution. Fixed via query fallback instead.

## Completed
- [x] Phase 0a: Fix judge_profiles query (full_name + positions JSONB)
- [x] Phase 0b: Officer jurisdiction fallback
- [x] Phase 1a: Clean officer_reliability garbage names (2,822 clean remain)
- [x] Phase 1b: Link judge_quotes to judges (15,652 linked via CSV)
- [x] Phase 1c: Sentencing query fallback (charge_slug when judge_id NULL)
- [x] Phase 1e: Plea discount cleanup (4 real rows remain)
- [x] Phase 1f: Appellate trends fallback (accept jurisdiction="unknown")

## Remaining Steps
1. **Phase 1g: bench_jury_divergence** — Script fixed but needs re-run with pagination fix in `loadJudgeProfiles()` (PostgREST 1000-row cap). Add Range header pagination to load all 15,613 judges. Then run: `node scripts/bulk-bench-jury-divergence.mjs --apply` (takes hours — 50GB CSV stream).
2. **Phase 2a: Add jurisdiction column to judge_profiles** — Migration adding `jurisdiction text` column. Backfill from `positions` JSONB using court_id → state mapping (e.g., "fla"→"FL", "txsd"→"TX"). Then fix query.ts to filter on it.
3. **Phase 2b: Populate judge_profiles rollup columns** — After quotes and sentencing are linked, aggregate into `sentencing_distributions` JSONB, `judicial_quotes` JSONB, `bench_acquittal_rate`, `jury_acquittal_rate` on judge_profiles.
4. **Phase 3a-3c: E2E verification + visual audit + flip live:true** — Pick known-good judges/officers with data, run `node scripts/e2e-tier9.mjs`, verify reports render with populated sections, then flip `live: true` in `src/lib/tiers.ts` one SKU at a time.

## Key Decisions
- **Query fallbacks over data re-extraction**: For sentencing_distributions (no cluster_id) and appellate_trends (all jurisdiction="unknown"), fixed queries to work with existing data rather than re-extracting. Correct long-term fix is in Phase 2.
- **CSV streaming over CL API**: 8.3M line opinions CSV locally is faster and more complete than 6,072 individual API calls, despite multiline parsing complexity.
- **24% quote linkage is acceptable for launch**: 15,652 linked quotes from attributed opinions. The 49K unlinked are per curiam — no author in CL's data.

## Verification
- `cd C:/Users/email/projects/ImNotAnAttorney-web && npx tsc --noEmit --skipLibCheck` — should compile clean
- `SELECT count(*) FROM officer_reliability` — should be 2,822
- `SELECT count(*) FROM judge_quotes WHERE judge_id IS NOT NULL` — should be 15,652
- `SELECT count(*) FROM plea_discount_curves` — should be 4
- `SELECT count(*) FROM bench_jury_divergence` — should be 0 (awaiting re-run)

## Ready-to-Paste Prompt for Next Session
```
Continue executing the data readiness remediation plan at
  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-11-tier9-data-readiness.md

Handoff at:
  C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-11-tier9-data-readiness-phase1.md

Context:
- Phase 0 (query fixes) DONE. Phase 1 partially done (1a,1b,1c,1e,1f complete).
- Phase 1g (bench_jury_divergence) needs: fix PostgREST 1000-row cap in
  bulk-bench-jury-divergence.mjs loadJudgeProfiles() — add Range header pagination
  to load all 15,613 judges. Then run --apply (50GB CSV, takes hours).
- Phase 2 not started: add jurisdiction column to judge_profiles (migration +
  backfill from positions JSONB court_id), populate rollup columns.
- Phase 3 blocked on Phase 2.
- 5 commits shipped this session: a920b71, f3ab8b6, 8ddab17, 5e9a46d + the WIP
  recovery commits (5547734, b424aaf).
- Coordinate with Session 2 (DI platform at docs/superpowers/plans/2026-04-11-data-intelligence-phase0-phase1.md)
  which overlaps on some tasks.
```
