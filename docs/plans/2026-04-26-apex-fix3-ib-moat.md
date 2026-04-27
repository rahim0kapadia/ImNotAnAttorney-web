# Apex Fix #3 — Intelligence Brief Defensive Moat Copy

**Parent plan:** `docs/plans/2026-04-26-apex-catalog-health-pass.md` Fix #3
**Layer:** L2 Positioning (CRITICAL)
**Branch:** `fix/apex-ib-defensive-moat`
**Date:** 2026-04-26

## Problem

Crisis buyer with $997 budget can stack:

- Judge Question Brief — $197
- Motion Success Report — $197
- Officer Background Check — $97
- Similar Cases Analyzer — $297

Total $788 of Tier 9 instant reports — and reproduce ~80% of the Intelligence Brief's ($997) perceived value at instant delivery. IB had no copy explaining what it does that the Tier 9 stack does NOT.

## Cited Expert

**April Dunford**, *Obviously Awesome* (cached at `~/.claude/experts/april-dunford.md`).

Differentiated value test: "what alternatives can't deliver." If alternatives deliver 80% of the value at 80% of the price with instant delivery, the higher-priced product has no moat. IB was failing this test in copy.

## What IB Actually Does That Tier 9 Doesn't

Read confirmed against `src/lib/intelligence-brief/prompts.ts` (13 sections — case-roadmap, whats-working, legal-options, protection, court-prep, letter-to-you, case-intelligence, your-plan, questions, 48hr-priorities, plus tier9-data-appendix) and the upsellText in `src/lib/products.ts:1145-1259`.

Three differentiators stand up under Dunford's "alternatives can't deliver" test:

1. **Synthesis across signals** — Tier 9 reports are isolated facts (judge alone, motion grants alone, officer alone, similar cases alone). IB synthesizes them with the defendant's specific charge + state + circuit + sentencing exposure + case stage to produce 15-25 case-specific questions.
2. **Calibration to the defendant's case** — Tier 9 SKUs accept inputs but render aggregate views. IB applies specific facts to filter the aggregate down to the YOUR-case-relevant subset.
3. **Operator review** — IB has a 72-hour delivery window because an operator reviews + adds context. Tier 9 is instant + automated.

The moat statement leans on (1) + (3) as the load-bearing claims and uses (2) as the connective tissue.

## Moat Statement (Verbatim)

**Headline:** "What this does that the instant reports don't"

**Body:** "The instant Tier 9 reports (Judge Question Brief, Motion Success, Officer Background, Similar Cases) each return one signal in isolation. The Intelligence Brief synthesizes those signals against your specific charge, state, circuit, sentencing exposure, and case stage, then an operator reviews the output before delivery. Tier 9 is instant and aggregate. Intelligence Brief is calibrated and synthesized into 15-25 case-specific questions."

## Files Modified

| File | Change |
|------|--------|
| `src/app/services/page.tsx:770-788` | Added moat callout block (amber-bordered) inside Track A IB tier card. Track A previously didn't render `capabilities`; added the rendering for parity with Track B. |
| `src/lib/products.ts:1164-1166` (judge-report-card) | upsellText replaced — names synthesis + operator review + calibration as the differentiator |
| `src/lib/products.ts:1185-1187` (officer-background-check) | upsellText replaced — frames X-Ray as discovery-document synthesis Tier 9 cannot do |
| `src/lib/products.ts:1209-1211` (similar-cases-analyzer) | upsellText replaced — frames X-Ray as case-document synthesis vs cohort-only data |
| `src/lib/products.ts:1257-1259` (motion-success-report) | upsellText replaced — names synthesis + operator review |
| `src/lib/drip-emails.ts:1062-1066` (post_case_decoder_discovery_question) | Added moat paragraph between original copy and price/CTA |
| `src/lib/drip-emails.ts:1109-1112` (post_case_decoder_upsell) | Added moat paragraph naming single-signal reports as the foil |

**FSD upsellText:** Federal Sentencing Distribution Report ($297) upsells to X-Ray, not IB. Plan said "4 Tier 9 SKUs that explicitly upsell IB" — the actual code shows JRC + motion-success-report upsell to IB; OBC + SCA + FSD upsell to X-Ray. Updated all 4 of the SKUs the plan named (JRC, MSR, OBC, SCA) plus FSD's existing upsellText was left alone since it was outside the named four. JRC + MSR get the IB synthesis moat; OBC + SCA get the X-Ray document-synthesis moat (parallel pattern).

## Hard Constraints (all honored)

- IB price unchanged ($997)
- IB delivery time unchanged (72 hours)
- Stripe price IDs / URL slugs / DB tier_slug unchanged
- Tone clinical and defendant-empathetic
- No banned UPL phrases
- Concrete language: "synthesis", "calibrated to your case", "case-specific questions"
- Tier 9 not disparaged — framed as "instant + aggregate" vs "calibrated + synthesized" tradeoff

## Cascade

- **Us:** IB price holds against Tier 9 cannibalization
- **Customer (crisis buyer):** clearer choice — buy Tier 9 if they want isolated facts, IB if they want synthesis + operator review
- **Downstream (defendant's attorney):** synthesis layer means the 15-25 questions are calibrated to the defendant's actual fact pattern, not stitched-together aggregate slices
- **Ecosystem:** category bar rises for what "intelligence brief" means in legal-info products
- **Future-us:** moat statement is reusable for X-Ray → War Room differentiation (the OBC + SCA upsellText is already pattern-matched on this)

No node loses. Cascade-positive.

## Verification

- `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck` after `.next/types` cleared — 0 errors
- Tests pass

## Out of Scope

- IB landing page (no dedicated `/intelligence-brief/page.tsx` route exists in this repo — the IB sales surface is `/services` only, which we updated)
- FSD upsellText (not in the plan's "4 Tier 9 SKUs that explicitly upsell IB" list)
- X-Ray moat statement on its own card (X-Ray's defensive moat is already intact per parent plan F-L2-3)
