# Dynamic Pricing — Layer Details

Parent spec: `2026-04-14-dynamic-pricing-design.md`

## Layer 1: Mechanical Prices — File-by-File Changes

### 1. `src/components/blog/PillarCTA.tsx` — 5 instances

Delete the entire `TIER_LABELS` map (lines 36-42) which duplicates tier data:
```typescript
const TIER_LABELS: Record<string, { name: string; price: string; delivery: string }> = {
  "case-decoder":        { name: "Case Decoder",          price: "$197",   delivery: "48hr delivery" },
  "intelligence-brief":  { name: "Intelligence Brief",    price: "$997",   delivery: "72hr delivery" },
  "x-ray":               { name: "The X-Ray",             price: "$2,497", delivery: "10 business days" },
  "war-room":            { name: "The War Room",          price: "$4,997", delivery: "25-28 days" },
  "situation-room":      { name: "The Situation Room",    price: "$9,997", delivery: "Priority delivery" },
};
```

Replace with import from tiers.ts. Update the three usage sites (tierName, tierPrice, tierDelivery variables around lines 72-75) to read from `TIER_CORE[ctaTier]`.

### 2. `src/components/BlogCTA.tsx` — 2 instances

Line 47: hardcoded `price: "$197"` in the `STANDALONE_CATEGORY_CTA` map for `employment` category.
Line 52: hardcoded `primaryLabel: "Get Your Employment Impact Assessment — $197"`.

Replace both with imports from `products.ts` via `getProduct("employment-impact")?.priceDisplay`.

### 3. `src/components/motion/DiscoveryReveal.tsx` — 1 instance

Line 227: `Get Your Case Analyzed &mdash; $197 &rarr;` in CTA anchor text.

Import `TIER_CORE` from `@/lib/tiers` and replace `$197` with `{TIER_CORE["case-decoder"].priceDisplay}`.

### 4. `src/app/family/page.tsx` — 1 instance

Line 236: `Get the Case Decoder &mdash; $197 &rarr;` in CTA anchor text.

Import `TIER_CORE` from `@/lib/tiers` and replace `$197` with `{TIER_CORE["case-decoder"].priceDisplay}`.

### 5. `src/app/plea-analyzer/PleaAnalyzerClient.tsx` — 1 instance

Line 242: `Get Your Case Decoder — $197` in CTA button text.

Import `TIER_CORE` from `@/lib/tiers` and replace `$197` with `{TIER_CORE["case-decoder"].priceDisplay}`.

### 6. `src/app/plea-analyzer/page.tsx` — 1 instance

Line 104: `($197) maps your complete defense landscape.` in body paragraph.

Import `TIER_CORE` from `@/lib/tiers` and replace `$197` with `${TIER_CORE["case-decoder"].priceDisplay}`.

### 7. `src/app/officer-background-check/page.tsx` — 3 instances

Line 16: metadata title `"Officer Background Check — $97 | ImNotAnAttorney"`
Line 186: hero price display `<p>$97</p>`
Line 200: AvailabilityChecker prop `priceDisplay="$97"`

Import `TIER_CORE` from `@/lib/tiers`. Convert static `metadata` export to `generateMetadata()` function for dynamic interpolation. Replace all three with `TIER_CORE["officer-background-check"].priceDisplay`.

### 8. `src/app/judge-report-card/page.tsx` — 3 instances

Line 14: metadata title `"Judge Report Card — $197 | ImNotAnAttorney"`
Line 116: hero price display `<p>$197</p>`
Line 128: AvailabilityChecker prop `priceDisplay="$197"`

Same pattern as officer-background-check. Import `TIER_CORE`, convert to `generateMetadata()`, replace all three.

### 9. `src/app/similar-cases-analyzer/page.tsx` — 5 instances

Line 18: metadata title with `$297`
Line 195: hero price display `$297`
Line 206: AvailabilityChecker prop `priceDisplay="$297"`
Line 401: CTA text with `$297`
Line 410: bottom CTA text with `$297`

Same pattern. Import `TIER_CORE`, convert to `generateMetadata()`, replace all five.

### 10. `src/app/checkout/success/page.tsx` — 4 instances

Line 490: fallback `?? "$97"` — replace with `?? TIER_CORE["dui-first-offense"].priceDisplay`
Line 511: fallback `?? "$97"` — same fix
Line 583: `"You have already paid $997."` — replace `$997` with `${TIER_CORE["intelligence-brief"].priceDisplay}`
Line 619: `"You have already paid $2,497."` — replace `$2,497` with `${TIER_CORE["x-ray"].priceDisplay}`

### 11. `src/lib/report-renderer.ts` — 3 instances

Line 185: `Case Intelligence Brief — $997 ($800 after credit)` in HTML template literal
Line 186: `Your $197 is fully credited` in HTML template literal

Import `TIER_CORE` and `upgradeCostBetween` from `@/lib/tiers`. Replace:
- `$997` with `${TIER_CORE["intelligence-brief"].priceDisplay}`
- `$800` with `${upgradeCostBetween("case-decoder", "intelligence-brief")}`
- `$197` with `${TIER_CORE["case-decoder"].priceDisplay}`

### 12. `src/lib/cron/monitoring.ts` — 5 instances

Lines 340, 355, 370, 398, 426: `tierLabel` strings like `"Case Decoder ($197)"`.

Already imports `tierDisplayName` and `tierPriceNum` from tiers.ts. Also import `TIER_CORE`. Replace each hardcoded label:
- Line 340: `tierLabel: \`${tierDisplayName("case-decoder")} (${TIER_CORE["case-decoder"].priceDisplay})\``
- Line 355: `tierLabel: \`${tierDisplayName("intelligence-brief")} (${TIER_CORE["intelligence-brief"].priceDisplay})\``
- Line 370: `tierLabel: \`${tierDisplayName("x-ray")} (${TIER_CORE["x-ray"].priceDisplay})\``
- Line 398: `tierLabel: \`${tierDisplayName("war-room")} (${TIER_CORE["war-room"].priceDisplay})\``
- Line 426: `tierLabel: \`${tierDisplayName("situation-room")} (${TIER_CORE["situation-room"].priceDisplay})\``

### 13. `src/app/api/webhooks/engine/delivery/route.ts` — 1 instance

Line 302: `($4,997)` hardcoded in upgrade email HTML.

Import `TIER_CORE` from `@/lib/tiers` and replace with `${TIER_CORE["war-room"].priceDisplay}`.

### 14. `src/app/start/layout.tsx` — 1 instance

Line 20: `"Case Decoder from $197. The X-Ray from $2,497."` in metadata description.

Convert to `generateMetadata()` function. Replace with `TIER_CORE["case-decoder"].priceDisplay` and `TIER_CORE["x-ray"].priceDisplay`.

### 15. `src/components/partner/FtaCalculator.tsx` — 1 instance

Lines 28-29: magic number `197` in commission calculation `annualClients * 0.05 * 197 * 0.1`.

Import `tierPriceNum` from `@/lib/tiers` and replace `197` with `tierPriceNum("case-decoder")`.

### 16. `src/lib/drip-emails.ts` — 4 instances

Line 1215: hardcoded `$2,497` in X-Ray discovery status email HTML
Line 1219: hardcoded `$4,997` in War Room discovery status email HTML
Line 1230: hardcoded `$9,997` in Situation Room discovery status email HTML
Line 1245: hardcoded `$2,497` in X-Ray status follow-up email HTML

Replace with `${TIER_CORE["x-ray"].priceDisplay}`, `${TIER_CORE["war-room"].priceDisplay}`, `${TIER_CORE["situation-room"].priceDisplay}` respectively. TIER_CORE is already imported in this file.

### 17. `src/lib/intelligence-brief/prompts.ts` — 3 instances

Line 651: prompt text includes three hardcoded prices:
- `"The X-Ray, $2,497"` — replace `$2,497` with `${TIER_CORE["x-ray"].priceDisplay}`
- `"Your $997 is fully credited"` — replace `$997` with `${TIER_CORE["intelligence-brief"].priceDisplay}`
- `"the X-Ray is $1,500, not $2,497"` — replace `$1,500` with `${upgradeCostBetween("intelligence-brief", "x-ray")}` and `$2,497` with `${TIER_CORE["x-ray"].priceDisplay}`

Import `TIER_CORE` and `upgradeCostBetween` from `@/lib/tiers`.

### Metadata Conversion Note

Next.js static `metadata` exports cannot use runtime JS expressions. Four pages need conversion from static `metadata` to `generateMetadata()` function:
- `app/officer-background-check/page.tsx`
- `app/judge-report-card/page.tsx`
- `app/similar-cases-analyzer/page.tsx`
- `app/start/layout.tsx`

Pattern:
```typescript
// Before
export const metadata: Metadata = {
  title: "Judge Report Card — $197 | ImNotAnAttorney",
};

// After
export function generateMetadata(): Metadata {
  return {
    title: `Judge Report Card — ${TIER_CORE["judge-report-card"].priceDisplay} | ImNotAnAttorney`,
  };
}
```

`generateMetadata` runs at build time for static pages — no runtime cost.

---

## Layer 2: Value-Stack Anchors — Detailed Changes

File: `src/lib/playbook-configs.ts`

### $127 Standard Playbooks

Update the `valueStack.sections[].value` fields for these 5 slugs: `dui-first-offense`, `drug-possession`, `probation-violation`, `sex-offense`, `self-defense`.

Each playbook has 6 value-stack sections. Change the `value` field in each:

| Section pattern | Old value | New value |
|----------------|-----------|-----------|
| Emergency Playbook / Book 1 | `"$97"` | `"$197"` |
| Charge Reality Report | `"$297"` | `"$347"` |
| Questions guide (26 Questions / X Questions) | `"$197"` | `"$297"` |
| Case Stage Roadmap | `"$97"` | `"$197"` |
| Red Flag Checklist / Evidence Checklist | `"$97"` | `"$197"` |
| Case Progress Scorecard | `"$97"` | `"$197"` |

Update `totalValue` for each from `"$882"` to `"$1,432"`.

5 playbooks x (6 sections + 1 total) = 35 value changes.

### $147 Premium Playbooks

Update the `valueStack.sections[].value` fields for these 3 slugs: `white-collar`, `federal-criminal`, `drug-trafficking`.

| Section pattern | Old value | New value |
|----------------|-----------|-----------|
| Emergency Playbook / Book 1 | `"$97"` | `"$247"` |
| Charge Reality Report | `"$297"` | `"$497"` |
| Questions guide | `"$197"` | `"$347"` |
| Case Stage Roadmap | `"$97"` | `"$247"` |
| Red Flag Checklist / Evidence Checklist | `"$97"` | `"$197"` |
| Case Progress Scorecard | `"$97"` | `"$197"` |

Update `totalValue` for each from `"$882"` to `"$1,732"`.

3 playbooks x (6 sections + 1 total) = 21 value changes.

### Anchor Markers

Add `{/* anchor:SLUG */}` comment markers next to each value-stack value so the staleness detector can validate them:

```typescript
{
  title: "Emergency Playbook (Book 1)",
  desc: "What to do right now.",
  value: "$197", // {/* anchor:dui-first-offense */}
},
```

Note: Since these are inside a JS object (not JSX), use regular JS comments `// anchor:SLUG` instead of JSX comment syntax.

### Reminder Comments in `tiers.ts`

Add above each playbook tier entry in `tiers.ts`:

```typescript
// When changing this price, also update valueStack in playbook-configs.ts
// Rule: 10x minimum multiple, no single component below product price
"dui-first-offense": {
```

Add for all 8 playbook slugs.

---

## Layer 3: Prose Copy — Detailed Changes

### `src/app/services/[slug]/page.tsx` — 30 instances

#### Type Change

Update the PRODUCT_COPY type from:
```typescript
const PRODUCT_COPY: Record<string, {
  headline: string;
  stakes: string;
  includes: string[];
  sampleInsight: string;
}>
```

To:
```typescript
const PRODUCT_COPY: Record<string, {
  headline: string;
  stakes: string | ((price: string) => string);
  includes: string[];
  sampleInsight: string;
}>
```

#### Entry Transformation

Every `stakes` entry containing the product's own price becomes a function. Example:

Before:
```typescript
"plea-consequences": {
  headline: "What a Guilty Plea Actually Costs",
  stakes: "A guilty plea closes doors you don't know are open. The $97 cost of knowing is invisible against those stakes.",
  includes: ["Consequence mapping across 6 life domains"],
  sampleInsight: "Your plea type affects professional licensing.",
}
```

After:
```typescript
"plea-consequences": {
  headline: "What a Guilty Plea Actually Costs",
  stakes: (price: string) => `A guilty plea closes doors you don't know are open. The ${price} cost of knowing is invisible against those stakes.`,
  includes: ["Consequence mapping across 6 life domains"],
  sampleInsight: "Your plea type affects professional licensing.",
}
```

Competitor comparison prices within the same string stay hardcoded inside the template literal:
```typescript
// "$200-400" is a competitor comparison — stays static
stakes: (price: string) => `${price} vs $200-400 for an attorney to review the same material.`,
```

#### Rendering Change

Update the rendering site (line 638) from:
```tsx
<p className="text-zinc-300 leading-relaxed">{copy.stakes}</p>
```

To:
```tsx
<p className="text-zinc-300 leading-relaxed">
  {typeof copy.stakes === "function" ? copy.stakes(product.priceDisplay) : copy.stakes}
</p>
```

Where `product` is obtained from `getProduct(params.slug)` imported from `@/lib/products`.

#### Products Needing Transformation

All 36 entries in PRODUCT_COPY that have a dollar amount in their `stakes` field need conversion. The exact list of entries and their current prices should be verified at implementation time by grepping for `\$\d+` within `stakes` strings.

### Other Prose Files (Already Covered by Layer 1)

These files have prose-embedded prices but are handled by Layer 1's direct substitution because they already use template literals:

- `checkout/success/page.tsx` lines 583, 619 — "You have already paid $X" uses template literal, replace inline
- `drip-emails.ts` lines 1215, 1219, 1230, 1245 — email HTML uses template literal, replace inline
- `intelligence-brief/prompts.ts` line 651 — prompt uses template literal, replace inline

No function wrapper needed for these — they just need `${TIER_CORE[slug].priceDisplay}` substituted into existing template literals.

---

## Layer 4: Staleness Detector — Full Specification

### Script: `scripts/check-price-staleness.mjs`

#### Algorithm

1. Read `src/lib/tiers.ts` as text. Extract all slug-to-priceDisplay mappings via regex pattern matching on `priceDisplay: "$XXX"` fields within each slug block.
2. Read `src/lib/products.ts` as text. Same extraction.
3. Merge into a single canonical map: `{ "case-decoder": "$197", "dui-first-offense": "$127", "employment-impact": "$97", [all 62 slugs] }`
4. Recursively scan all `.ts` and `.tsx` files in `src/` for anchor markers: `// anchor:SLUG` pattern
5. For each marker, extract the dollar amount on the same line or preceding line (the `value:` field)
6. Parse both amounts to integers (strip `$` and `,`), compare: anchor must be >= canonical price
7. Also scan `playbook-configs.ts` for `totalValue` fields. For each playbook slug, sum its component anchors and compare to the stated total.
8. Exit 0 if all checks pass. Exit 1 if any mismatch, printing details.

#### Marker Format

Inside JS objects (playbook-configs.ts):
```typescript
value: "$197", // anchor:dui-first-offense
```

The detector regex: `// anchor:([a-z0-9-]+)` captures the slug, then looks for `\$[\d,]+` on the same line to capture the dollar amount.

#### Pre-Commit Hook Configuration

Add to `package.json`:
```json
{
  "lint-staged": {
    "src/lib/tiers.ts": "node scripts/check-price-staleness.mjs",
    "src/lib/products.ts": "node scripts/check-price-staleness.mjs"
  }
}
```

If `lint-staged` is not yet a dependency, add it: `npm install --save-dev lint-staged`.
If husky is not yet configured for pre-commit, add it: `npx husky add .husky/pre-commit "npx lint-staged"`.

Check if these dependencies already exist before adding.

#### CI Backup

Add to the existing CI workflow (GitHub Actions or Vercel build):
```yaml
- name: Price staleness check
  run: node scripts/check-price-staleness.mjs
```

#### Output Format — All Pass

```
Scanning src/ for price markers...
Found 56 anchor markers, 0 price markers

Checking anchors against canonical prices...
All 56 anchors are >= their canonical product price.

Checking totalValue sums...
All 8 playbook totals match component sums.

RESULT: 56 markers checked, 0 mismatches
```

#### Output Format — Failure

```
Scanning src/ for price markers...
Found 56 anchor markers, 0 price markers

FAILURES:
  playbook-configs.ts:157 — anchor:dui-first-offense value $97 < product price $127
  playbook-configs.ts:185 — dui-first-offense totalValue $882 != component sum $1,432

RESULT: 56 markers checked, 2 mismatches
```

---

## Layer 5: LLM-Facing Documentation — Full Content

### New File: `src/lib/PRICING-ARCHITECTURE.md`

```markdown
# Pricing Architecture — How Prices Work in This Codebase

## Single Source of Truth

ALL product pricing lives in exactly two files:

- `src/lib/tiers.ts` — TIER_CORE object (18 tier products)
- `src/lib/products.ts` — STANDALONE_PRODUCTS object (44 standalone products)

Both export `priceDisplay` (e.g. "$197"), `price` (cents, e.g. 19700), and `name`.

## Three Layers of Price Display

### Layer 1: Mechanical (Dynamic)
CTA buttons, metadata, component props, monitoring labels, email templates, LLM prompts.
These ALWAYS import from tiers.ts or products.ts. NEVER hardcode a price string.
Example: `TIER_CORE["case-decoder"].priceDisplay` not `"$197"`.

### Layer 2: Value-Stack Anchors (Intentional Hardcoding)
File: `src/lib/playbook-configs.ts` — valueStack.sections[].value fields.
These are marketing perceived-value numbers, NOT product prices.
They represent "what you'd pay separately for each component."
Rules:
- No anchor below product price
- 10x minimum total multiple
- Marked with `// anchor:SLUG` for automated checking
- Review when product price changes

### Layer 3: Prose Copy (Template Functions)
File: `src/app/services/[slug]/page.tsx` — PRODUCT_COPY[slug].stakes fields.
Stakes fields are functions: `(price: string) => string`
The product's own price is passed in dynamically at render time.
Competitor comparison prices ("$200-400 for an attorney") stay hardcoded — those are not our prices.

## How to Change a Price

1. Update `price` and `priceDisplay` in `tiers.ts` or `products.ts`
2. Run `git add` and `git commit`
3. Pre-commit hook runs `scripts/check-price-staleness.mjs` automatically
4. If any value-stack anchor is now below the new price, the commit is blocked
5. Fix flagged anchors in `playbook-configs.ts`, re-commit
6. Mechanical prices (Layer 1) and prose prices (Layer 3) update automatically — no manual changes needed

## How to Add a New Product

1. Add entry to `tiers.ts` (TIER_CORE) or `products.ts` (STANDALONE_PRODUCTS)
2. If it has a sales page at /services/[slug]: add PRODUCT_COPY entry with `stakes` as a function receiving price
3. If it has a playbook config: add to `playbook-configs.ts` with value-stack anchors and `// anchor:SLUG` markers
4. Commit — detector validates automatically

## What NOT to Do

- NEVER hardcode a price string ("$197") in a component, page, or template
- NEVER put a value-stack anchor below the product price
- NEVER skip the staleness detector (do not use --no-verify to bypass)
- NEVER display a totalValue that does not match the sum of component values
- NEVER use a price from one product for a different product's display
```

### CLAUDE.md Update

Add to the project's CLAUDE.md:

```markdown
## Pricing Architecture
All prices come from `tiers.ts` (TIER_CORE) and `products.ts` (STANDALONE_PRODUCTS).
NEVER hardcode prices in components or pages. See `src/lib/PRICING-ARCHITECTURE.md` for the full three-layer system (mechanical, value-stack anchors, prose template functions).
When changing prices, the pre-commit hook validates automatically via `scripts/check-price-staleness.mjs`.
```
