# Worry Plan: Test-Data Pollution Across CV Probes

Date: 2026-04-24
Slug: `test-pollution-cv`
Session key: `3a7ebfe32f2c`
Revision: 2 — absorbs 39 Round-0 swarm findings per Pristine-Or-Nothing (12 CRITICAL, 14 WARNING, 13 SUGGESTION). Full finding detail in the findings companion.

## Worry

Internal test scripts (starting with `scripts/test-ib-pipeline.ts`) leak test data into production-grade tables (`cases`, `orders`, `drip_sends`). The 2026-04-23 INNA-H1 CV probe false-positive was a leftover row from `test-ib-pipeline.ts` — and the recovery session patched it in the CV config (filter `@example.com` emails) rather than fixing the producer. That symptom-patch approach will recur every time a new test script is added with different fixture emails or test-tagged rows.

Need a producer-level fix: every test/pipeline-script that writes to shared tables must
  (a) self-clean on exit via trap/finally, and/or
  (b) write to a sandboxed schema, and/or
  (c) tag rows with a test-marker that CV probes globally exclude by convention.

**Fix the engine, not the output.**

## Scope hints

- Known test producers (ImNotAnAttorney-web):
  - `scripts/test-ib-pipeline.ts` (TS; writes to `orders` + `cases` + intake)
  - `scripts/test-aba-sample.mjs`
  - `scripts/test-batch-generation.mjs`
  - `scripts/test-e2e-dashboard.mjs`
  - `scripts/test-inclusion-flow.mjs`
- Prior patch (symptom): `~/projects/continuous-verification/configs/inna.cv.json` adds `email.not.like: "%@example.com"` to INNA-H1 probe (commit `e892683`).
- Shared tables at risk: `cases`, `orders`, `intakes`, `subscribers`, `drip_sends`, and any CV-probed table.
- Existing memory: `gotcha-cv-probe-test-data-pollution.md` (explains the symptom patch).
- Rule alignment: `~/.claude/rules/root-cause-first.md` (HARD). This worry is a direct violation of it — the fix fell on the CV config (output filter) not the producer.

## Out of Scope (sibling sessions)

These files belong to concurrent sibling sessions — DO NOT touch in this plan:

- FL statutes ingest: `scripts/ingest/seed-statutes-fl.mjs`, `scripts/ingest/lib/fl-html.mjs`, `scripts/ingest/__tests__/seed-statutes-fl.test.mjs`, `scripts/ingest/_inspect-entities-statutes.mjs`, `supabase/migrations/20260423e_entities_statutes_schema.sql`, `docs/plans/2026-04-23-state-statutes-scaling-findings.md`, branch `feat/state-statutes-fl-seed`.
- Free-data ingest: `scripts/ingest/ingest-openpolicing.mjs`, `scripts/ingest/scrape-calbar-discipline.mjs`, `scripts/ingest/ingest-federal-register.mjs`, `scripts/ingest/run-fars-backfill.mjs`, `scripts/ingest/run-opp-sequential.mjs`, `scripts/ingest/opp-*.ps1`, `scripts/diag-supabase-resource-audit.mjs`.
- Content queue: `content/queue/twitter/pending/2026-04-24-*` (plus blog-work HARD RULE — no content/pipeline work this session).

## Hard rules active

- **Pristine-Or-Nothing**: every review finding (CRITICAL + WARNING + SUGGESTION) must be fixed.
- **Hook-Or-Harder**: the producer fix ships as hook enforcement, not prose alone.
- **Root-Cause-First**: fix the producer, not each output / each probe config.
- **Cascade Rule**: decision must create wins for us / direct counterparty / downstream / ecosystem / future-us.
- **Expert-Decides**: triangulate .01% expert, decide through their lens, cite them. Never kick back to Rahim.
- **no-hallucinated-legal-data**: no legal citations in code without stored URL.
- Worktree-per-PR pattern (cached memory).
- `feedback-no-blog-work`: no blog / content / queue / pipeline work.
- `decision-xl-until-bulk-complete`: compute tier stays XL.

## Expert Lens

Source: `C:/Users/email/.claude/experts/brandur-leach.md` (triangulated 2026-04-24; domains test-data-hygiene, db-test-isolation, transactional-fixtures, postgres-testing). Leach owns the ~4,900-tests-in-23-seconds Crunchy Bridge suite. Lens applied to this worry:

- **Rollback IS the cleanup.** Every test script opens a transaction, does its writes, and rolls back on exit. No `DELETE FROM orders WHERE email LIKE '%test%'` scrub script, because nothing committed. `scripts/test-ib-pipeline.ts` today commits 4 separate INSERTs and relies on a manual `cleanup` subcommand the operator may never run, especially after a crash. This is the exact anti-pattern Leach calls out.
- **Never mock the DB, but never share state either.** Tests MUST hit real Supabase Postgres (mocks drift) AND must not leak fixtures to the next test or to CV probes. The fix is one-tx-per-test, never a "seed-once-read-many" dataset. Factory functions (`createTestOrder`, `createTestCase`) fill defaults; every test composes fresh rows.
- **Triggers that commit out-of-band can't be rolled back.** Supabase Edge Functions fire on row insert via `on_order_paid` webhooks, Stripe-confirmed PaymentIntents hit Stripe's side (external side effect). When rollback is physically impossible, Leach's alternative is a marker column (`test_run_id uuid`) plus probe-side `WHERE test_run_id IS NULL`. Defense-in-depth, not replacement.
- **Fixtures must use the test's tx, not a second connection.** Common bug: factory opens its own `createClient` and commits orphan rows while the caller's tx rolls back. The shared helper MUST thread the caller's tx/client through every fixture call.
- **Parallel-safe by construction.** Each test script runs in its own tx on its own backend connection. Port 6543 (transaction mode via Supavisor) auto-terminates orphan sessions if the test crashes; port 5432 (session mode) needs explicit close plus `statement_timeout`. Prefer 6543 when the test does not need cross-statement session state.

## Cascade

- **Us (INAA):** CV probes stop false-positiving on stale test rows. INNA-H1 becomes a real UPL signal again, not a string filter over ancient test pollution. One root fix eliminates an entire recurring failure class.
- **Direct counterparty (CV probes + future probes):** probe configs stop needing per-table `email.not.like` filters as the only signal-separation layer. `inna.cv.json` stays readable. New probes can trust production tables.
- **Downstream (future test-script authors):** writing a new test script means importing `scripts/lib/test-db.mjs` and calling `withTestTx(async (tx) => { ... })`. The happy path is the safe path; no cleanup to remember.
- **Ecosystem (Claude Code users on Supabase):** the hook pattern (`enforce-test-isolation.js` + marker + shared helper) is publishable. Every other team running real-DB tests against shared Supabase faces the same class. Draft rule in `~/.claude/rules/drafts/test-isolation.md` is portable.
- **Future-us (schema drift, new tables):** a single factory file breaks when the schema drifts, not 40 tests. Fixture defaults live in one place. When `cases` gets a new required column, one edit fixes every test.

No node loses. Cascade-positive.

## Rollback Order (plan-level)

Every task ships as its own commit on its own branch-in-worktree so that `git revert <sha>` composes cleanly. On partial failure, revert commits in the reverse of the execution order below, which is a strict topological sort of dependencies:

1. T10 (plan-level rollback section itself — this section — contains zero code changes, so a revert here is a no-op)
2. T9 (draft rule file + CONTEXT.md row — standalone)
3. T8 (continuous-verification repo changes — isolated cross-repo commit)
4. T7a (diag script — standalone)
5. T7 (hook + hook-server wiring — depends on T1 helper existing to avoid self-block)
6. T6 (memory rewrite — depends on T1 helper path being stable)
7. T5 (justify comments on no-op scripts — depends on T7 hook existing to know what shape to write)
8. T4 (test-e2e-dashboard conversion — depends on T0 schema column, T1 helper, T1a reaper)
9. T3 (test-inclusion-flow conversion — depends on T1 helper)
10. T2 (test-ib-pipeline conversion — depends on T1 helper)
11. T1a (reaper script — depends on T0 schema column, T1 helper)
12. T1 (shared helper — depends on T0 schema column)
13. T0 (schema migration — foundation; reverting T0 requires all dependents already reverted)

Foundation tasks (T0, T1) MUST land first. Leaf tasks (T9, T8, T7a) MAY be authored in any order but MUST appear in commit history after T0 + T1 so `git bisect` surfaces foundation breakage ahead of leaf breakage.

## Numbered Tasks

### T0 — Schema migration for the test_run_id marker column

- Files: `C:/Users/email/projects/ImNotAnAttorney-web/supabase/migrations/20260424a_test_run_id_columns.sql` (NEW).
- Action, absorbing cr-r0-3 and LEACH-10. Create a single idempotent SQL migration that adds a nullable `test_run_id uuid` column plus a partial index on each of the eight in-scope tables: `orders`, `cases`, `intakes`, `subscribers`, `drip_emails`, `operator_tasks`, `case_findings`, `processing_jobs`. Every table gets exactly one `ALTER TABLE <name> ADD COLUMN IF NOT EXISTS test_run_id uuid` statement and exactly one `CREATE INDEX IF NOT EXISTS idx_<name>_test_run_id ON <name>(test_run_id) WHERE test_run_id IS NOT NULL` statement. Nullable means zero backfill cost. Partial index means probe queries filtering `IS NULL` hit the main table untroubled by test rows, and reaper queries filtering `test_run_id = marker-value` use the partial index for O log N lookup. The whole migration is wrapped in a single BEGIN and COMMIT pair so partial application is impossible. Foreground session writes the file and commits it. The actual Supabase apply step is left for Rahim's next session per the existing migration-approval rule. Dependent tasks (T1a reaper, T8 probe filters, SC checks) degrade to partial coverage until the migration is applied, and each dependent verify step names that explicit degradation.
- Verify. File exists at the listed path. File contains a single BEGIN statement and a single COMMIT statement bracketing eight ALTER plus eight CREATE INDEX statements. `grep -c "ADD COLUMN IF NOT EXISTS test_run_id uuid"` returns 8. `grep -c "CREATE INDEX IF NOT EXISTS idx_"` returns 8 or more. The predicate `WHERE test_run_id IS NOT NULL` appears on every partial-index line.
- Rollback. `git rm supabase/migrations/20260424a_test_run_id_columns.sql`. If the migration has already been applied to Supabase, a compensating migration to drop the columns is authored in a separate future session; that compensator is NOT in scope here.

### T1 — Shared helper scripts/lib/test-db.mjs (revised)

- Files: `C:/Users/email/projects/ImNotAnAttorney-web/scripts/lib/test-db.mjs` (NEW); `C:/Users/email/projects/ImNotAnAttorney-web/scripts/lib/test-db.test.mjs` (NEW).
- Action, absorbing cr-r0-1, cr-r0-6, cr-r0-9, cr-r0-10, sec-r0-6, sec-r0-7, LEACH-2, LEACH-4, LEACH-7, LEACH-9, sec-r0-11. Factory plus transactional-wrapper module. Exports named functions `withTestTx`, `createTestOrder`, `createTestCase`, `createTestIntake`, `createTestSubscriber`, `createTestDripEmail`, and `newTestRunId`. Implementation constraints, each expressed as a plain rule:
  1. Use `pg.Client` directly via `import pg from 'pg'`. Never import `@supabase/supabase-js`. Never call `createClient`. Never use `supabase.from`. Factories issue raw parameterized INSERTs via `tx.query(sql, values)`. Reason: the JS client is HTTP/PostgREST-based and cannot participate in a pg-side BEGIN/ROLLBACK (cr-r0-1, LEACH-1).
  2. Connect on pooler port 5432 which is session mode. Never 6543. Port 6543 is Supavisor transaction mode which releases the backend per-statement and breaks multi-statement BEGIN/ROLLBACK (cr-r0-6, cited gotcha cl-bulk-data-defensive number 17).
  3. `withTestTx` creates a fresh `pg.Client` per invocation; `client.end()` runs in the finally branch. Never singleton-share the client. The companion test file includes a parallel-safety unit test that runs two concurrent `withTestTx` invocations and asserts isolated visibility between them (cr-r0-10).
  4. Immediately after BEGIN, helper issues `SET LOCAL session_replication_role = replica` to suppress triggers and Edge Function row-level invocations that would otherwise commit out-of-band via a separate connection (LEACH-3, LEACH-9).
  5. Helper also issues `SET LOCAL statement_timeout = '30s'` and `SET LOCAL idle_in_transaction_session_timeout = '5s'` so zombies self-terminate per cl-bulk-data-defensive number 17. All session tuning uses `SET LOCAL` so it rolls back with the transaction (LEACH-4).
  6. Factory defaults use `crypto.randomUUID` for every unique-indexed column: email, stripe_session_id, idempotency_key, case_number, and any additional UNIQUE column discovered by a schema audit during authoring. Default email template is the literal pattern `test-<slug>-<uuid>@example.com` so parallel runs never collide (LEACH-7).
  7. Overrides are a plain object that spreads after the defaults. Factories are parameter-only on the SQL path; no factory interpolates override strings into SQL text. An adversarial override containing a semicolon or a DROP TABLE fragment rolls back with the transaction and leaves the schema intact (sec-r0-6).
  8. `withTestTx` asserts that `process.env.NODE_ENV !== 'production'` AND refuses to run when `SUPABASE_DB_URL` hostname contains `production` case-insensitive. On violation it throws an Error that surfaces to the caller and stops execution (sec-r0-7).
  9. At module load, the helper runs a self-test against a temporary table created inside a nested `withTestTx`: inserts one row, asserts the row is visible inside the transaction, rolls back, asserts the row is gone. Self-test failure throws at import time so a tampered helper cannot be silently imported (sec-r0-11).
  10. `newTestRunId` returns `crypto.randomUUID` and ALSO writes a marker file at the OS temp directory. The marker file content is exactly three fields: the run id, the list of tables the caller intends to touch, and creation timestamp. No credentials. No environment variables. The containing directory is created via `mkdirSync` with `recursive: true` and mode `0o700` on POSIX (sec-r0-3).
- Verify. `node --test scripts/lib/test-db.test.mjs` exits 0. Test assertions include:
  a. `withTestTx` rolls back on normal return. Row count in `orders` before equals after.
  b. `withTestTx` rolls back on thrown error. Row is visible during function execution but gone after.
  c. `newTestRunId` returns a string matching the UUID-v4 regex.
  d. `createTestOrder(tx, {})` inserts with a unique email and the row is visible inside the tx and gone after rollback.
  e. Two concurrent `withTestTx` invocations on two clients each observe their own writes but never each other's (MVCC isolation).
  f. An override containing a semicolon plus DROP fragment rolls back cleanly; `orders` table still exists afterwards.
  g. Source contains zero occurrences of the literal `supabase` (grep returns 0).
  h. Source contains zero occurrences of the literal `createClient` (grep returns 0).
  i. Source contains at least one occurrence of `port: 5432`.
  j. Source contains at least one occurrence of `SET LOCAL session_replication_role = replica`.
- Rollback. `git rm scripts/lib/test-db.mjs scripts/lib/test-db.test.mjs`. No dependents until T1a, T2, T3, T4 land.

### T1a — Reaper scripts/lib/reap-test-runs.mjs (NEW)

- Files: `C:/Users/email/projects/ImNotAnAttorney-web/scripts/lib/reap-test-runs.mjs` (NEW).
- Action, absorbing cr-r0-4, cr-r0-5, sec-r0-3, sec-r0-10. Standalone CLI that scans the OS temp directory for marker files written by `newTestRunId`. For each marker file it parses the JSON content, reads the run id and table list, connects to Supabase via the same getClient path as T1 (NODE_ENV guard, production-hostname refusal, port 5432), and issues `DELETE FROM <name> WHERE test_run_id = <marker>` for each of the listed tables. On successful delete, the marker file is unlinked. Marker files that survived a SIGKILL are reaped on the next CLI invocation because the helper writes the marker file at `newTestRunId` call-time, not at process-exit (cr-r0-5). Two age filters: markers younger than 60 seconds are skipped (avoid racing a test that just wrote the marker but has not yet used it); markers older than 30 days are unlinked without DELETE (assumed pre-schema or already reaped). Credentials live only in `.env.local`; reaper reads them on startup. No secret ever enters the marker file (sec-r0-3). The reaper uses the dedicated `test_run_id` column for the WHERE clause, NOT a dual-semantic suffix scan on `stripe_session_id` (sec-r0-10). Exit status is 0 on clean run, 1 on any partial failure with per-marker detail written to stderr.
- Verify. File exists at the listed path. Contains a production-env refusal matching the helper's shape. Contains a DELETE FROM statement for each of the eight in-scope tables or a loop over a tables array whose values list all eight. Contains the 60-second and 30-day age bounds. Running the CLI on a clean system (no markers) exits 0 with empty stderr.
- Rollback. `git rm scripts/lib/reap-test-runs.mjs`.

### T2 — Convert scripts/test-ib-pipeline.ts rollback path (revised)

- Files: `C:/Users/email/projects/ImNotAnAttorney-web/scripts/test-ib-pipeline.ts`.
- Action, absorbing cr-r0-1, sec-r0-1, sec-r0-5, LEACH-1, LEACH-3, LEACH-9, sec-r0-9, cr-r0-14.
  1. Wrap the `cmdPush` body in `withTestTx(async tx => { body })`. Replace the four supabase-JS INSERTs with factory calls that receive the tx argument. No factory under the tx calls `createClient`. No code path inside the tx uses `supabase.from`.
  2. At the top of `cmdPush`, assert that the Stripe key in use has the `sk_test_` prefix. The script today reads `STRIPE_SECRET_KEY` from env into a local `STRIPE_SECRET` constant (line 66). The guard reads that same local: `STRIPE_SECRET.startsWith("sk_test_")`. On failure, print an explicit abort message naming the offending env var and exit non-zero. This prevents accidental live-mode Stripe session creation when `.env.local` holds the production key (sec-r0-1). Note: INAA uses a dual-key setup per CLAUDE.md — `STRIPE_SECRET_KEY` for test and `STRIPE_SECRET_KEY_LIVE` for production. The test harness must only ever consume `STRIPE_SECRET_KEY`; the guard asserts that the resolved key is in fact the test key.
  3. Stripe metadata is an explicit allowlist containing only two keys: `tier` and `test_run_id`. No fixture PII, no judge names, no case numbers may spread into metadata. A unit test in the companion test file asserts structural equality on the metadata object to catch accidental key leakage (sec-r0-5).
  4. The helper already issues `SET LOCAL session_replication_role = replica` per T1. T2 adds a code comment above the `withTestTx` call documenting that trigger suppression is in effect so Stripe webhooks, drip_emails triggers, and subscriber auto-create triggers do not fire during the test (LEACH-3, LEACH-9).
  5. The existing `cleanup` subcommand becomes a no-op that prints a one-line message explaining the rollback is automatic and that cleanup is retained only for backward compatibility with external runbooks.
  6. A pre-T2 trigger discovery step is performed manually by the author and recorded in the PR description: run a one-off information_schema.triggers query against the eight tables and list the discovered trigger names in the PR body. The test code itself does not need to enumerate triggers (sec-r0-9).
  7. Stripe test-mode dashboard accumulation is recorded as a followup task in the PR description. A separate one-time Stripe CLI cleanup is not in scope for this PR (cr-r0-14).
- Verify. After `npx tsx scripts/test-ib-pipeline.ts push`, a node-based SELECT via `node -e` and the shared client returns zero rows in `orders` where email matches the test prefix. Same is true after a SIGKILL mid-push. Inside the `cmdPush` function body, `supabase.from` matches zero. The literal `sk_test_` startsWith check appears above any Stripe API call.
- Rollback. `git checkout -- scripts/test-ib-pipeline.ts`.

### T3 — Convert scripts/test-inclusion-flow.mjs rollback path (revised)

- Files: `C:/Users/email/projects/ImNotAnAttorney-web/scripts/test-inclusion-flow.mjs`.
- Action, absorbing cr-r0-2, LEACH-1. Wrap `run()` body in `withTestTx(async tx => { body })`. Replace every supabase-JS INSERT with `createTestOrder(tx, overrides)`, `createTestCase(tx, overrides)`, `createTestIntake(tx, overrides)` as appropriate. Tests 1 through 4 are rewritten to read via `tx.query(sql, values)` rather than `supabase.from(...).select(...)`. Inside the transaction, MVCC gives the test read-your-own-writes semantics. Delete the existing `cleanup()` function and the `testIds` tracking array; rollback replaces both. After the rewrite, all four subtests still print PASS when the helper and migration are present.
- Verify. `node scripts/test-inclusion-flow.mjs` exits 0 and prints four PASS lines. A node-based SELECT via the shared client returns zero rows matching the test-inclusion email pattern. Inside the function body, `supabase.from` matches zero; `createTestOrder`, `createTestCase`, `createTestIntake` each appear at least once.
- Rollback. `git checkout -- scripts/test-inclusion-flow.mjs`.

### T4 — Convert scripts/test-e2e-dashboard.mjs marker path (revised)

- Files: `C:/Users/email/projects/ImNotAnAttorney-web/scripts/test-e2e-dashboard.mjs`.
- Action, absorbing cr-r0-5, LEACH-5, LEACH-6, sec-r0-10. This script hits local Next.js API routes that own their own Supabase connections inside each route handler. Rollback on the client side cannot reach rows that API routes inserted. Per Leach's gotcha, this script uses the marker path rather than transactional rollback.
  1. Call `newTestRunId` at the top of `setup()`. The helper writes the marker file to the OS temp directory at call time, not at exit. Writing at call time means a SIGKILL still leaves a marker on disk for the reaper to consume (cr-r0-5). The normal-exit path unlinks the marker via a `process.on("exit")` hook; the SIGKILL path does not fire that hook but the marker survives on disk.
  2. Every request to the API routes under test passes the run id as a query-string parameter or JSON body field so route handlers persist it on inserted rows via the `test_run_id` column added in T0. Where a route does not yet accept a run id, the route is grandfathered with an explicit followup note in the PR description; that route's tables degrade to marker-only coverage until a future PR threads the id through.
  3. REMOVE the `cleanup()` function that previously issued DELETE against the tables. Per LEACH-6, DELETE-as-cleanup is the anti-pattern: rows were briefly visible to CV probes between INSERT and DELETE. The probe-side filter (added in T8) is the real separation. The reaper (T1a) is the storage gardener that runs on cadence, not in the test hot path.
  4. Add a file-top header comment exactly: `// test-isolation-justified: API routes under test use their own DB connections; rollback impossible; marker + probe-side filter used instead`.
  5. Document a rejected alternative: pool-injection into `src/lib/supabase.ts` to let the test thread a transaction through the API routes. Rejected because the wrapper is shared with production code paths and the refactor complexity exceeds the payoff. Marker plus probe-side filter is cleaner (LEACH-5).
- Verify. Header comment is present in lines 1 to 10. `newTestRunId(` appears at least once (invocation form). The word `DELETE` does not appear inside any function declared `cleanup` or any function named similarly. After a clean run and reaper pass, a node-based SELECT returns zero rows where the `test_run_id` is not null AND the row was inserted more than two minutes ago. The OS temp marker directory contains zero files for the current pid after clean exit.
- Rollback. `git checkout -- scripts/test-e2e-dashboard.mjs`.

### T5 — Annotate no-op scripts (revised)

- Files: `C:/Users/email/projects/ImNotAnAttorney-web/scripts/test-aba-sample.mjs`, `C:/Users/email/projects/ImNotAnAttorney-web/scripts/test-batch-generation.mjs`.
- Action, absorbing cr-r0-16 and LEACH-8. Inspection confirms neither script writes to Supabase: `test-aba-sample.mjs` only fetches CourtListener, `test-batch-generation.mjs` only calls the Anthropic API and writes to a local `test-reports` directory. Use the dedicated `test-isolation-na:` marker form (semantically distinct from `test-isolation-justified:` which implies a deliberate exception). Exact header comments per file:
  - `test-aba-sample.mjs` first 10 lines: `// test-isolation-na: read-only CourtListener fetch, no Supabase writes`.
  - `test-batch-generation.mjs` first 10 lines: `// test-isolation-na: Anthropic API plus local test-reports directory only, no Supabase writes`.
  The T7 hook accepts both the `justified` and `na` forms.
- Verify. `grep -E "supabase\.from|\.insert\(|\.update\(" scripts/test-aba-sample.mjs scripts/test-batch-generation.mjs` returns no matches. Each file has its exact per-file justify comment in the first 10 lines.
- Rollback. `git checkout --` both files.

### T6 — Memory rewrite for gotcha-cv-probe-test-data-pollution.md (revised)

- Files: `C:/Users/email/.claude/projects/C--Users-email-projects-ImNotAnAttorney-web/memory/gotcha-cv-probe-test-data-pollution.md`.
- Action, absorbing cr-r0-15. Rewrite the memory to describe the new invariant: producer-level isolation via transactional rollback on transactional surfaces, plus the marker path fallback on non-transactional surfaces. Downgrade the `email.not.like %@example.com` filter in `inna.cv.json` from "fix" to "defense-in-depth layer, kept because pre-2026-04-24 test runs may have left residue AND because the marker path is probabilistic until every test script has been converted." Add pointers to `C:/Users/email/.claude/experts/brandur-leach.md`, the shared helper `scripts/lib/test-db.mjs`, the reaper `scripts/lib/reap-test-runs.mjs`, the draft rule, and the enforcement hook. Use section-heading content checks for verification rather than the fragile prior `grep -c symptom` count.
- Verify. File contains top-level section headings `## Source Incident`, `## The Root Fix`, `## Defense in Depth`, and `## References`, each appearing exactly once as lines starting with `## `. Body contains literal strings `brandur-leach.md`, `scripts/lib/test-db.mjs`, `scripts/lib/reap-test-runs.mjs`, and `defense-in-depth` (one hit minimum each).
- Rollback. `git checkout --` restores previous content.

### T7 — Hook enforcement enforce-test-isolation.js (revised)

- Files: `C:/Users/email/.claude/hooks/enforce-test-isolation.js` (NEW); `C:/Users/email/.claude/hooks/hook-server.js` (MODIFY, append to the EDITWRITE_HOOK_FILES list near enforce-bulk-insert-pattern.js).
- Action, absorbing cr-r0-7, cr-r0-8, cr-r0-13, sec-r0-4, sec-r0-12, cr-r0-16. PreToolUse on Edit, Write, MultiEdit. Block (during live phase) or warn (during DRY_RUN phase) unless a valid marker is present.
  1. Path regex (anchor on path separators on both sides): `(^|[\\/])scripts[\\/]test-[^\\/]+\.(ts|mjs|js)$`. Explicit exclude list: paths containing `scripts/lib/test-db.mjs`, `scripts/lib/test-db.test.mjs`, or `scripts/lib/reap-test-runs.mjs` never match, so the helper and its test and the reaper are never self-blocked (cr-r0-8).
  2. Detection uses a shared helper `stripCommentsAndStrings` (mirrored from enforce-bulk-insert-pattern.js) to strip JavaScript comments and string literals before scanning. This prevents a marker embedded inside a template literal or a string from falsely whitelisting the file (cr-r0-7, sec-r0-4).
  3. Marker regex is header-only (first 20 lines) and anchored to line-start: `^\s*//\s*test-isolation-(justified|na):\s*(.{15,})`. A minimum 15 characters of reason is enforced. Markers placed mid-file or embedded in strings do not count.
  4. Helper-import check: the stripped buffer contains a literal import from `./lib/test-db` or `../lib/test-db` in any of the JS extensions.
  5. Marker-path check: the stripped buffer contains the identifier `newTestRunId`.
  6. Scan limit: `MAX_SCAN_BYTES` is 2 * 1024 * 1024. Files larger than that fail open with an additionalContext note (cr-r0-13).
  7. DRY_RUN: the file contains `const DRY_RUN_UNTIL = '2026-05-01'`. Before that date, violations emit an additionalContext warning. On or after that date, violations call `shared.deny(reason)`.
  8. Both marker forms `test-isolation-justified:` (deliberate exception with potential write path) and `test-isolation-na:` (no Supabase writes at all) are accepted (cr-r0-16).
  9. A follow-up diag script scheduled for day 3 and day 6 of the DRY_RUN window is declared in T7a and not duplicated here (sec-r0-12).
- Verify. Hook file exists. `hook-server.js` EDITWRITE_HOOK_FILES array contains the literal `enforce-test-isolation.js`. Positive hook test: writing `scripts/test-fake.mjs` with a body that imports supabase-js and does a bare INSERT and NO marker triggers a hook additionalContext that mentions `enforce-test-isolation`. Negative hook test A: same content with a header `// test-isolation-justified: smoke harness valid reason fifteen-plus chars` produces no additionalContext. Negative hook test B: same content with header `// test-isolation-na: read-only probe, no writes` produces no additionalContext. Bypass-rejection test: a marker embedded inside a template literal or inside a string is not accepted; the hook still warns. Self-block test: writing `scripts/lib/test-db.mjs` itself produces no additionalContext (explicit exclude).
- Rollback. Remove `enforce-test-isolation.js`; revert the EDITWRITE_HOOK_FILES entry in `hook-server.js`.

### T7a — Diag audit script scripts/diag-test-pollution-status.mjs (NEW)

- Files: `C:/Users/email/projects/ImNotAnAttorney-web/scripts/diag-test-pollution-status.mjs` (NEW).
- Action, per sec-r0-12. A read-only audit script invoked manually on day 3 and day 6 of the T7 DRY_RUN window. Scans the hook's recent warning log (the sharded JSONL log files written under HOOKS_TMP), counts warnings by category (missing marker, template-literal bypass attempt, wrong-extension match), and prints a one-screen summary. Also queries the eight in-scope tables for the count where `test_run_id` is not null and `created_at` is within the last 7 days to show active marker-path coverage. No writes, no destructive actions. Exit 0 regardless of findings (diagnostic only).
- Verify. File exists. Contains a query filtering `test_run_id IS NOT NULL`. Names all eight in-scope tables by exact name. Contains a reference to the hook's warnings log location.
- Rollback. `git rm scripts/diag-test-pollution-status.mjs`.

### T8 — CV probe changes in continuous-verification repo (revised)

- Files: `C:/Users/email/projects/continuous-verification/configs/inna.cv.json`; `C:/Users/email/projects/continuous-verification/configs/inna.cv.notes.md` (NEW).
- Action, absorbing sec-r0-2, LEACH-6, cr-r0-11.
  1. Tighten the INNA-H1 `email.not.like` filter from the broad `%@example.com` to an explicit prefix-anchored list of the INAA-web test fixture patterns: `test-ib-pipeline-%@example.com`, `e2e-%@example.com`, `test-inclusion-%@test.imnotanattorney.com`, `test-pollution-sentinel-%@example.com`. The broad wildcard exclusion silently dropped legitimate descendant-domain UPL failures (for example, a real customer with an `@example.com` vanity address), which is a CV blind-spot risk (sec-r0-2).
  2. Add a `test_run_id.is.null` filter to every CV probe that reads any of the eight in-scope tables. Without probe-side filtering, the marker-path columns are cosmetic and test rows still appear in probe results (LEACH-6).
  3. Add a new counter-probe `inna-missed-evals-example-com` that selects rows in `cases` where email matches `%@example.com` AND status equals `review` AND `eval_results` is null AND `created_at` is older than 24 hours. Fires if the tightened prefix list accidentally lets a stuck real-customer `@example.com` case slip through. Acts as a tripwire for the tightening decision.
  4. Because `inna.cv.json` is strict JSON and the CV loader may not tolerate `_comment` keys, the rationale and review-date annotations live in a sibling file `configs/inna.cv.notes.md`. The notes file references the draft rule path, the review date `2026-05-01`, the per-probe `test_run_id.is.null` addition, and the new counter-probe. The JSON file itself stays strictly valid (cr-r0-11).
  5. Cross-repo note: this file is in a separate repository. The edit ships as a distinct PR on the continuous-verification default branch. The INAA-web PR description references the continuous-verification PR number so reviewers cross-check both.
- Verify. `inna.cv.json` contains each of the four tightened fixture-prefix strings. `inna.cv.json` filter fields contain `test_run_id` on at least eight probe entries. A probe with id `inna-missed-evals-example-com` is present. `configs/inna.cv.notes.md` exists and contains strings `2026-05-01` and `test-isolation.md`. Running `node verify.mjs --project inna --probe-only --no-trends` against a clean database exits 0 with all probes PASS.
- Rollback. `git checkout --` in the continuous-verification worktree; `git rm configs/inna.cv.notes.md`.

### T9 — Draft rule ~/.claude/rules/drafts/test-isolation.md (revised)

- Files: `C:/Users/email/.claude/rules/drafts/test-isolation.md` (NEW); `C:/Users/email/.claude/rules/CONTEXT.md` (MODIFY, append a single Scripts-table row).
- Action, per cr-r0-17. Draft rule describing the producer-level pattern: rollback-default on transactional surfaces, marker-path fallback on non-transactional surfaces, hook-enforced by `enforce-test-isolation.js`, escape markers `test-isolation-justified:` and `test-isolation-na:`. Cite Brandur Leach expert profile at `C:/Users/email/.claude/experts/brandur-leach.md`. Include Hook-Or-Harder meta-rule tie-in, DRY_RUN window (2026-04-24 through 2026-04-30 inclusive), promotion criteria (7 days zero false-positive blocks verified via `diag-test-pollution-status.mjs`), enforcement surface (hook file path, shared helper path, reaper path, escape markers), and Cascade mapping. Follow the structure of sibling drafts in `~/.claude/rules/drafts/` (for example `prevent-branch-stomp.md` and `enforce-windowshide.md`). Before editing `CONTEXT.md`, re-read the file to absorb any concurrent-session row additions; on conflict, rebase the single-row insert (cr-r0-17).
- Verify. Draft file exists and contains `## Source Incident`, `## The Rule`, `## Enforcement`, `## Promotion Path`, and `## Cascade` top-level headings (one grep per heading). `~/.claude/rules/CONTEXT.md` contains the string `test-isolation.md` on a row inside the Scripts table. The CONTEXT.md edit touches at most one net-new row.
- Rollback. `git rm ~/.claude/rules/drafts/test-isolation.md`; revert the CONTEXT.md edit.

### T10 — Plan-level Rollback Order section

- Files: this plan document, section `## Rollback Order (plan-level)` above.
- Action, per cr-r0-12. Plan-level documentation of the per-task revert order so partial failure recovers cleanly. No code changes. The section already lives above `## Numbered Tasks` in this file (added in revision 2). T10 is recorded as a task for bookkeeping symmetry so the Rollback Order is reviewable and committable as a distinct plan revision.
- Verify. This file contains a top-level `## Rollback Order (plan-level)` heading. The section lists all 13 tasks in reverse execution order. Each list item starts with a number, a period, a space, and a task identifier matching `T[0-9a-z]+ `.
- Rollback. Revert the section via `git revert` on the plan-revision commit.

## Success Criteria

Every criterion is binary PASS or FAIL and verifiable by an independent reader.

1. File `C:/Users/email/projects/ImNotAnAttorney-web/scripts/lib/test-db.mjs` exists.
2. File `C:/Users/email/projects/ImNotAnAttorney-web/scripts/lib/test-db.test.mjs` exists.
3. `node --test scripts/lib/test-db.test.mjs` exits 0 against a clean database.
4. `scripts/lib/test-db.mjs` exports named functions `withTestTx`, `createTestOrder`, `createTestCase`, `createTestIntake`, `createTestSubscriber`, `createTestDripEmail`, `newTestRunId` (grep for `export ` combined with each name returns at least 6 matches).
5. `grep -cE '(createClient|from "@supabase/supabase-js")' scripts/lib/test-db.mjs` returns 0.
6. Helper source contains `port: 5432` (grep returns at least 1).
7. Helper source contains `SET LOCAL session_replication_role = replica` (grep returns at least 1).
8. Helper factory defaults use `randomUUID` for unique-indexed columns (grep returns at least 6 uses).
9. Helper runs a module-load self-test that throws on rollback-verification failure (test-db.test.mjs import-only smoke exits 0).
10. Helper refuses when `SUPABASE_DB_URL` hostname contains the case-insensitive substring `production` or when `NODE_ENV` equals `production` (unit test covers both).
11. File `supabase/migrations/20260424a_test_run_id_columns.sql` exists.
12. Migration contains `ADD COLUMN IF NOT EXISTS test_run_id uuid` exactly 8 times.
13. Migration contains `CREATE INDEX IF NOT EXISTS` with predicate `WHERE test_run_id IS NOT NULL` at least 8 times.
14. File `scripts/lib/reap-test-runs.mjs` exists.
15. Reaper contains a production-env refusal equivalent in shape to the helper.
16. Reaper DELETE statements cover the eight in-scope table names (either eight literal DELETEs or a loop over a tables array whose values list all eight).
17. `scripts/test-ib-pipeline.ts` wraps `cmdPush` body in `withTestTx(` (grep returns at least 1).
18. `scripts/test-ib-pipeline.ts` contains a `sk_test_` startsWith guard placed above any Stripe API call (grep confirms both `sk_test_` and `startsWith` each at least 1).
19. Stripe metadata object in `scripts/test-ib-pipeline.ts` contains only the two keys `tier` and `test_run_id` (companion unit test asserts structural equality).
20. Inside the `cmdPush` function body in `scripts/test-ib-pipeline.ts`, `supabase.from` occurs 0 times.
21. `scripts/test-inclusion-flow.mjs` wraps `run()` body in `withTestTx(` (grep returns at least 1).
22. Inside the `run` function body in `scripts/test-inclusion-flow.mjs`, `supabase.from` occurs 0 times.
23. `scripts/test-inclusion-flow.mjs` calls `createTestOrder`, `createTestCase`, and `createTestIntake` each at least once.
24. `scripts/test-e2e-dashboard.mjs` lines 1 through 10 contain `// test-isolation-justified: ` followed by at least 15 characters of reason.
25. `scripts/test-e2e-dashboard.mjs` contains `newTestRunId(` in invocation form (grep returns at least 1).
26. `scripts/test-e2e-dashboard.mjs` contains zero `DELETE FROM` statements with a `test_run_id` predicate inside any cleanup-named function. The DELETE-as-cleanup anti-pattern is fully removed.
27. `scripts/test-aba-sample.mjs` lines 1 through 10 contain the exact comment `// test-isolation-na: read-only CourtListener fetch, no Supabase writes`.
28. `scripts/test-batch-generation.mjs` lines 1 through 10 contain the exact comment `// test-isolation-na: Anthropic API plus local test-reports directory only, no Supabase writes`.
29. `gotcha-cv-probe-test-data-pollution.md` contains top-level headings `## Source Incident`, `## The Root Fix`, `## Defense in Depth`, `## References`, each exactly once.
30. Memory file body contains literal strings `brandur-leach.md`, `scripts/lib/test-db.mjs`, `scripts/lib/reap-test-runs.mjs`, and `defense-in-depth` (at least 1 hit per string).
31. File `~/.claude/hooks/enforce-test-isolation.js` exists.
32. Hook file contains the exact line `const DRY_RUN_UNTIL = '2026-05-01'`.
33. Hook file contains at least one call to the helper `stripCommentsAndStrings`.
34. Hook file contains an explicit exclude of any path containing `scripts/lib/test-db` (grep returns at least 1).
35. `~/.claude/hooks/hook-server.js` EDITWRITE_HOOK_FILES list contains the literal string `enforce-test-isolation.js`.
36. Positive hook test: writing a new `scripts/test-fake.mjs` whose body does a bare `supabase.from` call plus an INSERT with no marker triggers a hook `additionalContext` mentioning `enforce-test-isolation`.
37. Negative hook test: same file with a line-start header `// test-isolation-justified: smoke harness valid reason fifteen-plus chars` produces no `additionalContext`. Embedding the marker inside a template literal does NOT satisfy the hook.
38. File `scripts/diag-test-pollution-status.mjs` exists, names all eight in-scope tables by exact name, and contains a query filtering `test_run_id IS NOT NULL`.
39. `continuous-verification/configs/inna.cv.json` contains the four tightened fixture-prefix strings (`test-ib-pipeline-`, `e2e-`, `test-inclusion-`, `test-pollution-sentinel-`), includes `test_run_id` on at least eight probe filter entries, and contains a new probe with id `inna-missed-evals-example-com`. Sidecar file `configs/inna.cv.notes.md` exists and contains `2026-05-01` and `test-isolation.md`.
40. Draft rule file `~/.claude/rules/drafts/test-isolation.md` exists with `## Source Incident`, `## The Rule`, `## Enforcement`, `## Promotion Path`, `## Cascade` headings. `~/.claude/rules/CONTEXT.md` Scripts table contains a row referencing `test-isolation.md`. This plan document `## Out of Scope (sibling sessions)` section contains an explicit rejection line for the sandboxed-schema approach (worry clause b), citing the Leach framework rationale.

## Out of Scope (sibling sessions)

Preserved from stub above. Additional items clarified this session:

- Do not refactor `src/lib/supabase.ts` or any Supabase JS client wrapper. The shared helper uses `pg` directly on the pooler; it does not touch the existing `createClient` wrapper.
- Do not add new CV probes this session. Probe surface stays as it is; only the existing INNA-H1 filter is annotated.
- The `test_run_id` column schema migration is now IN-SCOPE as T0 (promoted in revision 2). The migration FILE ships with this PR. The live Supabase APPLY is deferred to a distinct migration-approval session. Until the apply runs, T1a reaper and T4 marker writes degrade to marker-file-only coverage. Dual-semantic `stripe_session_id` suffix scanning is explicitly REJECTED (sec-r0-10) — the dedicated `test_run_id` column is the sole mechanism.
- Do not port this pattern to `ImNotAnAttorney-engine` scripts this session. The engine repo has its own test surface and its own sibling session; cross-repo work is explicitly deferred.
- Do not touch blog / content / queue / pipeline code per HARD RULE `feedback-no-blog-work` (2026-04-23).
- **Sandboxed schema approach rejected.** Worry clause (b) proposed routing test writes to a sandboxed Postgres schema (e.g., `test_sandbox.*`). This plan does not route test writes to sandboxed schema. Rationale per Leach's framework (one-tx-per-test, Postgres MVCC isolation): schema-per-test would require RLS duplication per schema, migration replay, cross-schema FK plumbing, and Supabase-project permissions outside our operational control. Clauses (a) transactional rollback and (c) test_run_id marker jointly satisfy the worry's root intent (no test pollution reaching CV checks). If this rejection is wrong, the trigger is a CV false-positive that rollback+marker cannot prevent — that would reopen clause (b) evaluation with schema-per-test as the fix.

## Rounds Log

See companion: `2026-04-24-worry-test-pollution-cv-rounds.md`

## Findings

See companion: `2026-04-24-worry-test-pollution-cv-findings.md`
