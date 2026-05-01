# 50-State Criminal Statute Coverage — Triage Survey

**Status:** RESEARCH-COMPLETE — full per-state bucket survey + scrape-difficulty matrix. Capstoned 2026-05-01. Drives Phase 3/4 ingest order; no execution work owned by this doc.

**Created:** 2026-04-30 (filename anchored 2026-05-01 per spec)
**Author:** general-purpose research agent
**Scope:** Identify the FASTEST mechanical-citation path for the 43 remaining US states + DC
**Status of shipped work:** FL (470 rows), VA (595), OH (433), NC (3,342), WA (606), USC (36), AZ (236 in flight) — 7/51 = ~14%
**Goal:** Re-plan ingest sequence based on per-state source quality

---

## Bucket Definitions (recap)

- **Bucket A** — Authoritative bulk feed: full-title XML/ZIP/PDF download, no scraping required, machine-readable structure or single-document parse.
- **Bucket B** — Structured HTML, well-templated: consistent URL pattern `{base}/{chapter}/{section}` + stable selectors. Generic config tuple covers the state.
- **Bucket C** — Hostile / quirky: SPA-rendered, Cloudflare-fronted, dropdown-only navigation, 60s+ crawl-delay, RTF-only, Lexis-paywalled.

---

## Per-State Table (alphabetical)

```
STATE | BUCKET | SOURCE_URL                                                              | CRAWL_DELAY | NOTES
------|--------|-------------------------------------------------------------------------|-------------|----------------------------------------------------------------
AL    | C      | https://alison.legislature.state.al.us/code-of-alabama                  | unknown     | ASP.NET, no public bulk; alisondb backend; consider unicourt cic-code-al if exists
AK    | A      | https://unicourt.github.io/cic-code-ak/ (HTML) + https://www.akleg.gov  | n/a         | UniCourt has full Title 11 as HTML; Public.Resource.Org backed
AR    | A      | https://unicourt.github.io/cic-code-ar/ + law.resource.org/pub/us/code/ar/ | n/a       | Title 5 (Criminal Offenses) full HTML, Public.Resource.Org bulk
CA    | A      | ftp://leginfo.public.ca.gov/pub/ + law.resource.org/pub/us/code/ca/     | n/a (FTP)   | Official FTP dump of all CA codes; Public.Resource.Org mirror; Penal Code = PEN
CO    | A      | https://unicourt.github.io/cic-code-co/ + content.leg.colorado.gov      | n/a         | UniCourt HTML + state PDF (crs2024-title-18.pdf full Title 18); both work
CT    | B      | https://www.cga.ct.gov/current/pub/title_53a.htm                        | unknown     | Title 53a (Penal Code) at predictable URL; chapter HTML pages well-templated; LCO publishes
DE    | A      | https://delcode.delaware.gov/title11/title11.pdf                        | unknown     | Single full-Title-11 PDF; clean structure; HTML per-chapter at /title11/cNNN/index.html
GA    | A      | https://unicourt.github.io/cic-code-ga/ + law.resource.org/pub/us/code/ga/ | n/a       | Title 16 full HTML; Public.Resource.Org won lawsuit vs LexisNexis on copyright
HI    | B      | https://www.capitol.hawaii.gov/hrsall/                                  | unknown     | Per-chapter HTML; HRS Title 37 Ch 707 (Offenses Against the Person); URL pattern testable
ID    | A      | https://unicourt.github.io/cic-code-id/ + legislature.idaho.gov         | n/a         | UniCourt full Title 18; per-chapter PDFs available on state site (T18CH1.pdf etc)
IL    | B?     | https://www.ilga.gov/legislation/ILCS/Chapters                          | unknown     | 720 ILCS 5 = Criminal Code; per-act ASP pages; templating consistent but URL params nasty (?ChapterID=53&ActID=1876)
IN    | B?     | https://iga.in.gov/laws/current/ic/titles/35                            | unknown     | SPA-rendered (likely React) — fetch returned blank; iga.in.gov/laws/ic/downloads page exists, content unverified
IA    | B      | https://www.legis.iowa.gov/docs/code/{year}/{chapter}.pdf               | unknown     | Per-chapter PDFs at predictable path (e.g. /docs/code/2021/708.pdf); whole-code PDF NOT confirmed
KS    | B      | https://ksrevisor.gov/statutes/ksa_ch21.html                            | unknown     | Per-chapter single-HTML files; ch21 = Crimes and Punishments; clean URL pattern
KY    | A      | https://unicourt.github.io/cic-code-ky/ + apps.legislature.ky.gov       | n/a         | UniCourt cic-code-ky exists (per the cic-beautify repo list); state site uses opaque id= param (chapter.aspx?id=39372)
LA    | B      | https://www.legis.la.gov/legis/Laws_Toc.aspx?folder=88&title=14         | unknown     | Title 14 (Criminal Law) ASP pages; folder/title param structure; Laws_Toc TOC is hierarchical
ME    | A      | https://legislature.maine.gov/statutes/17-A/title17-A.pdf               | unknown     | Single full Title 17-A PDF (MAINE CRIMINAL CODE); per-section PDFs also at title17-AsecXXXX.pdf; STATE CLAIMS COPYRIGHT
MD    | C      | https://mgaleg.maryland.gov/2022RS/Statute_Web/gcr/gcr.pdf              | unknown     | Per-article PDFs (gcr = Criminal Law); annotated version is Lexis-paywalled; bulk path uses session-year prefix
MA    | B      | https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter{N}/Section{S} | unknown | Clean URL pattern (verified 2/5 difficulty); chapter 265 (crimes vs person) + 266 (property)
MI    | C      | https://www.legislature.mi.gov/Laws/MCL?objectName=MCL-CHAP{N}          | unknown     | Per-chapter HTML; "Download Chapter" button exists on each chapter page (likely PDF); criminal code = chapters 750+
MN    | B      | https://www.revisor.mn.gov/statutes/cite/{N}                            | unknown     | Predictable URL pattern (cite/609 = criminal code); per-section also (cite/609.01); HTML well-structured
MS    | A      | https://unicourt.github.io/cic-code-ms/ + law.resource.org/pub/us/code/ms/ | n/a       | UniCourt full Title 97; Public.Resource.Org bulk
MO    | B      | https://revisor.mo.gov/main/OneChapter.aspx?chapter={N}                 | unknown     | Per-chapter dump HTML at OneChapter.aspx (verified 2/5 difficulty); per-section uses opaque bid= param but chapter-dump is enough
MT    | B      | https://mca.legmt.gov/bills/mca/title_{NNNN}/chapters_index.html        | unknown     | Title 45 = Crimes; zero-padded title path; per-chapter index pages; per-section deep links available
NE    | B      | https://nebraskalegislature.gov/laws/laws-index/chap{N}-full.html       | unknown     | Single-page per-chapter dump (verified 2/5 difficulty); chap28-full.html = Crimes and Punishments
NV    | B      | https://www.leg.state.nv.us/NRS/NRS-{N}.html                            | unknown     | Per-chapter HTML at predictable URL; chapter 200 = Crimes Against the Person
NH    | B      | https://gc.nh.gov/rsa/html/NHTOC/NHTOC-LXII.htm                         | unknown     | Title LXII = Criminal Code; per-section HTML files at gc.nh.gov/rsa/html/{XXX}/{XXX-X}/{XXX-X-mrg.htm}
NJ    | C      | https://lis.njleg.state.nj.us/nxt/gateway.dll                           | unknown     | Title 2C (Code of Criminal Justice); NXT engine — opaque URLs, NOT well-templated; consider Justia mirror as fallback
NM    | C      | https://www.nmonesource.com/ (NM Compilation Commission)                | unknown     | Compilation Commission OneSource; access tier unclear; nmlegis.gov has bills not codified statutes
NY    | A      | https://legislation.nysenate.gov/api/3/laws/PEN?full=true               | API key req | Open Legislation v2 API; full-tree JSON includes all sections of Penal Law (PEN); free API key
ND    | A      | https://unicourt.github.io/cic-code-nd/ + ndlegis.gov/cencode/t12-1.html | n/a        | UniCourt full Title 12.1; state site has clean per-chapter HTML
OK    | A      | https://www.oklegislature.gov/OK_Statutes/CompleteTitles/os21.pdf       | unknown     | Single full-Title-21 PDF (Crimes and Punishments); CompleteTitles/osNN.pdf pattern likely covers all titles
OR    | A      | https://www.oregonlegislature.gov/bills_laws/Archive/{YEAR}ors{N}.pdf + law.resource.org/pub/us/code/or/ | unknown | Annual archived PDFs per chapter; chapter 161 = General Provisions criminal; Public.Resource.Org also has bulk (won PRO v. State of Oregon)
PA    | C      | https://www.palegis.us/statutes/consolidated/view-statute?txtType=HTM&ttl=18 | unknown | NO bulk download (palegis.us/data only has bill history); ColdFusion-style URLs with ttl/div/chapter/section params; needs bespoke
RI    | B      | https://webserver.rilegislature.gov/Statutes/TITLE11/INDEX.HTM          | unknown     | Title 11 = Criminal Offenses; per-chapter HTML directory; Public.Resource.Org likely also has via cic-code-ri
SC    | B      | https://www.scstatehouse.gov/code/t16c{NNN}.php                         | unknown     | Title 16 = Crimes; per-chapter PHP page (e.g. t16c001.php through t16c0NN.php); zero-padded chapter, simple URL
SD    | B      | https://sdlegislature.gov/api/Statutes/{N}.html?all=true                | unknown     | API endpoint returns FULL title HTML in one shot (Title 22 = Crimes); cleanest of any state — strong candidate
TN    | A      | https://unicourt.github.io/cic-code-tn/transforms/tn/octn/r73/gov.tn.tca.title.39.html | n/a | UniCourt cic-code-tn full Title 39 HTML; Public.Resource.Org backed; state PDFs only via legislative acts
TX    | B      | https://statutes.capitol.texas.gov/Docs/PE/htm/PE.{N}.htm               | unknown     | Per-chapter HTML at predictable URL (PE = Penal Code, 1 to 71); also /docs/pe/pdf/pe.N.pdf PDFs; download.aspx mentioned but content unverified
UT    | B      | https://le.utah.gov/xcode/Title76/Chapter{N}/76-{N}.html                | unknown     | Title 76 = Utah Criminal Code; per-chapter HTML + per-section (76-N-SXXX.html); xcode subdirectory consistent
VT    | A      | https://unicourt.github.io/cic-code-vt/ + legislature.vermont.gov/statutes/title/13 | n/a | UniCourt + state HTML; State of Vermont CLAIMS COPYRIGHT
WV    | B      | https://code.wvlegislature.gov/{N}/                                     | unknown     | Per-chapter URL (61 = Crimes); per-article URL (61-3); per-section URL with section= param; clean templating
WI    | B      | https://docs.legis.wisconsin.gov/statutes/statutes/{N}.pdf              | unknown     | Per-chapter PDF (939, 940, 943 = criminal); also xrefs HTML pages with deep linking; PDFs are clean
WY    | A      | https://wyoleg.gov/statutes/compress/title{NN}.pdf                      | unknown     | SINGLE full-title PDF + DOCX (title06.pdf = Crimes and Offenses); plus full-state download page at /StateStatutes/StatutesDownload
DC    | A      | https://github.com/dccouncil/law-xml + https://github.com/dccouncil/law-html | n/a    | OFFICIAL bulk XML repo on GitHub ("please do not scrape, use bulk download"); Title 22 = Criminal Offenses
```

---

## Bucket Counts

- **Bucket A (authoritative bulk):** 16 states/jurisdictions
  AK, AR, CA, CO, DE, GA, ID, KY, ME, MS, ND, NY, OK, TN, VT, WY, DC = **17**
- **Bucket B (templated HTML, generic-config):** 17 states
  CT, HI, IA, KS, LA, MA, MN, MO, MT, NE, NV, NH, RI, SC, SD, TX, UT, WV, WI = **19**
- **Bucket C (hostile / quirky):** 5 states
  AL, MD, MI, NJ, NM, PA = **6**
- **Bucket B? (unclear, needs probe):** IL, IN = **2**

(43 remaining states + DC = 44; plus AZ in flight = 45; counts above = 17+19+6+2 = 44 ✓)

---

## Recommendations

### Wave 1 — Bucket A Quick Wins (start immediately, parallel-able)

**Free pre-cleaned bulk via Public.Resource.Org + UniCourt cic-code repos** (these are the same data):
1. **AK, AR, CO, GA, ID, MS, ND, TN, VT** — 9 states with `unicourt.github.io/cic-code-{xx}/` HTML repos derived from the same RTF source files Public.Resource.Org liberated in landmark public-domain wins (PRO v. State of Oregon, PRO v. LexisNexis re Georgia). Single port script: clone repo → parse HTML titles 11/13/12.1/16/97/39/etc per state. Estimated: 1-2 hrs per state once template harness exists; first state takes 4 hrs to build the harness.
2. **DC** — `github.com/dccouncil/law-xml` is the only state-level OFFICIAL Akoma-Ntoso-style XML drop. Clone, parse Title 22. Best-in-class shape. ~2 hrs.
3. **CA** — FTP at `ftp://leginfo.public.ca.gov/pub/` (file-format unverified due to FTP fetch limitation, but Public.Resource.Org also mirrors at `law.resource.org/pub/us/code/ca/`). PEN code. ~3 hrs.
4. **NY** — `legislation.nysenate.gov/api/3/laws/PEN?full=true` returns full Penal Law as JSON. API key needed (free). Cleanest API of any state. ~2 hrs.
5. **DE, ME, OK, WY** — single full-title PDF endpoint (`title11.pdf`, `title17-A.pdf`, `os21.pdf`, `title06.pdf`). PDF parsing required but consistent. ~2-3 hrs each.

**Wave 1 total: ~17 jurisdictions in roughly 2-3 days of focused work.**

### Wave 2 — Bucket B Generic-Config Sweep

Build ONE generic HTML scraper with this config shape:

```js
const STATE_CONFIG = {
  state: 'XX',
  baseUrl: '...',
  titlePath: '/title/{N}',           // or '/chapter/{N}/' or '/cite/{N}'
  chapterListSelector: 'a[href*="..."]',
  sectionListSelector: '...',
  sectionTitleSelector: 'h1, h2.section-title, ...',
  sectionBodySelector: '.statute-body, #content, ...',
  citationFormat: 'X.YY-ZZ',         // for canonical citation generation
  crawlDelaySec: 2,                  // default; override per state from robots.txt
  charset: 'utf-8',
};
```

Then ship per-state config tuples. Order of priority (highest signal-to-effort first):

1. **SD** — `sdlegislature.gov/api/Statutes/22.html?all=true` returns ENTIRE title in one HTML doc. Trivial.
2. **MA** — verified 2/5 difficulty; clean URL pattern `/Chapter{N}/Section{S}`.
3. **NE** — full-chapter dumps `chap28-full.html`, single fetch per chapter.
4. **MO** — `OneChapter.aspx?chapter=N` dumps full chapter; verified 2/5.
5. **MN** — `revisor.mn.gov/statutes/cite/{N}` predictable.
6. **WV** — `code.wvlegislature.gov/{N}/` clean per-chapter.
7. **TX** — known pattern `Docs/PE/htm/PE.N.htm`; chapters 1 to ~71.
8. **SC, NV, NH, KS, MT, UT, RI, CT, HI, LA, WI, IA** — moderate effort, good templating.

**Wave 2 total: ~19 states in 5-7 days using generic harness.**

### Wave 3 — Bucket C Bespoke

Save for last. Each needs custom approach:
- **PA** — no bulk; ColdFusion params; Justia/FindLaw mirror is the realistic path.
- **MI** — per-chapter "Download Chapter" buttons (likely PDFs); needs button-discovery scrape.
- **NJ** — NXT engine, opaque URLs; Justia mirror probably best.
- **AL** — ASP.NET; UniCourt cic-code-al should be checked; if absent, scrape alisondb.
- **MD** — per-article PDF only; annotated version paywalled.
- **NM** — OneSource access tier unclear; Justia likely the only free path.

**Wave 3 total: ~6 states, ~3-4 hrs each = 1-2 days.**

### Unclear (needs 5-min probe before scheduling)

- **IL** — ILCS Chapter 720 act 5 — verify if `ilcs2.asp?ChapterID=53` returns clean HTML or SPA.
- **IN** — `iga.in.gov` returned blank to WebFetch; needs Playwright probe to confirm SPA. Look at `iga.in.gov/laws/ic/downloads` page directly.

---

## Generic Parser Config Shape (Bucket B harness)

```ts
type StateStatuteConfig = {
  stateCode: string;                  // e.g. 'MA', 'NE'
  source: 'html' | 'pdf' | 'api' | 'xml';
  baseUrl: string;                    // root for the criminal title
  titleNumber: string;                // e.g. '76' (UT), '2C' (NJ), '17-A' (ME)
  chapters: number[] | { from: number; to: number };
  chapterUrl: (n: string) => string;  // e.g. (n) => `${base}/76-${n}.html`
  sectionUrl?: (chap: string, sec: string) => string;
  selectors: {
    chapterTitle: string;
    sectionLink?: string;
    sectionTitle: string;
    sectionBody: string;
  };
  citationFormat: string;             // template — '${state} Code § ${title}-${chap}-${sec}'
  crawlDelaySec: number;
  userAgent: string;                  // INAA-Crawler/1.0 (legal-research; +imnotanattorney.com)
  charset?: 'utf-8' | 'iso-8859-1';
};
```

This covers ~17 of 19 Bucket B states cleanly. The 2 outliers (IL with `ChapterID/ActID` params; LA with `folder/title` params) need a slightly extended config (`urlParamMap: Record<string, string>`).

---

## Risks & Footguns

1. **State copyright claims** — ME and VT explicitly assert copyright on codified text. Public.Resource.Org argues primary law cannot be copyrighted (won the Georgia case at SCOTUS in *Georgia v. PRO* 2020). For our use we should: (a) cite the official state URL as `source_url`, (b) include the state's required attribution notice in any generated artifact, (c) link rather than republish where the legal posture is most aggressive.
2. **PDF parsing — non-trivial for OK, ME, WY, DE.** Single full-title PDFs sound easy but layouts vary (multi-column on some, sidebars with annotations on others). Budget 1-2 hrs per state for PDF table-of-contents extraction logic; reuse parser across all PDF states.
3. **AZ-style 120s+ crawl-delay** — I did NOT explicitly probe robots.txt for any state in this survey (time-box). Before scheduling Wave 2 ingest, check `{baseUrl}/robots.txt` for every Bucket B state. If any declares `Crawl-delay > 30s`, route that state to engine workers (per `gotcha-az-leg-robots-120s.md`), not Vercel cron.
4. **UniCourt cic-code repos** are last-updated mid-2022 (releases 71-80). The HTML reflects code state at that time. Annual freshness drift will need a "verify against current state site URL" step at row-write time. Mitigation: store both the UniCourt-derived text AND a current-state HTTPS source_url; cron job re-verifies the `last_known_text_hash` monthly.
5. **NJ NXT and PA ColdFusion** are the genuinely hostile cases. Justia mirror is acceptable as a parsing target IF we cite the official state URL (which exists, just isn't structured for crawl). Same data, different surface.
6. **DC GitHub repo last updated 2016 per fetch.** For DC in particular, validate against current code.dccouncil.gov before declaring rows good-law. The XML may be a convenient parse target with current text fetched section-by-section for the small Title 22 surface.

---

## Path Forward

**Recommended sequence for Phase 3 plan:**

- **Phase 3a (Wave 1):** Build UniCourt+PublicResource harness once → port AK, AR, CO, GA, ID, MS, ND, TN, VT (9 states, 1 harness). Add NY API (1 state, ~2 hrs). Add DC GitHub XML (1 state, ~2 hrs). Add CA FTP+PRO mirror (1 state, ~3 hrs). Add DE/ME/OK/WY PDF parser (4 states, 1 PDF parser). **Total: 16 states in ~2-3 days.**
- **Phase 3b (Wave 2):** Build generic Bucket B HTML harness → ship 19 state configs (SD, MA, NE, MO, MN, WV, TX, SC, NV, NH, KS, MT, UT, RI, CT, HI, LA, WI, IA). **Total: 19 states in ~5-7 days using shared harness.**
- **Phase 3c (Wave 3):** Bespoke pass for AL, MD, MI, NJ, NM, PA (probe IL, IN first to bucket properly). **Total: ~6-8 states in ~1-2 days.**

**End state:** 50 states + DC + USC = 52 jurisdictions × verified mechanical-citation rows with HTTPS source_urls. Total estimated time: **8-12 working days** vs the 50+ days current bespoke per-state pace would take.

---

## Sources Consulted

### Cross-state resources
- [Public.Resource.Org — main site](https://public.resource.org/)
- [Law.Resource.Org — pub/us/code/ directory](https://law.resource.org/pub/us/code/)
- [UniCourt cic-beautify-state-codes — GitHub](https://github.com/UniCourt/cic-beautify-state-codes)
- [Open States Bulk Data (bills, not statutes — for context)](https://open.pluralpolicy.com/data/)
- [Akoma Ntoso — Wikipedia](https://en.wikipedia.org/wiki/Akoma_Ntoso)

### Per-state primary sources (one each, representative)
- [TX statutes.capitol.texas.gov Penal Code](https://statutes.capitol.texas.gov/Docs/PE/htm/PE.1.htm)
- [NY Open Legislation API laws](https://legislation.nysenate.gov/static/docs/html/laws.html)
- [CA leginfo Penal Code](https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=PEN)
- [PA palegis.us data](https://www.palegis.us/data)
- [IL ilga.gov/legislation/ILCS](https://www.ilga.gov/legislation/ILCS/Chapters)
- [MI legislature.mi.gov MCL](https://legislature.mi.gov/Laws/MCLSearch)
- [NJ lis.njleg.state.nj.us](https://lis.njleg.state.nj.us/nxt/gateway.dll?f=templates&fn=default.htm&vid=Publish:10.1048/Enu)
- [GA lexisnexis.com/hottopics/gacode](https://www.lexisnexis.com/hottopics/gacode/default.asp)
- [UniCourt cic-code-ga (Georgia)](https://unicourt.github.io/cic-code-ga/)
- [MA malegislature.gov Chapter 265](https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter265)
- [AL alison.legislature.state.al.us](https://alison.legislature.state.al.us/code-of-alabama)
- [CO content.leg.colorado.gov Title 18 PDF](https://content.leg.colorado.gov/sites/default/files/images/olls/crs2024-title-18.pdf)
- [MN revisor.mn.gov chapter 609](https://www.revisor.mn.gov/statutes/cite/609)
- [CT cga.ct.gov Title 53a](https://www.cga.ct.gov/current/pub/title_53a.htm)
- [IN iga.in.gov Title 35](https://iga.in.gov/laws/2024/ic/titles/35)
- [WI docs.legis.wisconsin.gov](https://docs.legis.wisconsin.gov/statutes/prefaces/toc)
- [MO revisor.mo.gov chapter 565](https://revisor.mo.gov/main/OneChapter.aspx?chapter=565)
- [TN unicourt cic-code-tn Title 39](https://unicourt.github.io/cic-code-tn/transforms/tn/octn/r73/gov.tn.tca.title.39.html)
- [NV leg.state.nv.us NRS](https://www.leg.state.nv.us/nrs/)
- [OK oklegislature.gov Title 21 PDF](https://www.oklegislature.gov/OK_Statutes/CompleteTitles/os21.pdf)
- [HI capitol.hawaii.gov hrsall](https://www.capitol.hawaii.gov/hrsall/)
- [AK akleg.gov statutes](https://www.akleg.gov/basis/statutes.asp)
- [AR arkleg.state.ar.us](https://arkleg.state.ar.us/ArkansasLaw/)
- [DE delcode.delaware.gov Title 11 PDF](https://delcode.delaware.gov/title11/title11.pdf)
- [ID legislature.idaho.gov Title 18](https://legislature.idaho.gov/statutesrules/idstat/title18/)
- [ME legislature.maine.gov Title 17-A PDF](https://legislature.maine.gov/statutes/17-A/title17-A.pdf)
- [MS unicourt cic-code-ms Title 97](https://unicourt.github.io/cic-code-ms/transforms/ms/ocms/r72/gov.ms.code.title.97.html)
- [MT mca.legmt.gov Title 45](https://mca.legmt.gov/bills/mca/title_0450/chapters_index.html)
- [NE nebraskalegislature.gov chapter 28](https://nebraskalegislature.gov/laws/laws-index/chap28-full.html)
- [NH gc.nh.gov Title LXII](https://gc.nh.gov/rsa/html/NHTOC/NHTOC-LXII.htm)
- [NM nmlegis.gov chapter 30 (handout)](https://www.nmlegis.gov/handouts/CJRS%20102219%20Item%203%20Miscellaneous%20Statutes.pdf)
- [ND ndlegis.gov Title 12.1](https://ndlegis.gov/cencode/t12-1.html)
- [OR oregonlegislature.gov ORS 161](https://www.oregonlegislature.gov/bills_laws/ors/ors161.html)
- [RI webserver.rilegislature.gov Title 11](https://webserver.rilegislature.gov/Statutes/TITLE11/INDEX.HTM)
- [SC scstatehouse.gov Title 16](https://www.scstatehouse.gov/code/title16.php)
- [SD sdlegislature.gov Title 22 API](https://sdlegislature.gov/api/Statutes/22.html?all=true)
- [UT le.utah.gov Title 76](https://le.utah.gov/xcode/Title76/76.html)
- [VT legislature.vermont.gov Title 13](https://legislature.vermont.gov/statutes/title/13)
- [WV code.wvlegislature.gov chapter 61](https://code.wvlegislature.gov/61/)
- [WY wyoleg.gov Title 6 PDF](https://wyoleg.gov/statutes/compress/title06.pdf)
- [WY StateStatutes download portal](https://www.wyoleg.gov/StateStatutes/StatutesDownload)
- [DC code.dccouncil.gov Title 22](https://code.dccouncil.gov/us/dc/council/code/titles/22)
- [DC Council law-xml GitHub](https://github.com/dccouncil/law-xml)
- [LA legis.la.gov Title 14](https://www.legis.la.gov/legis/Laws_Toc.aspx?folder=88&title=14)
- [KY apps.legislature.ky.gov chapter 507](https://apps.legislature.ky.gov/law/statutes/chapter.aspx?id=39372)
- [KS ksrevisor.gov chapter 21](https://ksrevisor.gov/statutes/ksa_ch21.html)
- [IA legis.iowa.gov chapter 708 PDF](https://www.legis.iowa.gov/docs/code/708.1.pdf)
- [MD mgaleg.maryland.gov Criminal Law PDF](https://mgaleg.maryland.gov/2022RS/Statute_Web/gcr/gcr.pdf)
- [AZ azleg.gov Title 13 (already in flight)](https://www.azleg.gov/arsDetail/?title=13)
