# Worry: schema-cleanup vestigials (T8 / T10 / T11)

Date: 2026-05-01
Predecessor: `docs/plans/2026-04-30-worry-data-orphans-tier-b-c.md` (T8/T10/T11 deferred per user directive 2026-04-30)
Triage: WORRY (separate R0 swarm; destructive-action approval required at Phase 5; do NOT batch with feature-add worries)

## Worry Statement

Five tables flagged across r0/r1 of the data-orphans worry chain as legacy / vestigial / un-wired. None of them are referenced by any product surface today, but presence in the live schema risks (a) future sessions re-discovering them and re-proposing wires, (b) ON-CONFLICT collisions during ingest, (c) RLS surface area on tables we don't intend to maintain. Goal: verify each is genuinely dead, then either DROP (with migration) or document as INTENTIONALLY-UNUSED (with marker file).

**Hard rule:** Per user-global rule "Never delete files/data without approval," every DROP migration in this worry requires explicit Rahim approval at Phase 5 with the row-count + last-write timestamp shown in chat.

## Scope (inherited tables)

| Task | Tables | r1 status |
|---|---|---|
| T8 | `case_law` (legacy) | OUT-OF-SCOPE per r1 user directive — covered here |
| T10 | `entities_officers`, `pji_field_validation` | OUT-OF-SCOPE per r1 user directive — covered here |
| T11 | `case_law_applicability`, `verified_case_law` | OUT-OF-SCOPE per r1 user directive — covered here |

Add'l candidates surfaced for Phase 0 to verify (NOT yet declared in-scope; Phase 0 confirms or rejects):
- `judge_conflict_of_interest` (r1 C1: phantom collapse target — migration in tree but never applied to live DB; either apply or remove migration)

## Phase 0 — Verification (pre-R0 gate)

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

DROP TABLE IF EXISTS public.<name> CASCADE;
```

Pre-flight: archive table via `pg_dump --schema=public --table=public.<name>` to gitignored archive path BEFORE migration commit. Even an empty table gets archived (preserves DDL).

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
