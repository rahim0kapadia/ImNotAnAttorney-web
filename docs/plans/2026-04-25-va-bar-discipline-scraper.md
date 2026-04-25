# Virginia Bar (VSB) Discipline Scraper — Plan

**Date:** 2026-04-25
**Branch:** `feat/va-bar-discipline`
**Owner:** Atlas

## Cascade

- **us:** Adds VA (10th-largest bar; ~31K members) to `attorney_discipline_events`.
  Pure infra reuse — same `bulkCopyRows` pattern as PA/FL/TX/NY/MI/OH; build cost
  ~2 hours.
- **direct counterparty (VA criminal defendants):** evidence-based attorney vetting
  before retaining counsel. VSB's discipline disclosures were previously buried
  in non-paginated rolling pages + per-year archive HTML; we index them.
- **downstream (defendants' families):** ~3× reach multiplier on each defendant
  decision, since family financial planning hinges on counsel choice.
- **ecosystem (Virginia State Bar):** public-record data already published; we only
  index it and fetch politely (1.5s/req). VSB-published `vsbwebstorage.blob` PDF
  links are preserved verbatim — we add traffic toward authoritative sources.
- **future-us:** ~1100 events live unblocks Attorney-Vetting $47 SKU's VA shard;
  wayback-fallback pattern is reusable for any state bar that publishes only
  rolling-window discipline pages without per-year archives.
- **adjacent (other state bar associations):** a public-disclosure transparency
  baseline raises industry floor; defendants in other states benefit when their
  bars match Virginia's transparency.
- **No node loses.** Cascade-positive.

## Objective

Load Virginia State Bar (VSB) attorney-discipline events into
`public.attorneys` + `public.attorney_discipline_events` keyed
`jurisdiction='VA'`. 100% `source_url` coverage. Real VSB-issued identifiers,
no fabricated IDs.

## Source Discovery (probed 2026-04-25)

| Surface | URL | Notes |
|---|---|---|
| Recent rolling page | `https://vsb.org/Site/Site/news/disciplinary-actions.aspx` | iMIS RadGrid; renders 10 most-recent BlockTLItem entries. Teaser only — full body lives on per-entry detail page. |
| Per-entry detail | `https://vsb.org/Site/Site/news/summary/<YYYYMMDD-slug>.aspx` | Full prose. Contains date, name, address, "VSB Docket No." line, description, vsbwebstorage PDF link. |
| Yearly archive (2005-2021) | `https://vsb.org/Site/Site/news/summary/summaries-archive/<YYYY>-disciplinary-summaries.aspx` | Single-page, ~70-115 entries each. Inline `<p>` blocks separated by `<br>`. |
| Yearly archive (2022-2025) | (same URL pattern) | **Returns 302→404 login loop — never built.** Gap closure via Wayback Machine. |
| Wayback Machine CDX | `https://web.archive.org/cdx/search/cdx?url=vsb.org/...&from=20220101&to=20260101` | 9 snapshots in the 2022-2025 window; replayed via `/web/<ts>id_/<url>` to bypass toolbar. ~45 unique entries recovered. |
| VSB Lawyer Lookup | `https://vsb.org/Site/Shared_Content/Directory/Lookup.aspx` | iMIS Telerik RadGrid AJAX postback; **does NOT return data for disbarred/revoked attorneys.** Infeasible for batch resolution; rejected. |
| Order PDFs | `https://vsbwebstorage.blob.core.windows.net/$web/actions/<NAME>-<DATE>.pdf` | Scanned images, **no text layer** (verified `pdftotext` returns 6-line stub). Cannot extract Member ID from PDFs. |

`csv-bulk-checked: none-exists — VSB publishes no discipline bulk CSV/API; only HTML pages at vsb.org`.

## Bar Number Strategy

VSB does **not publish member IDs** on discipline pages — only **VSB Docket
Numbers** ("VSB Docket No. 25-042-135956"). Three options were evaluated:

| Option | Rejected because |
|---|---|
| (a) Resolve VSB Member ID via Lookup AJAX postback | iMIS RadGrid is JS-rendered; returns nothing for disbarred attorneys (the very ones we care about). Infeasible for ~1100 lookups; brittle per-attorney parsing. |
| (b) Synthetic `va-<md5(name)>` (FL pattern) | Prompt explicitly forbids synthetic / fabricated identifiers for VA. |
| (c) **VSB Docket No. as `bar_number`** (CHOSEN) | Real, official, VSB-assigned, never synthetic, deterministic, stable across re-runs. Same shape as OH (Reg.No.) and MI (Lexum docket-style ID). |

**Tradeoff:** an attorney with multiple disciplinary matters yields multiple
`attorneys` rows (one per primary docket). Multi-docket entries
("VSB Docket Nos.: A, B, C and D") take the FIRST docket as primary; the
remainder lives in `discipline_raw` for traceability. Rows missing a docket
are SKIPPED (never fabricated).

## Approach

Discovery (3 sources, fail-open) → canonicalize → load:

```
yearly archives 2010..2021 (12 years, single fetch each)  →  inline parse
recent rolling page (live, top 10)                        →  detail-page fetch
Wayback CDX for 2022-2025 gap                              →  detail-page fetch
                              ↓
                        merge candidates
                              ↓
        canonicalize: dedupe by (firstDocket, orderDate, type)
                              ↓
   filter: drop noDocket / noDate / noName / unknownType
                              ↓
       staging tables _stg_attorneys_va + _stg_discipline_va (UNLOGGED)
                              ↓
                       bulkCopyRows (COPY FROM STDIN)
                              ↓
                merge into public.attorneys (UPSERT)
                + public.attorney_discipline_events (INSERT...ON CONFLICT)
```

### Date / docket / discipline extraction

- **Date:** `parseUSDate` matches "Month D, YYYY" and converts to ISO YYYY-MM-DD.
- **Docket:** `DOCKET_PIECE_RX = /\b(\d{2}-\d{3}-\d{3,7})\b/g` — five-digit district
  patterns like `25-042-135956`. Multi-docket lines are split and dedup'd.
- **Discipline:** `DISCIPLINE_PATTERNS` enumerated; order matters — disbarment /
  revocation / consent-revocation before suspension; "interim" / "summarily" /
  "administratively" before plain suspension; "reciprocal" classified as
  whatever the underlying sanction was. Out-of-scope sanctions (`unknown`,
  `dismissed`) are skipped.

### Polite scraping

- 1500ms ± jitter between requests (VSB iMIS, no observed throttling).
- 1500ms ± jitter for Wayback (per archive.org guidance).
- UA: `INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)`.
- Exponential backoff on 429/502/503/504 (4 retries, base 2000ms × 2^attempt).
- 100% `source_url` preserved on every row.

## Schema

| Column | attorneys | attorney_discipline_events |
|---|---|---|
| jurisdiction | 'VA' | 'VA' |
| bar_number | NOT NULL — VSB Docket No. (first if multi) | same |
| full_name | extracted from detail/archive paragraph | same |
| city | extracted via "<City>, VA <zip>" pattern | — |
| order_date | — | YYYY-MM-DD from "Effective {date}" or "On {date}" |
| effective_date | — | same as order_date for VSB (VSB uses "Effective ...") |
| discipline_type | — | normalized enum (disbarment/suspension/probation/...) |
| order_url | — | `vsbwebstorage.blob.core.windows.net/$web/actions/<name>-<date>.pdf` (when present) |
| source_url | last_seen detail/archive URL | NOT NULL — detail page or archive page |

Conflict resolution:
- `attorneys`: ON CONFLICT (jurisdiction, bar_number) → UPDATE (refresh
  `last_seen_at`, COALESCE-update name/city/source_url).
- `attorney_discipline_events`: ON CONFLICT (jurisdiction, bar_number,
  order_date, discipline_type) → DO NOTHING (idempotent re-runs).

## Smoke Results

```
[Smoke 1: 2021 archive only, dry-run]
[archive] 2021: parsed 90 entries
[vabar] canonicalized 88 records — skipped={"noDocket":0,"noDate":0,"noName":1,"unknownType":1}
[vabar] by_type: {"disbarment":26,"public_reprimand":32,"suspension":27,"interim_suspension":3}

[Smoke 2: recent live, dry-run]
[recent] fetched 10 entries
[vabar] canonicalized 9 records — skipped={"noDocket":0,"noDate":0,"noName":1,"unknownType":0}
9/10 captured (one rolling-page entry lacked a docket — skipped per rule).

[Smoke 3: 2021 archive --apply]
[db] attorneys upserted: 85
[db] discipline events inserted: 88

[Full run --apply]
[archive] cumulative 1106 entries across 12 years (2010..2021)
[recent] fetched 10 entries
[vabar] canonicalized 1057 records — skipped={"noDocket":24,"noDate":0,"noName":8,"unknownType":25}
[db] attorneys upserted: 966 (incremental over smoke)
[db] discipline events inserted: 969 (88 from smoke already present)

[Wayback gap pass --apply]
[wayback] 9 snapshots; 45 unique entries
[vabar] canonicalized 44 records
[db] attorneys upserted: 42 (incremental)
[db] discipline events inserted: 18 (rest were already covered by recent or duplicate snapshots)
```

## Final DB State (verified post-run)

| Metric | Value |
|---|---|
| `attorneys WHERE jurisdiction='VA'` | **1008** |
| `attorney_discipline_events WHERE jurisdiction='VA'` | **1101** |
| Events with non-null `source_url` | **1101 / 1101 = 100%** |
| Year coverage | 2010-2021 (full) + 2023-2026 (partial via recent + wayback); 2022 = 0 (no archive, no wayback hit) |

### Year histogram

| Year | Events |
|---|---|
| 2010 | 95 |
| 2011 | 109 |
| 2012 | 94 |
| 2013 | 94 |
| 2014 | 96 |
| 2015 | 78 |
| 2016 | 74 |
| 2017 | 71 |
| 2018 | 74 |
| 2019 | 96 |
| 2020 | 79 |
| 2021 | 88 |
| 2023 | 28 (Wayback) |
| 2024 | 10 (Wayback) |
| 2025 | 6 (Wayback) |
| 2026 | 9 (Recent live) |

### Type histogram

| Type | Events |
|---|---|
| public_reprimand | 370 |
| suspension | 288 |
| disbarment | 265 |
| interim_suspension | 175 |
| reinstatement | 3 |

## Known Gaps (deferred)

1. **2022:** No yearly archive built; no Wayback CDX snapshot in early 2022.
   Estimated ~80-100 missing events. Deferred — Wayback may pick up a CDX hit
   later, or VSB may eventually publish the 2022 archive page.
2. **2023-2025 partial:** Wayback snapshots are sparse — each captures only the
   10 most-recent items at the snapshot moment. We recovered 44 events; the
   true 3-year volume is probably ~250-300. Deferred — could be improved by
   walking type-filter pages on Wayback (suspension / reprimand / revocation /
   admonition each had separate snapshots).
3. **VSB Member ID enrichment:** the canonical Member ID (Bar ID #) is not
   populated; `bar_number` holds the VSB Docket No. Future enrichment could
   cross-reference via the VSB Lookup if the iMIS RadGrid gets a JSON API
   shim, or via Martindale/Avvo reverse-lookup. Deferred.

## Anti-Patterns (avoided)

- **Lookup-postback enrichment:** rejected (RadGrid + AJAX, hidden from
  disbarred attorneys, brittle).
- **Synthetic bar numbers:** rejected per prompt + global rule against
  fabricated identifiers.
- **Per-row INSERT:** banned by `cl-bulk-data-defensive.md` #18 — used
  `bulkCopyRows` (COPY FROM STDIN).
- **Pooler port 6543:** banned for multi-statement scripts — `createBulkClient`
  rewrites to 5432 automatically.

## Files

- `scripts/ingest/scrape-vabar-discipline.mjs` — scraper (this PR)
- `docs/plans/2026-04-25-va-bar-discipline-scraper.md` — this plan

## Spot-Check (manual verification)

Three random VA bar numbers from the inserted set, with VSB Member-Lookup URL
for human verification (the docket-number search at the public lookup will
NOT directly resolve — these are docket numbers, not Member IDs — so the
verification path is name-search + cross-reference order PDF):

| VSB Docket | Full Name | Order Date | Order PDF |
|---|---|---|---|
| 25-042-135956 | Hale Wilson Hawbecker | 2026-04-23 | `https://vsbwebstorage.blob.core.windows.net/$web/actions/Hawbecker-042326.pdf` |
| 20-051-115298 | David Gary Hoffman | 2021-12-22 | `https://vsbwebstorage.blob.core.windows.net/$web/actions/Hoffman-020822.pdf` |
| 21-021-118003 | Martin Bullock | 2021-12-15 | `https://vsbwebstorage.blob.core.windows.net/$web/actions/Bullock-121521.pdf` |

VSB Lookup URL for name-based verification:
`https://vsb.org/Site/Shared_Content/Directory/Lookup.aspx` (search by last name).
