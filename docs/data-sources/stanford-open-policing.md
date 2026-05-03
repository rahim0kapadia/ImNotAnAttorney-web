---
source: Stanford Open Policing Project
provider: Stanford University
url: https://openpolicing.stanford.edu/data/
format: csv
license: Stanford permits research use with attribution
last_refresh: shipped 2026-04
refresh_cadence: annual
db_tables:
  - police_stops
consuming_tiers:
  - DUI Playbook ($147)
  - X-Ray ($2,497)
---

# Stanford Open Policing

Per-traffic-stop data from 50+ state and local agencies. Used in DUI Playbook to surface "your stop demographic profile vs the agency's stop distribution" framing and X-Ray for jurisdiction-level baseline.

## Source

| Aspect | Value |
|---|---|
| Provider | Stanford Open Policing Project |
| Bulk URL | https://openpolicing.stanford.edu/data/ |
| Format | CSV (per-state, per-agency) |
| Refresh | annual |
| Approx rows | ~250M state-level stops (where loaded) |

## Schema target

| Source | DB table | Notes |
|---|---|---|
| Stanford CSV | `police_stops` | per-stop date, agency, location, demographics, outcome |

## Ingest pipeline

- COPY FROM STDIN per cl-bulk-data-defensive #18.
- Per-state loading; full nationwide ingest is hundreds of GB.

## License / fair use

Stanford permits research use with attribution. Cite "Stanford Open Policing Project" per row.

## Anti-patterns / known gotchas

- **Schema drift across states** — each agency reports differently. Stanford normalizes but residual variation remains in free-text fields.
- **Massive size** — load only states with INAA buyer concentration; defer rest.

## Last refresh + next trigger

- Last refresh: 2026-04 (DUI playbook ship).
- Next refresh trigger: Stanford annual republish.
