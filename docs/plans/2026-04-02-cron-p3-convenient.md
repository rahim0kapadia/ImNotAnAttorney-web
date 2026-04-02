# Plan: Cron P3 Convenient Fixes

## Context
- **Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
- **Spec:** `C:\Users\email\projects\ImNotAnAttorney\docs\specs\2026-04-01-cron-review-p3-convenient.md`
- **Problem:** 16 code quality findings — correctness, naming, validation, cleanup. No active damage.
- **Tech stack:** Next.js 15, Supabase, TypeScript
- **Pre-done by P2:** P3-05 (ALL_TIME_START constant), P3-06 (named constant), P3-13 (createAdminClient)

## Files to Modify
- `src/lib/demand/classify-llm.ts` (P3-01, P3-02, P3-03)
- `src/lib/demand/track-performance.ts` (P3-04, P3-05 rename field)
- `src/lib/demand/score-demand.ts` (P3-07, P3-08)
- `src/lib/blog-generation/publish.ts` (P3-09, P3-10)
- `src/lib/cron/compliance.ts` (P3-11, P3-16)
- `src/lib/cron/batch-poller.ts` (P3-12)
- `src/app/api/cron/engine/route.ts` (P3-14 docstring)
- `src/app/api/cron/generate-backup/route.ts` (P3-14 docstring)
- `src/app/api/cron/batch-poll/route.ts` (P3-14 docstring)
- `src/lib/cron/drip-post-purchase.ts` (P3-15)

## Tasks
1. P3-01: Replace regex JSON extraction with structured prompt + JSON.parse
2. P3-02: Add VALID_TONES set, validate emotional_tone before DB write
3. P3-03: Throw on empty reference data in loadReferenceData
4. P3-04: Throw on error from content_posts query in track-performance
5. P3-05: Rename demand_score field to demand_score_7d (make time-scope explicit)
6. P3-07: Fix percentileRank to compare apples-to-apples (raw counts)
7. P3-08: Replace Math.min/max spread with reduce in emerging topics
8. P3-09: Cap resolveUniqueSlug at 3 attempts
9. P3-10: Remove INDEXNOW_KEY hardcoded fallback
10. P3-11: Fix cleanup to use intake-to-case FK instead of email match
11. P3-12: Fix stripSections h3 heading skip logic
12. P3-14: Fix CRON_SECRET → CRON_AUTH_TOKEN in 3 docstrings
13. P3-15: Rename thirtyDaysAgo → ninetyDaysAgo
14. P3-16: Add cron_executions cleanup to compliance task
