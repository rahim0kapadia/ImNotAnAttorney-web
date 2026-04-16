# Homepage Multi-Charge Redesign, Expert-Informed Design Spec

**Date:** 2026-03-26
**Status:** Draft, Awaiting Rahim approval
**Supersedes:** `docs/superpowers/specs/2026-03-18-homepage-redesign-design.md`
**Expert Panel:** Peep Laja (CRO/ResearchXL), Sabri Suby (crisis direct response), Chris Dreyer (legal marketing/SEO), Alex Hormozi (offer architecture)
**Project:** `C:\Users\email\projects\ImNotAnAttorney-web\`
**Primary File:** `src/app/page.tsx`

---

## 1. Problem Statement

The homepage (`src/app/page.tsx`) only represents the DUI playbook ($97). INAA has 8 charge types and 5 service tiers ($97-$9,997). A defendant arrested for drug trafficking, white collar fraud, or a sex offense lands on a DUI-specific page and bounces.

Six hardcoded DUI references exist in the current homepage:
1. **Hero CTA** (line ~237-241): `href="/checkout?tier=dui-first-offense"` + "Get Your DUI Defense Playbook"
2. **Value anchor card** (line ~570-571): `TIER_CORE["dui-first-offense"].priceDisplay` + "DUI Defense Playbook. Instant download."
3. **Urgency bar** (line ~304): "(DUI)" parenthetical in DMV hearing deadline
4. **Lead capture upsell** (line ~727-729): `successUpsellHref="/checkout?tier=dui-first-offense"` + "Get Your DUI Defense Playbook"
5. **Final CTA** (line ~778-781): `href="/checkout?tier=dui-first-offense"` + "Get Your DUI Defense Playbook"
6. **Meta description** (line ~53): mentions "DUI Defense Playbook"

The ChargeTypeSelector exists but is a dead end, visitor selects a charge type and nothing happens. No CTA appears. No routing fires. The highest-intent visitor self-identifies and then gets abandoned.

### Expert Diagnosis

**Broken layer: POSITIONING (Peep Laja)**, The narrative is charge-neutral and strong. The concrete artifacts (CTAs, pricing, urgency) hardcode DUI. Fix the artifacts, not the story.

**Homepage role: ROUTER, not closer (all 4 experts)**, The homepage qualifies and routes. Individual playbook/product pages close the sale.

---

## 2. Design Decisions

### Decision 1: Primary CTA = Case Decoder ($197), not $97 playbook

**Source:** Hormozi value equation analysis.
**Reasoning:** The crisis buyer's core fear is "nobody is paying attention to MY case." A pre-built PDF ($97 playbook) confirms that fear. The Case Decoder ($197, 48hr, personalized) resolves it. The $97 playbook becomes the secondary "instant download tonight" option.
**Upgrade credit** ("Every dollar credited toward higher tiers") displayed immediately below primary CTA eliminates risk.

### Decision 2: ChargeTypeSelector expands 4 to 8 and controls the CTA

**Source:** Unanimous across all 4 experts.
**Current state:** 4 buttons (DUI / Drug Charge / Federal Case / Other). Selection shows a one-liner but does nothing to the CTA.
**New state:** 8 buttons matching all playbook configs:
- DUI
- Drug Possession
- Drug Trafficking
- Probation Violation
- White Collar
- Sex Offense
- Federal Criminal
- Self-Defense

On selection: the primary CTA text and href update to route to that charge type's playbook checkout. The secondary CTA updates to show the Case Decoder. If no selection, defaults to Case Decoder as primary.

### Decision 3: Surgical fix, not full rebuild

**Source:** Peep Laja, Hormozi, Dreyer consensus.
**Reasoning:** "The architecture is mostly correct. It was built when only DUI was live and was never updated." The working sections (backstory, pain points, bridge, how it works, what we look for, who we are, guarantee) are charge-neutral and stay untouched.

### Decision 4: Add Playbook Catalog grid section

**Source:** Sabri Suby blueprint, endorsed by Dreyer for SEO.
**Reasoning:** SEO visitors arriving for a specific charge type need a clear route from the homepage. 8 cards with charge-specific discovery findings, $97 badge, and direct CTA. Also strengthens Entity SEO, Google and AI systems can extract what charge types are served.

### Decision 5: War Room/Situation Room off homepage pricing

**Source:** Suby, Hormozi, Dreyer (3 of 4).
**Reasoning:** $4,997-$9,997 tiers create decision fatigue for a crisis buyer. Keep PricingTable at maxTiers={3} (Case Decoder, Intelligence Brief, X-Ray). Add one-line callout linking to `/services` for full comparison.

---

## 3. Changes, Phase 1 (Highest Leverage)

### C1: Rewrite ChargeTypeSelector component

**File:** `src/components/ChargeTypeSelector.tsx`

**Current:** 4 hardcoded charge buttons, no callback, no routing.

**New:**
- Expand to 8 charge types with slugs matching `TIER_CORE` keys
- Accept an `onSelect` callback prop: `(slug: TierSlug | null) => void`
- Emit the selected tier slug to parent on click
- Keep the one-liner reveal behavior
- Responsive: 2-column grid on mobile, 4-column on desktop (8 buttons)
- "Other" removed entirely, all 8 charge types have explicit buttons

```typescript
interface ChargeTypeSelectorProps {
  onSelect?: (slug: TierSlug | null) => void;
}
```

Charge type to tier slug mapping:
| Button Label | Tier Slug |
|---|---|
| DUI | `dui-first-offense` |
| Drug Possession | `drug-possession` |
| Drug Trafficking | `drug-trafficking` |
| Probation Violation | `probation-violation` |
| White Collar | `white-collar` |
| Sex Offense | `sex-offense` |
| Federal Criminal | `federal-criminal` |
| Self-Defense | `self-defense` |

### C2: Make homepage hero CTA dynamic

**File:** `src/app/page.tsx`, Hero section (lines ~220-248)

**Problem:** The page.tsx is a Server Component. ChargeTypeSelector is a Client Component. The CTA needs to react to selector state.

**Solution:** Extract the hero + selector + CTA into a new Client Component: `src/components/HomepageHero.tsx`

This component:
1. Renders the H1 (unchanged, it's already charge-neutral)
2. Renders the ChargeTypeSelector with onSelect callback
3. Maintains `selectedSlug` state
4. When no selection: Primary CTA = Case Decoder ($197) pointing to `/start`. Secondary = "Browse all playbooks" pointing to `/playbooks`
5. When charge selected: Primary CTA = `[Charge] Defense Playbook, $97` pointing to `/checkout?tier={slug}`. Secondary = "Need deeper analysis? Case Decoder, $197" pointing to `/start`
6. Upgrade credit line always visible below CTAs

**H1 stays:** "Your Case File Has Answers. We Find Them. You Ask.", already charge-neutral.

**Subheadline changes from:**
> "26 questions built from 40+ defense attorneys' methods"

**To:**
> "Case-specific research and accountability questions for criminal defendants, built from 40+ defense attorneys' documented methods."

### C3: Fix value anchor card (DUI to charge-neutral)

**File:** `src/app/page.tsx`, Value anchor section (lines ~528-579)

**Current third card:**
```
$97 / DUI Defense Playbook. Instant download.
26 questions that change how your next attorney meeting goes.
```

**New third card:**
```
$197 / Case Decoder. 48 hours.
10-15 case-specific questions based on YOUR charges, YOUR judge, YOUR discovery.
```

### C4: Fix urgency bar (remove DUI parenthetical)

**File:** `src/app/page.tsx`, Urgency bar (lines ~300-309)

**Current:** "DMV administrative hearing (DUI): 7-10 days from arrest"

**New:** Multi-charge deadlines:
> "DMV administrative hearing: 7-10 days from arrest (DUI cases). Indictment response: typically 30 days (federal cases). Suppression motions: typically 30 days from arraignment. Brady material requests: the earlier they're made, the more leverage they create."

### C5: Fix lead capture upsell (DUI to Case Decoder)

**File:** `src/app/page.tsx`, Lead capture section (lines ~726-729)

**Current:**
```tsx
successUpsellHref="/checkout?tier=dui-first-offense"
successUpsellLabel="Ready to go deeper? Get Your DUI Defense Playbook, $97"
```

**New:**
```tsx
successUpsellHref="/start"
successUpsellLabel="Ready to go deeper? Get your Case Decoder, $197"
successUpsellDescription="Case-specific research with 10-15 targeted questions. 48-hour delivery. Every dollar credited toward higher tiers."
```

### C6: Fix final CTA (DUI to charge-neutral)

**File:** `src/app/page.tsx`, Final CTA section (lines ~759-790)

Change to Case Decoder CTA (charge-neutral, always correct):
```tsx
<Link href="/start">
  Start Your Case Research, $197 →
</Link>
```

The final CTA doesn't need charge-type awareness, by this point the visitor has scrolled the entire page and is ready for the general entry point.

### C7: Fix meta description

**File:** `src/app/page.tsx`, metadata (lines ~50-62)

**Current:** mentions "DUI Defense Playbook $97"

**New:**
```
Your attorney hasn't called back. Your court date is approaching. We research your charges
and hand you the exact questions, Case Decoder $197, 48-hour delivery.
```

---

## 4. Changes, Phase 2 (New Section)

### C8: Add Playbook Catalog grid

**File:** `src/app/page.tsx`, New section between testimonials and pricing

**Purpose:** 8 charge-type cards for SEO visitors and charge-type routing. Each card:
- Charge type name
- One specific discovery finding (from playbook-configs.ts proof section)
- "$97, Instant Download" badge
- Direct CTA pointing to `/checkout?tier={slug}`

**Layout:** 2-column mobile, 4-column desktop grid.

**Data source:** Import from `playbook-configs.ts`, use each config's `hero.eyebrow` and first `proof.methods[0].insight` for the discovery finding.

**Section headline:** "Defense Playbooks by Charge Type"
**Subtext:** "Charge-specific questions and research, instant download, $97 each."

### C9: Schema markup update

**File:** `src/app/page.tsx`, LegalService schema (lines ~153-208)

Add `knowsAbout` entries for all 8 charge types so Google and AI systems can extract what charges are served:

```json
"knowsAbout": [
  "DUI Defense", "Drug Possession Defense", "Drug Trafficking Defense",
  "Probation Violation", "White Collar Criminal Defense",
  "Sex Offense Defense", "Federal Criminal Defense", "Self-Defense Cases"
]
```

---

## 5. Changes, Phase 3 (Polish)

### C10: Testimonial charge-type diversity

**File:** `src/app/page.tsx`, Both TestimonialSection instances

Ensure testimonials cover at least 4 different charge types. Current inline testimonials: Drug Possession + DUI. Current grid: Federal Drug, White Collar, Drug Possession, DUI. Add: Probation Violation, Sex Offense, or Self-Defense testimonial to replace one DUI duplicate.

### C11: Add family buyer testimonial

At least one testimonial from the "family member doing research" segment (already mentioned in pain points as the 5th card but no testimonial for this persona).

---

## 6. Files Changed Summary

| Phase | File | Change Type |
|-------|------|-------------|
| 1 | `src/components/ChargeTypeSelector.tsx` | Rewrite (expand 4 to 8, add callback) |
| 1 | `src/components/HomepageHero.tsx` | **New file** (client component, hero + selector + dynamic CTA) |
| 1 | `src/app/page.tsx` | Edit (replace hero with HomepageHero, fix 5 DUI hardcodes, update meta) |
| 2 | `src/app/page.tsx` | Edit (add Playbook Catalog grid section, update schema) |
| 3 | `src/app/page.tsx` | Edit (testimonial diversity) |

**Components NOT changed:** DiscoveryReveal, PricingTable, FAQAccordion, LeadCapture (only props change), TrustBadges, StickyMobileCTA, RecentPurchaseNotification, TestimonialSection (only data changes).

---

## 7. What Stays Untouched (Expert Consensus: Working)

These sections are charge-neutral and converting. Do not modify:
- Backstory (founder story, no charge-type dependency)
- Pain points (VoC verbatim, all charge types)
- Bridge identity statement
- How it works (3-step process)
- What we look for (6 investigation methods)
- Who we are (peer-voiced identity)
- Guarantee section (already references Case Decoder + IB, not DUI)
- FAQ (mostly charge-neutral, minor Phase 3 update)

---

## 8. Success Criteria

1. A visitor arrested for ANY of the 8 charge types sees their charge type represented within the first scroll
2. ChargeTypeSelector selection updates the CTA (text + destination)
3. Zero DUI-specific hardcodes remain in hero, final CTA, value anchor, or lead capture
4. Meta description and schema markup reference the full service range
5. Playbook Catalog grid provides direct checkout paths for all 8 charge types
6. Homepage retains its existing conversion structure, no sections removed

---

## 9. Review Process

After implementation:
1. **Peep Laja CRO audit**, conversion flow, CTA clarity, cognitive load
2. **Chris Dreyer SEO review**, schema markup, internal linking, entity coverage
3. **Reality Checker**, evidence-based sign-off, no fantasy approvals
4. **frontend-design skill**, visual execution quality
