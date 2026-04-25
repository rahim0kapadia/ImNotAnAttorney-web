# Ohio Bar Discipline Scraper — Plan

**Date:** 2026-04-24
**Branch:** `feat/oh-bar-discipline`
**Owner:** Atlas
**Status:** EXECUTING (resumed 2026-04-24 after CL rate-limit on prior attempts)

CASCADE:
- us: Adds OH (5th-largest bar) to attorney_discipline_events; powers Attorney-Vetting $47 SKU expansion → CA/FL/TX/NY → OH coverage at zero marginal infra cost (re-uses bulkCopyRows + staging-table pattern from PA/FL/TX scrapers).
- direct counterparty (criminal defendants in OH): get evidence-based attorney vetting before retaining counsel — discipline history was previously only accessible by phone-calling Disciplinary Counsel.
- downstream (defendants' families): same — multiplies by ~3x reach since one defendant decision affects family financial planning.
- ecosystem (Ohio Supreme Court / ODC): public-record data already published; we just index it. No additional load beyond polite-rate fetch (1-2s/req).
- future-us: pattern proven across 5 jurisdictions (CA/FL/TX/PA/IL/MI/OH) → next bar drops to ~2-hour build.
- adjacent (other states' bar associations): if they want better attribution traffic, the public-disclosure transparency pattern is already there.

## Objective

Load 300+ Ohio attorney discipline events into `public.attorneys` + `public.attorney_discipline_events` with `jurisdiction='OH'`. Real Ohio Attorney Registration Numbers (Reg. No.). 100% source_url coverage.

## Source Discovery (probed 2026-04-24)

| Surface | URL | Notes |
|---|---|---|
| ODC listing (HTML) | `https://odc.ohio.gov/recent-disciplinary-decisions/page/{N}/` | 11 pages × ~20 entries = ~220 cases, 2019-04 → 2026-04. Wix-rendered; titles + dates only on listing. |
| CourtListener API | `https://www.courtlistener.com/api/rest/v4/search/?type=o&court=ohio&q="disciplinary+counsel"+OR+"bar+assn"+OR+"bar+association"` | 1,800+ Ohio Supreme Court discipline opinions 2014-2026 with rich syllabus + neutralCite + ROD download_url. PRIMARY. |
| Slip Opinion PDFs | `https://www.supremecourt.ohio.gov/rod/docs/pdf/0/{year}/{year}-Ohio-{N}.pdf` | Per-curiam opinions — contain Reg. No., sanction, county. |

**Strategy:** CourtListener-first (token-authed, rate-limit aware with exponential backoff), then ODC listing for fresh cases not yet ingested by CL (~7-day lag). PDF parse via pdf-parse (PA/TX template).

`csv-bulk-checked: none-exists — Ohio Supreme Court publishes no discipline bulk CSV`.

## Approach

Discovery → enrichment → load:

```
CL search (token, paged, exp backoff on 429/503)  →  caseName + neutralCite + opinions[].download_url
ODC listing pages 1-11  →  slug → "{year}-Ohio-{n}" → ROD URL
                         ↓
                 dedupe by pdfUrl
                         ↓
   pdf-parse → extract Reg. No., sanction, decided date, city
                         ↓
   filter: drop unknown sanction / no Reg. No. / no order_date
                         ↓
   staging tables (UNLOGGED) → bulkCopyRows
                         ↓
   merge into public.attorneys + attorney_discipline_events
```

### Reg. No. extraction

Ohio Supreme Court PDFs use:
- `Attorney Registration No. NNNNNNN`
- `Reg. No. NNNNNNN`
- `[#NNNNNNN]` (rare, older format)

Reg. Nos. are 7 digits, optionally with leading zero. Pattern: `/(?:Attorney\s+Registration\s+No\.?|Attorney\s+Reg\.?\s*No\.?|Reg\.?\s*No\.?\s+|registration\s+number)\s*[:#]?\s*(\d{4,8})/i`.

### Sanction extraction

DISCIPLINE_PATTERNS scan the back 4000 chars of the PDF (per-curiam ends with judgment) and fall back to first 6000 chars if needed. Order: disbarment → resignation_with_charges → interim/temporary/emergency suspension → indefinite/regular suspension → probation → public reprimand/censure.

### Polite scraping

- 1-2s randomized delay between PDF fetches.
- 0.8s between CL pages.
- 1s between ODC listing pages.
- UA: `INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)`.
- Exponential backoff on CL 429/503/502 (5 retries, base 2000ms × 2^attempt).
- All file URLs preserved on each row → 100% `source_url` coverage.

## Schema

| Column | attorneys | attorney_discipline_events |
|---|---|---|
| jurisdiction | 'OH' | 'OH' |
| bar_number | NOT NULL — real 7-digit Reg. No. | NOT NULL — real 7-digit Reg. No. |
| full_name | extracted from PDF or case style | extracted from PDF or case style |
| city | extracted via "of {City}, Ohio" pattern | — |
| order_date | — | NOT NULL (PDF "Decided" date or CL dateFiled) |
| discipline_type | — | one of enum (drop unknowns) |
| source_url | PDF URL | PDF URL |
| violation_summary | — | first 500 chars of CL syllabus or PDF discipline_raw |

UNIQUE constraints honored:
- attorneys: `(jurisdiction, bar_number)` — `ON CONFLICT (j, bn) DO UPDATE`.
- attorney_discipline_events: `(jurisdiction, bar_number, order_date, discipline_type)` — `ON CONFLICT DO NOTHING`.

Staging tables: `_stg_attorneys_oh`, `_stg_discipline_oh` (UNLOGGED, dropped on completion per cl-bulk-data-defensive #8).

## Hard constraints honored

- `pdf-parse` import via `createRequire` (matches TX template). pdf-parse is in node_modules.
- Rows missing Reg. No. SKIPPED (NOT synthesized). Counter logged.
- Rows missing order_date SKIPPED.
- Rows with `discipline_type='unknown'` SKIPPED (rather than persisting noise).
- All inserts via `bulkCopyRows` — no per-row INSERT loops (cl-bulk-data-defensive #18).
- Session settings inherited from `createBulkClient`: statement_timeout=30min, idle_in_transaction=5min, tcp_keepalives.
- Port 5432 (session mode) inherited via `rewriteToSessionPort`.

## CLI

```
node --env-file=.env.local scripts/ingest/scrape-ohbar-discipline.mjs                            # dry-run, full corpus
node --env-file=.env.local scripts/ingest/scrape-ohbar-discipline.mjs --apply                    # write
node --env-file=.env.local scripts/ingest/scrape-ohbar-discipline.mjs --max-pages 1 --apply      # smoke (~50 rows)
node --env-file=.env.local scripts/ingest/scrape-ohbar-discipline.mjs --skip-odc --apply         # CL-only
```

## Verification

```sql
SELECT count(*) events, count(DISTINCT bar_number) attorneys, min(order_date), max(order_date)
  FROM attorney_discipline_events WHERE jurisdiction='OH';

SELECT count(*) total,
       count(source_url) FILTER (WHERE source_url IS NOT NULL AND source_url<>'')::int has_url
  FROM attorney_discipline_events WHERE jurisdiction='OH';

SELECT discipline_type, count(*) FROM attorney_discipline_events
  WHERE jurisdiction='OH' GROUP BY discipline_type ORDER BY count(*) DESC;
```

HEAD-check 1 source_url via curl + INAA UA before commit.

## Exit Criteria

- `jurisdiction='OH'` events ≥ 300
- 100% source_url populated
- bar_number is real Reg. No. (3-row spot-check via OHSC AttorneySearch lookup)

## Out of Scope

- BPC online docket / pending cases (different schema)
- Civil opinions (filtered: case style must contain "Disciplinary Counsel" / "Bar Assn" / "Bar Association")
- Other jurisdictions (only OH this branch)
- Reinstatement petitions (out of scope — original sanction event already captured)

## Risks

- **Rate limiting (mitigated).** Prior 2 attempts hit CL rate-limit mid-run. v3 has exponential backoff on 429/503/502 (5 retries, 2s base × 2^attempt). 0.8s between CL pages.
- **PDF parse fragility.** ROD opinions span 1992-2026 with format drift. Mitigation: multiple Reg. No. regex variants; SKIP-and-log when no match.
- **PDF text noise.** Per-curiam opinions begin with "Cite as ...". Reg. No. typically appears once on first page near attorney name.

## Status Log

- 2026-04-24: plan written, source mapping confirmed via WebFetch.
- 2026-04-24: scraper implemented; smoke run pending.
- 2026-04-24: prior 2 attempts rate-limited, no commits / no DB writes.
- 2026-04-24: resumed — re-running smoke to confirm extractor works post-pause.
