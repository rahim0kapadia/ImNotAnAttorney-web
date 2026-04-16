# Handoff: Monitoring Terminal State
Date: 2026-04-09 19:30

## Task
Close the dead end in the cases state machine where War Room and Situation Room engagements entered `monitoring` after delivery but had no outbound transition. This was priority 1 item 3 from the session 2 handoff at `docs/handoffs/2026-04-09-post-handoff-session-2.md`, unblocked by engine commits `90e0967` (Phase 6 delivery DAG) and `61c69c2` (Phase 5 attack chain).

## Approach
Added a new `completed` terminal status with both an operator manual transition path and a 365-day cron auto-close safety cap. The 365-day cap was chosen to match the existing `report_token_expires_at` 12-month window. A dedicated `cases.completed_at` column was designed per Martin Fowler's Temporal Property pattern but deferred due to the migration approval gate in the pre-tool-use hook. The `operator_tasks.created_at` row serves as the authoritative closure timestamp until that column lands.

## Files Modified
- `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\types\operator.ts`, added `completed` to CaseStatus union, added `monitoring: ["completed"]` to ALLOWED_TRANSITIONS, updated terminal statuses comment
- `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\cron\monitoring.ts`, added cron Part 21 `closeStaleMonitoring()` with batched subscriber and dedup lookups, atomic status update race guard, Atticus-voice closure email with engagement summary, operator_tasks insert for audit trail
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\cron\drip\route.ts`, imported `closeStaleMonitoring`, wired into TASKS array after `escalateGuarantees`
- `C:\Users\email\projects\ImNotAnAttorney-web\supabase\CONTEXT.md`, updated state machine ASCII diagram, Status Definitions table, ALLOWED_TRANSITIONS code snippet
- `C:\Users\email\projects\ImNotAnAttorney-web\supabase\SCHEMA.md`, added `completed_at` column reference to cases table
- `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-09-monitoring-terminal-state.md`, full plan artifact with design rationale and explicit non-goals

## What Didn't Work
- Attempted to create `supabase/migrations/20260409f_cases_completed_at.sql` for the dedicated `completed_at` column. Blocked by the pre-tool-use hook migration approval gate which requires `migrationApproved: true` in triage. Deferred the column to a follow-up session. The cron Part 21 works without it by using `operator_tasks.created_at` as the closure timestamp.
- First plan file write was blocked by the abbreviation detection hook. Removed all slash-separated abbreviations (WR/SR became War Room and Situation Room) and other detected abbreviation patterns.
- Second plan file write was also blocked for the same pattern. Required fully expanding every abbreviation in the document.
- Edit to update the plan with the migration deferral was blocked by the decision-assertion hook because the text contained "I'll just" without expert triangulation. Required a WebSearch for Martin Fowler's Temporal Property pattern to ground the schema decision before the edit was allowed.

## Parallel Sessions Detected (DO NOT TOUCH)
At least 3 other sessions have extensive uncommitted work in the repo. This session deliberately stayed out of their scope:

1. Blog engine port session, deleting old `src/lib/blog-generation/*` libs, rewriting cron routes to enqueue engine processing_jobs, adding new QA modules (`qa-anti-hallucination.ts`, `qa-dna.ts`), adding `content/voice-profiles/` with 4 category voice profiles
2. Data-driven defense intelligence session, 9+ new `scripts/bulk-*.mjs` scripts, plan files, migration `20260409e_processing_jobs_nullable_case_id.sql`
3. Bulk verification pipeline session, `scripts/task-*-apply*.mjs`, large data file diffs in `data/bulk-verify/`

## Remaining Steps

### Deferred from this session (ready to execute)
1. Apply the `cases.completed_at` migration. The SQL is documented in the plan file section "Decision on closure timestamp column, deferred". Requires a session with migration approval. After migration applies, update `src/lib/cron/monitoring.ts` Part 21 to write `completed_at` alongside the status update.

### Blocked on engine repo (not this repo)
2. Witness Pack job routing at the new dispatcher. Lives in `ImNotAnAttorney-engine/src/lib/worker-pipeline.mjs`. Engine session owns this. Was priority 1 item 2 from the session 2 handoff.

### Observed but deferred
3. 7-day warning email before auto-close. Explicit non-goal for this session. Defer until the first War Room or Situation Room case approaches 365 days (earliest around 2027-03-28).
4. CV probe drift in `inna.cv.json` line 143 (CRON_SECRET should be requireCron). Needs a separate CV-repo session. Not fixable from this repo.
5. Merge-watch `supabase/SCHEMA.md` when engine session Phases 7-8 land (they may add columns to `processing_jobs`).
6. Check for merge conflicts with parallel blog-engine-port session on `src/app/api/cron/drip/route.ts` once that session commits.

## Verification
- `npx tsc,noEmit,skipLibCheck`, TypeScript clean, run from repo root
- `git log,oneline -3`, should show `ed073eb feat(monitoring): WR/SR terminal state + 365-day auto-close safety cap` as latest
- Grep `"monitoring"` and `'monitoring'` in `src/` to confirm all references still make sense with the new terminal status
- Grep `closeStaleMonitoring` in `src/` to confirm it appears in both `monitoring.ts` (definition) and `drip/route.ts` (wiring)

## Commits Shipped This Session
1. `ed073eb`, feat(monitoring): WR/SR terminal state + 365-day auto-close safety cap (6 files, +389 -7)

## Ready-to-Paste Next Session Prompt
```
Continue from handoff at:
  C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-09-monitoring-terminal-state.md

Commit ed073eb shipped in session 3. Priority for next session:

1. Apply the deferred cases.completed_at migration (requires
   migrationApproved: true in triage):
     supabase/migrations/20260409f_cases_completed_at.sql
   Spec is in the plan at:
     C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-09-monitoring-terminal-state.md
   Section: "Decision on closure timestamp column, deferred"
   Single column + partial index, forward-only, idempotent. After migration
   applies, update src/lib/cron/monitoring.ts Part 21 to write completed_at
   alongside the status update.

2. Check for merge conflicts with the 3 parallel sessions once they commit.

Do NOT touch the parallel sessions' uncommitted work (voice-profiles,
bulk-*, blog-engine-port).
```
