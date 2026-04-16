# Phase 5: 5-Expert Audit Implementation Plan

> Source: `docs/plans/2026-03-11-visual-cro-overhaul.md` Phase 5
> Expert audit: `docs/research/2026-03-19-five-expert-homepage-audit.md`
> Status: EXECUTING

## Files to Modify

1. `src/app/page.tsx`, compliance fixes, CTA swaps, copy rewrites, structural changes
2. `src/components/TrustBadges.tsx`, confidentiality badge (5.1.5)
3. `src/components/StickyMobileCTA.tsx`, revert to checkout (5.1.3)
4. `src/components/LeadCapture.tsx`, wire upsell (5.1.6)
5. `src/components/PricingTable.tsx`, value stacking + mobile collapse (5.3.4, 5.3.8)
6. `src/components/motion/DiscoveryReveal.tsx`, mobile condensing (5.3.2)

## Files to Create

None.

## Decisions

- Testimonials: KEEPING AS-IS per Rahim (5.0.3)
- Founder video: SKIPPED per Rahim (5.4.1)
- GBP creation (5.3.7): manual task, not code, will document but skip execution
- Attorney methodology section (5.3.1): Reframe in defendant voice per expert consensus (option B)
- "What We Are NOT" relocation: Move to just before guarantee section per Laja, use Chaperon's peer-voiced rewrite

## Numbered Tasks

### Phase 5.0: COMPLIANCE
1. 5.0.1, Fix UPL Flag 1: FAQ retaliation answer (page.tsx line ~90)
2. 5.0.2, Fix UPL Flag 2: Final CTA causal claim (page.tsx line ~756)

### Phase 5.1: ONE-LINE CHANGES
3. 5.1.1, Swap CTA button order in hero (page.tsx)
4. 5.1.2, Swap CTA button order in final CTA (page.tsx)
5. 5.1.3, Revert StickyMobileCTA to checkout (page.tsx + StickyMobileCTA.tsx)
6. 5.1.4, Add guarantee line below hero CTAs (page.tsx)
7. 5.1.5, Replace "256-bit SSL" with confidentiality badge (TrustBadges.tsx)
8. 5.1.6, Wire lead capture success upsell (page.tsx)

### Phase 5.2: COPY REWRITES
9. 5.2.1, Relocate + rewrite "What We Are NOT" box (page.tsx)
10. 5.2.2, Add Epiphany Bridge to hero subheadline (page.tsx)
11. 5.2.3, Add backstory paragraph after DiscoveryReveal (page.tsx)
12. 5.2.4, Add missing FAQ: "I can't afford this" (page.tsx)
13. 5.2.5, Rewrite urgency bar with charge-specific deadlines (page.tsx)
14. 5.2.6, Rewrite pain points header (page.tsx)
15. 5.2.7, Rewrite pricing section header (page.tsx)

### Phase 5.3: STRUCTURAL CHANGES
16. 5.3.1, Attorney methodology: reframe in defendant voice (page.tsx)
17. 5.3.2, Condense DiscoveryReveal to 2 images on mobile (DiscoveryReveal.tsx)
18. 5.3.3, Reduce CTA count from 14 to 6-8 (page.tsx)
19. 5.3.4, Add value stacking to pricing cards (PricingTable.tsx)
20. 5.3.5, Move "Can I get a refund?" FAQ to position 2 (page.tsx)
21. 5.3.6, Schema fixes: @id, speakable, additionalType (page.tsx)
22. 5.3.7, Create Google Business Profile (MANUAL, Rahim)
23. 5.3.8, PricingTable mobile: collapse features (PricingTable.tsx)

### Verification
24. 5.V.1, TypeScript check
25. 5.V.2, Visual QA desktop + mobile
26. 5.V.3, UPL compliance re-scan
27. 5.V.4, Schema validation
