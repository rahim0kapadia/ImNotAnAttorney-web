# NC Statutes — Coverage Matrix (T0 research)

Date: 2026-04-30
Plan: docs/plans/2026-04-30-worry-statute-phase2.md (T0)

## Canonical host
www.ncleg.gov (preferred); ncleg.gov also serves identical content (both 200 OK, same `last-modified` timestamp). Use `www.ncleg.gov` in scraper config — matches form referenced from the legislature's primary navigation.

## Source root
https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/

Note: ncleg.gov publishes statutes in BOTH HTML (`.../HTML/...`) and PDF (`.../PDF/...`) tree paths. Scraper targets the HTML tree only. PDF tree is not scraped.

## Content-Type verified: text/html
Sample URL probed: https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_14/GS_14-17.html
Response Content-Type header verbatim: `text/html`

(Additional probes — all returned `text/html`:
- https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/ByChapter/Chapter_14.html
- https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_20/GS_20-138.1.html
- https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_90/GS_90-95.html )

## robots.txt excerpt
```
User-agent: *
Disallow: /WHPTest/
Disallow: /Ethics/
```

(No `Crawl-delay` directive present. No `Disallow` covers `/EnactedLegislation/Statutes/`.)

## Crawl-delay observed: 2.0 seconds
robots.txt does not specify Crawl-delay for User-agent: *; conservative 2.0s adopted to match VA-scraper baseline (RATE_MIN_MS=500 + jitter floor) and stay well below any rate-limit threshold from Cloudflare-fronted ncleg.gov.

## Chapter URL pattern
https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/ByChapter/Chapter_{N}.html

(Lettered subchapters use the literal chapter id, e.g., Chapter_15A → `Chapter_15A.html`.)

## Section URL pattern
https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_{chapter}/GS_{chapter}-{section}.html

Examples verified live:
- §14-17 (first-degree murder): `…/Chapter_14/GS_14-17.html`
- §20-138.1 (impaired driving): `…/Chapter_20/GS_20-138.1.html`
- §90-95 (controlled substances violations): `…/Chapter_90/GS_90-95.html`

Decimal-suffixed sections retain the dot in the filename (e.g., `GS_20-138.1.html`).

## In-scope chapters
- `14` — Criminal Law (homicide, assault, theft, property, weapons, sex offenses, fraud — broadest charge surface)
- `20` — Motor Vehicles (DWI = §20-138.1; reckless driving; license offenses; Articles 2A / 3 / 8 specifically targeted)
- `90` — Controlled Substances Act (Article 5 = §§90-86 through 90-113.8; trafficking, possession, PWISD)
- `15A` — Criminal Procedure (offense-bearing sections relevant to charging instruments, stalking statutes that live here, criminal-procedure-defined offenses)
- `50B` — Domestic Violence (DVPO violations, criminal contempt for DVPO breach — high-volume in INAA buyer base)
- `74E` / `74C` — Company Police / Private Protective Services (officer-impersonation and criminal sections; lower-volume but completes the weapons/officer taxonomy alongside Ch 14)

(7 in-scope chapters total: `14`, `15A`, `20`, `50B`, `74C`, `74E`, `90`.)

## Out-of-scope chapters
- `1`–`1H` — Civil Procedure
- `25` — Uniform Commercial Code (civil)
- `28A`–`36F` — Decedents' estates / trusts (civil)
- `39`–`47H` — Property / conveyances (civil)
- `48`–`52C` — Family law (civil; DV criminal sections are in Ch 50B which IS in scope)
- `55`–`59` — Business entities (civil)
- `66`–`75` — Commerce / consumer protection (civil; Ch 75 has criminal misdemeanors but lower-volume — defer)
- `87`–`89F` — Professional licensing
- `93`–`95` — Labor / employment (civil)
- `105`–`160D` — Taxation, local government (civil; selected criminal tax sections deferred to Phase 3)
- `162`–`169` — Sheriffs, miscellaneous (mostly civil/administrative)

## Example section HTML shape
```html
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <title>G.S. 14-17</title>
    <style type="text/css">
      .cs2E44D3A6{text-align:center;text-indent:0pt;margin:0pt 0pt 6pt 0pt}
      .cs8448B574{color:#000000;font-family:'Times New Roman';font-size:12pt;font-weight:bold;text-transform:uppercase;}
      .cs9D249CCB{color:#000000;font-family:'Times New Roman';font-size:12pt;font-weight:normal;}
      .cs72F7C9C5{color:#000000;font-family:'Times New Roman';font-size:12pt;font-weight:bold;}
      .cs8E357F70{text-align:justify;text-indent:-54pt;margin:0pt 0pt 0pt 54pt}
      /* … additional generated cs* classes … */
    </style>
  </head>
  <body>
    <h4 class="cs2E44D3A6"><span class="cs8448B574">Subchapter III. Offenses Against the Person.</span></h4>
    <p class="cs2E44D3A6"><span class="cs9D249CCB">Article 6.</span></p>
    <p class="cs2E44D3A6"><span class="cs9D249CCB">Homicide.</span></p>
    <p class="cs8E357F70"><span class="cs72F7C9C5">&sect; 14-17.&nbsp; First-degree murder…</span> <span class="cs9D249CCB">… statute body text …</span></p>
    <!-- subsequent paragraphs continue inline; no semantic <section> wrapper -->
  </body>
</html>
```

Parser-anchor notes:
- Section number sits in a `<span>` whose class is bold (e.g., `cs72F7C9C5` / `cs8448B574`); leading literal is `&sect; <chapter>-<section>.` followed by `&nbsp;` then the heading.
- Subchapter / Article banners use centered-paragraph classes (e.g., `cs2E44D3A6`).
- CSS class names are auto-generated hashes — DO NOT match on classnames; match on tag + content prefix `&sect;` (or `§`) + chapter-section pattern.
- Pages are XHTML 1.0 Transitional, declared charset utf-8. Densely concatenated paragraphs on a single line — `cheerio` or `parse5` handles this fine; line-based regex will not.

## Citation pattern (regex)
`N\.C\.G\.S\. § (14|15A|20|50B|74C|74E|90)-[0-9]+(\.[0-9]+[A-Z]?)?` — full canonical form

Short form also seen: `G\.S\. (14|15A|20|50B|74C|74E|90)-[0-9]+(\.[0-9]+[A-Z]?)?`

Round-1 fix: prior draft used `(1[45A]|17C|...)` — the bracket char-class
`[45A]` matches `4`, `5`, or `A` individually, NOT the literal pair `15A`,
so the regex would have missed every `§ 15A-*` cite. `17C` was also
present in the regex but `17C` (Criminal Justice Standards) is not in the
in-scope chapter set; removed for consistency with SC-9.

In-page literal: `&sect; 14-17` / `§ 14-17` (no leading "N.C.G.S." inside the statute body itself).

## Example charge for smoke test
Charge code: `20-138.1`
Charge slug: `dwi`

§20-138.1 (Impaired Driving) is the highest-volume INAA charge for NC — DWI is one of the top three taxonomy buckets in the existing FL/VA seeds, NC has ~50K DWI arrests/year, and the existing `dui` playbook tier already drives most NC traffic. Murder (§14-17) is the alternative but volume is ~2 orders of magnitude lower; smoke test on DWI exercises the decimal-suffixed section path (`GS_20-138.1.html`) which is the more demanding URL shape to verify.

## Example charge slug for whitelist smoke
`dwi`

## Notes / caveats
- Cloudflare-fronted (`Server: cloudflare`, `cf-cache-status: DYNAMIC`). No bot-challenge observed on probes; expect possible 403 on aggressive concurrency. Stick to the conservative 2s rate; back off to 5s on first 403/503.
- `cf-cache-status: DYNAMIC` means responses are not cached at edge → every request hits origin. Plan ingest cadence accordingly (one-shot seed, weekly refresh cron — same pattern as VA).
- HTML uses auto-generated `cs<hash>` class names. These hashes are stable per ncleg.gov's site generator across pages but should NOT be relied on cross-deployment. Parser must anchor on tag + content prefix (`§` / `&sect;`), not classnames.
- The PDF tree (`/PDF/BySection/...`) IS the official "of record" rendering — HTML tree is a parallel publication of the same content. Both update together (verified `last-modified` Apr 16 2026 for HTML tree). The HTML tree is sufficient for INAA's seed needs.
- Sections that have been repealed still render an HTML page with a "Repealed by …" tombstone — parser should detect and skip rather than seed.
- Lettered subchapters (e.g., `15A`, `74C`) follow the same URL convention with the literal id.
- No login wall, no JS rendering required, no Cloudflare Turnstile/hCaptcha observed during T0 probes.
- robots.txt does NOT block `/EnactedLegislation/Statutes/` — scraping is permitted.
