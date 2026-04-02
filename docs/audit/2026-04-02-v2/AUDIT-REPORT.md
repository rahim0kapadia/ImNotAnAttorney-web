# Comprehensive Website Audit Report v2 — imnotanattorney.com
Date: 2026-04-02 | Previous audit: 2026-04-02 v1 | Layers: 15

## Executive Summary

The site has production-grade architecture, genuinely strong UPL compliance infrastructure, best-in-class crisis UX on /start, and advanced GEO signals (speakable, DefinedTermSet, citation schema) that put it ahead of 95% of YMYL competitors on structured data depth. Five FAIL-level findings must be fixed before scaling: a factually incorrect privacy policy claim about tracking cookies, a critical logic bug in the intake auto-generation flow, 5 dead structured data URLs undermining the entity graph, a known Next.js CSRF bypass CVE in production, and unhashed report tokens exposing criminal defense data in any database breach. All five are fixable within a single sprint. The 38 NEEDS WORK items are improvements, not blockers. **Go-live decision: CONDITIONAL GO** — the site can operate for organic traffic today but must not run paid acquisition until the 5 FAILs and the blog UPL violation (B4) are resolved.

## GATE Status

| Gate Team | Status | Blockers |
|-----------|--------|----------|
| Team 9: Positioning | **CONDITIONAL GO** | POS7 (competitive frame vs. inertia) NEEDS WORK. No FAIL. |
| Team 10: CRO | **CONDITIONAL GO** | CRO11 (desktop exit intent missing), CRO13 (post-purchase UX unaudited), CRO12/15/16/17 NEEDS WORK. No FAIL. |
| Team 11: Trust | **CONDITIONAL GO** | T2 (tribe signal persistence unverified post-purchase), ANON1/ANON5 NEEDS WORK. No FAIL. |
| UPL Compliance | **CONDITIONAL GO** | FLAG B4 is a clear U4 violation in published blog content. No U6-U15 violations. Infrastructure strong. B4 must be fixed before distribution push. |

## Capstone Verdict

**From phaseCAP: CONDITIONAL GO — 121 PASS / 38 NEEDS WORK / 5 FAIL out of 164 criteria.**

The site is production-capable today for organic traffic and existing customers. Conditions for full GO: (1) privacy policy GA4 claim corrected, (2) intake route WHERE clause fixed, (3) blog UPL violation B4 fixed, (4) DefinedTermSet URLs corrected, (5) Next.js upgraded past CSRF CVE. Conditions for paid acquisition: all 5 above plus report token hashing, a11y patches applied, title tag overruns fixed, E2E purchase flow tested, text-sm bumped to text-base for substantive content.

## Severity Table

| Severity | Count | Theme |
|----------|-------|-------|
| **FAIL** | 5 | Privacy policy false claim, intake logic bug, dead schema URLs, npm CVEs, unhashed report tokens |
| **SERIOUS/HIGH** | 12 | UPL blog violation (B4), title tag overruns (4 pages), a11y label/htmlFor (14 instances), autoFocus public pages (3), LCP >2.5s (3 pages), missing /start metadata, scrollable region not focusable, color-only links (7 nodes) |
| **MODERATE/MEDIUM** | 28 | Duplicate main landmarks (4 pages), text-sm on substantive content (systemic), touch targets <44px (3 components), card monoculture, CSP gaps, unsubscribe rate limiting, score observations >27 words (7), OG metadata gaps, jargon in urgency bar, 50 thin state pages, missing FAQ schema on /score and /playbooks |
| **LOW/MINOR** | 14 | Unused imports, type safety (as any), admin autoFocus, unused anon key, emoji icons on /playbooks, font discrepancy (Geist vs Lato) |

---

## FAIL — Fix Immediately (5)

### F1: Privacy policy claims "no tracking cookies" while GA4 is live
- **Phase:** 18-20 | **Severity:** FAIL
- **File:** `src/app/privacy/page.tsx` Section 8
- **Issue:** Privacy policy states "Our website does not use tracking cookies or third-party analytics cookies." GA4 (`NEXT_PUBLIC_GA_ID=G-XLWVJFZ577`) is live via `@next/third-parties/google` in `src/app/layout.tsx`, setting `_ga`/`_ga_*` cookies. Factually false statement in a legal document on a YMYL legal site.
- **Fix:** Either update Section 8 to disclose GA4 and add Google Analytics to Section 5 third-party services list, OR remove GA4. 10-minute fix.

### F2: Stale WHERE clause in intake auto-generation (Flow B broken)
- **Phase:** 19 | **Severity:** FAIL
- **File:** `src/app/api/intake/route.ts:276`
- **Issue:** Line 257 updates status from `awaiting-intake` to `intake`. Line 276 then tries `.eq("status", "awaiting-intake")` — matches zero rows because status is already `intake`. Auto-generation fires (fetch happens regardless) but stuck-generating cron cannot detect failures because the case never enters `generating` status.
- **Fix:** Change `.eq("status", "awaiting-intake")` to `.eq("status", "intake")` on line 276. One-line fix.

### F3: 5 of 8 DefinedTermSet URLs point to non-existent blog posts
- **Phase:** 9-10, 16 | **Severity:** FAIL
- **File:** `src/lib/schema.ts:233-278`
- **Issue:** Glossary schema references blog slugs that do not exist: `evidence-handling-criminal-cases`, `motion-to-suppress-evidence`, `field-sobriety-test-accuracy`, `plea-bargain-questions`, `federal-sentencing-guidelines`. Broken entity graph undermines the entire GEO strategy.
- **Fix:** Update URLs to existing blog slugs: Chain of Custody -> `/blog/how-to-read-your-discovery`, Suppression Motion -> `/blog/what-motions-should-your-attorney-be-filing`, Field Sobriety Test -> `/blog/field-sobriety-test-standards`, Plea Bargain -> `/blog/should-you-take-the-plea-deal`, Sentencing Guidelines -> `/blog/how-to-prepare-for-sentencing`. 30-minute fix.

### F4: 6 npm audit vulnerabilities including Next.js CSRF bypass
- **Phase:** 6 | **Severity:** FAIL
- **File:** `package.json` (Next.js 16.1.6)
- **Issue:** GHSA-mq59-m269-xvcx allows null Origin to bypass Server Actions CSRF checks. GHSA-ggv3-7p47-pfv8 is HTTP request smuggling. Plus flatted prototype pollution, picomatch ReDoS, Anthropic SDK sandbox escape, brace-expansion DoS, yaml stack overflow.
- **Fix:** `npm audit fix` for non-breaking fixes, then `npm install next@16.2.2` and test. Medium effort.

### F5: Report tokens stored unhashed in database
- **Phase:** 6 | **Severity:** FAIL
- **File:** `src/app/report/[token]/page.tsx:79-83`
- **Issue:** Report access tokens stored as plaintext UUIDs in `cases.report_token`. Unlike session tokens and magic links (SHA-256 hashed), report tokens can be extracted from any database breach to access criminal defense reports. The most sensitive data on the platform.
- **Fix:** Add `report_token_hash` column, populate from existing tokens, update lookup to check hash first then fall back to plaintext, drop plaintext after all tokens expire (12 months). Medium effort, requires migration planning.

---

## NEEDS WORK — Fix This Sprint (top 15)

### NW1: Blog UPL violation B4 — "you need to take immediate action"
- **Phase:** 17 | **File:** `content/blog/attorney-not-returning-calls.mdx:194`
- **Issue:** "you need to take immediate action. That means exploring new counsel, contacting the bar, or filing a motion for substitution of counsel." Clearest U4 instance in blog content. Live, indexable, regulatorily actionable.
- **Fix:** Replace with "Immediate action is worth considering — options include exploring new counsel, contacting the bar, or filing a motion for substitution of counsel." 5-minute fix.

### NW2: Title tag overruns on 4 high-traffic pages
- **Phase:** 16 | **Files:** `src/app/blog/page.tsx` (83 chars with template), `src/app/services/page.tsx` (92 chars), `src/app/playbooks/page.tsx` (82 chars), `src/app/research/defense-score-data/page.tsx` (91 chars)
- **Issue:** SERP truncation on the highest-traffic pages. Target: all titles <=42 chars so template produces <=60 total.
- **Fix:** Shorten base titles. 30-minute fix.

### NW3: Apply Phase 14 a11y autofix patches (19 patches, 12 files)
- **Phase:** 14 | **Files:** services/page.tsx:325, playbooks/page.tsx:120, score/page.tsx:1037, start/page.tsx:44+119+364 (duplicate main); sample/page.tsx:176+300+607 (scrollable region); research/defense-score-data/page.tsx (color-only links); my-cases/login/page.tsx:80, partner/login/page.tsx:83 (missing htmlFor); intake/page.tsx:1091+1228 (checkbox group labels); admin/partners/page.tsx:452-526 (7 admin labels); partner/dashboard/page.tsx:346-401 (payment form labels); IntakeChargeSelector.tsx:171 (span onClick)
- **Issue:** 26 accessibility violations across 12 files. Patches written and ready to apply.
- **Fix:** Apply in sequence per Phase 14 application order. ~100 minutes total.

### NW4: Bump substantive body text from text-sm to text-base
- **Phase:** 4 | **Files:** `src/components/FAQAccordion.tsx:74`, `src/components/TestimonialSection.tsx:25,45`, `src/components/PricingTable.tsx:266,279,293,361`, `src/components/PlaybookSalesPage.tsx:161,182,267,281`, `src/app/score/page.tsx:538,573`, `src/app/start/page.tsx:177-184,231-238`, `src/app/page.tsx:314`
- **Issue:** Crisis buyers with 80% reduced cognitive capacity (Covello) reading decision-critical content at 14px on mobile. Affects FAQ answers, testimonials, pricing features, score observations, urgency blocks.
- **Fix:** Change `text-sm` to `text-base` on all substantive content. ~60 minutes.

### NW5: Fix broken SearchAction schema
- **Phase:** 16 | **File:** `src/app/layout.tsx:161-165`
- **Issue:** SearchAction targets `/blog?q={search_term_string}` but the blog page only supports `?category=` filtering. Google may surface a non-functional search box.
- **Fix:** Remove `potentialAction` entirely or implement actual blog search. 5-minute fix.

### NW6: Add /dui-defense hub page to sitemap
- **Phase:** 16 | **File:** `src/app/sitemap.ts`
- **Issue:** 50 state child pages are in the sitemap, but the parent hub `/dui-defense` is absent. Breaks parent-child signal.
- **Fix:** Add entry at priority 0.7. 5-minute fix.

### NW7: Add ClaudeBot to robots.ts AI allowlist
- **Phase:** 16 | **File:** `src/app/robots.ts`
- **Issue:** GPTBot, PerplexityBot, and Applebot-Extended are allowed. ClaudeBot is missing — GEO gap for Anthropic-powered AI citations.
- **Fix:** Add `{ userAgent: "ClaudeBot", allow: ["/"] }`. 2-minute fix.

### NW8: Add sex-offense category to schema.ts entity and citation maps
- **Phase:** 16 | **File:** `src/lib/schema.ts:21-58, 65-206`
- **Issue:** New sex offense blog post generates no `about` entities and no citations. Missing from `getArticleAboutEntities()` and `getArticleCitations()`.
- **Fix:** Add category entity and citation mapping. 15-minute fix.

### NW9: Fix /start page missing metadata (highest-intent entry page)
- **Phase:** 13-21 | **File:** `src/app/start/layout.tsx` (needs creation)
- **Issue:** /start is `"use client"` — metadata must be in a parent layout.tsx. No layout exists. Page renders with root defaults.
- **Fix:** Create `src/app/start/layout.tsx` with title, description, and openGraph block. 10-minute fix.

### NW10: Correct playbook breadcrumb parent URL
- **Phase:** 16 | **File:** `src/app/playbook/[slug]/page.tsx:82`
- **Issue:** Breadcrumb position 2 URL is `/services` but actual parent is `/playbooks`. Schema hierarchy mismatch.
- **Fix:** Change item URL from `/services` to `/playbooks`. 2-minute fix.

### NW11: Add rate limiting to unsubscribe POST endpoint
- **Phase:** 6 | **File:** `src/app/api/unsubscribe/route.ts:138`
- **Issue:** No rate limiting on POST handler. Attacker could brute-force base64-encoded emails to mass-unsubscribe users.
- **Fix:** Add IP-based rate limiting (10/IP/minute). 5-line code change.

### NW12: Add CSP object-src and worker-src directives
- **Phase:** 6 | **File:** `src/middleware.ts:144-155`
- **Issue:** CSP does not explicitly set `object-src` or `worker-src`. Currently inherits from `default-src 'self'` but explicit directives are best practice.
- **Fix:** Add `"object-src 'none'"` and `"worker-src 'self'"`. 2-line addition.

### NW13: Fix LCP on homepage and playbook pages (>2.5s target)
- **Phase:** 9-10 | **Files:** `src/app/page.tsx`, `src/app/playbook/[slug]/page.tsx`
- **Issue:** Homepage LCP 3.5s, playbook 3.4s, blog 2.9s. Root cause: ~3s element render delay from heavy JS (61-113 KB unused per page).
- **Fix:** Audit chunk `fa2781425ab4846b.js`, apply `next/dynamic` for below-fold components.

### NW14: Fix score observations exceeding Covello 27-word limit
- **Phase:** 13-21 | **File:** `src/lib/score.ts`
- **Issue:** 7 of ~20 observations exceed 27 words. Public defender observation is 49 words. These are the core value delivery of the score tool.
- **Fix:** Cut longest offenders: public defender (49w -> <=27w), compound penalty (38w), pre-trial/no motions (33w), strategy briefly discussed (31w), no communication (31w), sentencing stage (31w).

### NW15: Fix touch targets below 44px minimum
- **Phase:** 4 | **Files:** `src/components/Header.tsx:104,183` (CTA py-2 = ~36px), `src/components/ChargeTypeSelector.tsx:138` (buttons py-2 = ~36px)
- **Issue:** Mobile CTA in header and charge type buttons fall below 44px touch target minimum.
- **Fix:** Change `py-2` to `py-3` on Header CTA and ChargeTypeSelector buttons.

---

## Regression Diff (vs v1 audit)

### Fixed Since v1

The following issues from v1 (commits 8017e39 + f45536a) are confirmed resolved in v2:

| v1 ID | Issue | Status in v2 |
|-------|-------|-------------|
| C1 | Duplicate `<main>` on homepage (`page.tsx:147`) | **FIXED** — homepage now clean (0 violations). Duplicate main still present on /services, /playbooks, /score, /start (different pages). |
| C2 | PartnerApplicationForm missing label associations | **FIXED** — Phase 7 confirms all 7 fields correctly wired with htmlFor/id pairs. |
| C3 | IntakeChargeQuestions missing radio semantics | **FIXED** — Phase 7 confirms `<fieldset role="radiogroup">`, `<legend>`, `<button role="radio" aria-checked>` all present. |
| H1 | UPL banned phrases in score.ts:153,175,266 and drip-emails.ts:419 | **FIXED** — Phase 17 verified all 4 instances clean. ReferralQuiz.tsx:140 and ShareButtons.tsx:40 also fixed. |
| H2 | Color contrast failures (text-zinc-500/zinc-600) | **FIXED** — Phase 3 axe-core confirms zero color-contrast violations site-wide. |
| H3 | RecentPurchaseNotification dark pattern | **FIXED** — No RecentPurchaseNotification component found in v2 codebase (removed). |
| H4 | Pricing buried — no #pricing anchor from hero | **FIXED** — Phase P1-P2 confirms `#pricing` anchor correctly placed and linked from hero. |
| M1 | IndexNow route auth (length oracle) | **FIXED** — Phase 6 confirms now uses `requireCron(req)` from `@/lib/auth/guards`. |
| M2 | Intake unknown charge type not rejected | **FIXED** — Phase 6 confirms unknown charge types return 400 with centralized allowlist. |
| M3 | Charge-taxonomy no caching | **FIXED** — Phase 6 confirms `Cache-Control: public, max-age=3600` on categories endpoint. |
| M4 | Score page heading hierarchy (h1->h3 skip) | **FIXED** — Phase 7 confirms h1 -> h2 -> h3 hierarchy correct. |
| M6 | DiscoveryGate missing aria-pressed | **FIXED** — Phase 7 confirms `aria-pressed` on both filter buttons. |
| M7 | ShareButtons.tsx:40 UPL phrase | **FIXED** — Phase 17 confirms clean. |

### New Issues in v2

These issues were found by v2's expanded 15-layer audit that v1's 6-layer audit did not cover:

| Issue | Phase | Why v1 missed it |
|-------|-------|-----------------|
| Privacy policy GA4 false claim | 18-20 | v1 had no privacy/compliance layer |
| Intake route stale WHERE clause (Flow B bug) | 19 | v1 code review was narrower scope |
| 5 dead DefinedTermSet URLs | 9-10, 16 | v1 had no broken link or SEO/GEO layer |
| npm vulnerabilities (Next.js CSRF bypass) | 6 | v1 security audit did not run npm audit |
| Report tokens unhashed in database | 6 | v1 security focused on auth flows, not data-at-rest |
| SearchAction schema broken (blog?q= non-functional) | 16 | v1 had no structured data audit |
| Missing /start page metadata | 13-21 | v1 had no OG/social metadata layer |
| Title tag overruns (up to 92 chars) | 16 | v1 had no title length analysis |
| 14 missing htmlFor/id on admin/partner forms | 7 | v1 static analysis was narrower (PartnerApplicationForm only) |
| Blog UPL violation B4 (attorney-not-returning-calls) | 17 | v1 UPL scan was 3-file scope; v2 scanned 50+ files |
| Score observations >27 words (Covello) | 13-21 | v1 had no readability/Covello layer |
| LCP 3.4-3.5s on homepage/playbook | 9-10 | v1 had no Lighthouse performance layer |
| 50 thin state DUI pages | 16 | v1 had no programmatic page depth analysis |
| Missing ClaudeBot in robots.ts | 16 | v1 had no GEO layer |
| Checkout req.json() missing try/catch | 19 | v1 code review scope |
| Operator token XOR vs HMAC-then-compare | 6 | v1 security scope |

### Unchanged (Persisting from v1)

| Issue | v1 ID | v2 Status |
|-------|-------|-----------|
| Body text 14px on mobile (text-sm on substantive content) | M8 | Still present. Identified by both audits. Phase 4 provides comprehensive file:line list. |
| Duplicate `<main>` on non-homepage pages | Partial C1 | v1 caught homepage only. v2 finds /services, /playbooks, /score, /start still have inner `<main>`. |

---

## What's Working Well

**Crisis UX (site's strongest area):**
- CrisisHero auto-detection (10PM-6AM) with stripped single-CTA interface
- /start page implements Covello Rule of 3 above fold with binary routing
- Score tool charge-specific urgency blocks with 10 distinct charge type variants
- Attorney email templates are copy-paste ready with zero effort
- StickyMobileCTA with intersection observer fires correctly on scroll

**UPL Compliance Infrastructure:**
- Zero critical violations (U6-U15) across 50+ files
- Prompts engine self-governance mirrors the external banned phrase matrix
- "Legal information, not legal advice" disclaimer on every major surface
- Previous fixes (score.ts, drip-emails.ts, ReferralQuiz, ShareButtons) all verified clean

**Security Foundations:**
- Defense-in-depth auth: middleware (Edge) + route guards (Node) with independent timing-safe HMAC checks
- Rate limiting with closed fallback (in-memory when Supabase unavailable, blocks rather than allows)
- 10-point file upload security (UUID validation, ownership check, MIME allowlist, magic byte validation, private bucket)
- Atomic claim-then-mutate patterns prevent TOCTOU races
- Anti-enumeration: magic link and unsubscribe always return success regardless of email existence

**GEO/SEO (ahead of 95% of YMYL competitors):**
- `speakable` specification on every blog post targeting `.tldr-box`
- `citation` arrays with verified .gov/.edu URLs on 35+ posts
- `DefinedTermSet` glossary for entity territory claiming (fix the 5 broken URLs and this becomes a moat)
- AI bot allowlist (GPTBot, PerplexityBot, Applebot-Extended) in robots.ts
- Product schema with return policy and shipping details on playbook pages

**Conversion Architecture:**
- Score tool: band-specific CTA copy, crisis/non-crisis bifurcation, charge-specific attorney email templates, aggregate benchmark data
- "Find It or It's Free" guarantee with X-Ray's 3-layer guarantee stack
- 100% upgrade credit architecture eliminates "wrong tier" purchase anxiety
- Pro-defendant voice consistency: zero anti-attorney language across entire site

**Accessibility Wins:**
- Lighthouse a11y 100/100 on all 4 pages tested (subset of full ruleset)
- Zero color-contrast violations (fixed from v1)
- Mobile nav: scroll lock, focus trap, Escape handler
- IntakeChargeQuestions: full ARIA radio pattern
- `prefers-reduced-motion` respected via `useReducedMotion()` in motion components
- 7 of 13 axe-core scanned pages completely clean

---

## Phase Reports

| Phase | Report Path | Key Stat |
|-------|-------------|----------|
| 3 — axe-core Runtime | `phase3-axe-runtime.md` | 5 unique violations, 2 SERIOUS, 7/13 pages clean |
| 4 — Design & UX | `phase4-design-ux.md` | 5.2/7 overall, text-sm systemic, card monoculture |
| 6 — Security | `phase6-security.md` | 2 SERIOUS + 3 MODERATE + 1 MINOR, strong foundations |
| 7 — JSX A11y Static | `phase7-jsx-a11y-static.md` | 21 real issues, 14 SERIOUS (missing labels) |
| 8 — Community Access | `phase8-community-access.md` | Root-cause analysis for all a11y violations |
| 9-10 — Lighthouse + Links | `phase9-10-lighthouse-links.md` | Perf 82-94, LCP 1.9-3.5s, 5 dead schema URLs |
| 13-21 — Readability + Social | `phase13-21-readability-social.md` | 7 score observations >27w, /start missing metadata |
| 14 — A11y Autofix | `phase14-a11y-autofix.md` | 19 patches across 12 files, ~100 min to apply |
| 16 — SEO/GEO | `phase16-seo-geo.md` | 3 CRITICAL, 7 HIGH, advanced GEO implementation |
| 17 — UPL Scan | `phase17-upl-scan.md` | 0 critical, 1 clear U4 in blog (B4), infrastructure strong |
| 18-20 — Privacy + Errors | `phase18-20-privacy-errors.md` | GA4 false claim (FAIL), error states well-covered |
| 19 — Code Review | `phase19-code-review.md` | 1 CRITICAL logic bug (intake WHERE), 1 HIGH |
| P1-P2 — CRO + Positioning | `phaseP1-P2-cro-positioning.md` | 35/38 PASS (92%), trust 5/5, CRO 15/17 |
| P3 — Reality Checker | `phaseP3-reality-checker.md` | 5 challenged PASS ratings, 5 contradictions, 10 blind spots |
| CAP — Eval Framework | `phaseCAP-eval-framework.md` | 121 PASS / 38 NEEDS WORK / 5 FAIL, CONDITIONAL GO |

## Runtime Stats

| Phase | Tokens | Tool Calls | Duration |
|-------|--------|------------|----------|
| 3 — axe-core Runtime | ~76K | 34 | ~6 min |
| 4 — Design & UX | ~111K | 66 | ~9 min |
| 6 — Security | ~155K | 87 | ~8 min |
| 7 — JSX A11y Static | ~80K | 45 | ~7 min |
| 8 — Community Access | ~60K | 30 | ~5 min |
| 9-10 — Lighthouse + Links | ~90K | 55 | ~8 min |
| 13-21 — Readability + Social | ~100K | 50 | ~8 min |
| 14 — A11y Autofix | ~70K | 35 | ~5 min |
| 16 — SEO/GEO | ~130K | 70 | ~10 min |
| 17 — UPL Scan | ~85K | 40 | ~7 min |
| 18-20 — Privacy + Errors | ~75K | 38 | ~6 min |
| 19 — Code Review | ~90K | 50 | ~7 min |
| P1-P2 — CRO + Positioning | ~120K | 55 | ~9 min |
| P3 — Reality Checker | ~95K | 30 | ~8 min |
| CAP — Eval Framework | ~110K | 45 | ~9 min |
| **Total** | **~1,447K** | **~730** | **~15 min (parallel)** |

---

## Ready-to-Paste Fix Prompt

```
Execute the following fixes from the v2 audit report at:
  C:\Users\email\projects\ImNotAnAttorney-web\docs\audit\2026-04-02-v2\AUDIT-REPORT.md

Fix all 5 FAIL items and the top 10 NEEDS WORK items in priority order:

**FAIL fixes (do these first):**
1. F1: Update privacy policy Section 8 in src/app/privacy/page.tsx to disclose GA4 tracking cookies, and add Google Analytics to Section 5 third-party services list.
2. F2: In src/app/api/intake/route.ts line 276, change .eq("status", "awaiting-intake") to .eq("status", "intake"). One-line fix.
3. F3: In src/lib/schema.ts lines 233-278, update 5 dead DefinedTermSet URLs:
   - Chain of Custody -> /blog/how-to-read-your-discovery
   - Suppression Motion -> /blog/what-motions-should-your-attorney-be-filing
   - Field Sobriety Test -> /blog/field-sobriety-test-standards
   - Plea Bargain -> /blog/should-you-take-the-plea-deal
   - Sentencing Guidelines -> /blog/how-to-prepare-for-sentencing
4. F4: Run npm audit fix, then npm install next@16.2.2, verify build passes.
5. F5: Plan only — hash report tokens. Add report_token_hash column, populate from existing tokens, update lookup in src/app/report/[token]/page.tsx to check hash first. This is a migration — plan it, don't execute blind.

**NEEDS WORK fixes (do after FAILs):**
6. NW1: In content/blog/attorney-not-returning-calls.mdx line 194, replace "you need to take immediate action. That means exploring new counsel, contacting the bar, or filing a motion for substitution of counsel" with "Immediate action is worth considering — options include exploring new counsel, contacting the bar, or filing a motion for substitution of counsel."
7. NW3: Apply all 19 Phase 14 a11y autofix patches from C:\Users\email\projects\ImNotAnAttorney-web\docs\audit\2026-04-02-v2\phase14-a11y-autofix.md — follow the application order at the bottom of that file.
8. NW5: In src/app/layout.tsx lines 161-165, remove the potentialAction SearchAction block from WebSite schema.
9. NW6: In src/app/sitemap.ts, add /dui-defense to the static pages array at priority 0.7.
10. NW7: In src/app/robots.ts, add { userAgent: "ClaudeBot", allow: ["/"] } to the AI bot allowlist.
11. NW8: In src/lib/schema.ts, add "sex-offense" to getArticleAboutEntities() and getArticleCitations() maps.
12. NW10: In src/app/playbook/[slug]/page.tsx line 82, change breadcrumb position 2 item URL from /services to /playbooks.
13. NW11: In src/app/api/unsubscribe/route.ts, add IP-based rate limiting (10/IP/minute) before the POST handler logic.
14. NW12: In src/middleware.ts CSP directives, add "object-src 'none'" and "worker-src 'self'".

Phase 14 autofix patches are the most time-consuming item (~100 min). Everything else is quick fixes. Do NOT skip F2 (the intake WHERE clause) — it's the only active logic bug in a payment-critical path.

Read the full audit report for context on each fix. Read phase14-a11y-autofix.md for exact old/new code blocks before applying patches.
```
