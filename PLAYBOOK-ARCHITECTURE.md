# Playbook Landing Page Architecture

**Last Updated:** 2026-03-26

## Overview

The INAA-web playbook system is a modular, data-driven architecture for creating charge-specific defense playbook sales pages. All pages share the same layout component (`PlaybookSalesPage.tsx`), configured via data objects in `playbook-configs.ts`.

**Current Status:** 8 playbook configs defined. DUI First Offense is `live: true`; others in test mode.

---

## Directory Structure

```
src/
├── app/
│   ├── playbooks/
│   │   └── page.tsx                 # Catalog page: /playbooks (all live playbooks)
│   └── playbook/
│       └── [slug]/
│           ├── page.tsx             # Dynamic playbook sales page: /playbook/[slug]
│           └── opengraph-image.tsx  # OG image generator
│
├── components/
│   ├── PlaybookSalesPage.tsx        # Shared sales page component (long-form funnel)
│   └── PlaybookCTA.tsx              # In-blog CTA (DUI only, $97 direct link)
│
├── lib/
│   ├── playbook-configs.ts          # 8 PlaybookConfig objects (single source of truth)
│   └── tiers.ts                     # Pricing + product metadata (cross-referenced)
│
└── app/
    └── page.tsx                     # Homepage (mentions playbooks, links to /playbooks)

public/
└── covers/
    ├── dui-first-offense/
    │   ├── thumbnail.png            # Hero cover image (sales page)
    │   └── emergency-thumbnail.png  # Emergency playbook cover
    ├── drug-possession/
    ├── drug-trafficking/
    ├── federal-criminal/
    ├── probation-violation/
    ├── self-defense/
    ├── sex-offense/
    └── white-collar/
```

---

## Data Model: PlaybookConfig

**File:** `src/lib/playbook-configs.ts`

Every playbook is a `PlaybookConfig` object. This is the single source of truth for all charge-specific copy.

### Interface Definition

```typescript
export interface PlaybookConfig {
  /** Tier slug — must match tiers.ts key */
  slug: TierSlug;

  /** SEO title (browser tab) */
  seoTitle: string;

  /** SEO description (meta + OG) */
  seoDescription: string;

  /** Hero section */
  hero: {
    coverImage?: string;      // Path: /public/covers/[slug]/thumbnail.png
    eyebrow: string;          // e.g., "DUI Defense Playbook"
    headline: string;         // Main headline
    subheadline: string;      // What's included summary
  };

  /** Agitate section — pain points */
  agitate: {
    headline: string;         // Section heading
    paragraphs: string[];     // 2-3 empathetic paragraphs
    cards: Array<{            // 3 pain point cards
      title: string;
      text: string;
    }>;
  };

  /** Proof section — methodology cards */
  proof: {
    headline: string;
    methods: Array<{          // 3 defense methodology cards
      name: string;           // Methodology name
      title: string;          // Subheading (e.g., "Foundation of...")
      insight: string;        // How this applies to defense
    }>;
  };

  /** Value stack — what's inside */
  valueStack: {
    sections: Array<{         // 6 components included in playbook
      title: string;
      desc: string;
      value: string;          // Strikethrough value (e.g., "$97")
    }>;
    totalValue: string;       // Total strikethrough value (e.g., "$882")
  };

  /** Guarantee copy */
  guarantee: {
    headline: string;         // e.g., "5 questions you never thought to ask — or full refund."
    body: string;
  };

  /** Who it's for */
  audience: {
    forYou: string[];         // 5 bullet points (with ✓)
    notForYou: string[];      // 4 bullet points (with ✗)
  };

  /** Methodology disclosure — charge-specific wording */
  methodologyText: string;

  /** Urgency deadlines */
  urgency: {
    headline: string;
    items: Array<{
      deadline: string;       // e.g., "10 days after arrest"
      what: string;           // What happens at this deadline
    }>;
  };

  /** FAQ items */
  faq: Array<{ q: string; a: string }>;

  /** Final CTA — comparison line */
  comparisonLine: string;     // e.g., "A 30-minute attorney consultation costs $150–$250."

  /** Summary line for final CTA */
  summaryLine: string;        // e.g., "Two books, instant download. 26 questions..."
}
```

### Defined Configs (8 total)

| Slug | Name | Price | Status | Cover Image |
|------|------|-------|--------|-------------|
| `dui-first-offense` | DUI Defense Playbook | $97 | LIVE | ✓ |
| `drug-possession` | Drug Possession Defense Playbook | $97 | TEST | ✓ |
| `drug-trafficking` | Drug Trafficking Defense Playbook | $197 | TEST | ✓ |
| `probation-violation` | Probation Violation Defense Playbook | $97 | TEST | ✓ |
| `white-collar` | White Collar Defense Playbook | $197 | TEST | ✓ |
| `sex-offense` | Sex Offense Defense Playbook | $297 | TEST | ✓ |
| `federal-criminal` | Federal Criminal Defense Playbook | $297 | TEST | ✓ |
| `self-defense` | Self-Defense / Justifiable Force Defense Playbook | $97 | TEST | ✓ |

**Live Status:** Controlled by `TIER_CORE[slug].live` in `src/lib/tiers.ts`. When `live: true`, the playbook appears in `/playbooks` catalog and Stripe uses live keys.

---

## Page Routes & Components

### 1. Playbooks Catalog (`/playbooks`)

**File:** `src/app/playbooks/page.tsx`

A browsable grid of all live playbooks. Users select their charge type here before viewing the sales page.

#### Page Structure
- **Hero Section** — "Defense Playbooks" heading with value prop
- **Card Grid** — 4 columns desktop, 2 columns tablet, 1 column mobile
  - Each card links to `/playbook/[slug]`
  - Shows charge type, description (truncated), price, delivery badge
- **Value Props Section** — 6 icons + copy (26 Questions, Roadmap, Red Flags, Scorecard, Emergency Guide, Upgrade Path)
- **UPL Disclaimer** — "These playbooks provide legal information, not legal advice"

#### Key Features
- **Live-only filtering:** Only displays playbooks where `TIER_CORE[slug].live === true`
- **Display order:** Hard-coded in `DISPLAY_ORDER` array (most common charge types first)
- **Description source:** Pulls `config.hero.subheadline` from each playbook config
- **Responsive grid:** Auto-adjusts columns via Tailwind breakpoints

#### Metadata
```typescript
title: "Defense Playbooks — $97 Instant Download for Every Charge Type | ImNotAnAttorney"
description: "Choose your charge type and get an instant-download defense playbook..."
canonical: https://imnotanattorney.com/playbooks
```

---

### 2. Individual Playbook Sales Page (`/playbook/[slug]`)

**File:** `src/app/playbook/[slug]/page.tsx`
**Component:** `src/components/PlaybookSalesPage.tsx`

A long-form, conversion-optimized sales funnel. All charge-type-specific copy comes from the `PlaybookConfig` passed to `PlaybookSalesPage`.

#### Page Structure (in order)

1. **Hero** — Eyebrow, headline, price, CTA buttons, cover image
   - Primary CTA: "Get Instant Access — $[price]"
   - Secondary CTA: "2 payments of $[price/2]"
   - Delivery promise: "Download within 60 seconds"

2. **Two-Book Split** — Visual breakdown of Emergency Playbook vs. Full Defense Playbook
   - Book 1 (red): "What to do right now. First 72 Hours..."
   - Book 2 (gold): "The complete reference. Case stage roadmap..."

3. **Agitate** — Pain points (headline + 3 paragraphs + 3 cards)
   - Validates prospect's situation with empathetic copy
   - Cards highlight the problem this playbook solves

4. **Proof** — 3 methodology cards with defense attorney attributions
   - Each card: name, title, insight
   - Builds credibility through documented defense strategies

5. **Value Stack** — 6 components included + total strikethrough value
   - Shows individual component values (strikethrough)
   - Displays final price and total value comparison

6. **Guarantee** — Risk-reversal copy (refund + credit policy)
   - Headline + detailed body copy

7. **Who It's For** — Two-column audience split
   - "This is for you if..." (5 checkmarks)
   - "This is NOT for you if..." (4 X marks)

8. **Methodology Disclosure** — UPL compliance disclaimer
   - Confirms playbook provides INFORMATION, not ADVICE

9. **Urgency** — Time-sensitive deadlines specific to charge type
   - Base deadlines from config
   - Dynamic deadline: "30 days from purchase" (upgrade credit expiry)

10. **FAQ** — Accordion with dynamically injected items
    - Base FAQs from config
    - Dynamic FAQ items added:
      - "What if I need something more personalized?"
      - "[Tier] vs. [Next Tier]?" (if upgrade path exists)

11. **Final CTA** — Comparison line + price + summary + buttons
    - Mirrors Hero CTA but with different framing

12. **Upgrade Path** — (Conditional) Link to next tier if available
    - Shows upgrade price (with credit deduction)
    - 30-day expiry on credit

13. **Exit Capture** — (DUI only, hardcoded)
    - Free 72-Hour Emergency Checklist lead magnet
    - Component: `LeadCapture` with upsell to full playbook

#### Dynamic Features

**Upgrade Path Calculation:**
- `nextTierSlug()` determines if a higher tier exists
- `upgradePrice()` calculates: `nextTier.price - currentTier.price`
- Injected into FAQ and Urgency sections dynamically
- Only shown if upgrade is available and `nextTier` exists

**Metadata Generation:**
```typescript
title: "${tier.name} — ${tier.priceDisplay} Instant Download | ImNotAnAttorney"
description: config.seoDescription
canonical: https://imnotanattorney.com/playbook/[slug]
```

**Schema Markup:** Two `<script type="application/ld+json">` blocks
- **BreadcrumbList** — Home > Playbooks > [Charge Type]
- **Product** — Stripe offer, shipping, return policy
- **FAQPage** — All FAQ items for rich snippets

---

### 3. Homepage Reference (`src/app/page.tsx`)

The homepage does NOT have a dedicated playbooks section, but:
- Mentions playbooks in pricing table
- Links to `/playbooks` catalog
- Playbooks ($97) are entry-point tier for new visitors

---

## Component Breakdown

### PlaybookSalesPage.tsx

**Location:** `src/components/PlaybookSalesPage.tsx` (475 lines)

**Props:**
```typescript
interface Props {
  config: PlaybookConfig;
}
```

**Key Logic:**
```typescript
// Tier lookup
const tier = TIER_CORE[config.slug];

// Upgrade calculation
const nextSlug = nextTierSlug(config.slug);
const upgrade = upgradePrice(config.slug);

// Dynamic urgency items
const urgencyItems = [
  ...config.urgency.items,
  ...(nextTier && upgrade ? [{ deadline: "30 days from purchase", what: "..." }] : [])
];

// Dynamic FAQ items
const faqItems = [
  ...config.faq,
  ...(nextTier && upgrade ? [upgrade-related FAQs] : [])
];
```

**Sub-components Used:**
- `FadeInUp` — Scroll reveal animations
- `StaggerContainer / StaggerItem` — Staggered animations on card grids
- `TrustBadges` — Credibility badges (compact + checkout variants)
- `LeadCapture` — Lead magnet (DUI only)
- `Link` from `next/link` — Client routing

---

### PlaybookCTA.tsx

**Location:** `src/components/PlaybookCTA.tsx` (45 lines)

**Purpose:** In-blog CTA for DUI blog posts. Appears above `BlogCTA` on DUI-category articles.

**Features:**
- Links to `/playbook/dui-first-offense`
- Secondary link to case-decoder upgrade
- Shows credit policy ("$97 is fully credited...")

---

## Pricing & Tiers Integration

**File:** `src/lib/tiers.ts`

All playbook pricing and metadata lives here. Playbook configs reference this as source of truth.

**Example Tier Entry:**
```typescript
"dui-first-offense": {
  slug: "dui-first-offense",
  name: "DUI Defense Playbook",
  price: 9700,  // cents
  priceDisplay: "$97",
  delivery: "Instant Download",
  isDigitalProduct: true,
  live: true,   // Controls visibility in /playbooks + Stripe mode
}
```

**Key Functions Used by PlaybookSalesPage:**
- `nextTierSlug(slug)` — Returns next tier in upgrade path, or null
- `upgradePrice(slug)` — Returns cost difference with credit applied
- `TIER_CORE[slug]` — Direct tier lookup

---

## File & Copy Management

### To Edit Playbook Copy

**Edit these files in this order:**

1. **Charge-specific copy** → `src/lib/playbook-configs.ts`
   - Hero, agitate, proof, value stack, guarantee, audience, urgency, FAQ
   - Price reference comes from tiers.ts automatically

2. **Pricing/metadata** → `src/lib/tiers.ts`
   - Price, delivery, live status, tier name
   - Playbook config references this via slug

3. **Images** → `public/covers/[slug]/thumbnail.png`
   - Must match cover image path in hero section

4. **Blog CTAs** → `src/components/PlaybookCTA.tsx`
   - Only for DUI currently; update if adding more charge types to blog

### To Add a New Playbook

1. **Add tier in tiers.ts:**
   ```typescript
   "new-charge-type": {
     slug: "new-charge-type",
     name: "New Charge Type Defense Playbook",
     price: 9700,
     priceDisplay: "$97",
     delivery: "Instant Download",
     isDigitalProduct: true,
     live: false,  // Start in test mode
   }
   ```

2. **Add config in playbook-configs.ts:**
   ```typescript
   export const NEW_CHARGE_TYPE: PlaybookConfig = {
     slug: "new-charge-type",
     seoTitle: "...",
     seoDescription: "...",
     hero: { ... },
     agitate: { ... },
     // ... all required fields
   };
   ```

3. **Add to PLAYBOOK_CONFIGS export object:**
   ```typescript
   export const PLAYBOOK_CONFIGS: Record<TierSlug, PlaybookConfig> = {
     // ...
     "new-charge-type": NEW_CHARGE_TYPE,
   };
   ```

4. **Add to DISPLAY_ORDER in playbooks/page.tsx:**
   ```typescript
   const DISPLAY_ORDER: TierSlug[] = [
     "dui-first-offense",
     // ...
     "new-charge-type",  // Add in order of frequency
   ];
   ```

5. **Create cover images:**
   - `public/covers/new-charge-type/thumbnail.png`
   - `public/covers/new-charge-type/emergency-thumbnail.png`
   - `public/covers/new-charge-type/emergency-thumbnail-small.png`

6. **Set live: true in tiers.ts** when ready to show in catalog

---

## SEO & Schema Strategy

### Catalog Page (`/playbooks`)

- **Title:** Multi-keyword (includes charge types + price)
- **Meta description:** Long-tail (26 questions, roadmap, checklist, scorecard)
- **H1:** "Defense Playbooks"
- **Schema:** (None currently — could add CollectionPage)

### Individual Sales Pages (`/playbook/[slug]`)

- **Title:** "[Charge Type] — $[Price] Instant Download | ImNotAnAttorney"
- **Meta description:** Pulled from `config.seoDescription`
- **H1:** Headline from `config.hero.headline`
- **Schema (injected in page.tsx):**
  - **BreadcrumbList** — Home > Playbooks > [Charge Type]
  - **Product** — Full offer schema (price, availability, shipping, returns)
  - **FAQPage** — All FAQ items for rich snippets

### Homepage Integration

- Links to `/playbooks` as entry point
- "Defense Playbooks" in pricing comparison
- No dedicated playbook section on homepage

---

## User Journey

```
Traffic Sources
(Reddit, Google DUI, Blog)
         ↓
    Homepage (/)
         ↓
    /playbooks (catalog, select charge type)
         ↓
    /playbook/[slug] (sales page, long-form funnel)
         ↓
    /checkout?tier=[slug] (Stripe checkout)
         ↓
    Email delivery (automatic via Resend)
```

**Alternative Entry Point:**
- DUI blog post → PlaybookCTA → `/playbook/dui-first-offense`

---

## Testing & Deployment

### Deploy Checklist for New Playbook

- [ ] Copy written & reviewed for UPL compliance
- [ ] Cover images created (3x: regular + 2x emergency sizes)
- [ ] Tier added to `tiers.ts` with `live: false`
- [ ] PlaybookConfig added to `playbook-configs.ts`
- [ ] PLAYBOOK_CONFIGS export updated
- [ ] DISPLAY_ORDER updated in playbooks/page.tsx
- [ ] E2E test: Visit `/playbook/[slug]` → verify rendering
- [ ] E2E test: Visit `/playbooks` → playbook NOT visible yet
- [ ] E2E test: All dynamic features (upgrade path, FAQ injection)
- [ ] Set `live: true` in tiers.ts
- [ ] Deploy via `git push origin master`
- [ ] Verify `/playbooks` now shows playbook
- [ ] Verify Stripe mode matches intent (live/test)

---

## Known Limitations & Future

### Current Constraints
- **Exit capture (DUI only):** Hardcoded in PlaybookSalesPage line 411
  - To add to other charge types: extract to config + conditional render
- **PlaybookCTA.tsx (DUI only):** Would need to be refactored to support multiple charge types
- **Blog category filtering:** Currently tied to DUI; would need generalization

### Possible Enhancements
- **A/B testing:** Different hero headlines or value props per traffic source
- **Personalization:** Render different copy based on referrer (Reddit vs. Google)
- **Multi-tier comparison:** Show DUI vs. Drug Possession side-by-side on catalog page
- **Playbook preview:** Public sample PDF or single question preview

---

## Quick Reference: File Map

| What | Where | Type |
|------|-------|------|
| All playbook copy | `src/lib/playbook-configs.ts` | Data |
| Playbook list page | `src/app/playbooks/page.tsx` | Page |
| Individual sales pages | `src/app/playbook/[slug]/page.tsx` | Page |
| Sales page layout | `src/components/PlaybookSalesPage.tsx` | Component |
| Blog playbook CTA | `src/components/PlaybookCTA.tsx` | Component |
| Pricing metadata | `src/lib/tiers.ts` | Data |
| Cover images | `public/covers/[slug]/` | Assets |

---

## Important Notes

1. **Single source of truth:** All playbook copy lives in PlaybookConfig. Change it once, it updates everywhere.
2. **Dynamic rendering:** PlaybookSalesPage renders from config. No per-charge-type component files needed.
3. **Upgrade crediting:** Automatic via `upgradePrice()` and `nextTierSlug()` functions.
4. **UPL compliance:** Every page includes methodology disclaimer. Verify before launching.
5. **Live status:** Control visibility via `TIER_CORE[slug].live` in tiers.ts. No code changes needed.
