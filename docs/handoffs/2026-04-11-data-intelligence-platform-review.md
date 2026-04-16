# Handoff: Data Intelligence Platform, Spec Review + Implementation Plan

Date: 2026-04-11 14:30

## Task
Review and refine the Data Intelligence Platform design spec, then create the Phase 0 + Phase 1 implementation plan. The spec extends the existing Tier 9 ULTRA-PLAN with 19+ external data sources, 33 unused CL endpoints, shared intelligence layer architecture, and full-stack delivery mapping.

## Approach
1. Read the full 1,145-line spec
2. Dispatched 3 parallel review agents (spec contradictions, SQL verification, code cross-reference)
3. Fixed all critical issues in the spec
4. Wrote 23-task implementation plan covering Phase 0 (unblock data) + Phase 1 (external sources)

## Files Modified
- `docs/superpowers/specs/2026-04-11-data-intelligence-platform-design.md`, 6 fixes applied:
  - pg_trgm extension moved before GIN indexes (was after, migration would fail)
  - CHECK constraint changed from `array_length(source_urls, 1) > 0` to `cardinality(source_urls) > 0` (array_length returns NULL for empty arrays)
  - Daubert table name standardized to `daubert_challenge_corpus` (was inconsistent with `expert_witness_challenges` in 2 places)
  - bench_jury_divergence description aligned with Phase 0 intent (was "legitimate gap" but Phase 0 fixes it)
  - Score route description corrected (doesn't read outcome_benchmarks yet)

## Files Created
- `docs/superpowers/plans/2026-04-11-data-intelligence-phase0-phase1.md`, 23-task implementation plan

## Key Findings from Review
- 3 CRITICAL: pg_trgm ordering, CHECK/DEFAULT contradiction, Daubert name collision, all fixed
- 3 MEDIUM: Harvard CAP vectors may blow 500MB Supabase limit (defer to Phase 2 decision), $37-65 compute estimate optimistic (revised to $33-55 for Phase 0+1), RLS policies need IF NOT EXISTS guard (fixed in plan's migration SQL)
- Code cross-reference confirmed: queryJudgeReportCard(), queryOfficerBackground(), querySimilarCases() all exist and match spec. sub_opinions[0] bug CONFIRMED at classify-case-law.mjs:354 and :422. IBVariables already has Tier 9 fields (70+ fields). Only officer_reliability and judge_prosecutor_pairings have -fixed SQL variants.

## What Didn't Work
- Nothing failed, this was a review + planning session, no implementation attempted.
- Quality-gate skill correctly identified as docs-only changes, no code review needed yet.

## Remaining Steps
1. Execute the implementation plan starting at Task 1 (Phase 0: apply fixed SQL files)
2. Phase 0 Tasks 1-4 can parallelize (independent SQL applies)
3. Phase 1 Task 8 (schema migration) must complete before Tasks 9-14 (ingestion scripts)
4. Tasks 15-20 (query/render extensions) can parallelize after Task 8
5. Brady List scraper and NPI ingest require data downloads first (noted in plan)
6. Run quality-gate AFTER Tasks 15-20 execute (those touch .ts UI/logic files)

## Verification
- `node scripts/apply-pending-sql.mjs <(echo "SELECT COUNT(*) FROM officer_reliability;")`, should be 0 pre-Phase 0, 5909 post
- `npx tsc,noEmit src/lib/tier9-reports/query.ts`, verify type safety after extensions
- All 9 Tier 9 tables should have >0 rows after Phase 0 completion

## Ready-to-Paste Prompt for Next Session
```
Execute the implementation plan at
  C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\plans\2026-04-11-data-intelligence-phase0-phase1.md

Spec at:
  C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-04-11-data-intelligence-platform-design.md

Context:
- Phase 0 (Tasks 1-7): Apply 4 fixed SQL files to populate 6 empty Tier 9 tables, fix sub_opinions[0] bug in classify-case-law.mjs, re-run bench_jury_divergence with lower threshold. Tasks 1-4 are independent SQL applies, can parallelize.
- Phase 1 (Tasks 8-23): Schema migration (8 new tables), 5 ingestion/enrichment scripts, query.ts/render.ts/variables.ts extensions, SCHEMA.md update. Task 8 (migration) must complete before Tasks 9-14 (scripts). Tasks 15-20 (query/render extensions) can parallelize after Task 8.
- Spec had 3 critical issues fixed this session: pg_trgm ordering (moved before GIN indexes), CHECK constraint (cardinality instead of array_length), Daubert table name (standardized to daubert_challenge_corpus).
- SUPABASE_ACCESS_TOKEN is in C:\Users\email\projects\ImNotAnAttorney\.env.local (parent repo, not web).
- 6 of 9 Tier 9 tables have 0 rows in production. Phase 0 must complete before Phase 1.
- Start at Task 1.
```
