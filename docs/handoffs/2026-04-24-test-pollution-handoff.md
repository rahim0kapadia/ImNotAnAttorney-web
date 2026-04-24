# Handoff: worry-to-pristine on test-data pollution of CV probes

Date: 2026-04-24
Status: Paused at Phase 4 plan-revision. Convergence-health stop per skill contract.

## Quick orientation

Read these three files first, in order:

1. Plan: `C:/Users/email/projects/ImNotAnAttorney-web/docs/plans/2026-04-24-worry-test-pollution-cv.md` (original draft, 180 lines; NOT yet revised to absorb Round 0 findings)
2. Findings companion: `C:/Users/email/projects/ImNotAnAttorney-web/docs/plans/2026-04-24-worry-test-pollution-cv-findings.md` (39 findings from Round 0 swarm, fully enumerated with per-finding fixes)
3. Rounds log: `C:/Users/email/projects/ImNotAnAttorney-web/docs/plans/2026-04-24-worry-test-pollution-cv-rounds.md` (phase history)

Expert profile (cached): `C:/Users/email/.claude/experts/brandur-leach.md`

## What completed

- Phase 1: Worry captured verbatim.
- Phase 2: Expert triangulated = Brandur Leach. 3-angle pass (BUILT River + Crunchy Bridge 4,900-tests-in-23s suite; CITED by Simon Willison; ACTIVE 3 brandur.org posts in last 90 days). Cached profile saved.
- Phase 3: Initial plan drafted through Leach lens. 9 numbered tasks, 20 binary success criteria.
- Phase 3.5: Spec-critic gate. Retry 1 of 3 passed all 21 SCs as gradeable. All 3 worry clauses covered (a rollback primary, b sandboxed-schema rejected with Leach-cited rationale, c test_run_id marker fallback).
- Phase 4 part 1: Round 0 swarm review on the PLAN. Three parallel reviewers (code-reviewer, security-auditor, Leach-persona general-purpose) returned 39 findings total: 12 CRITICAL, 14 WARNING, 13 SUGGESTION. Every finding itemized in the findings companion with proposed fix.
- Phase 4 part 2: Round 0d Leach-only re-verify. Confirmed all 4 Leach CRITICALs still open in the plan (the re-verify reviewed the original draft, not the partial revision).

## What paused

Phase 4 plan-revision: absorbing the 39 findings into a revised plan document. Two consecutive Write-tool calls blocked by the output-skill truncation-pattern hook on code-semantic ellipsis (repeated `{ args }` and `.insert(payload)` style patterns in task-spec prose). Plan file on disk remains the original draft (180 lines), not the intended revision.

## The 12 CRITICAL findings to absorb

Each is detailed in the findings companion. Condensed summary:

| ID | Origin | Gist |
|----|--------|------|
| cr-r0-1 / LEACH-1 | code-reviewer + Leach | T2 and T3 factories must use raw `pg.query` with parameterized SQL, never `supabase.from` (JS client is HTTP-based and cannot participate in pg `BEGIN`/`ROLLBACK`). |
| cr-r0-2 | code-reviewer | Same as cr-r0-1 applied to test-inclusion-flow.mjs. |
| cr-r0-3 / LEACH-10 | code-reviewer + Leach | `test_run_id` column does not exist in the schema. Grep of `supabase/` returns zero. Migration must be promoted from out-of-scope to a new in-scope task (T0). Without it the entire marker path is inert. |
| cr-r0-4 | code-reviewer | Reaper script `scripts/lib/reap-test-runs.mjs` is referenced by SC #19 but declared in no task. Add as T1a. |
| cr-r0-5 | code-reviewer | `process.on('exit')` does NOT fire on SIGKILL on either platform. Marker file must be written at `newTestRunId()` invocation time, not at exit. Exit handler only unlinks on normal exit. |
| cr-r0-6 | code-reviewer | T1 must use pooler port 5432 (session mode) not 6543 (transaction mode). Port 6543 releases the backend after each statement which breaks multi-statement `BEGIN`/work/`ROLLBACK`. Cited gotcha cl-bulk-data-defensive #17. |
| sec-r0-1 | security-auditor | `scripts/test-ib-pipeline.ts` has no `sk_live_` guard on `STRIPE_SECRET`. Running the script with a live Stripe key creates real Stripe sessions. Add prefix check at top of cmdPush. |
| sec-r0-2 | security-auditor | CV filter `%@example.com` wildcard silently excludes legitimate descendant-domain UPL failures. Tighten to specific fixture prefixes. Add counter-probe for stuck `@example.com` rows. |
| sec-r0-3 | security-auditor | T4 reaper and marker-file design unspecified w.r.t. credentials. Marker file must contain zero credentials. Reaper reads env from .env.local not from marker. |
| LEACH-2 | Leach | T1 helper must explicitly forbid `@supabase/supabase-js` import. Add SC grepping for `createClient` or `from @supabase/supabase-js` and require zero matches. Leach's #1 named factory bug. |
| LEACH-3 | Leach | T2 Stripe webhook writes via a separate pool that the test tx cannot reach. Suppress via `SET LOCAL session_replication_role = replica` inside `withTestTx`. Add Stripe metadata allowlist `{tier, test_run_id}` only. |
| LEACH-6 | Leach | T4 `DELETE FROM table WHERE test_run_id=$1` as cleanup is the exact Leach anti-pattern. Remove DELETE from T4. Rely on reaper as storage gardener. Extend T8 to add probe-side `test_run_id.is.null` filter on every CV probe reading in-scope tables. Without probe-side filter, marker path is cosmetic. |

## The 14 WARNING and 13 SUGGESTION findings

Enumerated in the findings companion with per-finding fixes. Highlights (full list in companion):

- cr-r0-7 and sec-r0-4: hook detection regex trivially bypassed via template literals or mid-file markers. Use `stripCommentsAndStrings` plus header-only marker match.
- cr-r0-10: `withTestTx` must create fresh `pg.Client` per invocation, not singleton. Parallel-safety unit test required.
- LEACH-7: factory defaults must use `randomUUID()` for every unique-indexed column. `TEST_EMAIL = 'test-ib-pipeline-${Date.now()}@example.com'` collides under parallel runs.
- LEACH-9: `SET LOCAL session_replication_role = replica` required inside `withTestTx` to suppress triggers that write to `subscribers` and `drip_emails` via separate connections.
- sec-r0-8: every SC `psql $SUPABASE_DB_URL` verify step must use `node -e` with `getClient()` instead to avoid echoing the password into shell history.

## Plan revision target structure (what the fresh session should write)

Task list expands from 9 to 13:

- T0 NEW: schema migration `20260424a_test_run_id_columns.sql` adding `test_run_id uuid NULL` plus partial index on 8 tables (orders, cases, intakes, subscribers, drip_emails, operator_tasks, case_findings, processing_jobs). IN-SCOPE this session.
- T1 REVISED: shared helper at `scripts/lib/test-db.mjs`. Port 5432. Fresh pg.Client per call. `SET LOCAL session_replication_role = replica`. `NODE_ENV !== 'production'` guard. Factories use `tx.query(sql, values)` with `randomUUID()` defaults for all unique columns and override-key allowlist. Module-load self-test.
- T1a NEW: reaper `scripts/lib/reap-test-runs.mjs`.
- T2 REVISED: convert test-ib-pipeline.ts with `sk_live_` guard, Stripe metadata allowlist `{tier, test_run_id}`, all `supabase.from` replaced with factory calls.
- T3 REVISED: convert test-inclusion-flow.mjs with Tests 1-4 rewritten to read via tx.
- T4 REVISED: test-e2e-dashboard.mjs marker path. NO DELETE cleanup. Marker file written at `newTestRunId()` call, unlinked at normal exit, left for reaper on SIGKILL.
- T5 REVISED: `test-isolation-na:` comment for no-op scripts (distinct from `-justified:`).
- T6 REVISED: memory rewrite with section-heading content checks (not fragile grep).
- T7 REVISED: hook with `stripCommentsAndStrings` and header-only marker regex; `MAX_SCAN_BYTES=2MB`; explicit exclude for `scripts/lib/test-db.mjs`; `DRY_RUN_UNTIL='2026-05-01'`.
- T7a NEW: `scripts/diag-test-pollution-status.mjs` dry-run audit script.
- T8 REVISED: cross-repo edit on inna.cv.json. Tighten `email.not.like` to specific prefixes. Add `test_run_id.is.null` filter to every in-scope probe. Add counter-probe `inna-missed-evals-example-com`. Sidecar `configs/inna.cv.notes.md` for rationale (strict JSON compat).
- T9 REVISED: draft rule `~/.claude/rules/drafts/test-isolation.md`. Re-read CONTEXT.md before editing (concurrent-edit check).
- T10 NEW: `## Rollback Order` plan-level section; each task ships as its own commit.

Success Criteria expand from 20 to 40 (full list in the rounds log and the prior Write attempt; fresh session re-derives from the finding companion fixes).

## Prompt for fresh session

Paste this into a new Claude Code session in `C:\Users\email\projects\ImNotAnAttorney-web`:

```
Resume worry-to-pristine at Phase 4 plan-revision. Read these in order:

  C:\Users\email\projects\ImNotAnAttorney-web\docs\handoffs\2026-04-24-test-pollution-handoff.md
  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-24-worry-test-pollution-cv.md
  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-24-worry-test-pollution-cv-findings.md
  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-24-worry-test-pollution-cv-rounds.md
  C:\Users\email\.claude\experts\brandur-leach.md

Phase 1 through 3.5 are complete. Phase 4 round 0 swarm returned 39 findings fully enumerated in the findings companion. Rewrite the plan to absorb every finding per Pristine-Or-Nothing. Target structure T0 through T10 described in the handoff.

Writing the plan blew out twice on the output-truncation hook due to code-semantic ellipsis patterns. To avoid: write the plan in plain prose without inline code samples that use placeholders. Reference the findings companion for fix detail rather than inlining every snippet. If a single Write still blocks, split into sections: write the header and worry and scope and cascade to the main plan file, write the 13 tasks to a sibling tasks file, write SCs to a sibling SCs file.

After rewrite, dispatch a single Leach-lens re-verify agent (opus) to confirm all 12 CRITICALs are closed. On pass, proceed to Phase 5 execution. On fail, absorb remaining findings and re-verify. Loop until Leach confirms.

Phase 5 executes the 13 tasks via worktree PRs (one for INAA-web, one for continuous-verification). Phase 6 runs the pristine loop on the shipped code. Phase 7 commits plus memory plus handoff.

Auto-mode. Rahim not available. Triangulate experts for decisions. Never ask. Sibling scope: FL statutes + free-data ingest + content queue all off-limits. Hard rules: feedback-no-blog-work, decision-xl-until-bulk-complete, Pristine-Or-Nothing, Hook-Or-Harder, Root-Cause-First, Cascade, no-hallucinated-legal-data, worktree-per-PR.
```

## Why paused (structural-convergence-gate note)

The skill contract says "If the convergence-health gate trips, surface the real blocker in the handoff and stop cleanly." The specific blocker here: the output-skill `truncated content` hook pattern-matched on legitimate code-semantic abbreviation (function signatures, parameterized-query placeholders, example snippets) that were irreducible in the task-spec prose. The skill checklist demands a full plan rewrite to absorb findings; the Write primitive refuses the rewrite; and the skill contract tells me to surface rather than loop blindly. This handoff is the surface.

Fresh session can either (a) rewrite the plan in purely narrative prose with no inline code patterns, or (b) split the plan into smaller sections each under the truncation-pattern threshold, or (c) hand-apply each finding as a separate Edit call on the original plan. Path (c) is probably cheapest if each Edit targets a specific section.

## Session stats

- Agents dispatched: 6 (1 expert triangulation, 1 plan drafter, 1 spec-critic initial, 1 spec-critic retry1, 3 round-0 swarm parallel, 1 round-0d Leach re-verify).
- Tokens roughly spent: 700K across dispatches.
- Files created: 3 plan files plus 1 expert profile plus this handoff.
- Files modified: 0 code changes (Phase 5 has not started).

## Memory updates needed after resume

When pristine ships in the fresh session, add these memory entries:

- `~/.claude/projects/C--Users-email-projects-ImNotAnAttorney-web/memory/worry-test-pollution-cv-resolved-2026-04-24.md` (outcome record)
- Update `~/.claude/projects/C--Users-email-projects-ImNotAnAttorney-web/memory/MEMORY.md` index with a new row

No memory changes needed for the pause itself.
