# Plan: Cron P1 Immediate Fixes

## Context
- **Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
- **Problem:** 4 senior dev agents reviewed all 12 INAA cron routes and found 5 HIGH-severity issues: silent data corruption, credential exposure in email, missing concurrency locks, race conditions, and broken monitoring. These must be fixed before any other cron work.
- **Spec:** `C:\Users\email\projects\ImNotAnAttorney\docs\specs\2026-04-01-cron-review-p1-immediate.md`
- **Key files to read first:**
  - `src/lib/demand/score-demand.ts` (P1-01)
  - `src/lib/cron/batch-poller.ts` (P1-02)
  - `src/app/api/cron/batch-poll/route.ts` (P1-03)
  - `src/app/api/cron/blog-qa/route.ts` (P1-04)
  - `src/app/api/cron/drip/route.ts` (P1-05)
- **Tech stack:** Next.js 15, Supabase, TypeScript
- **Key decisions:** All fixes are surgical 1-5 line edits. No architectural changes. Each fix is independent.
- **Setup:** All source files already read this session.

## Tasks

### Task 1: P1-01 — Fix window_start timestamp drift (DONE)
**File:** `src/lib/demand/score-demand.ts:209`
**Change:** Replace `new Date(now.getTime() - days * 24 * 60 * 60 * 1000)` with midnight-UTC-rounded date.
**Status:** COMPLETED

### Task 2: P1-02 — Remove operator secret from email HTML (DONE)
**File:** `src/lib/cron/batch-poller.ts` (lines 85, 184, 229)
**Change:** Replace `${ctx.operatorSecret}` with `$OPERATOR_SECRET` placeholder in all 3 email templates.
**Status:** COMPLETED

### Task 3: P1-03 — Add idempotency lock to batch-poll route
**File:** `src/app/api/cron/batch-poll/route.ts`
**Change:** Import `acquireCronLock`/`releaseCronLock`, add lock acquisition after auth check with 4-minute window, wrap logic in try/finally with lock release.

### Task 4: P1-04 — Set qa-running status before processing blog drafts
**File:** `src/app/api/cron/blog-qa/route.ts`
**Change:** Before calling `processDraft()`, update draft status to `qa-running`. Add recovery clause to fetch query for drafts stuck in `qa-running` > 10 minutes.

### Task 5: P1-05 — Fix drip gap detection query filter
**File:** `src/app/api/cron/drip/route.ts:106-110`
**Change:** Add `.eq("job", "drip")` filter to the `cron_runs` gap detection query.

### Task 6: Verify TypeScript compilation
Run `npx tsc --noEmit` to confirm no type errors from the changes.
