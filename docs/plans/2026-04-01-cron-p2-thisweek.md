# Plan: Cron P2 This-Week Fixes

## Context
- **Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
- **Problem:** 9 findings from cron review, N+1 query explosions (258-450 queries/run), missing idempotency locks, timeout risks, and monitoring gaps. Not causing active damage but will escalate as system scales.
- **Spec:** `C:\Users\email\projects\ImNotAnAttorney\docs\specs\2026-04-01-cron-review-p2-thisweek.md`
- **Tech stack:** Next.js 15, Supabase, TypeScript
- **Key files to read first:** `ARCHITECTURE.md`, `src/lib/cron-idempotency.ts`, spec file above
- **Key decisions:** N+1 fixes use bulk-fetch-then-filter-in-memory pattern. Atomic lock uses Supabase RPC. after() pattern matches existing demand-fetch/score implementation (commit 5cf6f5a).

## Dependency Map

P2-05 (stale threshold param) must complete before P2-07 (uses new param).
P2-09 (atomic lock RPC) depends on P2-05 (same file).
All others are independent.

## Wave 1, Surgical fixes (parallel, 1-2 files each)

### Task 1: P2-04, Wall-time guard in fetch-signals.ts
**File:** `src/lib/demand/fetch-signals.ts`
Add `Date.now()` deadline check at top of outer subreddit loop. Break after 240s.

### Task 2: P2-08, Decouple state transitions from email delivery
**File:** `src/lib/cron/operator-alerts.ts`
In detectStuckGenerating and detectStuckIBGeneration: move DB status update BEFORE email send.

## Wave 2, N+1 query refactors (parallel, different files)

### Task 3: P2-01, Bulk query refactor in score-demand.ts
**File:** `src/lib/demand/score-demand.ts`
Fetch all reddit_signals for 90d in one query. Bucket by dimension/window in JS. Eliminate Pass 1 re-query.

### Task 4: P2-02, Bulk query refactor in track-performance.ts
**File:** `src/lib/demand/track-performance.ts`
Replace per-post per-window queries with 2-3 bulk queries. Aggregate in JS.

### Task 5: P2-03, Batch writes in classify-llm.ts
**File:** `src/lib/demand/classify-llm.ts`
Collect update payloads per batch, upsert in one call instead of 200 individual UPDATEs.

## Wave 3, Cron infrastructure (sequential, same file)

### Task 6: P2-05, Parametrize stale lock threshold
**File:** `src/lib/cron-idempotency.ts`
Add optional `staleThresholdMs` param to acquireCronLock. Update all callers with appropriate thresholds.

### Task 7: P2-07, Idempotency locks for engine + generate-backup
**Files:** `src/app/api/cron/engine/route.ts`, `src/app/api/cron/generate-backup/route.ts`
Add acquireCronLock/releaseCronLock. Replace inline createClient with createAdminClient. Use staleThresholdMs from Task 6.

### Task 8: P2-09, Atomic lock via Supabase RPC
**Files:** New migration, `src/lib/cron-idempotency.ts`
Create `acquire_cron_lock` plpgsql function. Refactor acquireCronLock to use RPC.

## Wave 4, after() pattern

### Task 9: P2-06, Apply after() to blog-qa and blog-publish
**Files:** `src/app/api/cron/blog-qa/route.ts`, `src/app/api/cron/blog-publish/route.ts`
Same pattern as demand-fetch/score. Move processing into after() callback, return 200 immediately.

## Files to Modify
- `src/lib/demand/fetch-signals.ts` (Task 1)
- `src/lib/cron/operator-alerts.ts` (Task 2)
- `src/lib/demand/score-demand.ts` (Task 3)
- `src/lib/demand/track-performance.ts` (Task 4)
- `src/lib/demand/classify-llm.ts` (Task 5)
- `src/lib/cron-idempotency.ts` (Tasks 6, 8)
- `src/app/api/cron/engine/route.ts` (Task 7)
- `src/app/api/cron/generate-backup/route.ts` (Task 7)
- `src/app/api/cron/demand-fetch/route.ts` (Task 6, caller update)
- `src/app/api/cron/demand-score/route.ts` (Task 6, caller update)
- `src/app/api/cron/blog-qa/route.ts` (Task 9)
- `src/app/api/cron/blog-publish/route.ts` (Task 9)

## Files to Create
- `supabase/migrations/20250101000033_acquire-cron-lock-rpc.sql` (Task 8)

## Verification
TypeScript compilation (`npx tsc,noEmit`) after each wave.
