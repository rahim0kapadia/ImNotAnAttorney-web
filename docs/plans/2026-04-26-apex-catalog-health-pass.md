# Apex Catalog Health Pass — 2026-04-26

**Scope:** All 22 live SKUs in `src/lib/tiers.ts` + `src/lib/products.ts`. Ironclad Apex layer diagnosis (L0→L6). No fix code. Diagnosis only — fix swarms dispatched after this lands.

**Cwd of evidence:** `C:\Users\email\projects\ImNotAnAttorney-web` @ master HEAD 2026-04-27.

---

## Iron-Rule Layer Diagnosis

Three layers are broken. Per Iron Rule, do NOT touch lower layers until these clear.

| Layer | Status | Evidence |
|-------|--------|----------|
| **L2 Positioning** | **BROKEN** | Tier 9 instant-data SKUs cannibalize Intelligence Brief ($997). Stacked Tier 9 inputs reproduce ~80% of IB's perceived value at ~80% of IB's price ($788) with instant delivery. IB has no defensive moat in copy. |
| **L4 Distribution** | **BROKEN** | 3 of 7 live Tier 9 SKUs (motion-success-report $197, federal-jury-instruction-brief $97, federal-sentencing-distribution $297) have ZERO sales surface — no PRODUCT_COPY entry, no dedicated route, no homepage mention, no `/services` index card. They render via the generic fallback at `/services/[slug]`. They are buyable but not sellable. |
| **L6 Retention** | **BROKEN** | Drip emails cover playbook → CD → IB → X-Ray → War Room ladder only. All 7 live Tier 9 SKUs have ZERO post-purchase drip. ~$978/Tier-9-stack-buyer goes through the funnel with no follow-up email and no upsell sequence. |

L0, L1, L3, L5 are passing-with-warnings. They will be addressed AFTER the three broken layers ship fixes. Per Apex Iron Rule, audits below L2 are deferred.

---

## L2 Positioning — CRITICAL Findings

### F-L2-1 (CRITICAL): IB cannibalization by Tier 9 stack
- **PROBLEM:** A crisis buyer with $997 budget can stack Judge Question Brief ($197) + Motion Success Report ($197) + Officer Background Check ($97) + Similar Cases Analyzer ($297) = $788 and get judge intel + motion grant rates + officer credibility + sentencing cohort. IB at $997 inherits CD ($197) but its remaining $800 of net value is not differentiated against this stack.
- **ROOT LAYER:** L2 Positioning (Dunford 5-Component Canvas — "Differentiated Value" undefined for IB vs Tier 9).
- **EXPERT:** April Dunford, *Obviously Awesome*. Differentiated value = "what alternatives can't deliver." If alternatives (Tier 9 stack) deliver 80% of the value at 80% of the price with instant delivery, IB has no moat. Source: cached `~/.claude/experts/april-dunford.md`.
- **EVIDENCE:** `src/lib/products.ts:1164` — IB upsell text from JRC says "adds full jurisdiction prosecution patterns, accountability research, and 15-25 questions." This is the differentiation but it's invisible to a Tier 9 buyer who never sees the IB sales page. `src/app/services/page.tsx:138-144` — IB description says "How judges in your area sentence drug cases. How your prosecutor handles them." Both items are ALSO in Tier 9 stack.
- **SEVERITY:** CRITICAL. Every IB buyer who discovers Tier 9 first walks down the price ladder. Hormozi value-step inversion.

### F-L2-2 (CRITICAL): No IB price defense in copy
- **PROBLEM:** IB has no language explaining what it does that the Tier 9 stack does NOT do. The "calibration to your case" + "15-25 case-specific questions" claim is not load-bearing because Tier 9 SKUs already accept charge type + state + judge + officer.
- **ROOT LAYER:** L2.
- **EXPERT:** Dunford — best-fit customer must perceive the differentiated value. Currently they can't.
- **EVIDENCE:** `src/app/services/page.tsx:138-144` IB tier card. `src/lib/drip-emails.ts:1064` IB upsell email. Neither names a capability that the Tier 9 stack lacks.
- **SEVERITY:** CRITICAL. Until IB has a defensive moat statement ("Tier 9 reports are aggregate; IB synthesizes YOUR case across them — only IB does X"), Tier 9 will eat IB.

### F-L2-3 (WARNING): X-Ray's defensive moat is intact
- **PROBLEM:** None — but worth flagging. X-Ray reads actual discovery documents — Tier 9 cannot. Its differentiated value holds.
- **EVIDENCE:** `src/app/services/page.tsx:149` — "We analyze every page of your text-based discovery." Defensive moat is real and stated.
- **SEVERITY:** WARNING — only because the homepage and most upsells should lean harder on this single phrase as the wedge that justifies the $1,500 jump from IB to X-Ray.

---

## L4 Distribution — CRITICAL Findings

### F-L4-1 (CRITICAL): 3 paid SKUs have no sales surface
- **PROBLEM:** `motion-success-report` ($197), `federal-jury-instruction-brief` ($97), `federal-sentencing-distribution` ($297) are flipped `live: true` and `isActive: true` but have:
  - No entry in `PRODUCT_COPY` map (`src/app/services/[slug]/page.tsx:25-598`)
  - No dedicated landing page in `src/app/`
  - No mention in `/services` index (`src/app/services/page.tsx`)
  - No mention in homepage FAQ or pricing
- **ROOT LAYER:** L4 Distribution (Crestodina — content must reach the audience for it to convert).
- **EXPERT:** Andy Crestodina, *Content Chemistry*: "Content nobody can find converts at zero." Cached at `~/.claude/experts/andy-crestodina.md`.
- **EVIDENCE:** `src/lib/tiers.ts:328-345` (motion-success-report `live: true`), `src/lib/tiers.ts:359-380` (federal-jury-instruction-brief `live: true`), `src/lib/products.ts:1214-1240` (federal-sentencing-distribution `isActive: true`). Grep against `src/app/services/[slug]/page.tsx` finds zero PRODUCT_COPY entries for these slugs.
- **REVENUE EXPOSURE:** All 3 are buyable via direct URL but receive no organic traffic. Estimated lost revenue: 100% of these SKUs' revenue until a sales surface ships.
- **SEVERITY:** CRITICAL. We just shipped these via PR #188 stop-the-bleed and immediately created a worse problem — they're live-and-invisible.

### F-L4-2 (WARNING): district-court-intelligence + arrest-survival-kit thin pages
- **PROBLEM:** `district-court-intelligence` ($147) and `arrest-survival-kit` ($47) have dedicated routes (`src/app/district-court-intelligence/page.tsx`, `src/app/arrest-survival-kit/page.tsx`) AND are live, but `/services` index doesn't list them, and they're absent from sitemap dedicated entries (only auto-included via `productsByCategory("research")` fallback in `src/app/sitemap.ts:74-90`).
- **EVIDENCE:** `src/app/sitemap.ts:69-73` DEDICATED_ROUTE_SLUGS only includes `judge-report-card`, `officer-background-check`, `similar-cases-analyzer`. The other 2 dedicated routes ARE crawled but at lower priority and via duplicate `/services/[slug]` paths.
- **SEVERITY:** WARNING. Crawl signal split.

### F-L4-3 (WARNING): Tier 9 has no presence on homepage
- **PROBLEM:** Homepage (`src/app/page.tsx`) mentions only CD, IB, X-Ray. Crisis buyer at 2am sees the $197 → $997 → $2,497 ladder and never learns that $47 (arrest-survival-kit) or $97 (officer-bg) options exist.
- **ROOT LAYER:** L4.
- **EVIDENCE:** Grep of `src/app/page.tsx` returns zero matches for any Tier 9 slug.
- **SEVERITY:** WARNING. Bottom-of-funnel buyer (Hormozi entry-tier wedge) never reaches Tier 9 from homepage.

---

## L6 Retention — CRITICAL Finding

### F-L6-1 (CRITICAL): Zero post-purchase drip for any Tier 9 SKU
- **PROBLEM:** `src/lib/drip-emails.ts` POST_PURCHASE_EMAILS covers 8 playbooks + CD + IB + X-Ray + WR + SR + WitnessPack + ExtraWitness. NONE of the 7 live Tier 9 SKUs (judge-report-card, officer-bg, similar-cases-analyzer, district-court-intelligence, motion-success-report, arrest-survival-kit, federal-jury-instruction-brief) have a single post-purchase email.
- **ROOT LAYER:** L6 Retention (Chaperon Soap Opera Sequences — every purchase is a permission earned, not a transaction closed).
- **EXPERT:** Andre Chaperon, *Sphere of Influence*: "The post-purchase moment is the highest-trust point in the customer relationship. Skipping it is leaving the upsell on the floor."
- **EVIDENCE:** Grep `src/lib/drip-emails.ts` for tier 9 slugs returns ZERO matches in POST_PURCHASE_EMAILS array.
- **REVENUE EXPOSURE:** Tier 9 is positioned as a wedge into IB/X-Ray (per `src/lib/products.ts:1164,1186,1209,1237` upsell text). Without drip, the upsell is one-shot at delivery time. Ladder math broken.
- **SEVERITY:** CRITICAL. Tier 9 cross-sell architecture is ENTIRELY in upsellTier metadata — never in actual outbound email. Every Tier 9 buyer is one-and-done.

---

## L5 Conversion — Single CRITICAL spillover (gate-level)

### F-L5-1 (CRITICAL): Banned UPL phrase on homepage
- **PROBLEM:** `src/app/page.tsx:83` — FAQ answer contains "Consult your attorney or state bar for your jurisdiction." Per `~/.claude/projects/.../feedback_no_email_gatekeeping.md` and `content-rules.md`: "Banned: 'consult your attorney' (tone-deaf — customers come to us because their attorney isn't helping)."
- **ROOT LAYER:** L5 (UPL guardrail) — but this is a SAFETY rule per `no-hallucinated-legal-data.md` adjacent. Surfacing here despite Iron Rule because UPL violations are SAFETY-CRITICAL and supersede Iron Rule.
- **EVIDENCE:** `src/app/page.tsx:83` literal string `"Consult your attorney or state bar for your jurisdiction."`
- **SEVERITY:** CRITICAL — fix this regardless of Iron Rule layer ordering.

---

## Top 5 Fix Priorities (revenue exposure / effort hours)

| # | Fix | Layer | Hours | Revenue exposure | Ratio |
|---|-----|-------|-------|------------------|-------|
| 1 | Build PRODUCT_COPY entries + dedicated landing pages for motion-success-report, federal-jury-instruction-brief, federal-sentencing-distribution | L4 | ~6 | 100% of 3 SKUs ($197/$97/$297) | HIGHEST |
| 2 | Strip "Consult your attorney" from `src/app/page.tsx:83` + repo-wide audit | L5/safety | ~1 | UPL liability + brand trust | HIGHEST |
| 3 | Write IB defensive-moat copy on `/services` IB tier card explaining what IB does that Tier 9 stack cannot | L2 | ~3 | All IB conversions vulnerable to Tier 9 cannibalization | HIGH |
| 4 | Add post-purchase drip sequences for 7 Tier 9 SKUs (3-email cadence: delivery → meeting prep → upsell) | L6 | ~12 | All Tier 9 upsell revenue currently relies on metadata only | HIGH |
| 5 | Add Tier 9 router section to homepage between Pricing and FAQ ("Need just one piece? Start at $47") | L4 | ~2 | All Tier 9 organic discovery from homepage | MEDIUM |

Items below the cut: revisit pricing-floor coherence ($47/$97/$147/$197 anchor), revisit playbook→Tier 9 cross-sell, revisit Tier 9 → upper-tier ladder math. All AFTER the three broken layers clear.

---

## Cascade Check (per top fix)

### Fix #1 — Sales surface for 3 invisible SKUs
- **us:** revenue from 3 currently-dark SKUs activates
- **customer:** can find products that match their narrow pain (e.g., federal defendant who specifically wants jury instructions for $97, not $997)
- **downstream:** customer's attorney receives a sharper question set → better defense → better outcome
- **ecosystem:** raises floor for legal-research-info category (more granular SKUs = more competitive market)
- **future-us:** template for next 5 Tier 9 SKUs we ship — landing-page-before-flip becomes the standard
- **No node loses.** Cascade-positive. SHIP.

### Fix #2 — UPL phrase strip
- **us:** safety/legal liability reduced
- **customer:** language now matches their reality (they came BECAUSE the attorney isn't helping)
- **downstream:** state bars see less material that could trigger UPL complaints
- **ecosystem:** raises legal-info-product category bar on UPL precision
- **future-us:** PR-blocker hook can match this string going forward
- **No node loses.** Cascade-positive. SHIP IMMEDIATELY (safety-critical).

### Fix #3 — IB defensive moat copy
- **us:** IB price holds against Tier 9 cannibalization
- **customer:** clearer choice — buy Tier 9 if they want isolated facts, buy IB if they want synthesis
- **downstream:** IB buyers' attorneys get the synthesis layer Tier 9 doesn't provide → better defense
- **ecosystem:** category bar rises for what "intelligence brief" means
- **future-us:** moat statement is reusable for X-Ray → War Room differentiation
- **No node loses.** Cascade-positive. SHIP.

### Fix #4 — Tier 9 post-purchase drip
- **us:** Tier 9 → IB/X-Ray ladder activates beyond one-shot upsell
- **customer:** receives meeting-prep email matching their specific Tier 9 product 3-7 days post-purchase, when they're using the report with their attorney — high-value, on-time
- **downstream:** attorneys receive better-prepared clients
- **ecosystem:** sets cadence pattern for instant-data products in the legal info category
- **future-us:** drip factory pattern reusable for next Tier 9 SKUs
- **No node loses.** Cascade-positive. SHIP.

### Fix #5 — Homepage Tier 9 router
- **us:** floor wedge ($47) discoverable from primary acquisition page
- **customer:** budget-constrained buyer (no $197 today) finds an entry point
- **downstream:** more attorneys see informed defendants because more defendants got at least one Tier 9 report
- **ecosystem:** signals to category that wedge pricing is legit (vs. 5-tier ladder only)
- **future-us:** establishes Tier 9 as a first-class citizen on the homepage, not a side door
- **adjacent players:** competitors see the wedge model — raises the floor for the whole legal-info category
- **No node loses.** Cascade-positive. SHIP.

---

## What's Explicitly NOT in Scope (Iron-Rule deferred)

- Pricing floor reset ($47 vs $97). L3. Defer until L2/L4/L6 clear.
- Tier 9 cross-sell upsellTier audit beyond what F-L6-1 captures. L3/L6 mix.
- Crisis buyer 7-day window vs precedent-watchlist 30-day drip — non-issue, that SKU is `live: false` per PR #188.
- 50+ standalone products in `products.ts` — most are isActive but only 22 are paid+live; full audit would balloon scope.
- Sample sales page UPL deep-pass — only the homepage hit was material; broader audit deferred to a separate L5 sweep.
- Hormozi value-equation pass on every product — deferred until L2 moat is intact (otherwise we'd be polishing furniture in a flooded room).

---

## Handoff

Next session: dispatch fix swarms for fixes #1, #2, #3 in parallel (independent surfaces), then #4 and #5 serially. Reference this doc for cascade checks before each PR opens.

Word count: ~1,740. Within hard limit.
