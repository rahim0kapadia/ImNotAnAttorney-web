# Handoff: Data Orphans + Product-Promise Gaps Worry-to-Pristine

Date: 2026-04-29

## Task

Worry-to-pristine on "we have products that aren't taking advantage of the data we have." Triage data assets ingested into Supabase that don't render in paid INAA-web product tiers — close marketing-promise gaps that create refund risk.

Initial audit (Explore agent) flagged 11 candidate orphan tables + 5 inverse failures (consumer reads, table empty). After R0 swarm-review + path-2 scope cut + R1 swarm-review + R1 fixes, plan narrowed to 6 tasks closing the two highest-leverage refund risks: War Room ($4,997) judge×prosecutor pairing matrix + X-Ray ($2,497) tier-distinct officer cross-case slice.

Phases 1-4 of `worry-to-pristine` complete. Phases 5-7 (execute, pristine code loop, ship) deferred to next session.

## Approach

**Path 2 chosen** at the post-R0 inflection point (41 findings, 14 CRITICAL incl. structural phantom-table issues). Cut scope from 12 tasks → 6 tasks. T3-T11 deferred to follow-up worry `worry-data-orphans-tier-b-c`.

R1 swarm produced 35 findings (8 CRITICAL — all codebase-verified). All 8 CRITICAL fixes applied via Sonnet rewrite. WARNING + SUGGESTION items live in findings file as Phase 5 execution-time guardrails (executor reads them, treats as inline checks not separate gates).

**Plan accepted at R1+fixes per Bootstrap-mode + Apex ship-velocity priority.** No R2 swarm. Findings file is the safety net.

**Experts cited:**
- Primary: April Dunford (`~/.claude/experts/april-dunford.md` — 5-Component Canvas, multi-product positioning, *Obviously Awesome* 2nd ed.)
- Secondary: Alex Hormozi (`~/.claude/experts/alex-hormozi.md` — value equation, tiered-pricing test, cannibalization fix)

## Files Modified

- `docs/plans/2026-04-29-worry-data-orphans-product-gaps.md` — created + 4 revisions (Phase 1 capture, Phase 3 expert-lens draft, spec-critic round 0/1/2 cleanup, path-2 scope cut, R1 fixes pass)
- `docs/plans/2026-04-29-worry-data-orphans-product-gaps-findings.md` — created; lists R0 + R1 swarm findings with fix directions
- `docs/plans/2026-04-29-worry-data-orphans-product-gaps-rounds.md` — created; round log with G1-G8 health-gate status, scope-cut decision, R1 outcome
- `.claude/agent-memory/Explore/data-product-wiring-audit-2026-04-29.md` — updated inline with phantom-table corrections (judge_investments + judge_civil_party_conflicts → actual `judge_conflict_of_interest`, plus 4 false-orphan corrections)

Memory files written:
- `~/.claude/projects/C--Users-email-projects-ImNotAnAttorney-web/memory/pattern-worry-path-2-scope-cut.md`
- `~/.claude/projects/C--Users-email-projects-ImNotAnAttorney-web/memory/gotcha-data-orphan-audit-row-count-insufficient.md`
- `~/.claude/projects/C--Users-email-projects-ImNotAnAttorney-web/memory/gotcha-require-admin-is-api-only.md`
- `~/.claude/projects/C--Users-email-projects-ImNotAnAttorney-web/memory/MEMORY.md` — index pointers added

## What Didn't Work

- **Spec-critic 3-dispatch hard-cap:** R0 = 10/12 fail, R1 = 6/12 fail, R2 = 6/12 fail. Each round found progressively sharper issues (not regression — pedantic refinement). Per skill spec, hit hard-cap and applied final round-2 rewrites mechanically.
- **Initial audit was wrong about 6 of 11 "orphans":** judge_investments + judge_civil_party_conflicts were phantom names (actual: `judge_conflict_of_interest`), and judge_disposition_profile / judge_reversal_rate / judge_sentencing_patterns / officer_reliability were already wired (2-3 production reads each). Caught at R0 by code-reviewer agent.
- **Original plan invented a tier-gate pattern + a typed-contract-for-engine pattern that didn't exist in codebase.** R0 + R1 swarms surfaced both. Plan now uses existing patterns only (SERVICE_UPGRADE_PATH ladder for tier rank; web-only modules with no cross-repo type contracts).
- **TIER_CORE is an OBJECT mixing service + playbook + Tier 9 SKUs**, not a service ladder. Use `SERVICE_UPGRADE_PATH` (5-element array at `tiers.ts:521`) for tier rank comparisons in `requireTier`.
- **`escapeIlike` already exists** at `tier9-reports/query.ts:402` + 11 other inline copies. Plan T0.5 reframed from "create new helper" to "centralize existing helper." Migrating the other 11 sites is out-of-scope.

## Remaining Steps

Phase 5 (Execute), Phase 6 (Pristine code loop), Phase 7 (Ship + memory) remain. Estimated 4-8 hours in a fresh session.

1. **Phase 5 — Execute:** invoke `superpowers:executing-plans` on the plan file. Run T0 → T0.5 → T0.7 → T1 → T2 → T12 in order. Each task has gradeable success criteria. Findings file is the guardrail.
2. **Phase 6 — Pristine loop:** per worry-to-pristine skill, parallel reviewers (code + security + dunford ± adversarial from R4) → cross-validate via Haiku → fix all → re-snapshot tests → repeat until pass-rate ≥ baseline + adversarial clean + pristine-judge true.
3. **Phase 7 — Ship:** `/commit` skill (verify-aware), commit message references plan, write resolved memory, optional Telegram notify.

## Verification

Before starting Phase 5 in the next session, confirm state:

```bash
# 1. Plan + companions exist on master
ls -la "C:/Users/email/projects/ImNotAnAttorney-web/docs/plans/2026-04-29-worry-data-orphans-product-gaps"*

# 2. Audit memo correction landed
head -40 "C:/Users/email/projects/ImNotAnAttorney-web/.claude/agent-memory/Explore/data-product-wiring-audit-2026-04-29.md"

# 3. Memory pointers added
head -30 "C:/Users/email/.claude/projects/C--Users-email-projects-ImNotAnAttorney-web/memory/MEMORY.md"

# 4. Branch state (this session left master untouched + 4 untracked MN-ingest leftovers from earlier session — not this worry's scope)
git -C "C:/Users/email/projects/ImNotAnAttorney-web" status --short
```

## Cutover Retarget (added 2026-04-29 post-handoff)

Initial handoff said "Repo: ImNotAnAttorney-web (master). Per CLAUDE.md cutover: deploys via apps/web in the monorepo. Mirror landing-site changes in both repos."

Subsequent expert triangulation (Sam Newman + Martin Fowler — Strangler Fig pattern) confirmed: this work is `/src/` runtime code, NOT landing-site. Per cutover scope note in CLAUDE.md, /src/ runtime code MUST work in `apps/web` to ship. Mirror-both is Strangler Fig anti-pattern. Plan retargeted; verification of all cited symbols against `apps/web/src/` complete (single drift: `requireAdmin` -web:46 → apps/web:54).

**Execution repo for Phase 5: `C:\Users\email\projects\ImNotAnAttorney\` (monorepo).** Plan + findings + rounds stay in `ImNotAnAttorney-web/docs/plans/` (planning history). All Phase 5 code lands at `apps/web/src/...`. See `2026-04-29-worry-data-orphans-product-gaps-rounds.md` final section for full retarget log.

## Ready-to-Paste Resume Prompt

```
Continue from C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-29-data-orphans-worry-to-pristine.md

Phases 1-4 of worry-to-pristine done. Plan accepted at R1+fixes per path-2 ship-velocity + apps/web cutover-retarget applied. Run Phase 5 (execute) → Phase 6 (pristine code loop) → Phase 7 (ship).

Plan: C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-29-worry-data-orphans-product-gaps.md
Findings (Phase 5 guardrails): C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-29-worry-data-orphans-product-gaps-findings.md
Round log (incl. cutover-retarget log): C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-29-worry-data-orphans-product-gaps-rounds.md

EXECUTION REPO: C:\Users\email\projects\ImNotAnAttorney\ (monorepo apps/web — deploy-active). NOT -web. Branch off origin/master via worktree per pattern-worktree-per-pr-from-master memory.

All file-creation paths in plan resolve as relative src/lib/... under apps/web/. The one drift: requireAdmin at apps/web/src/lib/auth/guards.ts:54 (was -web:46). All other cited symbols verified at exact same line numbers in apps/web — see rounds doc for full verification log.

Use superpowers:executing-plans on the plan file. T0 → T0.5 → T0.7 → T1 → T2 → T12 sequential. Findings file lists all WARNING/SUGGESTION as inline guardrails (not gates) — incorporate during implementation.

After all tasks complete, run worry-to-pristine Phase 6 (parallel reviewers, cross-validate, fix, re-snapshot tests, repeat until clean). Then Phase 7 (/commit, write resolved memory, optional Telegram).

If Phase 6 swarm references file paths in -web, treat them as apps/web equivalents (audit memo + R0/R1 findings reference relative src/lib/... paths that resolve correctly under apps/web root).
```
