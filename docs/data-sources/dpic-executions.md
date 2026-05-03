---
source: DPIC executions
provider: Death Penalty Information Center
url: dpic CSV (DPIC website export)
format: csv
license: DPIC public release; cite per row
last_refresh: shipped 2026-04 (verify provenance)
refresh_cadence: annual
db_tables:
  - dpic_executions
consuming_tiers:
  - Capital-case adjacency (X-Ray, Intelligence Brief)
---

# DPIC executions

Death Penalty Information Center execution roster. Used for capital-adjacent context (rare in INAA buyer base but used in IB/X-Ray when charge involves death-eligible offenses).

## Source

| Aspect | Value |
|---|---|
| Provider | Death Penalty Information Center |
| Bulk URL | DPIC executions database export (verify exact URL — covered in defense-intel memo) |
| Format | CSV |
| Refresh | annual |
| Approx rows | ~1,500 |

## Schema target

| Source | DB table | Notes |
|---|---|---|
| DPIC CSV | `dpic_executions` | per-execution date, state, method, race-of-defendant, race-of-victim |

## Ingest pipeline

- **verify provenance** — `architecture-defense-intelligence-system.md` lists DPIC as shipped, but ingest script path not pinned in current memory. Likely under `scripts/ingest-dpic.mjs`.

## License / fair use

DPIC permits redistribution of the executions database with attribution.

## Anti-patterns / known gotchas

- **Method-of-execution column has free-text drift** — normalize to enum (lethal injection / electrocution / firing squad / etc.) before joining to display layer.

## Last refresh + next trigger

- Last refresh: 2026-04 (per defense-intel memo, exact date verify provenance).
- Next refresh trigger: annual DPIC publish.
