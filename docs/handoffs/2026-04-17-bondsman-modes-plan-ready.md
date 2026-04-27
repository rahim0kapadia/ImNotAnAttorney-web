# Handoff: Bondsman Modes Plan v2 Ready for Execution

**Date:** 2026-04-17
**Triage tier:** LARGE_BUILD
**Status:** Phase 0 design + v1 plan + 7-reviewer audit + v2-diffs complete. Implementation not yet started.

## Task

Ship the bondsman check-in / referral mode toggle for INAA-web. Per-partner `partners.check_in_enabled` boolean drives three URL surfaces:
- `/checkin/{CODE}` — new signup page + OG (Check-in mode bondsman hands this to clients)
- `/court-date/{CODE}` — new bridge + OG (Referral mode bondsman hands this)
- `/r/{CODE}` — legacy alias, server-branched on the flag for pre-existing collateral

Plus cron filtering, dashboard toggle, compliance-report gating, 18 code+copy files touched.

## Approach

### What was decided

1. **A (not B) for Amendment 9** — new `/checkin/[code]/page.tsx` signup page wrapping `CourtReminderForm`, not an extension of `/r/[code]/reminders`. Rationale: URL-as-category positioning (Dunford), speakable-at-jail-desk test (Suby), glance-clarity at 3AM (Laja). See `docs/plans/2026-04-17-modes-design.md` §10.
2. **URL shapes:** `/checkin/{CODE}` (check-in) and `/court-date/{CODE}` (referral). Alternatives `/referral/` and `/ready/` rejected — not defendant-first category.
3. **Amendment 6 locked:** discount framing relational ("because {partner} sent you…"), URL carries code, no client-facing code drops. Applied to both modes across every surface.
4. **Funnel unified:** check-in signup post-submit redirects to `/r/{CODE}?fromCheckin=1` (NOT `/prep/{token}`) so both modes converge on the quiz → product ladder.
5. **Post-review fixes (110 items):** consolidated in findings doc with severity-graded fix decisions. V2-diffs overlay supersedes v1 per task.

### Why

Expert cascade: Dunford (positioning), Laja (CRO), Suby (offer clarity), Atticus/UPL (brand + legal safety), plus code-reviewer + security-auditor + accesslint. Fixes trace to explicit finding IDs. Every decision passes cascade test (us / bondsman / defendant / downstream / ecosystem / future-us).

## Files Modified

Plan artifacts (all new this session):
- `docs/plans/2026-04-17-modes-design.md` — Phase 0 design doc (URL shapes, OG copy, Amendment 9 resolution, sign-off gates)
- `docs/plans/2026-04-17-bondsman-modes-implementation.md` — v1 32-task implementation plan (now superseded by v2-diffs)
- `docs/plans/2026-04-17-bondsman-modes-findings-and-fixes.md` — consolidated 110 review findings with severity + fix decisions
- `docs/plans/2026-04-17-bondsman-modes-implementation-v2-diffs.md` — v2 overlay (new code per task, new subtasks, sign-off gates)

Memory files (durable insights):
- `~/.claude/projects/C--Users-email-projects-ImNotAnAttorney-web/memory/gotcha-postgrest-inner-join-requires-fk.md`
- `~/.claude/projects/C--Users-email-projects-ImNotAnAttorney-web/memory/pattern-parallel-domain-reviewers.md`
- MEMORY.md — index updated

No code modified. No migrations applied. No routes created. Everything is still plan/docs only.

## What Didn't Work

1. **First review batch died silently.** 3 of 7 reviewers (Laja, Suby, code-reviewer) lost their task IDs mid-session without completion notifications. Had to relaunch. Lesson captured in `pattern-parallel-domain-reviewers.md`.
2. **Initial review prompts got Sonnet-blocked.** `code-reviewer` + `accesslint:reviewer` rejected with "decision/research keyword requires Opus." Re-dispatched with `model: "opus"`.
3. **v1 plan's cron filter `partners!inner(check_in_enabled)` was wrong.** Silently no-ops because `court_reminders.partner_promo_code` is plain text (no declared FK). Caught in security + correctness reviews. V2 swaps to `.in(enabledCodes)` pre-fetch pattern.
4. **v1 Task 11 left post-submit redirect on CourtReminderForm's default `/prep/{token}`.** Skips the quiz→product funnel — broke Dunford's unified-product thesis. V2 adds `redirectTo` prop on the form.

## Remaining Steps (for next session)

1. **Execute v2 plan** in fix-ordering sequence from `2026-04-17-bondsman-modes-findings-and-fixes.md`:
   - Phase 1: Migration (schema + rollback + invariant check)
   - Phase 2: Cron PostgREST fix (pre-fetch enabledCodes)
   - Phase 3: CourtReminderForm props extension
   - Phase 4: Signup page, BridgePage, OG routes, legacy /r branching
   - Phase 5: Printed collateral (card + checklist)
   - Phase 6: Dashboard surfaces (Toolkit demotion, WorkflowToggle, FlipBanner, ClientTracker)
   - Phase 7: Templates (MessageTemplates, CreativeAssets, PartnerApplicationForm)
   - Phase 8: API hardening (source allowlist, PATCH allowlist, rate-limit, audit log)
   - Phase 9: Tests + DevOps (seeded partners, ComplianceReportClient enumeration, CSP smoke)
   - Phase 10: Cleanup (helper extractions, `.maybeSingle()` standardization)
2. **Write follow-up handoff docs** (tracked out-of-scope):
   - `docs/handoffs/2026-04-18-bridge-page-attorney-framing-rewrite.md` (UPL Finding 1)
   - `docs/handoffs/2026-04-18-bondsman-apply-approval-gate.md` (Security H2 admin gate)
3. **Sanity query before migration** — already specified in v1 Task 1; no changes needed.
4. **Deploy dark first** (`NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED=false`), flip after verify.

## Verification

Before merging v2 implementation PR:

- `npx tsc --noEmit --skipLibCheck > /tmp/tsc.log 2>&1 && echo OK` — every commit
- `npm test` — unit suite clean
- `npx playwright test` — e2e green (requires `E2E_SEED_READY=1` + seeded fixture partners from Task 32 Step 0)
- `node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends` — post-deploy CV
- Integration test against supabase-local for cron filter (new test `tests/integration/cron-check-in-referral-mode.test.ts`)

Sign-off gates (full list in v2-diffs bottom section): migration atomic, cron uses `.in(enabledCodes)`, form supports new props, all em-dashes removed, 44×44 touch targets, no `text-zinc-500` on `text-xs`, etc.

## Ready-to-paste prompt for next session

```
Execute v2 of the bondsman modes plan. Read in order:
  1. C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-17-bondsman-modes-implementation-v2-diffs.md
  2. C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-17-bondsman-modes-findings-and-fixes.md
  3. C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-17-bondsman-modes-implementation.md (v1 task structure; v2-diffs overrides where specified)

Use superpowers:subagent-driven-development. Follow the "Fix ordering for v2 plan" list in the findings doc. Log LARGE_BUILD triage before first Write (hook-enforced). Run `npx tsc --noEmit --skipLibCheck` before every commit. Em-dashes (&mdash; and unicode) banned in new copy — use commas or periods. 44×44 touch targets on every new interactive element. No `text-zinc-500` on `text-xs` text in new code.
```
