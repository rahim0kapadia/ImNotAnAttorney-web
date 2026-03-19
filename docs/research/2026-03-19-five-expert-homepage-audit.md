# INNA Homepage — 5-Expert Audit (2026-03-19)

**Panel:** Sabri Suby (direct response), Russell Brunson (funnel/copy), Andre Chaperon (trust/narrative), Peep Laja (CRO), Chris Dreyer (legal marketing)
**Target:** `src/app/page.tsx` + all homepage components
**Context:** Pre-revenue, pre-Stripe-live, crisis buyers at 2AM

---

## CONSENSUS FINDINGS (3+ experts agree)

### 1. CTA BUTTONS ARE INVERTED (all 5 agree)

Every expert flagged this. The amber primary button goes to `/sample`. The ghost secondary goes to `/checkout`. The StickyMobileCTA also routes to `/sample`.

**The fix:** Amber = checkout ($197). Ghost = sample. Sticky mobile = checkout.

- Suby: "That one structural fix alone could double conversion"
- Brunson: "Swapping these could measurably move the conversion rate"
- Laja: "No test needed. Reverse this if your first 30 days show sample has high return-to-purchase"
- Chaperon: "Seeing a price in the hero CTA before they understand what they're buying is a purchase-intent killer" (counterpoint — keep sample primary for cold traffic)
- Dreyer: "A crisis buyer at 2AM who is terrified about court Monday does not need to be warmed up"

**Decision needed:** Chaperon has a valid counterpoint. Consider A/B testing, but default to checkout-primary for crisis buyers.

### 2. "WHAT WE ARE NOT" BOX KILLS MOMENTUM (all 5 agree)

Currently sits as section 2, right after DiscoveryReveal proof. Four "we do not" negatives at the emotional peak.

**All 5 say:** Move it downstream. Suggested positions:
- Brunson: After pain points (position 8)
- Chaperon: Between DiscoveryReveal and urgency bar, but reframed as peer voice
- Laja: Adjacent to guarantee section
- Dreyer: Just before pricing
- Suby: "This section actively suppresses conversion"

**Recommended copy replacement (Chaperon):**
> "We're researchers, not lawyers. We read your case file the way I read mine — looking for what doesn't add up. We hand you the questions. Your attorney has to answer them. That's where their work begins and ours ends."

### 3. ORIGIN STORY NEEDS NARRATIVE ARC (4/5 — Brunson, Chaperon, Suby, Laja)

The 68.3g finding is mentioned as a data point, not told as a story. No backstory, no emotional arc, no "I was in the same chair you're in."

**Brunson's Epiphany Bridge rewrite:**
> "I was on page 347 of my 500-page discovery file when I found it. 68.3 grams the lab report said was there — but wasn't in the evidence log. A CI phone attributed to two different people on the same case. A drug type that didn't match what I was charged with. My attorney — the one I paid $40,000 — never mentioned any of it. So I built the tool I needed."

**Chaperon's backstory paragraph (new block before or after DiscoveryReveal):**
> "I hired an attorney the same way you did. Paid the retainer. Waited for the plan. The calls got shorter. Then they stopped. Seven months in, I decided to read the file myself. I didn't know what I was looking for. I found three things that changed everything about my case. My attorney never mentioned any of them."

### 4. FABRICATED TESTIMONIALS ARE AN EXISTENTIAL RISK (4/5 — Suby, Laja, Dreyer, Chaperon)

The company brief acknowledges "Social proof is manufactured until first real customers." The testimonials use first-person quotes with specific names, charges, and outcomes — but none are real.

**Suby:** "The FTC has a specific rule (16 CFR Part 255). Do not drive paid traffic to this page with fabricated first-person testimonials."
**Laja:** "One journalist or one skeptical defendant who posts 'these testimonials look fake' on r/legaladvice ends the business's credibility"
**Dreyer:** "No real testimonials. This is the most legally and reputationally exposed element on the page."

**Options:**
- A: Replace with third-person composite case studies, clearly labeled
- B: Remove testimonials entirely, let DiscoveryReveal carry proof
- C: Offer 3 free Case Decoders for documented real outcomes before launch
- D: Use real metrics instead ("4,000 defendants have checked their score")

### 5. GUARANTEE SHOULD APPEAR IN THE HERO (3/5 — Chaperon, Dreyer, Suby)

"Find It or It's Free" is the single most powerful risk-reversal but appears at section 9 of 13. Most visitors never see it.

**Chaperon:** Add one line below hero CTAs: "Find It or It's Free. If we don't find something your attorney hasn't raised, you pay nothing."
**Suby:** "Directly below the $197 Case Decoder card, there should be one line"
**Dreyer:** "Add a one-line reference to the guarantee inside the hero section"

---

## STRONG FINDINGS (2 experts)

### 6. URGENCY BAR SHOULD BE CHARGE-SPECIFIC (Brunson + Dreyer + Suby)

Current: generic "some suppression motions must be filed within 30 days."

Should dynamically change based on ChargeTypeSelector:
- DUI: "DMV hearing window: 7 days. When it closes, it doesn't reopen."
- Drug: "48-hour decision window for suppression motions"
- Federal: "Federal pretrial motion deadlines set at arraignment"

### 7. ATTORNEY METHODOLOGY SECTION HAS NO NAMES (Brunson + Chaperon + Suby + Laja)

Says "40+ named attorneys" but shows zero names. Cards show categories ("Chain of Custody Analysis") instead of specific attorneys (Barry Scheck, F. Lee Bailey).

Options:
- Name 2-3 real attorneys with permission
- Reframe cards as "what we look for" in the defendant's voice
- Cut the section entirely (Laja: "weakest section for conversion")

### 8. MISSING FAQ: "I CAN'T AFFORD THIS" (Brunson + Suby)

The #1 unspoken objection for someone who already spent $10K-$50K. Not addressed in FAQ.

**Suby's suggested answer:**
> "That's the exact situation we built this for. You've already spent $10,000 or more. INNA costs $197 — less than one hour of your attorney's billing rate. The guarantee means if we don't find at least one gap, you pay nothing. One question from our report can change what motions your attorney files. The question is not whether $197 is worth it. The question is whether you can afford not to know."

### 9. PRICING SECTION NEEDS VALUE STACKING (Brunson + Suby)

Current: feature checkboxes. No dollar-value justification.

**Brunson's stack approach:**
> "A second attorney consultation = $500. Judge research = $300. Question scripts = $200. All of it in 48 hours = $1,000+. Your Case Decoder: $197."

---

## UPL COMPLIANCE FLAGS (Dreyer — fix before Stripe goes live)

### Flag 1 — FAQ attorney retaliation answer (line 90-92)
> "An attorney cannot ethically drop your case simply because you ask informed questions."

States a legal conclusion as fact. Needs: "Under ABA Model Rules of Professional Conduct, an attorney's ability to withdraw is constrained..."

### Flag 2 — Final CTA copy (line 756-757)
> "Their attorney starts filing motions that week."

Implies causal outcome. Add softener: "What happens next is between you and your attorney."

---

## TECHNICAL/SEO FIXES (Dreyer + Laja)

1. **No Google Business Profile** — zero cost, builds entity signals for AI
2. **Homepage LegalService schema has no @id** — not linked to Organization entity
3. **No speakable on homepage** — blog posts have it, homepage doesn't
4. **No confidentiality trust badge** — "Your case is confidential. We never share with your attorney." replaces "256-bit SSL"
5. **Lead capture success state has no upsell** — wire `successUpsellHref="/checkout?tier=case-decoder"`
6. **DiscoveryReveal is 4 full images on mobile** — consider condensing to 2 with "see more" toggle
7. **FAQ order** — move "Can I get a refund?" from position 6 to position 1-2
8. **PricingTable mobile** — 8 feature items push CTA button below fold, consider collapsed list

---

## UNIQUE INSIGHTS (single expert, high value)

| Expert | Insight |
|--------|---------|
| Suby | The lead capture success state is a missed upsell — wire it to checkout |
| Suby | Add "When is your next court date?" field to homepage for countdown urgency |
| Suby | The HALO test: Lead is absent — no clear lead offer above the fold |
| Brunson | Value ladder missing $97 Playbook rung between free and $197 |
| Brunson | "What We Are Not" could be rewritten as identity confirmation, not disclaimer |
| Brunson | Five false beliefs not addressed (attorney is competent but busy, this is generic, too late for my case, will make things worse, can't afford it) |
| Chaperon | "Names changed for privacy" does more harm than the testimonials do good |
| Chaperon | RecentPurchaseNotification reads as generic Shopify popup, breaks the "tiny world" |
| Chaperon | The page needs "You searched for this at 2am. So did I." not "You're not alone" |
| Laja | 14 distinct CTA touchpoints — too many competing actions for degraded working memory |
| Laja | /score lead magnet appears 3x — should be conditional (suppress if already completed) |
| Laja | ChargeTypeSelector has no default state — majority see zero personalized content |
| Dreyer | DoNotPay disarmament should be in hero, not buried in disclaimer box |
| Dreyer | No phone number or human contact signal — amplifies "abandoned" feeling |
| Dreyer | Video of founder would be highest-trust addition ($0 cost, phone-recorded) |

---

## PRIORITY IMPLEMENTATION ORDER

### Tier 0: Before Stripe Goes Live (compliance)
1. Fix UPL Flag 1 (FAQ retaliation answer)
2. Fix UPL Flag 2 (final CTA causal claim)
3. Replace fabricated testimonials with composite case studies or remove

### Tier 1: Immediate (one-line changes, highest ROI)
4. Swap CTA button order (hero + final CTA + sticky mobile)
5. Add guarantee line to hero section
6. Wire lead capture success upsell
7. Add confidentiality trust badge

### Tier 2: Copy Rewrites (1-2 hours)
8. Rewrite + relocate UPL disclaimer box
9. Add Epiphany Bridge narrative to hero
10. Add backstory paragraph before/after DiscoveryReveal
11. Add "I can't afford this" FAQ entry
12. Rewrite urgency bar with charge-specific deadlines

### Tier 3: Structural (half day)
13. Name attorneys in methodology section or cut it
14. Condense DiscoveryReveal to 2 images on mobile
15. Reduce CTA count from 14 to 6-8
16. Add value stacking to pricing cards
17. Move "Can I get a refund?" to FAQ position 1-2
18. Create Google Business Profile

### Tier 4: Content Creation (requires Rahim)
19. Record 60-second founder video for homepage
20. Collect 3 real Case Decoder testimonials (free product for reviews)
21. Add "When is your next court date?" countdown field

---

*Compiled from 5 parallel expert audits. Full individual reports available in agent output files.*
