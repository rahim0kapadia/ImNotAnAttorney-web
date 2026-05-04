# Handoff: Phase 1 (T6 DB-first) shipped + full run streaming + Phase 2 designed

Date: 2026-05-04 ~12:30 ET
Predecessor: `docs/handoffs/2026-05-04-prs-merged-bulk-master-csv-bug.md`

## What shipped this session

- **PR #309** (MERGED) — T6 charge-extractor DB-first rewrite. Replaces broken csv-parse stream with chunked SQL keyset over `cl_opinion_bodies`. Smoke 134 applied / 0 errors / pg_stat n_tup_upd matched script counter exactly.
- **PR #310** (MERGED) — Phase 2 design plan: `bulk-master-extractor.mjs` DB-first migration. Implementation deferred to next session.

## T6 full run streaming

Launched 2026-05-04 11:14 ET via:
```
nohup node --max-old-space-size=4096 scripts/bulk-extract-charge-types.mjs --apply > .tmp-session/t6-full.log 2>&1 &
```

Live progress (sampled ~12:25 ET / ~70 min in):
- chunk #8 / scanned=40,000 / classified=8,396 / 171 r/s
- ground truth: classified_opinions count 4,518 → 20,879 (+16,361)
- n_tup_upd: 16,759 (matches script counter, no parser corruption)

ETA: ~12 hours total run for 1.39M with-text rows.
Resume cursor on crash: `--resume-from <last-cursor-from-log>`.

## Verification (ground truth)

Run `node .tmp-session/probe-co-ground-truth.mjs` to check progress:
- pg_stat_user_tables.n_tup_upd is the ground truth.
- script-reported counters MATCH n_tup_upd this time → no parser corruption.

## Remaining (next session)

1. **Wait for T6 full run** — verify final classified count + n_tup_upd. If
   crashed mid-run, resume via `--resume-from <last-cursor>` flag.

2. **Phase 2 implementation:** `scripts/bulk-master-extractor.mjs` per
   `docs/plans/2026-05-04-phase2-bulk-master-db-first-design.md`.
   One producer pivot fixes all 8 in-stream extractors:
   judge_quotes, sentencing_distributions, officer_reliability,
   judge_prosecutor_pairings, bench_jury_divergence, co_defendant_analysis,
   plea_discount_curves, appellate_trends.

3. **Phase 0 follow-up** (separate from Phase 2): citation-map.csv.bz2
   stream → `cl_citations` bulk load + DB-first migration. Out-of-scope
   for Phase 2.

4. **NM Chapter 30 statute ingest** — check if Justia ban lifted:
   `curl -I https://law.justia.com/codes/new-mexico/chapter-30/`

5. **ROA canonicalization pass** (T5 boost, ~8,377 UUIDs to bridge to
   judge_profiles). Memory: `~/.claude/projects/.../memory/project-roa-canonicalization-needed-2026-05-04.md`.

## Files modified

- `scripts/bulk-extract-charge-types.mjs` (DB-first, shipped #309)
- `docs/plans/2026-05-04-phase2-bulk-master-db-first-design.md` (shipped #310)
- `.tmp-session/probe-co-ground-truth.mjs` (verification probe)
- `.tmp-session/probe-cob-quick.mjs` (cl_opinion_bodies shape probe)
- `.tmp-session/probe-classified-cluster-type.mjs` (cluster_id type probe)
- `.tmp-session/t6-full.log` (running)

## DB state (sampled mid-T6-run)

- `classified_opinions`: 1,462,909 / **20,879** with charge_types (was 4,384 at session start)
- `judge_quotes`: 189,398 / 79,279 linked (unchanged from prior session)
- `entities_statutes`: 46,956 (unchanged)

## Session prompt for next

```
Execute the plan at
  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-05-04-phase2-bulk-master-db-first-design.md

Pre-flight: check .tmp-session/t6-full.log + run probe-co-ground-truth.mjs.
If T6 still running, leave it. If done, verify final classified count.

For Phase 2 implementation, follow the same pattern as #309:
  - Replace Phase 1's csv-parse stream (lines 1273-1275) with chunked
    cl_opinion_bodies keyset query.
  - Project columns the 8 extractors expect (plain_text, cluster_id,
    opinion_id AS id, author_str AS author).
  - Smoke --apply --limit 1000 → verify pg_stat_user_tables on each
    of the 8 tables matches script counters before full run.
  - Verification gate: pg_stat IS ground truth, NOT script counter.
```
