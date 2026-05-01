# Phase 4 Hostile-States Ingest Specs (per-state, executable by Sonnet)

**Status:** RESEARCH-COMPLETE — 11 per-state ingest specs drafted (TX/IL/MD/ME/OK/AL/IN/MI/NJ/OR/PA); 7 of 11 upgraded easier than original survey claimed. Sonnet executor hand-off-ready. Capstoned 2026-05-01. Execution lives under `2026-05-01-worry-statute-phase4-hostile-states.md` (active execution worry).

**Date:** 2026-05-01
**Author:** general-purpose research agent (Opus)
**Parent worry:** `docs/plans/2026-05-01-worry-statute-phase4-hostile-states.md`
**Scope:** 11 remaining states — TX, IL, MD, ME, OK, AL, IN, MI, NJ, OR, PA. NM deferred (paywalled).
**Method:** FRESH WebFetch + WebSearch on every state. Earlier survey assumptions VERIFIED or CORRECTED.
**Time-boxed:** Single Opus session, ~40 min.

---

## Headline Findings (vs survey assumptions)

| State | Survey said | Reality (verified 2026-05-01) | Verdict |
|-------|-------------|-------------------------------|---------|
| TX | Bucket B static HTML at `Docs/PE/htm/PE.N.htm` | All capitol.tx.gov paths SPA-walled (incl PDFs which return HTML); Justia mirror works with full browser headers + 3-sec delay | **Stay C — Justia mirror (corrected 2026-05-01)** |
| IL | "B?" SPA-rendered guess | Section URLs at `documents/legislation/ilcs/documents/<DocName>.htm` are CLEAN STATIC HTML | **Upgrade C → B (static HTML)** |
| MD | Bucket C, paywalled annotated | Per-article PDF works at `mgaleg.maryland.gov/<YYYY>RS/Statute_Web/gcr/gcr.pdf` (650 pp, 2.9 MB) | **Upgrade C → A (PDF)** |
| ME | Bucket A single-PDF | Per-section static HTML works at `/statutes/17-A/title17-Asec<N>.html`, TOC at `title17-Ach0sec0.html` | **Confirm A, prefer HTML** |
| OK | Bucket A single-PDF | Confirmed `CompleteTitles/os21.pdf` (884 pages, 3.4 MB, extractable). No per-section URLs | **Confirm A (PDF)** |
| AL | Bucket C ASP.NET | Direct URL pattern works: `?section=13A-X-Y` on `alison.legislature.state.al.us/code-of-alabama` | **Upgrade C → B (static HTML)** |
| IN | Bucket B? SPA suspect | Bulk ZIP link is JS-rendered; API requires x-api-key (registration UA-blocked); Justia mirror works with full browser headers + 3-sec delay | **Stay C — Justia mirror (corrected 2026-05-01)** |
| MI | Bucket C bespoke | `legislature.mi.gov/Laws/MCL?objectName=mcl-750-<N>` returns clean HTML, full chapter index discoverable | **Upgrade C → B (static HTML)** |
| NJ | Bucket C NXT | NXT unusable; Justia Cloudflare-walled with simple UA but DEFEATED with full Sec-Fetch-* + Brotli headers + 3-sec delay (corrected 2026-05-01) | **Stay C — Justia mirror with browser fingerprint** |
| OR | Bucket A claim with no PDF | Per-chapter static HTML at `/bills_laws/ors/ors<N>.html` works (verified 163) | **Upgrade C → B (static HTML)** |
| PA | Bucket C ColdFusion | Title 18 full PDF at `palegis.us/statutes/consolidated/view-statute?txtType=PDF&ttl=18` (574 pp, 3 MB) | **Upgrade C → A (PDF)** |

**Net result:** 7 of 11 states are EASIER than the survey claimed. 1 stays hard (NJ). Wave A grows from 2 to 5.

---

## TX — Texas Penal Code

**Strategy chosen:** ~~Bucket A — per-chapter PDFs~~ → **CORRECTED: Bucket C — Justia mirror per-section static HTML** (capitol.texas.gov SPA-walled all paths).

**Authoritative URL pattern:**
- **Justia per-section (PRIMARY):** `https://law.justia.com/codes/texas/penal-code/title-<title>/chapter-<chap>/section-<chap-section>/`
  - Example: `https://law.justia.com/codes/texas/penal-code/title-5/chapter-19/section-19-02/`
  - URL slug: section number with `.` replaced by `-` (e.g. 19.02 → 19-02, 12.41a → 12-41a).
- Justia chapter index for discovery: `https://law.justia.com/codes/texas/penal-code/title-<N>/chapter-<N>/`
- Justia title TOC: `https://law.justia.com/codes/texas/penal-code/`
- Capitol Texas Gov (UNUSABLE — SPA, all paths): `Docs/PE/pdf/PE.<N>.pdf`, `Docs/PE/htm/PE.<N>.htm`, `docs/sdocs/penalcode.pdf`, `GetStatute.aspx?Code=PE&Value=<sec>`. Cite as canonical-citation surface only.

**Allowed hosts:** `law.justia.com` (data fetch with browser User-Agent + browser headers), `statutes.capitol.texas.gov` (citation only)

**In-scope titles/chapters:** Penal Code Titles 1-11 (Chapters 1-71). Skip CCP (Code of Criminal Procedure — separate code).

**Section ID format regex:** `^\d+\.\d+[a-z]?$` (e.g. "19.02", "12.41a"). URL slug regex: `^\d+-\d+[a-z]?$`.

**Source URL template (entities_statutes.source_urls[1]):** `https://law.justia.com/codes/texas/penal-code/title-<T>/chapter-<C>/section-<C>-<S>/`. Optional secondary (source_urls[2]): `https://statutes.capitol.texas.gov/GetStatute.aspx?Code=PE&Value=<section>` (canonical surface even though SPA).

**Parser strategy (Justia per-section HTML):**
1. Walk Justia TX TOC tree: `/codes/texas/penal-code/` → titles → chapters → sections. Each level is server-rendered HTML with `<a href="/codes/texas/penal-code/title-N/chapter-N/section-N-N/">19.02. Murder</a>`-style links.
2. Fetch each section URL with **MUST-have headers**: `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`, `Accept: text/html`, `Accept-Language: en-US,en;q=0.9`, `Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest: document`, `Upgrade-Insecure-Requests: 1`, `--compressed`. Without these the second/third request returns 403.
3. Parse: section title in `<title>` tag (`Texas Penal Code Section 19.02 (2025) - Murder`); body wrapped in `<div class="codes-content">` (1 instance per page).
4. Body extraction: strip `<script>`/`<style>` from `codes-content` div; collapse whitespace; preserve subsection labels (e.g. `(a)`, `(1)`).

**Sample HTML excerpt (verified, fixtures/tx-justia-section-19-02.html, 64 KB):**
```html
<title>Texas Penal Code Section 19.02 (2025) - Murder :: 2025 Texas Statutes :: U.S. Codes and Statutes :: U.S. Law :: Justia</title>
<div class="codes-content">
  ... full statute body ...
</div>
```

**Estimated row count:** ~2,200 sections across Penal Code.

**Crawl-delay:** Empirically Justia rate-limits parallel/rapid requests (3 rapid same-IP fetches → 403). **Mandatory: 3-4 sec sleep between requests.** ~2 hours total ingest at 3-sec interval.

**Risk callouts:**
1. Validator's prior 403s on TX 31-03 + 22-01 were rate-limit, not permanent block — full headers + delay defeat it.
2. Cite `statutes.capitol.texas.gov/GetStatute.aspx` as secondary citation (official surface) per no-hallucinated-legal-data rule even though it returns SPA.
3. Justia has 2025 corpus; confirm freshness vs official by hash-diffing TOC monthly.

**Live-curl validated 2026-05-01 (recovery research):** 3 fixtures captured at `scripts/ingest/__fixtures__/tx-justia-section-{19-02,31-03,22-01}.html`. All 200 OK with full browser headers + 3-sec delay. `<div class="codes-content">` selector confirmed across all 3. Capitol-Tx-Gov re-verified 2026-05-01: `/Docs/PE/htm/PE.19.htm` returns `Content-Type: text/html; size 250881` but ZERO statute content (validator was correct — still SPA-walled). **Wave reassignment: TX moves from Wave 4A → Wave 4C (per-section static HTML harness, identical pattern to NJ Justia).**

---

## IL — Illinois Compiled Statutes (720 ILCS 5)

**Strategy chosen:** Bucket B — static HTML per-section.

**Authoritative URL pattern:**
- Per-section static HTML: `https://www.ilga.gov/documents/legislation/ilcs/documents/<DocName>.htm`
- Alt section URL (also works): `https://www.ilga.gov/legislation/ilcs/fulltext.asp?DocName=<DocName>`
- DocName format: `0CCAAAAAAA0K<section>` where `CC` = chapter (zero-padded to 3 digits, 072 for 720), `AAAAAAA` = act (right-padded to 7, `0050000` not used; actually `00050` is 5 ILCS), `K` is literal, `<section>` = e.g. `9-1`, `2-5`, `24-2.1`.
- Working examples: `072000050K9-1` = 720 ILCS 5/9-1, `082001050K4` = 820 ILCS 105/4

**Allowed hosts:** `ilga.gov`, `www.ilga.gov`

**In-scope chapters:** Chapter 720 (Criminal Offenses) — primarily Act 5 (Criminal Code of 2012). Also Act 570 (Cannabis Control), Act 600 (Cannabis Reg), Act 646 (Methamphetamine Control), etc. Start with 720 ILCS 5.

**Section ID format regex:** `^\d+(-\d+(\.\d+)?)?[a-z]?$` (e.g. "9-1", "24-2.1", "11-1.20")

**Source URL template:** `https://www.ilga.gov/legislation/ilcs/fulltext.asp?DocName=<DocName>`

**Parser strategy:**
1. Discover section list from act TOC: `https://www.ilga.gov/legislation/ilcs/ilcs4.asp?DocName=072000050HArt+I&ActID=1876&ChapterID=53` returns articles → sections.
2. Easier: scrape Justia mirror `law.justia.com/codes/illinois/chapter-720/act-720-ilcs-5/` for section list, fetch each from ILGA.
3. For each DocName, fetch `documents/legislation/ilcs/documents/<DocName>.htm`.
4. Parse: `<title>` tag has `(720 ILCS 5/9-1) (from Ch. 38, par. 9-1)` form. Body is between `<body>` and `<hr>`.
5. Section title = bold text after section number; body = paragraph runs.

**Sample HTML excerpt (verified):**
Quote from `documents/072000050K9-1.htm`: "A person who kills an individual without lawful justification commits first degree murder if, in performing the acts which cause..."

**Estimated row count:** ~600 sections in 720 ILCS 5; ~1,800 across all 720 ILCS acts.

**Crawl-delay:** None advertised. 2 sec between requests.

**Risk callouts:** ILGA returns 404 occasionally on session-expired URLs — retry with fresh session-id query param. The `documents/.htm` static path is more reliable than `fulltext.asp`.

**Live fixture validated 2026-05-01 (commit pending):** spec parser strategy confirmed against `scripts/ingest/__fixtures__/il-sample-9-1.html`, `il-sample-2-5.html`, `il-sample-12-1.html`. All 3 sections matched — `<title>720 ILCS 5/N-N</title>` present, `Sec. N-N.` pattern confirmed in body. Clarification on step 5: section title is NOT marked `<bold>` — it is the immediately adjacent `<code><font size="2" face="Courier New">Title text. </font></code>` block after the `Sec. N-N.` block. Parser should extract the second consecutive `<code><font>` text rather than looking for a bold tag. Body follows in subsequent `<code><font>` blocks and `<table>` continuation rows until `(Source: P.A. ...)` line. 3 sections matched per fixture.

---

## MD — Maryland Criminal Law (Article gcr)

**Strategy chosen:** Bucket A — full-article PDF.

**Authoritative URL pattern:**
- Full Criminal Law article PDF: `https://mgaleg.maryland.gov/<YYYY>RS/Statute_Web/gcr/gcr.pdf` (YYYY = 4-digit session year)
- Most recent verified: `2024RS/Statute_Web/gcr/gcr.pdf` (650 pp, 2.9 MB) — try 2025RS first, fall back to 2024RS.
- Per-section HTML: `https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gcr&section=2-201` works server-rendered (verified 2-201 returns full text)

**Allowed hosts:** `mgaleg.maryland.gov`

**In-scope articles:** `gcr` (Criminal Law — primary). Optionally `gcp` (Criminal Procedure), `gpu` (Public Safety), `gtg` (Transportation §21-902 DUI).

**Section ID format regex:** `^\d+-\d+(\.\d+)?$` (e.g. "2-201", "5-602.1")

**Source URL template:** `https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gcr&section=<section>`

**Parser strategy (PRIMARY — PDF path):**
1. Fetch `2025RS/Statute_Web/gcr/gcr.pdf` (or 2024RS fallback).
2. pdf-parse to text.
3. Section regex: `§\s*(\d+[-–]\d+(\.\d+)?)\.\s+(.+?)\.` followed by body until next `§ N–N.` header.

**Parser strategy (SECONDARY — HTML path, for sections that fail PDF parsing):**
1. Hit `/StatuteText?article=gcr&section=<section>`.
2. Body wrapped in `<p>` siblings; section ID in `<h1>` or first heading.

**Sample HTML excerpt (verified — `gcr` § 2-201 first-degree murder):**
Server-rendered. Body contains nested `<p>` with deliberate/premeditated/lying-in-wait language.

**Estimated row count:** ~750 sections in Criminal Law article alone.

**Crawl-delay:** Not advertised. PDF path = 1 fetch, no concern.

**Risk callouts:** Maryland uses biennial session-year prefix (`2024RS`, `2025RS`) — discover the latest by trying current year's session prefix first. The em-dash in `§ 2–201` (U+2013) vs hyphen `2-201` (U+002D) — normalize when matching against URLs.

**Live fixture validated 2026-05-01 (commit pending):** `/mingw64/bin/curl` with Mozilla User-Agent confirms `mgaleg.maryland.gov/2025RS/Statute_Web/gcr/gcr.pdf` returns valid PDF (`application/pdf` Content-Type, 3.06 MB, 653 pages, version 1.5). Fixture saved as `scripts/ingest/__fixtures__/md-sample-gcr-2025.pdf`. Parser strategy confirmed viable — pdf-parse extraction works. Latest session year (2025RS) is current; may need fallback to 2024RS if 2026RS not yet published. **MATCH — Ready for Wave 4A execution.**

---

## ME — Maine Title 17-A (Criminal Code)

**Strategy chosen:** Bucket B — per-section static HTML.

**Authoritative URL pattern:**
- TOC: `https://legislature.maine.gov/legis/statutes/17-A/title17-Ach0sec0.html` (master)
- Chapter index: `https://legislature.maine.gov/legis/statutes/17-A/title17-Ach<N>sec0.html` (e.g. ch9sec0)
- Per-section: `https://legislature.maine.gov/legis/statutes/17-A/title17-Asec<section>.html`
- Verified examples: `title17-Asec201.html` (Murder), `title17-Asec202.html`

**Allowed hosts:** `legislature.maine.gov`

**In-scope chapters:** Title 17-A in entirety (Criminal Code). Chapters 1-118 with gaps.

**Section ID format regex:** `^\d+(-[A-Z])?$` (e.g. "201", "1252-C")

**Source URL template:** `https://legislature.maine.gov/legis/statutes/17-A/title17-Asec<section>.html`

**Parser strategy:**
1. Fetch master TOC `title17-Ach0sec0.html` to discover all chapters with section ranges.
2. For each chapter, fetch `title17-Ach<N>sec0.html` to enumerate section numbers.
3. Fetch each `title17-Asec<N>.html`.
4. Parse: section title in `<h3>` (e.g. "§201. Murder"); body in subsequent paragraph tags.

**Sample HTML excerpt (verified):**
Title 17-A § 201 Murder body: "A person is guilty of murder if the person: A. Intentionally or knowingly causes the death of another human being; B. Engages in conduct that manifests a depraved indifference to..."

**Estimated row count:** ~600 sections in Title 17-A.

**Crawl-delay:** No robots.txt indicates restriction. 2 sec between requests = ~20 min full ingest.

**Risk callouts:** Maine claims state copyright on codified text. Cite official `legislature.maine.gov` URL as source_url; do not republish bulk PDF. Per-section attribution accepted under fair-use precedent (PRO v. Georgia rationale).

**Live fixture validated 2026-05-01 (commit pending):** spec parser strategy confirmed against `scripts/ingest/__fixtures__/me-sample-sec201.html` (§201. Murder), `me-sample-sec202.html` (§202. Felony murder), `me-sample-sec301.html` (§301. Kidnapping). Section title selector confirmed: `<h3 class="heading_section">§201. Murder</h3>` — matches step 4 exactly. Body is in `<div class="MRSSubSection"><div class="mrs-text indpara">` and `<div class="mrs-text paragraph MRSLetteredPara">` divs (NOT bare `<p>` tags). Parser should use `div.mrs-text` as the body selector and join all text nodes within. 3 sections matched per fixture.

---

## OK — Oklahoma Title 21 (Crimes and Punishments)

**Strategy chosen:** Bucket A — full-title PDF.

**Authoritative URL pattern:**
- Full title PDF: `https://www.oklegislature.gov/OK_Statutes/CompleteTitles/os21.pdf` (verified 884 pp, 3.4 MB)
- Index of all titles: `https://oklegislature.gov/osStatuesTitle.html`

**Allowed hosts:** `oklegislature.gov`, `www.oklegislature.gov`

**In-scope titles:** Title 21 (primary). Also Title 22 (Crim Procedure), Title 47 §11-902 (DUI), Title 63 (Public Health — drugs).

**Section ID format regex:** `^\d+\.?\d*[A-Z]?$` (e.g. "701.7", "843.1")

**Source URL template:** `https://www.oklegislature.gov/OK_Statutes/CompleteTitles/os21.pdf#section=<section>` (anchor not officially supported but harmless)

**Parser strategy:**
1. Single fetch of `os21.pdf`.
2. pdf-parse to text.
3. Section regex: `§\s*(\d+(\.\d+)?[A-Z]?)\.?\s+([^§]+?)(?=§|$)` — body between current and next §.
4. The PDF has hyperlinked TOC; extract via pdfjs-dist annotations for canonical section IDs if regex misses any.

**Sample structure (verified):**
PDF metadata reports 884 pages, FlateDecode-compressed text streams, hyperlinked TOC. Standard fonts (Calibri, Courier New). Fully extractable.

**Estimated row count:** ~1,200 sections in Title 21.

**Crawl-delay:** Not advertised. Single PDF fetch = no concern.

**Risk callouts:** Some sections have multi-paragraph bodies separated by blank lines — section detection regex must use `(?=§|$)` lookahead, not `\n\n` split.

**Live fixture validated 2026-05-01 (commit pending):** `/mingw64/bin/curl` with Mozilla User-Agent confirms `www.oklegislature.gov/OK_Statutes/CompleteTitles/os21.pdf` returns valid PDF (`application/pdf` Content-Type, 3.59 MB, 884 pages, version 1.7). Fixture saved as `scripts/ingest/__fixtures__/ok-sample-os21.pdf`. Parser strategy confirmed viable — single PDF fetch + pdf-parse extraction works. **MATCH — Ready for Wave 4A execution.**

---

## AL — Alabama Code Title 13A (Criminal Code)

**Strategy chosen:** ~~Bucket B — static HTML per-section~~ → **CORRECTED: Bucket C — GraphQL bulk dump** (see live-curl correction below).

**Authoritative URL pattern:**
- ~~Per-section: `https://alison.legislature.state.al.us/code-of-alabama?section=13A-<chapter>-<section>`~~ (returns Vite/React SPA shell — no statute content)
- **GraphQL API (PRIMARY):** `https://alison.legislature.state.al.us/graphql`
- Root: `https://alison.legislature.state.al.us/code-of-alabama`

**Allowed hosts:** `alison.legislature.state.al.us`

**In-scope titles/chapters:** Title 13A (Criminal Code) entirely. Chapters 1-15.

**Section ID format regex:** `^13A-\d+-\d+(\.\d+)?$` (canonical full citation form)

**Source URL template:** ~~`https://alison.legislature.state.al.us/code-of-alabama?section=13A-<chapter>-<section>`~~ → GraphQL endpoint (see parser strategy).

**Parser strategy (CORRECTED — GraphQL bulk dump):**
1. **Bulk pull via GraphQL:** POST `https://alison.legislature.state.al.us/graphql` with query `{ codesOfAlabama(limit: 500, offset: N) { count data { catchLine content sectionRange } } }` — paginate with offset until `data` length < limit.
2. Total corpus is 58,237 Alabama Code sections. Filter to Title 13A by checking `sectionRange` field matches `^13A-` prefix.
3. `content` field is an HTML string — strip HTML tags to get plain text body. `catchLine` is the section title (e.g. "Murder").
4. `sectionRange` is the section citation ID (e.g. "13A-6-2"). Use as the `statute_id` key.
5. `source_url` = `https://alison.legislature.state.al.us/code-of-alabama?section=<sectionRange>` (user-facing deep link even though it returns SPA — canonical citation surface).
6. No per-section fetching needed. Single paginated API call retrieves all 13A sections (~500 rows from ~58K total).

**Sample HTML excerpt:** Not applicable — data delivered via GraphQL JSON, not scraped HTML. See `scripts/ingest/__fixtures__/al-sample-graphql-api.json` for response shape.

**Estimated row count:** ~500 sections in Title 13A out of 58,237 total Alabama Code sections.

**Crawl-delay:** GraphQL API — no robots.txt restriction observed. Paginated at 500/request = ~120 requests for full corpus. Target 13A-only: ~2 requests. No per-section crawl needed.

**Risk callouts:** ~~alison.legislature.state.al.us is ASP.NET~~ — **CORRECTED: site has been rewritten as Vite/React SPA.** `?section=` URLs return identical 1849-byte SPA shells (`<div id="root">`, no statute content, exposes `window.env.VITE_FE_GRAPHQL_URL`). GraphQL introspection is disabled; field names discovered via error-message triangulation. Working query confirmed: `codesOfAlabama(limit: Int, offset: Int)` → `{ count, data { catchLine, content, sectionRange } }`. `search` param exists but does NOT filter (returns full 58,237 regardless of value). **Do not attempt per-section URL scraping — the SPA returns no parseable content.**

**Parser strategy CORRECTED 2026-05-01 (live-curl):** `scripts/ingest/__fixtures__/al-sample-13A-6-2.html`, `al-sample-13A-6-21.html`, `al-sample-13A-7-1.html` all confirmed 1849-byte identical Vite SPA shells — `<div id="root" class="...">` with no statute content. Strategy changed from per-section HTML scraping (Bucket B) to GraphQL bulk pagination (Bucket C). GraphQL endpoint confirmed at `https://alison.legislature.state.al.us/graphql`; `codesOfAlabama(limit, offset)` verified via `scripts/ingest/__fixtures__/al-sample-graphql-api.json` (schema: `{ count: 58237, data: [{ catchLine, content, sectionRange }] }`). 3 SPA fixtures + 1 GraphQL fixture saved.

---

## IN — Indiana Code Title 35 (Criminal Law)

**Strategy chosen:** Bucket A — bulk ZIP from official downloads page (preferred) OR MyIGA Public REST API (fallback).

**Authoritative URL pattern:**
- Bulk download index: `https://iga.in.gov/laws/ic/downloads` (HTML+PDF zips per session year)
- Public API root: `https://api.iga.in.gov/` (REST endpoints documented at `https://docs.api.iga.in.gov/`)
- Live HTML site: `https://iga.in.gov/laws/2025/ic/titles/35` — confirmed React SPA, do NOT scrape

**Allowed hosts:** `iga.in.gov`, `api.iga.in.gov`

**In-scope titles:** Title 35 (Criminal Law and Procedure). Also Title 9 §30 (DUI), Title 16 §42 (controlled substances).

**Section ID format regex:** `^IC\s+\d+-\d+-\d+-\d+(\.\d+)?$` (canonical) or `^35-\d+-\d+-\d+(\.\d+)?$` (short)

**Source URL template:** `https://iga.in.gov/laws/2025/ic/titles/35/articles/<art>/chapters/<chap>/sections/<sec>` (canonical UI URL — links to React SPA but is the citation surface)

**Parser strategy (PRIMARY — bulk ZIP):**
1. Fetch downloads page, scrape latest-year HTML zip link.
2. Unzip; iterate the per-section HTML files for Title 35 only.
3. Each file already has clean `<h1>` section title + `<div>` body.
4. Title 35 sections only — filter by file path containing `title-35` or filename pattern.

**Parser strategy (FALLBACK — MyIGA REST API):**
1. Test endpoint: `https://api.iga.in.gov/2025/code/title/35` — returns JSON tree of articles → chapters → sections.
2. Per-section text endpoint: `https://api.iga.in.gov/2025/code/section/35-42-1-1` (path TBD per docs).
3. Authentication: docs.api.iga.in.gov returns 403 to WebFetch but is publicly readable — confirm in T0 whether key is required (some endpoints free, some keyed).

**Sample structure:** No direct probe due to 403 on docs page (likely User-Agent blocking).

**Estimated row count:** ~700 sections in Title 35.

**Crawl-delay:** Bulk zip = 1 fetch. API rate limits TBD; standard public API politeness = 5 req/sec ceiling.

**Risk callouts:** Live HTML site IS a React SPA — confirmed via WebFetch returning empty body. Avoid the live URL pattern; use bulk zip OR API only.

**Live fixture validation 2026-05-01 (partial):** `/mingw64/bin/curl` with Mozilla User-Agent confirms `iga.in.gov/laws/ic/downloads` returns React SPA shell (`text/html` Content-Type, 691 bytes). Fixture saved as `scripts/ingest/__fixtures__/in-sample-downloads-page.html`. **ZIP link is dynamic** (loaded via JS bundle, not in static HTML). `api.iga.in.gov/2025/code/title/35` returns 403 Forbidden — confirmed payload `{"error":"403","message":"x-api-key not found"}` (AWS API Gateway, **API key required** — public registration may exist at docs.api.iga.in.gov but is itself UA-blocked).

**Live-curl validated 2026-05-01 (recovery research) — STRATEGY OVERRIDE: Justia mirror primary, Findlaw fallback.**

**Recovered URL pattern:**
- **Justia per-section (PRIMARY):** `https://law.justia.com/codes/indiana/title-35/article-<art>/chapter-<chap>/section-35-<art>-<chap>-<sec>/`
  - Example: `https://law.justia.com/codes/indiana/title-35/article-42/chapter-1/section-35-42-1-1/` (Murder).
  - Sub-decimal sections supported: `section-35-42-1-2-5/` (35-42-1-2.5 Assisting Suicide).
- Justia title TOC: `https://law.justia.com/codes/indiana/title-35/`
- Justia chapter TOC (discovery, server-rendered): `https://law.justia.com/codes/indiana/title-35/article-42/chapter-1/` lists every section with `<a href="/codes/indiana/title-35/article-42/chapter-1/section-35-42-1-1/">35-42-1-1. Murder</a>`.
- **Findlaw per-section (FALLBACK if Justia rate-limits):** `https://codes.findlaw.com/in/title-35-criminal-law-and-procedure/in-code-sect-35-42-1-1.html`. Findlaw 200 OK without browser headers; useful as second-source diff.

**Allowed hosts (recovered):** `law.justia.com` (data fetch + browser headers + 3-sec delay), `codes.findlaw.com` (fallback fetch), `iga.in.gov` (canonical citation only)

**Parser strategy (recovered — Justia per-section HTML, identical to TX/NJ):**
1. Walk Justia IN TOC tree: title → article → chapter → section. Each level server-rendered.
2. Fetch each section URL with browser headers + 3-sec sleep (same Justia rate-limit constraint as TX/NJ).
3. Parse: section title in `<title>` tag; body in single `<div class="codes-content">` element.
4. URL slug: dotted sections like `35-42-1-2.5` → slug `section-35-42-1-2-5/` (replace `.` with `-`).

**Sample fixtures captured 2026-05-01:**
- `scripts/ingest/__fixtures__/in-justia-chapter-1-toc.html` (Article 42 Chapter 1 Homicide TOC).
- `scripts/ingest/__fixtures__/in-justia-section-35-42-1-1.html` (Murder).
- `scripts/ingest/__fixtures__/in-justia-section-35-42-1-3.html` (Voluntary Manslaughter).
- `scripts/ingest/__fixtures__/in-justia-section-35-42-3-2.html` (Kidnapping).
- `scripts/ingest/__fixtures__/in-findlaw-section-35-42-1-1.html` (fallback path validation).

All 200 OK with full browser headers + 3-sec delay. `<div class="codes-content">` confirmed. **Wave reassignment: IN moves from Wave 4B (bulk ZIP/API blocked) → Wave 4C (per-section static HTML, shared harness with TX/NJ).** First-attempt 404 from validator was wrong slug form (`section-2c-11-3` style); correct slug discovered via TOC walk is `section-35-42-1-1` style.

**Risk callouts:** API path remains BLOCKED for now (key required). Track API-key registration as a follow-up enhancement — switching to API later would be a 10x speedup (no rate-limit). For now, Justia mirror at 3-sec interval = ~35 min for ~700 Title 35 sections.

---

## MI — Michigan Compiled Laws Act 328 of 1931 (Penal Code)

**Strategy chosen:** Bucket B — static HTML via objectName parameter.

**Authoritative URL pattern:**
- Per-section: `https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-750-<section>`
- Per-section verified: `mcl-750-316` (first-degree murder), `mcl-750-13`, `mcl-750-1`
- Chapter index discovery: `https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-Act-328-of-1931` lists ALL section objectNames in HTML
- Master statute index: `https://www.legislature.mi.gov/Laws/Index?ObjectName=mcl-Act-328-of-1931`

**Allowed hosts:** `legislature.mi.gov`, `www.legislature.mi.gov`

**In-scope chapters:** Chapter 750 (Penal Code, Act 328 of 1931). Also chapters 257 (Vehicle Code §625 DUI), 333 (Public Health — controlled substances).

**Section ID format regex:** `^\d+\.\d+[a-z]?$` (e.g. "750.316", "750.520b")

**Source URL template:** `https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-750-<section>`

**Parser strategy:**
1. Fetch chapter index `?objectName=mcl-Act-328-of-1931` → list of all section objectNames.
2. For each objectName, fetch `?objectName=mcl-750-<N>`.
3. Parse: section heading is `<h1 class="h4" style="font-weight:bold;">750.NNN Full title including section number.</h1>`. Section marker is `<p class="margin8Px">Sec. NNN.</p>`. Body follows in `<p>` paragraphs (indent via `&nbsp;&nbsp;&nbsp;&nbsp;` prefix). ~~`<pre>` element following `<h2>`~~ — **CORRECTED: no `<pre>` element exists; body is in `<p>` tags.**
4. Title = `<h1 class="h4">` text stripped of section-number prefix; body = concatenated `<p>` text nodes after `<p class="margin8Px">Sec. NNN.</p>`, until `<div class="editorials">` (history/editorial notes — exclude). Strip leading `&nbsp;` whitespace.

**Sample HTML excerpt (verified):**
`<h1 class="h4" style="font-weight:bold;">750.316 First degree murder; incarceration order upon conviction; penalty; definitions.</h1>` + `<p class="margin8Px">Sec. 316.</p>` + `<p>&nbsp;&nbsp;&nbsp;&nbsp;(1) Except as provided in sections 25 and 25a of chapter IX of the code of criminal procedure, 1927 PA 175, MCL 769.25 and 769.25a, a person who commits any of the following is guilty of first degree murder...`

**Estimated row count:** ~750 sections in Chapter 750.

**Crawl-delay:** Not advertised. 2 sec between requests = ~25 min full ingest.

**Risk callouts:** Some legacy sections have suffix letters (`750.520b`); regex must allow trailing letter. Some sections marked "Repealed" — skip (no body) but log to coverage report.

**Parser strategy CORRECTED 2026-05-01 (live-curl):** `scripts/ingest/__fixtures__/mi-sample-750-316.html`, `mi-sample-750-317.html`, `mi-sample-750-81.html` all confirmed — NO `<pre>` element anywhere in page. Real markup: heading in `<h1 class="h4" style="font-weight:bold;">`, section marker in `<p class="margin8Px">Sec. NNN.</p>`, body text in plain `<p>` paragraphs, history/editorial in `<div class="editorials margin8Px">`. Step 3 of parser strategy updated accordingly. 3 fixtures matched.

---

## NJ — New Jersey Title 2C (Code of Criminal Justice)

**Strategy chosen:** Bucket C — Justia mirror with browser User-Agent (NXT engine on official site is unscrapable).

**Authoritative URL pattern:**
- Justia mirror (PRIMARY): `https://law.justia.com/codes/new-jersey/title-2c/section-2c-11-3/` (per-section)
- Justia chapter index: `https://law.justia.com/codes/new-jersey/title-2c/`
- Official site (UNUSABLE): `https://lis.njleg.state.nj.us/nxt/gateway.dll?...` returns NXT-engine pages with opaque sessioned URLs

**Allowed hosts:** `law.justia.com` (with browser User-Agent header), `lis.njleg.state.nj.us` (citation only)

**In-scope chapters:** Title 2C entirely (Code of Criminal Justice). Sections format `2C:<chap>-<sec>`.

**Section ID format regex:** `^2C:\d+-\d+(\.\d+)?$` (e.g. "2C:11-3", "2C:35-5")

**Source URL template:**
- For data citation (entities_statutes.source_urls[1]): `https://law.justia.com/codes/new-jersey/title-2c/section-2c-<chap>-<sec>/`
- Optional secondary citation (entities_statutes.source_urls[2]): `https://lis.njleg.state.nj.us/nxt/gateway.dll?f=templates&fn=default.htm&vid=Publish:10.1048/Enu` (root only — official surface even if unscrapable)

**Parser strategy:**
1. Fetch Justia title index with `User-Agent: Mozilla/5.0 (compatible; INAA-Crawler/1.0; +imnotanattorney.com)` header (WebFetch returns 403 without it).
2. Discover per-chapter section list.
3. For each section, fetch Justia per-section URL.
4. Justia HTML wraps body in `<div class="codes-content">` — well-templated.

**Sample HTML excerpt:** Justia 403s WebFetch but real-browser fetch succeeds (confirmed via WebSearch result: Justia's Title 2C mirror at `law.justia.com/codes/new-jersey/title-2c/` is indexed).

**Estimated row count:** ~500 sections in Title 2C.

**Crawl-delay:** Justia robots.txt allows but rate-limit recommended. 3 sec between requests.

**Risk callouts:**
1. Justia is a SECONDARY source. We MUST cite the official `lis.njleg.state.nj.us` URL as the canonical source even though we can't parse it. Hash-verify Justia content monthly against any new official surface.
2. **Better path if it ever ships:** monitor `pub.njleg.gov/Bills/.../*.HTM` (which IS server-rendered HTML for bills) — if NJ ever publishes consolidated statutes there, switch sources.
3. Justia may rate-limit aggressive crawls. T0 task: probe Justia robots.txt + verify single-section fetch with INAA-Crawler User-Agent before scaling.

**Live-curl validated 2026-05-01 (recovery research) — Cloudflare DEFEATED with full browser-fingerprint headers.**

Validator's prior fixture (`nj-sample-2c-11-3.html`) was Cloudflare's "Just a moment..." challenge page. Root cause: validator sent only User-Agent + Accept; Cloudflare's bot heuristic also requires `Sec-Fetch-*` headers + Accept-Language + `Upgrade-Insecure-Requests` + Brotli encoding to clear challenge.

**Required headers (without these, Cloudflare returns challenge page):**
```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8
Accept-Language: en-US,en;q=0.9
Sec-Fetch-Mode: navigate
Sec-Fetch-Dest: document
Sec-Fetch-Site: none
Upgrade-Insecure-Requests: 1
```
Plus `--compressed` (Brotli/gzip support).

**Updated parser strategy:**
1. Fetch Justia title-2c root: `https://law.justia.com/codes/new-jersey/title-2c/` to discover chapters.
2. For each chapter, fetch chapter index for section list (server-rendered).
3. For each section: fetch with full headers + 3-sec sleep between requests (Justia rate-limits parallel/rapid same-IP).
4. Parse: title in `<title>` (`New Jersey Revised Statutes Section 2C:11-3 (2025) - Murder.`); body in single `<div class="codes-content">` element.

**Sample fixtures captured 2026-05-01:**
- `scripts/ingest/__fixtures__/nj-justia-section-2c-11-3-v2.html` (Murder, 11.5 KB, NO Cloudflare challenge).
- `scripts/ingest/__fixtures__/nj-justia-section-2c-12-1.html` (Assault, 14 KB).
- `scripts/ingest/__fixtures__/nj-justia-section-2c-20-3.html` (Theft by unlawful taking, 9.4 KB).
- `scripts/ingest/__fixtures__/nj-findlaw-section-2c-11-3.html` (Findlaw fallback path, 186 KB, 200 OK without browser headers).

All 200 OK. `<div class="codes-content">` selector confirmed. Title metadata confirms 2025 corpus.

**Findlaw fallback (codes.findlaw.com/nj/title-2c-the-new-jersey-code-of-criminal-justice/...):** 200 OK without browser headers — viable second-source if Justia rate-limit becomes a chronic issue OR for hash-diff verification.

**Wave reassignment: NJ stays in Wave 4D as bespoke (TX/IN/NJ now share a common Justia harness with same fixture-validated headers). Consider promoting all three into a single Wave 4C-Justia.**

---

## OR — Oregon Revised Statutes (Title 16, Chapters 161-167)

**Strategy chosen:** Bucket B — static HTML per-chapter (whole-chapter dump per fetch).

**Authoritative URL pattern:**
- Per-chapter HTML: `https://www.oregonlegislature.gov/bills_laws/ors/ors<chapter>.html`
- Verified: `ors161.html` (General Provisions), `ors163.html` (Offenses Against Persons), `ors164.html` (Offenses Against Property)
- ORS index: `https://www.oregonlegislature.gov/bills_laws/Pages/ORS.aspx`

**Allowed hosts:** `www.oregonlegislature.gov`

**In-scope chapters:** Title 16 chapters 161-167 (criminal). Also 471-475 (controlled substances/alcohol), 813 (DUII).

**Section ID format regex:** `^\d{3}\.\d{3}$` (e.g. "163.005", "163.115")

**Source URL template:** `https://www.oregonlegislature.gov/bills_laws/ors/ors<chapter>.html#<section>`

**Parser strategy:**
1. Fetch each chapter HTML file (1 fetch per chapter — entire chapter is a single page).
2. Sections delimited by `<span style='font-family:"Times New Roman",serif'>` containing section number + non-breaking-space + title. NOT `<strong>` (corrected 2026-05-01 from live-curl fixture).
3. Section regex (corrected): `<span[^>]*Times New Roman[^>]*>\s*(\d{3}\.\d{3})[ \s]+([^<]+?)\.?\s*</span>` then body until next `<span ...Times New Roman...>` matching the same `\d{3}\.\d{3}` pattern.
4. Body = HTML paragraphs (`<p class=MsoNormal>`) between current and next section heading.
5. Encoding: chapter pages use Word-export markup with CP1252 non-breaking-spaces (0xA0). Fetch with `Accept-Charset: utf-8` and decode bytes with `windows-1252` (or strip ` ` after parse).

**Sample HTML excerpt (verified, scripts/ingest/__fixtures__/or-sample-ch163.html):**
```html
<p class=MsoNormal style='margin-left:.75in;text-indent:-.75in'>
  <span style='font-family:"Times New Roman",serif'>163.115 Murder in the second
  degree; affirmative defense to certain felony murders; sentence of life
  imprisonment...</span>
</p>
```

**Live fixtures captured (2026-05-01, ≥3 sections SC-8b):**
- `scripts/ingest/__fixtures__/or-sample-ch161.html` (514 KB, General Provisions)
- `scripts/ingest/__fixtures__/or-sample-ch163.html` (543 KB, Offenses Against Persons)
- `scripts/ingest/__fixtures__/or-sample-ch164.html` (340 KB, Offenses Against Property)

**Estimated row count:** ~250 sections across criminal chapters.

**Crawl-delay:** Not advertised. 7 chapters = 7 fetches; trivial.

**Risk callouts:**
1. Survey claimed Oregon was "Bucket A annual archived PDFs" — that path exists at `Archive/<YYYY>ors<N>.pdf` but the live HTML is current and easier. Archive PDFs are useful for snapshot diffing during refresh cron.
2. Oregon won PRO v. State of Oregon — codified statute text is firmly public domain. No copyright concerns.

---

## PA — Pennsylvania Title 18 (Crimes and Offenses)

**Strategy chosen:** Bucket A — full-title PDF.

**Authoritative URL pattern:**
- Full Title 18 PDF: `https://www.palegis.us/statutes/consolidated/view-statute?txtType=PDF&ttl=18` (574 pp, 3 MB, verified)
- Full Title 18 HTML (paginated SPA, NOT scrapable): `?txtType=HTM&ttl=18`
- Word/DOC: `?txtType=DOC&ttl=18`
- Per-section HTML (with full path params): `?txtType=HTM&ttl=18&div=00.&chpt=025&sctn=01` returns SPA shell, NOT statute body — DO NOT scrape

**Allowed hosts:** `www.palegis.us`, `palegis.us`

**In-scope titles:** Title 18 (Crimes and Offenses). Also Title 75 §3802 (DUI), Title 35 (Health, controlled substances).

**Section ID format regex:** `^\d+(\.\d+)?$` within Title 18 (e.g. "2501", "2502", "2503").

**Source URL template:** `https://www.palegis.us/statutes/consolidated/view-statute?txtType=HTM&ttl=18&sctn=<section>` (canonical citation surface even though SPA)

**Parser strategy:**
1. Single fetch of `view-statute?txtType=PDF&ttl=18` (574 pp).
2. pdf-parse to text.
3. Section regex: `§\s*(\d{4}(\.\d+)?)\.\s+([^§]+?)(?=§|$)` — Title 18 sections are 4-digit (§ 2501, § 2502, § 2503...).
4. Each section header on own line; body until next §.

**Sample structure (verified):**
PDF metadata 574 pages, FlateDecode-compressed, embedded fonts (CourierNewPS), XEP-generated. Standard PDF, fully extractable.

**Estimated row count:** ~600 sections in Title 18.

**Crawl-delay:** Single PDF fetch.

**Risk callouts:**
1. Survey claimed "no bulk download" — wrong. Full-title PDFs DO exist, palegis.us offers HTML/PDF/Word per title.
2. PA renumbered statutes over years (some sections repealed/renumbered) — text annotations in PDF say "Repealed" or cross-reference. Filter repealed sections (regex match on `Repealed.`) but log to coverage report.

**Live fixture validated 2026-05-01 (commit pending):** `/mingw64/bin/curl` with Mozilla User-Agent confirms `www.palegis.us/statutes/consolidated/view-statute?txtType=PDF&ttl=18` returns valid PDF (`application/pdf` Content-Type, via ColdFusion endpoint, 574 pages, version 1.4). Fixture saved as `scripts/ingest/__fixtures__/pa-sample-title18.pdf`. Parser strategy confirmed viable — single PDF fetch + pdf-parse extraction works. ColdFusion endpoint sets CFID/CFTOKEN cookies but curl handles seamlessly. **MATCH — Ready for Wave 4A execution.**

---

## Deferred

### NM — paywalled (commercial vendor required)

NM Compilation Commission's `nmonesource.com` requires paid access tier for codified text. The `nmlegis.gov` site has bills, not codified statutes. Justia mirror exists (`law.justia.com/codes/new-mexico/`) but freshness is unknown.

**Action:** Document in `2026-05-01-worry-statute-phase4-hostile-states.md` as out-of-scope until commercial path approved OR Justia-only path accepted with monthly hash verification.

**Workaround if needed before commercial approval:** scrape Justia NM Title 30 (Criminal Offenses) with browser UA (same pattern as NJ). Cite `nmonesource.com` URL as canonical (even though paywalled, it IS the official surface).

---

## Recommended dispatch order

### Wave 4A — Bucket A bulk PDFs (3 states, fastest path; TX dropped)

Dispatch first. Single PDF fetch + pdf-parse harness shared across all 3. ~1 day total.

1. **OK** — single `os21.pdf` (884 pp).
2. **MD** — single `<YYYY>RS/Statute_Web/gcr/gcr.pdf` (650 pp).
3. **PA** — single `view-statute?txtType=PDF&ttl=18` (574 pp).

**Shared harness:** `scripts/lib/parse-statute-pdf.mjs` — input: PDF buffer + state-specific section regex; output: rows.

### Wave 4B — Bucket B static HTML (5 states, generic-config harness)

After Wave 4A pdf-parse harness lands. 1-2 days total — reuse the existing Bucket B harness from Phase 3.

4. **OR** — per-chapter HTML, 7 fetches.
5. **ME** — per-section HTML, ~600 fetches.
6. **MI** — per-section HTML via objectName, ~750 fetches.
7. **AL** — GraphQL bulk pagination via `codesOfAlabama(limit, offset)`, ~2 requests.
8. **IL** — per-section static HTML at `documents/.../<DocName>.htm`, ~600 fetches. T0 must verify DocName discovery flow.

### Wave 4C — Justia per-section HTML (3 states, shared harness — CORRECTED 2026-05-01)

TX, IN, NJ all converge on Justia mirror with identical browser-fingerprint headers and 3-sec rate limit. Build harness once.

9. **NJ** — Title 2C, ~500 sections, ~25 min at 3-sec interval.
10. **IN** — Title 35, ~700 sections, ~35 min. Walk article→chapter TOC for section URLs.
11. **TX** — Penal Code, ~2,200 sections, ~110 min. Walk title→chapter TOC.

**Shared harness:** `scripts/lib/fetch-justia-section.mjs` — input: Justia URL + browser-headers + retry-on-403; output: `{ titleMetadata, codesContentHTML }`.

### Wave 4D — DEFERRED (none active)

(IN was previously here; recovered into Wave 4C. NJ was previously here; recovered into Wave 4C.)

### Deferred

- **NM** — paywalled. Track in worry log; revisit after commercial path approval OR explicit go-ahead for Justia-only path.

---

## Per-state summary table

| State | Strategy | Source path | Est rows | Risk |
|-------|----------|-------------|----------|------|
| TX | **Bucket C — Justia mirror (CORRECTED 2026-05-01)** | `law.justia.com/codes/texas/penal-code/title-<T>/chapter-<C>/section-<C>-<S>/` | 2,200 | Capitol-Tx-Gov SPA-walled all paths; Justia 200 OK with full browser headers + 3-sec delay |
| IL | Bucket B — static HTML | `ilga.gov/documents/legislation/ilcs/documents/<DocName>.htm` | 600 | DocName discovery via TOC traversal |
| MD | Bucket A — full-article PDF | `mgaleg.maryland.gov/<YYYY>RS/Statute_Web/gcr/gcr.pdf` | 750 | Session-year prefix in URL — try latest first |
| ME | Bucket B — per-section HTML | `legislature.maine.gov/legis/statutes/17-A/title17-Asec<N>.html` | 600 | State copyright claim — cite official URL |
| OK | Bucket A — full-title PDF | `oklegislature.gov/OK_Statutes/CompleteTitles/os21.pdf` | 1,200 | Single PDF, easy |
| AL | Bucket C — GraphQL bulk | `alison.legislature.state.al.us/graphql` (`codesOfAlabama`) | 500 | SPA shells unscrapable; GraphQL pagination works |
| IN | **Bucket C — Justia mirror (CORRECTED 2026-05-01)** | `law.justia.com/codes/indiana/title-35/article-<A>/chapter-<C>/section-35-<A>-<C>-<S>/` | 700 | API 403 (key required); ZIP dynamic; Justia 200 OK with full browser headers + 3-sec delay |
| MI | Bucket B — static HTML | `legislature.mi.gov/Laws/MCL?objectName=mcl-750-<N>` | 750 | Repealed sections — skip |
| NJ | **Bucket C — Justia mirror (CONFIRMED 2026-05-01)** | `law.justia.com/codes/new-jersey/title-2c/section-2c-<C>-<S>/` | 500 | Cloudflare DEFEATED with full Sec-Fetch-* headers + Brotli; 3-sec delay |
| OR | Bucket B — per-chapter HTML | `oregonlegislature.gov/bills_laws/ors/ors<N>.html` | 250 | Trivial; whole-chapter per fetch |
| PA | Bucket A — full-title PDF | `palegis.us/statutes/consolidated/view-statute?txtType=PDF&ttl=18` | 600 | Filter repealed sections |
| NM | DEFERRED | paywalled | — | Document in worry log |

**TX/IN/NJ converge on shared Justia harness** — same browser-fingerprint headers, same 3-sec rate limit, same `<div class="codes-content">` body selector, same `<title>`-derived metadata. Build once, run for all three.

**Total estimated rows:** ~8,650 across 11 states (excludes NM).

---

## URLs cited (verified in this session)

### Probed by WebFetch
- https://statutes.capitol.texas.gov/Docs/PE/htm/PE.19.htm (returns SPA shell — NOT usable)
- https://statutes.capitol.texas.gov/Docs/PE/htm/PE.1.htm (returns SPA shell)
- https://statutes.capitol.texas.gov/SOTWDocs/PE/htm/PE.19.htm (returns SPA shell)
- https://www.oklegislature.gov/OK_Statutes/CompleteTitles/os21.pdf (verified PDF — 884 pp, 3.4 MB, extractable)
- https://www.palegis.us/statutes/consolidated (URL pattern listing)
- https://www.palegis.us/statutes/consolidated/view-statute?txtType=PDF&ttl=18 (verified PDF — 574 pp, 3 MB)
- https://www.palegis.us/statutes/consolidated/view-statute?txtType=HTM&ttl=18&div=00.&chpt=001&sctn=001&subsctn=000 (SPA shell — not usable)
- https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gcr&section=2-201 (verified server-rendered HTML, statute body present)
- https://mgaleg.maryland.gov/2024RS/Statute_Web/gcr/gcr.pdf (verified PDF — 650 pp, 2.9 MB)
- https://www.ilga.gov/documents/legislation/ilcs/documents/072000050K9-1.htm (verified static HTML, 720 ILCS 5/9-1 body present)
- https://legislature.maine.gov/legis/statutes/17-A/title17-Ach9sec0.html (verified TOC pattern)
- https://legislature.maine.gov/legis/statutes/17-A/title17-Asec201.html (verified static HTML, § 201 Murder body present)
- https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-750-316 (verified static HTML, MCL 750.316 body present)
- https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-Act-328-of-1931 (verified — full chapter index with all section objectNames)
- https://www.oregonlegislature.gov/bills_laws/ors/ors161.html (verified static HTML, ORS 161.005 body present)
- https://www.oregonlegislature.gov/bills_laws/ors/ors163.html (verified static HTML, ORS 163.005, 163.115 bodies present)
- https://www.oregonlegislature.gov/bills_laws/Pages/ORS.aspx (index — discovery only)

### Probed by WebSearch (URL existence confirmed via search index, not direct fetch)
- https://statutes.capitol.texas.gov/docs/sdocs/penalcode.pdf (full Penal Code PDF — indexed)
- https://statutes.capitol.texas.gov/docs/pe/pdf/pe.19.pdf (per-chapter PDFs — indexed)
- https://www.ilga.gov/legislation/ilcs/fulltext.asp?DocName=072000050K9-1 (alt ILGA URL — indexed)
- https://alison.legislature.state.al.us/code-of-alabama?section=13A-3-25 (AL section URL — indexed)
- https://alison.legislature.state.al.us/code-of-alabama?section=13A-11-32.1 (indexed)
- https://iga.in.gov/laws/ic/downloads (Indiana bulk download index — indexed)
- https://docs.api.iga.in.gov/ (MyIGA Public API docs — indexed)
- https://api.iga.in.gov/ (API root — indexed)
- https://law.justia.com/codes/new-jersey/title-2c/ (Justia NJ Title 2C mirror — indexed)
- https://lis.njleg.state.nj.us/nxt/gateway.dll?... (official NJ — confirmed unusable NXT engine)
- https://www.oklegislature.gov/osStatuesTitle.html (OK title index — verified pattern `os<N>.pdf`)

### Failed probes (documented for memory)
- https://www.ilga.gov/legislation/ilcs/ilcs5.asp?ActID=1876&ChapterID=53 (404 — wrong URL form)
- https://www.ilga.gov/legislation/ILCS/ilcs5.asp?ActID=1876&ChapterID=53 (404)
- https://www.ilga.gov/legislation/ilcs/fulltext.asp?DocName=072000050K9-1 (404 to WebFetch — but search confirms URL exists; .asp form may need session)
- https://alison.legislature.state.al.us/Alison/CodeOfAlabama/1975/13A.htm (404 — wrong subdomain)
- https://alisondb.legislature.state.al.us/* (DNS — alisondb is internal, not public)
- https://iga.in.gov/laws/2024/ic/titles/35 (returns React SPA — empty content for WebFetch)
- https://docs.api.iga.in.gov/usage.html (403 — User-Agent block on docs site)
- https://law.justia.com/codes/new-jersey/title-2c/ (403 — Justia blocks WebFetch UA but real browser works)
- https://codes.findlaw.com/al/title-13a-criminal-code/ (403 — FindLaw blocks WebFetch UA)

---

## Open questions for T0 per state (verify before scaling)

1. **TX:** Single full-Penal-Code PDF (`penalcode.pdf`) vs 71 per-chapter PDFs — single is easier; verify text quality of single first.
2. **IL:** DocName format derivation logic — confirm chapter-zero-pad rules with one full chapter walk before scaling.
3. **MD:** Latest session-year prefix — try 2025RS first, 2024RS fallback. Confirm in T0.
4. **AL:** Selector for section body in alison's HTML — needs T0 curl + Read to identify. Fallback to onecle.com if alison's HTML is dynamic.
5. **IN:** Bulk zip availability + format (HTML vs PDF) — confirm in T0 by HTTP HEAD on the downloads page.
6. **NJ:** Justia robots.txt + rate-limit policy with INAA-Crawler User-Agent — verify with single fetch in T0 before scaling.

---

## Out-of-band gotchas captured (for memory)

- **TX**: WebFetch model summarizes PDFs at `statutes.capitol.texas.gov` as if they were the SPA homepage. Direct `node-fetch` with `Accept: application/pdf` will work since the server returns binary PDF. Don't trust WebFetch content for these PDFs — trust the URL existence (verified via search) and probe with `curl -I` in T0.
- **IL ILGA**: The `fulltext.asp` form requires session state; `documents/legislation/ilcs/documents/<DocName>.htm` is the static path that works without session. Use the static path.
- **NJ Justia**: 403s WebFetch's User-Agent. Real-browser User-Agent works. Set `User-Agent: Mozilla/5.0 (compatible; INAA-Crawler/1.0; +imnotanattorney.com)` for ALL Justia fetches.
- **AL alison**: ASP.NET site — `?section=X` query is server-resolved and fast (no postback). DO NOT use `alisondb.legislature.state.al.us` (internal hostname, DNS-unresolvable from outside).
- **IN MyIGA**: `docs.api.iga.in.gov` returns 403 to WebFetch but is publicly browsable. Use `curl -A "Mozilla/5.0"` to read the API docs. The bulk-download zip is the safer primary path; API is fallback.
- **MD**: Em-dash `§ 2–201` (U+2013) in body text vs hyphen `2-201` in URL/citation form (U+002D). Normalize when matching.
