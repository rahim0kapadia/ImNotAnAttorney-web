# Handoff: data-orphans tier-B/C T9 shipped

Date: 2026-04-30

## Task

Execute `docs/plans/2026-04-30-worry-data-orphans-tier-b-c.md` starting at Phase 0
(extend diag for 5 new tables + T5 coverage probe), then R0 swarm with code-reviewer
+ security-auditor + april-dunford. Defer T8/T10/T11 to schema-cleanup worry.

## Approach

- Phase 0 ran extended diag (`--set=tier-bc`) + extras + judge-resolver probes.
  Verified the predecessor R0 finding C1 was wrong: `judge_conflict_of_interest`
  (the named collapse target) does not exist in live DB. Phantom-of-phantoms.
  Live tables `judge_investments` + `judge_civil_party_conflicts` exist. T5
  has only 2 distinct judges = data-coverage blocker. T6 has 0.003% defense_theories
  rows = drop dimension. T9's `case_law_references` is empty.
- R0 dispatched 3 reviewers parallel (Opus). 30 findings (11 CRITICAL).
  All three: revise-and-rerun. Cross-reviewer convergence on migration shape
  (3-col + ON CONFLICT + tenant prefix), per-row source-URL guards, T4 IB-vs-X-Ray
  tier placement, T9 gate-at-read-sites pattern.
- Path-2a scope cut: ship T9 only this round. T3/T4/T5/T6/T7 stack to follow-up
  worry `data-orphans-tier-b-c-r2` with all R0 findings as inheritable guardrails.
- Shipped T9 in monorepo (apps/web): migration + 3 read-site gates +
  C10 diag-script patch.

## Files Modified

In monorepo `C:\Users\email\projects\ImNotAnAttorney\` on branch
`feat/data-orphans-tier-bc` (worktree
`C:\Users\email\projects\ImNotAnAttorney\.claude\worktrees\data-orphans-tier-bc`):

- `apps/web/supabase/migrations/20260430a_case_law_references_flag.sql` — NEW
- `apps/web/scripts/diag-data-orphans-schema.mjs` — extended `--set=tier-bc|tier-a|both`,
  added `total_cases` to T5 candidate column list (R0 C10 fix).
- `apps/web/scripts/diag-tier-bc-extras.mjs` — NEW (Phase 0 extras)
- `apps/web/scripts/diag-judge-resolver.mjs` — NEW (Phase 0.5 supplementary probe)
- `apps/web/src/app/my-case/[token]/page.tsx` — added `isFeatureEnabled` gate on
  case_law_references citation-count fetch.
- `apps/web/src/app/api/operator/cases/[id]/route.ts` — same gate on operator
  citations list.
- `apps/web/supabase/functions/generate-report/index.ts` — Deno Edge Function
  inline `feature_flags` lookup (since `lib/feature-flags.ts` is Node-only).

In `-web` (uncommitted, see Remaining Steps §1):

- `docs/plans/2026-04-30-worry-data-orphans-tier-b-c.md` — amended (Phase 0
  reality + Path-2a scope cut)
- `docs/plans/2026-04-30-worry-data-orphans-tier-b-c-findings.md` — NEW (Phase 0
  schema verdicts per task)
- `docs/plans/2026-04-30-worry-data-orphans-tier-b-c-rounds.md` — NEW (R0 swarm
  log + Path-2a CASCADE)

## External State

- **Monorepo PR #28** (open):
  https://github.com/rahim0kapadia/ImNotAnAttorney/pull/28
  - Branch `feat/data-orphans-tier-bc` off `origin/master` (rooted clean —
    no sibling-session contamination).
  - Commit `348dfcac` — `feat(data-orphans-tier-bc T9): case_law_references
    feature-flag gate` (7 files / +647 / -69).
- Worktree at `C:\Users\email\projects\ImNotAnAttorney\.claude\worktrees\data-orphans-tier-bc`
  remains; junction-link `apps/web/node_modules` → live tree's node_modules
  (no install required for re-runs).

## What Didn't Work

- Initial `node -e` triage write used `\\\\` heredoc escaping that broke MD5
  hash, wrote triage to wrong session-key. Fix: use `process.cwd()` directly
  inside the node script (resolves correctly). Verified
  `migrationApproved: true` lands at the hook-server's session key
  `d71ef4932bee` before re-attempting Write.
- `apps/web/.gitignore` already excludes `data/audit/` (line 2) — S4 finding
  is a no-op. Left as-is.
- `-web` typecheck has 4 pre-existing `.next/types/...` route-handler errors
  in unrelated cron / checkout-verify endpoints (sibling-session work, not
  this branch). Pre-commit verification hook blocks `-web` doc commit until
  those clear. Plans docs left uncommitted; ship in follow-up.

## Remaining Steps

1. **Commit -web plan/findings/rounds docs** when sibling tsc errors clear OR
   on a separate `-web` doc-only branch where verification skips. Path:
   `cd C:/Users/email/projects/ImNotAnAttorney-web` →
   `git add docs/plans/2026-04-30-worry-data-orphans-tier-b-c{,-findings,-rounds}.md`
2. **Apply migration post-merge.** `feature_flags` INSERT is idempotent; flag
   stays OFF until ops flip. No customer-visible change today.
3. **Spec the r2 follow-up worry** (`data-orphans-tier-b-c-r2`):
   - T4: write `entities_judges` resolver
     (`resolveJudgeCanonicalIdByName(first, last)`), update
     `product-tiers.md` to lock $197 Judge Report Card = STATISTICAL-only
     vs $997 IB = relational/conflict intel, lock UPL phrasing matrix in
     `atti-persona.md` (R0 D3 table), enumerate DENY surfaces (R0 S3),
     add render-time HTTPS guard (R0 S10).
   - T6: column-level X-Ray review for motion_types + holding_text dims,
     drop defense_theories, narrow query.
   - T7: ship inline as T6 LEFT JOIN partner.
   - T3: write JOIN to `cl_financial_disclosures` per pinned shape in findings.
   - T5: hold for JUSTFAIR ingest expansion.
4. **Schema-cleanup worry** for T8 + T10 + T11 (legacy `case_law` deprecation,
   vestigial `entities_officers` / `pji_field_validation` / `case_law_applicability` /
   `verified_case_law` cleanup).

## Verification

- `gh pr view 28 --repo rahim0kapadia/ImNotAnAttorney --json state,headRefName`
  → OPEN on `feat/data-orphans-tier-bc`.
- `git -C "C:/Users/email/projects/ImNotAnAttorney/.claude/worktrees/data-orphans-tier-bc" log -1 --format=%H`
  → `348dfcac…`.
- monorepo apps/web typecheck: clean for touched files (only pre-existing
  `require-tier.test.ts` unused-directive error from PR #26).

## Known Quirks

- The Vercel project for production is `imnotanattorney` (monorepo apps/web),
  NOT `imnotanattorney-web`. Per CLAUDE.md cutover note: -web "MERGES BUT
  DOES NOT SHIP." Code in this PR targets monorepo correctly; -web docs are
  authorial (plans live there per established split).
- R0 reviewers consumed Opus rate limit on first parallel dispatch; second
  dispatch went through. If re-running R0/R1 same day, watch for limit reset.
