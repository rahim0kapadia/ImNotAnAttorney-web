# Findings Companion: test-pollution-cv

Accumulated findings across all rounds. Pristine-Or-Nothing: every finding fixed.

## Round 0 (plan review, 3 reviewers)

**Total: 39 findings. Severity: 12 CRITICAL / 14 WARNING / 13 SUGGESTION.**

### CRITICAL (plan blocks — must fix before Phase 5)

| ID | Reviewer | Task | Finding | Fix |
|----|----------|------|---------|-----|
| cr-r0-1 / LEACH-1 | code-reviewer + Leach | T2 | `supabase.from().insert()` is HTTP/PostgREST — cannot participate in pg `BEGIN/ROLLBACK`. Factories must use `pg.Client.query()`. | Rewrite T2 Action: factories issue raw pg INSERTs via the tx arg; remove `createClient()` from the insert path; grep `supabase\.from` inside tx block returns 0. |
| cr-r0-2 / LEACH-1 | code-reviewer + Leach | T3 | Same as cr-r0-1 for `test-inclusion-flow.mjs`. Test 4 (refund cascade) reads back via JS client — must rewrite all reads through tx too. | Rewrite T3 Action same shape; Tests 1-4 read via `tx.query(...)`. |
| cr-r0-3 / LEACH-10 | code-reviewer + Leach | T4, SC #19 | `test_run_id` column does NOT exist in schema (grep supabase/ returns zero). Plan claims migration out-of-scope but SC #19 requires the column. Circular. | Promote schema migration to IN-SCOPE as T0 (add `test_run_id uuid NULL` + partial index on 8 tables). SC #19 then verifiable. |
| cr-r0-4 | code-reviewer | T4 | `scripts/lib/reap-test-runs.mjs` referenced by SC #19 but declared in no task. | Add T4a: declare reaper file, CLI contract, verify, rollback. |
| cr-r0-5 | code-reviewer | T4 | `process.on('exit')` does NOT fire on SIGKILL. Marker-file-on-exit is broken. | Rewrite T4: write marker file at `newTestRunId()` call (start-of-test); exit handler UNLINKS on normal exit. SIGKILL leaves marker, reaper consumes. |
| cr-r0-6 | code-reviewer | T1 | Port 6543 (transaction mode) releases backend per-statement — breaks multi-statement `BEGIN/ROLLBACK`. Must use 5432 (session mode). Plan contradicts itself. | T1 Action: explicit `port=5432`; add session-level defenses (`statement_timeout`, `idle_in_transaction_session_timeout`, `tcp_keepalives_*`) per cl-bulk-data-defensive #17. |
| sec-r0-1 | security-auditor | T2 | No `sk_live_` guard in `test-ib-pipeline.ts`. If `.env.local` holds live key, `push` creates REAL Stripe sessions. | Add prefix check at top of `cmdPush`: assert `STRIPE_SECRET.startsWith('sk_test_')` or exit non-zero. New SC for the guard. |
| sec-r0-2 | security-auditor | T8 | `%@example.com` filter silently excludes legitimate `*.example.com` UPL failures — CV blind-spot, no-hallucinated-legal-data risk. | Tighten filter to specific fixture prefixes (`test-ib-pipeline-%`, `e2e-%`, `test-inclusion-%`). Add counter-probe `inna-missed-evals-example-com` that flags any `@example.com` with `status=review`+`eval_results=NULL`+>24h. |
| sec-r0-3 | security-auditor | T4 | Marker file risks embedding credentials; reaper auth path unspecified. | T4a reaper contract: marker file contains ONLY `{test_run_id, tables_touched, created_at}` — zero credentials. Reaper reads env from `.env.local`. `mkdirSync({recursive:true, mode:0o700})` on POSIX. |
| LEACH-2 | Leach | T1 | Plan does not forbid factories from calling `createClient`. Leach's #1 named factory bug. | T1 Action: explicit "factories MUST NOT import `@supabase/supabase-js` or call `createClient`." SC: `grep -cE '(createClient|from "@supabase/supabase-js")' scripts/lib/test-db.mjs` returns 0. |
| LEACH-3 | Leach | T2 | Stripe webhook `checkout.session.completed` → route handler → `createClient` → INSERT via separate pool. Test's pg tx cannot rollback it. | T2 Action: add `SET LOCAL session_replication_role = replica` inside tx (Leach-endorsed) to suppress triggers. Verify Stripe webhook does NOT fire during test (use Stripe test-mode with webhook disabled, or local override). |
| LEACH-6 | Leach | T4, T8 | `DELETE ... WHERE test_run_id=$1` is THE Leach anti-pattern. Rows visible to CV probes between INSERT and DELETE. CV probes never reconfigured to filter `test_run_id IS NULL`. Marker path is cosmetic without probe-side filter. | Remove DELETE cleanup from T4 (keep reaper as storage gardener, not test cleanup). Extend T8: add `test_run_id.is.null` filter to EVERY CV probe reading `orders/cases/intakes/subscribers/drip_sends/operator_tasks/case_findings/processing_jobs`. Rewrite SC #19 to verify probe-output cleanliness, not row-existence. |

### WARNING

| ID | Reviewer | Task | Finding | Fix |
|----|----------|------|---------|-----|
| cr-r0-7 / sec-r0-4 | code-reviewer + security-auditor | T7 | Hook escape-marker bypass via template literals / embedded comments. Reuse `stripCommentsAndStrings` from `enforce-bulk-insert-pattern.js`. | T7 Action: use comment+string stripping; marker must be in first 20 lines; regex `^\s*//\s*test-isolation-justified:\s*(.{15,})`. New SC: write with marker inside template literal is BLOCKED. |
| cr-r0-8 | code-reviewer | T7 | Filename match under-scoped (misses `__tests__/`, `*.test.mjs`; risks self-recursion on T1's own test file). | T7 path regex: `/(^|[\\\\/])scripts[\\\\/]test-[^\\\\/]+\.(ts\|mjs\|js)$/`. Explicit exclude for `scripts/lib/test-db(\.test)?\.mjs`. |
| cr-r0-9 | code-reviewer | T1 | `createTestSubscriber` in Action but missing from SC #3 regex. | Add to SC #3, match count ≥6. Specify full signatures for each factory. |
| cr-r0-10 | code-reviewer | T1 | Not specified whether `withTestTx` creates fresh pg.Client or reuses db.mjs singleton. Parallel tests would interleave BEGIN/ROLLBACK. | T1 Action: fresh `pg.Client` per call, `client.end()` in finally. Parallel-safety unit test in T1 verify (two concurrent `withTestTx` calls isolated). |
| cr-r0-11 | code-reviewer | T8 | `inna.cv.json` is strict JSON — `_comment` keys may be rejected by CV loader. Cross-repo edit unhandled in Out-of-Scope. | Verify loader tolerance first; if strict, use sibling `configs/inna.cv.notes.md`. Explicit cross-repo note in Out-of-Scope. Rollback directory specified. |
| cr-r0-12 | code-reviewer | all | Per-task Rollback doesn't compose. Partial failure leaves broken imports. | Add plan-level `## Rollback Order` — reverse T9→T0. Each task ships as its own commit for clean `git revert`. |
| sec-r0-5 | security-auditor | T2 | Fixture PII (`Judge Patricia Martinez` etc.) could leak into Stripe metadata during refactor. | T2: Stripe metadata allowlist = `{tier, test_run_id}` only. Factory overrides never spread into Stripe calls. |
| sec-r0-6 | security-auditor | T1 | `overrides` injection surface not mandated parameterized. | T1 Action: all factories use `client.query(sql, values)` — never template-string SQL. Adversarial test in T1 verify: inject `'; DROP TABLE --` as email, tx rollback leaves schema intact. |
| sec-r0-7 | security-auditor | T1 | Service-role DB URL broadens credential blast radius. | T1 Action: document why service-role required (tests insert across RLS-blocked tables); add `NODE_ENV !== 'production'` guard; refuse if URL hostname contains `production`. |
| sec-r0-8 | security-auditor | SCs 4/5/6/19 | `psql $SUPABASE_DB_URL -c "..."` echoes password into shell history. | Rewrite SC commands to use `node -e` with `getClient()` from `scripts/lib/db.mjs`. |
| LEACH-5 | Leach | T4 | Plan adopts marker path without documenting rejected alternative (test-pool injection into Next.js). | Add one paragraph under T4 explicitly rejecting pool-injection with rationale (complexity vs value; `src/lib/supabase.ts` out-of-scope). |
| LEACH-7 | Leach | T1 | `TEST_EMAIL = 'test-ib-pipeline-${Date.now()}@example.com'` collides on unique constraint under parallel runs. `stripe_session_id: 'test_sess_e2e_dashboard'` hardcoded → guaranteed collision. | T1 factory defaults use `randomUUID()` for EVERY unique-indexed column. New SC: grep factories for `randomUUID` usage on each unique column. |
| LEACH-9 | Leach | T2 | Triggers/Edge Functions on `orders` INSERT write to `subscribers`/`drip_emails` via separate connections. Rollback cannot reach them. | T2 Action adds `await tx.query("SET LOCAL session_replication_role = replica")` before any factory call (blocks triggers for tx duration). |
| LEACH-10 (dup) | Leach | SC #19 | Same as cr-r0-3. |

### SUGGESTION

| ID | Reviewer | Task | Finding | Fix |
|----|----------|------|---------|-----|
| cr-r0-13 | code-reviewer | T7 | Missing `MAX_SCAN_BYTES` cap (mirror `enforce-bulk-insert-pattern.js`). | Add to T7. |
| cr-r0-14 | code-reviewer | T2 | Stripe test-mode dashboard accumulation. | Out-of-scope note: Stripe-side cleanup = followup task. |
| cr-r0-15 | code-reviewer | T6 | `grep -c "symptom" ≤ 1` fragile. | Drop; replace with section-heading checks. |
| cr-r0-16 | code-reviewer | T5 | `test-isolation-justified` misleading for scripts that don't write. | Use `test-isolation-na:` for no-op scripts; T7 hook accepts both. |
| cr-r0-17 | code-reviewer | T9 | `~/.claude/rules/CONTEXT.md` concurrent-edit risk. | Re-read before edit; rebase single-row insert on conflict. |
| sec-r0-9 | security-auditor | T2 | Trigger discovery step missing. | Pre-T2: `SELECT trigger_name ... FROM information_schema.triggers WHERE event_object_table IN (...)`. |
| sec-r0-10 | security-auditor | T4 | `stripe_session_id` suffix = dual-semantic column (mixes test + real IDs). | Use dedicated `test_run_id` column (already promoted to T0). |
| sec-r0-11 | security-auditor | T1 | Helper tamper risk — hook checks import not rollback behavior. | Add self-test call at module load: `withTestTx` verifies its own rollback against ephemeral temp table. |
| sec-r0-12 | security-auditor | T7 | 7-day dry-run allows silent drift. | Add `scripts/diag-test-pollution-status.mjs` running on day 3 + day 6 of dry-run, reports delta. |
| LEACH-4 | Leach | T1 | `SET` vs `SET LOCAL` hygiene in helper. | One-line rule in T1: any GUC tuning inside tx = `SET LOCAL`. |
| LEACH-8 | Leach | T5 | Justify comment specificity. | Per-file exact comment text stated. |

## Round 1+

*[Pending — after Phase 5 execution]*
