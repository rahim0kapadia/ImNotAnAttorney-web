# D1 — Judge Report Card → Judge Question Brief: Rename + Banned-Copy Scrub

**Date:** 2026-04-26
**Status:** READY-FOR-EXECUTION
**Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
**Owner-prep:** Plan-execution swarm
**Stripe price:** UNCHANGED ($197; LIVE)
**URL slug:** UNCHANGED (`/judge-report-card` — SEO-stable)
**DB columns/tables:** UNCHANGED (`tier_slug='judge-report-card'`, all migrations)
**Source verdict:** REPRICE-THEN-SHIP (apex), per `~/.claude/projects/C--Users-email-projects-ImNotAnAttorney/memory/worry-judge-fingerprint-safety-resolved-2026-04-23.md`

---

## 1. Context

The $197 v3 Judge Sentencing Fingerprint product shipped to Supabase 2026-04-23 with 4 v3-safe signals (Signals 1-4; Signal 5 deferred to v4 at 0.2% canonical coverage). The product is consumed by criminal defendants at 2am post-arrest. Apex verdict: the existing customer-facing name "Judge Report Card" + supporting copy frames it as a **prediction / grade**, which is UPL-adjacent and unsafe for the actual data shape (small denominators, NULL dispositions, jackknife-baseline reversal rates). Reframe as **preparation, not prediction**. Hold the $197 price.

### Tech stack (relevant slice)
- Next.js 15 App Router (TypeScript), Tailwind, server components on the sales page
- Sales route: `src/app/judge-report-card/page.tsx` (already named per URL slug — slug stays)
- Tier 9 report renderer: `src/lib/tier9-reports/render.ts` (exports `renderJudgeReportCard`)
- Product registries: `src/lib/tiers.ts` (TIER_CORE, checkout-validation source) and `src/lib/products.ts` (intake/delivery/viewer source)
- Sitemap: `src/app/sitemap.ts`
- Existing precedent: `src/lib/tier9-reports/__tests__/courthouse-intelligence.test.ts` already names the rebrand at line 166 ("cross-references the upsell to Judge Question Brief, not Judge Report Card ($197)") — locks the new name.

### Worry / banned-copy list (verbatim from cached approval)
> Banned copy: "grade", "score", "report card", "rating", "predicts", "underperforms", "higher-than-average reversal rate suggests your case may be at elevated risk."
>
> Mandatory gate line: "This is not a prediction. This is a list of questions your attorney should be able to answer about your judge."

The word **"score"** has one customer-facing carve-out: the unrelated `/score` quiz funnel, which is the email-capture survey for the broader site. That URL + product is not part of this product. Banned-copy grep MUST scope to files in this plan's mod list.

### Grep counts (current surface area)
- `Judge Report Card` (case-sensitive): **166 occurrences across 58 files** (incl. ~70 in docs/plans/handoffs/specs which are historical and out of scope)
- `judge-report-card` (slug, kept): **164 occurrences across 51 files** — these stay (URL/DB/Stripe lookup-key references)
- `Report Card` (broad): **173 occurrences across 58 files** (superset of "Judge Report Card")

Customer-facing files needing changes: **8 source files + 3 blog MDX + 4 supporting test/script touchpoints = 15 files**. Historical docs/handoffs/plans = NOT touched.

---

## 2. Key decisions (and WHY)

1. **URL slug stays `/judge-report-card`** — SEO equity, no 301 burden, no Stripe metadata churn. Display name is the only thing that changes for customers. Apex verdict explicitly held the $197 price; the slug is on the same side of that line.
2. **DB columns stay `tier_slug='judge-report-card'`** — Stripe webhook lookup, intake forms, generation router, and 5 migrations all reference the slug. Renaming the slug = ripple across every tier-9 surface for zero customer benefit.
3. **New display name = "Judge Question Brief"** — already pre-locked in `courthouse-intelligence.test.ts:166-167` ("Apex rename: Judge Report Card → Judge Question Brief"). Use this everywhere customer-facing.
4. **Banned-copy scrub scope = customer-facing surfaces only** — sales page, OG image, product registries, report renderer, blog MDX, sitemap entry titles. Test files and internal comments may keep "Judge Report Card" as historical context with a `// renamed to Judge Question Brief 2026-04-26` marker; per Pristine-Or-Nothing this counts as documented out-of-scope (own subsystem: developer-facing test scaffolding). Hard requirement: render-output strings must use the new name even when source-comment names use the old.
5. **Mandatory gate line placement** — appears verbatim **at least once** on the sales page (above the fold, before pricing) AND **at least once** in the rendered HTML report (top of report body, before any data table). Two anchor points = belt-and-braces against UPL drift.
6. **JSON-LD Product `name` field** — must use new display name; Google Merchant / search snippets pick this up. Description must drop "report card" verbiage but keep verifiable claims about data sourcing.
7. **OG image alt + title** — alt text "Judge Question Brief, ImNotAnAttorney"; OG title rewrite is a content choice, not a routing change. Use "Questions To Ask\nAbout Your Judge" or similar reframe (concrete copy in Task 8).
8. **Blog MDX** — link text only (the `[Judge Report Card](/judge-report-card)` markdown). Slug in href is unchanged. Task replaces visible link text + surrounding sentence framing where it asserts prediction (e.g., "shows your specific judge's sentencing patterns" → "lists questions your attorney should be able to answer about your judge's pattern"). 595k blog post needs careful surgery (see Task 12) because copy is more aggressive there.
9. **No new files** — every change is an edit. Plan execution must use Edit, not Write, on existing files.
10. **Banned-copy hits already in-tree with legitimate intent** — `tiers.ts` and `products.ts` reference "report card" in product `name` fields and inside upsell-text strings; those ARE the customer-facing display name and ARE the change. Test-file references to "Judge Report Card" in describe/it block names remain (historical-context comment); render-output assertions must check for the new name where present.
11. **Out of scope explicitly:**
    - Signal 5 ship (deferred to v4 per cached approval)
    - Stripe price ID change ($197 holds)
    - URL slug change (kept for SEO)
    - DB column / tier_slug change
    - 301 redirects (none needed; slug stable)
    - Historical docs/plans/handoffs (write-once history; do not rewrite)
    - Internal test describe/it titles that reference the old name as historical (test file comment marker is sufficient)

### Cascade map (all 6 nodes)
- **Us:** ship the v3 product safely; eliminate UPL exposure; keep $197 price; lock the rename in test assertions so future regressions fail loudly.
- **Direct counterparty (defendant at 2am):** receives a product framed as preparation (questions to ask), not a prediction (grade/score). Less likely to walk into court with a misread of "underperforming judge = elevated risk." Higher trust because the gate line is explicit.
- **Their downstream (defendant's attorney):** receives a client who arrived with informed questions, not adversarial predictions about the judge. Conversation quality goes up; attorney-client friction goes down.
- **Ecosystem (legal info / SEO ecosystem):** the URL `/judge-report-card` keeps its backlinks and indexing; the on-page reframe raises the floor for how legal-info products talk about judge data (preparation > prediction).
- **Future-us:** v4 Signal 5 lands without naming churn — name is already correct; only data shape evolves. Test-file rename assertion at courthouse-intelligence.test.ts:166 stays load-bearing.
- **Adjacent players (other legal-info competitors):** none lose. If competitors copy the framing it raises the industry floor on UPL safety; if they don't, our positioning sharpens.

---

## 3. Files to modify

### 3a. Customer-facing source (REQUIRED)

| # | File | Change |
|---|------|--------|
| 1 | `src/app/judge-report-card/page.tsx` | Rename all customer-visible "Judge Report Card" → "Judge Question Brief"; rewrite hero sub-headline + value-prop list to drop predictive framing; add mandatory gate line above pricing; update FAQ items 1, 4, 5, 6 (drop "report card" verbiage); rewrite sample-table caption + a row label to drop ranking framing; update JSON-LD Product `name` + description; update BreadcrumbList `name`; update `AvailabilityChecker productName` prop. 8 visible-text occurrences. |
| 2 | `src/app/judge-report-card/opengraph-image.tsx` | Update `alt` export ("Judge Question Brief, ImNotAnAttorney"); rewrite OG `title` to drop "Judge?" question-mark-as-grade framing → "Questions To Ask\nAbout Your Judge" (or equivalent). 1 alt occurrence + 1 title occurrence. |
| 3 | `src/lib/tiers.ts` | TIER_CORE["judge-report-card"]: `name: "Judge Question Brief"`; rewrite `deliveryDetail` line to swap product name; key stays. 2 visible-string occurrences. |
| 4 | `src/lib/products.ts` | (a) PRODUCT entry `judge-report-card`: `name: "Judge Question Brief"`; rewrite `deliveryDetail`, `description`, `upsellText` to drop predictive framing + use new name. (b) `sentencing-calculator` entry: rewrite `upsellText` (line 145) — drop "Judge Report Card" / drop "sentences differently — sometimes by 50 percent" predictive framing → reframe as "questions your attorney should be able to answer". (c) `judge-comparison` entry: rewrite `upsellText` (line 161-162) — swap "Judge Report Card" for "Judge Question Brief", drop "complete intelligence package" framing. (d) `district-court-intelligence` entry already aligned (line 1280, "Judge Question Brief shows the patterns questions you should be asking") — verify but no change. 4 visible-string occurrences across 3 product entries. |
| 5 | `src/lib/tier9-reports/render.ts` | `renderJudgeReportCard`: change `wrapReport("Judge Report Card", ...)` no-data branch (line 177) and `wrapReport(\`Judge Report Card, ${judge.name}\`, ...)` final branch (line 581) → use "Judge Question Brief". Insert mandatory gate line at top of `body` (before "Judge Profile" section header): `<p style="...">This is not a prediction. This is a list of questions your attorney should be able to answer about your judge.</p>` Drop or rewrite any banned phrasing in section labels (e.g., section headers framed as "ratings"). 3 visible-string occurrences. |
| 6 | `src/app/r/[code]/[product]/page.tsx` | Line 367 visible label "Judge Report Card availability checker" sits inside a comment — no customer impact, leave + add `// renamed → Judge Question Brief` marker. **Customer-facing line 374**: `href="/judge-report-card#availability"` — slug stays; verify no visible text says "Report Card". 1 inspection (no edit unless surrounding visible text references it). |
| 7 | `src/app/district-court-intelligence/page.tsx` | FAQ entry at line 96-98: "How is this different from the Judge Report Card?" → "How is this different from the Judge Question Brief?" + rewrite answer body (drop "Judge Report Card" → "Judge Question Brief"; drop framing phrases that conflict with reframe). 2 visible-string occurrences. |
| 8 | `src/app/sitemap.ts` | Line 70 (`DEDICATED_ROUTE_SLUGS`) — slug stays, no change. Line 271 sitemap entry URL stays. No visible text in sitemap. **No change.** Listed here only to confirm. |

### 3b. Customer-facing blog MDX (REQUIRED — content layer)

| # | File | Change |
|---|------|--------|
| 9 | `content/blog/595k-federal-sentences-exposed.mdx` | (a) FAQ answer line 24-26: "Our Judge Report Card pulls from this dataset…" → "Our Judge Question Brief pulls from this dataset…"; rewrite "show your specific judge's departure rates, sentencing tendencies" to drop predictive framing. (b) CTA line 118: link text "[Judge Report Card](...)" → "[Judge Question Brief](...)"; rewrite surrounding sentence ("pulls your specific judge's sentencing history…patterns that are invisible") to drop the implicit-prediction framing → reframe as "lists the questions your attorney should be able to answer about your judge". 3 occurrences. |
| 10 | `content/blog/bench-trial-vs-jury-real-numbers.mdx` | Line 128: link text "[Judge Report Card](/checkout?tier=judge-report-card)" → "[Judge Question Brief](/checkout?tier=judge-report-card)"; rewrite sentence ("shows your specific judge's sentencing patterns, departure rates, offense-specific tendencies, and how they compare to the district average") to drop "compare" framing → list questions. URL-slug query param stays. 1 occurrence + sentence rewrite. |
| 11 | `content/blog/sentencing-gap-nobody-talks-about.mdx` | Lines 60, 141, 143: 3 visible "Judge Report Card" references. Replace each with "Judge Question Brief". Line 60 sentence "$197 for the intelligence that should inform every sentencing strategy" — keep but drop "should" if present (UPL banned per content-rules.md). Line 141 sentence rewrite (drop "intelligence that should be the foundation of every sentencing strategy" → "questions worth bringing to every sentencing conversation"). Line 143 closing rewrite. 3 occurrences. |

### 3c. Test files + internal scripts (REQUIRED — for green CI)

| # | File | Change |
|---|------|--------|
| 12 | `e2e/sentencing-calc.spec.ts` | Line 91 locator `page.locator('a:has-text("Judge Report Card")')` → `page.locator('a:has-text("Judge Question Brief")')`. The href assertion (`expect(href).toContain("judge-report-card")`) on line 94 stays — slug unchanged. Comments on lines 4 and 13 may keep historical name with marker. 1 functional change. |
| 13 | `src/lib/tier9-reports/__tests__/courthouse-intelligence.test.ts` | Line 146 it-block title "(Judge Report Card $197 territory)" — historical, may keep with marker. Line 167 comment is the rename canonical reference — keep. **No change required;** verify after rename that line 168-169 assertion `expect(html.toLowerCase()).toContain("judge question brief")` still passes against renderCourthouseIntelligence output. 0 changes. |
| 14 | `scripts/e2e-tier9.mjs` | Line 5 comment header references "Judge Report Card ($197)" — internal-only, may keep with marker. Line 90 `slug: "judge-report-card"` — slug, unchanged. **0 changes required**, just verify. |
| 15 | `scripts/ops/upl-drift-sweep.mjs` | Lines 64-68: file-path reference to `src/app/judge-report-card/page.tsx` (slug, unchanged). The replacement-pair targets the disclaimer line "Your attorney remains the final authority on strategy decisions." which is being scrubbed to a different REPLACEMENT. Verify: the replacement target text still exists on the renamed sales page after Task 1 (it does — the disclaimer is the closing footer line 314). **0 changes required.** |

### 3d. Files to create

**None.** Per cached approval: URL slug stays for SEO. No new routes, no new images (the OG image is regenerated automatically by Next.js because `opengraph-image.tsx` is edited).

---

## 4. Tasks (numbered, dependency order)

Tasks 1-2 are independent. Tasks 3-4 must run before 5 (renderer relies on tier-key behavior unchanged but display strings updated; the registries are display-only so order isn't strict, but lower-numbered tasks land first per convention). Tasks 6-8 are independent. Tasks 9-11 are independent (blog MDX). Task 12 must run after Task 1 (e2e spec depends on the new sales-page text being live).

**File budget:** every task touches ≤2 files of code (only Task 4 touches 1 file with 3 entries; still 1 file).

### Task 1 — Sales page rename + gate line + reframed FAQ
**Files:** `src/app/judge-report-card/page.tsx`
**Changes:**
- `generateMetadata.title`: "Judge Report Card" → "Judge Question Brief"
- `generateMetadata.openGraph.title`: rewrite "Judge Report Card, Know Your Judge Before Your First Hearing" → "Judge Question Brief, Questions To Ask About Your Judge"
- Insert immediately after the hero `<h1>` and before pricing block, a new paragraph with class `mt-6 text-base text-zinc-300 italic`: `This is not a prediction. This is a list of questions your attorney should be able to answer about your judge.` (verbatim — mandatory gate line)
- Hero sub-headline (lines 115-117) "Every judge has patterns. The prosecutor knows them. Now you will too." — keep; matches reframe.
- `CHECK_ITEMS` (lines 64-73): rewrite each item from prediction-framed feature → question-framed scope. Examples: "Sentencing patterns backed by 595,851 federal cases" → "Questions to ask about your judge's documented sentencing patterns (data: 595,851 federal cases)". 8 items — apply same shape.
- FAQ_ITEMS:
  - Q1 "What data is in the Judge Report Card?" → "What's in the Judge Question Brief?"; rewrite answer to drop "compiled into a structured report" and replace with "compiled into questions your attorney should be able to answer".
  - Q2 (data sources) — fine, keeps. Replace the embedded "compiled into a structured report" if any.
  - Q3 (legal advice) — keeps, already correct.
  - Q4 "How is it delivered?" — keeps, swap any product-name string.
  - Q5 "What if my judge isn't in the database?" — keeps.
  - Q6 "Will my attorney be upset…?" — rewrite "this data helps you have a more productive conversation with your attorney" — keep, this is on-message.
- Hero `<AvailabilityChecker productName="Judge Report Card"` (lines 130, 308) → `productName="Judge Question Brief"` in both places.
- Sample table caption (line 174-176): "Sample sentencing data — Judge Sarah Martinez, DUI cases" — keep "data", drop any "ranking" verbiage from row labels. Row "Bench trial acquittal rate" / "Higher than jury" — replace VALUE column with neutral "See data; bring to your attorney" or keep numeric value if available; do NOT keep relative ranking.
- JSON-LD Product `name`: "Judge Report Card" → "Judge Question Brief"; `description`: rewrite to drop "compiled" framing + use new name.
- BreadcrumbList position 2 `name`: "Judge Report Card" → "Judge Question Brief".
- Final CTA `<h2>` "Stop Walking Into Court Blind" — keep, matches reframe.
- Final CTA paragraph: "Most defendants walk into court hoping their attorney knows the judge. Defendants who prepare walk in with the data." — keep.
- Closing footer disclaimer line 314 unchanged.

**Verification:** grep the file post-edit for the literal strings `Judge Report Card`, `report card`, `Report Card`, `grade`, `score`, `rating`, `predicts`, `underperforms`, `elevated risk` — all must return zero hits. Grep for the mandatory gate line — must return ≥1 hit.

### Task 2 — OG image alt + title
**Files:** `src/app/judge-report-card/opengraph-image.tsx`
**Changes:**
- `export const alt = "Judge Report Card, ImNotAnAttorney"` → `"Judge Question Brief, ImNotAnAttorney"`
- `renderOgImage({ title: "Who Is\nYour Judge?", subtitle: "Know before you walk in.", category: "Defense Intelligence" })` → `renderOgImage({ title: "Questions To Ask\nAbout Your Judge", subtitle: "Preparation, not prediction.", category: "Defense Intelligence" })`

**Verification:** grep for `Judge Report Card` in this file — zero hits.

### Task 3 — TIER_CORE registry rename
**Files:** `src/lib/tiers.ts`
**Changes:**
- Line 262: `name: "Judge Report Card"` → `name: "Judge Question Brief"`
- Line 266: `deliveryDetail: "Your Judge Report Card is generated on demand the moment you complete purchase."` → `deliveryDetail: "Your Judge Question Brief is generated on demand the moment you complete purchase."`
- Key `"judge-report-card"` STAYS (line 261). Slug stable.

**Verification:** TIER_CORE entry's `name` field returns `Judge Question Brief`; `key` returns `judge-report-card`.

### Task 4 — products.ts registry + upsell text scrub
**Files:** `src/lib/products.ts`
**Changes:**
- Line 1146: `name: "Judge Report Card"` → `"Judge Question Brief"`
- Line 1152: `deliveryDetail: "Your Judge Report Card is generated on demand from verified court records within 60 seconds."` → `"Your Judge Question Brief is generated on demand from verified court records within 60 seconds."`
- Line 1153-1154: `description: "Sentencing patterns, prosecutor pairing data, bench vs jury divergence, and quote library for your assigned judge."` — neutral; **keep** but verify no banned terms.
- Line 1157-1164 (`upsellTier: "intelligence-brief"` block): rewrite `upsellText` to drop "Your judge is one piece. The Intelligence Brief inherits your judge data and adds full jurisdiction prosecution patterns" — keep the structure; swap any "Judge Report Card" if present (audit shows none in this string today, verify).
- Line 145 (`sentencing-calculator` upsellText): rewrite from "Your actual judge sentences differently — sometimes by 50 percent. The Judge Report Card pulls their last ~500 cases, demographic sentencing splits, and ABA background. Delivered in 24 hours. $197." → "Aggregate medians don't tell you what to ask about your specific judge. The Judge Question Brief lists the questions your attorney should be able to answer for the judge on your case. Delivered instantly. $197." (drops "differently — sometimes by 50 percent" predictive framing per banned-copy list).
- Line 161-162 (`judge-comparison` upsellText): rewrite from "Get the complete intelligence package on your judge, not just a comparison, but a full report with quotes, sentencing, and accountability data." → "Get the Judge Question Brief on your specific judge — the questions your attorney should be able to answer based on quotes, sentencing data, and accountability records."
- Line 1280 (`district-court-intelligence` upsellText): already says "Judge Question Brief" — verify, no change.

**Verification:** grep `src/lib/products.ts` for `Judge Report Card` — must return zero hits in customer-visible strings. Internal comments may keep historical reference if marked.

### Task 5 — Tier 9 report renderer (mandatory gate line + name swap)
**Files:** `src/lib/tier9-reports/render.ts`
**Changes:**
- Line 177: `wrapReport("Judge Report Card", ...)` → `wrapReport("Judge Question Brief", ...)` (no-data branch).
- Line 581: `wrapReport(\`Judge Report Card, ${judge.name}\`, ...)` → `wrapReport(\`Judge Question Brief, ${judge.name}\`, ...)`.
- Line 2131 comment: "DEFENSE INTELLIGENCE SECTION (shared by Judge Report Card + Similar Cases)" — internal comment; add `// renamed → Judge Question Brief 2026-04-26` marker.
- Insert mandatory gate line at the **top of `body`** in `renderJudgeReportCard` (between line 181 `let body = "";` and line 184 `body += sectionHeader("Judge Profile");`). New line:
  ```ts
  body += `<p style="color: #D4D4D8; font-size: 14px; font-style: italic; margin-bottom: 24px; padding: 12px 16px; border-left: 3px solid #F59E0B; background: #18181B;">This is not a prediction. This is a list of questions your attorney should be able to answer about your judge.</p>`;
  ```
- Section header at line 184 "Judge Profile" — keep.
- Section header at line 215 "Judge Background, Federal Court Intelligence" — keep (neutral).
- Audit any other section headers in the function for banned terms ("rating", "score", "grade") — none expected; verify.

**Verification:** grep render.ts customer-output strings (the contents passed to `wrapReport` and any `<h>` / `<p>` text in the renderJudgeReportCard function body) for `Judge Report Card`, `report card`, `grade`, `score`, `rating`, `predicts`, `underperforms`, `elevated risk` — zero hits in output strings. Mandatory gate line appears in the rendered body. Run the existing `__tests__/courthouse-intelligence.test.ts` to confirm line-169 assertion (`html.toLowerCase()).toContain("judge question brief")`) still passes.

### Task 6 — district-court-intelligence FAQ
**Files:** `src/app/district-court-intelligence/page.tsx`
**Changes:**
- Line 96 question: "How is this different from the Judge Report Card?" → "How is this different from the Judge Question Brief?"
- Line 98 answer: rewrite "The Judge Report Card focuses on a specific judge — their individual sentencing patterns, prosecutor pairings, and direct quotes." → "The Judge Question Brief focuses on a specific judge — questions to ask your attorney about their individual sentencing patterns, prosecutor pairings, and direct quotes." (drops the implied "we describe their behavior" framing in favor of "questions to ask").

**Verification:** grep page for `Judge Report Card` — zero hits.

### Task 7 — Deep-link product page comments
**Files:** `src/app/r/[code]/[product]/page.tsx`
**Changes:**
- Line 71 internal comment "link-out to /judge-report-card (which already embeds AvailabilityChecker)…" — slug, keep.
- Line 367 comment "Judge Report Card availability checker" → "Judge Question Brief availability checker" + `// renamed 2026-04-26` marker.
- Line 374 `href="/judge-report-card#availability"` — slug, keep.
- Verify no customer-visible text on this page renders "Judge Report Card" — there should be none (the link target is on /judge-report-card, but the link text on this deep-link page is unrelated to the rename).

**Verification:** grep page customer-output for `Judge Report Card` — zero hits. Comments may retain historical name with marker.

### Task 8 — Blog post 1: 595k federal sentences
**Files:** `content/blog/595k-federal-sentences-exposed.mdx`
**Changes:**
- FAQ entry around line 24: "Our Judge Report Card pulls from this dataset" → "Our Judge Question Brief pulls from this dataset". Rewrite continuation "show your specific judge's departure rates, sentencing tendencies" → "list questions worth asking your attorney about your specific judge's departure rates and sentencing tendencies".
- TLDR / line 47 area (matched-line omitted in earlier grep; read full context before edit).
- Line 118 CTA: `[Judge Report Card](/checkout?tier=judge-report-card)` → `[Judge Question Brief](/checkout?tier=judge-report-card)`. Rewrite surrounding sentence "pulls your specific judge's sentencing history, departure rates by offense type, how they compare to the district and national averages, and patterns that are invisible from a single courtroom appearance" → "lists the questions worth asking about your specific judge's sentencing history, departure rates by offense type, and how the public record compares to the district and national averages." (drops "patterns that are invisible" predictive framing).
- QA-state JSON file `content/blog/.qa-state/595k-federal-sentences-exposed.json` — internal QA cache; do NOT hand-edit. The QA pipeline regenerates this on next run; mark as "regenerate after Task 8" in success criteria.

**Verification:** grep MDX file for `Judge Report Card`, `report card`, `Report Card` — zero hits.

### Task 9 — Blog post 2: bench-trial-vs-jury
**Files:** `content/blog/bench-trial-vs-jury-real-numbers.mdx`
**Changes:**
- Line 128 CTA: `[Judge Report Card](/checkout?tier=judge-report-card)` → `[Judge Question Brief](/checkout?tier=judge-report-card)`.
- Sentence rewrite: "shows your specific judge's sentencing patterns, departure rates, offense-specific tendencies, and how they compare to the district average. A starting point for the bench-versus-jury conversation." → "lists questions worth asking your attorney about your specific judge's sentencing patterns, departure rates, and offense-specific tendencies. A starting point for the bench-versus-jury conversation." (drops "how they compare" relative-ranking framing).
- QA-state JSON `bench-trial-vs-jury-real-numbers.json` — same as Task 8; regenerated by pipeline.

**Verification:** grep MDX for `Judge Report Card`, `report card` — zero hits.

### Task 10 — Blog post 3: sentencing-gap
**Files:** `content/blog/sentencing-gap-nobody-talks-about.mdx`
**Changes:**
- Line 60 CTA inside TLDRBox: rewrite "[Judge Report Card](/judge-report-card) pulls your assigned judge's sentencing patterns, departure rates, demographic data, and quote library from verified federal records, $197 for the intelligence that should inform every sentencing strategy." → "[Judge Question Brief](/judge-report-card) lists the questions worth asking your attorney about your assigned judge's sentencing patterns, departure rates, demographic data, and quote library from verified federal records. $197."
- Line 141 (long-form): rewrite "[Judge Report Card](/judge-report-card) pulls your assigned judge's sentencing patterns, departure rates, demographic data, prosecutor pairing history, and quote library from verified federal court records. It is generated from the same 595,851-record dataset referenced in this article, plus 15,000+ judge profiles from published opinions. $197 for the intelligence that should be the foundation of every sentencing strategy." → "[Judge Question Brief](/judge-report-card) lists questions worth asking about your assigned judge — pulled from sentencing patterns, departure rates, demographic data, prosecutor pairing history, and quotes in verified federal court records. Generated from the same 595,851-record dataset referenced in this article, plus 15,000+ judge profiles from published opinions. $197."
- Line 143 closing: "use the free [Federal Sentencing Calculator](/sentencing-calculator) to see aggregate sentencing data for your charge type and state, then decide whether the full Judge Report Card is worth it for your case." → "...whether the full Judge Question Brief is worth it for your case."
- QA-state JSON `sentencing-gap-nobody-talks-about.json` — regenerated by pipeline.

**Verification:** grep MDX for `Judge Report Card`, `report card` — zero hits.

### Task 11 — E2E test locator update
**Files:** `e2e/sentencing-calc.spec.ts`
**Changes:**
- Line 91: `page.locator('a:has-text("Judge Report Card")')` → `page.locator('a:has-text("Judge Question Brief")')`. The link text on the source upsell — line 145 `products.ts` (rewritten in Task 4) — is now "Judge Question Brief"; locator must match.
- Line 94 href assertion `expect(href).toContain("judge-report-card")` — slug, unchanged. Keep.
- Comments lines 4, 13, 60: historical references "Judge Report Card funnel" — internal-only; may keep with `// renamed → Judge Question Brief 2026-04-26` marker.

**Verification:** run `npx playwright test e2e/sentencing-calc.spec.ts` after Tasks 1 + 4 land. Test must pass green.

### Task 12 — Internal comment markers (housekeeping)
**Files:** `src/lib/tier9-reports/sentencing-fingerprint.ts` (line 2 comment), `src/lib/tier9-reports/courthouse-intelligence.ts` (lines 18, 213, 229)
**Changes:**
- Each "Judge Report Card" string in JSDoc / inline comments gets ` (renamed → Judge Question Brief 2026-04-26)` appended OR replaced with "Judge Question Brief". These are dev-facing only; cosmetic for code archaeology.

**Verification:** none required (comments only). Listed for completeness so the grep verification at success-criteria step doesn't trip on stale internal comments.

---

## 5. Out of scope (do not touch)

- **Stripe price IDs** — $197 holds per cached approval.
- **URL slug** `/judge-report-card` — kept for SEO; backlinks intact.
- **DB columns / `tier_slug='judge-report-card'`** — webhook lookup, intake routing, generation router all key off this string.
- **Signal 5 ship** — deferred to v4 (0.2% canonical coverage).
- **Historical docs/plans/handoffs** under `docs/plans/`, `docs/handoffs/`, `docs/superpowers/`, `docs/investigation/`, `docs/audits/`, `docs/handoff/` — write-once history. Do NOT rewrite.
- **Migration files** under `supabase/migrations/` — write-once + comments only reference the product internally.
- **`ARCHITECTURE.md`, `supabase/CONTEXT.md`, `scripts/CONTEXT.md`, `src/app/CONTEXT.md`** — internal architecture docs, do NOT touch in this PR (separate doc-update sweep).
- **QA-state JSON files** under `content/blog/.qa-state/` — pipeline-regenerated; will refresh on next blog QA run.
- **Test file describe/it titles** referencing the old name as historical context — internal-only; comment marker is sufficient.

---

## 6. Success criteria

A reviewer / CI check passes when ALL of the following are true:

1. **Banned-copy grep, customer-facing scope:** running each of the following greps across `src/app/`, `src/lib/`, `content/blog/*.mdx`, `src/components/` returns **zero hits**:
   ```
   rg -i "report card"          # banned (lowercase + capitalized)
   rg -i "\bgrade\b"            # banned (word-boundary; allows "downgrade" if any)
   rg -i "\bscore\b"            # banned EXCEPT: /score quiz route + sentencing-calculator file (out of scope, separate product)
   rg -i "\brating\b"           # banned
   rg -i "\bpredicts?\b"        # banned
   rg -i "underperforms?"       # banned
   rg -i "elevated risk"        # banned
   ```
   Carve-outs: comments marked `// renamed → Judge Question Brief 2026-04-26` may retain historical "Judge Report Card" text. The `/score` quiz route is a separate product and is out of scope. The word "score" in `sentencing-calculator` neutral context (e.g., "guideline score" if any) is permitted only if it refers to the federal Sentencing Guidelines mechanic, not to a product rating.

2. **New display name present:** the literal string `Judge Question Brief` appears in:
   - `src/app/judge-report-card/page.tsx` (≥3 hits: hero/heading/CTA + JSON-LD + AvailabilityChecker prop)
   - `src/app/judge-report-card/opengraph-image.tsx` (≥1 hit: alt)
   - `src/lib/tiers.ts` (≥1 hit: TIER_CORE name)
   - `src/lib/products.ts` (≥1 hit: PRODUCT name)
   - `src/lib/tier9-reports/render.ts` (≥2 hits: both wrapReport calls)
   - All 3 blog MDX files (≥1 hit each)

3. **Mandatory gate line present:** the literal string `This is not a prediction. This is a list of questions your attorney should be able to answer about your judge.` appears:
   - At least once in `src/app/judge-report-card/page.tsx` (sales page, before pricing)
   - At least once in `src/lib/tier9-reports/render.ts` `renderJudgeReportCard` body (rendered HTML report, before first data table)

4. **Slug stability:** the slug `judge-report-card` is unchanged in:
   - URL routes (`src/app/judge-report-card/`)
   - DB tier_slug references
   - Stripe checkout query params (`?tier=judge-report-card`, `?standaloneProduct=judge-report-card`)
   - Sitemap entries
   - DEDICATED_ROUTE_SLUGS set

5. **Build green:** `npm run typecheck` (or `tsc --noEmit`) passes with zero errors.

6. **E2E green:** `npx playwright test e2e/sentencing-calc.spec.ts` passes (Task 11 locator update + Task 1 sales-page text both landed).

7. **Existing assertion still passes:** `src/lib/tier9-reports/__tests__/courthouse-intelligence.test.ts` line 168-169 (`expect(html.toLowerCase()).toContain("judge question brief")`) still passes — confirms the renderer's upsell cross-reference is correct.

8. **JSON-LD validity:** Product schema `name` field is `Judge Question Brief`; BreadcrumbList position-2 `name` is `Judge Question Brief`; offers.url still points at `/checkout?standaloneProduct=judge-report-card` (slug stable).

9. **No new files created.** All changes are Edits.

10. **Commit message** cites this plan path: `docs/plans/2026-04-26-d1-judge-question-brief-rename.md` and references the cached approval memory file.

---

## 7. Cascade map (hard rule)

| Node | Specific win |
|------|--------------|
| **Us (INAA)** | Ships v3 Judge Question Brief at $197 with explicit UPL safety. Test assertion at courthouse-intelligence.test.ts:168 stays load-bearing — future regressions to the old name fail loudly. v4 Signal 5 lands without naming churn. |
| **Direct counterparty (defendant at 2am)** | Receives a product framed as preparation (questions to ask), not a prediction (grade/score). The mandatory gate line at the top of both sales page and rendered report eliminates the "underperforming judge = elevated risk" misread. Higher trust because we name the limit explicitly. |
| **Their downstream (defendant's attorney)** | Client arrives with informed questions instead of an adversarial scorecard. Conversation is "here's what I'd like to understand" instead of "your judge is bad." Attorney-client friction drops; engagement signal goes up. |
| **Ecosystem (legal-info / SEO ecosystem)** | URL `/judge-report-card` keeps backlinks + indexing (no 301 churn). The on-page reframe sets a higher floor for how legal-info products talk about judge data: preparation > prediction. Industry floor rises. |
| **Future-us** | Naming locked correctly for v4 Signal 5 + downstream Tier 9 expansion. The test assertion + comment markers create a forensic trail any future engineer can follow. No re-renames needed. |
| **Adjacent players (legal-info competitors, attorneys, courts)** | None lose. Competitors copying our framing raises the industry's UPL safety floor. Attorneys: see "Will my attorney be upset…?" FAQ — explicit support for the prepared-client conversation. Courts: nothing changes operationally; the data sources remain unchanged (CourtListener, JUSTFAIR/QSIDE, USSC). |

No node has a loss. Cascade-positive — escape clause not invoked.

---

## 8. References

- **Cached approval (verbatim banned-copy + gate line):** `~/.claude/projects/C--Users-email-projects-ImNotAnAttorney/memory/worry-judge-fingerprint-safety-resolved-2026-04-23.md`
- **Apex verdict:** REPRICE-THEN-SHIP at $197 (cached approval, line 37)
- **Pre-locked rename anchor:** `src/lib/tier9-reports/__tests__/courthouse-intelligence.test.ts:166-169` (`Apex rename: "Judge Report Card" → "Judge Question Brief"`)
- **UPL hard-rule:** `~/.claude/rules/no-hallucinated-legal-data.md` + project content-rules.md
- **Pristine-Or-Nothing scope rule:** apply per `~/.claude/rules/atlas-identity.md` — every banned-copy hit is fixed in this pass, none deferred.
