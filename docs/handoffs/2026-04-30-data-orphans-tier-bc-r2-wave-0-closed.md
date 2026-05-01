# Handoff: data-orphans tier-B/C r2 Wave 0 CLOSED

Date: 2026-04-30 (continuation of `docs/handoffs/2026-04-30-data-orphans-tier-bc-r2-wave-0-shipped.md`)

## Task

Close out Wave 0 — verify CI, merge 4 PRs, apply W0-2 migration, cleanup worktrees, update memory. Soak window opens for Wave 1 (T4 jcpc → IB).

## What Shipped This Session

**4 PRs admin-merged** on rahim0kapadia/ImNotAnAttorney monorepo:
- PR #30 — W0-3 UPL phrasing matrix — merged 2026-04-30T20:59:30Z
- PR #31 — W0-4 url-guard + methodology footer — merged 2026-04-30T20:59:44Z
- PR #32 — W0-1 judge canonical resolver — merged 2026-04-30T20:59:20Z
- PR #35 — W0-2 product-tier rule + corrective COMMENT migration — merged 2026-04-30T20:59:53Z

Vercel preview SUCCESS on all four; admin-merge bypassed the ES-reindex bug (see Memory Update below). Master HEAD now at `b086ca97`.

**W0-2 migration applied to live DB** via `apps/web/scripts/ops/apply-mig-20260430z.mjs`:
- Discovered predecessor `20260421a_judge_conflict_of_interest.sql` was NEVER applied (table absent).
- Harness applies BOTH 20260421a + 20260430z in sequence (both idempotent — `CREATE TABLE IF NOT EXISTS` and `COMMENT ON ... replace`).
- `judge_conflict_of_interest` now exists with the corrected COMMENT — full text starts with "Judge recusal-ground surface" and ends with "TIER: $997 Intelligence Brief and up (X-Ray $2,497, War Room $4,997). NOT surfaced at $197 Judge Report Card or $97 playbook tiers — those tiers are statistical-only."
- `judge_civil_party_conflicts` and `judge_investments` were already present (ingest-created); now carry tier-locked comments.

**4 worktrees removed** under `C:/Users/email/projects/ImNotAnAttorney/.claude/worktrees/`:
- `r2-w0-1-judge-resolver`, `r2-w0-2-product-tiers`, `r2-w0-3-upl-matrix`, `r2-w0-4-render-helpers`.

## Files Modified

- `C:/Users/email/projects/ImNotAnAttorney/apps/web/scripts/ops/apply-mig-20260430z.mjs` — created. Two-file migration harness (20260421a + 20260430z) with verify queries.
- `C:/Users/email/.claude/projects/C--Users-email-projects-ImNotAnAttorney-web/memory/gotcha-gha-pr-elasticsearch-reindex.md` — added 2026-04-30T20:35Z recurrence entry. Bug now affects `push` events too, not just PR events. Self-hosted Fly runner unaffected — bug is in GitHub's job-scheduling layer.

## What Didn't Work

- **First migration apply attempt failed** with `42P01 relation "public.judge_conflict_of_interest" does not exist` — predecessor `20260421a` was in the migrations tree but never applied to live (per `pattern-verify-collapse-target-phase0.md` — migration in tree ≠ migration applied). Fix: harness applies predecessor first.
- **Self-hosted Fly runner did NOT resolve CI failures.** Handoff predecessor assumed Fly runner (PR #34) would let CI run free; it did not. The ES-reindex bug is upstream of runner type — `steps: []` empty arrays appear on push-event workflows too (master run `25187434301` confirmed: 4s job, no steps). Admin-merge stays mandatory until GitHub clears the incident.

## Verification

```powershell
# All four PRs merged + master at b086ca97:
gh pr list --repo rahim0kapadia/ImNotAnAttorney --search "W0- in:title" --state all --json number,state,mergedAt
# → all 4 MERGED at ~20:59Z

# Migration COMMENTs verified:
cd "C:/Users/email/projects/ImNotAnAttorney/apps/web"
node -e "import('dotenv').then(async d=>{d.default.config({path:'.env.local'});const{default:pg}=await import('pg');const c=new pg.Client({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false}});await c.connect();const r=await c.query(\"SELECT obj_description('public.judge_conflict_of_interest'::regclass,'pg_class') AS d\");console.log(r.rows[0].d);await c.end();});"
# → Should print full corrected COMMENT including '$997 Intelligence Brief and up' + 'NOT surfaced at $197'

# Worktrees gone:
git -C "C:/Users/email/projects/ImNotAnAttorney" worktree list
# → no r2-w0-* entries
```

## Remaining Steps

1. **48h soak** before Wave 1. Wave 0 merged 2026-04-30T20:59Z UTC → soak ends ~2026-05-02T21:00Z UTC.
2. **Wave 1 — T4 `judge_civil_party_conflicts` → IB** as its own PR. Spec in `docs/plans/2026-05-01-worry-data-orphans-tier-b-c-r2.md` § "Wave 1 — T4 ship":
   - Wire `resolveJudgeCanonicalIdByName` (W0-1) into IB judge-data fetch
   - Gate stack: `match_type IN ('exact','subsidiary') AND match_confidence >= 0.90 AND <urls> ~ '^https://'`
   - Render via `<MethodologyFooter>` (W0-4) with checked/not-found/partial states
   - Sub-tier ($197/$97) DENY at fetch layer
3. **Wave 2 — T6 `classified_opinions` (motion_types + holding_text only) + T7 inline LEFT JOIN.** After Wave 1 + 48h soak.
4. **Wave 3 — T3 `judge_investments` JOIN.** After Wave 2 soak.

Independent backlog (not r2-blocked):
- `/worry-to-pristine` on `docs/plans/2026-05-01-worry-schema-cleanup-vestigials.md` — T8/T10/T11 + phantom-collapse migration.

## Copy-Paste Prompt for Next Session

```
Read this handoff first:
  C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-30-data-orphans-tier-bc-r2-wave-0-closed.md

Soak window for Wave 0 ends ~2026-05-02T21:00Z UTC. After that, run Wave 1:

  /worry-to-pristine
  Plan:        C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-05-01-worry-data-orphans-tier-b-c-r2.md
  R0 inherit:  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-30-worry-data-orphans-tier-b-c-rounds.md
  Wave:        Wave 1 — T4 judge_civil_party_conflicts → IB (one PR)

Or if soak hasn't elapsed, run the independent schema-cleanup worry:

  /worry-to-pristine
  Plan:        C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-05-01-worry-schema-cleanup-vestigials.md

Working tree: monorepo apps/web (deploy-active per cutover note 2026-04-28).
GHA still unreliable — admin-merge required until githubstatus.com clears the PR-elasticsearch-reindex incident.
```
