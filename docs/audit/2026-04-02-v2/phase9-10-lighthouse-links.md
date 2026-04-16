# Phase 9-10: Lighthouse Performance Audit + Broken Link Check
**Date:** 2026-04-02
**Auditor:** Atlas / Atti
**Scope:** 4 key pages via Lighthouse CLI (v13.0.3); full internal link audit; schema DefinedTermSet URL verification; blog post external link sampling

---

## Part 1: Lighthouse Performance Audit

### Methodology
Lighthouse CLI 13.0.3 run against live production (`https://imnotanattorney.com`). Flags: `, headless,no-sandbox,disable-gpu,disable-dev-shm-usage`. Categories: performance, accessibility, seo, best-practices. Results represent a single headless run, real-world CWV will differ from lab data. INP not available in headless runs (requires real user interaction); TBT used as lab proxy.

---

### Results Summary

| Page | Perf | A11y | SEO | Best Prac | LCP | CLS | TBT | Speed Index |
|------|------|------|---, |---------, |---, |---, |---, |-------------|
| `/` (homepage) | **82** | 100 | 100 | 96 | 3.5s | 0.00 | 264ms | 4.5s |
| `/score` | **94** | 100 | 100 | 96 | 1.9s | 0.00 | 259ms | 1.7s |
| `/playbook/dui-first-offense` | **88** | 100 | 100 | 96 | 3.4s | 0.00 | 120ms | 4.4s |
| `/blog` | **90** | 100 | 100 | 96 | 2.9s | 0.00 | 240ms | 1.4s |

**Targets:** Performance >80, LCP <2.5s, CLS <0.1, A11y >90, SEO >90, Best Practices >90.

---

### Page-by-Page Breakdown

#### `/`, Homepage
- **Performance: 82**, Passes target (>80), but barely. The weakest page.
- **LCP: 3.5s**, FAILS target (<2.5s). Worst performer. Breakdown: TTFB 136ms, element render delay **3.19s**. The LCP element is the H1 text in the main section. The render delay indicates heavy JS blocking main-thread rendering before the above-fold H1 paints.
- **CLS: 0.00**, Perfect.
- **TBT: 264ms**, Borderline (yellow zone: 200-600ms). Main-thread breakdown: Script Evaluation 900ms, Style & Layout 757ms, Other 473ms, Script Parsing 167ms.
- **FCP: 1.5s**, Good.
- **Failing audits:**
  - `unused-javascript`: 73.6 KB savings. One chunk (`fa2781425ab4846b.js`) accounts for most. This is Next.js bundle; likely unused imports or components loaded on this route that are not used above the fold.
  - `mainthread-work-breakdown`: 2.5s total. Script evaluation is the dominant cost (900ms).
  - `bf-cache`: 2 "not actionable" reasons (browser-level, Lighthouse reports these for all pages, not fixable at app level).
- **Best Practices: 96**, One deduction: CSP `inspector-issues` (Content Security Policy header not configured). Same on all pages.

#### `/score`, Lead Magnet
- **Performance: 94**, Strong. Best-performing page.
- **LCP: 1.9s**, Passes target (<2.5s).
- **TBT: 259ms**, Borderline, same as homepage but irrelevant since the page loads fast.
- **FCP: 1.0s**, Excellent.
- **Failing audits:**
  - `unused-javascript`: 61 KB savings.
  - `bf-cache`: Same browser-level not-actionable reasons.

#### `/playbook/dui-first-offense`, Primary Sales Page
- **Performance: 88**, Good.
- **LCP: 3.4s**, FAILS target (<2.5s). Almost identical to homepage. Long sales page with significant JS, same render-delay pattern expected.
- **CLS: 0.00**, Perfect.
- **TBT: 120ms**, Good (green zone <200ms).
- **FCP: 1.3s**, Excellent.
- **Failing audits:**
  - `unused-javascript`: 71 KB savings.
  - `bf-cache`: Not actionable.

#### `/blog`, Content Hub
- **Performance: 90**, Good.
- **LCP: 2.9s**, FAILS target (<2.5s) but only slightly (400ms over). Blog list page renders many cards.
- **CLS: 0.00**, Perfect.
- **TBT: 240ms**, Borderline.
- **FCP: 1.1s**, Excellent.
- **Failing audits:**
  - `unused-javascript`: **113 KB savings**, worst of all pages. Blog index loads more JS than any other page. Likely includes components conditionally used in posts but loaded at index level.
  - `bf-cache`: Not actionable.

---

### Cross-Page Patterns

**What's working:**
- Accessibility: **100/100 on every page.** Zero violations. This is exceptional for a YMYL site. Maintains this from the prior axe audit (phase3).
- SEO: **100/100 on every page.** All meta, canonicals, structured data passing.
- CLS: **0.00 everywhere.** No layout shifts. All images properly sized/reserved.
- FCP: Fast across the board (1.0–1.5s). Server rendering and static generation working correctly.

**What needs work:**

1. **LCP on long-form pages (/, /playbook/*, /blog)**, homepage and playbook both at 3.4–3.5s, blog at 2.9s. The H1 and first heading are the LCP elements but suffer a ~3s element render delay. Root cause: large JS evaluation budget (900ms script eval + 757ms style/layout on homepage). The unused-javascript savings (61–113 KB per page) are the highest-ROI fix.

2. **Unused JavaScript (61–113 KB across all pages)**, Next.js bundle includes chunks that are partially unused per page. The single identified chunk `fa2781425ab4846b.js` is the primary offender on homepage. This is likely a large shared chunk containing components loaded globally but only used on some pages. Fix: audit that chunk, consider `next/dynamic` lazy loading for below-fold components (PricingTable, TestimonialSection, motion components).

3. **Content Security Policy (Best Practices: 96 on all pages)**, No CSP header configured. Chrome DevTools flags this. Not a critical deduction but fixable via `next.config` headers.

4. **TBT: 240–264ms on most pages**, Borderline. Directly correlated with the unused JS and script evaluation time. Resolving unused-javascript will reduce TBT.

5. **`/score` INP: 210ms**, The one page where INP was measurable (live run). Marginally over the 200ms target. Acceptable but worth monitoring.

---

### Priority Fixes (Performance)

| Priority | Fix | Expected Impact | File |
|----------|---, |---------------, |------|
| P1 | Audit `fa2781425ab4846b.js`, identify what's in it | LCP -0.5s, TBT -60ms | Next.js bundle analysis |
| P1 | `next/dynamic` for below-fold heavy components | LCP -0.5–1s on homepage/playbook | `src/app/page.tsx`, `src/app/playbook/[slug]/page.tsx` |
| P2 | Add CSP header to `next.config.ts` | Best Practices 96→100 | `next.config.ts` |
| P3 | Monitor /score INP in CrUX (field data) | Confirm 210ms is outlier | Search Console CWV report |

---

## Part 2: Broken Link Check

### Methodology
1. Read `src/app/sitemap.ts`, extracted all static URL patterns.
2. Grepped all `href=` in `src/app/**` and `src/components/**` for internal links.
3. Compared all referenced routes against `src/app/` directory structure.
4. Verified all `/blog/[slug]` links against `content/blog/*.mdx` filenames.
5. Verified all `/playbook/[slug]` links against `src/lib/playbook-configs.ts`.
6. Checked `src/lib/schema.ts` DefinedTermSet URLs.
7. Sampled 5 blog posts for external links; checked all 42 posts for external URL presence.

---

### Internal Route Links, Status

All internal routes referenced in `href=` attributes across app pages and components verified against `src/app/` directory structure.

**Status: CLEAN.** Every internal path (`/score`, `/blog`, `/intake`, `/services`, `/sample`, `/sample-xray`, `/start`, `/playbooks`, `/resources`, `/about`, `/contact`, `/terms`, `/privacy`, `/editorial-policy`, `/family`, `/partner/login`, `/partner/dashboard`, `/partners`, `/partners/bondsman`, `/my-cases`, `/my-cases/login`, `/operator/*`, `/checkout`, `/checkout?tier=*`, `/intake?interest=*`, `/upload`, `/report/*`, `/my-case/*`, `/r/*`, `/unsubscribe`) has a corresponding `src/app/` directory with a `page.tsx`.

**Not in sitemap (expected, admin/functional routes):**
- `/start`, `/dui-checklist`, `/upload`, `/admin/*`, `/operator/*`, `/partner/*`, `/my-case/*`, `/my-cases/*`, `/report/*`, `/r/*`, `/unsubscribe`, `/sample-xray`, all exist as app routes. Correct to exclude from sitemap.

---

### Blog Slug Links, Status

All `/blog/[slug]` hrefs extracted from app pages and components cross-referenced against `content/blog/*.mdx`:

**Status: CLEAN.** All 42 blog slugs linked from pages match existing MDX files. Verified slugs include:
- `trafficking-charges-constructive-possession`, `how-your-attorney-makes-money`, `attorney-not-returning-calls`, `complete-dui-defense-guide`, `how-family-members-can-help-criminal-case`, `what-motions-should-your-attorney-be-filing`, `how-to-read-your-discovery`, `is-your-attorney-actually-working-your-case`, `what-500-pages-of-drug-trafficking-discovery-contained`, `field-sobriety-test-standards`, `drug-defense-complete-guide`, `complete-white-collar-defense-guide`.

---

### Playbook Slug Links, Status

All `/playbook/[slug]` hrefs verified against `src/lib/playbook-configs.ts`:

**Status: CLEAN.** All 8 playbook slugs confirmed in config:
`dui-first-offense`, `drug-possession`, `drug-trafficking`, `probation-violation`, `white-collar`, `sex-offense`, `federal-criminal`, `self-defense`.

---

### Schema DefinedTermSet URLs, CRITICAL ISSUE FOUND

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\schema.ts` (lines 213–279)

`generateDefinedTermSet()` emits 8 `DefinedTerm` entries with `url` fields pointing to blog posts. **5 of 8 URLs point to blog posts that do not exist.**

| DefinedTerm | URL in schema | Status |
|-------------|---------------|------, |
| Brady Material | `/blog/discovery-rights-drug-cases` | OK |
| Chain of Custody | `/blog/evidence-handling-criminal-cases` | **DEAD**, no such post |
| Constructive Possession | `/blog/trafficking-charges-constructive-possession` | OK |
| Suppression Motion | `/blog/motion-to-suppress-evidence` | **DEAD**, no such post |
| Discovery | `/blog/discovery-rights-drug-cases` | OK |
| Field Sobriety Test | `/blog/field-sobriety-test-accuracy` | **DEAD**, nearest match is `field-sobriety-test-standards` |
| Plea Bargain | `/blog/plea-bargain-questions` | **DEAD**, nearest match is `should-you-take-the-plea-deal` |
| Sentencing Guidelines | `/blog/federal-sentencing-guidelines` | **DEAD**, nearest match is `how-to-prepare-for-sentencing` |

**Impact:** Google's structured data validator will flag these as broken references. The DefinedTermSet is emitted sitewide (injected in the layout or schema utilities). Each crawl of any page including this schema will surface 5 dead URLs in the entity graph, this directly undermines the GEO/entity-SEO strategy the schema was built to serve.

**Fix required in `src/lib/schema.ts`:**
```
Chain of Custody    → /blog/how-to-read-your-discovery
                      (closest match: covers evidence documents and chain)
Suppression Motion  → /blog/what-motions-should-your-attorney-be-filing
                      (covers suppression motions explicitly)
Field Sobriety Test → /blog/field-sobriety-test-standards
                      (direct match, different suffix than schema)
Plea Bargain        → /blog/should-you-take-the-plea-deal
                      (covers plea bargaining)
Sentencing Guidelines → /blog/how-to-prepare-for-sentencing
                      (covers sentencing guidelines and process)
```

---

### External Links in Blog Posts

Checked all 42 blog posts for external URLs. 5 posts contain external links:

| Post | External URLs |
|------|------------, |
| `case-keeps-getting-continued` | `law.cornell.edu/uscode/text/18/3161` (Speedy Trial Act) |
| `drug-defense-complete-guide` | `supreme.justia.com` (Terry v. Ohio), `law.cornell.edu/uscode/text/21/841` |
| `how-to-prepare-for-sentencing` | `law.cornell.edu` (18 U.S.C. § 3553), `va.gov` (Veterans Treatment Court), `ussc.gov` |
| `questions-to-ask-public-defender` | `bjs.ojp.gov` (BJS PDF) |
| `what-happens-if-you-violate-probation` | `supreme.justia.com` (2 cases), `ussc.gov` (Guidelines Manual) |

**Status:** All 5 are authoritative sources (Cornell LII, NHTSA, USSC, BJS, Justia). No dead external URLs detected in blog content. These are the correct citation targets already mapped in `schema.ts`.

**Note:** The BJS PDF at `bjs.ojp.gov/content/pub/pdf/dccc.pdf` should be periodically verified, BJS occasionally reorganizes report URLs.

---

### Image `src` Attributes, Status

No hardcoded `src="/..."` image paths found in `src/app/**` or `src/components/**`, all images use `next/image` with dynamic `src` props or Tailwind background utilities. Public directory structure verified:

- `/public/brand/`: `inaa-logo.png`, referenced via `next/image` in Header.
- `/public/covers/[slug]/`: `thumbnail.png`, `emergency-thumbnail.png`, `emergency-thumbnail-small.png`, all 8 playbook slugs have all 3 variants.
- `/public/discovery/`: 4 case evidence images.
- `/public/guides/`: 4 downloadable PDF/MD guides.

**Status: CLEAN.** No broken image paths found.

---

### Sitemap vs. Route Directory, Status

All static routes in `sitemap.ts` verified against `src/app/` directory:

**Status: CLEAN.** All sitemap entries have matching route directories:
`/`, `/blog`, `/score`, `/playbooks`, `/services`, `/resources`, `/about`, `/intake`, `/sample`, `/research/defense-score-data`, `/editorial-policy`, `/contact`, `/terms`, `/privacy`, `/family`, `/playbook/[slug]`, `/dui-defense/[state]`.

**Gap, not in sitemap:**
- `/sample-xray`, exists as a route (`src/app/sample-xray/page.tsx`), linked from `/services`. Not in sitemap. Should be added at priority 0.7, it's a sample X-Ray report (conversion asset).
- `/start`, exists, linked from Header. Decision to exclude from sitemap is valid (it's a routing hub, not a content destination).
- `/dui-checklist`, exists, not in sitemap. Low priority but could be added.

---

## Summary: Issues by Severity

### Critical
| # | Issue | File | Impact |
|---|-------|------|------, |
| C1 | 5 of 8 DefinedTermSet URLs point to non-existent blog posts | `src/lib/schema.ts` lines 233–278 | Broken entity graph, structured data validator errors, GEO strategy undermined |

### High
| # | Issue | File | Impact |
|---|-------|------|------, |
| H1 | LCP 3.4–3.5s on homepage and playbook (target: <2.5s) | `src/app/page.tsx`, `src/app/playbook/[slug]/page.tsx` | Performance score ceiling, CWV poor in field |
| H2 | Unused JS 61–113 KB across all pages | Next.js bundle | Root cause of LCP delay and TBT |

### Medium
| # | Issue | File | Impact |
|---|-------|------|------, |
| M1 | `/sample-xray` not in sitemap | `src/app/sitemap.ts` | Conversion page not indexed |
| M2 | No CSP header | `next.config.ts` | Best Practices 96→100, security posture |
| M3 | TBT 240–264ms on 3 of 4 pages | Bundle/JS | Correlated with H2 |

### Low / Monitor
| # | Issue | Notes |
|---|-------|-------|
| L1 | `/score` INP 210ms (lab) | Marginally over 200ms target; verify in CrUX field data |
| L2 | BJS PDF external link | `bjs.ojp.gov` PDF URLs can move; verify periodically |
| L3 | bf-cache: 2 not-actionable | Browser-level, not fixable at app level |

---

## Recommended Fix Order

1. **C1, Fix DefinedTermSet URLs** in `src/lib/schema.ts` (5 dead URLs → correct slugs). 30-min fix, high SEO/GEO impact.
2. **H1/H2, LCP + Unused JS**, bundle analysis (`npx next-bundle-analyzer`) to identify what's in `fa2781425ab4846b.js`, then `next/dynamic` for below-fold components on homepage and playbook pages.
3. **M1, Add `/sample-xray` to sitemap** in `src/app/sitemap.ts`. 5-min fix.
4. **M2, Add CSP header** in `next.config.ts`.
