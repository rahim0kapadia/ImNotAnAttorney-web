---
source: NIBRS Florida (Kaplan archive)
provider: FBI / Jacob Kaplan archive
url: NIBRS bulk via Jacob Kaplan archive
format: multi (zip / csv)
license: FBI public-domain federal data; Kaplan redistribution academic-research-permitted
last_refresh: 2026-04-14 (ZIP extracted; ingest deferred)
refresh_cadence: annual
db_tables:
  - nibrs_fl_*
consuming_tiers:
  - District Court Intelligence ($97 planned)
  - X-Ray ($2,497)
---

# NIBRS Florida (Kaplan)

National Incident-Based Reporting System for Florida. Per-incident victim/offender/offense detail at agency-level granularity. Massive (~90M state-level events).

## Source

| Aspect | Value |
|---|---|
| Provider | FBI (raw) → Jacob Kaplan archive (curated for research) |
| Bulk URL | NIBRS bulk via Kaplan archive (verify exact URL) |
| Format | ZIP containing 49 fixed-width / CSV tables per state-year |
| Refresh | annual (FBI publishes) |
| Approx rows | ~90M for FL alone |

## Schema target

| Source | DB table | Notes |
|---|---|---|
| Kaplan FL ZIP | `nibrs_fl_*` (49 tables) | per-incident, per-victim, per-offender, per-offense |

## Ingest pipeline

- **Status:** ZIP extracted 2026-04-14. Ingestion deferred — complex agency-level transformation needed (49 tables × multiple FY × foreign-key joins).
- **TBD ingest script:** `scripts/ingest-nibrs-fl.mjs`.
- **Pattern when written:** COPY FROM STDIN per cl-bulk-data-defensive #18; tier-sized `work_mem` (Supabase XL = 1 GB ceiling).

## License / fair use

FBI raw data is public-domain US government. Kaplan archive redistribution permits academic research use with attribution.

## Anti-patterns / known gotchas

- **49-table relational shape** — incident → segment → offense → offender → victim → property. Joins are non-trivial.
- **Codebook-vs-datafile drift** (cl-bulk-data-defensive #20) — verify code values against actual rows before encoding lookups.
- **State-only scope** — FL only; expanding to other states quintuples storage.

## Last refresh + next trigger

- Last download: 2026-04-14.
- Next trigger: District Court Intelligence SKU launch — needed to render district-level offense-type intelligence.
