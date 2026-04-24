# Handoff: test-pollution producer-level fix shipped

Date: 2026-04-24
Supersedes: `docs/handoffs/2026-04-24-test-pollution-handoff.md` (pause handoff)
Status: PR #118 OPEN on rahim0kapadia/ImNotAnAttorney-web. Local branch `feat/test-isolation-probes` on continuous-verification (no remote).

## What shipped

Producer-level test-data isolation per `docs/plans/2026-04-24-worry-test-pollution-cv.md` (revision 2 absorbs 39 Round-0 swarm findings).

- **T0** — `supabase/migrations/20260424a_test_run_id_columns.sql` — nullable `test_run_id uuid` + partial index `WHERE test_run_id IS NOT NULL` on 8 in-scope tables. Idempotent. **APPLY NOT RUN — Rahim applies via migration-approval.**
- **T1** — `scripts/lib/test-db.mjs` + `scripts/lib/test-db.test.mjs` — `withTestTx` + 5 factories + `newTestRunId` on raw `pg.Client` port 5432 with `SET LOCAL session_replication_role = replica`. No `@supabase/supabase-js` on the insert path. Module-load self-test.
- **T1a** — `scripts/lib/reap-test-runs.mjs` — storage gardener for marker-path residue.
- **T2** — `scripts/test-ib-pipeline.ts` — cmdPush wrapped in `withTestTx`. `sk_test_` startsWith guard. Stripe metadata allowlist `{tier, test_run_id}` only.
- **T3** — `scripts/test-inclusion-flow.mjs` — `run()` in `withTestTx`. All 4 subtests read via `tx.query`.
- **T4** — `scripts/test-e2e-dashboard.mjs` — marker path. `newTestRunId` at setup top. DELETE-as-cleanup **removed** (LEACH-6 anti-pattern).
- **T5** — `scripts/test-aba-sample.mjs` + `scripts/test-batch-generation.mjs` — `// test-isolation-na:` headers.
- **T7** — `~/.claude/hooks/enforce-test-isolation.js` + `~/.claude/hooks/hook-server.js` list addition. PreToolUse block unless helper import OR `newTestRunId` invocation OR `test-isolation-justified:`/`test-isolation-na:` header. `stripCommentsAndStrings` rejects template-literal bypass. DRY_RUN until 2026-05-01.
- **T7a** — `scripts/diag-test-pollution-status.mjs` — read-only day-3/day-6 audit.
- **T8** — `continuous-verification/configs/inna.cv.json` — tightened fixture-prefix allowlist via PostgREST `and=` composite, `test_run_id.is.null` filter on 6 probes, new counter-probe `inna-missed-evals-example-com`. `configs/inna.cv.notes.md` sidecar for rationale.
- **T9** — `~/.claude/rules/drafts/test-isolation.md` + `~/.claude/rules/CONTEXT.md` row addition.
- **T10** — `docs/plans/2026-04-24-worry-test-pollution-cv.md` `## Rollback Order (plan-level)` section.

## Verification gates (per plan SCs)

- `npx tsc --noEmit --skipLibCheck -p tsconfig.json` **exits 0** (verified 3x this session).
- Round 1 shipped-code swarm:
  - Leach: **PASS** (3 polish concerns, none blocking)
  - security-auditor: **PASS** with WARNING #1 fix applied (see commit 27cdffb2)
  - code-reviewer: CRITICAL on `SET LOCAL session_replication_role` role requirement + several warnings — absorbed in commit 27cdffb2
- Spec-critic retry 1 of 3 passed 21/21 SCs (on plan).
- Leach-lens re-verify on revised plan: **PASS** across all 4 LEACH-tagged CRITICALs (LEACH-1/2/3/6) + LEACH-10.

## Round 1 fixes landed (commit 27cdffb2)

- CRITICAL — `SET LOCAL session_replication_role = replica` wrapped in try/catch. On permission-denied (non-SUPERUSER role), log warning to stderr and proceed without trigger suppression. Same-connection triggers still rollback with tx; cross-connection webhooks were already why the marker path exists in T4.
- CRITICAL/WARNING — `assertNotProduction` bypass via opaque Supabase project refs. Added `SUPABASE_TEST_DB_PROJECT_REFS` env var prefix-match allowlist with safe fallback. Mirrored in reaper.
- WARNING — Marker directory world-readable in `/tmp`. Per-user scope via `os.userInfo().username` suffix.
- WARNING — Reaper DELETEs not wrapped in transaction. Per-run-id BEGIN/COMMIT so partial failure rolls back atomically.

## Polish items deferred (tracked)

Reviewer-flagged polish that is explicitly out of this PR. Next session picks up:

- Dedupe 5 factory functions into a shared `insertRow(tx, table, row)` helper.
- `scripts/diag-test-pollution-status.mjs` — replace 8 sequential queries with a single UNION ALL CTE.
- Tighten `isUuid` regex in reaper to v4-only.
- Extract `loadEnvLocal()` into `scripts/lib/` (three scripts duplicate the parser today).
- Drop redundant `port: 5432` field on `pg.Client` (connectionString rewrite already sets it).
- Evaluate `CREATE INDEX CONCURRENTLY` in a follow-up migration if the partial-index ACCESS EXCLUSIVE on `orders`/`cases` proves observable under live traffic. Partial indexes on freshly-added NULL columns finish in microseconds so this is likely a non-issue.
- Re-verify that `inna.cv.json` `and=` composite filter is parsed by the CV probe-config loader (not silently ignored as an unknown key).
- Add `createTestOrderAndCase(tx, overrides)` combo factory.
- Bounded truncation of `e.message` in reaper error log to avoid leaking constraint values.

## Gates that require LIVE Supabase (cannot run here)

- `node --test scripts/lib/test-db.test.mjs` — requires migration applied + `.env.local` SUPABASE_DB_URL.
- `npx tsx scripts/test-ib-pipeline.ts push` — smoke run end-to-end.
- `node scripts/test-inclusion-flow.mjs` — 4 subtests.
- `node scripts/test-e2e-dashboard.mjs` — requires dev server + migration applied; row count `WHERE test_run_id IS NOT NULL AND created_at < NOW() - 2min` must return 0 after reaper runs.
- `node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends` — requires migration applied; must exit 0 with all probes PASS (new counter-probe included).

## Open followups (in priority order)

1. **Rahim apply migration** `supabase/migrations/20260424a_test_run_id_columns.sql` via normal approval flow. Until applied, every marker-path write via T4 will error on the missing column.
2. After apply: run the 5 verification commands above.
3. Monitor `enforce-test-isolation.js` warnings for 7 days (2026-04-25 → 2026-05-01). Run `node scripts/diag-test-pollution-status.mjs` on day 3 and day 6. If zero false-positive warnings, flip `DRY_RUN_UNTIL` to live-block on 2026-05-02.
4. Continuous-verification repo has **no remote**; T8 branch `feat/test-isolation-probes` sits locally. If CV ever gets a remote, push and open PR.
5. ImNotAnAttorney-engine has its own test surface; cross-repo port is queued for a distinct future session.
6. Round 1+ swarm findings (dispatched against shipped code in parallel with this handoff): absorb per Pristine-Or-Nothing before declaring done.

## Prompt for next session

```
Read C:\Users\email\projects\_worktrees\test-pollution-work\docs\handoffs\2026-04-24-test-pollution-root-fix.md
Then:
  1. Check the 3 Round-1 swarm review comments on PR
     https://github.com/rahim0kapadia/ImNotAnAttorney-web/pull/118
  2. Absorb findings per Pristine-Or-Nothing into scripts/ + helper + hook.
  3. Run the 5 live-Supabase verify commands after Rahim applies the migration.
  4. Flip DRY_RUN_UNTIL in enforce-test-isolation.js on 2026-05-02 if
     diag-test-pollution-status.mjs reports zero false-positive warnings.
```
