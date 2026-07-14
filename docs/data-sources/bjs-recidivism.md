# BJS Recidivism Cohorts

Bureau of Justice Statistics releases per-publication ZIP archives containing
the full set of statistical tables from each printed recidivism report. We
ingest those CSV bundles directly. No API. No PDF parsing.

## Source URLs

Per-publication ZIP archives. All URLs are HTTPS and stable as of 2026-05-02.

| Code   | Pubcode             | Cohort | Window  | NCJ     | ZIP URL |
|--------|---------------------|--------|---------|---------|---------|
| rpr34s | rpr34s125yfup1217   | 2012   | 5-year  | 255947  | https://bjs.ojp.gov/BJS_PUB/rpr34s125yfup1217/csv/rpr34s125yfup1217.zip |
| rpr24s | rpr24s0810yfup0818  | 2008   | 10-year | 256094  | https://bjs.ojp.gov/media/64876/download |

A third publication, **2018 Update on Prisoner Recidivism: A 9-Year Follow-up
Period (2005-2014)** (`18upr9yfp0514`, NCJ 250975), is published at
`https://bjs.ojp.gov/redirect-legacy/content/pub/sheets/18upr9yfp0514.zip`
but is **not ingested in v1** because its CSV layout is sufficiently
different from the 2021 publications that the parser would need a
publication-specific code path. Adding it is a follow-up.

## Format

CSV. Wide-format publication tables. One CSV per Table N / Figure N /
Appendix Table N from the printed PDF report. Each ZIP holds 30-40 CSVs.

The wide-format layout is human-eye-oriented, not machine-friendly:

- Lines 1-9 are metadata header (Bureau name, Filename, full Title repeated
  twice, Authors, Source citation, Date of version).
- Line 11 is the column header: starts with `Characteristic`, then optionally
  `Number of released prisoners`, then N pairs of `(Year N, "")` columns
  where the empty cell holds the significance marker.
- Data rows below use **hierarchical category encoding**: the index of the
  first non-empty cell encodes the depth in a category breadcrumb. Example:
  - `Sex,,,,...` is a depth-0 section header.
  - `,Male*,,...` is a depth-1 value under "Sex".
  - `,,40-54,...` is a depth-2 value under "Age at release / 40 or older".
- Footnote rows below the data start with `Note:`, `Source:`, `*`, `~`,
  `a/`, `b/`, etc.

The parser walks rows, maintains a `CategoryTracker` for the breadcrumb,
and emits one normalized row per (cohort, demographic-or-offense, outcome,
follow-up-year).

## Coverage Targeted in v1

Per publication, we ingest these four tables (when present):

- **Table 4**: cumulative arrests by sex / race / age cross-tabbed with year
- **Table 5**: cumulative arrests by most-serious commitment offense
  cross-tabbed with year
- **Table 7**: cumulative re-convictions by sex / race / age (subset of
  states that reported court data)
- **Table 8**: cumulative returns-to-prison by sex / race / age (subset of
  states that reported prison data)

Other tables in the bundle (Figure CSVs, Appendix Tables for standard
errors, Tables 1-3 / 9-21) are **not** ingested in v1 because they encode
non-cohort dimensions (number of prior arrests, time-served distributions,
year-of-arrest counts) that don't fit the v1 schema cleanly.

## Schema target

Table: `bjs_recidivism_cohorts` (migration `20260502a_bjs_recidivism_cohorts.sql`).

One row per `(cohort_release_year, state, offense_category,
offense_subcategory, follow_up_years, outcome_type, demographic_segment)`.

Wide composite UNIQUE index covers that natural key (with `__national__` /
`__none__` sentinel substitutions for NULL state and NULL subcategory).

Cardinality after first ingest: **945 rows** = 2 publications × 4 tables ×
(15 demographic-only rows × N years + 19 offense-only rows × N years).

## Refresh cadence

BJS publishes per-publication ZIPs as each NCJ report drops. Cadence is
**annual to triennial** -- recidivism studies take years to compile, and
once a study is published its ZIP is never updated.

To keep the ingest current, re-run quarterly to detect new publications:

```
node scripts/ingest/seed-bjs-recidivism.mjs --verbose
```

The orchestrator's `DATASETS` array is the single source of truth for
which publications are ingested. Add a new entry when a new BJS recidivism
report drops, then re-run. Existing rows upsert via `ON CONFLICT DO UPDATE`
on the wide composite key.

A scheduled cron-job.org refresh is **not** wired up in v1. Manual
re-run after each new BJS release is the operating mode.

## Ingest mechanics

- **Bulk download path**: HTTPS `fetch()` with retry (3 attempts, 60s
  timeout per attempt, 2s backoff between attempts).
- **ZIP extraction**: shell `unzip -o` to a tempdir under `os.tmpdir()`.
  Yes, this requires `unzip` on PATH. Available on macOS, Linux, and Git
  Bash on Windows. Trade-off chosen over a `yauzl`/`adm-zip` dep because
  the dep wasn't already in the repo and the ingest is run on developer
  workstations and Vercel build images that have `unzip`.
- **Parser**: `scripts/ingest/lib/bjs-recidivism-csv.mjs`. RFC 4180-compliant
  CSV reader (no third-party CSV dep), hierarchical-category tracker,
  outcome-type inference from table title, year-of-cohort inference from
  table title, demographic-segment + offense-category mapping in
  `categorizeRow()`.
- **DB load**: Postgres COPY FROM STDIN via `bulkCopyRows` from
  `scripts/lib/pg-bulk-defaults.mjs`. Stages into a uniquely-named regular
  table (`bjs_recidivism_stage_<hex>`), upserts into the canonical table,
  drops the staging table at end.
- **Connection**: port 5432 (session mode) per cl-bulk-data-defensive #14.
  Session-level `statement_timeout`, `idle_in_transaction_session_timeout`,
  and TCP keepalives configured by `createBulkClient`.

## CLI

```
node scripts/ingest/seed-bjs-recidivism.mjs --dry-run --verbose
node scripts/ingest/seed-bjs-recidivism.mjs --datasets=rpr34s --limit=5 --verbose
node scripts/ingest/seed-bjs-recidivism.mjs --verbose                    # live
```

Flags:

- `--dry-run`: parse only, no DB writes.
- `--verbose`: per-CSV counts and timing.
- `--datasets=rpr34s,rpr24s`: comma-separated subset of `DATASETS[].code`.
- `--limit=N`: cap rows per dataset (after parse, before dedup + DB write).

## Tests

`scripts/ingest/__tests__/seed-bjs-recidivism.test.mjs` -- 46 tests against
real captured BJS CSV fixtures committed under
`scripts/ingest/__tests__/fixtures/bjs-recidivism/`.

Run: `npx vitest run scripts/ingest/__tests__/seed-bjs-recidivism.test.mjs`

## First ingest result (2026-05-02)

```
Datasets ingested:        rpr34s + rpr24s
Total parsed rows:        945 (deduped)
Upserted into DB:         945
By cohort:                2008 (630 rows), 2012 (315 rows)
By outcome_type:          rearrested (495), reconvicted (225), returned-to-prison (225)
By offense_category:      all (675), Violent (90), Property (75), Drug (60), Public order (45)
By demographic_segment:   15 distinct segments (all, male, female, white, black,
                          hispanic, aian, aapi, other-race, lt-25, 25-39, 40-plus,
                          40-54, 55-64, 65-plus)
```

## Downstream BOFU consumers

This data powers two BOFU surfaces:

- **Case Decoder ($197)**: "For your charge type, X% of similar releasees
  are rearrested within 5 years" -- queries by
  `(offense_category, offense_subcategory, follow_up_years=5)`.
- **Intelligence Brief ($997)**: demographic-adjusted recidivism baseline
  in the sentencing-strategy section.

Both surfaces query against the `bjs_recidivism_cohorts_offense_idx` index
on `(offense_category, offense_subcategory, follow_up_years)`.
