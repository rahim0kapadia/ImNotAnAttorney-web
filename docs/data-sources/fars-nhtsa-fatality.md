---
source: FARS (Fatality Analysis Reporting System)
provider: National Highway Traffic Safety Administration
url: https://www.nhtsa.gov/file-downloads
format: csv
license: Public-domain US government data
last_refresh: 2026-04 (DUI playbook ship)
refresh_cadence: annual
db_tables:
  - fars_accident
  - fars_person
  - fars_vehicle
consuming_tiers:
  - DUI Playbook ($147)
  - X-Ray ($2,497)
---

# FARS (NHTSA Fatality Analysis Reporting System)

Per-fatal-crash data from NHTSA. Used in DUI Playbook for "your blood-alcohol vs national fatal-crash distribution" framing and X-Ray for jurisdiction-level baseline rates.

## Source

| Aspect | Value |
|---|---|
| Provider | NHTSA |
| Bulk URL | https://www.nhtsa.gov/file-downloads |
| Format | CSV (one ZIP per FY containing accident.csv, person.csv, vehicle.csv, etc.) |
| Refresh | annual (NHTSA publishes ~12 months after FY close) |
| Approx rows | ~36K crashes/yr |

## Schema target

| Source | DB table | Notes |
|---|---|---|
| FARS accident.csv | `fars_accident` | crash-level metadata |
| FARS person.csv | `fars_person` | per-person involvement (driver / passenger / pedestrian) |
| FARS vehicle.csv | `fars_vehicle` | per-vehicle data |

## Ingest pipeline

- COPY FROM STDIN per cl-bulk-data-defensive #18.
- Rule #19 marker: `// csv-bulk-checked: https://www.nhtsa.gov/file-downloads`.

## License / fair use

US government public-domain. NHTSA explicitly permits redistribution.

## Anti-patterns / known gotchas

- **Codebook-vs-datafile drift** for state codes — FARS uses state-FIPS not USPS.
- **BAC field has measurement units drift** — pre-1985 used g/100mL, post unified to g/dL; verify.

## Last refresh + next trigger

- Last refresh: 2026-04 (DUI playbook citation substrate).
- Next refresh trigger: NHTSA annual publish (typically Q4–Q1 of next FY).
