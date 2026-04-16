# Dynamic Pricing Architecture, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all hardcoded prices across the codebase so changing a price means updating one line in `tiers.ts` or `products.ts`.

**Architecture:** Three-layer system, dynamic imports for mechanical prices (CTAs, metadata, labels), intentional marketing anchors for value stacks (Hormozi 10x+), template functions for prose copy. Automated staleness detector as pre-commit hook validates value-stack anchors stay above product price.

**Tech Stack:** Next.js 15, TypeScript, `tiers.ts` (TIER_CORE), `products.ts` (STANDALONE_PRODUCTS)

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-04-14-dynamic-pricing-design.md`
**Detail spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-04-14-dynamic-pricing-design-layers.md`

**Continued in:** `2026-04-14-dynamic-pricing-part2.md` (Tasks 6-10)

---

### Task 1: Dynamic prices in component CTAs (PillarCTA, BlogCTA, DiscoveryReveal)

**Files:**
- Modify: `src/components/blog/PillarCTA.tsx`
- Modify: `src/components/BlogCTA.tsx`
- Modify: `src/components/motion/DiscoveryReveal.tsx`

- [ ] **Step 1: Read all three files to verify current state**

Read `PillarCTA.tsx` fully, `BlogCTA.tsx` lines 1-60 and 110-145, `DiscoveryReveal.tsx` lines 220-240. Confirm the hardcoded prices match what the spec describes before editing.

- [ ] **Step 2: Replace TIER_LABELS in PillarCTA.tsx**

Delete the entire `TIER_LABELS` map and add `TIER_CORE` import. Change the variable assignments:

```typescript
// Add to imports
import { TIER_CORE } from "@/lib/tiers";

// Replace the TIER_LABELS lookup (around lines 72-75) with:
const tier = TIER_CORE[ctaTier as keyof typeof TIER_CORE];
const tierName = tier?.name ?? "Full Analysis";
const tierPrice = tier?.priceDisplay ?? "";
const tierDelivery = tier?.delivery ?? "";
```

- [ ] **Step 3: Replace hardcoded price in BlogCTA.tsx**

In the `STANDALONE_CATEGORY_CTA` map, replace the hardcoded `$197`:

```typescript
// Add to imports
import { getProduct } from "@/lib/products";

// In STANDALONE_CATEGORY_CTA, replace the employment entry:
employment: (() => {
  const p = getProduct("employment-impact");
  return {
    slug: "employment-impact",
    price: p?.priceDisplay ?? "$197",
    primaryLabel: `Get Your Employment Impact Assessment, ${p?.priceDisplay ?? "$197"}`,
  };
})(),
```

Note: Read the file first, the exact structure may differ. The goal is to pull the price from `getProduct` instead of hardcoding.

- [ ] **Step 4: Replace hardcoded price in DiscoveryReveal.tsx**

```typescript
// Add to imports
import { TIER_CORE } from "@/lib/tiers";

// Line 227: replace the CTA text
// Before: Get Your Case Analyzed &mdash; $197 &rarr;
// After:
Get Your Case Analyzed &mdash; {TIER_CORE["case-decoder"].priceDisplay} &rarr;
```

- [ ] **Step 5: Type-check**

Run: `npx tsc,noEmit,skipLibCheck`
Expected: No new errors in the three modified files.

- [ ] **Step 6: Commit**

```bash
git add src/components/blog/PillarCTA.tsx src/components/BlogCTA.tsx src/components/motion/DiscoveryReveal.tsx
git commit -m "refactor(pricing): dynamic prices in PillarCTA, BlogCTA, DiscoveryReveal"
```

---

### Task 2: Dynamic prices in page CTAs (family, plea-analyzer)

**Files:**
- Modify: `src/app/family/page.tsx`
- Modify: `src/app/plea-analyzer/PleaAnalyzerClient.tsx`
- Modify: `src/app/plea-analyzer/page.tsx`

- [ ] **Step 1: Read all three files at the relevant lines**

Read `family/page.tsx` lines 230-240, `PleaAnalyzerClient.tsx` lines 235-250, `plea-analyzer/page.tsx` lines 100-110. Confirm hardcoded prices.

- [ ] **Step 2: Fix family/page.tsx**

Add `import { TIER_CORE } from "@/lib/tiers"` if not already present.

Replace line 236 CTA text:
```tsx
// Before: Get the Case Decoder &mdash; $197 &rarr;
// After:
Get the Case Decoder &mdash; {TIER_CORE["case-decoder"].priceDisplay} &rarr;
```

- [ ] **Step 3: Fix plea-analyzer/PleaAnalyzerClient.tsx**

Add `import { TIER_CORE } from "@/lib/tiers"`.

Replace line 242 CTA text:
```tsx
// Before: Get Your Case Decoder, $197
// After:
Get Your Case Decoder, {TIER_CORE["case-decoder"].priceDisplay}
```

- [ ] **Step 4: Fix plea-analyzer/page.tsx**

Add `import { TIER_CORE } from "@/lib/tiers"`.

Replace line 104:
```tsx
// Before: ($197) maps your complete defense landscape.
// After:
({TIER_CORE["case-decoder"].priceDisplay}) maps your complete defense landscape.
```

Note: This is inside JSX, verify whether it's a template literal or JSX text and use the appropriate interpolation syntax.

- [ ] **Step 5: Type-check**

Run: `npx tsc,noEmit,skipLibCheck`
Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/family/page.tsx src/app/plea-analyzer/PleaAnalyzerClient.tsx src/app/plea-analyzer/page.tsx
git commit -m "refactor(pricing): dynamic prices in family and plea-analyzer pages"
```

---

### Task 3: Dynamic prices in Tier 9 product pages (with metadata conversion)

**Files:**
- Modify: `src/app/officer-background-check/page.tsx`
- Modify: `src/app/judge-report-card/page.tsx`
- Modify: `src/app/similar-cases-analyzer/page.tsx`
- Modify: `src/app/start/layout.tsx`

All four files need `metadata` export converted to `generateMetadata()` function.

- [ ] **Step 1: Read all four files to understand current metadata structure**

Read each file's first 30 lines (metadata area) and the hero/CTA areas noted in the spec.

- [ ] **Step 2: Fix officer-background-check/page.tsx**

Add `import { TIER_CORE } from "@/lib/tiers"`.

Convert metadata:
```typescript
// Before:
export const metadata: Metadata = {
  title: "Officer Background Check, $97 | ImNotAnAttorney",
  // other fields
};

// After:
export function generateMetadata(): Metadata {
  return {
    title: `Officer Background Check, ${TIER_CORE["officer-background-check"].priceDisplay} | ImNotAnAttorney`,
    // other fields unchanged (copy them over exactly)
  };
}
```

Replace hero price (line 186):
```tsx
// Before: <p ...>$97</p>
// After:
<p className="mt-6 text-4xl font-extrabold text-amber-400">{TIER_CORE["officer-background-check"].priceDisplay}</p>
```

Replace AvailabilityChecker prop (line 200):
```tsx
// Before: priceDisplay="$97"
// After:
priceDisplay={TIER_CORE["officer-background-check"].priceDisplay}
```

- [ ] **Step 3: Fix judge-report-card/page.tsx**

Same pattern. Add `import { TIER_CORE } from "@/lib/tiers"`.

Convert metadata to `generateMetadata()` with `TIER_CORE["judge-report-card"].priceDisplay`.
Replace hero price (line 116) with `{TIER_CORE["judge-report-card"].priceDisplay}`.
Replace AvailabilityChecker prop (line 128) with `priceDisplay={TIER_CORE["judge-report-card"].priceDisplay}`.

- [ ] **Step 4: Fix similar-cases-analyzer/page.tsx**

Same pattern. Add `import { TIER_CORE } from "@/lib/tiers"`.

Convert metadata to `generateMetadata()` with `TIER_CORE["similar-cases-analyzer"].priceDisplay`.
Replace hero price (line 195), AvailabilityChecker prop (line 206), CTA text (lines 401, 410), all five instances with `TIER_CORE["similar-cases-analyzer"].priceDisplay`.

- [ ] **Step 5: Fix start/layout.tsx**

Add `import { TIER_CORE } from "@/lib/tiers"`.

Convert metadata (line 20):
```typescript
// Before:
description: "Case Decoder from $197. The X-Ray from $2,497."

// After:
description: `Case Decoder from ${TIER_CORE["case-decoder"].priceDisplay}. The X-Ray from ${TIER_CORE["x-ray"].priceDisplay}.`
```

- [ ] **Step 6: Type-check**

Run: `npx tsc,noEmit,skipLibCheck`
Expected: No new errors. Watch for metadata type issues, `generateMetadata` return type must be `Metadata` (import from `next`).

- [ ] **Step 7: Commit**

```bash
git add src/app/officer-background-check/page.tsx src/app/judge-report-card/page.tsx src/app/similar-cases-analyzer/page.tsx src/app/start/layout.tsx
git commit -m "refactor(pricing): dynamic prices in Tier 9 pages + start layout metadata"
```

---

### Task 4: Dynamic prices in checkout success + report renderer

**Files:**
- Modify: `src/app/checkout/success/page.tsx`
- Modify: `src/lib/report-renderer.ts`

- [ ] **Step 1: Read both files at the relevant lines**

Read `checkout/success/page.tsx` lines 485-520 and 575-625.
Read `report-renderer.ts` lines 180-195.

- [ ] **Step 2: Fix checkout/success/page.tsx fallbacks**

The file already imports `TIER_CORE`. The primary path uses `TIER_CORE[tier as keyof typeof TIER_CORE]?.priceDisplay` which is correct. The `?? "$97"` fallback only fires for unknown/unrecognized tier slugs. Replace with empty string, if the tier is unrecognized, showing a wrong price is worse than showing no price:

```typescript
// Line 490, before: ?? "$97"
// After:
?? ""

// Line 511, before: ?? "$97"
// After:
?? ""
```

Note: Do NOT use `TIER_CORE["dui-first-offense"].priceDisplay` as fallback, the fallback covers ALL tiers including $147 premium playbooks, so hardcoding any specific tier's price is wrong.

- [ ] **Step 3: Fix checkout/success/page.tsx upsell copy**

```typescript
// Line 583, before: "You have already paid $997."
// After:
`You have already paid ${TIER_CORE["intelligence-brief"].priceDisplay}.`

// Line 619, before: "You have already paid $2,497."
// After:
`You have already paid ${TIER_CORE["x-ray"].priceDisplay}.`
```

Note: Verify whether these are inside template literals or plain strings. If plain strings, convert to template literals.

- [ ] **Step 4: Fix report-renderer.ts**

Add import:
```typescript
import { TIER_CORE, upgradeCostBetween } from "@/lib/tiers";
```

Replace lines 185-186 in the HTML template literal:
```typescript
// Before:
// Case Intelligence Brief, $997 ($800 after credit)
// Your $197 is fully credited toward any tier within 12 months.

// After:
// Case Intelligence Brief, ${TIER_CORE["intelligence-brief"].priceDisplay} (${upgradeCostBetween("case-decoder", "intelligence-brief")} after credit)
// Your ${TIER_CORE["case-decoder"].priceDisplay} is fully credited toward any tier within 12 months.
```

- [ ] **Step 5: Type-check**

Run: `npx tsc,noEmit,skipLibCheck`
Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/checkout/success/page.tsx src/lib/report-renderer.ts
git commit -m "refactor(pricing): dynamic prices in checkout success + report renderer"
```

---

### Task 5: Dynamic prices in backend files (monitoring, webhooks, drip emails, IB prompts, FtaCalculator)

**Files:**
- Modify: `src/lib/cron/monitoring.ts`
- Modify: `src/app/api/webhooks/engine/delivery/route.ts`
- Modify: `src/lib/drip-emails.ts`
- Modify: `src/lib/intelligence-brief/prompts.ts`
- Modify: `src/components/partner/FtaCalculator.tsx`

- [ ] **Step 1: Read all five files at the relevant lines**

Read `monitoring.ts` lines 335-430, `delivery/route.ts` lines 295-310, `drip-emails.ts` lines 1210-1250, `prompts.ts` lines 645-660, `FtaCalculator.tsx` lines 25-35.

- [ ] **Step 2: Fix monitoring.ts tierLabel strings**

File already imports `tierDisplayName` and `tierPriceNum`. Add `TIER_CORE` to the import:

```typescript
import { TIER_CORE, tierDisplayName, tierPriceNum } from "@/lib/tiers";
```

Replace each hardcoded `tierLabel`:
```typescript
// Line 340, before: tierLabel: "Case Decoder ($197)",
tierLabel: `${tierDisplayName("case-decoder")} (${TIER_CORE["case-decoder"].priceDisplay})`,

// Line 355, before: tierLabel: "Intelligence Brief ($997)",
tierLabel: `${tierDisplayName("intelligence-brief")} (${TIER_CORE["intelligence-brief"].priceDisplay})`,

// Line 370, before: tierLabel: "X-Ray ($2,497)",
tierLabel: `${tierDisplayName("x-ray")} (${TIER_CORE["x-ray"].priceDisplay})`,

// Line 398, before: tierLabel: "War Room ($4,997)",
tierLabel: `${tierDisplayName("war-room")} (${TIER_CORE["war-room"].priceDisplay})`,

// Line 426, before: tierLabel: "Situation Room ($9,997)",
tierLabel: `${tierDisplayName("situation-room")} (${TIER_CORE["situation-room"].priceDisplay})`,
```

- [ ] **Step 3: Fix webhooks/engine/delivery/route.ts**

Add `import { TIER_CORE } from "@/lib/tiers"` if not already present.

Line 302:
```typescript
// Before: ($4,997)
// After:
(${TIER_CORE["war-room"].priceDisplay})
```

Verify this is inside a template literal. If not, convert the string to a template literal.

- [ ] **Step 4: Fix drip-emails.ts**

`TIER_CORE` is already imported. Replace four hardcoded prices:

```typescript
// Line 1215, before: $2,497 , after:
${TIER_CORE["x-ray"].priceDisplay}

// Line 1219, before: $4,997 , after:
${TIER_CORE["war-room"].priceDisplay}

// Line 1230, before: $9,997 , after:
${TIER_CORE["situation-room"].priceDisplay}

// Line 1245, before: $2,497 , after:
${TIER_CORE["x-ray"].priceDisplay}
```

- [ ] **Step 5: Fix intelligence-brief/prompts.ts**

Add import:
```typescript
import { TIER_CORE, upgradeCostBetween } from "@/lib/tiers";
```

Line 651, replace three prices in the prompt template:
```typescript
// Before: "The X-Ray, $2,497"
// After:  "The X-Ray, ${TIER_CORE["x-ray"].priceDisplay}"

// Before: "Your $997 is fully credited"
// After:  "Your ${TIER_CORE["intelligence-brief"].priceDisplay} is fully credited"

// Before: "the X-Ray is $1,500, not $2,497"
// After:  "the X-Ray is ${upgradeCostBetween("intelligence-brief", "x-ray")}, not ${TIER_CORE["x-ray"].priceDisplay}"
```

Verify the surrounding string is already a template literal. If not, convert it.

- [ ] **Step 6: Fix FtaCalculator.tsx**

Add import:
```typescript
import { tierPriceNum } from "@/lib/tiers";
```

Lines 28-29:
```typescript
// Before: annualClients * 0.05 * 197 * 0.1
// After:
annualClients * 0.05 * tierPriceNum("case-decoder") * 0.1
```

Also update the comment on line 28 if it references "$197".

- [ ] **Step 7: Type-check**

Run: `npx tsc,noEmit,skipLibCheck`
Expected: No new errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/cron/monitoring.ts src/app/api/webhooks/engine/delivery/route.ts src/lib/drip-emails.ts src/lib/intelligence-brief/prompts.ts src/components/partner/FtaCalculator.tsx
git commit -m "refactor(pricing): dynamic prices in monitoring, webhooks, drip emails, IB prompts, FtaCalculator"
```

---

**Continued in `2026-04-14-dynamic-pricing-part2.md`, Tasks 6-10 (value-stack anchors, prose template functions, staleness detector, documentation, verification sweep).**
