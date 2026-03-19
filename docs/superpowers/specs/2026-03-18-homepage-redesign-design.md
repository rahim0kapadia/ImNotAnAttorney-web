# INA Homepage Redesign — Expert-Informed Design Spec

**Date:** 2026-03-18
**Status:** Draft — Awaiting Rahim approval
**Plan:** `docs/plans/2026-03-18-homepage-redesign.md`
**Expert Panel:** April Dunford (positioning), Peep Laja (CRO), Sabri Suby (direct response), Chris Dreyer (legal marketing), Seth Godin (tribe/brand), Alex Hormozi (offer/value), Russell Brunson (copy/funnel), Andre Chaperon (trust narrative)
**Project:** `~/projects/ImNotAnAttorney-web/`
**Primary File:** `src/app/page.tsx`

---

## 1. Strategic Context

### What INA Is
A legal defense research service for criminal defendants whose attorneys have abandoned them. INA researches the defendant's specific charges and generates the exact questions that hold their attorney accountable. Legal INFORMATION, not legal advice.

### The Buyer
Someone at 2 AM who just got arrested. Terrified. Already paid $5K-$50K for an attorney who won't return calls. Cortisol elevated, working memory degraded. They do NOT trust their attorney. They are looking for someone on THEIR side.

### The Expert Consensus (8 Experts)
1. **No cinematic 3D animations** — crisis buyers can't process visual complexity. Affects trust negatively.
2. **Keep zinc + amber palette** — dark themes signal seriousness in legal contexts. Do not change.
3. **Surgical enhancements, not overhaul** — the conversion structure is sound. Fix copy, add 2 components, reorder priorities.
4. **The defendant is the protagonist** — every line of copy should make the defendant the agent, not the victim.
5. **INA is pro-defendant, not anti-attorney** — but on first contact, speak the defendant's truth. They don't trust their attorney. Acknowledge it. Shift to collaborative framing after trust is earned (email sequence, report).

### Core Positioning Sentence
"INA is the only self-service case research tool built for defendants whose attorney has abandoned them — it analyzes your specific charges and generates the exact questions that put your attorney back to work."

---

## 2. Changes Overview

### Copy Changes (no engineering)
| # | Change | Section | Expert Source |
|---|--------|---------|--------------|
| C1 | New H1 headline | Hero | Brunson, Godin, Chaperon |
| C2 | Origin story above fold | Hero | All 8 |
| C3 | "Find It or It's Free" guarantee | Guarantee | Hormozi, Laja, Dreyer |
| C4 | Swap CTA priority (sample = primary) | Hero | Chaperon, Laja |
| C5 | Bridge language update | Bridge | Godin |
| C6 | Price anchor reframe | Value Anchor | Hormozi |
| C7 | "What We Are NOT" section | New section | Brunson |
| C8 | FAQ reorder + updates | FAQ | Dreyer, Brunson |
| C9 | Final CTA rewrite | Final CTA | Godin, Brunson |
| C10 | Meta title/OG updates | Metadata | Dreyer |

### Component Changes (engineering required)
| # | Change | Type | Expert Source |
|---|--------|------|--------------|
| E1 | Discovery Document Reveal | New client component | Dunford, Suby |
| E2 | Process Timeline Enhancement | Enhanced existing section | All |
| E3 | Charge-Type Selector | New client component | Brunson |
| E4 | Guarantee Badge in TrustBadges | Component update | Hormozi, Laja |

---

## 3. Detailed Copy Changes

### C1: New H1 Headline

**Current (line 215-219):**
```
Your Lawyer Won't Call You Back.
We'll Give You the Questions That Change Your Next Meeting.
```

**Problem (Brunson + Godin):** Creates victims, not agents. The defendant is passive — the attorney is the subject. Also risks alienating the attorney referral channel (Dreyer).

**New:**
```
Your Case File Has Answers Your Attorney Hasn't Mentioned.
We Find Them. You Ask the Questions.
```

**Why this works:**
- Defendant is implied agent ("your case file" = your property, your right)
- Intriguing — implies hidden answers (curiosity hook)
- Doesn't attack attorneys — says "hasn't mentioned" not "is hiding"
- But also doesn't defend them — the implication is clear
- Matches the product mechanism (we find, you ask)
- UPL-safe — we find answers (information), not legal advice

**Subheadline (replaces lines 222-227):**
```
Most defendants tell us the same thing: "My attorney won't call me back."
We built this for that moment. 68.3 grams of missing evidence in one real
case. A CI phone attributed to two different people. A drug that didn't
match the charge. Your attorney may have missed something too.
```

**Why:** Validates the distrust directly (Chaperon: speak their language on first contact). Immediately drops the origin story specifics (all 8 experts agree this is the #1 trust signal). Bridges to the product without selling.

**Eyebrow text update (line 211):**
```
Current: "Built on a real trafficking case. Powered by 40+ elite defense attorneys."
New:     "Built by a defendant who read his own 500-page discovery file."
```

**Why (Godin):** Peer credibility > institutional credibility. "Built by a defendant" creates immediate recognition.

**Second paragraph below subheadline (replaces lines 228-235):**
```
We research your charges using the documented tactics of 40+ elite
defense attorneys — the ones who win landmark cases. We're not lawyers.
We're researchers. And we catch what gets missed.
```

### C2: Origin Story Attribution

**Current counter line (line 253-255):**
```
500+ defendants armed with the right questions · We Research. You Ask.
```

**New:**
```
Built by Rahim — a trafficking defendant who found 68.3g of missing
evidence his attorney never mentioned. · We Research. You Ask.
```

**Why (Chaperon):** First-person founder identity converts better than anonymous institutional voice. Names create trust. "A trafficking defendant" establishes peer status.

### C3: "Find It or It's Free" Guarantee

**Current guarantee (lines 662-698):**
- "The Questions Work or Your Money Back"
- Full Cash Refund (if deadline/question count missed)
- 100% Upgrade Credit (if not satisfied)
- Premium Tiers delivery guarantee

**Problem (Hormozi):** "Questions Work" is vague — work how? Upgrade credit is weak risk reversal for first purchase from financially stressed buyer.

**New guarantee:**

```
Section title: "Find It or It's Free"

Guarantee 1 — "The Discovery Guarantee":
  We will identify at least one gap, missed question, or unexamined area
  in your case that your attorney has not raised — or we refund every
  dollar. No forms. No arguments. One email to help@imnotanattorney.com.

Guarantee 2 — "The Speed Guarantee":
  Your Case Decoder report in 48 hours. Your Intelligence Brief in 72
  hours. If we miss the deadline, full refund AND you keep the report
  when it arrives.

Guarantee 3 — "100% Upgrade Credit":
  Every dollar you spend counts toward the next tier. Buy the Case
  Decoder for $197, upgrade to the Intelligence Brief for just $800.
  Credits valid for 12 months.
```

**Hormozi math:** At 8% claim rate on 100 orders: $1,576 refunded against $19,700 revenue. But guarantee converts 30-40% more buyers = ~$8,000 incremental revenue. Guarantee is a profit center.

**UPL safety:** Guarantee is about work product quality, not case outcomes. "Find a gap" = information delivery. No outcome promises.

### C4: Swap CTA Priority

**Current hero CTAs (lines 237-250):**
```
Primary (amber filled):  "Get the Questions That Change Your Next Meeting — $197 →"
Secondary (bordered):     "See What We Found in a Real Case →"
```

**New:**
```
Primary (amber filled):  "See What We Found in a Real Case →"       → href="/sample"
Secondary (bordered):     "Get Your Case Decoder — $197 →"           → href="/checkout?tier=case-decoder"
```

**Why (Chaperon + Laja):** Defendant who's been burned by paying a professional will NOT spend $197 on trust alone. They need to see the product first. `/sample` converts visitors to believers. Believers convert to buyers.

**Trust ladder:** Cold visitor → sample report viewer → believer → buyer.

### C5: Bridge Language Update

**Current (lines 445-451):**
```
People like us don't just trust the system.
People like us read the discovery ourselves.
```

**New (Godin):**
```
People like us don't just trust the system.
People like us ask questions until we get answers.
```

**Why:** "Read the discovery" is intimidating to someone who doesn't know what discovery is. "Ask questions" includes everyone from day one. Also names the product mechanism.

### C6: Price Anchor Reframe

**Current value anchor cards (lines 590-615):**
```
Card 1: $10K-$100K+ — "You already paid your attorney this much"
Card 2: 1-20 years   — "What a conviction could cost you"
Card 3: $197-$9,997   — "What it costs to make sure your defense is real"
```

**New:**
```
Card 1: "Less than one hour"
  subtitle: "of your attorney's billing rate ($250-$500/hr)."
  desc: "For a full case analysis with 10-15 targeted questions."

Card 2: "$10K-$100K+"
  subtitle: "What you already paid your attorney."
  desc: "INA makes sure that money does what you paid for."

Card 3: "$197"
  subtitle: "Case Decoder. 48 hours."
  desc: "The questions your attorney needs to hear — whether they want to or not."
```

**Why (Hormozi):** Lead with hourly anchor (concrete, relatable). Then retainer anchor (emotional scale). Close with INA price as insurance.

**Michelle P. testimonial (lines 577-585):** Keep but move ABOVE the cards.

### C7: "What We Are NOT" Section

**New section. Insert after Discovery Document Reveal, before Urgency Bar.**

```jsx
<section className="px-4 py-10">
  <div className="mx-auto max-w-3xl">
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
      <p className="text-sm font-semibold text-amber-400 uppercase tracking-wider">
        Clear on what we are
      </p>
      <p className="mt-3 text-zinc-300">
        We are not a law firm. We do not give legal advice. We do not
        replace your attorney. We do not tell you what to do.
      </p>
      <p className="mt-2 text-zinc-300">
        We research your charge type and give you the questions your
        attorney needs to hear from you. That's it. That's all we do.
        And we do it better than anyone.
      </p>
    </div>
  </div>
</section>
```

**Why (Brunson):** DoNotPay disaster made people gun-shy about AI legal tools. Disarms skepticism. Doubles as UPL protection. Dreyer: "state it confidently, not defensively."

### C8: FAQ Reorder + Updates

**New FAQ order (lead with biggest objections):**

1. **"Is this legal? Am I allowed to do this?"** (NEW)
   Answer: "Absolutely. You have a constitutional right to understand your own case. INA provides legal research and questions — the same information available in any law library. We do not provide legal advice. Your attorney provides legal advice. We research. You ask."

2. **"Will asking these questions upset my attorney?"** (UPDATED)
   Answer: "The right attorneys welcome informed clients. The questions give you a way to find out which one you have. Defendants who come to meetings with specific, documented questions get more attorney time, more motions filed, and more thorough defense work. The questions don't create conflict — they create accountability."

3. **"What if my attorney retaliates or drops my case?"** (NEW)
   Answer: "An attorney cannot ethically drop your case simply because you ask informed questions. If they do, that itself is a disciplinary issue. Your questions are documented — they become part of the record of your defense."

4. "What if I don't have my discovery documents yet?" (keep)
5. "How fast do I get my report?" (keep)
6. "Can I get a refund?" (UPDATE to reflect "Find It or It's Free")
7. "What if my case is already too far along?" (keep)
8. "What's the Defense Playbook?" (keep)
9. "What if I already bought a lower tier?" (keep)

### C9: Final CTA Rewrite

**Current (lines 770-788):**
```
H2: You're up at 2am Googling your charges
    because nobody will explain anything to you — or anyone who loves you.
Body: Motions expire. Evidence disappears...
Tag: Be the defendant your attorney wasn't expecting.
CTA: Get the Questions That Change Your Next Meeting — $197 →
```

**New:**
```
H2: You're up at 2am because nobody will explain your case.
    You've called. You've emailed. You've waited.
    Now stop waiting. Start asking.
Body: Motions expire. Evidence disappears. Witnesses forget.
    But the defendant who walks in with the right questions?
    Their attorney starts filing motions that week.
Tag: Be the defendant your attorney wasn't expecting.  ← KEEP
Primary CTA: See What We Found in a Real Case →        → href="/sample"
Secondary: Ready to order? Get your Case Decoder — $197 →
```

### C10: Metadata Updates

**Meta title (line 49):**
```
Current: "ImNotAnAttorney — The Questions Your Attorney Hopes You Never Ask"
New:     "ImNotAnAttorney — Your Case File Has Answers. We Find Them."
```

**OG title (line 56):**
```
Current: "Your Lawyer Won't Call You Back. We Give You the Questions That Change Your Next Meeting."
New:     "Your Case File Has Answers Your Attorney Hasn't Mentioned. We Find Them. You Ask."
```

**OG description (line 57-58):**
```
Current: "You're scared. Confused. Nobody's explaining your case..."
New:     "Built by a defendant who found 68.3g of missing evidence his attorney
         never mentioned. We research your charges and give you the exact questions
         that hold your attorney accountable."
```

**Meta description (lines 51-52):**
```
Current: "Your lawyer won't call you back? We research your case..."
New:     "Your case file has answers your attorney hasn't mentioned. We research
         your charges and hand you the exact questions — starting at $197."
```

---

## 4. Detailed Component Changes

### E1: Discovery Document Reveal — PCSO-Authentic Format

**Purpose:** A scroll-triggered animation showing a pixel-accurate replica of a real PCSO (Pinellas County Sheriff's Office) supplement report with three findings highlighted in amber. Any defendant who has held their own discovery paperwork will instantly recognize the format — this IS what their paperwork looks like.

**Location:** Replaces the current static proof cards (lines 280-346). Same data, dramatically more powerful presentation.

**File:** New component at `src/components/motion/DiscoveryReveal.tsx`

**Why PCSO-authentic (Suby + Dunford):** "A real document excerpt showing a specific finding — the kind of thing the defendant recognizes from their own discovery packet. That image does more conversion work than any scroll sequence ever could." A defendant at 2 AM will see this and think "that looks like MY paperwork."

**Visual Design — Light Document on Dark Page:**
The document renders as a **light-background legal document** (cream/white paper) embedded in the dark zinc page. The contrast alone is striking — a bright official document floating in the dark.

**Exact PCSO Header Format (from real case SO22-401531):**
```
PINELLAS COUNTY SHERIFF'S OFFICE
PCSO - SUPPLEMENT  SO22-401531/20
Report Date:  ██/██/████
```

**Exact PCSO Footer Format:**
```
This report is property of PINELLAS COUNTY SHERIFF'S OFFICE.
Neither it nor its contents may be disseminated to unauthorized personnel.

██/██/████ ██:██:██                                          Page 4 of 71
```

**Behavior:**
1. As user scrolls into viewport, the document fades in (opacity 0 → 1, slight y translate)
2. Document styled as a real PCSO supplement page:
   - Light cream background (`bg-stone-50`) — like printed paper
   - Subtle shadow (`shadow-2xl`) to lift it off the dark page
   - Monospace font (`font-mono`) — real reports use Courier
   - Real PCSO header at top, real footer at bottom
   - Black redaction bars (`bg-black`) over names, addresses, dates
   - Standard field labels (Subject, Description, Telephones, etc.)
3. Three findings highlight sequentially as user scrolls:
   - `useScroll()` tracks scroll progress through the section
   - `useTransform()` maps scroll progress to opacity for each finding
   - Each finding: amber highlight bar appears over the relevant field area
   - Finding 1 at 20%: Property field — "Quantity: 93.9 GRAM" vs separate lab line "25.59 grams" → amber tag "[68.3g UNACCOUNTED]"
   - Finding 2 at 50%: Phone field — "(912) 380-XXXX" under two different Subject headers → amber tag "[DUAL ATTRIBUTION]"
   - Finding 3 at 80%: Drug Type — "AMPHETAMINE" vs lab "MDMA/MDA" → amber tag "[FATAL VARIANCE]"
4. Below document: "He found these in his own case. We find them in yours."
5. Links to /sample and /about below

**PCSO-Authentic Document Layout:**
```
┌─────────────────────────────────────────────────────┐
│  PINELLAS COUNTY SHERIFF'S OFFICE                   │  ← real header, mono
│  PCSO - SUPPLEMENT  SO22-401531/20                  │
│  Report Date:  ██/██/████                           │  ← redacted date
│                                                     │
│  Subject #█ - SUSPECT #1 - ████████, █████ █        │  ← redacted name
│                                                     │
│  Description:   TRAFFICKING IN ██████████████       │
│                                                     │
│  Property Details                                   │
│  ┌───────────────────────────────────────────┐      │
│  │ Quantity:   93.9                          │      │
│  │ Drug UOM:   GRAM                         │      │
│  │ Lab Result: 25.59 grams                  │      │
│  │ ▶ [68.3g UNACCOUNTED]                    │ ← amber highlight, 20%
│  └───────────────────────────────────────────┘      │
│                                                     │
│  Telephones / E-Addresses                           │
│  ┌───────────────────────────────────────────┐      │
│  │ SUBJECT'S PHONE  (912) 380-XXXX          │      │
│  │ ...                                      │      │
│  │ Subject #█ - CONFIDENTIAL INFORMANT #1   │      │
│  │ RELATED          (912) 380-XXXX          │      │
│  │ ▶ [DUAL ATTRIBUTION — Same phone,       │ ← amber highlight, 50%
│  │    two subjects]                          │      │
│  └───────────────────────────────────────────┘      │
│                                                     │
│  Drug Type:  AMPHETAMINE                            │
│  Lab Found:  MDMA / MDA                             │
│  ┌───────────────────────────────────────────┐      │
│  │ ▶ [FATAL VARIANCE — Charged substance    │ ← amber highlight, 80%
│  │    does not match lab results]             │      │
│  └───────────────────────────────────────────┘      │
│                                                     │
│  ████████████████████████████████████████████████    │  ← redacted paragraph
│  ████████████████████████████████████████            │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  This report is property of PINELLAS COUNTY         │
│  SHERIFF'S OFFICE.  Neither it nor its contents     │
│  may be disseminated to unauthorized personnel.     │
│                                                     │
│  ██/██/████ ██:██:██                  Page 4 of 71  │
└─────────────────────────────────────────────────────┘
```

**Props:** None (self-contained — founder's case, doesn't change)

**Reduced motion fallback:** All three findings shown statically, no scroll tracking, standard `FadeInUp` entrance.

**Dimensions:**
- Container: `max-w-2xl mx-auto`
- Document: `bg-stone-50 text-zinc-900 shadow-2xl rounded-sm` (sharp corners like real paper)
- Document height: `min-h-[500px]` desktop, `min-h-[380px]` mobile
- Internal padding: `p-6 md:p-10`
- Font: `font-mono text-xs md:text-sm` for authentic Courier look
- Redaction bars: `bg-black h-4 inline-block rounded-none` with varying widths
- Finding highlight areas: `bg-amber-100 border-l-4 border-amber-500 px-3 py-2` (light amber on cream bg)
- Finding tags: `text-amber-700 font-bold` (dark amber for readability on light bg)

**Accessibility:**
- Container: `role="img"` + `aria-label`
- All text is real DOM text (screen-reader accessible)
- Focus not applicable (non-interactive element)

### E2: Process Timeline Enhancement

**Purpose:** Enhanced "How It Works" section. Mechanical and reliable feel — a pipeline, not magic.

**Location:** Replaces current section (lines 460-498). Inline changes in `page.tsx`.

**Visual changes (CSS only, no new component):**
1. Add connecting line between steps:
   - Desktop: horizontal line at step circle level (`after` pseudo-element on grid)
   - Mobile: vertical line on left side
2. Steps get left accent borders:
   - Step 01: `border-l-2 border-zinc-700` (input state)
   - Step 02: `border-l-2 border-amber-500/50` (processing state)
   - Step 03: `border-l-2 border-amber-400` (output state)
3. Delivery badges on steps 02 and 03

**Copy updates:**

| Current | New |
|---------|-----|
| "Tell us about your case" | "Submit your charges" |
| Step 01 long desc | "Your charges, your stage, what your attorney has or hasn't done. 10 minutes." |
| "We research everything" | "We research overnight" |
| Step 02 long desc | "Your case analyzed through 40+ elite defense methodologies. Chain of custody. Informant credibility. Constitutional frameworks. Every angle your attorney should be covering." |
| "You ask the questions" | "You walk in armed" |
| Step 03 long desc | "A custom report with pointed, case-specific questions. Bring them to your next meeting. Your attorney now knows you're paying attention." |

**Badges (new):**
```jsx
// After step 02 title:
<span className="mt-2 inline-block text-xs bg-amber-500/10 text-amber-400 px-2 py-1 rounded">
  48 hours
</span>

// After step 03 title:
<span className="mt-2 inline-block text-xs bg-amber-500/10 text-amber-400 px-2 py-1 rounded">
  10-15 questions
</span>
```

**No scroll-driven animation for this section** — keep existing StaggerContainer fade-in. Process should feel solid and static (Suby: "mechanical and reliable").

### E3: Charge-Type Selector

**Purpose:** Personalize the hero for the visitor's specific charge type.

**Location:** Insert into hero section, between subheadline and CTAs (after line 235, before line 236)

**File:** New component at `src/components/ChargeTypeSelector.tsx`

**Visual layout:**
```
Desktop:  [ DUI ]  [ Drug Charge ]  [ Federal Case ]  [ Other ]
Mobile:   [ DUI         ] [ Drug Charge  ]
          [ Federal Case ] [ Other        ]
```

**Behavior:**
1. Four buttons, initially all unselected (zinc borders)
2. On click: selected button gets amber styling, one-liner appears below with fade
3. One-liners provide charge-specific urgency + proof:

| Charge | One-liner |
|--------|-----------|
| DUI | "Your DMV hearing deadline may be 7 days away. We've found breathalyzer calibration gaps, field sobriety test failures, and chain of custody breaks in DUI cases." |
| Drug Charge | "We've found weight discrepancies, substance misidentification, and chain of custody breaks in drug cases. 48-hour decision window." |
| Federal Case | "Federal cases move fast. We analyze discovery, identify Brady violations, and generate questions about informant credibility and surveillance protocols." |
| Other | "From probation violations to white collar charges — we research every case type and find what your attorney may have missed." |

**Technical implementation:**
```tsx
"use client";

import { useState } from "react";

const charges = [
  { id: "dui", label: "DUI", oneLiner: "..." },
  { id: "drug", label: "Drug Charge", oneLiner: "..." },
  { id: "federal", label: "Federal Case", oneLiner: "..." },
  { id: "other", label: "Other", oneLiner: "..." },
];

export function ChargeTypeSelector() {
  const [selected, setSelected] = useState<string | null>(null);
  // ... render buttons + one-liner
}
```

**Styling:**
- Unselected: `rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-sm font-semibold text-zinc-400 hover:border-zinc-600 transition-all cursor-pointer`
- Selected: `rounded-lg border border-amber-500 bg-amber-500/5 px-4 py-2 text-sm font-semibold text-amber-400 transition-all cursor-pointer`
- Container: `flex flex-wrap gap-3 justify-center` (desktop) / `grid grid-cols-2 gap-3` (mobile)
- One-liner: `mt-3 text-sm text-zinc-400 text-center transition-opacity` with opacity animation

**Accessibility:**
- Container: `role="radiogroup"` + `aria-label="Select your charge type"`
- Each button: `role="radio"` + `aria-checked={selected === id}`
- Keyboard: `onKeyDown` handler for arrow key navigation
- Focus styles inherited from globals.css

### E4: Guarantee Badge in TrustBadges

**File:** `src/components/TrustBadges.tsx` (line 9-34)

**Change:** Add fourth item to `badges` array:

```tsx
{
  icon: (
    <svg className="h-5 w-5" aria-hidden="true" fill="none" viewBox="0 0 24 24"
         stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955
               11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29
               9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  label: "Find It or It's Free",
},
```

---

## 5. New Section Order

### Current Order
1. Hero (H1 + CTAs)
2. Proof (3 static finding cards)
3. Urgency Bar
4. Pain Points (5 frustrations + inline testimonials)
5. Bridge
6. How It Works (3 steps)
7. Attorney Methodologies (6 cards)
8. Value Anchor
9. Testimonials Grid
10. Guarantee
11. Pricing
12. Lead Capture
13. FAQ
14. Final CTA

### New Order
1. **Hero** — New H1 [C1], origin story sub [C2], charge selector [E3], swapped CTAs [C4]
2. **Discovery Document Reveal** [E1] — Replaces static proof cards
3. **What We Are NOT** [C7] — NEW section
4. **Urgency Bar** — unchanged
5. **Pain Points** — unchanged (5 frustrations + inline testimonials)
6. **Bridge** — Updated text [C5]
7. **Process Timeline** [E2] — Enhanced How It Works
8. **Attorney Methodologies** — unchanged
9. **Value Anchor** — Reframed [C6]
10. **Testimonials Grid** — unchanged
11. **Guarantee** — "Find It or It's Free" [C3]
12. **Pricing** — unchanged, updated TrustBadges [E4]
13. **Lead Capture** — unchanged
14. **FAQ** — Reordered + new questions [C8]
15. **Final CTA** — Rewritten [C9]

### What Changed
- Section 2: Static proof cards → Discovery Document Reveal (same data, animated)
- Section 3: NEW "What We Are NOT" inserted
- All other sections maintain relative position

---

## 6. Files Summary

| File | Action | Estimated Lines Changed |
|------|--------|------------------------|
| `src/app/page.tsx` | Major edit | ~200 lines of copy changes across existing sections |
| `src/components/motion/DiscoveryReveal.tsx` | Create | ~120-150 lines |
| `src/components/ChargeTypeSelector.tsx` | Create | ~70-90 lines |
| `src/components/TrustBadges.tsx` | Minor edit | +12 lines (new badge) |

**No new npm dependencies.** All animation uses Framer Motion v12.35.2.

---

## 7. Performance Constraints

- No new packages
- No Three.js, GSAP, or canvas
- No background video
- No image assets for DiscoveryReveal (pure CSS)
- ChargeTypeSelector is lightweight (no API calls, local state only)
- Bundle impact: <2KB gzipped for both new components combined

---

## 8. Mobile Considerations

- Hero: Charge selector renders as 2x2 grid on mobile
- Discovery Reveal: Same scroll behavior, height ~300px (vs ~400px desktop)
- Process Timeline: Steps stack vertically (existing `md:grid-cols-3`)
- StickyMobileCTA: Out of scope (noted in section 10)

---

## 9. Accessibility Checklist

- [ ] DiscoveryReveal respects `useReducedMotion()` — static fallback
- [ ] ChargeTypeSelector: `role="radiogroup"` + keyboard navigation
- [ ] All new text: sufficient contrast (zinc-300+ on zinc-900 = WCAG AA)
- [ ] Amber-400 on zinc-900: passes WCAG AA for large text (4.64:1)
- [ ] No content hidden behind animation
- [ ] `aria-label` on document reveal
- [ ] Focus-visible inherited from globals.css

---

## 10. Out of Scope (Separate Tasks)

These were recommended by experts but are separate initiatives:

1. Email sequence changes (Chaperon) — origin story to Day 1.5 of crisis sequence
2. StickyMobileCTA CTA update — match hero primary
3. `/for-attorneys` page (Dreyer) — positions INA as helpful to good attorneys
4. Charge Decoder instant lookup (Hormozi) — free tool
5. Attorney Communication Template bonus (Hormozi) — free with Case Decoder
6. Google Search Console connection (Dreyer)
7. Reddit account creation (Dreyer, Laja)
8. $397 Attorney Accountability Pack (Hormozi) — new product tier

---

## 11. Testing Plan

### Before deployment
- [ ] Visual QA: Desktop (1440px, 1920px) + Mobile (375px, 414px)
- [ ] DiscoveryReveal: scroll behavior on Chrome, Safari, Firefox
- [ ] DiscoveryReveal: reduced motion fallback
- [ ] ChargeTypeSelector: keyboard navigation (Tab, arrows, Enter)
- [ ] TrustBadges: new badge in all 3 variants
- [ ] FAQ schema: JSON-LD validation
- [ ] OG tags: validate with opengraph.xyz
- [ ] TypeScript: `npx tsc --noEmit --skipLibCheck`

### After deployment
- [ ] Google Search Console: monitor impressions/CTR
- [ ] Click tracking: sample page vs checkout ratio

---

*Informed by 8 expert consultations conducted 2026-03-18. All 8 converged on the same direction — no areas of disagreement.*
