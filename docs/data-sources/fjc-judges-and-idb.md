---
source: FJC Judges + Integrated Database (IDB)
provider: Federal Judicial Center
url: https://www.fjc.gov/research/idb
format: csv
license: Public-domain US government data
last_refresh: 2026-04-14
refresh_cadence: annual
db_tables:
  - fjc_judges
  - judge_demographics
consuming_tiers:
  - Judge Report Card ($197)
  - Intelligence Brief ($997)
  - X-Ray ($2,497)
---

# FJC Judges + Integrated Database (IDB)

Federal Judicial Center publishes the canonical roster of federal judges + the IDB civil/criminal case database. INAA uses the judges file as the demographic spine for `judge_profiles` enrichment.

## Source

| Aspect | Value |
|---|---|
| Provider | Federal Judicial Center |
| Bulk URLs | https://www.fjc.gov/research/idb (IDB CSVs) · https://www.fjc.gov/history/judges (judges CSV) |
| Format | CSV |
| Refresh | annual (FJC publishes after FY close) |

## Schema target

| Source file | DB table | Notes |
|---|---|---|
| FJC Judges CSV | `fjc_judges` | name, court, appointing-president, party, ABA rating, law school, birth year |
| FJC Judges CSV (denormalized) | `judge_demographics` | per-judge demographic fields used for IB/X-Ray jury-strategy section |

## Ingest pipeline

- Loader: `scripts/ingest-fjc.mjs` (CSV → COPY).
- Trigger: manual annual refresh after FJC publishes new file.
- Rule #19 marker: `// csv-bulk-checked: https://www.fjc.gov/history/judges`.

## License / fair use

US government public-domain data. No restrictions on redistribution.

## Anti-patterns / known gotchas

- **FJC judge "name" sometimes carries suffixes inline** — use `name → full_name` mapping per Tier 9 Phase 0 fix.
- **Denormalize `positions JSONB` into `judge_profiles.jurisdiction`** — IB/X-Ray queries need it indexed.

## Last refresh + next trigger

- Last refresh: 2026-04-14 (Tier 9 Phase 1).
- Next trigger: FJC annual republish (typically Q1 of next FY).
