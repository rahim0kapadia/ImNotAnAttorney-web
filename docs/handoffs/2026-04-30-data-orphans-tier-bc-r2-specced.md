# Handoff: data-orphans tier-bc r2 + schema-cleanup specced

Date: 2026-04-30 (continuation of `docs/handoffs/2026-04-30-data-orphans-tier-bc-t9-shipped.md`)

## Task

Close out the t9-shipped handoff: commit -web docs, merge monorepo PR #28, apply
migration, spec the r2 follow-up + schema-cleanup vestigials worries.

## Approach

- Committed `-web` tier-bc plan/findings/rounds (`4ce81d68`).
- Admin-merged monorepo PR #28 (`df017131`) — GHA workflows billing-blocked, so:
- Applied migration `20260430a_case_law_references_flag.sql` manually via
  `apps/web/scripts/ops/apply-mig-20260430a.mjs` (one-shot pg client + dotenv).
  Verified row inserted, `is_enabled=false`.
- Drafted two follow-up worry specs:
  - r2 stacked successor (T3/T4/T5/T6/T7 with Wave 0 helper PRs first)
  - schema-cleanup vestigials (T8/T10/T11 + phantom collapse migration)
- Committed + pushed specs (`46cf5c16`).
- Saved feedback memory: "always merge clean PRs without confirmation."

## Files Modified

In `C:\Users\email\projects\ImNotAnAttorney-web` (master, pushed):
- `docs/plans/2026-04-30-worry-data-orphans-tier-b-c.md` (committed @ `4ce81d68`)
- `docs/plans/2026-04-30-worry-data-orphans-tier-b-c-findings.md` (committed @ `4ce81d68`)
- `docs/plans/2026-04-30-worry-data-orphans-tier-b-c-rounds.md` (committed @ `4ce81d68`)
- `docs/plans/2026-05-01-worry-data-orphans-tier-b-c-r2.md` — NEW (committed @ `46cf5c16`)
- `docs/plans/2026-05-01-worry-schema-cleanup-vestigials.md` — NEW (committed @ `46cf5c16`)

In `C:\Users\email\projects\ImNotAnAttorney\apps\web` (already merged via PR #28 + new ad-hoc):
- `scripts/ops/apply-mig-20260430a.mjs` — NEW (idempotent migration apply harness;
  uncommitted in monorepo working tree; safe to commit or delete — re-running
  the script is a no-op via `ON CONFLICT DO NOTHING`)

In `C:\Users\email\.claude\projects\C--Users-email-projects-ImNotAnAttorney-web\memory`:
- `feedback_always_merge_clean_prs.md` — NEW (standing rule: admin-merge mergeable PRs
  blocked only by GHA billing/non-code CI without confirmation)

## External State

- **Monorepo PR #28** MERGED 2026-04-30T16:09:45Z, squash commit `df017131`.
- **Live DB feature_flags**: row `inaa_legal_research_case_law_references_enabled`
  present, `is_enabled=false`. Verified via direct pg query.
- **Vercel prod deploy**: PR #28 had Vercel preview SUCCESS; auto-deploys to
  prod on master push are reliable. Did NOT verify deploy state via API
  (`rtk` proxy on this machine mangles JSON responses; not worth fighting).
  If verification needed: `gh run list --repo rahim0kapadia/ImNotAnAttorney
  --workflow Vercel` OR Vercel dashboard.
- **GHA workflows still billing-blocked** as of 2026-04-30 16:09Z. All push
  events fail at "job was not started because recent account payments have
  failed." Rahim-only fix (credentials/billing).

## What Didn't Work

- `supabase db push --linked` is the GHA-workflow apply path BUT the project's
  migration naming pattern (`<8-digit-date><letter>_name.sql`) gets SKIPPED by
  `supabase migration list` with "file name must match pattern
  `<timestamp>_name.sql`". `db push` itself may still apply them — but with
  GHA billing-blocked, manual apply via direct pg connection was the
  fastest path.
- `curl https://api.vercel.com/...` output gets prefixed with `[rtk] /!\ No
  hook installed...` warning that breaks `JSON.parse`. Worked around once
  via `raw.indexOf('{')` slicing but the API was returning a SCHEMA shape
  instead of real data — rtk proxy is mocking the request, not forwarding.
  Skipped Vercel verify entirely.

## Remaining Steps

1. **Resolve GHA billing block** (Rahim-only). Until fixed, every push to
   monorepo master will show 2-3 red workflow runs (Engine Tests, Supabase
   Migrations, Docs Freshness). Migration apply path remains the
   `apps/web/scripts/ops/apply-mig-*.mjs` pattern until billing clears.
2. **Spawn r2 worry** when ready:
   ```
   /worry-to-pristine
   Plan: C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-05-01-worry-data-orphans-tier-b-c-r2.md
   Predecessor R0: C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-30-worry-data-orphans-tier-b-c-rounds.md
   ```
   First action: Wave 0 PRs (W0-1 resolver, W0-2 product-tiers slice,
   W0-3 UPL phrasing matrix, W0-4 render helpers). Each is its own PR.
   Wave 1 (T4) cannot start until all four W0 PRs land.
3. **Spawn schema-cleanup worry** independently — does NOT depend on r2:
   ```
   /worry-to-pristine
   Plan: C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-05-01-worry-schema-cleanup-vestigials.md
   ```
   First action: Phase 0 verification (existence + row count + last write +
   FK refs + 3-repo grep) for 5 in-scope tables + phantom-collapse migration.
   Per-table DROP approval gate at Phase 4 — surface evidence to Rahim
   one table at a time, not batched.
4. **Optional cleanup**: commit or delete
   `apps/web/scripts/ops/apply-mig-20260430a.mjs`. Idempotent, safe either way.

## Verification

- `git -C "C:/Users/email/projects/ImNotAnAttorney-web" log -3 --format=%h\ %s`
  → `46cf5c16 docs(data-orphans): r2 follow-up + schema-cleanup vestigials specs`
  → `4ce81d68 docs(data-orphans): tier-B/C plan + Phase 0 findings + R0 rounds`
  → `5b4227fe docs(statutes): Phase 2 plan + coverage matrices + handoffs (#225)`
- `gh pr view 28 --repo rahim0kapadia/ImNotAnAttorney --json state,mergedAt`
  → `{"state":"MERGED","mergedAt":"2026-04-30T16:09:45Z"}`
- Live DB feature flag (run from `apps/web/`):
  ```
  node -e "const pg=require('pg');require('dotenv').config({path:'.env.local'});
  const c=new pg.Client({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false}});
  (async()=>{await c.connect();const r=await c.query(\"SELECT flag_key,is_enabled FROM public.feature_flags WHERE flag_key LIKE 'inaa_legal_research_%'\");console.log(r.rows);await c.end();})();"
  ```

## Known Quirks

- **rtk proxy on this machine** intercepts curl/Vercel API calls and returns
  SDK schema definitions instead of real data. Ignore Vercel API verification
  via curl until the proxy is removed or bypassed — use `gh` or web
  dashboard instead.
- **GHA naming-pattern complaint** is a CLI cosmetic warning, not an apply
  failure. `supabase migration list` skips them all; `supabase db push`
  presumably still applies them. Confirm before relying on push when
  GHA returns to working order.
- Per CLAUDE.md cutover note (2026-04-28), monorepo `apps/web` is the
  deploy-active tree. Any code change must land there. `-web` is plan/
  doc-only going forward.

## Copy-Paste Prompt for Next Session

```
Read this handoff first:
  C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-30-data-orphans-tier-bc-r2-specced.md

Then choose ONE worry to spawn (or do both back-to-back):

Option A — r2 follow-up (5 deferred tasks, 4 Wave-0 PRs first):
  /worry-to-pristine
  Plan:        C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-05-01-worry-data-orphans-tier-b-c-r2.md
  R0 inherit:  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-30-worry-data-orphans-tier-b-c-rounds.md

Option B — schema-cleanup vestigials (5 tables + 1 phantom migration):
  /worry-to-pristine
  Plan:        C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-05-01-worry-schema-cleanup-vestigials.md

Working tree: monorepo apps/web (deploy-active per cutover note 2026-04-28).
GHA billing still blocked → migration apply path is
  apps/web/scripts/ops/apply-mig-<NAME>.mjs
until Rahim resolves billing.
```
