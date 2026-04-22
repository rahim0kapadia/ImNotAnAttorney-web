# Adversarial Walkthrough — /tools/sentencing-calculator — 2026-04-21

**URL:** https://imnotanattorney.com/tools/sentencing-calculator
**Persona:** Federal defendant, pre-trial, mid-crisis, garage-at-midnight, zero trust.
**Panel:** 6 lenses (skeptical-buyer, Peep Laja, UPL/Legal, April Dunford, Sabri Suby, copy-critic).

## CRITICAL (5) — Fix before inviting users

### C1. Upsell button label MISMATCHES product (conversion dead-end)
- **Where:** `src/app/tools/[slug]/CalculatorClient.tsx:1816`
- **Defect:** Button hardcoded `"See the Case Decoder"` but `products.ts:148` sets `upsellTier: "judge-report-card"`. User who wants judge intel reads "Case Decoder" → no idea this is for them.
- **Fix:** Use `product.upsellText` or hardcode `"Get the Judge Report Card — $197 →"`. Include the price.
- **Flagged by:** Peep Laja (L5 Distraction — "highest-ROI one-line change")

### C2. Page disclaimer says "state rules" on a FEDERAL tool
- **Where:** `src/app/tools/[slug]/page.tsx:51-56`
- **Defect:** Static disclaimer `"This calculator provides legal INFORMATION based on published state rules"` renders on the federal sentencing calculator (and judge comparison). Scope typo — UPL exposure + correctness.
- **Fix:** Conditional-by-slug OR rewrite to source-neutral: `"This calculator surfaces public sentencing records, not legal advice. Read more about our sources below."`
- **Flagged by:** UPL scan (S2)

### C3. UPL drift: "Your attorney remains the final authority on strategy decisions"
- **Where:** `src/components/Footer.tsx:254` (GLOBAL — appears on every page). Bleeds onto this page.
- **Defect:** Directly contradicts `~/.claude/rules/no-hallucinated-legal-data.md` and `brand-voice.md` ("the defendant is alone — they will NOT have an attorney verify"). Also assumes reader HAS an attorney. Functionally the banned "verify with attorney" pattern.
- **Fix:** Footer.tsx line 254-255 — delete "Your attorney remains the final authority on strategy decisions specific to your situation." Stop at "...do not create an attorney-client relationship."
- **Scope:** Fixes 26+ pages at once (grep hit count).
- **Flagged by:** UPL (C1), Copy-critic

### C4. H1 + description is catalog-voice, not crisis-voice (positioning weakness)
- **Where:** `src/app/tools/[slug]/page.tsx:46-49` (renders from `products.ts:137,145`)
- **Defect:** H1 = "Federal Sentencing Calculator". Description = "Look up real federal sentencing data by charge type and state, median sentences, departure rates, and judge-specific patterns." Pure catalog framing. No provable moat above fold. Dunford: unique attributes (595,851 records, JUSTFAIR, FY2001-2023) BURIED in `deliveryDetail` never rendered.
- **Fix:** Replace H1 + description in products.ts:137,145 with crisis-buyer framing:
  ```
  name: "Federal Sentencing Data by Charge + District"
  description: "See what federal judges in your district actually sentenced for your charge. Median months. Departure rates. Source: 595,851 USSC records, FY2001-2023."
  ```
- **Flagged by:** April Dunford (weakest layer), Peep Laja (L1 Relevance), Sabri Suby (Story 1/5), Copy-critic (slop + missing specifics), Skeptical-buyer (6)

### C5. "Federal" as charge option is jurisdiction-category collision
- **Where:** `src/app/tools/[slug]/CalculatorClient.tsx:404` (`{ value: "federal-criminal", label: "Federal" }` in SENTENCING_CALC_STEPS chargeType options)
- **Defect:** "Federal" listed alongside "Drug Trafficking", "DUI", etc. User picks "Federal" → produces empty/nonsense results because the WHOLE tool is already federal-only.
- **Fix:** Remove `federal-criminal` option from SENTENCING_CALC_STEPS chargeType list (keep in OTHER calculators where federal-vs-state matters).
- **Flagged by:** Peep Laja (L2 Clarity)

## WARNING (6) — Fix in this pass

### W1. No proof above the fold (credibility strip missing)
- **Where:** `src/app/tools/[slug]/page.tsx` hero region before `<CalculatorClient />`
- **Defect:** "595,851 records" / "1,126 judges" / "USSC FY2001-2023" — the entire provable moat — is invisible until post-submit. Crisis buyer at midnight needs proof BEFORE investing 3 clicks.
- **Fix:** Inject `<p class="text-sm text-amber-400">` 3-stat strip above the wizard: `"595,851 federal sentences analyzed · 1,126 judges profiled · Source: USSC FY2001-2023"`.
- **Flagged by:** Peep Laja (L3 Value), Dunford, Suby, Skeptical-buyer

### W2. Email-save block fights upsell — both blue CTAs back-to-back
- **Where:** `CalculatorClient.tsx` ~line 1753-1819
- **Defect:** Save-results block appears BEFORE upsell block. Both use `bg-blue-500`. At peak-value moment (seeing their sentence number) user hits a form instead of the $197 upsell.
- **Fix:** Swap DOM order — upsell block first, save-email block after. Differentiate button colors (amber for upsell, zinc-ghost for save).
- **Flagged by:** Peep Laja (L4 Friction)

### W3. State-vs-district confusion
- **Where:** `CalculatorClient.tsx:~385-388` — SENTENCING_CALC_STEPS first step label
- **Defect:** `"What state is the federal court in?"` — most federal defendants don't know which district they're in, only what state they live in. No helpText clarifies.
- **Fix:** Add `helpText: "Not sure about district? Check your court papers for 'U.S. District Court for the [X] District of [State].'"` Keep the state-selector (API joins to district).
- **Flagged by:** Peep Laja (L2 Clarity)

### W4. Meta description over-promises at Step 1 (UPL prediction drift)
- **Where:** `products.ts:145` → rendered in meta description + H1 subhead + OG description
- **Defect:** `"judge-specific patterns"` claim at Step-1 UI when form is state + charge. Bar investigator reads as holding out predictive output tied to named judge. Solve via C4 rewrite.
- **Fix:** Bundled with C4.
- **Flagged by:** UPL (W1)

### W5. Upsell prose is generic — no Wiebe price-moment treatment
- **Where:** `products.ts:149-150` `upsellText`
- **Defect:** `"Want the full picture on your judge? The Judge Report Card includes sentencing patterns, demographics, and racial disparity data."` No emotional bridge, no risk reversal, no price-drop anchor. Generic question-mark opener.
- **Fix:** Replace with: `"You just saw the national median. Your actual judge sentences differently — sometimes by 50%. The Judge Report Card pulls their last ~500 cases, demographic sentencing splits, and ABA background. Delivered in 24h. $197."`
- **Flagged by:** Peep Laja (L5), Suby (Story weakest)

### W6. Disclaimer hedge-stack undoes the data
- **Where:** `page.tsx:51-56` AND `products.ts:143` `deliveryDetail`
- **Defect:** `"Estimates depend on institutional behavior, program participation, and classification decisions that no external tool can predict"` — 6 hedges in one sentence. Tells the crisis buyer the number they're about to see is useless. Also — these are SENTENCING records (already happened), not estimates of anything. Wrong framing.
- **Fix:** Replace disclaimer (tied to C2 fix): `"The numbers below are what 595,851 federal defendants actually received, FY2001-2023. Past data, not prediction. Legal information, not legal advice."`
- **Flagged by:** Skeptical-buyer (close-the-tab #2), Copy-critic

## SUGGESTION (5) — Polish / deferred

### S1. No anonymous-founder signature on a free tool (trust layer)
- Copy-critic flagged. Add `"Researchers. Defendants, still fighting."` signature in footer region of the calculator page.

### S2. 404 page presumes reader has an attorney
- `/src/app/not-found` says `"...kind of like the motion your attorney said they'd file last month"` — bar-investigator pattern risk. UPL S1. Not on critical path.

### S3. "Know What They Know" tagline not delivered on this page
- Tagline promise → page is a form. Should manifest in credibility strip (W1 fix partially covers).

### S4. No social-proof count
- Skeptical-buyer (7). "4,300 defendants used this" type proof missing. Defer until we have real counts.

### S5. Footer product catalog up to $9,997 on a free-tool page
- Skeptical-buyer (1). Causes the free-tool-is-bait read. Scope: navigation/layout architecture, separate worry.

## Top 3 Highest-ROI Changes

1. **Fix the upsell button label** (C1) — 1 line. Unblocks $197 conversions. Flagged by Laja as THE highest-ROI single change on the page.
2. **Remove the UPL drift from Footer.tsx** (C3) — 1 sentence deletion. Fixes 26+ pages simultaneously. Safety-critical.
3. **Rewrite H1 + description in products.ts** (C4) — 2 field swap. Fixes positioning (Dunford), relevance (Laja), story (Suby), copy (copy-critic), proof (skeptical) all at once.

## Out-of-scope follow-ups (tracked)

- Global "Your attorney remains the final authority" sweep across 25+ files (C3 fixes Footer; other files have same pattern in reports/IB/playbooks). Track as separate PR.
- Footer product catalog visibility on free-tool pages (S5).
- Anonymous-founder page signature system (S1).

## Status
- [x] Panel dispatched — 6 agents returned
- [x] Findings merged
- [x] Severity ranked
- [x] Top 3 ROI fixes named
- [ ] Fixes applied
- [ ] Re-run
