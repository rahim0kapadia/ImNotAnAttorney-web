---
source: USSC Individual sentencing records (FY02–FY24)
provider: US Sentencing Commission
url: https://www.ussc.gov/research/datafiles
format: multi (SAS + fixed-width CSV)
license: Public-domain US government data
last_refresh: 2026-04-27 (FY13 added PR #187)
refresh_cadence: annual (Q1 next FY)
db_tables:
  - ussc_individual_fy13
  - ussc_individual_fy14
  - ussc_individual_fy15
  - ussc_individual_fy16
  - ussc_individual_fy17
  - ussc_individual_fy18
  - ussc_individual_fy19
  - ussc_individual_fy20
  - ussc_individual_fy21
  - ussc_individual_fy22
  - ussc_individual_fy23
  - ussc_individual_fy24
  - ussc_sentencing_all
  - ussc_matview_meta
  - ussc_codebook_meta
  - judge_sentencing_patterns
  - sentencing_distributions
consuming_tiers:
  - Federal Sentencing Distribution ($297)
  - Judge Report Card ($197)
  - X-Ray ($2,497)
  - Sentencing Calculator (free)
  - Intelligence Brief ($997)
---

# USSC Individual sentencing records (FY02–FY24)

Per-defendant federal sentencing rows from the United States Sentencing Commission. Source of truth for federal-court sentencing distributions, judge sentencing patterns, racial disparity flags, and downward/upward departure rates.

## Source

| Aspect | Value |
|---|---|
| Provider | US Sentencing Commission |
| Bulk URL | https://www.ussc.gov/research/datafiles |
| Format | SAS (.sas7bdat) + fixed-width CSV per FY |
| Refresh | annual; USSC publishes ~6–9 months after FY close |
| Per-FY size | ~70K–80K rows |
| Total loaded | ~819,248 rows in `ussc_sentencing_all` (FY13–FY24, as of 2026-04-27) |

## Schema target

| Source | DB table | Notes |
|---|---|---|
| USSC FY{N} CSV | `ussc_individual_fy{N}` | per-FY raw rows (62 columns) |
| n/a | `ussc_sentencing_all` | UNION ALL view across all loaded FYs |
| n/a | `ussc_matview_meta` | freshness gate (30-day stale-floor); shared with sister project |
| n/a | `ussc_codebook_meta` | code → label lookup (DISTRICT, OFFTYPE, SAFE, etc.) |
| derived | `judge_sentencing_patterns` | per-judge medians, p25/p75, departure rates (federal only) |
| derived | `sentencing_distributions` | district + offense distributions (p10–p90) |

## Ingest pipeline

- Loader: `scripts/ussc-subset-loader.mjs` (CSV → COPY FROM STDIN, slim subset).
- Pattern reference: `cl-bulk-data-defensive.md` #18 cites this loader as the canonical COPY example.
- Codebook loader: `scripts/build-ussc-districts.mjs` — **must strip leading zeros** on DISTRICT codes 0–9 (gotcha #20: codebook display format ≠ raw datafile format).

## License / fair use

US government public-domain. USSC publishes for research use; INAA cites `https://www.ussc.gov/research/datafiles` per row.

## Anti-patterns / known gotchas

- **Codebook leading-zero trap** — Appendix A shows DISTRICT as "00"–"09" but raw data stores "0"–"9". Cross-check before building lookup tables (cl-bulk-data-defensive #20).
- **`work_mem` default 3.5 MB on Supabase** — set per cl-bulk-data-defensive #7 BEFORE running multi-table joins. Tier-sized: do NOT blindly apply 2GB.
- **`ussc_matview_meta` is SHARED with sister project** — never add tenant prefixes or CHECK constraints (per ARCHITECTURE.md SHARED-table contract).
- **Per-row INSERT into FY tables = 70x slower than COPY** (cl-bulk-data-defensive #18, measured incident 2026-04-20: 37 min vs ~30 sec).

## Last refresh + next trigger

- Last refresh: 2026-04-27 (FY13 added, PR #187, +80,035 rows).
- Queued: FY02–FY12 loader committed, ~30 min compute remaining.
- Freshness gate: `/api/data-status` checks `ussc_matview_meta.last_refreshed > now() - interval '30 days'`. Stale = `insufficient_data` short-circuit on Federal Sentencing Distribution + downstream tiers.
- Next refresh trigger: USSC annual publish (typically Feb–May after FY close).
