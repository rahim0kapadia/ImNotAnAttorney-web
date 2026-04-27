# OG Images for All Pages, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page on imnotanattorney.com gets a unique Open Graph image so link previews show page-specific titles instead of the generic brand card.

**Architecture:** Shared `renderOgImage()` template in `src/lib/og-template.tsx`. Each route gets a thin `opengraph-image.tsx` wrapper (~12 lines) that imports the template and passes page-specific title/subtitle. Dynamic routes use the same data sources as their sibling `page.tsx`. Next.js auto-uses OG image for Twitter cards, no separate `twitter-image.tsx` needed.

**Tech Stack:** Next.js `ImageResponse` (from `next/og`), Edge runtime for static pages, Node runtime for pages needing local data imports.

**Scope:** 28 new `opengraph-image.tsx` files + 1 shared template + 3 missing metadata fixes.

---

### Task 1: Create shared OG template

**Files:**
- Create: `src/lib/og-template.tsx`

- [ ] **Step 1: Create the shared template**

```tsx
// src/lib/og-template.tsx
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

interface OgTemplateProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
}

export function renderOgImage({ title, subtitle, eyebrow }: OgTemplateProps) {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #09090b 0%, #18181b 50%, #09090b 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px",
        }}
      >
        <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>
          <span style={{ color: "#ffffff" }}>Im</span>
          <span style={{ color: "#f59e0b" }}>Not</span>
          <span style={{ color: "#ffffff" }}>AnAttorney</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {eyebrow && (
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "#f59e0b",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 16,
              }}
            >
              {eyebrow}
            </div>
          )}
          <div
            style={{
              fontSize: title.length > 40 ? 42 : 52,
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.2,
              maxWidth: 900,
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={{
                fontSize: 24,
                color: "#a1a1aa",
                marginTop: 20,
                maxWidth: 800,
                lineHeight: 1.4,
              }}
            >
              {subtitle.length > 100 ? subtitle.slice(0, 100) + "..." : subtitle}
            </div>
          )}
        </div>
        <div style={{ display: "flex", fontSize: 18, color: "#52525b" }}>
          imnotanattorney.com &bull; Know What They Know.
        </div>
      </div>
    ),
    { ...OG_SIZE }
  );
}
```

- [ ] **Step 2: Verify type check**

Run: `npx tsc , noEmit , skipLibCheck`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/lib/og-template.tsx
git commit -m "feat(og): add shared OG image template for site-wide social previews"
```

---

### Task 2: Fix missing metadata on 3 pages

**Files:**
- Modify: `src/app/partners/page.tsx`, add metadata export
- Modify: `src/app/partners/bondsman/page.tsx`, add metadata export
- Create: `src/app/partner/login/layout.tsx`, add metadata (page.tsx is `"use client"`)

These pages currently export NO metadata at all.

- [ ] **Step 1: Add metadata to `/partners`**

Add near top of `src/app/partners/page.tsx` (after imports):

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Become a Partner",
  description: "Join the ImNotAnAttorney partner program. Earn commission on every referral while helping defendants get the legal research they need.",
};
```

- [ ] **Step 2: Add metadata to `/partners/bondsman`**

Add near top of `src/app/partners/bondsman/page.tsx` (after imports):

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bail Bond Partner Program",
  description: "Partner with ImNotAnAttorney to help your clients prepare for court. Free court reminders, compliance tools, and commission on referrals.",
};
```

- [ ] **Step 3: Create layout.tsx for `/partner/login`**

The page is a client component (`"use client"`) so metadata goes in a layout:

```tsx
// src/app/partner/login/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Partner Login",
  description: "Log in to your ImNotAnAttorney partner dashboard. Manage referrals, track commissions, and access compliance tools.",
};

export default function PartnerLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

- [ ] **Step 4: Verify type check**

Run: `npx tsc , noEmit , skipLibCheck`
Expected: clean

- [ ] **Step 5: Commit**

```bash
git add src/app/partners/page.tsx src/app/partners/bondsman/page.tsx src/app/partner/login/layout.tsx
git commit -m "fix(seo): add missing metadata to partner landing pages"
```

---

### Task 3: OG images, Marketing pages (7 files)

**Files to create:**
- `src/app/partners/opengraph-image.tsx`
- `src/app/partners/bondsman/opengraph-image.tsx`
- `src/app/about/opengraph-image.tsx`
- `src/app/contact/opengraph-image.tsx`
- `src/app/resources/opengraph-image.tsx`
- `src/app/family/opengraph-image.tsx`
- `src/app/idd/opengraph-image.tsx`

Each file follows this pattern (only title/subtitle/eyebrow differ):

- [ ] **Step 1: Create all 7 files**

`src/app/partners/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "Become a Partner, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({
    title: "Become a Partner",
    subtitle: "Earn commission on every referral. Help defendants get the research they need.",
  });
}
```

`src/app/partners/bondsman/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "Bail Bond Partner Program, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({
    title: "Bail Bond Partner Program",
    subtitle: "Court reminders, compliance tools, and commission on referrals for your clients.",
  });
}
```

`src/app/about/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "About, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({
    title: "Built by Defendants, for Defendants",
    subtitle: "We close the information gap between you and everyone else in the courtroom.",
  });
}
```

`src/app/contact/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "Contact Us, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({ title: "Contact Us", subtitle: "Questions about your case research? We're here to help." });
}
```

`src/app/resources/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "Free Resources, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({ title: "Free Resources", subtitle: "Guides, checklists, and templates for criminal defendants." });
}
```

`src/app/family/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "Family Support, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({
    title: "Your Family Member Was Arrested",
    subtitle: "Here's how you can actually help, not just wait.",
  });
}
```

`src/app/idd/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "IDD Scholarship, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({
    title: "IDD Scholarship Program",
    subtitle: "Free defense research for defendants who cannot afford it.",
  });
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc , noEmit , skipLibCheck`

- [ ] **Step 3: Commit**

```bash
git add src/app/partners/opengraph-image.tsx src/app/partners/bondsman/opengraph-image.tsx src/app/about/opengraph-image.tsx src/app/contact/opengraph-image.tsx src/app/resources/opengraph-image.tsx src/app/family/opengraph-image.tsx src/app/idd/opengraph-image.tsx
git commit -m "feat(og): add OG images for marketing pages"
```

---

### Task 4: OG images, Services & products (5 files)

**Files to create:**
- `src/app/services/opengraph-image.tsx`
- `src/app/playbooks/opengraph-image.tsx`
- `src/app/sample/opengraph-image.tsx`
- `src/app/sample-xray/opengraph-image.tsx`
- `src/app/start/opengraph-image.tsx`

- [ ] **Step 1: Create all 5 files**

`src/app/services/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "Defense Intelligence Services, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({
    title: "Defense Intelligence Services",
    subtitle: "Five tiers of defense research, from charge analysis to full discovery.",
  });
}
```

`src/app/playbooks/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "Defense Playbooks, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({
    title: "Defense Playbooks",
    subtitle: "Choose your charge type. Get an instant-download defense research packet.",
    eyebrow: "Instant PDF Download",
  });
}
```

`src/app/sample/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "Sample Case Decoder, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({
    title: "Sample Case Decoder Report",
    subtitle: "See what a Case Decoder report actually looks like. Real case, redacted.",
    eyebrow: "Free Preview",
  });
}
```

`src/app/sample-xray/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "Sample X-Ray Report, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({
    title: "Sample X-Ray Report",
    subtitle: "See a real X-Ray discovery analysis excerpt. Drug possession case, Pinellas County.",
    eyebrow: "Free Preview",
  });
}
```

`src/app/start/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "Get Started, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({ title: "Get Started", subtitle: "You have an attorney. You don't understand your case. That's the gap we close." });
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc , noEmit , skipLibCheck`

- [ ] **Step 3: Commit**

```bash
git add src/app/services/opengraph-image.tsx src/app/playbooks/opengraph-image.tsx src/app/sample/opengraph-image.tsx src/app/sample-xray/opengraph-image.tsx src/app/start/opengraph-image.tsx
git commit -m "feat(og): add OG images for service and product pages"
```

---

### Task 5: OG images, Free tools & DUI hub (6 files)

**Files to create:**
- `src/app/score/opengraph-image.tsx`
- `src/app/plea-analyzer/opengraph-image.tsx`
- `src/app/dui-checklist/opengraph-image.tsx`
- `src/app/dui-defense/opengraph-image.tsx`
- `src/app/blog/opengraph-image.tsx`
- `src/app/partner/login/opengraph-image.tsx`

- [ ] **Step 1: Create all 6 files**

`src/app/score/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "Free Defense Score, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({
    title: "Is Your Defense on Track?",
    subtitle: "Free, anonymous 10-question assessment. See where your defense stands.",
    eyebrow: "Free Tool",
  });
}
```

`src/app/plea-analyzer/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "Plea Deal Analyzer, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({
    title: "Is Your Plea Offer Fair?",
    subtitle: "Upload your plea offer details and get an honest analysis in minutes.",
    eyebrow: "Free Tool",
  });
}
```

`src/app/dui-checklist/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "DUI Checklist, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({
    title: "What to Do After a DUI Arrest",
    subtitle: "The 3 things to do in the next 72 hours. Free checklist.",
    eyebrow: "Free 72-Hour Checklist",
  });
}
```

`src/app/dui-defense/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "DUI Defense by State, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({
    title: "DUI Defense Resources by State",
    subtitle: "BAC limits, penalties, and defense strategies for all 50 states.",
  });
}
```

`src/app/blog/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "Criminal Defense Blog, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({
    title: "Criminal Defense Blog",
    subtitle: "In-depth legal research and defense strategies for criminal defendants.",
  });
}
```

`src/app/partner/login/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
export const runtime = "edge";
export const alt = "Partner Login, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  return renderOgImage({ title: "Partner Login", subtitle: "Access your referral dashboard, commissions, and compliance tools." });
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc , noEmit , skipLibCheck`

- [ ] **Step 3: Commit**

```bash
git add src/app/score/opengraph-image.tsx src/app/plea-analyzer/opengraph-image.tsx src/app/dui-checklist/opengraph-image.tsx src/app/dui-defense/opengraph-image.tsx src/app/blog/opengraph-image.tsx src/app/partner/login/opengraph-image.tsx
git commit -m "feat(og): add OG images for free tools, blog, DUI hub, partner login"
```

---

### Task 6: OG images, Tier 9 SKU pages (5 files)

These pages import `TIER_CORE` from `@/lib/tiers` for pricing. OG images should show the product name and price. Cannot use edge runtime since `tiers.ts` uses Node imports.

**Files to create:**
- `src/app/judge-report-card/opengraph-image.tsx`
- `src/app/similar-cases-analyzer/opengraph-image.tsx`
- `src/app/officer-background-check/opengraph-image.tsx`
- `src/app/district-court-intelligence/opengraph-image.tsx`
- `src/app/arrest-survival-kit/opengraph-image.tsx`

- [ ] **Step 1: Create all 5 files**

Each follows the same pattern. Read the tier slug from `TIER_CORE` for the price display.

`src/app/judge-report-card/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { TIER_CORE } from "@/lib/tiers";
export const alt = "Judge Report Card, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  const tier = TIER_CORE["judge-report-card"];
  return renderOgImage({
    title: "Judge Report Card",
    subtitle: "Sentencing patterns, prosecutor pairing data, and bench vs. jury divergence.",
    eyebrow: tier?.priceDisplay ?? "$197",
  });
}
```

`src/app/similar-cases-analyzer/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { TIER_CORE } from "@/lib/tiers";
export const alt = "Similar Cases Analyzer, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  const tier = TIER_CORE["similar-cases-analyzer"];
  return renderOgImage({
    title: "Similar Cases Analyzer",
    subtitle: "Find cases with facts like yours and see what happened.",
    eyebrow: tier?.priceDisplay ?? "$297",
  });
}
```

`src/app/officer-background-check/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { TIER_CORE } from "@/lib/tiers";
export const alt = "Officer Background Check, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  const tier = TIER_CORE["officer-background-check"];
  return renderOgImage({
    title: "Officer Background Check",
    subtitle: "Cross-case officer reliability analysis and discreditation history.",
    eyebrow: tier?.priceDisplay ?? "$97",
  });
}
```

`src/app/district-court-intelligence/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { TIER_CORE } from "@/lib/tiers";
export const alt = "District Court Intelligence, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  const tier = TIER_CORE["district-court-intelligence"];
  return renderOgImage({
    title: "District Court Intelligence",
    subtitle: "Federal district-level sentencing patterns, conviction rates, and trends.",
    eyebrow: tier?.priceDisplay ?? "$197",
  });
}
```

`src/app/arrest-survival-kit/opengraph-image.tsx`:
```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { TIER_CORE } from "@/lib/tiers";
export const alt = "Arrest Survival Kit, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export default function Image() {
  const tier = TIER_CORE["arrest-survival-kit"];
  return renderOgImage({
    title: "Arrest Survival Kit",
    subtitle: "Know your rights before they read you yours. State-specific.",
    eyebrow: tier?.priceDisplay ?? "$47",
  });
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc , noEmit , skipLibCheck`

- [ ] **Step 3: Commit**

```bash
git add src/app/judge-report-card/opengraph-image.tsx src/app/similar-cases-analyzer/opengraph-image.tsx src/app/officer-background-check/opengraph-image.tsx src/app/district-court-intelligence/opengraph-image.tsx src/app/arrest-survival-kit/opengraph-image.tsx
git commit -m "feat(og): add OG images for Tier 9 SKU pages with dynamic pricing"
```

---

### Task 7: OG images, Dynamic routes (5 files)

These routes use data from imports or DB. They need `generateStaticParams` where applicable to pre-render at build time.

**Files to create:**
- `src/app/services/[slug]/opengraph-image.tsx`
- `src/app/dui-defense/[state]/opengraph-image.tsx`
- `src/app/tools/[slug]/opengraph-image.tsx`
- `src/app/guides/[slug]/opengraph-image.tsx`
- `src/app/r/[code]/opengraph-image.tsx`

- [ ] **Step 1: Create `/services/[slug]/opengraph-image.tsx`**

Uses `getProduct` from `@/lib/products` (same as sibling page.tsx):

```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { getProduct, isValidProduct } from "@/lib/products";

export const alt = "Defense Intelligence Service, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = isValidProduct(slug) ? getProduct(slug) : null;
  return renderOgImage({
    title: product?.name || "Defense Intelligence",
    subtitle: product?.description?.slice(0, 100),
    eyebrow: product?.priceDisplay,
  });
}
```

- [ ] **Step 2: Create `/dui-defense/[state]/opengraph-image.tsx`**

Uses `allStateSlugs`, `getStateDuiData` from `@/data/state-dui-laws`:

```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { allStateSlugs, getStateDuiData } from "@/data/state-dui-laws";

export const alt = "DUI Defense by State, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return allStateSlugs().map((state) => ({ state }));
}

export default async function Image({ params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  const data = getStateDuiData(state);
  return renderOgImage({
    title: data ? `${data.name} DUI Defense` : "DUI Defense by State",
    subtitle: data ? `BAC limit ${data.bac}. Penalties, defenses, and what to do next.` : undefined,
  });
}
```

- [ ] **Step 3: Create `/tools/[slug]/opengraph-image.tsx`**

Uses `getProduct`, `isValidProduct` from `@/lib/products`:

```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { getProduct, isValidProduct } from "@/lib/products";

export const alt = "Defense Tool, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = isValidProduct(slug) ? getProduct(slug) : null;
  return renderOgImage({
    title: product?.name || "Defense Tool",
    subtitle: product?.description?.slice(0, 100),
    eyebrow: "Free Tool",
  });
}
```

- [ ] **Step 4: Create `/guides/[slug]/opengraph-image.tsx`**

Uses `STANDALONE_PRODUCTS`, `getProduct`, `isValidProduct` from `@/lib/products`. Needs `generateStaticParams` matching the sibling page:

```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { STANDALONE_PRODUCTS, getProduct, isValidProduct } from "@/lib/products";

export const alt = "Defense Guide, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return Object.values(STANDALONE_PRODUCTS)
    .filter((p) => p.category === "content" && p.isActive)
    .map((p) => ({ slug: p.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = isValidProduct(slug) ? getProduct(slug) : null;
  return renderOgImage({
    title: product?.name || "Defense Guide",
    subtitle: product?.description?.slice(0, 100),
    eyebrow: product?.priceDisplay,
  });
}
```

- [ ] **Step 5: Create `/r/[code]/opengraph-image.tsx`**

Uses Supabase to fetch partner data at request time. Edge runtime for speed:

```tsx
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-template";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "edge";
export const alt = "Referred by a Partner, ImNotAnAttorney";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let partnerName = "a trusted partner";
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("partners")
      .select("company, name")
      .eq("promo_code", code.toUpperCase())
      .single();
    if (data) partnerName = data.company || data.name;
  } catch {
    // fallback to generic
  }
  return renderOgImage({
    title: `Referred by ${partnerName}`,
    subtitle: "Court prep for your case. Research your charges, know your rights.",
    eyebrow: "Special Referral",
  });
}
```

**Note:** If `createAdminClient` doesn't work on edge runtime, remove `export const runtime = "edge"` and let it run on default Node runtime.

- [ ] **Step 6: Type check**

Run: `npx tsc , noEmit , skipLibCheck`

- [ ] **Step 7: Commit**

```bash
git add src/app/services/\[slug\]/opengraph-image.tsx src/app/dui-defense/\[state\]/opengraph-image.tsx src/app/tools/\[slug\]/opengraph-image.tsx src/app/guides/\[slug\]/opengraph-image.tsx src/app/r/\[code\]/opengraph-image.tsx
git commit -m "feat(og): add dynamic OG images for services, DUI states, tools, guides, referrals"
```

---

### Task 8: Verify OG images render

- [ ] **Step 1: Build the site and check for OG errors**

Run: `npx next build 2>&1 | grep -i "opengraph\|og\|error"`

The build should complete without errors related to OG image generation.

- [ ] **Step 2: Spot-check a few OG image URLs**

Start dev server, then fetch OG images directly:
- `http://localhost:3000/partners/opengraph-image`, should return 1200x630 PNG
- `http://localhost:3000/score/opengraph-image`, should return 1200x630 PNG
- `http://localhost:3000/blog/opengraph-image`, should return 1200x630 PNG

- [ ] **Step 3: Run full test suite**

```bash
npx tsc , noEmit , skipLibCheck
npx vitest run
```

- [ ] **Step 4: Final commit if any fixes needed**

---

## Summary

| Task | Files | Scope |
|------|-------|-------|
| 1 | 1 | Shared OG template |
| 2 | 3 | Fix missing metadata |
| 3 | 7 | Marketing pages |
| 4 | 5 | Services & products |
| 5 | 6 | Free tools, blog, DUI, partner login |
| 6 | 5 | Tier 9 SKU pages |
| 7 | 5 | Dynamic routes |
| 8 | 0 | Verification |
| **Total** | **32** | **28 OG images + 1 template + 3 metadata fixes** |

Tasks 3-7 are independent and can run in parallel after Tasks 1-2 complete.

## Pages intentionally skipped (internal/authenticated)

- `/operator/*`, `/admin/*`, internal dashboards
- `/my-case/*`, `/my-cases/*`, authenticated delivery
- `/report/*`, `/prep/*`, authenticated delivery
- `/upload`, `/unsubscribe`, utility
- `/checkout/*`, noindex, transactional
- `/intake/*`, checkout flow
- `/partner/dashboard`, `/partner/checklist`, `/partner/card`, `/partner/compliance-report`, authenticated portal (root OG fallback is fine)
- `/terms`, `/privacy`, `/editorial-policy`, legal pages (root OG fallback is fine)
- `/partners/terms`, inherits from `/partners/opengraph-image.tsx`
- `/r/[code]/reminders`, `/r/[code]/quiz`, `/r/[code]/[product]`, inherits from `/r/[code]/opengraph-image.tsx`
