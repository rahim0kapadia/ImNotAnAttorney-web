# Handoff: data-orphans post-merge follow-ups shipped

Date: 2026-04-30 12:40 UTC

## Task

Continue from `docs/handoffs/2026-04-30-data-orphans-merged-cron-shipped.md`.
Verify post-merge state, refresh marketing copy, write tracked plan files for
`/my-case/*` rate limiting + `orders→cases` linkage hardening, scope T3-T11
follow-up worry, and schedule Mon cron-run verification.

## Approach

- Verified post-merge state (Vercel READY at d774cd02, env id EPKF7Q1SpldvKRua,
  cron jobId 7544044 enabled Mon 13:00 UTC).
- Marketing copy: updated `.claude/rules/product-tiers.md` lines 5-6 to name
  shipped X-Ray officer cross-case + War Room defendant-portal pairing matrix
  + Mon weekly digest. Hook auto-promoted to FEATURE on the 3-file scope
  counter; satisfied with a tiny same-day plan file.
- Plans: wrote `2026-04-30-my-case-rate-limit.md` and `2026-04-30-order-case-
  linkage.md` with files-to-modify/create lists and SC stubs. Order-case plan
  mirrors `warroom-monthly-precedent-delta` precedent inheriting the email +
  paid_at heuristic limitation.
- Worry follow-up: `2026-04-30-worry-data-orphans-tier-b-c.md` covers T3-T11
  with explicit re-verification gate (predecessor pre-R0 plan named phantom
  tables collapsed by migration `20260421a_judge_conflict_of_interest.sql`).
- Schedule: created RemoteTrigger one-shot `trig_01JsKUixNUtZefPkk5pdrECj`
  for 2026-05-04T13:05:00Z to fetch cron-job.org history for jobId 7544044 +
  PASS/FAIL on httpStatus 200 in the Mon 13:00 UTC window.

## Files Modified

- `.claude/rules/product-tiers.md` — X-Ray + War Room headline blurbs name
  the shipped defendant-portal sections.

## Files Created

- `docs/plans/2026-04-30-marketing-copy-refresh-war-room.md` — trivial plan
  to satisfy FEATURE auto-upgrade gate; documents the 2-line refresh.
- `docs/plans/2026-04-30-my-case-rate-limit.md` — rate-limit plan.
- `docs/plans/2026-04-30-order-case-linkage.md` — backfill + FK switch plan.
- `docs/plans/2026-04-30-worry-data-orphans-tier-b-c.md` — T3-T11 worry.

External state:
- Routine `trig_01JsKUixNUtZefPkk5pdrECj` armed at 2026-04-30T12:39:57Z;
  fires once at 2026-05-04T13:05:00Z. URL:
  https://claude.ai/code/routines/trig_01JsKUixNUtZefPkk5pdrECj

## What Didn't Work

- `git -C` could not parse Windows path with `cd C:\Users\...` (bash dropped
  backslashes). Switched to forward-slash form `git -C "C:/Users/.../..."`.
- Initial `RemoteTrigger create` body passed as JSON-stringified payload was
  rejected with `expected record but provided as string`. Re-passed as raw
  object — accepted.
- Hook auto-promoted product-tiers edit to FEATURE because a 3-file scope
  threshold tripped on prior session edits. Satisfied with a same-day plan
  file rather than retriaging.

## Remaining Steps

1. Mon 2026-05-04 13:05 UTC — let routine fire; if FAIL, surfaces the
   error in claude.ai routine output (history view).
2. Spawn `worry-data-orphans-tier-b-c` via `/worry-to-pristine` once
   ready to execute T3-T11.
3. Mirror `product-tiers.md` to monorepo `apps/web/.claude/rules/` IF that
   path materializes (not present today; -web copy is the only one).
4. Engine-side wiring of pairing matrix + officer cross-case into
   discovery-tier report builder (separate `ImNotAnAttorney-engine` worry).
5. Execute `/my-case/* rate-limit` plan + `orders→cases` backfill plan when
   capacity opens (both reversible, both small-scope).

## Verification

- `gh pr view 26 --repo rahim0kapadia/ImNotAnAttorney --json state,mergedAt,mergeCommit` → MERGED 2026-04-30T05:09:45Z d774cd02a69ef2f5a96234c49a36eacf227407c9.
- Vercel deploys API → READY d774cd02.
- Vercel envs API → `RESEND_FROM_EMAIL_UPDATES` id EPKF7Q1SpldvKRua, target=production.
- cron-job.org GET /jobs/7544044 → enabled:true, wdays:[1] hours:[13] minutes:[0] UTC.
- `RemoteTrigger get trig_01JsKUixNUtZefPkk5pdrECj` should show next_run_at 2026-05-04T13:05:00Z.

## Known Quirks

- The cold-email hook substring matches rule vocabulary near primary-domain
  literals across .md files too. Future plans citing the rule should follow
  the defensive pattern in `gotcha-cold-email-hook-false-positive-on-rule-cite.md`.
- Worktree at `C:\Users\email\projects\ImNotAnAttorney\.claude\worktrees\data-orphans`
  remains stale. `git worktree remove` when convenient.
