## Context
- **Repo:** C:/Users/email/projects/ImNotAnAttorney-web
- **Problem:** The monolithic `src/app/api/cron/drip/route.ts` is 2095 lines. All 19 task functions have already been extracted into `src/lib/cron/*.ts` (8 files). The route file still contains the original inline implementations instead of importing and calling the extracted functions.
- **Key files to read first:**
  - `src/app/api/cron/drip/route.ts` — current monolith to replace
  - `src/lib/cron/types.ts` — CronContext, CronResult, mergeResults
  - `src/lib/cron/*.ts` — 8 task files with exported functions
- **Tech stack:** Next.js App Router, Supabase, TypeScript
- **Key decisions:** Keep heartbeat gap detection inline (~15 lines, runs before tasks). Use a TASKS registry array for sequential execution with per-task error isolation. Preserve exact auth guard, advisory lock, and cron_runs insert patterns from original.
- **Setup/prerequisites:** All 8 cron task files must already exist in `src/lib/cron/`

## Plan

### Step 1: Rewrite route.ts (~120 lines)
- **File:** `src/app/api/cron/drip/route.ts`
- **Action:** Complete rewrite — replace 2095-line monolith with thin orchestrator
- **Preserves from original:**
  - `requireCron(req)` auth guard
  - Advisory lock via `acquire_cron_lock` / `release_cron_lock` RPCs with `lock_key: 1`
  - Heartbeat gap detection (Part 0) inline
  - `cron_runs` insert at end (no `ran_at` — DB default)
  - `GET` export (Next.js route convention)
- **New structure:**
  - Import all 22 task functions from 8 cron files
  - Define TASKS registry array with name + fn pairs
  - Loop through tasks with try/catch per task for error isolation
  - Merge results and record run

### Step 2: Verify
- `npx tsc --noEmit --skipLibCheck` — must pass
- `wc -l src/app/api/cron/drip/route.ts` — should be ~120-150 lines

### Step 3: Commit
- `git commit -m "refactor(cron): replace 2087-line handler with thin orchestrator + isolated tasks"`
