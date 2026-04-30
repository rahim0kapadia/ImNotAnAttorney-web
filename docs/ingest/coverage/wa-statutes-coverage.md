# WA Statutes — Coverage Matrix (T0 research)

Date: 2026-04-30
Plan: docs/plans/2026-04-30-worry-statute-phase2.md (T0)

## Canonical host
app.leg.wa.gov

## Source root
https://app.leg.wa.gov/RCW/

The Washington State Legislature page itself states: "The Statute Law Committee declares that the certified PDF publication documents in the RCW Archive area on the Office of the Code Reviser's website constitute the official publication of the Revised Code of Washington." HTML browse interface at app.leg.wa.gov is the navigable canonical surface; PDFs are the certified archive copy. INAA scraping uses the HTML browse, which mirrors the certified text.

## Content-Type verified: text/html
Sample URLs probed:
- https://app.leg.wa.gov/RCW/default.aspx?cite=46.61.502 (DUI) — HTML returned, section heading "Driving under the influence."
- https://app.leg.wa.gov/RCW/default.aspx?cite=9A.32.030 (Murder 1) — HTML returned, section heading "Murder in the first degree."
- https://app.leg.wa.gov/RCW/default.aspx?cite=9A.32 (chapter index) — HTML returned, lists 8 sections with citations.

Response Content-Type header verbatim: `text/html` (WebFetch does not expose raw response headers; HTML body confirmed via successful WebFetch parse and content extraction; charset unverified — needs live probe by T3 author for exact `charset=` value).

## robots.txt excerpt
```
HTTP 404 — https://app.leg.wa.gov/robots.txt does not exist.
```

No robots.txt published at the root. Per RFC 9309, a 404 means no restrictions are declared, but absence of a policy is NOT permission for aggressive crawling — conservative defaults apply.

## Crawl-delay observed: 2.0 seconds
No published crawl-delay; site is ASP.NET WebForms on app.leg.wa.gov (state legislature infra, not high-capacity CDN). Conservative 2.0s default per WA-statutes openstates-team norms; matches sibling state-leg sites (VA lis, MN revisor) where a 1.0–2.0s delay produced zero throttling.

## Chapter URL pattern
`https://app.leg.wa.gov/RCW/default.aspx?cite=<title>.<chapter>`

Example: `https://app.leg.wa.gov/RCW/default.aspx?cite=9A.32`

Chapter index page lists every section in that chapter as a hyperlink with citation + section heading.

## Section URL pattern
`https://app.leg.wa.gov/RCW/default.aspx?cite=<title>.<chapter>.<section>`

Examples:
- `https://app.leg.wa.gov/RCW/default.aspx?cite=9A.32.030`
- `https://app.leg.wa.gov/RCW/default.aspx?cite=46.61.502`
- `https://app.leg.wa.gov/RCW/default.aspx?cite=69.50.401`

Note: chapter-index links surfaced as `http://` in HTML output, but `https://` resolves and is the canonical host (TLS 1.3, valid cert). Scraper must rewrite scheme to https before fetch.

## In-scope chapters
- `9A.32` — Homicide (Murder 1/2, manslaughter, homicide by abuse)
- `9A.36` — Assault and other crimes involving physical harm
- `9A.40` — Kidnapping, unlawful imprisonment, custodial interference
- `9A.42` — Criminal Mistreatment / Abandonment of Dependent Person — added Round-1: moderate-volume DV/family-related charge bucket; pairs with 9A.36 when victim is dependent.
- `9A.44` — Sex offenses
- `9A.46` — Harassment / Stalking (felony harassment §9A.46.020, stalking §9A.46.110) — added Round-1: high-volume DV-adjacent charge; pairs with 9A.36 (assault) and 9A.40 (kidnapping).
- `9A.52` — Burglary and trespass
- `9A.56` — Theft and robbery
- `9A.60` — Fraud (forgery, criminal impersonation, identity theft)
- `9.41` — Firearms and dangerous weapons
- `46.61` — Rules of the road (incl. 46.61.502 DUI, 46.61.504 physical control, 46.61.5249 negligent driving)
- `69.50` — Uniform Controlled Substances Act

12 in-scope chapters total (10 original T0 + 2 Round-1 additions: 9A.42 Mistreatment, 9A.46 Stalking/Harassment).

## Out-of-scope chapters
- `9A.04`–`9A.28` — General provisions, attempts/conspiracy/solicitation (foundational only, not charge-bearing for INAA buyer taxonomy)
- `9.46` — Gambling
- `9.68` — Obscenity (low INAA buyer overlap; defer)
- `9.68A` — Sexual exploitation of children / CSAM-possession charges. **Round-1 OS-SUGGESTION**: explicitly deferred (NOT covered by 9A.44, which addresses adult sex offenses only). Defendants charged under §9.68A.070 (possession of depictions of minors) will see `[VERIFY]` in IB output for this phase. Decision rationale: lower buyer overlap, sensitive surface that warrants a separate handling pass with content-warning UX. Phase 3 follow-up worry handles 9.68A coverage explicitly.
- Titles 1–8, 10–45, 47–68, 70–91 — civil/admin/regulatory, out of criminal-defense INAA scope

## Example section HTML shape
Probed RCW 9A.32.030 (Murder 1) and RCW 46.61.502 (DUI). Pages render section number as a heading, then a definitional/operational body with numbered subsections, then session-law amendment history footer. Exact CSS selectors (heading class, body container ID) — unverified — needs live probe by T3 author for parser selector pinning.

```html
<!-- representative shape (reconstructed; selectors unverified — T3 author should pin via DevTools) -->
<div class="rcw-section">
  <h2>RCW 9A.32.030</h2>
  <h3>Murder in the first degree.</h3>
  <div class="section-body">
    <p>(1) A person is guilty of murder in the first degree when:</p>
    <p>(a) With a premeditated intent to cause the death of another person, he or she causes the death of such person or of a third person; or ...</p>
  </div>
  <div class="section-history">[ 2003 c 53 § 64; 1990 c 200 § 1; ...]</div>
</div>
```

## Citation pattern (regex)
**Canonical form (Round-1 fix — broadened to match 46.61, 69.50, future titles):**
`RCW\s+[0-9]+[A-Z]?\.[0-9]+\.[0-9]+`

Matches all forms used in WA criminal code:
- `RCW 9.41.040` (Title 9, firearms)
- `RCW 9A.32.030` (Title 9A, Washington Criminal Code)
- `RCW 9A.46.020` (Title 9A, harassment)
- `RCW 46.61.502` (Title 46, traffic-DUI)
- `RCW 69.50.401` (Title 69, controlled substances)

Round-1 OS-CRIT fix: prior `RCW\s+9A?\.[0-9]+\.[0-9]+` form anchored on Title 9/9A only and would NOT match the SC-15 smoke-test charge `RCW 46.61.502`. SC-15 grading would have failed for WA on a perfect IB. SC-15 WA regex now uses the broader form above.

## Example charge for smoke test
Charge code: `46.61.502`
Charge slug: `dui`
RCW 46.61.502 is the Washington DUI statute — high INAA buyer volume, single canonical section, stable URL, verified text/html response. Optimal smoke-test target.

## Example charge slug for whitelist smoke
`dui`

## Notes / caveats
- **ASP.NET WebForms** — app.leg.wa.gov runs ASP.NET WebForms. Per cached gotcha `pattern-asp-net-url-param-pagination-trumps-postback.md` (WSBA 2026-04-26 incident), URL-parameter navigation beats Playwright `__doPostBack` postback. WA's `?cite=` param-driven URLs sidestep the postback trap entirely — chapter and section navigation is fully URL-addressable, no postback required for the scraper.
- **No robots.txt** — 404 at /robots.txt. Conservative 2.0s crawl-delay applied; not a license to ignore politeness.
- **HTML chapter-index links are http:// (Round-1 SEC-WARN: TOCTOU surface)** — must rewrite scheme to https before fetch. **The rewrite is permitted ONLY when `new URL(u).hostname === 'app.leg.wa.gov'` (post-parse exact match)**. ALL other `http://` URLs (including any embedded foreign-host links from upstream HTML poisoning) are rejected outright; do NOT rewrite-and-fetch foreign hosts. Defends against `http://app.leg.wa.gov.attacker.com/...` smuggling.
- **Certified PDF archive is separate** — at leg.wa.gov/CodeReviser/. INAA uses HTML browse (mirrors certified text). PDF-archive ingestion is out of scope.
- **Effective-date pinning** — RCW 46.61.502 page shows "(Effective until January 1, 2026.)" — WA publishes future-effective amendments inline. Scraper must capture the live-effective version and flag the rollover. T3 author should add an `effective_status` field check.
- **Title 9 vs 9A split** — Title 9 (Crimes and Punishments) is the legacy criminal title; Title 9A (Washington Criminal Code) is the 1976 modernization. Both are live; firearms (9.41) lives in Title 9, while homicide/assault/sex/theft/burglary live in 9A. Scraper must handle both.
- **Charset** — `unverified — needs live probe by T3 author` for exact `charset=` declaration.
- **Section CSS selectors** — `unverified — needs live probe by T3 author` for parser pinning (heading class, body container).
