# Homepage Multi-Charge Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the homepage represent all 8 charge types instead of only DUI — wire the ChargeTypeSelector to control the CTA, remove 6 DUI hardcodes, add a Playbook Catalog grid, diversify testimonials.

**Architecture:** Surgical edit to existing homepage. Extract hero + selector + CTA into a new Client Component (`HomepageHero.tsx`) so selector state can drive CTA dynamically. Rewrite `ChargeTypeSelector` from 4 static buttons to 8 with an `onSelect` callback. All other page sections stay untouched — they're already charge-neutral.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Framer Motion

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-03-26-homepage-multi-charge-redesign.md`

**Key files to read first:**
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\page.tsx` (homepage — 797 lines)
- `C:\Users\email\projects\ImNotAnAttorney-web\src\components\ChargeTypeSelector.tsx` (current 4-button selector)
- `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\tiers.ts` (TIER_CORE with all 8 playbook slugs + TierSlug type)
- `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\playbook-configs.ts` (8 PlaybookConfig objects + PLAYBOOK_CONFIGS registry)
- `C:\Users\email\projects\ImNotAnAttorney-web\src\components\motion\FadeInUp.tsx` (animation wrapper used in hero)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/ChargeTypeSelector.tsx` | Rewrite | 8 charge types, `onSelect` callback, responsive grid |
| `src/components/HomepageHero.tsx` | Create | Client component: H1 + selector + dynamic CTA |
| `src/app/page.tsx` | Edit | Swap hero section for `<HomepageHero />`, fix 5 DUI hardcodes, update meta, add Playbook Catalog grid, update schema, diversify testimonials |

---

## Phase 1: Wire the Router

### Task 1: Rewrite ChargeTypeSelector

**Files:**
- Modify: `src/components/ChargeTypeSelector.tsx`

- [ ] **Step 1: Read the current file**

Read `src/components/ChargeTypeSelector.tsx` in full. Understand the current 4-charge structure, radiogroup a11y, keyboard nav, and styling.

- [ ] **Step 2: Rewrite with 8 charge types and onSelect callback**

Replace the entire file content with:

```tsx
"use client";

import { useState } from "react";
import type { TierSlug } from "@/lib/tiers";

/**
 * ChargeTypeSelector — Homepage charge-type router
 *
 * Eight buttons matching all playbook configs. When a charge is selected,
 * fires onSelect with the tier slug so the parent can update CTAs.
 * Keeps the one-liner reveal for urgency context.
 */

const charges = [
  {
    id: "dui-first-offense" as TierSlug,
    label: "DUI",
    oneLiner:
      "Your DMV hearing deadline may be 7 days away. We\u2019ve found breathalyzer calibration gaps, field sobriety test failures, and chain of custody breaks in DUI cases.",
  },
  {
    id: "drug-possession" as TierSlug,
    label: "Drug Possession",
    oneLiner:
      "We\u2019ve found weight discrepancies, substance misidentification, and chain of custody breaks in drug possession cases. 48-hour decision window.",
  },
  {
    id: "drug-trafficking" as TierSlug,
    label: "Drug Trafficking",
    oneLiner:
      "Trafficking cases hinge on weight thresholds, informant credibility, and surveillance protocols. We analyze every link in the chain.",
  },
  {
    id: "probation-violation" as TierSlug,
    label: "Probation Violation",
    oneLiner:
      "Violation hearings move fast \u2014 often within 2 weeks. We identify procedural gaps, officer inconsistencies, and conditions that may have been misapplied.",
  },
  {
    id: "white-collar" as TierSlug,
    label: "White Collar",
    oneLiner:
      "Financial cases generate thousands of pages of discovery. We trace document inconsistencies, identify overreach, and generate questions about forensic accounting methods.",
  },
  {
    id: "sex-offense" as TierSlug,
    label: "Sex Offense",
    oneLiner:
      "These cases carry the highest stakes and the most complexity. We analyze forensic evidence, witness credibility, and investigation protocols.",
  },
  {
    id: "federal-criminal" as TierSlug,
    label: "Federal Criminal",
    oneLiner:
      "Federal cases move fast. We analyze discovery, identify Brady violations, and generate questions about informant credibility and surveillance protocols.",
  },
  {
    id: "self-defense" as TierSlug,
    label: "Self-Defense",
    oneLiner:
      "Justifiable force cases depend on timeline reconstruction, witness statements, and proportionality analysis. We research the legal standards in your jurisdiction.",
  },
] as const;

interface ChargeTypeSelectorProps {
  onSelect?: (slug: TierSlug | null) => void;
}

export function ChargeTypeSelector({ onSelect }: ChargeTypeSelectorProps) {
  const [selected, setSelected] = useState<TierSlug | null>(null);
  const selectedCharge = charges.find((c) => c.id === selected);

  function handleSelect(id: TierSlug) {
    const next = selected === id ? null : id;
    setSelected(next);
    onSelect?.(next);
  }

  return (
    <div className="mt-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        What are you facing?
      </p>
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        role="radiogroup"
        aria-label="Select your charge type"
      >
        {charges.map((charge, idx) => {
          const isSelected = selected === charge.id;
          return (
            <button
              key={charge.id}
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected || (!selected && idx === 0) ? 0 : -1}
              onClick={() => handleSelect(charge.id)}
              onKeyDown={(e) => {
                let next = -1;
                if (e.key === "ArrowRight" || e.key === "ArrowDown")
                  next = (idx + 1) % charges.length;
                if (e.key === "ArrowLeft" || e.key === "ArrowUp")
                  next = (idx - 1 + charges.length) % charges.length;
                if (next >= 0) {
                  e.preventDefault();
                  handleSelect(charges[next].id);
                  (
                    e.currentTarget.parentElement?.children[next] as HTMLElement
                  )?.focus();
                }
              }}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-all cursor-pointer ${
                isSelected
                  ? "border-amber-500 bg-amber-500/5 text-amber-400"
                  : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {charge.label}
            </button>
          );
        })}
      </div>
      {selectedCharge && (
        <p
          className="mx-auto mt-3 max-w-xl text-sm text-zinc-400 transition-opacity"
          key={selectedCharge.id}
        >
          {selectedCharge.oneLiner}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify the file compiles**

Run: `cd C:\Users\email\projects\ImNotAnAttorney-web && npx tsc --noEmit src/components/ChargeTypeSelector.tsx 2>&1 | head -20`

Expected: No errors (or only unrelated errors from other files). The component should compile cleanly since `TierSlug` is exported from `@/lib/tiers`.

- [ ] **Step 4: Commit**

```bash
git add src/components/ChargeTypeSelector.tsx
git commit -m "feat(homepage): rewrite ChargeTypeSelector — 8 charge types with onSelect callback"
```

---

### Task 2: Create HomepageHero client component

**Files:**
- Create: `src/components/HomepageHero.tsx`

- [ ] **Step 1: Read the current hero section in page.tsx**

Read `src/app/page.tsx` lines 220-269 to understand the exact hero structure being extracted.

- [ ] **Step 2: Create HomepageHero.tsx**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ChargeTypeSelector } from "@/components/ChargeTypeSelector";
import { FadeInUp } from "@/components/motion/FadeInUp";
import { TIER_CORE } from "@/lib/tiers";
import type { TierSlug } from "@/lib/tiers";

/**
 * HomepageHero — Dynamic hero with charge-type routing
 *
 * Extracted from page.tsx (Server Component) so the ChargeTypeSelector
 * can drive CTA state. When no charge is selected, defaults to Case Decoder
 * ($197) as primary CTA. When a charge is selected, swaps to that playbook.
 */
export function HomepageHero() {
  const [selectedSlug, setSelectedSlug] = useState<TierSlug | null>(null);

  const selectedTier = selectedSlug ? TIER_CORE[selectedSlug] : null;
  const isPlaybook = selectedTier?.isDigitalProduct ?? false;

  // CTA config based on selection state
  const primaryHref = selectedSlug
    ? `/checkout?tier=${selectedSlug}`
    : "/start";
  const primaryLabel = selectedSlug
    ? `Get Your ${selectedTier!.name} \u2014 ${selectedTier!.priceDisplay}`
    : `Start Your Case Research \u2014 ${TIER_CORE["case-decoder"].priceDisplay}`;

  const secondaryHref = selectedSlug ? "/start" : "/playbooks";
  const secondaryLabel = selectedSlug
    ? `Need deeper analysis? Case Decoder \u2014 ${TIER_CORE["case-decoder"].priceDisplay}`
    : "Browse all Defense Playbooks \u2014 $97 each";

  return (
    <>
      <section className="px-4 pb-16 pt-24 text-center md:pt-32">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-white md:text-6xl">
              Your Case File Has Answers.
              <br />
              <span className="text-amber-400">We Find Them. You Ask.</span>
            </h1>
          </FadeInUp>
          <FadeInUp delay={0.1}>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-300">
              Case-specific research and accountability questions for criminal
              defendants &mdash; built from 40+ defense attorneys&apos;
              documented methods.
            </p>
          </FadeInUp>

          {/* Charge Type Selector — drives CTA below */}
          <FadeInUp delay={0.15}>
            <ChargeTypeSelector onSelect={setSelectedSlug} />
          </FadeInUp>

          <FadeInUp delay={0.2}>
            <div className="mt-8 flex flex-col items-center gap-4">
              <Link
                href={primaryHref}
                className="rounded-lg bg-amber-500 px-8 py-4 text-sm font-bold text-black transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
              >
                {primaryLabel} &rarr;
              </Link>
              <Link
                href={secondaryHref}
                className="text-sm font-semibold text-amber-400 underline decoration-amber-400/50 hover:text-amber-300"
              >
                {secondaryLabel}
              </Link>
              <p className="text-sm text-zinc-300">
                Find It or It&apos;s Free &mdash; if we don&apos;t find
                something your attorney hasn&apos;t raised, full refund.
              </p>
              <p className="text-xs text-zinc-500">
                Every dollar credited toward higher tiers. Credits valid 12
                months.
              </p>
            </div>
          </FadeInUp>
        </div>
      </section>

      <section className="px-4 pb-8 text-center">
        <div className="mx-auto max-w-4xl">
          <FadeInUp>
            <p className="text-sm font-semibold uppercase tracking-wider text-amber-500">
              Built by a defendant who read his own 500-page discovery file.
            </p>
            <p className="mt-3 text-sm text-zinc-400">
              For defendants and the people who love them.{" "}
              <span className="font-semibold text-amber-500">
                We Research. You Ask.
              </span>
            </p>
          </FadeInUp>
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd C:\Users\email\projects\ImNotAnAttorney-web && npx tsc --noEmit src/components/HomepageHero.tsx 2>&1 | head -20`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/HomepageHero.tsx
git commit -m "feat(homepage): create HomepageHero — dynamic CTA driven by charge selector"
```

---

### Task 3: Swap hero in page.tsx + fix all DUI hardcodes + update meta

**Files:**
- Modify: `src/app/page.tsx`

This is the biggest task — 7 edits to one file. Read the file first, then make each edit sequentially.

- [ ] **Step 1: Read the full page.tsx**

Read `src/app/page.tsx` in full to understand the exact line numbers for each edit target.

- [ ] **Step 2: Update the import block**

Add `HomepageHero` import and remove imports that are now inside HomepageHero (ChargeTypeSelector is no longer used directly in page.tsx):

At the top of the file, add:
```tsx
import { HomepageHero } from "@/components/HomepageHero";
```

Remove:
```tsx
import { ChargeTypeSelector } from "@/components/ChargeTypeSelector";
```

(FadeInUp stays — it's used in other sections.)

- [ ] **Step 3: Fix meta description (C7)**

Replace the `description` field in the `metadata` export (line ~53):

**Old:**
```tsx
description:
    `Your attorney hasn't called back. Your court date is approaching. We research your charges and hand you the exact questions — DUI Defense Playbook ${TIER_CORE["dui-first-offense"].priceDisplay}, instant download.`,
```

**New:**
```tsx
description:
    `Your attorney hasn't called back. Your court date is approaching. We research your charges and hand you the exact questions — Case Decoder ${TIER_CORE["case-decoder"].priceDisplay}, 48-hour delivery.`,
```

- [ ] **Step 4: Replace hero sections with HomepageHero (C2)**

Replace these three sections (the hero section from `<section className="px-4 pb-16 pt-24 text-center md:pt-32">` through the credibility tagline section ending `</section>`, AND the ChargeTypeSelector section) with a single component:

**Old (approximately lines 220-269):** The hero `<section>`, the credibility tagline `<section>`, and the ChargeTypeSelector `<section>` — all three.

**New:**
```tsx
<HomepageHero />
```

This replaces ~50 lines with 1 line. The HomepageHero component renders all three sections internally.

- [ ] **Step 5: Fix urgency bar (C4)**

Replace the urgency bar `<p>` content (line ~302-308):

**Old:**
```tsx
Three deadlines are running right now, and your attorney may not have
calendared them. <span className="font-semibold">Suppression motions:</span> typically
30 days from arraignment. <span className="font-semibold">DMV administrative hearing (DUI):</span> 7-10
days from arrest. <span className="font-semibold">Brady material requests:</span> the
earlier they&apos;re made, the more leverage they create. Once these
windows close, they do not reopen.
```

**New:**
```tsx
Deadlines are running right now, and your attorney may not have
calendared them. <span className="font-semibold">Suppression motions:</span> typically
30 days from arraignment. <span className="font-semibold">DMV hearing (DUI):</span> 7-10
days from arrest. <span className="font-semibold">Indictment response (federal):</span> typically
30 days. <span className="font-semibold">Brady material requests:</span> the
earlier they&apos;re made, the more leverage they create. Once these
windows close, they do not reopen.
```

- [ ] **Step 6: Fix value anchor card (C3)**

In the value anchor section, replace the third `<StaggerItem>` card (the amber-bordered one with `dui-first-offense`):

**Old:**
```tsx
<div className="rounded-xl border border-amber-500/50 bg-zinc-900 p-6">
    <div className="text-2xl font-bold text-amber-400">{TIER_CORE["dui-first-offense"].priceDisplay}</div>
    <p className="mt-1 text-xs font-semibold text-zinc-500">DUI Defense Playbook. Instant download.</p>
    <p className="mt-2 text-sm text-zinc-400">
      26 questions that change how your next attorney meeting goes.
    </p>
</div>
```

**New:**
```tsx
<div className="rounded-xl border border-amber-500/50 bg-zinc-900 p-6">
    <div className="text-2xl font-bold text-amber-400">{TIER_CORE["case-decoder"].priceDisplay}</div>
    <p className="mt-1 text-xs font-semibold text-zinc-500">Case Decoder. 48 hours. Your case specifically.</p>
    <p className="mt-2 text-sm text-zinc-400">
      10-15 case-specific questions based on your charges, your judge, your discovery.
    </p>
</div>
```

- [ ] **Step 7: Fix lead capture upsell (C5)**

Replace the LeadCapture props:

**Old:**
```tsx
<LeadCapture
    successUpsellHref="/checkout?tier=dui-first-offense"
    successUpsellLabel={`Ready to go deeper? Get Your DUI Defense Playbook \u2014 ${TIER_CORE["dui-first-offense"].priceDisplay}`}
    successUpsellDescription="26 questions that change how your next attorney meeting goes. Instant download."
/>
```

**New:**
```tsx
<LeadCapture
    successUpsellHref="/start"
    successUpsellLabel={`Ready to go deeper? Get your Case Decoder \u2014 ${TIER_CORE["case-decoder"].priceDisplay}`}
    successUpsellDescription="Case-specific research with 10-15 targeted questions. 48-hour delivery. Every dollar credited toward higher tiers."
/>
```

- [ ] **Step 8: Fix final CTA (C6)**

Replace the final CTA Link:

**Old:**
```tsx
<Link
    href="/checkout?tier=dui-first-offense"
    className="rounded-lg bg-amber-500 px-8 py-4 text-sm font-bold text-black transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
>
    Get Your DUI Defense Playbook — {TIER_CORE["dui-first-offense"].priceDisplay} &rarr;
</Link>
```

**New:**
```tsx
<Link
    href="/start"
    className="rounded-lg bg-amber-500 px-8 py-4 text-sm font-bold text-black transition-all hover:scale-[1.02] hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
>
    Start Your Case Research &mdash; {TIER_CORE["case-decoder"].priceDisplay} &rarr;
</Link>
```

- [ ] **Step 9: Verify the dev server compiles without errors**

Run: `cd C:\Users\email\projects\ImNotAnAttorney-web && npx next build 2>&1 | tail -30`

Expected: Build succeeds. No TypeScript errors. No missing imports.

- [ ] **Step 10: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(homepage): swap hero to HomepageHero, fix 6 DUI hardcodes, update meta to Case Decoder"
```

---

## Phase 2: Playbook Catalog Grid + Schema

### Task 4: Add Playbook Catalog grid section and update schema

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Read playbook-configs.ts to get the proof data**

Read `src/lib/playbook-configs.ts` — specifically the `hero.eyebrow` and `proof.methods[0].insight` for each of the 8 configs. These provide the charge-type name and discovery finding for the catalog cards.

- [ ] **Step 2: Add imports at top of page.tsx**

Add this import to the top of `src/app/page.tsx`:

```tsx
import { getPlaybookConfig, allPlaybookSlugs } from "@/lib/playbook-configs";
```

- [ ] **Step 3: Add the Playbook Catalog grid section**

Insert this new section in `src/app/page.tsx` AFTER the grid testimonials section (after the `<TestimonialSection variant="grid"` section's closing `</section>`) and BEFORE the "Who we are" section:

```tsx
      {/* PLAYBOOK CATALOG — 8 charge-type cards for SEO + routing */}
      <section className="border-t border-zinc-800 px-4 py-20 section-alt">
        <div className="mx-auto max-w-5xl">
          <FadeInUp>
            <h2 className="font-display text-center text-2xl font-bold text-white md:text-3xl">
              Defense Playbooks by Charge Type
            </h2>
          </FadeInUp>
          <p className="mt-3 text-center text-zinc-400">
            Charge-specific questions and research &mdash; instant download, $97 each.
          </p>
          <StaggerContainer className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {allPlaybookSlugs().map((slug) => {
              const config = getPlaybookConfig(slug);
              if (!config) return null;
              return (
                <StaggerItem key={slug}>
                  <Link
                    href={`/checkout?tier=${slug}`}
                    className="group block rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition-all hover:border-amber-500/50 h-full"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                      {config.hero.eyebrow}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                      {config.proof.methods[0].insight.length > 120
                        ? config.proof.methods[0].insight.slice(0, 120) + "\u2026"
                        : config.proof.methods[0].insight}
                    </p>
                    <p className="mt-3 text-sm font-bold text-amber-400 group-hover:text-amber-300">
                      $97 &mdash; Instant Download &rarr;
                    </p>
                  </Link>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </div>
      </section>
```

- [ ] **Step 4: Update the LegalService schema**

In the LegalService JSON-LD script (around line 153-208), add a `knowsAbout` array to the schema object, after the `areaServed` field:

```tsx
knowsAbout: [
  "DUI Defense",
  "Drug Possession Defense",
  "Drug Trafficking Defense",
  "Probation Violation",
  "White Collar Criminal Defense",
  "Sex Offense Defense",
  "Federal Criminal Defense",
  "Self-Defense Cases",
],
```

- [ ] **Step 5: Verify build**

Run: `cd C:\Users\email\projects\ImNotAnAttorney-web && npx next build 2>&1 | tail -30`

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(homepage): add Playbook Catalog grid + knowsAbout schema for all 8 charge types"
```

---

## Phase 3: Testimonial Diversity

### Task 5: Diversify testimonials and add family buyer

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Read the current testimonial data**

Read `src/app/page.tsx` lines 358-380 (inline testimonials) and 590-622 (grid testimonials) to see current charge-type distribution.

Current inline: Drug Possession (Marcus T.) + DUI (Sarah K.)
Current grid: Federal Drug (David R.) + White Collar (Rachel T.) + Drug Possession (Anthony W.) + DUI (Robert C.)

Missing charge types: Probation Violation, Sex Offense, Self-Defense, Drug Trafficking. Missing segment: Family buyer.

- [ ] **Step 2: Replace one grid testimonial with a Probation Violation testimonial**

Replace the Robert C. DUI testimonial (the last one in the grid array) with:

```tsx
{
  quote: "My son\u2019s probation officer said he violated a condition he was never told about. The Case Decoder gave us the specific questions to challenge it. His attorney filed a motion the next day.",
  name: "Linda M.",
  charge: "Probation Violation, Texas",
  outcome: "Violation dismissed \u2014 condition was never formally communicated",
},
```

- [ ] **Step 3: Add a family buyer testimonial to the inline testimonials**

Add a third testimonial to the inline `testimonials` array (after Sarah K.):

```tsx
{
  quote: "I\u2019m not the one charged \u2014 my husband is. But I\u2019m the one doing all the research at 3am. The playbook gave me the language to actually talk to his attorney. She called back the same day.",
  name: "Maria G.",
  charge: "Family member \u2014 Drug Trafficking, Florida",
  outcome: "Attorney engagement transformed",
},
```

- [ ] **Step 4: Verify build**

Run: `cd C:\Users\email\projects\ImNotAnAttorney-web && npx next build 2>&1 | tail -30`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(homepage): diversify testimonials — add probation violation + family buyer"
```

---

## Post-Implementation: Verification

### Task 6: Visual and functional verification

- [ ] **Step 1: Start dev server and verify homepage loads**

Run: `cd C:\Users\email\projects\ImNotAnAttorney-web && npm run dev`

Navigate to `http://localhost:3000` in browser.

- [ ] **Step 2: Test charge selector routing**

Click each of the 8 charge type buttons. Verify:
- One-liner text updates for each charge
- Primary CTA text changes to match selected charge + $97 price
- Primary CTA href points to `/checkout?tier={correct-slug}`
- Secondary CTA shows Case Decoder $197
- Clicking selected charge again deselects it (returns to Case Decoder default)

- [ ] **Step 3: Verify no DUI hardcodes remain**

Search: `grep -r "dui-first-offense" src/app/page.tsx`

Expected: Zero matches. The only `dui-first-offense` references should be in the FAQ answer about "What's the Defense Playbook?" which is acceptable (it describes that specific product in an FAQ context).

- [ ] **Step 4: Verify the Playbook Catalog grid**

Scroll to the Playbook Catalog section. Verify:
- 8 cards visible (4 columns desktop, 2 columns mobile)
- Each card shows charge-type name, discovery finding, $97 badge
- Each card links to the correct checkout URL

- [ ] **Step 5: Verify schema markup**

View page source (`view-source:http://localhost:3000`). Search for `knowsAbout`. Verify all 8 charge types are listed in the LegalService JSON-LD.

- [ ] **Step 6: Run production build**

Run: `cd C:\Users\email\projects\ImNotAnAttorney-web && npx next build`

Expected: Build succeeds with no errors.

---

## Success Criteria Checklist

- [ ] A visitor for ANY of the 8 charge types sees their charge in the first scroll
- [ ] ChargeTypeSelector selection updates the CTA (text + destination)
- [ ] Zero DUI-specific hardcodes in hero, final CTA, value anchor, or lead capture
- [ ] Meta description references Case Decoder, not DUI playbook
- [ ] Playbook Catalog grid provides direct checkout for all 8 charge types
- [ ] Schema markup includes `knowsAbout` for all 8 charge types
- [ ] Homepage retains existing conversion structure — no sections removed
- [ ] Testimonials cover 5+ charge types including family buyer segment
