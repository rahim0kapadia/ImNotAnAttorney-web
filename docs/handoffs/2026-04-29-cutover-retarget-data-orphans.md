# Handoff: Data Orphans + Product-Promise Gaps — apps/web Cutover Retarget

Date: 2026-04-29

## Task

Pre-Phase-5 review of plan `2026-04-29-worry-data-orphans-product-gaps.md` (Phases 1-4 done in prior session). Goal: enter `superpowers:executing-plans` and run T0 → T0.5 → T0.7 → T1 → T2 → T12.

Step 1 of executing-plans skill caught a structural blocker: plan paths target `ImNotAnAttorney-web/src/...` but per CLAUDE.md cutover note + `gotcha-vercel-project-cutover-silent-abandon.md`, -web has been read-only-for-deploys since 2026-04-28. apps/web monorepo is deploy-active. Executing the plan against -web would have shipped nothing — same fate as PR #219.

This session: triangulated Strangler Fig pattern (Sam Newman + Martin Fowler), verified plan-cited symbols against `apps/web/src/`, retargeted plan + findings + rounds + handoff. Phase 5 ready to run against monorepo.

## Approach

Strangler Fig pattern (Sam Newman, *Monolith to Microservices* O'Reilly + Martin Fowler, bliki StranglerFigApplication 2004) is unambiguous on this case: new code goes only to deploy-active tree. Mirror-both is the named anti-pattern (synchronization debt without convergence).

Triangulation 3-angle test passed for both:
- BUILT: Newman's book + samnewman.io page; Fowler coined the term
- CITED: AWS Prescriptive Guidance + Microsoft Learn Azure docs reference both
- ACTIVE: samnewman.io + martinfowler.com still updated; AWS docs current

Sources fetched this turn:
- https://samnewman.io/patterns/refactoring/strangler-fig-application/
- https://martinfowler.com/bliki/StranglerFigApplication.html

Verified all plan-cited symbols exist in `apps/web/src/` at same line numbers (single drift `requireAdmin` -web:46 → apps/web:54). Most plan refs use relative `src/lib/...` paths — portable across both trees.

## Files Modified

- `docs/plans/2026-04-29-worry-data-orphans-product-gaps.md` — header retarget block, execution-repo note, `requireAdmin` line drift `:46→:54`, operator-route ref drift `:20-22→:15+21`
- `docs/plans/2026-04-29-worry-data-orphans-product-gaps-findings.md` — cutover-note header (relative paths portable, no rewrite needed)
- `docs/plans/2026-04-29-worry-data-orphans-product-gaps-rounds.md` — full Cutover-retarget section appended (Strangler Fig sources, verification matrix, cascade)
- `docs/handoffs/2026-04-29-data-orphans-worry-to-pristine.md` — Cutover Retarget block + rewritten resume prompt pointing at `ImNotAnAttorney/` monorepo
- `~/.claude/projects/C--Users-email-projects-ImNotAnAttorney-web/memory/pattern-pre-phase-5-execution-target-verify.md` — new memory: pattern for catching this earlier
- `~/.claude/projects/C--Users-email-projects-ImNotAnAttorney-web/memory/MEMORY.md` — index pointer added

## What Didn't Work

- **executing-plans skill stopped at Step 1.** Correctly — that's what it's for. SKIP'd with reason; will be re-invoked in next session against retargeted plan.
- **Glob patterns with literal `[token]` in path.** Glob interprets brackets as char-class; Grep + Bash ls work fine. Used Grep/Bash instead.
- **port-triage CLI rejected `"web"` as source-project name** — needs absolute Windows path. Logged twice with `C:\\Users\\email\\projects\\ImNotAnAttorney` + `C:\\Users\\email\\projects\\ImNotAnAttorney-web` separately to satisfy hook on cross-project text.

## Verification Matrix (recorded in rounds doc)

| Symbol | -web ref | apps/web ref | Status |
|---|---|---|---|
| `SERVICE_UPGRADE_PATH` | `tiers.ts:521` | `tiers.ts:521` | EXACT |
| `Phase2Data` interface | `variables.ts:56-57` | `variables.ts:56-57` | EXACT |
| `judge_prosecutor_pairings` 3 reads | `defense-intelligence/query.ts:399` + `tier9-reports/query.ts:797` + `tier9-reports/coverage.ts:100` | same | EXACT |
| `officer_reliability` reads | `tier9-reports/query.ts:869,877` | same | EXACT |
| `MINIMUM_SAMPLE_SIZE = 5` | `defense-intelligence/query.ts:145` | same | EXACT |
| `requireAdmin` | `auth/guards.ts:46` | `auth/guards.ts:54` | DRIFT +8 |
| middleware matcher | `:280-298` | `:280-298` | EXACT |
| `rate-limit-durable/upstash.ts` | exists | exists | EXACT |
| inline `escapeIlike` count | 12 files | 12 files | EXACT |

## Remaining Steps

1. **Phase 5 — Execute** (4–8 hrs in fresh session). Branch off `ImNotAnAttorney/master` via worktree at `.claude/worktrees/data-orphans-product-gaps/` per `pattern-worktree-per-pr-from-master`. Invoke `superpowers:executing-plans` on the plan file. Run T0 → T0.5 → T0.7 → T1 → T2 → T12 sequential.
2. **Phase 6 — Pristine code loop.** Parallel reviewers (code + security + april-dunford ± adversarial) → cross-validate via Haiku → fix all → re-snapshot tests → repeat until pass-rate ≥ baseline + adversarial clean.
3. **Phase 7 — Ship.** `/commit` skill (verify-aware), commit message references plan, write resolved memory, optional Telegram notify.

## Verification

Before starting Phase 5 in next session, confirm state:

```bash
# 1. Plan + companions exist + retarget block present
cat "C:/Users/email/projects/ImNotAnAttorney-web/docs/plans/2026-04-29-worry-data-orphans-product-gaps.md" | head -20

# 2. apps/web cited symbols still at expected line numbers (in case master moved)
node -e "process.exit(require('fs').readFileSync('C:/Users/email/projects/ImNotAnAttorney/apps/web/src/lib/tiers.ts','utf8').split('\\n')[520].includes('SERVICE_UPGRADE_PATH') ? 0 : 1)"

# 3. Monorepo branch state clean
git -C "C:/Users/email/projects/ImNotAnAttorney" status --short
git -C "C:/Users/email/projects/ImNotAnAttorney" branch --show-current
```

## Ready-to-Paste Resume Prompt

```
Continue from C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-29-cutover-retarget-data-orphans.md

Phases 1-4 of worry-to-pristine done + apps/web cutover-retarget applied. Run Phase 5 (execute) → Phase 6 (pristine code loop) → Phase 7 (ship). Don't ask permission. Decide via expert triangulation. Log all hook markers (TRIAGED / WEBSEARCHED / ROOT / OVERRIDE / etc) yourself. Only stop on: missing credential, destructive-action approval, or genuine blocker requiring my context.

Plan: C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-29-worry-data-orphans-product-gaps.md
Findings (Phase 5 guardrails): C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-29-worry-data-orphans-product-gaps-findings.md
Round log (incl. cutover-retarget log): C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-29-worry-data-orphans-product-gaps-rounds.md

EXECUTION REPO: C:\Users\email\projects\ImNotAnAttorney\ (monorepo apps/web — deploy-active). NOT -web. Branch off origin/master via worktree per pattern-worktree-per-pr-from-master memory. All file-creation paths in plan resolve as relative src/lib/... under apps/web/.

Use superpowers:executing-plans on the plan file. T0 → T0.5 → T0.7 → T1 → T2 → T12 sequential. Findings file lists all WARNING/SUGGESTION as inline guardrails (not gates) — incorporate during implementation. After all tasks complete, run worry-to-pristine Phase 6 (parallel reviewers, cross-validate, fix, re-snapshot tests, repeat until clean). Then Phase 7 (/commit, write resolved memory, optional Telegram).
```
