# Plan: Backfill entities_officers Provenance (Task 33)

## Goal
UPDATE 506K existing rows in `entities_officers` to fill `provenance_source`,
`provenance_record_id`, `provenance_extracted_at` columns (currently NULL) by
JOINing back to source tables.

## Files to create
1. `scripts/backfill-entities-officers-provenance.mjs` — main backfill script
2. `scripts/__tests__/backfill-entities-officers-provenance.test.mjs` — smoke test

## Files to modify
None.

## Tasks
1. Write `scripts/backfill-entities-officers-provenance.mjs` with:
   - Required header markers (verbatim per spec)
   - ESM imports, db.mjs connection
   - Session safety defaults (statement_timeout, work_mem, keepalives)
   - 3 source handlers: cpd / nypd / oei
   - `--dry-run` mode: SELECT match counts per source, report remaining NULLs
   - `--apply` mode: run UPDATEs, report rowcounts + remaining NULLs
   - `--limit N` and `--source <name>` flags
2. Write minimal smoke test
3. Run `--dry-run` to verify output
4. Commit
