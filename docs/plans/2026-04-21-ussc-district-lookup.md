# USSC District Code → Name Lookup Table

**Date:** 2026-04-21
**Source:** USSC Public Release Codebook FY99-FY24, Appendix A (p. A-1 + A-3)
**Verified via:** `pdftotext -layout codebook.pdf` from `khwilson/SentencingCommissionDatasets`
**Timebox:** 1-2 hours

## Problem

`federal_sentencing_distributions` (13,131 rows) and `ussc_similar_cases_summary` (23,210 buckets) store district as a numeric code ("42", "70"). Every downstream sentencing product renders raw codes because no lookup exists. Bucket-1 intake cascade (PR #7) had to skip state→district mapping for this reason.

## Product fit

- Case Decoder ($197), IB ($997), X-Ray ($2,497) — district codes become readable
- FSD standalone ($297) — now unblocked for build
- Similar Cases Analyzer intake — state→district dropdown now populatable

## Schema

```sql
CREATE TABLE ussc_districts (
  district_code TEXT PRIMARY KEY,      -- USSC DISTRICT raw code (0-96, 3 gaps)
  circdist_code TEXT,                  -- USSC CIRCDIST derived (01-94)
  district_name TEXT NOT NULL,         -- "Western District of Texas"
  short_name TEXT NOT NULL,            -- "W.D. Texas"
  state_code TEXT,                     -- "TX"
  state_name TEXT,                     -- "Texas"
  circuit TEXT NOT NULL,               -- "DC", "1st", ..., "11th"
  cl_court_id TEXT,                    -- FK to cl_courts.id
  source_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Files

| Path | Status |
|---|---|
| `scripts/ingest/build-ussc-districts.mjs` | Create |
| `docs/plans/2026-04-21-ussc-district-lookup.md` | This file |
| `../ImNotAnAttorney/docs/handoff/2026-04-21-ussc-district-lookup-complete.md` | Handoff |
| `logs/ussc-districts.log` | Generated |

## Numbered tasks

1. Probe — cl_courts + existing district tables. DONE.
2. Extract — DISTRICT + CIRCDIST mappings from codebook. DONE.
3. Plan — this file.
4. Script — UNLOGGED staging + COPY FROM STDIN + TRUNCATE + INSERT SELECT.
5. Run in background + verify 94 rows + matview cross-check.
6. Handoff doc.

## Success criteria

1. `SELECT COUNT(*) FROM ussc_districts` = 94.
2. Every matview district code in lookup.
3. ≥85/94 cl_court_id matches.
4. Fixture: district_code='42' → "W.D. Texas".

## Cascade

- Defendants: reports show "W.D. Texas" not "42"
- Us: FSD product unblocked; all sentencing reports readable
- Rahim: no analyst time
- Future-us: 94-district map is DATA, extensible
- Ecosystem: pattern portable to any federal-court product
