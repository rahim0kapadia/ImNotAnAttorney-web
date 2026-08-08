---
source: Chicago CPD complaints (Invisible Institute / CPDP)
provider: Invisible Institute / Citizens Police Data Project
url: https://github.com/invinst/CPDP-data
format: csv
license: CC-BY-SA (Invisible Institute)
last_refresh: shipped 2026-04 (verify provenance)
refresh_cadence: quarterly
db_tables:
  - chicago_cpd_complaints
  - officer_reliability (enrichment)
consuming_tiers:
  - Officer Background Check ($97)
  - X-Ray ($2,497)
---

# Chicago CPD complaints

Citizens Police Data Project — Chicago Police Department complaints + outcomes + use-of-force. ~250K rows. Largest single-agency officer-reliability substrate for IL.

## Source

| Aspect | Value |
|---|---|
| Provider | Invisible Institute / Citizens Police Data Project |
| Bulk URL | https://github.com/invinst/CPDP-data |
| Format | CSV (Git versioned) |
| Refresh | quarterly |
| Approx rows | ~250K complaints + use-of-force records |

## Schema target

| Source | DB table | Notes |
|---|---|---|
| CPDP CSV | `chicago_cpd_complaints` | per-complaint officer + complainant + outcome + finding |
| derived | `officer_reliability` | aggregated reliability per officer (IL scope) |

## Ingest pipeline

- Git pull from invinst/CPDP-data → COPY FROM STDIN.
- Rule #19 marker: `// csv-bulk-checked: https://github.com/invinst/CPDP-data`.

## License / fair use

CC-BY-SA. Cite Invisible Institute per row; INAA's downstream display preserves attribution.

## Anti-patterns / known gotchas

- **Officer-ID stability** — CPDP's officer_id is stable across releases (good); name fields drift.
- **Complaint vs use-of-force are separate tables** — joined on officer_id.

## Last refresh + next trigger

- Last refresh: 2026-04 (verify exact date).
- Next refresh trigger: CPDP-data Git repo new commit (watch on GitHub).
