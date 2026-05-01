# Worry: schema-cleanup vestigials (T8 / T10 / T11)

Date: 2026-05-01
Predecessor: `docs/plans/2026-04-30-worry-data-orphans-tier-b-c.md` (T8/T10/T11 deferred per user directive 2026-04-30)
Triage: WORRY (separate R0 swarm; destructive-action approval required at Phase 5; do NOT batch with feature-add worries)

## Worry Statement

Five tables flagged across r0/r1 of the data-orphans worry chain as legacy / vestigial / un-wired. None of them are referenced by any product surface today, but presence in the live schema risks (a) future sessions re-discovering them and re-proposing wires, (b) ON-CONFLICT collisions during ingest, (c) RLS surface area on tables we don't intend to maintain. Goal: verify each is genuinely dead, then either DROP (with migration) or document as INTENTIONALLY-UNUSED (with marker file).

**Hard rule:** Per user-global rule "Never delete files/data without approval," every DROP migration in this worry requires explicit Rahim approval at Phase 5 with the row-count + last-write timestamp shown in chat.

## Expert Lens

Triangulated 2026-04-30 from cached profiles. No single .01% on "vestigial-table cleanup" alone — synthesized from two adjacent Postgres-ops experts:

- **Laurenz Albe** (`~/.claude/experts/laurenz-albe.md`, Cybertec senior consultant + Postgres core committer, active April 2026) — DROP/CASCADE semantics, lock acquisition on DROP, concurrent-backend safety. Frameworks applied here:
  - DROP TABLE acquires `AccessExclusiveLock` — blocks all reads/writes; cannot run concurrently with active queries on dependents. Phase 0 must include `SELECT pid FROM pg_stat_activity WHERE query ILIKE '%<table>%' AND state != 'idle'` before issuing DROP.
  - `CASCADE` silently drops dependent objects (FKs, views, triggers, functions referencing the table). If Phase 0 reports 0 inbound FKs but the verify query missed views/functions, CASCADE will still nuke them. Pre-DROP verify: `SELECT * FROM pg_depend WHERE refobjid = '<table>'::regclass`.
  - Backend long-running queries holding locks on the table (zombie INSERTs, IO-bound SELECTs) will block the DROP indefinitely under default `lock_timeout=0`. Set `lock_timeout = '5s'` per migration session so a stuck DROP fails loudly instead of holding AccessExclusiveLock against the world.

- **Brandur Leach** (`~/.claude/experts/brandur-leach.md`, Crunchy Bridge production-grade testing, native cascade-profile) — schema-drift discipline, archive-first, fix-producer-not-symptom. Frameworks applied here:
  - "Don't scrub as cleanup" — archive-via-pg_dump-first ISN'T scrub; it's evidence preservation for the rollback story. The drop migration's rollback path is restoring from the archive; without the archive there's no rollback.
  - Marker-file pattern (`docs/intentionally-unused-tables.md`) IS the producer-side fix: future sessions grep the marker and stop re-proposing wires. Without it, every quarter someone re-discovers the vestigial and the worry re-fires. The marker is the real deliverable for KEEP-AS-VESTIGIAL verdicts.
  - Schema in code defaults to "fixtures defined in factory functions, not raw INSERTs" — directly applies to verifying NO test-script writes target these tables. Phase 0's grep coverage MUST include `scripts/test-*.{ts,mjs,js}` because Leach-pattern fixtures route through factories that obscure the underlying table name.

Combined directive for Phase 4 reviewer brief: every DROP candidate must carry (a) Albe's lock-safety pre-flight (`pg_stat_activity` + `pg_depend` + `lock_timeout`), (b) Leach's archive + marker artifacts, and (c) the standard Phase 0 evidence (rowcount + FK + 3-repo grep + last-write).

## Scope (inherited tables)

| Task | Tables | r1 status |
|---|---|---|
| T8 | `case_law` (legacy) | OUT-OF-SCOPE per r1 user directive — covered here |
| T10 | `entities_officers`, `pji_field_validation` | OUT-OF-SCOPE per r1 user directive — covered here |
| T11 | `case_law_applicability`, `verified_case_law` | OUT-OF-SCOPE per r1 user directive — covered here |

Add'l candidates surfaced for Phase 0 to verify (NOT yet declared in-scope; Phase 0 confirms or rejects):
- `judge_conflict_of_interest` (r1 C1: phantom collapse target — migration in tree but never applied to live DB; either apply or remove migration)

## Phase 0 — RESULTS (executed 2026-04-30)

**Output:** `apps/web/data/audit/schema-cleanup-vestigials-2026-05-01.json`. Verification script: `apps/web/scripts/ops/phase0-schema-cleanup-verify.mjs` (Albe lens — `pg_depend` + `pg_stat_activity` + `lock_timeout = '5s'`).

| Table | Rows | Inbound FK | Code refs (3 repos) | Verdict |
|---|---|---|---|---|
| `case_law` | 3,407 | 4 (`case_law_urls`, `case_law_applicability`, `case_law_verification_log`, `case_law_witnesses`) | 10+ engine workers (case-law-validation, case-law-enrichment, citation-verify, legal-research, motion-generation, motion-recommendation, qa-loop-coordinator, report); -web `promote-to-engine-tier.mjs:325` INSERT INTO | **LIVE-MISIDENTIFIED** |
| `entities_officers` | 0 | 0 | docs only — `DATA-INVENTORY.md:77` "SKELETON (ingester pending)"; canonical reorg plan target | **INTENTIONALLY-UNUSED** |
| `pji_field_validation` | 0 | 0 | `apps/web/scripts/ops/pji-full-swarm-closure.mjs:125` `CREATE TABLE IF NOT EXISTS`; T48 Shankar framework target | **INTENTIONALLY-UNUSED** |
| `case_law_applicability` | 0 | 0 | `apps/engine/src/workers/case-law-enrichment.mjs:543` `INSERT INTO`; FK to live `case_law` | **LIVE-MISIDENTIFIED** |
| `verified_case_law` | 0 | 1 (`case_law_references`) | `citation-verify.mjs` (5 refs: lines 133/224/231/341/353) INSERT/UPDATE/SELECT; `case-law-enrichment.mjs:204` SELECT; `hard-gate-backfill.mjs:173` SELECT | **LIVE-MISIDENTIFIED** |
| `judge_conflict_of_interest` | 0 | 0 | Just applied 2026-04-30 via Wave 0 W0-2 corrective COMMENT migration (`20260421a` + `20260430z`); 3+ -web ingest scripts (`build-judge-coi.mjs` / v3 / v4) INSERT/UPDATE/DELETE | **LIVE-MISIDENTIFIED** |

**Net:** 0 DROP candidates. 2 INTENTIONALLY-UNUSED. 4 LIVE-MISIDENTIFIED.

**Implication for plan scope:**
- Phase 2 (DROP migration authoring) — **MOOT**. Skip.
- Phase 3 (marker file for KEEP-AS-VESTIGIAL) — narrowed to 2 entries (`entities_officers` + `pji_field_validation`); written to `apps/web/docs/intentionally-unused-tables.md` as part of Phase 0.
- Phase 4 (Rahim destructive-action approval) — **MOOT** (zero DROPs).
- Phase 5 (apply migrations) — **MOOT**.
- Phase 6 (phantom-collapse cleanup for `judge_conflict_of_interest`) — **MOOT**. Wave 0 W0-2 already applied predecessor migration `20260421a` and corrected the COMMENT via `20260430z`. Table is LIVE-WIRED with 3 active ingest scripts. Per `pattern-verify-collapse-target-phase0.md` (cached pattern memory) the prior r1 verdict ("migration in tree but never applied") was correct AT THAT TIME but Wave 0 superseded it.
- 4 LIVE-MISIDENTIFIED tables — REMOVED from this worry per plan's own gate (Phase 0 line 39: "LIVE-MISIDENTIFIED → REMOVE from this worry's scope; spawn separate worry per table"). NOT spawning new worries because the 4 tables are operating correctly — there's no worry to fire.

**Surviving deliverable:** the marker file `apps/web/docs/intentionally-unused-tables.md` (2 entries, 180-day re-evaluation cadence per Leach hygiene framework).

## Phase 0 — Verification protocol (executed; for audit reference)

For each of the 5 in-scope tables + 1 candidate:

1. **Existence + row count.** `SELECT relname, reltuples::bigint FROM pg_class WHERE relname = $1 AND relkind = 'r'`.
2. **Last write.** `SELECT n_tup_ins, n_tup_upd, n_tup_del, last_vacuum, last_analyze FROM pg_stat_user_tables WHERE relname = $1`.
3. **FK references inbound.** `SELECT conrelid::regclass, conname FROM pg_constraint WHERE confrelid = $1::regclass AND contype = 'f'`.
4. **Code references** in monorepo + -web + engine: grep for table name as `.from('<name>')`, `from <name>`, `JOIN <name>`, `INSERT INTO <name>`, `UPDATE <name>`, raw `<name>` in SQL files. NOT just one repo — all three.
5. **Migration history.** Latest migration that touched the table.

Output: `apps/web/data/audit/schema-cleanup-vestigials-2026-05-01.json` with one block per table.

**Phase 0 gate verdicts:**
- TRUE-DEAD (0 rows + 0 inbound FKs + 0 code refs across all 3 repos + last write >90 days) → DROP candidate.
- INTENTIONALLY-UNUSED (rows present OR FK targets OR planned future wire) → marker file `docs/intentionally-unused-tables.md` entry; no DROP.
- LIVE-MISIDENTIFIED (code refs found OR recent writes) → REMOVE from this worry's scope; spawn separate worry per table.

## Phase 1 — R0 Swarm

Three reviewers, all `model: opus`:

- **code-reviewer** — verify Phase 0 grep coverage (regex patterns, false-negative risk, fixture scan); check migration shape for DROP idempotency.
- **security-auditor** — RLS surface impact; PII implications of DROP-vs-keep (e.g. `entities_officers` may contain PII even if unused); DROP rollback story.
- **Reality Checker** — challenge "TRUE-DEAD" verdicts; require evidence beyond row count (e.g. is the table receiving inserts via Edge Function bypass not visible to grep?).

R0 verdict per table: `DROP` / `KEEP-AS-VESTIGIAL` / `RE-SCOPE-AS-LIVE`.

## Phase 2 — DROP Migration Authoring (only for tables R0 cleared as DROP)

Per-table DROP migration shape (one migration file per table, NOT batched — atomic rollback per table):

```sql
-- supabase/migrations/<timestamp>_drop_<table>.sql
-- Reason: schema-cleanup-vestigials worry, R0 verdict DROP. Phase 0 evidence:
--   row_count=0, last_write=<date>, fk_refs=0, code_refs=0/3 repos.
-- Approver: <Rahim approval timestamp from chat>.
-- Rollback: pre-DROP `pg_dump --table=public.<name> --data-only` archived
-- to apps/web/data/audit/dropped-tables-archive/ (gitignored, 90-day TTL).
-- CASCADE prohibition: per R0 swarm (security-auditor C3 + Albe-lens) the audit
-- JSON proves CASCADE on case_law/verified_case_law would silently drop multiple
-- RLS policies + triggers + 4 child-table FKs. Use RESTRICT so any unaccounted-
-- for dependent fails the migration LOUDLY rather than silently obliterating
-- security policies.

-- Pre-flight (Albe lens):
DO $$
DECLARE
  policy_n int;
  trigger_n int;
  view_n int;
BEGIN
  SELECT COUNT(*) INTO policy_n FROM pg_depend
   WHERE refobjid = 'public.<name>'::regclass AND classid = 'pg_policy'::regclass;
  SELECT COUNT(*) INTO trigger_n FROM pg_depend
   WHERE refobjid = 'public.<name>'::regclass AND classid = 'pg_trigger'::regclass;
  SELECT COUNT(*) INTO view_n FROM pg_depend d
   JOIN pg_rewrite r ON r.oid = d.objid
   WHERE d.refobjid = 'public.<name>'::regclass;
  IF policy_n > 0 OR trigger_n > 0 OR view_n > 0 THEN
    RAISE EXCEPTION 'CASCADE-blast-radius pre-flight: % policies, % triggers, % view-deps — manual review required before DROP', policy_n, trigger_n, view_n;
  END IF;
END $$;

DROP TABLE IF EXISTS public.<name> RESTRICT;
```

Pre-flight: archive table via `pg_dump --schema=public --table=public.<name>` to gitignored archive path BEFORE migration commit. Even an empty table gets archived (preserves DDL). The DO-block above MUST run before the DROP — if any policy/trigger/view dependent exists, the DROP is aborted and re-scoped.

## Phase 3 — Marker File for KEEP-AS-VESTIGIAL

Create or extend `docs/intentionally-unused-tables.md` with one entry per table:
- Table name
- Why it's not DROP'd (e.g. PII compliance hold, planned r2 wire, ingest-pipeline target)
- Owner (which worry / project)
- Re-evaluation date (≤180 days)

Goal: future sessions grep the marker file and stop proposing wires.

## Phase 4 — Submit DROP Approvals to Rahim (BLOCKING gate)

Per Atlas global rule "destructive-action approval falls on Rahim":
- For each DROP candidate, surface in chat: table name, row count, last write date, FK references, code references — and ask explicitly "approve DROP?"
- Do NOT batch the approval question across multiple tables — one at a time, each with full evidence.
- Log approvals in `docs/plans/2026-05-01-worry-schema-cleanup-vestigials-approvals.md` with timestamps.

## Phase 5 — Apply migrations + verify

- Each DROP migration applied via the standard apply path (CI workflow OR ad-hoc apply if billing-blocked).
- Post-apply verify: table absent from `information_schema.tables`; FK constraints preserved on dependents (CASCADE shouldn't have removed any if Phase 0 said 0 inbound FKs).
- Update `apps/web/supabase/SCHEMA.md` to reflect drops.

## Phase 6 — Phantom-collapse-migration cleanup (`judge_conflict_of_interest`)

Separate sub-task. Phase 0 already established (in r1) that `20260421a_judge_conflict_of_interest.sql` is in tree but never applied. Two options:
- **Option A (preferred):** Delete the unapplied migration file. The collapse it proposed is no longer the architecture (`judge_investments` + `judge_civil_party_conflicts` are LIVE separate tables per r1 verdict).
- **Option B:** Apply it. Requires data migration (collapse 414K + 2.5K rows into one table) AND r2 worry retargeting to the new schema. NOT recommended.

R0 swarm to ratify Option A unless major signal otherwise.

## Success Criteria

Each criterion is binary PASS/FAIL by an independent reader inspecting named artifacts. No qualitative terms.

- **SC1 — Phase 0 audit JSON exists.** PASS iff file `apps/web/data/audit/schema-cleanup-vestigials-2026-05-01.json` exists, contains `phase0_verdicts` object with exactly 6 keys (`case_law`, `entities_officers`, `pji_field_validation`, `case_law_applicability`, `verified_case_law`, `judge_conflict_of_interest`), and each value has a `verdict` field equal to one of `LIVE-MISIDENTIFIED`, `INTENTIONALLY-UNUSED`, `TRUE-DEAD`. FAIL otherwise.
- **SC2 — Marker file exists with required entries.** PASS iff file `apps/web/docs/intentionally-unused-tables.md` exists, contains a heading `## entities_officers` AND a heading `## pji_field_validation`, and each entry has `Status:`, `Why retained:`, `Owner:`, `Source plan:`, `Re-evaluation date:` fields. FAIL otherwise.
- **SC3 — Zero DROP migrations shipped.** PASS iff running `git log --since=2026-04-30 --oneline -- apps/web/supabase/migrations/ -- supabase/migrations/` in monorepo root returns zero lines containing the word `drop` (case-insensitive) in either the commit subject or the touched file path. FAIL if any such line exists.
- **SC4 — Phase 0 grep coverage independently re-verified.** PASS iff file `apps/web/data/audit/sc4-grep-coverage.json` exists, contains a `searched_tables` array with entries for `entities_officers` and `pji_field_validation`, each with a `hits_in_code_files` integer field equal to 0, where `code_files` is defined as files matching `**/*.{mjs,ts,tsx,js}` excluding `**/docs/**`, `**/handoffs/**`, `**/data/audit/**`. FAIL if file absent or any `hits_in_code_files` > 0.
- **SC5 — pg_depend dependents accounted for.** PASS iff file `apps/web/data/audit/schema-cleanup-vestigials-2026-05-01.json` contains a `tables` object with keys `case_law`, `case_law_applicability`, `verified_case_law`, `judge_conflict_of_interest`, and each value has a `dependents` array with at least one element having `dep_class` equal to `pg_class` and at least one element having `dep_class` equal to `pg_constraint`. FAIL if file absent, any key missing, or either `dep_class` type absent for any named table.
- **SC6 — Marker re-evaluation cadence enforceable.** PASS iff every entry in `apps/web/docs/intentionally-unused-tables.md` has a `Re-evaluation date:` value parseable as ISO date AND ≤90 days from `2026-04-30` (≤2026-07-29) for active-backlog entries (Source plan referenced in BACKLOG.md or in flight per docs/plans/), or ≤180 days for parked entries. FAIL otherwise.

- **SC7 — Skeleton tables have explicit service-role-only POLICY.** PASS iff `apps/web/data/audit/schema-cleanup-vestigials-2026-05-01.json` shows `tables.entities_officers.rls_policy_count >= 1` AND `tables.pji_field_validation.rls_policy_count >= 1` AND `tables.judge_conflict_of_interest.rls_policy_count >= 1` AND each table's `rls_enabled` is `true`. FAIL otherwise. Resolved by migration `20260501a_skeleton_table_explicit_policies.sql`.

- **SC8 — Marker file enumerates ON-CONFLICT-relevant unique constraints.** PASS iff `apps/web/docs/intentionally-unused-tables.md` for each entry contains a `Unique constraints:` field listing at least one constraint name + condef matching `pg_constraint.conname` for that table. FAIL if field absent or constraint name doesn't match audit JSON.

- **SC9 — Phase 2 template uses RESTRICT not CASCADE.** PASS iff `docs/plans/2026-05-01-worry-schema-cleanup-vestigials.md` contains zero occurrences of the literal string `DROP TABLE IF EXISTS public.<name> CASCADE;` AND contains exactly one occurrence of `DROP TABLE IF EXISTS public.<name> RESTRICT;` AND contains a `RAISE EXCEPTION 'CASCADE-blast-radius pre-flight'` block. FAIL otherwise.

## Out of Scope

- Any tables with rows OR FK refs OR code refs (must spawn dedicated worry).
- Engine-side schema (separate engine repo worry).
- RLS policy cleanup on tables we're keeping (separate `worry-rls-tightening`).
- Schema documentation refresh beyond drops (separate `worry-schema-md-refresh`).

## Cascade

| Node | Specific win |
|---|---|
| Us (INAA) | Smaller schema → faster `pg_dump` / faster migrations / fewer "what is this table?" sessions. |
| Direct counterparty | None visible (tables not in any product surface). |
| Their downstream | None visible. |
| Future-us | Future sessions stop re-discovering vestigials and re-proposing wires (proven failure mode in r0/r1). |
| Ecosystem | Marker-file pattern (`intentionally-unused-tables.md`) becomes precedent for shared-DB hygiene. |

Lossless. Cascade-positive even though no direct counterparty wins — internal hygiene IS a cascade win because future-us is a real node and re-discovery tax is a real cost.

## Tracking

Spawn via `/worry-to-pristine` with `worry-schema-cleanup-vestigials` as primary. Worktree: branch `feat/schema-cleanup-vestigials` off `origin/master` in monorepo (`apps/web` deploy-active). Each DROP ships as its own PR (one table per PR for atomic rollback).

**Hard prerequisite:** r2 of data-orphans-tier-bc must complete first OR confirm none of the 5 in-scope tables get re-promoted to LIVE-WIRED status. Run Phase 0 grep across r2's branch tip, not just master, to catch in-flight wires.
