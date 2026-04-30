# AZ Statutes — Coverage Matrix (T0 research)

Date: 2026-04-30
Plan: docs/plans/2026-04-30-worry-statute-phase2.md (T0)

## Canonical host
www.azleg.gov

## Source root
https://www.azleg.gov/arsDetail/

Title-listing pattern: `https://www.azleg.gov/arsDetail/?title=<N>`
Section-page pattern: `https://www.azleg.gov/ars/<title>/<5-digit-section>.htm` (zero-padded section, e.g. §13-1105 → `/ars/13/01105.htm`).

## Content-Type verified: text/html
Sample URL probed: https://www.azleg.gov/ars/13/01105.htm (§13-1105 first-degree murder) and https://www.azleg.gov/ars/28/01381.htm (§28-1381 DUI).
Response Content-Type header verbatim: `text/html` — unverified specific charset; needs live `curl -I` probe by T2 author. Body confirmed HTML (statute text + subsection lettering A–R) on both URLs.

## robots.txt excerpt
```
User-agent: *
Crawl-delay: 120
Disallow: /FormatDocument.asp
Disallow: /FormatForPrint.asp
Disallow: /ExecutiveNominationsByNominee.asp
Disallow: /DocumentsForBill.asp
Disallow: /aspWebCalendar/
Disallow: /xml/
Disallow: /aspnet_client/
Disallow: /search/
Disallow: /Wordpress/
sitemap: http://www.azleg.gov/robotsitemap.xml
Disallow: /azlegwp/
```
`/ars/`, `/arsDetail/` paths are NOT disallowed — crawl permitted.

## Crawl-delay observed: 120 seconds
Verbatim `Crawl-delay: 120` for `User-agent: *`. AZ enforces a strict 2-minute delay. At 120s/section and ~37 chapters in Title 13 alone (avg 30 sections/chapter), full Title 13 ingest ≈ 37 hours minimum. Plan must budget multi-day ingest window. NOT 2.0s default — 120s hard.

## Chapter URL pattern
`https://www.azleg.gov/arsDetail/?title=<title>` lands on the title detail page; chapters are anchors/expandable sections within. First-section URL of each chapter follows `/ars/<title>/<chapter><01>.htm` (e.g. ch11 first section §13-1101 → `/ars/13/01101.htm`).

## Section URL pattern
`https://www.azleg.gov/ars/<title>/<5-digit-section>.htm` — section number zero-padded to 5 digits. Examples:
- §13-1105 → `/ars/13/01105.htm`
- §28-1381 → `/ars/28/01381.htm`
- §13-3405 → `/ars/13/03405.htm`

## In-scope chapters
- `13-11` (Title 13 Ch 11, Homicide) — §13-1101+ — covers homicide/assault taxonomy
- `13-12` (Title 13 Ch 12, Assault and Related Offenses) — §13-1201+ — assault taxonomy
- `13-14` (Title 13 Ch 14, Sexual Offenses) — §13-1401+ — sex offenses taxonomy
- `13-15` (Title 13 Ch 15, Criminal Trespass and Burglary) — §13-1501+ — theft/property
- `13-17` (Title 13 Ch 17, Arson and Related Offenses) — §13-1701 through §13-1716 — added Round-1: high-volume violent/property offense, pairs with Ch 15 (Burglary/Trespass) and Ch 18 (Theft); was missing from initial T0 draft.
- `13-18` (Title 13 Ch 18, Theft) — §13-1801+ — theft/property taxonomy
- `13-19` (Title 13 Ch 19, Robbery) — §13-1901+ — theft/property
- `13-20` (Title 13 Ch 20, Forgery and Related Offenses) — §13-2001+ — added Round-1: pure forgery / bad-check / credit-card-fraud charges live in Ch 20 (Ch 23 covers RICO-flavored aggregated-conduct fraud, not pure forgery); was missing from initial T0 draft.
- `13-23` (Title 13 Ch 23, Organized Crime, Fraud and Terrorism) — §13-2301+ — fraud taxonomy
- `13-31` (Title 13 Ch 31, Weapons and Explosives) — §13-3101+ — weapons taxonomy
- `13-34` (Title 13 Ch 34, Drug Offenses) — §13-3401+ — drugs taxonomy (criminal drug code)
- `28-4` (Title 28 Ch 4, Driving Under the Influence) — §28-1301 to §28-1469 — traffic-DUI taxonomy

12 in-scope chapters total (10 original T0 + 2 Round-1 additions: Ch 17 Arson, Ch 20 Forgery).

## Out-of-scope chapters
- Title 13 Ch 1–10 (general provisions, sentencing, restitution — code metadata, not charges)
- Title 13 Ch 7.1 (Capital Sentencing — sentencing mechanics, not charges)
- Title 13 Ch 26–28 (bribery, perjury, judicial obstruction — niche, low INAA buyer overlap)
- Title 13 Ch 32–33 (prostitution, gambling — out of taxonomy)
- Title 13 Ch 36–37 (family offenses, miscellaneous)
- Title 28 Ch 3 (general traffic regulation — civil violations dominate; revisit if reckless driving §28-693 demand surfaces)
- Title 36 Ch 25/27/28 (controlled substances regulatory framework — definitions/scheduling, NOT criminal offenses; the criminal drug code lives at Title 13 Ch 34. Plan's "Title 36 Ch 27.1" target was misaligned — replace with Title 13 Ch 34).

## Example section HTML shape
```html
<!-- excerpt from /ars/13/01105.htm -->
<!-- exact HTML markup unverified — needs live probe by T2 author (WebFetch returns rendered text, not raw HTML) -->
<!-- Confirmed shape from rendered output: -->
<!-- - Section heading: "13-1105 - First degree murder; classification" -->
<!-- - Body: lettered subsections (A, B, C, ...) with numbered paragraphs (1, 2, 3) -->
<!-- - Statute text begins: "A person commits first degree murder if: (1) Intending or knowing that the person's conduct will cause death..." -->
<!-- T2 author should curl the section URL to capture exact div/class structure for parser. -->
```

## Citation pattern (regex)
`A\.R\.S\.?\s*§\s*(13|28)-\d+(?:\.\d+)?` — covers Title 13 + Title 28 Ch 4 sections, with optional decimal subsection (e.g. §13-3405.01). Tighter form: `A\.R\.S\. § (13|28)-[0-9]+`.

## Example charge for smoke test
Charge code: `28-1381`
Charge slug: `dui`
DUI hits the largest INAA buyer segment (highest crisis-search volume per existing playbook configs). §28-1381 is the foundational DUI statute; verified live at https://www.azleg.gov/ars/28/01381.htm with full statute body (subsections A–R, jail/fine/interlock penalties).

## Example charge slug for whitelist smoke
`dui`

## Notes / caveats
- **120s crawl-delay is the dominant constraint.** Single-threaded sequential ingest at 120s/section makes Title 13 a multi-day operation. Plan must budget ≥48h for Title 13 + Title 28 Ch 4 + Title 13 Ch 34 (~1500 sections × 120s = ~50 hours minimum). Recommend running ingest as overnight cron-job.org job spread across multiple nights, NOT a single session.
- **Plan target correction:** "Title 36 Ch 27.1 (Controlled Substances)" in worry brief is misaligned. AZ's criminal drug offenses live at **Title 13 Chapter 34** (§13-3401+). Title 36 chapters cover regulatory/scheduling definitions (Ch 25, Ch 28 medical marijuana), not criminal charges. T2 author should confirm with INAA charge taxonomy owner before final crawl spec.
- **Content-Type charset unverified.** WebFetch does not surface raw HTTP headers; T2 author must run `curl -I https://www.azleg.gov/ars/13/01105.htm` to confirm exact `Content-Type: text/html; charset=...` value before parser commits to encoding.
- **HTML markup details unverified.** WebFetch returns rendered text, not raw markup. T2 author must capture raw HTML (curl + save) to determine the exact div/class structure for `lib/az-html.mjs` parser. VA pattern (`lib/va-html.mjs`) is template; AZ markup may differ.
- **No PDF-only blocker.** All probed URLs serve HTML. Defer condition NOT met. Proceed.
- **Sitemap NOT used (Round-1 SEC-WARN):** robots.txt declares `http://www.azleg.gov/robotsitemap.xml` (HTTP, not HTTPS). HTTPS-only is a hard rule. The HTTP sitemap is **forbidden** as a discovery source. AZ section-URL enumeration MUST come from `https://www.azleg.gov/arsDetail/?title=<N>` chapter pages only. SC-25 grep-blocks `robotsitemap.xml` and `http://www.azleg` from the seed script.
