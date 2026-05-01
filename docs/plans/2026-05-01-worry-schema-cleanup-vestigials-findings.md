# Findings: schema-cleanup-vestigials worry — Round 0 swarm

**Status:** RESOLVED 2026-04-30 — all findings absorbed across R0→R1→R2→R3 (R3=0). Migrations 20260501a/b shipped (entities_officers + pji_field_validation RLS). Per memory `worry-schema-cleanup-vestigials-resolved-2026-04-30.md`. Capstoned 2026-05-01.

Generated 2026-04-30. Three reviewers in parallel: code-reviewer (opus), security-auditor (opus), Albe-lens DB-hygiene (opus general-purpose). 24 total findings (3 CRITICAL, 7 WARNING, 7 SUGGESTION, 2 INFO, 5 dedup overlaps).

## Round 0 — Reviewers

| Reviewer | Findings | CRIT | WARN | SUGG | INFO |
|---|---|---|---|---|---|
| code-reviewer | 7 | 0 | 2 | 5 | 0 |
| security-auditor | 9 | 3 | 4 | 0 | 2 |
| Albe-lens DB-hygiene | 8 | 2 | 4 | 2 | 0 |

After dedup (CASCADE-blast-radius and TCP-keepalives raised by both Albe + security): **17 unique action items**.

## Findings (deduped, severity order)

### CRITICAL

- **C1 — RLS missing on `entities_officers`** (security-auditor, A01:2021)
  - File: `docs/plans/2026-04-17-canonical-entities-source-urls.md:77` + live table
  - No migration provenance; no `ENABLE ROW LEVEL SECURITY`; planned ingester will hold officer PII (WaPo + MPV + officer-intel)
  - Fix: ship `apps/web/supabase/migrations/20260501a_entities_officers_rls.sql` (ENABLE RLS + service-role-only POLICY) + add SC7

- **C2 — RLS missing on `pji_field_validation`** (security-auditor, A01:2021)
  - File: `apps/web/scripts/ops/pji-full-swarm-closure.mjs:125`
  - CREATE TABLE IF NOT EXISTS without RLS; will hold LLM-judge reliability + reasoning text (prompt-leak surface); anon-readable when populated
  - Fix: ship `apps/web/supabase/migrations/20260501b_pji_field_validation_rls.sql` OR append RLS+policy to bootstrap script

- **C3 — Phase 2 template uses CASCADE** (security-auditor + Albe-lens, A01:2021)
  - File: `docs/plans/2026-05-01-worry-schema-cleanup-vestigials.md:96-105`
  - Audit JSON proves CASCADE on case_law would silently drop 2 RLS policies + 1 trigger + 4 child-table FKs; verified_case_law would drop 5 RLS policies + 1 trigger
  - Fix: replace `DROP TABLE ... CASCADE` with `DROP TABLE ... RESTRICT` + pg_depend pre-flight check + cite blast-radius counts

### WARNING

- **W1 — pg_stat_reset blind spot** (Albe-lens)
  - File: `apps/web/scripts/ops/phase0-schema-cleanup-verify.mjs:58`
  - `n_tup_ins=0` + `sec_since_maint=null` could mean stats reset, not no-writes-ever; INTENTIONALLY-UNUSED verdict rests on possibly-truncated history
  - Fix: add `stats_reset_concern` field to audit JSON when `sec_since_maint IS NULL`; downgrade verdict semantics to "UNCERTAIN until corroborated"

- **W2 — CREATE-without-INSERT for `pji_field_validation`** (Albe-lens)
  - File: `apps/web/scripts/ops/pji-full-swarm-closure.mjs:125`
  - Marker claims "T48 sink" but no INSERT path proven; could be ghost wire
  - Fix: grep the script for INSERT/UPDATE INTO `pji_field_validation`; if none, downgrade verdict + flag T48 owner

- **W4 — ON-CONFLICT risk on skeleton tables** (Albe-lens)
  - File: marker entries for `pji_field_validation` + `entities_officers`
  - 4 pg_constraint dependents on `pji_field_validation`, but marker doesn't enumerate unique-constraint names; future writer will hit cl-bulk-data-defensive gotchas #10/#11
  - Fix: extend marker entries with explicit `Unique constraints:` field listing constraint names + condefs

- **W5 — Marker has no pre-population gate** (security-auditor, A04:2021)
  - File: `apps/web/docs/intentionally-unused-tables.md`
  - Cadence-only gate fires on calendar; doesn't block "first INSERT" moment for PII-bearing tables
  - Fix: add `Pre-population gate:` field to marker schema (enforced by SC2)

- **W6 — TCP keepalives missing in phase0 script** (Albe-lens + security-auditor + code-reviewer, A05:2021)
  - File: `apps/web/scripts/ops/phase0-schema-cleanup-verify.mjs:23-27`
  - Sets lock_timeout + statement_timeout but missing `idle_in_transaction_session_timeout` + `tcp_keepalives_*` per `cl-bulk-data-defensive.md` gotcha #17
  - Fix: add the 5 SETs

- **W7 — TLS rejectUnauthorized: false** (security-auditor, A02:2021)
  - File: `apps/web/scripts/ops/phase0-schema-cleanup-verify.mjs:23`
  - MITM vulnerability; Supabase pooler uses public CA, full validation achievable
  - Fix: change to `rejectUnauthorized: true`

- **W8 — Marker doesn't record RLS state** (security-auditor, A01:2021)
  - File: `apps/web/docs/intentionally-unused-tables.md`
  - Future session reading marker can't see RLS-disabled status
  - Fix: add `RLS state (as of <date>):` field to marker schema; resolved by C1+C2 fixes (state will become "enabled+policies")

- **W9 — SC4 coverage missing -web sibling DDL site** (code-reviewer)
  - File: `apps/web/data/audit/sc4-grep-coverage.json:31`
  - Note mentions only one of two `pji-full-swarm-closure.mjs` files (apps/web AND ImNotAnAttorney-web)
  - Fix: extend note to cover both sibling trees post-cutover

### SUGGESTION

- **S1 — 90-day cadence for active-backlog markers** (Albe-lens)
  - File: `apps/web/docs/intentionally-unused-tables.md` + plan SC6
  - 180 days too lax for shared multi-tenant schema; r2 lands in less than 2 weeks
  - Fix: tighten SC6 to "≤90 days for active-backlog entries, ≤180 for parked"; shorten dates accordingly

- **S2 — Promote phase0 script to reusable lib + cl-bulk-data-defensive #21** (Albe-lens) — **DEFERRED OUT-OF-SCOPE**
  - File: cross-repo (`~/.claude/rules/cl-bulk-data-defensive.md` + `apps/web/scripts/lib/`)
  - Producer-side fix to prevent the SAME class of false-positive (row-count-only orphan claim) firing on next worry
  - Triage: legitimate but touches global rules file; tracked as standalone task in `docs/plans/2026-05-01-worry-orphan-classification-recurrence.md` (next worry, not this one). Per Pristine-or-nothing exception clause.

- **S3 — judge_coi verdict ambiguity** (code-reviewer)
  - File: `apps/web/data/audit/schema-cleanup-vestigials-2026-05-01.json:760`
  - LIVE-MISIDENTIFIED rests on code refs but 0 rows + 0 writes; could equally be INTENTIONALLY-UNUSED
  - Fix: add git-log of build-judge-coi.mjs script age + last-run timestamp annotation

- **S4 — Re-eval boundary tight** (code-reviewer)
  - File: `apps/web/docs/intentionally-unused-tables.md`
  - 2026-10-27 is exact boundary; clock skew could fail SC6
  - Fix: reduce to 2026-10-26 (or aligned with S1's 90-day cadence)

- **S5 — SC4 regex strings rendered as descriptions** (code-reviewer)
  - File: `apps/web/data/audit/sc4-grep-coverage.json:4`
  - `regex_patterns` contains description strings, not actual regex; not reproducible
  - Fix: replace with literal regex strings used

- **S6 — Hard prereq branch-tip evidence missing** (code-reviewer)
  - File: plan line 122
  - "Run Phase 0 grep across r2's branch tip" — audit doesn't document which branch
  - Fix: add `branch_greped` field to audit JSON + verify against active r2 branch tip

- **S7 — case_law write stats look stale** (code-reviewer)
  - File: `apps/web/data/audit/schema-cleanup-vestigials-2026-05-01.json:11`
  - 3,407 rows but n_tup_ins=0 — misleading "never written" impression
  - Fix: add `pg_class.reltuples` divergence check + note that n_tup values are post-stat-reset (overlaps with W1 fix)

### INFO (no fix)

- **I1 — SQLi clean** (security-auditor): pji-full-swarm-closure.mjs CREATE TABLE is static SQL.
- **I2 — tenant_brand absent** (security-auditor): none of 6 tables participate in bench-recon multi-tenant boundary.

## Action Plan

Apply in order. Fixes overlap — many findings resolved by the same artifact change.

| Step | Resolves | Artifact |
|---|---|---|
| 1 | C1 | new migration `20260501a_entities_officers_rls.sql` |
| 2 | C2 | new migration `20260501b_pji_field_validation_rls.sql` |
| 3 | C3 | edit plan Phase 2 template (CASCADE → RESTRICT + pg_depend gate) |
| 4 | W1, W6, W7, S7 | edit `phase0-schema-cleanup-verify.mjs` (TCP keepalives, idle_in_tx, TLS validation, stats_reset note, reltuples divergence) |
| 5 | W4, W5, W8, S1, S4 | rewrite `intentionally-unused-tables.md` (RLS state, pre-pop gate, unique constraints, 90-day cadence, 2026-07-29 boundary) |
| 6 | W9, S5, S6 | edit `sc4-grep-coverage.json` (literal regex, sibling DDL note, branch_greped) |
| 7 | W2 | grep `pji-full-swarm-closure.mjs` for INSERT path; annotate audit JSON |
| 8 | S3 | annotate audit JSON with build-judge-coi git-log timestamp |
| 9 | C1, C2 — apply | run migrations via `apply-mig-20260501.mjs` harness |
| 10 | All | re-run phase0 verify; update audit JSON; verify SC1-SC6 PASS |
| 11 | Round 1 | TeamCreate r1, dispatch reviewers, expect 0 findings |
| out-of-scope | S2 | tracked as standalone worry; documented above |

## Tracker

`claude-issues-<sessionKey>.json` not used (worry-to-pristine session-local; per skill); this findings file IS the tracker.
