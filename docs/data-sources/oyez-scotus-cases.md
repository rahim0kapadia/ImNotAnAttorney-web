---
source: Oyez SCOTUS cases
provider: Oyez Project (Cornell LII / Chicago-Kent / Justia consortium)
url: https://api.oyez.org/cases · https://github.com/walling/oyez-api
format: json
license: Oyez project terms permit research use with attribution
last_refresh: shipped (verify provenance — SCOTUS Case Search standalone live)
refresh_cadence: annual (after SCOTUS term ends)
db_tables:
  - oyez_cases
consuming_tiers:
  - SCOTUS Case Search (free)
  - X-Ray ($2,497)
---

# Oyez SCOTUS cases

Every Supreme Court case with metadata: parties, citation, term, decision date, vote breakdown, opinion authorship, oral-argument audio links. Powers the SCOTUS Case Search free tool.

## Source

| Aspect | Value |
|---|---|
| Provider | Oyez Project |
| Bulk URLs | https://api.oyez.org/cases (single-call returns ALL) · https://github.com/walling/oyez-api (community bulk dumps) |
| Format | JSON |
| Refresh | annual |
| Approx rows | ~28,000 cases (1791–present) |

## Schema target

| Source | DB table | Notes |
|---|---|---|
| Oyez API JSON | `oyez_cases` | parties, citation, term, decided, justices[], vote, opinion authorship |

## Ingest pipeline

- **API single-call pattern** — Oyez returns ALL cases in one JSON. No pagination needed.
- **Rule #19 marker:** `// csv-bulk-checked: https://api.oyez.org/cases` (API IS the bulk endpoint).

## License / fair use

Oyez Project permits research use + attribution. Cite `https://www.oyez.org/cases/...` per row.

## Anti-patterns / known gotchas

- **Justice name normalization** — "Anthony M. Kennedy" vs "Anthony Kennedy" vs "Kennedy, A.M." across vintages.
- **Vote field shape changes** pre-1925 — early cases lack per-justice vote.

## Last refresh + next trigger

- SCOTUS Case Search live; verify ingest script path in `e2e/scotus-case-search.spec.ts` for current loader.
- Next refresh trigger: end of SCOTUS term (typically late June).
