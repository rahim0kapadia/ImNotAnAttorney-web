---
source: NYPD CCRB allegations
provider: NYC Civilian Complaint Review Board
url: NYC Open Data — CCRB allegations dataset
format: csv
license: NYC Open Data license (public)
last_refresh: shipped 2026-04 (verify provenance)
refresh_cadence: quarterly
db_tables:
  - nypd_ccrb_allegations
  - officer_reliability (enrichment)
consuming_tiers:
  - Officer Background Check ($97)
  - X-Ray ($2,497)
---

# NYPD CCRB allegations

Civilian Complaint Review Board allegations against NYPD officers. ~370K rows. Single largest single-agency officer-reliability substrate.

## Source

| Aspect | Value |
|---|---|
| Provider | NYC Civilian Complaint Review Board (via NYC Open Data) |
| Bulk URL | NYC Open Data CCRB allegations dataset |
| Format | CSV |
| Refresh | quarterly |
| Approx rows | ~370K |

## Schema target

| Source | DB table | Notes |
|---|---|---|
| NYC Open Data CCRB CSV | `nypd_ccrb_allegations` | per-allegation officer + incident + finding |
| derived | `officer_reliability` | aggregated reliability per officer (NY-state scope) |

## Ingest pipeline

- NYC Open Data CSV download → COPY.
- Rule #19 marker required.

## License / fair use

NYC Open Data license — public, redistribution permitted.

## Anti-patterns / known gotchas

- **Officer name variations** — same officer appears as "Smith, John" and "John Smith" across record vintages.
- **"Finding" field has 8+ enum values** (substantiated / unsubstantiated / unfounded / exonerated / etc.) — display layer must map to plain English.

## Last refresh + next trigger

- Last refresh: 2026-04 (verify exact date).
- Next refresh trigger: NYC Open Data quarterly republish.
