# Handoff: USSC Phase 2 — shared freshness/audit pattern shipped

Date: 2026-05-01

## Task

Phase 2 of the cross-project shared-USSC data-layer plan. Adopt the existing
freshness/audit pattern (sister analytical product on the same Supabase
project already populates `public.ussc_matview_meta`) onto INAA-web's USSC
similar-cases stack — adds a 30-day stale-floor pre-flight gate inside
`queryBucket` plus a public `/api/data-status` freshness endpoint and the
docs around the SHARED meta tables.

Parent plan (READ-ONLY reference, sister repo):
`C:\Users\email\projects\bench-recon-web\docs\plans\2026-04-30-shared-ussc-data-layer-cross-project.md`

## Approach

- Branch off clean `origin/master` after stashing 5 unrelated uncommitted
  doc edits. Restored stash to master after PR creation.
- 4 sequential commits, one per sub-task, exact `feat(ussc): phase 2 — …`
  format, each with the Co-Authored-By footer.
- Lib gate uses `SupabaseClient` passed in (matches existing INAA pattern;
  no module-level singleton). Wrapped the whole `checkUsscFreshness` body
  in `try/catch` so the existing test mock (which lacks
  `.order/.limit/.maybeSingle`) collapses to `meta-missing` and degrades
  open instead of throwing — keeps the existing 18 vitest tests green.
- Route ports the sister project's exact response shape via INAA's own
  `createAdminClient()` from `@/lib/supabase/admin` and `console.warn`
  (INAA has no `@/lib/logger` module).
- Methodology / transparency page consumer is OUT OF SCOPE — INAA-web has
  no such page today. Documented as deferred in PR body.
- Hidden affiliation discipline: never named "BenchRecon" or "BR" in
  code/commits/PR. Cited the parent plan path everywhere.

## Files Modified

- `ARCHITECTURE.md` — added §"Shared analytical layer (cross-project)"
  describing the SHARED meta tables, no-tenant-prefix rule, and 30-day
  freshness floor; added §"Deferred: per-matview refresh RPC for INAA's
  summary matview" pointing to Phase 1+4 of the parent plan.
- `src/lib/ussc-similar-cases.ts` — added `STALE_FLOOR_DAYS=30`,
  `UsscFreshnessGate` interface, exported `checkUsscFreshness(sb)`
  function, extended `SimilarCasesResponse` with optional `stale?` +
  `refreshed_at?` fields, and wired the gate as a pre-flight inside
  `queryBucket` (stale-data short-circuits, no-meta/meta-missing degrade
  open with a `console.warn`).
- `src/app/api/data-status/route.ts` — NEW. `GET` returns
  `{ ussc: { refreshed_at, codebook_version, freshness_floor_fy,
  source_datafile_url, row_count_approx, is_stale, days_since_refresh },
  fetched_at }` with 60s `private, max-age=60` cache; `row_count` rounded
  to nearest 1000; relation-missing degrades to a 200 `EMPTY_USSC` payload.

## What Didn't Work

- `npx vitest run --reporter=basic` — vitest 4.x removed the `basic`
  reporter (`Failed to load custom Reporter from basic`). Use the default
  reporter (no `--reporter` flag).
- `npm test` first run resolved against `bench-recon-web/package.json` due
  to a cached/inherited shell context, not the INAA cwd. Workaround: call
  `npx vitest run <path>` directly in the INAA cwd to pin resolution.

## What's Done — PR

- Branch `feat/ussc-shared-freshness-2026-04-30` pushed to origin.
- PR #226 https://github.com/rahim0kapadia/ImNotAnAttorney-web/pull/226
- Final SHA `1413f1b3`. 3 files, +285 lines.
- All 4 sub-tasks complete; sub-task 3 has methodology page wire-up
  marked DEFERRED-WITH-REASON in the PR body.
- DO NOT MERGE — left for Rahim review.

## Remaining Steps (post-merge / follow-ups)

1. Smoke `curl https://imnotanattorney.com/api/data-status` after merge
   + Vercel deploy. Confirm `{ ussc: { ... }, fetched_at }` 200 with
   `Cache-Control: private, max-age=60, must-revalidate`.
2. Confirm `queryBucket` against the live shared `public.ussc_matview_meta`
   returns `match_depth !== "insufficient_data"` (today's row is fresh;
   verifies the gate doesn't false-positive on a healthy meta).
3. Phase 1 of the parent plan (creates INAA's
   `ussc_similar_cases_summary` matview + writes its own
   `ussc_matview_meta` rows) unblocks the deferred
   `refresh_ussc_similar_cases_summary_with_lock` RPC documented in
   sub-task 4.
4. Optional follow-up PR: add a `/methodology` (or `/transparency`) public
   page that SSR-fetches `/api/data-status` and renders the
   `refreshed_at` + `days_since_refresh` + `is_stale` warning banner.
5. Optional cleanup PR: ~~address the 51 pre-existing `node:test`-style
   files under `scripts/lib/test-db.test.mjs` and
   `scripts/ingest/__tests__/scrape-*-discipline.test.mjs` +
   `scripts/ingest/__tests__/seed-statutes-*.test.mjs` that vitest 4.x
   can't parse~~ — **DONE 2026-05-01 in PR #227**
   (`chore/vitest-exclude-node-test`, branch off origin/master). 51
   paths enumerated in `vitest.config.ts` `exclude`. Full
   `npx vitest run --pool=forks` now 107 passed / 0 failed / 3 skipped,
   1517 tests. Vitest's `exclude` ignores `!negation` (verified
   empirically) so the list is explicit, not glob+negation.

## Verification

- `git log --oneline origin/master..origin/feat/ussc-shared-freshness-2026-04-30`
  — should show the 4 `feat(ussc): phase 2 — …` commits.
- `npx tsc --noEmit --skipLibCheck` — clean.
- `npx eslint src/app/api/data-status/route.ts src/lib/ussc-similar-cases.ts`
  — no issues.
- `npx vitest run tests/lib/ussc-similar-cases.test.ts` — 18 / 18 pass
  (existing tests unchanged; freshness gate degrades open under the test
  mock).
- `npm run build` — exits 0 with only the pre-existing Turbopack NFT
  warning (`next.config.ts` + `security-scan` cron route) and the Next 16
  `middleware.ts` → `proxy.ts` deprecation warning.

## Pre-existing notes (NOT part of this PR)

- Local `master` is 1 commit ahead of `origin/master`
  (`2bb706c9 docs(statutes-phase4): IL/ME/AL/MI live-curl validation +
  fixtures`) — untouched.
- Stash `pre-phase2-uncommitted-docs-2026-05-01` was popped back onto
  master after PR creation; 5 modified docs (`ARCHITECTURE.md`,
  `scripts/CONTEXT.md`, `src/app/CONTEXT.md`, `src/lib/CONTEXT.md`,
  `supabase/CONTEXT.md`) plus the same untracked files visible at session
  start are restored to working tree on master.
- Stale `scope` skill marker from a prior session was closed via SKIP
  during this session — unrelated to this work.
