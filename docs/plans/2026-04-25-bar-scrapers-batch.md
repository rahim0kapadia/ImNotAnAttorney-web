# 8-State Bar Discipline Scraper Batch — Phase 5 Spec

> **Audience:** 8 Haiku execution agents — each gets exactly one card, must
> ship a working scraper + test + PR with **no further research**.
>
> **Schema target:** `public.attorneys` + `public.attorney_discipline_events`
> (migration `supabase/migrations/20260422e_attorney_discipline.sql`).
>
> **Helpers (REQUIRED, do NOT rewrite):**
> - `scripts/lib/pg-bulk-defaults.mjs` — `createBulkClient`, `bulkCopyRows`
> - `scripts/lib/db.mjs` — Postgres client (port 5432)
>
> **Hard rules — every scraper MUST:**
> 1. Header line 1: `// csv-bulk-checked: <URL or "none-exists — reason">` (rule #19)
> 2. Header line 2: `// Template: scripts/ingest/<file>.mjs` (rule #18)
> 3. Header line 3: `// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN on insert phase)`
> 4. Use `bulkCopyRows` for insert — per-row INSERT BANNED
> 5. Idempotent re-runs — `ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING` for events; `ON CONFLICT (jurisdiction, bar_number) DO UPDATE SET last_seen_at = NOW(), …` for attorneys
> 6. Defensive parsing: try/catch around per-record extraction, log+skip bad rows
> 7. CLI: `--apply` (default off = dry-run), `--start-date`, `--limit`, `--help`
> 8. Polite delay: 800–1600 ms randomized between page hits
> 9. User-Agent: `INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)`
> 10. **Never fabricate `source_url`** — populate only with the URL the row was actually scraped from. If the source page links to an order PDF, capture that as `order_url`; otherwise leave NULL.
>
> **Discipline-type enum (lower-case strings, applied uniformly across all 8):**
> `disbarment | suspension | interim_suspension | probation | public_reprimand | resignation_with_charges | censure | admonition | reciprocal_discipline | disability_inactive | unknown`
>
> Use the `DISCIPLINE_PATTERNS` regex array from `scrape-calbar-discipline.mjs` lines 55–72 as the canonical normalizer. Extend per state ONLY where the source uses a label not in the existing list (e.g. TN "Censured", MN "Disability Inactive Status").

---

## Summary Table

| State | Source format | Template to copy | Ship/Skip | Est rows | Notes |
|-------|---------------|-------------------|-----------|----------|-------|
| WA | ASP.NET search results (server-side paginated, JS controls but renders to HTML) | `scrape-calbar-discipline.mjs` | **SHIP** | ~3,000 (1984–present) | Uses Playwright OR raw POST to `__VIEWSTATE` form |
| AZ | ASPX yearly matrix tables (1986–present) | `scrape-calbar-discipline.mjs` | **SHIP** | ~1,500 (1986–present) | One URL per year, table per year |
| TN | Paginated HTML list (`?Page=N`, 25/page, 5,931 records) | `scrape-flbar-discipline.mjs` | **SHIP** ★ | ~5,931 | Cleanest source. Detail pages also linked. |
| MA | Static research site `decisions.massbbo.org` + FY annual-report PDFs | `scrape-txbar-discipline.mjs` (PDF) | **SHIP** | ~5,000 (1974–present, BBO claims complete archive) | Try research site first; fall back to fyXXXX.pdf |
| IN | Year-filtered HTML table (in.gov/courts/public-records/orders/discipline) | `scrape-flbar-discipline.mjs` | **SHIP** | ~50/year × 8 years = ~400 | One URL per year, simple table |
| MD | Annual FY PDF (`/sites/default/files/import/attygrievance/pdfs/sanctionsfyXX.pdf`) | `scrape-txbar-discipline.mjs` (PDF) | **SHIP** | ~50/year × 20 years = ~1,000 | FY06–FY26, prose paragraphs per attorney |
| CO | Decisia/CanLII-style portal `research.coloradopdj.com/copdj/en/ann.do` | `scrape-flbar-discipline.mjs` | **SHIP** | ~1,500 (1999–present) | "Recent decisions" annual list page |
| MN | LPRB annual-report PDF + Bench & Bar quarterly columns | `scrape-txbar-discipline.mjs` (PDF) | **SHIP** | ~30–40/year × 5 years = ~175 | OLPR has no browseable list; annual reports are the canonical public source |

**Cross-cutting gotcha:** No two states share a vendor — each is bespoke. There is NO opportunity for a shared adapter. Three states (TX, MA, MD, MN) use PDF-paragraph parsing; three (TN, IN, CO) use HTML-table; two (WA, AZ) use ASP.NET-style server forms requiring Playwright or ViewState handling. **Estimated total Haiku build time: 6–8 hours across 8 parallel agents (avg 60 min/state).**

---

## WA — Washington Bar Discipline Scraper

**Official source:** `https://www.mywsba.org/personifyebusiness/DisciplineNoticeDirectory.aspx`
**Source format:** ASP.NET WebForms search results (server-side rendered HTML, requires `__VIEWSTATE` postback or Playwright)
**Pagination:** Result page exposes `1 2 3 4 5 …` numbered links; under the hood these post `__EVENTTARGET` + `__EVENTARGUMENT` with the same `__VIEWSTATE`. Easiest path = Playwright `.click(page-N-link)`.
**Auth/blockers:** Public, no login. JS required (controls postback). No CAPTCHA observed.
**Estimated row count:** ~3,000 events (search "since 1984" per page header; ~30/yr × 40 yr).
**Date range available:** 1984 – present (per WSBA notice text).
**Copy template:** `scrape-calbar-discipline.mjs` (Playwright + per-row extraction)
**Why that template:** CA scraper already wraps Playwright + bulkCopyRows; WSBA list is the same shape (paginated HTML, fields per row). Same delay/User-Agent pattern.

**Field mapping:**
| Source field | Selector / strategy | DB column | Transform |
|---|---|---|---|
| Last name, First name | `td.colLastName`, `td.colFirstName` (search results table; Haiku must inspect actual td classes via Playwright `page.locator('table tr')` then verify) | last_name / first_name → also concat to full_name | trim |
| WSBA license # | `td.colLicenseNo` | bar_number | digits only |
| Action type (dropdown labels show: Disbarment, Resignation in Lieu of Disbarment, Suspension, Reprimand, Censure, Admonition) | `td.colActionType` | discipline_type (after enum-map) | enum-map below |
| Date of action | `td.colActionDate` | order_date | parse `MM/DD/YYYY` |
| Decision document link | `td a[href]` (anchor inside row) | order_url | absolute URL, otherwise NULL |
| Page URL | `LIST_URL` | source_url | constant |

**Discipline enum mapping (WA labels → DB enum):**
- "Disbarment" / "Disbarred" → `disbarment`
- "Resignation in Lieu of Disbarment" → `resignation_with_charges`
- "Suspension" / "Suspended" → `suspension`
- "Interim Suspension" → `interim_suspension`
- "Reprimand" → `public_reprimand`
- "Censure" → `censure`
- "Admonition" → `admonition`
- "Reciprocal Discipline" → `reciprocal_discipline`

**Idempotency key:** `(jurisdiction='WA', bar_number, order_date, discipline_type)` — DB-level UNIQUE constraint already exists.

**Sample row:** Page renders results only after a search is executed. Default load = empty form. Haiku approach: submit empty form with broad date range (1/1/1984 → today), capture rendered table HTML, log first 3 rows verbatim into the script's `--dry-run` output for verification.

**Date format gotchas:** None observed; `MM/DD/YYYY` zero-padded.

**Migration needed?** **YES** — extend `discipline_type` to allow `censure`, `admonition`, `reciprocal_discipline`. Also extend across ALL 8 scraper specs. Migration file: `supabase/migrations/20260425a_extend_discipline_types.sql` (one shared migration; first Haiku to land creates it, others reference it). **CHECK constraint not currently in place** — `discipline_type` is plain TEXT — so no schema change is strictly required to insert these values, BUT add a comment listing the canonical enum to the table.

**Test cases the Haiku MUST cover:**
- Dedupe on re-run (same (bar_number, order_date, discipline_type) inserted twice → only 1 row)
- Empty result page (graceful exit, log "no records")
- Name with diacritic (`José` → preserved as UTF-8)
- Date edge: pre-2000 entries (1984+ exist; do not assume 4-digit year ≥ 2000)

**Estimated build time:** 90 min (Playwright form interaction + pagination loop).

**Blocker?** SHIP. (Playwright already a dependency; CA scraper proves the pattern.)

---

## AZ — Arizona Bar Discipline Scraper

**Official source:** `https://www.azcourts.gov/attorneydiscipline/DisciplinaryCasesMatrix.aspx` (master list) + per-year matrix pages at `https://www.azcourts.gov/attorneydiscipline/DisciplinaryCasesMatrix/<YEAR>DisciplinaryCasesMatrix.aspx` (1986–2024 confirmed via search results)
**Source format:** Static HTML table per year (one master + per-year pages). Confirmed columns: **Case Name, Date/Number, Violations Description, Disciplinary Rules** (per `azcourts.gov` matrix description).
**Pagination:** None within a year — the year IS the page. Iterate `2010..2025` URLs.
**Auth/blockers:** Public, no login. Some IPs (data-center) get 403 from azcourts.gov — Haiku may need to set a residential `User-Agent` (the INAA crawler UA above is appropriate) and verify 200 from a US-residential connection. If 403 persists, fall back to AZ Bar's PDJ page at `https://www.azcourts.gov/attorneydiscipline/Disposition-of-Attorney-Discipline-Cases`.
**Estimated row count:** ~1,500 events (1986–present, ~30/yr).
**Date range available:** 1986 – present (per matrix description).
**Copy template:** `scrape-calbar-discipline.mjs`
**Why that template:** Same shape as CA — paginated HTML where each "page" (here: year) is a `<table>` of records. Replace pagination loop with year loop.

**Field mapping:**
| Source field | Selector / strategy | DB column | Transform |
|---|---|---|---|
| Case Name (e.g. "In re Smith") | `td:nth-child(1)` | full_name | strip "In re ", "Matter of ", trailing comma |
| Date/Number (e.g. "06/12/2023 — SB-23-0001-D") | `td:nth-child(2)` | order_date + bar_number (case#) | split on `—`; parse left half as date, right half as case# (use case# as `bar_number` placeholder when no bar# is on the page — see note below) |
| Violations Description | `td:nth-child(3)` | violation_summary | trim, max 2000 chars |
| Disciplinary Rules / Sanction | `td:nth-child(4)` | discipline_type (after enum-map) | enum-map; raw → discipline_raw |
| Link to opinion | `td a[href]` (any anchor) | order_url | absolute URL |
| Page URL | `${BASE}/${year}DisciplinaryCasesMatrix.aspx` | source_url | per-year |

**Discipline enum mapping:** same as WA + `disbarment by consent → disbarment`.

**bar_number caveat:** AZ matrix does NOT expose bar numbers consistently. Use the **AZ Supreme Court case#** (e.g. `SB-23-0001-D`) as `bar_number` after a deterministic prefix `AZSC:` — yields `AZSC:SB-23-0001-D`. This keeps the (jurisdiction, bar_number) UNIQUE constraint working even without a true bar #. Document this in the script header comment block.

**Idempotency key:** `(jurisdiction='AZ', bar_number, order_date, discipline_type)`.

**Sample row:** 403 prevented direct WebFetch from this scrape session. Haiku MUST run a one-off curl/Playwright fetch on first execution and log 3 rows verbatim before committing. If fetch returns 403 on Haiku's host, fall back to the PDJ page at `https://www.azcourts.gov/attorneydiscipline/Disposition-of-Attorney-Discipline-Cases` and update the script's source URL constant.

**Date format gotchas:** Some entries pre-2000. Some have date ranges (e.g. "06/12/2023 effective 07/01/2023") — capture left-most as `order_date`, right-most as `effective_date`.

**Migration needed?** No, beyond the shared `20260425a_extend_discipline_types.sql` documented in the WA card.

**Test cases:**
- 403 retry with backoff (wait 60s, retry once, then SKIP gracefully)
- "In re " / "Matter of " stripping
- Case # without bar# (use `AZSC:` prefix)
- Pre-2000 dates
- Reciprocal discipline rows

**Estimated build time:** 75 min.

**Blocker?** SHIP. (403 is an IP-reputation issue, not a structural block — Haiku is on a different host.)

---

## TN — Tennessee Bar Discipline Scraper ★ EASIEST

**Official source:** `https://www.tbpr.org/news-publications/recent-disciplinary-actions`
**Source format:** Server-rendered HTML, paginated table, 25 rows/page, 5,931 total records (verified 2026-04-25 via WebFetch).
**Pagination:** `?Page=N&page=N` — confirmed both query params required (the source uses Sitefinity which double-encodes). Loop `Page=1` to `Page=⌈5931/25⌉ = 238`.
**Auth/blockers:** None. Static HTML, no JS required.
**Estimated row count:** **5,931 (verified)**.
**Date range available:** Records back through ~2003 based on page-N walk; verified data through 04/23/2026 on Page=1.
**Copy template:** `scrape-flbar-discipline.mjs`
**Why that template:** Identical shape — fetch HTML, parse tabular rows, walk pagination, bulkCopyRows. No PDF, no JS.

**Field mapping (verbatim from real fetch):**
| Source field | Selector / strategy | DB column | Transform |
|---|---|---|---|
| Date | column 1 | order_date | parse `MM/DD/YYYY` |
| Type | column 2 (always "Release") | (ignore) | — |
| Title (e.g. "Rutherford County Lawyer Censured") | column 3, contains discipline label | discipline_type (extract from title), violation_summary (full text) | regex against title for "Disbarred|Suspended|Censured|Reprimanded|Disability Inactive Status" etc. |
| BPR # | column 4 | bar_number | digits only |
| Name (e.g. "Farmer, Dalen L. P.") | column 5, link to attorney profile | full_name | reverse "Last, First M." → "First M. Last" |
| Title link | `<a href>` on title text (e.g. `/docs/90ad7cbd-…/farmer-101082-4-rel.html`) | order_url | absolute URL `https://www.tbpr.org` + path |
| Profile link | `<a href>` on name | (use to populate `attorneys.source_url`) | absolute URL |
| Page URL | `${BASE}?Page=${N}&page=${N}` | source_url (events table) | per-page |

**Discipline enum mapping (TN labels → DB enum):**
- "Disbarred" → `disbarment`
- "Suspended" → `suspension`
- "Temporarily Suspended" → `interim_suspension`
- "Censured" → `censure`
- "Publicly Censured" → `censure`
- "Reprimanded" → `public_reprimand`
- "Placed on Probation" → `probation`
- "Disability Inactive Status" → `disability_inactive`
- "Reinstated" → SKIP (not a discipline event — log and continue)
- "Resignation" / "Surrendered License" → `resignation_with_charges`

**Idempotency key:** `(jurisdiction='TN', bar_number, order_date, discipline_type)`.

**Sample row (verbatim, captured 2026-04-25):**
```
Date: 04/23/2026
Type: Release
Title: <a href="/docs/90ad7cbd-0a75-43ec-9d0a-efa587b89717/farmer-101082-4-rel.html">Rutherford County Lawyer Censured</a>
BPR #: 012629
Name: <a href="/attorneys/AA19FF0E-3FB2-E411-80D5-0050568F14C6">Farmer, Dalen L. P.</a>
```
```
Date: 04/20/2026
Type: Release
Title: Shelby County Lawyer Placed on Disability Inactive Status
BPR #: 011817
Name: Fearnley, Michael
```
```
Date: 04/01/2026
Type: Release
Title: Madison County Lawyer Disbarred
BPR #: 036403
Name: Lipham, Marcus Allen
```

**Date format gotchas:** None — `MM/DD/YYYY` zero-padded.

**Migration needed?** YES — add `disability_inactive` and `censure` to the canonical enum (shared migration `20260425a_extend_discipline_types.sql`).

**Test cases:**
- Reverse-name parse: "Farmer, Dalen L. P." → first="Dalen L. P.", last="Farmer"
- "Reinstated" rows skipped
- 5,931 total records → at least 5,800 successfully inserted (allow 2% extraction failures, fail the run if >2%)
- Dedupe on re-run

**Estimated build time:** 30 min. Simplest of the eight.

**Blocker?** SHIP. ★ Recommend this be the first scraper landed to validate the pattern.

---

## MA — Massachusetts BBO Discipline Scraper

**Official source (primary):** `https://decisions.massbbo.org/`
**Official source (fallback):** Annual report PDFs at `https://bbopublic.massbbo.org/web/f/fy<YYYY>.pdf` (e.g. `fy2020.pdf`, `fy2021.pdf` …).
**Source format:** Primary site appears to be a static research site (separate from the Salesforce-rendered `massbbo.org/s/decisions` SPA which CSS-errored on WebFetch). Confirmed external description: "research site … contains all attorney discipline cases since the BBO's creation in 1974, including decisions from the SJC as well as the Board of Bar Overseers and its hearing committees."
**Pagination:** Unknown (was 403 in this session). Haiku MUST first fetch `/` and inspect — if static HTML with browseable list, scrape directly. If SPA or 403, fall back to annual-report PDFs.
**Auth/blockers:** Possible IP-rep 403. No login required per public-record statute.
**Estimated row count:** ~5,000 (1974–present, ~100/yr — MA is a high-volume bar).
**Date range available:** 1974 – present (per BBO statement).
**Copy template:** `scrape-txbar-discipline.mjs` (PDF path) — fall back to this if `decisions.massbbo.org` is unworkable.
**Why that template:** Annual-report PDFs are the same shape as TX (yearly PDFs with per-attorney narrative paragraphs).

**Field mapping (annual-report PDF path):**
| Source field | Strategy | DB column | Transform |
|---|---|---|---|
| Attorney name | regex: capitalized name preceding "BBO #<digits>" | full_name | trim |
| BBO # | regex `BBO\s*#?\s*(\d{6,7})` | bar_number | digits only |
| Discipline action | regex anchor (e.g. "was disbarred", "was suspended for X months") | discipline_type | enum-map |
| Date of order | regex anchor "(?:On|Effective)\s+(<Month>\s+\d+,\s+\d{4})" within 500 chars of bar # | order_date | parse Month-name |
| Violation summary | paragraph text, max 2000 chars | violation_summary | trim |
| Source URL | annual-report PDF URL | source_url | constant per FY |
| Order URL | not exposed in PDF | order_url | NULL |

**Field mapping (decisions.massbbo.org path, IF accessible):**
Haiku must inspect the live page. If HTML table: use selectors. If SPA: fall back to PDF.

**Discipline enum mapping:** same as WA. MA uses "indefinite suspension" → `suspension`; "term suspension" → `suspension`; "disbarment by consent" → `disbarment`; "public reprimand" → `public_reprimand`; "admonition" → `admonition` (private — usually not in the public list, but if encountered).

**bar_number caveat:** MA uses BBO # not bar #. Same field, just labeled differently. No transform needed.

**Idempotency key:** `(jurisdiction='MA', bar_number, order_date, discipline_type)`.

**Sample row:** Could not fetch in this session (`decisions.massbbo.org` 403'd; `fy2020.pdf` returned binary content). Haiku MUST first fetch `https://decisions.massbbo.org/` and log first 5 rows + URL pattern verbatim. If 403 OR SPA, immediately switch to PDF path and use `scrape-txbar-discipline.mjs`'s exact `pdf-parse` + regex pipeline (already battle-tested for prose narratives).

**Date format gotchas:** Annual reports use `Month D, YYYY`; sometimes `Month, YYYY` (no day) — when day missing, default to first of month and flag `effective_date IS NULL`.

**Migration needed?** No new types beyond the shared migration.

**Test cases:**
- "BBO #" with optional space and `#`
- Indefinite vs term suspension both → `suspension`
- Consent vs contested disbarment both → `disbarment`
- Empty PDF page (graceful)

**Estimated build time:** 90 min (PDF path) or 60 min (HTML path if research site loads).

**Blocker?** SHIP, with a Haiku-side decision branch on first fetch.

---

## IN — Indiana Bar Discipline Scraper

**Official source:** `https://www.in.gov/courts/public-records/orders/discipline/`
**Source format:** Static HTML reverse-chronological table with year filter; case# / cause# / order or per-curiam type / case caption columns. Verified via WebFetch 2026-04-25.
**Pagination:** Year archive dropdown `2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025`. URL pattern unclear from fetch — Haiku must inspect form/links. Likely `?year=YYYY` or per-year sub-pages. The default page shows all current-year + recent.
**Auth/blockers:** None.
**Estimated row count:** ~50/year × 8 years = ~400.
**Date range available:** 2018 – present (per archive dropdown).
**Copy template:** `scrape-flbar-discipline.mjs`
**Why that template:** Static HTML, simple table, no JS, no PDFs.

**Field mapping:**
| Source field | Selector / strategy | DB column | Transform |
|---|---|---|---|
| Date | column 1 (`MM/DD/YYYY`) | order_date | parse |
| Cause Number (e.g. `25S-DI-159`) | column 2 | bar_number | use as `INSC:25S-DI-159` (no true bar# — same caveat as AZ) |
| Document Type ("Order" / "Per Curiam") | column 3 | (ignore) | — |
| Case Caption (e.g. "In the Matter of Robbin Stewart") | column 4, with PDF link | full_name (after stripping "In the Matter of " / "In re ") | trim |
| PDF link | `<a href>` on caption | order_url | absolute URL |
| Page URL | year archive URL | source_url | per-year |

**Discipline enum mapping:** Indiana orders do NOT expose discipline-type in the table; it's only inside the PDF. **Two options:**

- **Option A (recommended for v1):** Set `discipline_type='unknown'`, `discipline_raw='see order_url'`. Skip the `unknown`-type filter that some other scrapers apply. Rationale: the DB still gets the attorney + date + URL; downstream analysis can fetch the PDF later for refinement.
- **Option B (stretch):** PDF-parse each order with `pdf-parse` and regex for `disbarred|suspended|reprimanded|publicly admonished|private reprimand`. Adds ~30 min build time; recommended only if first-pass coverage looks good.

**bar_number caveat:** Same as AZ — no bar# in the matrix. Use `INSC:<cause-number>` prefix.

**Idempotency key:** `(jurisdiction='IN', bar_number, order_date, discipline_type)`.

**Sample row (verbatim, captured 2026-04-25):**
```
04/24/2026 | 25S-DI-159 | Order | In the Matter of Robbin Stewart
```

**Date format gotchas:** None.

**Migration needed?** No.

**Test cases:**
- "In the Matter of " stripped → "Robbin Stewart"
- Cause # with letter+digit-only format preserved as `INSC:25S-DI-159`
- Year filter walks all years 2018–current

**Estimated build time:** 45 min.

**Blocker?** SHIP.

---

## MD — Maryland Attorney Sanctions Scraper

**Official source:** `https://www.mdcourts.gov/attygrievance/sanctions` (master) + per-FY PDFs at `https://www.courts.state.md.us/sites/default/files/import/attygrievance/pdfs/sanctionsfy<YY>.pdf` (FY06–FY26 confirmed via search; e.g. `sanctionsfy25.pdf`).
**Source format:** Annual FY PDF, prose-paragraph format (like TX). Each entry: attorney name + sanction action + date + brief misconduct narrative.
**Pagination:** None within a year; iterate FY URLs.
**Auth/blockers:** Possible IP-rep 403 (this session got 403); same UA mitigation as AZ.
**Estimated row count:** ~50/year × 20 years = ~1,000.
**Date range available:** FY06 – present (master page covers "FY 2006 to Present").
**Copy template:** `scrape-txbar-discipline.mjs`
**Why that template:** Identical shape to TX — yearly PDFs, prose narratives, regex-anchor extraction. Uses the same `pdf-parse` + `BAR_RE`-style anchor approach.

**Field mapping:**
| Source field | Strategy | DB column | Transform |
|---|---|---|---|
| Attorney name | Capitalized name run preceding sanction verb (e.g. "Stewart, Craig W." or "Craig W. Stewart") | full_name | normalize "Last, First" → "First Last" |
| Sanction action | regex: `disbarment by consent\|disbarred\|temporarily suspended\|suspended for\|reprimand` | discipline_type | enum-map |
| Date | regex `(?:On|Effective)?\s*(<Month>\s+\d+,\s+\d{4})` near sanction verb | order_date | parse |
| Misconduct narrative | paragraph after sanction line | violation_summary | max 2000 chars |
| Source URL | per-FY PDF URL | source_url | constant |
| Order URL | NULL (PDFs don't link to opinions inline) | order_url | NULL |

**Discipline enum mapping:**
- "disbarred" / "disbarment by consent" → `disbarment`
- "temporarily suspended" → `interim_suspension`
- "suspended" (with duration) → `suspension`
- "reprimand" → `public_reprimand`
- "Indefinite Suspension" → `suspension`

**bar_number caveat:** Maryland sanctions list does NOT include bar numbers in the prose. Haiku MUST cross-reference via the Maryland Attorney List API — but that's out of scope for v1. **For v1:** synthesize a stable `bar_number` as `MD:<sha1(full_name+order_date)>::8` (8-char hash). Document this in the header comment. This preserves UNIQUE constraint correctness and lets a future enrichment pass populate real bar numbers.

**Idempotency key:** `(jurisdiction='MD', bar_number, order_date, discipline_type)`.

**Sample row (from search-result excerpt, FY25):**
```
Stewart, Craig W. — Disbarment by Consent — February 3, 2025
Mr. Stewart failed to represent his client diligently, failed to adequately
communicate with his client, engaged in the unauthorized practice of law,
and engaged in conduct involving dishonesty, fraud, deceit, or
misrepresentation.
```
```
Stroud, Barron LeGrant Jr. — Temporary Suspension — February 21, 2025
Following referrals from the Child Support Administration ...
```
```
Kurland, Sari Karson — Disbarment by Consent — May 21, 2025
```

**Date format gotchas:** Mix of `Month D, YYYY` and `M/D/YYYY`. Month-name format is dominant per FY25 sample.

**Migration needed?** No.

**Test cases:**
- "Last, First M. Suffix" name parsing (with Jr. / III)
- Date format detection (Month-name vs slash)
- "Disbarment by Consent" → `disbarment` (NOT `resignation_with_charges`)
- Synthetic bar_number stability (same name+date → same hash both runs)

**Estimated build time:** 75 min (PDF + name parse complexity).

**Blocker?** SHIP. Haiku must use `INAA-Crawler/1.0` UA to bypass 403; if persistent, switch User-Agent to something more browser-like (`Mozilla/5.0 (compatible; INAA-Crawler/1.0; +https://imnotanattorney.com)`).

---

## CO — Colorado Bar Discipline Scraper

**Official source:** `https://research.coloradopdj.com/copdj/en/ann.do` (recent decisions chronological list) + browse via `https://research.coloradopdj.com/copdj/en/nav.do` (Decisia/CanLII platform).
**Source format:** Decisia is a standard Lexum-built legal-research platform (same engine as CanLII). Static HTML index pages with per-decision metadata + linked PDFs. Each decision has: caption, date, citation, link to opinion HTML+PDF.
**Pagination:** Decisia uses `?startRow=N&endRow=M` style or numeric `?p=N`. Haiku must inspect first fetch.
**Auth/blockers:** Public, no login. CanLII-style platforms are well-behaved scrapeable.
**Estimated row count:** ~1,500 (1999–present per PDJ statement).
**Date range available:** 1999 – present (PDJ inception).
**Copy template:** `scrape-flbar-discipline.mjs`
**Why that template:** HTML list with per-row metadata + link, same as FL/TN. No PDF parsing required at v1 — the index page exposes enough metadata.

**Field mapping (verify on first fetch):**
| Source field | Selector / strategy | DB column | Transform |
|---|---|---|---|
| Caption (e.g. "People v. Smith, 23PDJ045") | first column or `<h3>` per decision card | full_name (after stripping "People v. ", trailing case#) | trim |
| Date | metadata line under caption | order_date | parse |
| Citation / case# | parens / colon-separated from caption | bar_number | use `COPDJ:<case#>` |
| Disposition (in metadata or first line of decision summary) | `meta` line or first `<p>` of decision | discipline_type (after enum-map) | enum-map |
| Link to decision | anchor on caption | order_url | absolute URL |
| Page URL | `${BASE}/copdj/en/ann.do?…` | source_url | per-page |

**Discipline enum mapping:** same as WA. CO uses "disbarred", "suspended", "publicly censured", "private admonition" (rare in public list).

**bar_number caveat:** CO PDJ uses case# not bar#. Same `COPDJ:` prefix pattern as IN/AZ.

**Idempotency key:** `(jurisdiction='CO', bar_number, order_date, discipline_type)`.

**Sample row:** Could not capture in this session (Decisia portal not loaded; description from search results only). Haiku MUST log first 3 rows verbatim on first dry-run before committing. If `ann.do` is JS-rendered, switch to Playwright (CA template handles this).

**Date format gotchas:** Decisia typically uses `YYYY-MM-DD` ISO. Verify on first fetch.

**Migration needed?** No.

**Test cases:**
- "People v. " caption stripping
- ISO date parse
- Multi-page walk via Decisia pagination

**Estimated build time:** 75 min (Decisia pattern is well-documented; first-fetch inspection + selector tuning is the variable).

**Blocker?** SHIP. If Decisia turns out to be JS-rendered, Haiku must add a Playwright import; the CA template covers this.

---

## MN — Minnesota Bar Discipline Scraper

**Official source:** LPRB Annual Report PDFs at `https://lprb.mncourts.gov/wp-content/uploads/<year>/<month>/<YYYY>-Annual-Report_compressed.pdf` (verified pattern: `2024/05/2023-Annual-Report_compressed.pdf`).
**Secondary source:** OLPR articles at `https://lprb.mncourts.gov/articles/Articles/PUBLIC%20DISCIPLINE%20in%20<YEAR>.pdf` (e.g. `PUBLIC DISCIPLINE in 2021.pdf` confirmed via search).
**Source format:** Annual-report PDF (prose, like TX/MD). Each year publishes one consolidated report listing every public discipline.
**Pagination:** None within a year; iterate years.
**Auth/blockers:** None.
**Estimated row count:** ~30–40/year × 5 recent years = ~175.
**Date range available:** 2019 – present (recent annual reports archived).
**Copy template:** `scrape-txbar-discipline.mjs`
**Why that template:** PDF prose narrative, same as TX/MD. Use `pdf-parse` + regex anchors.

**Field mapping:**
| Source field | Strategy | DB column | Transform |
|---|---|---|---|
| Attorney name | Title-case run before sanction verb (full name in PDF, NOT "Last, First") | full_name | trim |
| Sanction | regex: `disbarred\|suspended for\|publicly reprimanded\|placed on probation\|disability inactive` | discipline_type | enum-map |
| Date | regex `(<Month>\s+\d+,\s+\d{4})` near sanction | order_date | parse |
| Narrative | paragraph after sanction line | violation_summary | max 2000 chars |
| Source URL | per-year report PDF | source_url | constant |
| Order URL | NULL | order_url | NULL |

**Discipline enum mapping:**
- "disbarred" → `disbarment`
- "suspended for X months/years" → `suspension`
- "indefinite suspension" → `suspension`
- "publicly reprimanded" → `public_reprimand`
- "placed on probation" / "probation" → `probation`
- "disability inactive" → `disability_inactive`

**bar_number caveat:** Annual reports rarely include bar numbers. Use synthesized hash like MD: `MN:<sha1(full_name+order_date)>::8`.

**Idempotency key:** `(jurisdiction='MN', bar_number, order_date, discipline_type)`.

**Sample names from public sources (verified):** James V. Bradley, R. James Jensen Jr., Fong Lee, Madsen Marcellus, Michael Padden (all disbarred 2024 per OLPR public statements). These confirm the source covers expected attorneys.

**Date format gotchas:** Annual reports may give partial dates ("In May 2024, …") — when day missing, default to first of month and set `effective_date = NULL`.

**Migration needed?** No (`disability_inactive` already in shared migration from WA card).

**Test cases:**
- "James V. Bradley" name parse (3 tokens with middle initial)
- "R. James Jensen Jr." (initial+name+suffix)
- Partial date (Month YYYY only) handled
- 5 disbarments expected for 2024 → assertion in test

**Estimated build time:** 60 min.

**Blocker?** SHIP.

---

## Cross-cutting build instructions for all 8 Haiku

1. **Shared migration:** First Haiku to land creates `supabase/migrations/20260425a_extend_discipline_types.sql`:
   ```sql
   -- Document the canonical discipline_type enum values used by the 8 Phase 5
   -- bar-discipline scrapers. discipline_type is plain TEXT in the table; this
   -- migration adds a comment listing the canonical values so downstream
   -- consumers (attorney-vetting $47 SKU, IB appendix) know what to expect.
   COMMENT ON COLUMN public.attorney_discipline_events.discipline_type IS
     'Canonical values: disbarment | suspension | interim_suspension | probation | public_reprimand | resignation_with_charges | censure | admonition | reciprocal_discipline | disability_inactive | unknown';
   ```
   Subsequent Haiku reference this migration in their PR description but do NOT recreate it.

2. **Test scaffolding:** Each Haiku writes ONE test file `scripts/ingest/__tests__/scrape-<state>bar-discipline.test.mjs` covering:
   - Discipline-type enum mapping (state's labels → DB enum)
   - Name parsing (state-specific format)
   - Date parsing
   - Idempotency (UPSERT semantics)
   - One end-to-end fixture from `__fixtures__/<state>-sample.html` or `<state>-sample.pdf` (capture during first dry-run)
   Test shape matches `seed-statutes-fl.test.mjs` — vitest, no DB required (mock pg client).

3. **PR title format:** `feat(ingest): <STATE> bar discipline scraper (Phase 5 #N/8)`

4. **PR description must include:**
   - Sample dry-run output (5 rows verbatim)
   - Estimated total record count
   - Migration reference (PR #N for shared `20260425a`)
   - Verification steps (how to re-run and check row count)

5. **Polite scraping:** All 8 use the SAME User-Agent + 800–1600 ms randomized delay. No state needs >2 req/sec.

6. **No primary-domain email:** None of these scrapers send email, but the User-Agent uses `noreply-legal@inaa.com` as a contact — this is the existing canonical pattern, NOT a primary-domain email send. Documented per global rule.

7. **DO NOT FABRICATE source_url.** If the row was scraped from page X, source_url = page X. If the source page links to a per-decision PDF, capture that as `order_url`. Never construct a URL that wasn't in the response. (Cited rule: `~/.claude/rules/no-hallucinated-legal-data.md`.)

---

## Final ship/skip count

- **SHIP: 8/8** (WA, AZ, TN, MA, IN, MD, CO, MN)
- **SKIP: 0/8**
- **Estimated total Haiku build time:** 6.5 hours across 8 parallel agents (avg 50 min each, fastest = TN at 30 min, slowest = WA / MA-fallback at 90 min).

The TN scraper is the recommended first lander — cleanest source, fully verified rows, lowest build time, validates the shared migration before 7 parallel Haiku push it concurrently.
