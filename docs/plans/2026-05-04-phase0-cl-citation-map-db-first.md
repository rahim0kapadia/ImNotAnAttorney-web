# Phase 0 DB-First: bulk-master-extractor citation-map source switch

Date: 2026-05-04
Predecessor: `docs/plans/2026-05-04-phase2-bulk-master-db-first-design.md` (Phase 1, shipped #312)
Predecessor merge: -web PR #312, mono PR #89

## Problem

`bulk-master-extractor.mjs` Phase 0 (`runPhase0`) streams the 522 MB
`citation-map-2026-03-31.csv.bz2` through `bzcat | csv-parse` to build
two structures consumed by Phase 1's `appellate_trends` extractor:

- `citingMap: Map<cited_opinion_id, citing_opinion_id[]>`
- `citingOpinionIds: Set<citing_opinion_id>` (used for Phase 1 JS-side
  filter: `e8 && opinionId && citingOpinionIds.has(String(opinionId))`)

Same csv-parse corruption surface as the Phase 1 fix (PR #312) — relax_quotes
+ embedded commas in legal text shift trailing columns. Lower risk here
(both columns are bigint IDs that fail-fast on cast vs the legal-text payload
in Phase 1), but still a live failure mode.

Compounding bug: when run with `--skip-appeal-phase0` and a saved
`appeal-citing-map.json` exists, `runPhase0` calls `JSON.parse(fs.readFileSync(...))`
on a file that exceeds V8's `0x1fffffe8` string limit (incident
this session in `--apply --limit 1000`). Single in-memory string allocation
won't ever scale.

## Discovery (2026-05-04 probe)

`public.cl_citation_map` is **already populated** with the citation graph:

| col | type |
|---|---|
| id | bigint (PK) |
| depth | int |
| cited_opinion_id | bigint |
| citing_opinion_id | bigint |

- Row count: **76,959,991** (full CL citation graph)
- Index: `idx_citemap_cited ON (cited_opinion_id)` — perfect for our access pattern
- No new bulk-load needed. The whole "design + ship cl_citations bulk-load"
  premise from the followup queue is mooted.

## Architectural fix

Replace `runPhase0` body with a single SQL query that materializes
`citingOpinionIds` directly:

```sql
SELECT DISTINCT cm.citing_opinion_id
FROM cl_citation_map cm
INNER JOIN cl_opinion_bodies ob ON cm.cited_opinion_id = ob.opinion_id
WHERE ob.cluster_id = ANY($1::bigint[])
```

`$1` = bigint array of `targetClusters` (~6,718 clusters from dump).

Hits `idx_citemap_cited` after expanding clusters → opinion_ids via
`cl_opinion_bodies`. Returns the same `citingOpinionIds` Set the Phase 1
JS filter consumes.

`citingMap` (the cited→[citing] reverse map) is **not used by Phase 1** —
inspection of `bulk-master-extractor.mjs` confirms only `citingOpinionIds.has()`
is consumed. `citingMap` is built but dead. Drop it.

`clusterToJurisdiction` and `clusterToYear` are populated from the dump
(not from citation-map), so they're untouched.

## Files to modify

1. `scripts/bulk-master-extractor.mjs` — `runPhase0` rewrite
2. `docs/plans/2026-05-04-phase0-cl-citation-map-db-first.md` — this file

## Files to create

None.

## Tasks

1. Probe Phase 0 actual usage: confirm `citingMap` is dead code in Phase 1.
2. Rewrite `runPhase0` to single SQL query (no bzcat, no csv-parse).
3. Drop the `--skip-appeal-phase0` saved-file 2GB-string-read code path
   (becomes obsolete; flag retained as no-op for back-compat).
4. Smoke: `--dry-run --limit 5 --tables appellate_trends` →
   verify `citingOpinionIds.size > 0` and stream completes.
5. Smoke: `--apply --limit 100 --tables appellate_trends` →
   verify `appellate_trends` table accumulates rows; pg_stat ground-truth
   match (script counter == n_tup_ins delta).
6. PR title: `fix(scripts): bulk-master Phase 0 DB-first (cl_citation_map)`.

## Verification gate

- Phase 0 SQL completes in seconds (vs ~5 min CSV stream).
- `citingOpinionIds.size` is ≥ prior CSV-stream value (might be slightly
  larger due to no parser-corruption skips).
- `appellate_trends` smoke INSERT count matches `pg_stat_user_tables.n_tup_ins`
  delta exactly.

## Out of scope

- `cl_citations` bulk-load (mooted; cl_citation_map already loaded).
- Migrating other CL CSV streamers (separate followup).
- Retiring `opinions-criminal.csv` artifact (separate followup).
- Mirror to monorepo apps/web (will piggyback on this PR's mono twin).

## Cascade

- Atlas: closes the last csv-parse surface in this script
- Rahim: appellate_trends extractor finally trustworthy + `--skip-appeal-phase0`
  flag becomes meaningful (saved-file path obsoleted)
- direct counterparty (T9 War Room appellate trends consumer):
  inherits clean data from full Phase 2 run with e8 enabled
- downstream (consumers of citingOpinionIds): same shape, faster path
- ecosystem: pattern publishable — "audit-the-data-already-loaded
  before-bulk-loading-it" turn this into a discovery rule
- future-us: when bulk file goes stale, refresh is a single CL bulk
  loader run (out of scope)

No node loses.
