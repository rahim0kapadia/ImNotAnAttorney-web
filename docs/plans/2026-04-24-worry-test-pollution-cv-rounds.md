# Rounds Log: test-pollution-cv

## Round 0 — Plan review phase

### Round 0a: spec-critic gradeability gate (initial)

| Reviewer | Model | Findings | Resolution |
|----------|-------|----------|------------|
| spec-critic | opus | sc-9 FOO-marker (grep on bare name matches import/comment), sc-12 FOO-marker (bare `DRY_RUN_UNTIL` string without behavioral anchor), sc-14 qualitative `silently`, sc-19 conditional+undefined reaper artifact. Worry clause (b) "sandboxed schema" uncovered by any SC. `overall_pass: false`. | Orchestrator applied every `suggested_rewrite` directly to the plan file. Added SC #21 documenting explicit decision to skip clause (b), citing Leach's framework rationale in Out-of-Scope section. |

### Round 0b: spec-critic gradeability gate (retry 1 of 3)

| Reviewer | Model | Findings | Resolution |
|----------|-------|----------|------------|
| spec-critic | opus | 21 of 21 criteria gradeable. All 3 worry clauses covered (a rollback, b sandboxed-rejected-with-rationale, c marker). `overall_pass: true`. | Advanced to Phase 4 plan swarm review. |

### Round 0c: plan swarm review (3 reviewers in parallel)

Total findings: 39 (12 CRITICAL, 14 WARNING, 13 SUGGESTION). All absorbed into plan revision. Per-finding resolution tracked in `2026-04-24-worry-test-pollution-cv-findings.md`.

| Reviewer | Model | Finding Count | Severity Breakdown | Key Themes |
|----------|-------|---------------|--------------------|-----------|
| code-reviewer | opus | 17 | 6 CRITICAL, 6 WARNING, 5 SUGGESTION | Supabase-JS cannot participate in pg tx; `test_run_id` column does not exist; port 6543 breaks multi-statement tx; reaper script undeclared; SIGKILL does not fire `process.on('exit')`; hook detection regex trivially bypassed via template literals. |
| security-auditor | opus | 12 | 3 CRITICAL, 5 WARNING, 4 SUGGESTION | No `sk_live_` guard; `%@example.com` wildcard filter is a UPL blind spot; reaper credential exposure; fixture PII could leak into Stripe metadata; `psql $URL` echoes password; service-role broadens blast radius. |
| expert-brandur-leach | opus | 10 | 4 CRITICAL, 4 WARNING, 2 SUGGESTION | Factories must use `pg.query` not `supabase.from` (Leach #1 named bug); Stripe webhook writes through separate pool; `DELETE`-as-cleanup is exact Leach anti-pattern; CV probes never reconfigured to filter `test_run_id IS NULL` (marker path cosmetic without it); `SET LOCAL session_replication_role = replica` required to suppress triggers; unique-constraint collision under parallel runs. |

Plan restructured: T0 schema migration promoted in-scope; T1a reaper added; T4 rewritten to drop DELETE-as-cleanup; T7 hardened against comment/string bypass; T7a dry-run audit added; T8 extended to add probe-side `test_run_id.is.null` filter + counter-probe + replace wildcard with specific prefixes. SCs expanded 21 → 40.

### Round 0d: plan re-verify (single-reviewer CRITICAL-closure check)

| Reviewer | Model | Status |
|----------|-------|--------|
| expert-brandur-leach | opus | Queued. Will verify that the 4 Leach-tagged CRITICALs (LEACH-1 factory-pg-not-supabase, LEACH-2 createClient-forbidden, LEACH-3 Stripe-webhook-separate-pool, LEACH-6 DELETE-antipattern + probe-side-filter) are closed in the rewritten plan before Phase 5 execution begins. |
