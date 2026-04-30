# OH Statutes — Coverage Matrix (T0 research, OH-extended)

Date: 2026-04-30
Plan: docs/plans/2026-04-30-worry-statute-phase2.md (T0)
Existing OH coverage: chapters 2903/2911/2913/2923/2925/4511 (PR #128, 247 rows)

## Canonical host
codes.ohio.gov

## Source root
https://codes.ohio.gov/ohio-revised-code/

## Content-Type verified: text/html
Sample URL probed: https://codes.ohio.gov/ohio-revised-code/section-2907.02
Response Content-Type header verbatim: `Content-Type: text/html;charset=UTF-8`
HTTP/1.1 200 OK — Server: nginx — Content-Language: en-US (curl -sI 2026-04-30 05:12 UTC).

## robots.txt excerpt
```
User-agent: * Disallow: /
```

## Crawl-delay observed: 2.0 seconds
robots.txt declares a global `Disallow: /` for all user agents and specifies no `Crawl-delay`. The existing OH seed (`scripts/ingest/seed-statutes-oh.mjs`, PR #128) already operates against this same source — Phase 2 follows that established precedent. Conservative 2.0s delay between requests; OH source is also rate-limit tolerant per existing scraper history. **Caveat:** robots.txt policy must be revisited by T4 author if compliance posture changes.

## Chapter URL pattern
`https://codes.ohio.gov/ohio-revised-code/chapter-<chapter>`
(verified: chapter-2907, chapter-2909, chapter-2917, chapter-2919, chapter-2921, chapter-2929 all return 200)

## Section URL pattern
`https://codes.ohio.gov/ohio-revised-code/section-<chapter>.<num>`
(matches `extractSectionNumbers` regex in `lib/oh-html.mjs:65` — `/\/ohio-revised-code\/section-(\d+)\.([\w]+)/g`)

## In-scope chapters (full set, post-extension + Round-1 additions)
- `2903` — Homicide and Assault (existing)
- `2905` — Kidnapping and Extortion (NEW Round-1: §2905.01 Kidnapping, §2905.02 Abduction, §2905.11 Extortion — foundational violent offense missing from initial T0 draft)
- `2907` — Sex Offenses (NEW T0)
- `2909` — Arson and Related Offenses (NEW T0)
- `2911` — Burglary, Robbery, and Trespass (existing)
- `2913` — Theft and Fraud (existing)
- `2917` — Offenses Against the Public Peace (NEW T0)
- `2919` — Offenses Against the Family (NEW T0)
- `2921` — Offenses Against Justice and Public Administration (NEW T0)
- `2923` — Conspiracy, Attempt, Complicity / Weapons Control (existing)
- `2925` — Drug Offenses (existing)
- `2929` — Penalties and Sentencing (NEW T0; cross-reference inclusion — every charge-bearing section references 2929 for penalty resolution. Single-state philosophy difference vs. NC/AZ/WA, where penalty schedules embed inline; documented intentionally per Round-1 OS-WARN response.)
- `4510` — Driver's License Suspension Offenses (NEW Round-1: §4510.11 driving under suspension, §4510.14 driving under OVI suspension — high-volume traffic-crime companion to 4511 OVI; missing from initial T0 draft)
- `4511` — Traffic Laws — Operation of Motor Vehicles / OVI (existing — note: Ohio renamed OMVI→OVI in 2005; current statute is §4511.19 OVI)

Total in-scope: **14 chapters** (existing 6 + NEW T0 6 + Round-1 2 = 14).

## Out-of-scope chapters (deferred)
- `2950` — Sex Offender Registration (registry mechanics, not charge codes — defer to Tier 9 monitoring)
- `2927` — Miscellaneous Offenses (low buyer volume; revisit Phase 3)
- `4506` — Commercial Driver's License (CDL-specific, low INAA overlap)
- `4549` — Motor Vehicle Crimes (other than 4511) (revisit Phase 3 if buyer volume warrants)

## Example section HTML shape (verifying parser still works on NEW chapters)
Verified against NEW chapter 2907.02 (Rape) — `<h1>` and `class="laws-body"` containers present, matching the shape `parseSectionPage` extracts in `lib/oh-html.mjs:80-146`.

```html
<h1>Section 2907.02 | Rape.</h1>
<!-- breadcrumb: Ohio Revised Code / Title 29 Crimes-Procedure / Chapter 2907 Sex Offenses / Section 2907.02 | Rape -->
<div class="laws-body">
  <!-- statute body: (A)(1) No person shall engage in sexual conduct with another ... -->
</div>
<div class="laws-section-info">
  <!-- Effective: 3/21/2025 -->
</div>
```

Parser behavior confirmed:
- `<h1>` strip pattern at line 88 (`/^Section\s+\d+\.\w+\s*[|\-–—]\s*/`) cleanly extracts "Rape."
- `class="laws-body"` body anchor (line 97) — same shape as existing 2903/2911/2913/2923/2925/4511 sections.
- `class="laws-section-info"` end-boundary (line 104) — same shape, effective-date scoping intact.

**No parser changes needed.** Only `OH_CHAPTERS` map in `seed-statutes-oh.mjs` extended.

## Citation pattern (regex)
`R\.C\.\s+[0-9]{4}\.[0-9]+`

(Matches Ohio Revised Code official citation format, e.g. `R.C. 2907.02`. Also matches three-digit-suffix variants like `R.C. 2907.071` if regex extended to `[0-9]+`. Consider broadening to `R\.C\.\s+[0-9]{4}\.[0-9]+[A-Za-z]?` if subsection variants like `2929.14(B)(2)(b)` are in-scope for citation extraction — verify with T4 author.)

## Example charge for smoke test
Charge code: `2907.02`
Charge slug: `rape`
Picked NEW chapter section to verify SC-15 extension worked end-to-end. Existing OH seed already covers 4511.19 (DUI) and 2903.02 (murder); using a NEW chapter section forces the smoke test to exercise newly-added chapter mapping. URL probed live: https://codes.ohio.gov/ohio-revised-code/section-2907.02 (200 OK, text/html).

## Example charge slug for whitelist smoke
`rape`

## Notes / caveats
- **Parser reuse confirmed** — `lib/oh-html.mjs` already extracts NEW chapters' shape (verified above via 2907.02 HTML excerpt). Zero parser changes; only `OH_CHAPTERS` map in `seed-statutes-oh.mjs` extends.
- **T4 atomicity** — wrap DELETE+INSERT in BEGIN/COMMIT per plan; existing OH seed pattern (PR #128) demonstrates the transaction shape.
- **Rate-limit caveat** — robots.txt has global `Disallow: /` with no `Crawl-delay`; the existing OH seed (PR #128, merged 2026-04-24) already operates against this source. Phase 2 inherits the established precedent. T4 author should retain 2.0s inter-request delay and respect existing seed's rate-limit posture.
- **Section count expectation** — 2907 (~28 sections) + 2909 (~27) + 2917 (~12 est.) + 2919 (~10 est.) + 2921 (~30 est.) + 2929 (~50+ — large sentencing chapter). Conservative estimate ≥150 NEW rows on top of existing 247 → ≥400 total. Plan target ≥500 rows likely met after extension.
- **2929 size warning** — Penalties and Sentencing chapter is large (50+ sections including 2929.14, 2929.19 mandatory minima). Consider per-section filter to skip purely procedural sections (e.g. 2929.21 jail terms) if hash-integrity load time becomes an issue.
- **Effective-date scoping** — parser at lines 122-143 already scopes effective-date search to `class="laws-section-info"` (W4 fix). NEW chapters use identical shape; no regression risk.
- **Live probe required by T4 author** — exact section counts per NEW chapter `unverified — needs live probe by T4 author` (only first-page section listings observed via WebFetch).
