# Deprecate 11 Broken csv-parse Scripts (Phase 1+0 followup)

Date: 2026-05-04
Predecessor: PR #309 (T6 DB-first), #312 (Phase 1 DB-first), #313 (Phase 0 DB-first)

## Problem

11 `bulk-*` scripts in `scripts/` use the same broken csv-parse pattern
(`relax_quotes:true, escape:'\\'` over the 50 GB opinions bz2) that
silently shifts trailing columns when legal text contains unquoted
commas. Same corruption surface that broke T5, T6 smoke, and Phase 1
of bulk-master-extractor. Now that DB-first replacements have shipped,
these scripts must be marked DEPRECATED so future operators don't
re-run them and write corrupted data.

## Scripts to deprecate (replacement in parens)

**Superseded by `bulk-master-extractor.mjs`:**
1. `bulk-judge-quote-extractor.mjs` → `--tables judge_quotes`
2. `bulk-officer-reliability-aggregator.mjs` → `--tables officer_reliability`
3. `bulk-plea-discount-modeler.mjs` → `--tables plea_discount_curves`
4. `bulk-sentencing-outlier-detector.mjs` → `--tables sentencing_distributions`
5. `bulk-judge-prosecutor-pairing.mjs` → `--tables judge_prosecutor_pairings`
6. `bulk-co-defendant-divergence-analyzer.mjs` → `--tables co_defendant_analysis`
7. `bulk-bench-jury-divergence.mjs` → `--tables bench_jury_divergence`
8. `bulk-appeal-outcome-correlator.mjs` → `--tables appellate_trends`

**Superseded by `bulk-extract-charge-types.mjs` (T6, #309):**
9. `bulk-classify-from-csv.mjs`
10. `bulk-classify-from-opinions.mjs`
11. `bulk-classify-full-corpus.mjs`

## Still-active (not deprecated, separate followup)

- `bulk-extract-motion-legal-issues.mjs` — extracts motion_types,
  legal_issues, supporting_rulings (different fields than bulk-master's
  8 tables). DB-first rewrite needed; tracked as separate followup.
- `bulk-good-law-from-graph.mjs` — good-law verification via citation
  graph + plain_text scan (different output table `is_good_law`).
  DB-first rewrite needed; tracked as separate followup.
- `bulk-good-law-by-cluster.mjs` — API-loop, no csv-parse, separate concern.
- `enrich-from-bulk.mjs` — different schema, low risk.
- 12 `ingest-*.mjs` for non-CL data (NHTSA, FBI, USPS NPI, openpolicing,
  fars, dpic, nibrs, fatal-encounters, justfair, npi). Different sources;
  document-on-demand basis.

## What this PR does

1. Add a DEPRECATED header banner to each of the 11 scripts with:
   - Source incident reference (csv-parse corruption 2026-05-04)
   - Replacement command-line example
   - Predecessor PR list (#309, #312, #313)
2. Insert an `if (require.main === module)` guard at top that prints
   the deprecation notice + exits 1 unless `--allow-deprecated` flag
   is passed (so reckless `node scripts/bulk-*.mjs --apply` calls
   produce a clear error instead of corrupted writes).
3. Add comment in `pipeline-runner.mjs` Stage 2a-2d block noting the
   bulk-appeal-outcome-correlator stages are now redundant with Stage 1
   `--tables appellate_trends`. Defer removing the stages until a
   measurement run confirms bulk-master-extractor's Phase 0 query path
   is fast enough for cron schedule.

## Files to modify

- `scripts/bulk-judge-quote-extractor.mjs`
- `scripts/bulk-officer-reliability-aggregator.mjs`
- `scripts/bulk-plea-discount-modeler.mjs`
- `scripts/bulk-sentencing-outlier-detector.mjs`
- `scripts/bulk-judge-prosecutor-pairing.mjs`
- `scripts/bulk-co-defendant-divergence-analyzer.mjs`
- `scripts/bulk-bench-jury-divergence.mjs`
- `scripts/bulk-appeal-outcome-correlator.mjs`
- `scripts/bulk-classify-from-csv.mjs`
- `scripts/bulk-classify-from-opinions.mjs`
- `scripts/bulk-classify-full-corpus.mjs`
- `scripts/pipeline-runner.mjs` (comment only)

## Files to create

This file (the plan).

## Bundled in (Task #10): retire opinions-criminal.csv producer + smoke

The `opinions-criminal.csv` artifact's last consumers are:
- `scripts/bulk-classify-full-corpus.mjs` — deprecated above
- `scripts/smoke-link-quotes-csv.mjs` — smoke for the broken parser; deprecated this PR
- `scripts/filter-criminal-opinions.py` — the producer; deprecated this PR

Both producer and smoke now exit-1 with the same banner unless `--allow-deprecated`.
The disk artifact at `data/bulk-verify/cl-bulk/opinions-criminal.csv` is data, not code;
it stays on disk until operator deletes it (low risk: any future read-attempt hits
a deprecated consumer that exits 1).

## Out of scope

- `bulk-extract-motion-legal-issues.mjs` DB-first migration (separate plan)
- `bulk-good-law-from-graph.mjs` DB-first migration (separate plan)
- Manual deletion of disk artifact `data/bulk-verify/cl-bulk/opinions-criminal.csv`

## Verification

- `node scripts/bulk-judge-quote-extractor.mjs --apply` → exit 1 with
  deprecation banner
- `node scripts/bulk-judge-quote-extractor.mjs --apply --allow-deprecated`
  → runs original code path (preserves emergency-rollback option)
- `node scripts/pipeline-runner.mjs --dry-run` → still lists all stages
  (pipeline behavior unchanged)
