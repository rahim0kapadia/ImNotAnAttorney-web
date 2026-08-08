---
source: Vera incarceration trends
provider: Vera Institute of Justice
url: https://github.com/vera-institute/incarceration_trends
format: csv
license: Vera permits research use with attribution
last_refresh: 2026-04
refresh_cadence: annual
db_tables:
  - vera_incarceration
consuming_tiers:
  - District Court Intelligence ($97 planned)
  - Blog substrate
  - War Room ($4,997)
---

# Vera incarceration trends

County-year incarceration rates from Vera Institute of Justice. ~1.9M county-year cells. Used for jurisdictional context in War Room ("how does your county's incarceration rate compare?") and blog substrate.

## Source

| Aspect | Value |
|---|---|
| Provider | Vera Institute of Justice |
| Bulk URL | https://github.com/vera-institute/incarceration_trends |
| Format | CSV (Git versioned) |
| Refresh | annual |
| Approx rows | ~1.9M county-year cells (every US county, multiple decades) |

## Schema target

| Source | DB table | Notes |
|---|---|---|
| Vera CSV | `vera_incarceration` | per-county-year jail + prison populations + admission/release rates |

## Ingest pipeline

- Git pull from vera-institute/incarceration_trends → COPY FROM STDIN.
- Rule #19 marker: `// csv-bulk-checked: https://github.com/vera-institute/incarceration_trends`.

## License / fair use

Vera permits research use with attribution. Cite "Vera Institute of Justice, incarceration_trends" per row.

## Anti-patterns / known gotchas

- **County FIPS codes** — leading-zero handling per cl-bulk-data-defensive #20.
- **Sparse data for small counties** — many cells have NULL or estimated values.

## Last refresh + next trigger

- Last refresh: 2026-04.
- Next refresh trigger: annual Vera publish.
