---
source: CourtListener bulk data
provider: Free Law Project
url: https://storage.courtlistener.com/bulk-data/
format: csv-bz2
license: Public-domain federal/state opinions; FLP terms permit redistribution with attribution
last_refresh: 2026-04-19
refresh_cadence: weekly (CL publishes), on-demand re-ingest
db_tables:
  - cl_opinions
  - cl_clusters
  - cl_dockets
  - cl_citations
  - cl_people
  - cl_courts
  - cl_parentheticals
  - case_law
  - classified_opinions
consuming_tiers:
  - all
---

# CourtListener bulk data

The canonical case-law substrate for the entire INAA stack. Every higher-level
table (`case_law`, `classified_opinions`, `judge_profiles`, `judge_quotes`,
`case_feature_vectors`) ultimately derives from CL bulk.

## Source

| Aspect | Value |
|---|---|
| Provider | Free Law Project (FLP) |
| Bulk URL | https://storage.courtlistener.com/bulk-data/ |
| Format | bz2-compressed CSV (one file per table per snapshot date) |
| Largest file | `opinions-YYYY-MM-DD.csv.bz2` ~50 GB compressed |
| Refresh | weekly snapshot publishing schedule on CL's storage bucket |

## Schema target

| Source file | DB table | Notes |
|---|---|---|
| `opinions-*.csv.bz2` | `cl_opinions` | full opinion text (large); also feeds `case_law` body lookup |
| `opinion-clusters-*.csv.bz2` | `cl_clusters` | clustering metadata, decision date, court, citation set |
| `dockets-*.csv.bz2` | `cl_dockets` | docket-level metadata; feeds judge×prosecutor pairing matrix |
| `citations-*.csv.bz2` | `cl_citations` | citation map (~522 MB); feeds is_good_law treatment chains |
| `people-*.csv.bz2` | `cl_people` | judges + judicial appointments; feeds `judge_profiles` |
| `courts-*.csv.bz2` | `cl_courts` | court metadata, jurisdiction strings |
| `parentheticals-*.csv.bz2` | `cl_parentheticals` | parenthetical case-law summaries |

## Ingest pipeline

- **Loader:** `scripts/cl-bulk-loader.mjs` (bz2 stream → `COPY FROM STDIN`).
- **Pattern:** decompress bz2 ONCE to local CSV, then COPY (per memory `feedback-decompress-bz2-once.md`).
- **Defenses required:** rule #1 + #18 + #19 from `~/.claude/rules/cl-bulk-data-defensive.md` (`relax_quotes:true`, COPY not INSERT, csv-bulk-before-API marker).
- **Connection:** port 5432 (session mode) — port 6543 has 2-min `statement_timeout` that kills long COPY ops.

## License / fair use

Federal court opinions are categorically uncopyrightable (*Wheaton v. Peters*, 1834; *Banks v. Manchester*, 1888). State court opinions are uncopyrightable per *Georgia v. Public.Resource.Org* (2020). FLP redistribution permits citation + attribution; INAA cites `https://www.courtlistener.com/opinion/<cluster_id>/...` per row.

## Robots.txt / rate limits

Bulk download endpoint (`storage.courtlistener.com`) has no robots disallow + no per-file rate limit (S3-backed). The CL **API** (`www.courtlistener.com/api/`) is rate-limited (~5,000 req/hour); use bulk for any data already in a CSV.

## Anti-patterns / known gotchas

- **csv-parse crashes on unescaped quotes in legal text** — use `relax_quotes:true` (gotcha-csv-parse-quote-not-closed).
- **CL CSVs quote ALL values** — strip surrounding quotes before ID matching (gotcha-cl-csv-quote-stripping).
- **Two Node CSV streamers concurrently OOM on Windows** — serialize (gotcha-concurrent-csv-streamers-oom).
- **`opinions-bodies.csv.bz2` was rejected as API-source 2026-04-20** — use the bulk file, not the API fetcher.
- **53% of cited cases are OVERRULED** — every report-rendered citation must run `is_good_law` check via `classified_opinions` + `cl_citations` treatment chain (`project-53pct-bad-law.md`).

## Last refresh + next trigger

- Last full ingest pass: 2026-04-19 (`canonicalize-cases-v3.mjs` and successors).
- Next refresh trigger: when a per-state ingest needs body lookup AND `cl_clusters.date_filed > MAX(cl_clusters.date_filed) WHERE …`.
- No automated cron — bulk pulls are on-demand because of the 50 GB size + bandwidth cost.

## Verification on every report-render

`v_entity_confidence` matview (Phase 2 cite-tag system) cross-references every `<cite>` span against `case_law` + `classified_opinions`. Empty `source_urls[]` = strip span before sanitize-html.
