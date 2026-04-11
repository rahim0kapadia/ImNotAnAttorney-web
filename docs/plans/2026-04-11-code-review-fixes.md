# Code Review Fixes — 2026-04-11

## Context
3-agent parallel code review found 5 actionable issues in this session's changes. Fixes are mechanical — no design decisions.

## Files to Modify
1. `scripts/e2e-playbook-visual.mjs` — already fixed (waitForFunction args)
2. `src/lib/types/operator.ts` — already fixed (amount_cents → amount)
3. `src/app/api/operator/cases/[id]/route.ts` — already fixed (amount_cents → amount)
4. `review-report.mjs` — already fixed (amount_cents → amount)
5. `src/app/api/cron/reddit-monitor/route.ts` — add https:// prefix to blog URL, add retry for partial Telegram send
6. `src/app/operator/cases/[id]/page.tsx` — amount_cents → amount (awaiting a11y review)

## Files to Create
None.

## Tasks
1. [DONE] Fix #1: waitForFunction Playwright args — add `undefined` as second arg (3 occurrences)
2. [DONE] Fix #4: amount_cents → amount in operator API route, types, review-report
3. Fix #6: Add https:// prefix to blog URL in reddit-monitor Telegram draft
4. Fix #2: Add retry logic for partial Telegram send (msg 1 ok, msg 2 fails)
5. Fix #4 (page.tsx): amount_cents → amount in operator page component (blocked on a11y review)
6. Type check: verify all changes compile clean
