---
source: US Code (Cornell LII mirror)
provider: Cornell Legal Information Institute (Carl Malamud-aligned)
url: https://www.law.cornell.edu/uscode/
format: html
license: USC public-domain; Cornell LII redistribution permitted with attribution
last_refresh: 2026-04-24 (PR #117 weekly cron live)
refresh_cadence: weekly (Mon 15:00 UTC, cron-job.org jobId 7523661)
db_tables:
  - entities_statutes
  - jurisdiction_statutes
consuming_tiers:
  - all (federal-charge substrate)
---

# US Code (Cornell LII)

US Code Title 18 (Crimes), Title 21 (Drugs), Title 28 (Judiciary), and adjacent. Mirrored from Cornell LII because GPO bulk download has format friction; LII text is canonical-equivalent and consistently parseable.

## Source

| Aspect | Value |
|---|---|
| Provider | Cornell LII (`law.cornell.edu/uscode/`) |
| Bulk URL | https://www.law.cornell.edu/uscode/ (HTML per section) |
| Format | HTML per section |
| Refresh | weekly via cron-job.org jobId 7523661 (Mon 15:00 UTC) |
| Approx rows | 36 verified USC rows in `jurisdiction_statutes` (Phase 2 #119/#124); per-state expansion ongoing in `entities_statutes` |

## Schema target

| Source | DB table | Notes |
|---|---|---|
| LII HTML | `entities_statutes` (jurisdiction='USC') | seed (PR #115/#119/#124 = 36 verified sections incl. 18:1028A regex fix) |
| LII HTML | `jurisdiction_statutes` (legacy) | 36 USC rows; new code should target `entities_statutes` per hook gate |

## Ingest pipeline

- **Loader:** `scripts/ingest/seed-statutes-us.mjs` (verify path).
- **Cron route:** `/api/cron/statutes-refresh-us` (PR #117, MERGED 2026-04-24, commit 8c5e6a50).
- **Cron-job.org jobId:** 7523661 (Mon 15:00 UTC weekly hash-diff).
- **Filter:** `source_urls != '{}'` enforced in entity-whitelist + generate-report (no-hallucinated-legal-data HARD rule).

## License / fair use

US Code is uncopyrightable primary law. Cornell LII redistribution permitted with attribution; cite `https://www.law.cornell.edu/uscode/text/<title>/<section>` per row.

## Anti-patterns / known gotchas

- **18:1028A had regex collision with 18:1028** — fixed in PR #124 (commit cea03e96). Watch for similar A-suffix sections in future expansions.
- **GPO bulk USC is format-noisy** (XML with extensive metadata) — LII HTML is cleaner for parsing. Bootstrap-mode trade-off.

## Last refresh + next trigger

- Last refresh: 2026-04-24 (cron live).
- Next automatic refresh: weekly Mon 15:00 UTC. Hash-diff means most weeks are no-op.
