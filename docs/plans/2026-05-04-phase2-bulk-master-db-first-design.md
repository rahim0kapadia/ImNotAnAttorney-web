# Phase 2 Design: bulk-master-extractor.mjs DB-first rewrite

Date: 2026-05-04
Predecessor: `docs/plans/2026-05-04-t6-and-bulk-master-db-first-rewrite.md`
Phase 1 PR (T6): #309 (MERGED)

## Problem

`scripts/bulk-master-extractor.mjs` runs ONE 50 GB CSV stream pass (Phase 1)
that feeds 8 in-stream extractors:

1. `extractJudgeQuotes` (judge_quotes)
2. `extractSentencing` (sentencing_distributions)
3. `extractOfficerReliability` (officer_reliability)
4. `extractJudgeProsecutorPairing` (judge_prosecutor_pairings)
5. `extractBenchJuryDivergence` (bench_jury_divergence)
6. `extractCoDefendantDivergence` (co_defendant_analysis)
7. `extractPleaDiscount` (plea_discount_curves)
8. `extractAppealClassification` (appellate_trends)

The Phase 1 stream uses `csv-parse` with `relax_quotes:true,
relax_column_count:true, escape:'\\\\'` (lines 1273-1275). Same bug
class that broke T5 (#307) and T6 smoke (#306) — silent column shift
on legal text with unquoted commas. Recovering bulk-master as-is
would write corrupted data across all 8 tables (15.5% corruption rate
based on T5 measurement).

Phase 0 also runs a separate csv-parse stream (line 1214) over the
522 MB citation-map.csv.bz2, which is opinion-to-opinion citation
edges. This is a different concern (smaller corruption surface;
both columns are bigint IDs that fail-fast on cast; not legal text).

## Architectural fix

Same as T5 (#307) and T6 (#309): pivot Phase 1 from CSV stream to
chunked SQL keyset pagination over `cl_opinion_bodies`.

### Producer change

Phase 1's `for await (const record of parser)` loop becomes:

```js
let cursor = resumeFrom;
while (true) {
  const rows = await query(
    "SELECT opinion_id AS id, cluster_id, plain_text, " +
    "       author_str AS author " +
    "FROM cl_opinion_bodies " +
    "WHERE cluster_id > $1 AND text_length >= $2 " +
    "ORDER BY cluster_id LIMIT $3",
    [cursor, MIN_TEXT_LEN, chunkSize]
  );
  if (rows.length === 0) break;
  for (const record of rows) {
    cursor = record.cluster_id;
    // ... existing per-record logic ...
  }
}
```

Each `record` already has the shape the 8 extractors expect:
`record.plain_text`, `record.cluster_id`, `record.id`,
`record.author` (mapped from `author_str`).

### Field mapping

| CSV field used | cl_opinion_bodies source | Notes |
|----------------|--------------------------|-------|
| `record.plain_text` | `plain_text` | direct |
| `record.html_*` (fallback) | NOT in DB | drop fallback; plain_text is canonical |
| `record.cluster_id` | `cluster_id` (bigint, cast to text in code if needed) | direct |
| `record.id` (opinion_id) | `opinion_id` (bigint) | rename via `AS id` |
| `record.author` | `author_str` (text) | rename via `AS author` |

The `html_*` fallback is unused on cl_opinion_bodies-loaded rows —
plain_text was already extracted from HTML by the bulk loader.
1.39M of 1.5M rows have `text_length >= 200`. The 113K thin rows
(< 200 chars) are skipped by all extractors anyway.

### Phase 0 (citation-map) — separate decision

Phase 0's csv-parse path is lower risk (no legal text, two-bigint
schema) but should still be migrated for consistency. CL bulk
loader doesn't currently load citations to a Supabase table —
loading `citations.csv.bz2` to `cl_citations(cited_id, citing_id)`
would replicate the T5 architectural pattern across the citation
graph. This is **OUT OF SCOPE for Phase 2** — track separately
as `cl_citations` bulk-load + Phase 0 DB-first follow-up.

### Limit + delta gate

Phase 1 has its own delta concept via `targetClusters` (clusters
referenced by `statute_case_law_dump.json` + `citingOpinionIds` from
Phase 0). Keep that filter. Add a `--no-delta-gate` flag analogous
to T6 in case operator wants to scan all 1.5M cl_opinion_bodies rows.

### Bench/jury divergence + co-defendant — re-verify after T6 ships

Two of the 8 extractors are wired into Tier 9 surfaces shipped 2026-04-29
(see `worry-data-orphans-phases-5-7-shipped-2026-04-29.md`). After
Phase 2 ships, verify those surfaces still render correct data —
the producer is changing but the consumer schema is not.

## Smoke plan (Phase 2)

1. `--apply --limit 100 --tables judge_quotes` → expect ~30-50 quote rows.
2. Verify `pg_stat_user_tables.n_tup_ins` on `judge_quotes` jumps by
   the script-reported count (analogue of T6 ground-truth check).
3. `--apply --limit 1000` (all 8 tables) → check each table's
   n_tup_ins/n_tup_upd matches script counters.
4. Full run after smoke clean.

## Out of scope for Phase 2 (separate followups)

- Phase 0 citation-map DB-first migration (needs `cl_citations` bulk load).
- Migrating other CL CSV streamers in repo (search: `csv-parse` +
  `relax_quotes` matches on the `opinions-*.csv` source).
- Retiring the broken `opinions-criminal.csv` artifact + its filter
  script (`scripts/filter-criminal-opinions.py`) — leave for now,
  cleanup pass after all consumers are off CSV.

## Verification gate (every Phase 2 ship)

Per memory `lesson-cl-csv-parse-corruption-2026-05-04.md` and
`warning-bulk-master-csv-parse-bug-2026-05-04.md`:

- `pg_stat_user_tables.n_tup_upd` is the ground truth, NOT the script counter.
- Sample 100 written rows; verify cluster_id parses as bigint and
  matches `cl_opinion_bodies.cluster_id` (no corruption).
- If script-reported counter !== n_tup_upd, parser corruption hit.
  Kill immediately.
