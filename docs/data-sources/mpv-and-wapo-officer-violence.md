---
source: Mapping Police Violence + WaPo Police Shootings
provider: Campaign Zero / Washington Post
url: Airtable export · https://github.com/washingtonpost/data-police-shootings
format: csv
license: MPV CC-BY-SA / WaPo CSV public release on GitHub
last_refresh: 2026-04-14 (downloaded; ingest TBD)
refresh_cadence: MPV annual / WaPo monthly
db_tables:
  - officer_violence_events
  - officer_reliability (enrichment)
consuming_tiers:
  - Officer Background Check ($97)
  - X-Ray ($2,497)
---

# MPV + WaPo officer-violence

Two complementary datasets enriching `officer_reliability`. MPV (Campaign Zero) covers all known police killings since 2013. WaPo covers fatal police shootings (narrower scope, longer history, federal-government-quality verification).

## Source

| Aspect | MPV | WaPo |
|---|---|---|
| Provider | Campaign Zero / Mapping Police Violence | Washington Post |
| Bulk URL | Airtable export (sharable link) | https://github.com/washingtonpost/data-police-shootings |
| Format | CSV | CSV (Git versioned) |
| Refresh | annual | monthly |
| Approx rows | 467 partial (downloaded 2026-04-14) | ~10,000 |

## Schema target

| Source | DB table | Notes |
|---|---|---|
| MPV CSV | `officer_violence_events` | per-incident officer + victim + outcome |
| WaPo CSV | `officer_violence_events` | per-shooting officer + victim + circumstances |
| derived | `officer_reliability` | aggregated reliability score per officer (cross-incident) |

## Ingest pipeline

- **Status:** CSVs downloaded 2026-04-14 via `scripts/download-all-external-datasets.mjs`. Ingestion script `scripts/ingest-mpv.mjs` not yet written (TBD per architecture-defense-intelligence-system memo).
- **Pattern when written:** COPY FROM STDIN per cl-bulk-data-defensive #18.
- **Officer-name normalization:** garbage names cleaned in Tier 9 Phase 1 (11,818 → 1,524 in `officer_reliability`).

## License / fair use

- **MPV:** CC-BY-SA (Creative Commons Attribution-ShareAlike). Cite Campaign Zero per row.
- **WaPo:** Public release on GitHub. WaPo terms permit redistribution with attribution.

## Anti-patterns / known gotchas

- **MPV Airtable export is shareable-link only** — no API key, but the link can rotate. Re-fetch quarterly.
- **WaPo schema changed mid-2024** (added `officer_id` field). Loader must handle both shapes.
- **Officer name matching across datasets** is fuzzy — same officer appears as "John Smith", "J. Smith", "John A Smith" across sources. Use surname + agency + date-window for cross-incident attribution.

## Last refresh + next trigger

- Last download: 2026-04-14 (`scripts/download-all-external-datasets.mjs` + `scripts/browser-download-remaining.mjs` for FJC/MPV/FBI).
- Next ingest trigger: when Officer Background Check launches publicly. Currently uses NYPD CCRB + Chicago CPD as the high-volume substrate.
