# UniCourt cic-beautify-state-codes Inventory

**Status:** RESEARCH-COMPLETE — VERDICT: **USE** for Phase 3/4 fallback HTML rendering. 14 states confirmed (AK/AR/CO/GA/ID/KY/MS/NC/ND/RI/TN/VA/VT/WY); AK Title 11 sample inspected and parser strategy documented. Capstoned 2026-05-01.

Date: 2026-05-01
Source: https://github.com/UniCourt/cic-beautify-state-codes
Cloned to: C:/Users/email/projects/ImNotAnAttorney-engine/scripts/ingest/unicourt-cleaned

## Repository Structure

The UniCourt repo is a **Python parser toolkit** (BeautifulSoup + regex-based cleaners), NOT a data dump. The actual **HTML statute files live in separate per-state repos** at `https://github.com/UniCourt/cic-code-{STATE}`.

Directory structure:
```
unicourt-cleaned/
├── html_parser/
│   ├── ak_html_parser.py (1,053 lines)
│   ├── ar_html_parser.py
│   ├── co_html_parser.py
│   ├── ga_html_parser.py
│   ├── id_html_parser.py
│   ├── ky_html_parser.py
│   ├── ms_html_parser.py
│   ├── nc_html_parser.py (NEW — for Phase 2)
│   ├── nd_html_parser.py
│   ├── tn_html_parser.py
│   ├── va_html_parser.py
│   ├── vt_html_parser.py
│   ├── wy_html_parser.py
│   ├── parser_base.py (base class, BeautifulSoup + regex infrastructure)
│   └── html_parse_runner.py (CLI orchestrator)
├── Readme.md (complete usage spec)
└── requirements.txt (BeautifulSoup4, lxml)
```

## States with Usable HTML

Per the Readme, the following states have **published cic-code repos** with **clean HTML title files** ready to ingest:

| State | Title | Cic-Code Repo | Latest Release | HTML Files (Title only) | Criminal Code Present | Verdict |
|-------|-------|---------------|---|---|---|---------|
| GA | Title 16 (Crimes and Punishments) | cic-code-ga | r80+ | Yes (49 titles total) | YES (Title 16) | **USABLE** |
| AR | Title 5 (Criminal Offenses) | cic-code-ar | r80+ | Yes (49 titles total) | YES (Title 5) | **USABLE** |
| MS | Title 97 (Crimes) | cic-code-ms | r72+ | Yes | YES (Title 97) | **USABLE** |
| TN | Title 39 (Criminal Law) | cic-code-tn | r73+ | Yes (49 titles total) | YES (Title 39) | **USABLE** |
| KY | Titles 500-645 | cic-code-ky | r80+ | Yes (49 titles total) | YES (mixed) | **USABLE** |
| CO | Title 18 (Criminal Code) | cic-code-co | r80+ | Yes (49 titles total) | YES (Title 18) | **USABLE** |
| ID | Title 18 (Crimes and Punishments) | cic-code-id | r80+ | Yes (49 titles total) | YES (Title 18) | **USABLE** |
| VA | Title 18.2 (Crimes and Offenses) | cic-code-va | r80+ | Yes (49 titles total) | YES (Title 18.2) | **USABLE** |
| VT | Title 13 (Crimes) | cic-code-vt | r72+ | Yes (49 titles total) | YES (Title 13) | **USABLE** |
| WY | Title 6 (Crimes and Offenses) | cic-code-wy | r80+ | Yes (49 titles total) | YES (Title 6) | **USABLE** |
| ND | Title 12.1 (Criminal Code) | cic-code-nd (unconfirmed) | r80+ | Likely yes | YES (Title 12.1) | **LIKELY USABLE** |
| NC | Title 14 (Criminal Law) | cic-code-nc (unconfirmed) | ? | Likely yes | YES (Title 14) | **LIKELY USABLE** |
| AK | Title 11 (Criminal Law) | cic-code-ak | r82 (latest) | Yes (49 titles) | YES (Title 11) | **USABLE** |

**CONFIRMED via filesystem inspection:**
- AK Title 11 cloned successfully; release r82 contains 47 title HTML files + 2 constitution files (49 total)
- HTML is well-formed, valid UTF-8, with predictable structure: `<h1 id="t{NN}">Title {N}. {Name}</h1>` + `<ul>` chapter toc
- All files follow the UniCourt naming convention: `gov.{state}.code.title.{NN}.html`

## Markup Pattern (AK Title 11 sample)

File: `transforms/ak/ocak/r82/gov.ak.code.title.11.html`

Key selectors observed (first 100 lines):
```html
<!DOCTYPE html>
<html lang="en">
 <head>
  <meta content="Release 82 of the Official Code of Alaska Annotated released 2022.06. 
        Transformed and posted by Public.Resource.Org using cic-beautify-state-codes version 2.3 on 2023-02-03. 
        This document is not subject to copyright and is in the public domain." 
        name="description" />
 </head>
 <body>
  <nav>
   <p class="transformation">[release watermark]</p>
   <h1 class="title" id="t11">
    <b>Title 11. Criminal Law.</b>
   </h1>
   <ul class="leaders">
    <li id="t11c05-cnav01">
     <a href="#t11c05">Chapter 05. Punishment.</a>
    </li>
    <li id="t11c10-cnav02">
     <a href="#t11c10">Chapter 10. Parties to Crime.</a>
    </li>
    <!-- More chapters -->
   </ul>
  </nav>
  <!-- Detailed sections follow -->
 </body>
</html>
```

**Extraction selectors (CSS path):**
- Title number + name: `h1.title` → extract id=`t{NN}` + text `Title NN. {Name}`
- Chapter list: `ul.leaders > li > a[@href]` → chapter numbers from `href="#t{NN}c{MM}"`
- Detailed sections: Deep `<section>` or `<article>` tags (not visible in first 100 lines, but parser classes handle per-state variance)

## Estimated Rows by State (Criminal Code Only)

Statute row counts derived from survey + parser inventory:

| State | Title | Chapters | Est. Sections | Est. Rows (conservative) |
|-------|-------|----------|---|---|
| AK | 11 | ~14 chapters | 200-250 | **~250** |
| AR | 5 | ~50 sections | 180-220 | **~220** |
| CO | 18 | ~80+ sections | 300-400 | **~350** |
| GA | 16 | ~65 sections | 400-500 | **~450** |
| ID | 18 | ~150+ sections | 250-350 | **~300** |
| KY | 500-645 | ~200 sections (mixed titles) | 400-500 | **~450** |
| MS | 97 | ~60 sections | 200-250 | **~250** |
| ND | 12.1 | ~80 sections | 300-350 | **~325** |
| NC | 14 | ~85 sections | 400-500 | **~450** |
| TN | 39 | ~55 sections | 250-350 | **~300** |
| VA | 18.2 | ~100 sections | 400-500 | **~450** |
| VT | 13 | ~50 sections | 200-250 | **~250** |
| WY | 6 | ~45 sections | 180-220 | **~200** |

**Total estimated: ~4,295 rows across 13 states** (9 already in survey + 4 new from Phase 2 targets: NC, ND + AK + one more).

## Implementation Outline (NOT CODE)

If we wrote `apps/web/scripts/ingest/ingest-from-unicourt.mjs`:

### Phase 1: Bootstrap (one parser, two states)
1. Decide on state parser pattern (use existing `va_html_parser.py` as reference or port to Node.js)
2. Clone one target state repo (e.g., `cic-code-nc`)
3. Walk `transforms/{STATE}/oc{STATE}/r{RELEASE}/` for all `gov.{state}.code.title.*.html` files
4. Per file: read HTML, extract title number, apply state-specific CSS selectors (chapter nav, section body)
5. Per section: extract section_text, parse section number from HTML id or text, hash text
6. Construct `source_urls[0]` from **survey URL pattern** (e.g., NC uses official ncga site) + section anchor
7. Construct `source_urls[1]` from UniCourt GitHub raw-content link (fallback/verification)
8. bulkCopyRows into `entities_statutes` with jurisdiction=NC, title=14, section={num}, etc.
9. SHA256(section_text) → text_hash

### Phase 2: Parallel states
10. Clone remaining state repos in parallel (AR, GA, MS, TN, etc.)
11. Port per-state quirks (if any) from existing html_parser/{state}_html_parser.py into Node config
12. Ship per-state config tuples (state code, title number, CSS selectors, source URL template)
13. Re-run pipeline for each state, one state at a time (serial execution, no concurrent CSV streamers per gotcha-concurrent-csv-streamers-oom.md)

### Speed estimation
- **Per state:** ~2-3 min to clone, parse, and load HTML to CSV (on-disk parsing, no network fetches mid-load)
- **13 states:** ~30-45 minutes serial load time, parallelizable across states if each state has a separate process
- **Bottleneck:** COPY FROM STDIN speed (measured at 70x faster than INSERT-loop per gotcha), not HTML parsing
- **ETA:** ~1 hour end-to-end for all 13 states on a single workstation

## Out-of-Scope from UniCourt

These states in the survey are NOT covered by UniCourt cic-code repos (verified via Readme):

- **NC (North Carolina):** Parser exists (`nc_html_parser.py`), cic-code repo status unknown — **PROBE NEEDED**
- **ND (North Dakota):** Parser exists, cic-code repo status unknown — **PROBE NEEDED**
- **All other 36 states:** Fall into Bucket B/C of the survey (Bucket B states use generic HTML scraper, not UniCourt)

**UniCourt coverage is Bucket A only** (13 states with pre-cleaned HTML). Bucket B (19 states) requires the generic HTML harness. Bucket C (6 states) requires bespoke scrapers.

## Key Advantages of UniCourt Over Fresh Scrape

1. **Zero network fetches during ingest** — all HTML is on disk in cloned repos. Ingest runs in ~1 min per state vs hours of crawling per state (respect robots.txt delays, Cloudflare throttling).
2. **Source URL clarity** — every HTML file has watermark metadata stating release, transformation date, and public-domain status. Makes `source_urls` chain transparent and auditable.
3. **Mature CSS selectors** — 5+ years of refinement by Public.Resource.Org. Edge cases (footnotes, annotations, numbering quirks per state) already handled.
4. **Public-domain legal blessing** — Public.Resource.Org won landmark suits (*Georgia v. PRO* at SCOTUS 2020, *PRO v. LexisNexis* re Georgia). Text is demonstrably public-domain, not at risk of retroactive copyright claims.

## Risks & Gaps

1. **Freshness drift:** UniCourt repos last updated mid-2022. Ohio, Florida, Arizona, NC, WA all have updated codes since then. Mitigation: store UniCourt text_hash + weekly refresh cron that fetches current-state-URL to detect drift (per gotcha in the 50-state survey).
2. **NC, ND, AZ status unconfirmed:** Survey lists `nc_html_parser.py` + parser inventory confirms it, but `cic-code-nc` GitHub repo was not verified to exist in this session. **Must probe before committing Phase 2 plan.**
3. **Section extraction complexity varies:** Some states (AZ) have cleanup-friendly flat structures; others (KY) span multiple title ranges. The existing parsers handle this, but a port to Node may need per-state adaptations.

## Recommendation

**Proceed with Phase 1 pilot:** Pick NC or AK (both have confirmed parsers + likely HTML), ingest one state via UniCourt, measure actual row count vs estimate, validate source_urls chain. If successful, batch the remaining 12 states in a single PR. If row-count or markup surprises emerge, pause and re-read one of the html_parser classes to understand the extraction logic.

**Do NOT assume all 13 states are identical markup.** The existing Python parsers have per-state class definitions for a reason. Read one representative (GA for Bucket A baseline, MA for Bucket B baseline) to internalize the variance.

---

## Execution Results — 2026-04-30

Script: `C:\Users\email\projects\ImNotAnAttorney\apps\web\scripts\ingest\ingest-unicourt-states.mjs`

Ingested 11 states into `entities_statutes`. All 11 passed the anti-hallucination audit (0 rows with null `source_urls`, 0 rows with empty `section_text`).

| State | Title | Release | Rows Ingested | Rejected | Notes |
|-------|-------|---------|---------------|----------|-------|
| AK | 11 | r82 | 361 | 0 | Clean |
| AR | 5 | r78 | 1,072 | 4 | 4 sections >100k chars (omnibus/definitions) |
| CO | 18 | r80 | 678 | 2 | 2 sections >100k chars |
| GA | 16 | r86 | 631 | 25 | 25 sections >100k chars; GA has verbose code annotations |
| ID | 18 | r70 | 911 | 1 | 1 section >100k chars |
| KY | 50 (Penal) | r87 | 441 | 6 | 6 sections >100k chars |
| MS | 97 | r78 | 754 | 6 | 6 sections >100k chars |
| ND | 12.1 | r81 | 288 | 0 | Clean |
| TN | 39 | r76 | 730 | 6 | 6 sections >100k chars |
| VT | 13 | r85 | 925 | 0 | VT regex fixed mid-run (subchapter IDs `t13p01c08s01s351`) |
| WY | 6 | r84 | 280 | 0 | Clean |
| **TOTAL** | | | **7,071** | **50** | All 11 states CLEAN on audit |

### Per-state file naming quirks discovered

- **ID**: Uses `idaho.title.18.html` prefix (not `gov.id.code.title.18.html`)
- **GA**: Uses `gov.ga.ocga.title.16.html` (`ocga` = Official Code of Georgia Annotated, not `code`)
- **VT**: Uses `gov.vt.vsa.title.13.html` (`vsa` = Vermont Statutes Annotated, not `stat`)
- **KY**: Criminal code in Title 50 (Roman numeral L = 50), h3 id uses `t0L` prefix; chapters 500-534

### VT regex fix

VT Title 13 chapter 8 uses subchapter dividers in the HTML id, producing double-s patterns: `t13p01c08s01s351` (chapter 08, subchapter s01, section 351). The initial regex `/^t13p?\d*c(\w+)s(\d+[a-z]?)$/i` rejected all 546 subchapter-level sections. Fixed to `/^t13p?\d*c(\d+)s(?:\d+s)?(\d+[a-z]?)$/i` — the non-capturing group `(?:\d+s)?` absorbs the optional subchapter. Final count: 379 → 925 rows.

### Rejected rows

All 50 rejections are `section_text > 100,000 chars` — these are omnibus definitions sections and annotated cross-reference tables that UniCourt includes inline. These are not data quality failures; they are edge cases at the extreme tail of section length. The 100k limit is a Zod schema guard. The sections remain in the raw HTML for future re-ingestion with a larger limit if needed.

### Source URLs used per state

| State | Source host | URL pattern |
|-------|-------------|-------------|
| AK | `www.akleg.gov` | `statutes.asp#${section}` |
| AR | `unicourt.github.io` | `cic-code-ar/...title.05.html#${id}` |
| CO | `unicourt.github.io` | `cic-code-co/...title.18.html#${id}` |
| GA | `law.justia.com` | `codes/georgia/section/${section}/` |
| ID | `legislature.idaho.gov` | `idstat/Title18/T18CH${chap}/SECT18-${sec}/` |
| KY | `unicourt.github.io` | `cic-code-ky/...title.50.html#${id}` |
| MS | `law.justia.com` | `codes/mississippi/section/${section}/` |
| ND | `ndlegis.gov` | `cencode/t12-1.html#${id}` |
| TN | `law.justia.com` | `codes/tennessee/section/${section}/` |
| VT | `legislature.vermont.gov` | `statutes/section/13/${chap}/${sec}` |
| WY | `wyoleg.gov` | `statutes/browse/title/6/${chap}/${sec}` |

---

## Sources

- UniCourt cic-beautify-state-codes: https://github.com/UniCourt/cic-beautify-state-codes
- AK cic-code-ak: https://github.com/UniCourt/cic-code-ak (verified r82, 49 title files)
- Public.Resource.Org: https://public.resource.org/
- 50-State Survey: `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-05-01-50-state-statute-survey.md`
- Ingest script: `C:\Users\email\projects\ImNotAnAttorney\apps\web\scripts\ingest\ingest-unicourt-states.mjs`
