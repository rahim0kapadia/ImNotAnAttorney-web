# V2 Audit Fixes — 5 FAILs + 10 NEEDS WORK

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\audit\2026-04-02-v2\AUDIT-REPORT.md`
**Patches:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\audit\2026-04-02-v2\phase14-a11y-autofix.md`
**Triage:** FEATURE (remaining 4 items from LARGE_BUILD)
**Context:**
- Repo: ImNotAnAttorney-web
- Problem: 5 FAIL + 10 NEEDS WORK findings from 15-layer v2 audit blocking go-live
- Key files: privacy/page.tsx, intake/route.ts, schema.ts, layout.tsx, 12 a11y patch files, middleware.ts, robots.ts, sitemap.ts
- Tech stack: Next.js 15 App Router, Tailwind CSS, Supabase, Stripe
- Key decisions: Disclose GA4 (not remove), hash tokens with SHA-256, add rate limiting to unsubscribe
- Setup: `npm install && npm run dev`

## Completed

- [x] F1: Privacy policy GA4 disclosure — TL;DR, Section 5 (GA added), Section 8 (cookies rewritten)
- [x] F2: Intake route WHERE clause fixed (intake/route.ts:276)
- [x] F3: 5 dead DefinedTermSet URLs in schema.ts
- [x] F4: npm audit fix + Next.js 16.2.2 (CSRF fix). 1 remaining: Anthropic SDK (breaking change, deferred)
- [x] NW1: Blog UPL fix (attorney-not-returning-calls.mdx)
- [x] NW-main: 4 pages duplicate main→div (services, playbooks, score, start — all 7 opening+closing tags)
- [x] NW-search: SearchAction removed from layout.tsx
- [x] NW-meta: /start layout.tsx already existed with metadata
- [x] NW-a11y: All Phase 14 patches applied (scrollable tables, color-only links, htmlFor/id x4 forms, fieldset/legend x2, IntakeChargeSelector span→div, admin partners 7 labels, partner dashboard 4 labels)
- [x] NW-seo: ClaudeBot in robots.ts, /dui-defense in sitemap.ts, breadcrumb /services→/playbooks
- [x] NW-security: CSP object-src 'none' + worker-src 'self' in middleware.ts
- [x] NW-titles: 4 page titles shortened to ≤42 chars (blog, services, playbooks, research)
- [x] NW-text: text-sm→text-base on FAQAccordion, TestimonialSection (both variants), PricingTable (all feature lists)
- [x] NW-touch: py-2→py-3 on Header CTA + ChargeTypeSelector buttons
- [x] NW8-partial: sex-offense added to schema.ts categoryEntities + tagEntities + citations
- [x] NW11: IP rate limiting (10/IP/min) on unsubscribe POST using checkRateLimit()
- [x] Build verified: `npm run build` passes clean

## Completed (Session 2)

- [x] R1: text-sm→text-base on PlaybookSalesPage (12 paragraphs), score/page (17 paragraphs), start/page (6 items), page.tsx (11 paragraphs). A11y-lead reviewed and approved.
- [x] R2: F5 — hashToken() exported from site.ts, batch-poller stores report_token_hash, report/[token] + my-case/[token] query by hash with plaintext fallback, migration 034 applied + backfilled. JS/PG hash parity verified.

---

## Task 1: F1 Remaining + F3 — Privacy GA4 Disclosure + Schema URLs

**Files:** `src/app/privacy/page.tsx`, `src/lib/schema.ts`

### 1a. Privacy Section 5 — Add Google Analytics to third-party list
After Cloudflare `<li>` (~line 318-321), add GA4 entry with cookie disclosure + link to Google Privacy Policy.

### 1b. Privacy Section 8 — Update cookie disclosure
Replace false "no tracking cookies" paragraph with GA4 cookie disclosure (_ga, _ga_* cookies, 2yr/24h expiry).

### 1c. Schema.ts — Replace 5 dead DefinedTermSet URLs
- `evidence-handling-criminal-cases` → `how-to-read-your-discovery`
- `motion-to-suppress-evidence` → `what-motions-should-your-attorney-be-filing`
- `field-sobriety-test-accuracy` → `field-sobriety-test-standards`
- `plea-bargain-questions` → `should-you-take-the-plea-deal`
- `federal-sentencing-guidelines` → `how-to-prepare-for-sentencing`

---

## Task 2: F4 — npm Audit Fix

**Files:** `package.json`, `package-lock.json`

1. Run `npm audit` to see vulnerabilities
2. Run `npm audit fix` for non-breaking fixes
3. If Next.js <16.2.2, run `npm install next@latest`
4. Run `npm run build` to verify

---

## Task 3: F5 — Hash Report Tokens

**Files:** `src/app/api/webhooks/stripe/route.ts`, `src/app/report/[token]/page.tsx`, `src/app/my-case/[token]/page.tsx`, `src/lib/site.ts`

Per ARCHITECTURE.md: "Session token hashing. All auth tokens stored as SHA-256 hashes." Report tokens must follow same pattern.

1. Locate or add `hashToken()` utility (SHA-256 hex) — likely exists in site.ts
2. Stripe webhook: store `report_token_hash = hashToken(token)` alongside plaintext
3. report/[token]/page.tsx: hash URL token, query by hash (fallback to plaintext for migration)
4. my-case pages: same pattern
5. Supabase migration: `ALTER TABLE cases ADD COLUMN report_token_hash text;`
6. Backfill: `UPDATE cases SET report_token_hash = encode(sha256(report_token::bytea), 'hex') WHERE report_token IS NOT NULL;`

---

## Task 4: NW1 + Duplicate Main + SearchAction

**Files:** `content/blog/attorney-not-returning-calls.mdx`, `src/app/services/page.tsx`, `src/app/playbooks/page.tsx`, `src/app/score/page.tsx`, `src/app/start/page.tsx`, `src/app/layout.tsx`

- Blog UPL: Replace "you need to take immediate action" with "Immediate action is worth considering"
- Duplicate main→div: services(:325/:877), playbooks(:120/:250), score(:1037/:1225), start(3 instances)
- SearchAction: Remove potentialAction block from layout.tsx WebSite schema

---

## Task 5: Phase 14 A11y Patches

**Files:** `src/app/sample/page.tsx`, `src/app/research/defense-score-data/page.tsx`, `src/app/my-cases/login/page.tsx`, `src/app/partner/login/page.tsx`, `src/app/intake/page.tsx`, `src/app/admin/partners/page.tsx`, `src/app/partner/dashboard/page.tsx`, `src/components/IntakeChargeSelector.tsx`

Apply per phase14-a11y-autofix.md:
- AX-05: 3 scrollable tables — tabIndex={0} role="region" aria-label
- AX-06: color-only links — underline hover:no-underline
- F01-A/B: login htmlFor/id pairs
- F01-C/D: intake fieldset/legend
- F01-E: admin partners 7 htmlFor/id pairs
- F01-F: partner dashboard 4 htmlFor/id pairs
- F04: IntakeChargeSelector span→div role="presentation"

---

## Task 6: SEO/GEO Config Fixes

**Files:** `src/app/robots.ts`, `src/app/sitemap.ts`, `src/lib/schema.ts`, `src/app/playbook/[slug]/page.tsx`

- ClaudeBot in robots.ts
- /dui-defense in sitemap.ts at priority 0.7
- sex-offense in schema.ts entity + citation maps
- Breadcrumb: /services → /playbooks in playbook/[slug]/page.tsx

---

## Task 7: Security — Rate Limit + CSP

**Files:** `src/app/api/unsubscribe/route.ts`, `src/middleware.ts`

- IP rate limiting (10/IP/min) on unsubscribe POST
- CSP: add `object-src 'none'` and `worker-src 'self'`

---

## Task 8: UI Polish — Titles + Text Size + Touch Targets

**Files:** `src/app/blog/page.tsx`, `src/app/services/page.tsx`, `src/app/playbooks/page.tsx`, `src/app/research/defense-score-data/page.tsx`, `src/components/FAQAccordion.tsx`, `src/components/TestimonialSection.tsx`, `src/components/PricingTable.tsx`, `src/components/PlaybookSalesPage.tsx`, `src/app/score/page.tsx`, `src/app/start/page.tsx`, `src/app/page.tsx`, `src/components/Header.tsx`, `src/components/ChargeTypeSelector.tsx`

- Title tags: shorten to ≤42 chars (4 pages)
- text-sm → text-base on substantive content (FAQAccordion, TestimonialSection, PricingTable, PlaybookSalesPage, score, start, homepage)
- Touch targets: py-2 → py-3 on Header CTA + ChargeTypeSelector buttons

---

## Execution Order

Tasks 1-3 are FAILs (highest priority). Tasks 4-8 are NEEDS WORK.
All tasks are independent — parallel execution via swarm dispatch.
