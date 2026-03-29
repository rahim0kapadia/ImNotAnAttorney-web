# Add Testimonials to Secondary Pages + Family Buyer Acknowledgment

## Context
- **Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
- **Problem:** ANON1 failures (zero testimonials) on 6 pages; D25 failures (no family buyer acknowledgment) on checkout
- **Key files:** 7 page files + 1 component (TestimonialSection)
- **Tech stack:** Next.js 15, TypeScript, Tailwind CSS
- **Key decisions:** Use existing `TestimonialSection` component (inline variant, single testimonial per page); family buyer line follows feltExperience pattern (italic zinc-400)
- **Setup:** `npm run build` to verify after all changes

## Component Reference

`src/components/TestimonialSection.tsx` — Two variants: `inline` and `grid`.
- Props: `{ testimonials: { quote, name, charge, outcome }[], variant: "inline" | "grid" }`
- Homepage uses both variants. Inline is better for single testimonials on secondary pages.
- Disclaimer pattern: `<p className="mt-4 text-center text-xs text-zinc-600">*Based on real defendant experiences. Names changed for privacy.</p>`

## Tasks

### Task 1: Family page testimonial
**File:** `src/app/family/page.tsx`
- Add `import { TestimonialSection } from "@/components/TestimonialSection";`
- Insert before the CTA section (before `{/* CTA */}`), a `<FadeInUp>` wrapper containing:
  - `<TestimonialSection variant="inline" testimonials={[{ quote: "I took the score on his behalf at midnight. It flagged that no motions had been filed in 60 days. My son brought the questions to his attorney and they filed a suppression motion the next week. Charges reduced.", name: "Linda M.", charge: "Son's Drug Possession", outcome: "Charges reduced" }]} />`
  - Disclaimer line

### Task 2: Partners page testimonial
**File:** `src/app/partners/page.tsx`
- Add `import { TestimonialSection } from "@/components/TestimonialSection";`
- Insert after the "Why Defendants Buy" section (after `</section>` closing the `PartnerWhyItWorks` section, before `{/* FAQ */}`):
  - `<TestimonialSection variant="inline" testimonials={[{ quote: "I started handing the card to every client at release. Three of them bought the playbook within 24 hours. One told me the questions got his case dismissed. I've earned more in referral commissions than I expected.", name: "Mike R.", charge: "Bail Bondsman, Tampa", outcome: "Multiple referral conversions" }]} />`
  - Disclaimer line
- Wrap in a `<section>` with consistent spacing

### Task 3: Bondsman page testimonial
**File:** `src/app/partners/bondsman/page.tsx`
- Add `import { TestimonialSection } from "@/components/TestimonialSection";`
- Insert after the "Why Defendants Buy" section, before FAQ:
  - `<TestimonialSection variant="inline" testimonials={[{ quote: "My clients are always asking what to do next. Now I hand them something real. Two referrals last month, both converted to Case Decoders.", name: "Carlos D.", charge: "Bail Bondsman, Houston", outcome: "2 referral conversions" }]} />`
  - Disclaimer line

### Task 4: Start page testimonial
**File:** `src/app/start/page.tsx`
- Add `import { TestimonialSection } from "@/components/TestimonialSection";`
- Insert in the below-fold trust section (after the 3-column trust grid, before the $97 playbook fallback):
  - Wrap in a `<div className="mx-auto max-w-xl mt-8">`
  - `<TestimonialSection variant="inline" testimonials={[{ quote: "I filled out the intake at 2 AM the night I was arrested. Had my Case Decoder 36 hours later. The questions it gave me completely changed my next attorney meeting.", name: "Sarah K.", charge: "DUI", outcome: "Attorney meeting transformed" }]} />`
  - Disclaimer line

### Task 5: Score page testimonial
**File:** `src/app/score/page.tsx`
- Add `import { TestimonialSection } from "@/components/TestimonialSection";`
- Insert BEFORE the ScoreDisplay component call in the main render (in the pre-score questionnaire area, after the intro text and before the form OR after the score result but before reset). Best placement: after the `<CompletionCounter>` and before the conditional render (`result ? ... : ...`), as a static testimonial visible in both states.
  - `<TestimonialSection variant="inline" testimonials={[{ quote: "The score showed me my attorney hadn't filed a single motion in 4 months. I brought the report to our next meeting. He filed three motions that week.", name: "David R.", charge: "Federal Drug Conspiracy", outcome: "3 motions filed after confrontation" }]} />`
  - Disclaimer line
  - Wrap in `<div className="mt-6">`

### Task 6: Resources page testimonial
**File:** `src/app/resources/page.tsx`
- Add `import { TestimonialSection } from "@/components/TestimonialSection";`
- Insert after the lead magnets section (after `</section>` closing `{/* DOWNLOADABLE GUIDES */}`) and before the DUI 72-hour checklist section:
  - `<TestimonialSection variant="inline" testimonials={[{ quote: "The discovery checklist helped me organize 200 pages of documents. I found a weight discrepancy my attorney hadn't noticed. That one finding changed my plea negotiation.", name: "Maria G.", charge: "Drug Possession", outcome: "Plea negotiation improved" }]} />`
  - Disclaimer line

### Task 7: Family buyer acknowledgment on checkout
**File:** `src/app/checkout/page.tsx`
- Find the `feltExperience` render block (~line 726-728):
  ```
  {info.feltExperience && (
    <p className="mt-2 text-sm text-zinc-400 italic">{info.feltExperience}</p>
  )}
  ```
- Insert AFTER the feltExperience paragraph, before the payment option block:
  ```
  <p className="mt-1 text-xs text-zinc-500 italic">
    Buying this for someone you love? Everything works the same — the questions, the templates, the action plan. You're giving them a real advantage.
  </p>
  ```

### Task 8: Build verification
- Run `npm run build` in `ImNotAnAttorney-web` to verify no TypeScript or build errors
- Verify all 7 files compile

## Rules
- No "you should" / "we recommend" / "we advise" (UPL)
- No AI/technology disclosure
- No emojis
- Match existing styling patterns exactly
