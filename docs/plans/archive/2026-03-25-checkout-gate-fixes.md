# Checkout Page GATE-Level Fixes

## Context
- **Repo:** ImNotAnAttorney-web
- **Problem:** Website evaluation found 6 GATE FAILs on checkout pages
- **Key files:** `src/app/checkout/page.tsx` (primary, all 6 fixes)
- **Tech stack:** Next.js 15, React, TypeScript
- **Key decisions:** All fixes are content/copy edits + small conditional logic in one file

## Fixes

### Fix 1: CRO17, Remove Situation Room Upsell from War Room
- **Status:** Already resolved. War Room tier has no `nudge` property. Success page War Room section has no SR upsell.

### Fix 2: T11/T10/CRO8, Add Testimonials + Stakes to Situation Room ($9,997)
- Add `testimonials` array field to TierInfo type (DONE)
- Add `feltExperience` string field to TierInfo type (DONE)
- Add 2 testimonials to situation-room tier config (DONE)
- Update SR guarantee to "Content Quality Guarantee" (DONE)
- Update SR validation to stakes framing (DONE)
- Render testimonials in checkout JSX after story block

### Fix 3: OA4, Relabel "Satisfaction Guarantee"
- Change "Satisfaction Guarantee" label to "Upgrade Credit" in guarantee section
- For Situation Room (top tier), the guarantee is already updated to Content Quality Guarantee

### Fix 4: T5, Add Felt-Experience Line Above Fold (All Tiers)
- Add `feltExperience` to all tier configs in TIER_INFO
- Render above or immediately after the product name heading
- DUI playbook: "It's 3 AM and you can't sleep. We've been there." (DONE)
- Drug possession/trafficking/sex-offense/federal/white-collar/probation/self-defense: tier-appropriate lines
- Case Decoder/IB/X-Ray/War Room/Situation Room: tier-appropriate lines

### Fix 5: POS5, Fix "Founders" Reference on DUI Checkout
- Change "One of our founders" to "One of us" in DUI story

### Fix 6: POS3-B, Add System Attribution to Proof Anecdotes
- Find stories that imply individual attorney incompetence ("attorney had never", "attorney hadn't", "attorney never")
- Add one sentence of system attribution near each

## Execution
Single file, inline edits. No new components or architecture changes.
