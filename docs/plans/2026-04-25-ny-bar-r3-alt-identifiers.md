# Plan — NY Bar Discipline Round 3: Alt-Identifier Recovery

## Context
Round 2 (commit 5371442a, merged to master 2026-04-24) shipped HTML-strip
fallback for `cl_opinion_bodies` and brought NY discipline events from 99 →
711 events / 670 attorneys. Of the ~4,031 NY AppDiv "Matter of X" candidate
clusters, 711 yielded events. The remaining ~1,709 bodies that ARE genuine
discipline opinions but lack the standard `OCA Atty. Reg. No. <8-digit>` /
`Attorney Registration No. <8-digit>` pattern are unmined.

This plan extends `scripts/ingest/process-nybar-discipline.mjs` with an
alternate-identifier regex set built from sampling the unmatched bodies.

## Files

### Files to modify
- `scripts/ingest/process-nybar-discipline.mjs` — extend `parseOpinion()` with
  a structured `BAR_NUMBER_PATTERNS` array + secondary fallback paths. Keep
  existing OCA pattern as the first entry. Add idempotency-safe behavior.

### Files to create
- `scripts/ingest/lib/_investigate-ny-r3.mjs` — investigation-only helper.
  Queries `cl_opinion_bodies` for "Matter of" bodies that the existing
  extractor SKIPPED, runs candidate regex set against them, dumps a 40-row
  sample for manual analysis.
- `docs/handoff/2026-04-24-ny-bar-r3-alt-identifiers.md` — pattern table +
  before/after counts + residual category for bodies still unmatched after r3.

### Files NOT touched
- All other `scripts/ingest/scrape-*.mjs` (other jurisdictions).
- `scripts/lib/pg-bulk-defaults.mjs`.
- Any cron / Edge Function code.
- `package.json`, migrations, schema.

## Tasks

1. **Investigate** (read-only): Run `_investigate-ny-r3.mjs` against the DB
   to (a) count the unmatched universe, (b) count occurrences of candidate
   alt-patterns across that universe, (c) dump 40-body sample to
   `.tmp-ny-r3-unmatched-samples.txt` for visual review.

2. **Pattern selection**: Decide which alt-identifiers can be safely
   promoted to `bar_number` extractors. Reject ambiguous patterns that
   would invent or transpose numbers.

3. **Extend extractor**: Refactor the bar-number extraction in
   `process-nybar-discipline.mjs` to iterate a `BAR_NUMBER_PATTERNS` array
   of `{ name, regex, classify }`. Keep ON CONFLICT DO NOTHING idempotency
   (already in place). No changes to staging, COPY, or upsert logic.

4. **Re-run extractor** in dry-run mode against the full NY universe.
   Compare records-parsed count vs. r2 baseline.

5. **Apply** with `--apply --start-date 2014-01-01`. Verify event count.

6. **Verification queries** per task spec (count, source_url coverage,
   discipline_type breakdown).

7. **Spot-check** 3 newly-added bar numbers against
   https://iapps.courts.state.ny.us/attorneyservices/search.

8. **Handoff**: Document pattern table, residual unmatched categories,
   before/after counts. Commit on `feat/ny-bar-r3-alt-identifiers` only.

## Hard constraints (from task spec)
- DO NOT push or open a PR.
- DO NOT modify other jurisdictions.
- DO NOT touch files outside `scripts/ingest/`, `scripts/lib/` (add-only),
  `docs/plans/`, `docs/handoff/`, `.tmp*`.
- DO NOT email third parties.
- DO NOT background via nohup &.
- DO NOT scrape any external site (DB-only enrichment).
- DO NOT fabricate bar numbers — skip when no clean number is extractable.

## Exit criteria
- NY events > 800 (currently 711).
- 100% `source_url` coverage on new rows.
- 3/3 spot-checked bar numbers valid in NY OCA registry.
- Pattern table + residual category documented in handoff.
