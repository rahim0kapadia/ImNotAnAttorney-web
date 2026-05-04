# Plan: T6 + bulk-master-extractor DB-first rewrite

Date: 2026-05-04
Source handoff: `docs/handoffs/2026-05-04-t5-db-first-shipped.md`
Predecessor PRs: #307 (T5 DB-first, MERGED), #306 (T6 delta gate, MERGED)

## Why

`csv-parse` with `relax_quotes:true, relax_column_count:true, escape:"\\"`
silently shifts trailing columns when CL legal opinion text contains
unquoted commas. Field-level corruption rate ~15.5% in T5 probe. T6 smoke
confirmed same bug: 8min processed 600K rows, script said "2,278
classified", `pg_stat_user_tables.n_tup_upd` stayed at 264. Pattern
engine fires real keyword hits but UPDATEs match 0 rows because
cluster_id field is corrupted with text fragments.

`scripts/bulk-master-extractor.mjs:1215, 1274` uses the **identical** parser
configuration. Recovering it as queued in handoff would write corrupted
data across 9 tables.

## Architectural Fix (same as T5 DB-first / #307)

Replace CSV streaming with direct SQL JOIN against `cl_opinion_bodies`:
- 1.5M rows already loaded with `cluster_id`, `author_id`, `plain_text`.
- DB-first T5: 1965ms / 44,037 linkages vs 4-6h projected stream.
- `cl_opinion_bodies` IS the parsed-and-loaded version of the bz2 source.
  Re-streaming it via csv-parse re-introduces the parser bug.

## Scope

### Phase 1 — T6 charge-extractor DB-first
Target: `scripts/bulk-extract-charge-types.mjs`

1. Replace CSV stream loop with chunked query against `cl_opinion_bodies`:
   ```sql
   SELECT cluster_id, plain_text
   FROM cl_opinion_bodies
   WHERE cluster_id BETWEEN $1 AND $2
   ORDER BY cluster_id
   ```
   chunked by 10K cluster_id range.
2. Apply existing keyword pattern engine to `plain_text`.
3. UPDATE `classified_opinions` via `cluster_id` JOIN.
4. Delta gate from PR #306 still applies (skip already-classified).

Expected runtime: ~5-15 min vs T6's broken ~hours.

### Phase 2 — bulk-master-extractor DB-first
Target: `scripts/bulk-master-extractor.mjs` (writes 9 tables)

Same pattern. Each of the 9 extractors needs to be reviewed:
- Quote extraction → already done as T5 (shipped #307).
- Charge classification → Phase 1 above.
- Other 7 extractors → audit each for csv-parse usage; rewrite as
  cl_opinion_bodies query.

### Phase 3 — Verify + retire
Once bulk-master rewrite ships:
1. Run end-to-end on a 1000-row sample.
2. Compare row counts to T5/T6 baselines.
3. Schedule full run.
4. Retire CSV-stream paths from codebase to prevent regression.

## Out-of-scope

- Fixing csv-parse upstream — bug is config-dependent, not pure parser bug.
  Documented in `~/.claude/projects/.../memory/lesson-cl-csv-parse-corruption-2026-05-04.md`.
- ROA bridge for additional T5 linkage — separate canonicalization pass
  required (8,377 orphan UUIDs need name+court matching to judge_profiles).
  Logged as separate worry: ~/.claude/projects/.../memory/project-roa-canonicalization-needed-2026-05-04.md.

## Validation

After Phase 1 ships:
- `pg_stat_user_tables.n_tup_upd` on `classified_opinions` is the ground
  truth — script-reported counters are unreliable when csv-parse
  corruption hits.
- Sanity check: pull a sample of 100 classified rows, verify cluster_id
  parses as bigint and matches `cl_opinion_bodies.cluster_id`.

## Pre-flight check (every new bulk script)

Per `cl-bulk-data-defensive.md` rule #1 update (2026-05-04):
> Before writing any new CSV-stream loader, check if the data is already
> loaded into a Supabase table. cl_opinion_bodies (1.5M / cluster_id +
> author_id + plain_text) covers most legal-text use cases.
