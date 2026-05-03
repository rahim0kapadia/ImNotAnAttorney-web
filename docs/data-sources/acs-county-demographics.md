---
source: ACS county demographics
provider: US Census Bureau (American Community Survey)
url: https://www.census.gov/programs-surveys/acs/data.html
format: multi (csv + api)
license: Public-domain US government data
last_refresh: shipped (jury-pool demographics substrate)
refresh_cadence: annual
db_tables:
  - acs_county_demographics
consuming_tiers:
  - District Court Intelligence ($97 planned)
  - Intelligence Brief ($997) — jury-strategy section
---

# ACS county demographics

American Community Survey 5-year estimates at county level. Used as the jury-pool demographic substrate in IB jury-strategy section + District Court Intelligence.

## Source

| Aspect | Value |
|---|---|
| Provider | US Census Bureau (ACS) |
| Bulk URL | https://www.census.gov/programs-surveys/acs/data.html |
| Format | CSV + API |
| Refresh | annual (5-year rolling estimates) |
| Approx rows | ~3,200 counties × 50+ variables |

## Schema target

| Source | DB table | Notes |
|---|---|---|
| ACS county CSV | `acs_county_demographics` | per-county race, age, education, income, language distributions |

## Ingest pipeline

- Census API or bulk CSV download → COPY.
- Rule #19 marker: `// csv-bulk-checked: https://www.census.gov/programs-surveys/acs/data.html`.

## License / fair use

US government public-domain. No restrictions on redistribution.

## Anti-patterns / known gotchas

- **5-year vs 1-year vintage** — 5-year is more stable but lags 2 years; 1-year only available for counties >65K population.
- **County FIPS as text** — leading-zero handling per cl-bulk-data-defensive #20.

## Last refresh + next trigger

- Last refresh: shipped (verify exact date).
- Next refresh trigger: Census annual ACS publish (typically Dec).
