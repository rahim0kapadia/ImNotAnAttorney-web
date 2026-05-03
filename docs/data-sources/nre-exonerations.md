---
source: National Registry of Exonerations
provider: University of Michigan Law School
url: https://www.law.umich.edu/special/exoneration/Pages/detaillist.aspx
format: csv (request-gated)
license: UMich grants bulk access to defendants and academic researchers; commercial pitches refused
last_refresh: 2026-04-14 (partial download)
refresh_cadence: annual
db_tables:
  - nre_exonerations
consuming_tiers:
  - Similar Cases Analyzer ($297)
  - X-Ray ($2,497)
---

# NRE Exonerations

National Registry of Exonerations roster. Used in Similar Cases Analyzer and X-Ray to surface "your factual pattern matches a known wrongful-conviction profile" warnings.

## Source

| Aspect | Value |
|---|---|
| Provider | National Registry of Exonerations (UMich Law) |
| Bulk URL | https://www.law.umich.edu/special/exoneration/Pages/detaillist.aspx |
| Format | CSV (partial export on website + full export on request) |
| Refresh | annual |
| Approx rows | ~3,500 |

## License / fair use — sensitive

NRE grants bulk data to **defendants and academic researchers** — NOT to commercial pitches. The 2026-04-21 incident (`gotcha-anthropic-credits-exhausted` cluster + email-approval-gate rule) burned the channel: a commercial-framed pitch from primary-domain email permanently linked INAA's brand to "commercial bulk-data seeker" at NRE.

**Future contact must be from defendant context (Rahim's State v. Kapadia case 23-01773-CF) or academic-researcher framing — never brand-first commercial pitch.**

## Schema target

| Source | DB table | Notes |
|---|---|---|
| NRE CSV | `nre_exonerations` | per-exoneree name, state, charge, conviction year, exoneration year, contributing factors |

## Ingest pipeline

- **Status:** partial CSV downloaded 2026-04-14. Full bulk request blocked pending channel repair (see License section above).
- **TBD ingest script:** `scripts/ingest-nre-exonerations.mjs`.

## Anti-patterns / known gotchas

- **NEVER cold-email NRE from primary brand domain** (email-approval-gate rule HARD-blocks).
- **"Contributing factors" column is free-text** — multi-label parse needed (mistaken witness ID / false confession / official misconduct / bad forensics / etc.).

## Last refresh + next trigger

- Last download: 2026-04-14 partial.
- Next trigger: full-bulk request from defendant-context email; then annual NRE publish.
