# Dynamic Pricing Architecture, Implementation Plan (Part 2)

> **Continues from:** `2026-04-14-dynamic-pricing.md` (Tasks 1-5)
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-04-14-dynamic-pricing-design.md`

---

### Task 6: Value-stack anchors, Hormozi numbers (playbook-configs.ts)

**Files:**
- Modify: `src/lib/playbook-configs.ts`
- Modify: `src/lib/tiers.ts` (reminder comments only)

- [ ] **Step 1: Read playbook-configs.ts to map all value-stack sections**

Read the full file. For each of the 8 playbook slugs, identify the `valueStack.sections` array and `totalValue` field. Note the exact line numbers for every `value:` field.

- [ ] **Step 2: Update $127 standard playbook value stacks (5 slugs)**

For each of `dui-first-offense`, `drug-possession`, `probation-violation`, `sex-offense` (4 slugs, NOT self-defense, handled separately in Step 2b):

Update the `valueStack.sections[].value` fields using these mappings:

| Component pattern (match by title) | Old value | New value |
|-------------------------------------|---------, |---------, |
| Contains "Emergency" or "Book 1" | `"$97"` | `"$197"` |
| Contains "Charge Reality" or "Reality Report" | `"$297"` | `"$347"` |
| Contains "Questions" | `"$197"` | `"$297"` |
| Contains "Roadmap" or "Stage" | `"$97"` | `"$197"` |
| Contains "Red Flag" or "Checklist" or "Evidence" | `"$97"` | `"$197"` |
| Contains "Scorecard" or "Progress" | `"$97"` | `"$197"` |

Update `totalValue` from `"$882"` to `"$1,432"`.

Add `// anchor:SLUG` marker comment after each `value:` field. Example for dui-first-offense:

```typescript
{
  title: "Emergency Playbook (Book 1)",
  desc: "What to do right now. First 72 Hours checklist, DMV deadline alert, 5 Priority Questions, crisis resources. Start here.",
  value: "$197", // anchor:dui-first-offense
},
{
  title: "Charge Reality Report",
  desc: "DUI first offense elements explained in plain English...",
  value: "$347", // anchor:dui-first-offense
},
{
  title: "26 Questions That Change How Your Next Attorney Meeting Goes",
  desc: "Derived from 40+ elite defense attorneys...",
  value: "$297", // anchor:dui-first-offense
},
{
  title: "DUI Case Stage Roadmap",
  desc: "Arrest through resolution timeline with milestones...",
  value: "$197", // anchor:dui-first-offense
},
{
  title: "Red Flag Checklist",
  desc: "12 specific things that could get evidence thrown out...",
  value: "$197", // anchor:dui-first-offense
},
{
  title: "Case Progress Scorecard",
  desc: "Rate your attorney on 10 behaviors before it's too late to switch...",
  value: "$197", // anchor:dui-first-offense
},
```

And the total:
```typescript
totalValue: "$1,432",
```

Repeat for all 4 standard playbook slugs (NOT self-defense). Each has a different slug in the `// anchor:SLUG` comment matching its own tier slug.

- [ ] **Step 2b: Update self-defense value stack (7 components, non-standard)**

The `self-defense` playbook has 7 components with unique titles and values (lines 1300-1338). It does NOT follow the standard 6-component pattern. Update using this exact mapping:

| Exact title | Old value | New value |
|-------------|---------, |---------, |
| "Emergency Playbook (Book 1)" | `"$97"` | `"$197"` |
| "26 Attorney Questions" | `"$250"` | `"$297"` |
| "Five-Element Self-Defense Guide" | `"$150"` | `"$197"` |
| "11-Stage Case Roadmap" | `"$125"` | `"$197"` |
| "12-Point Red Flag Checklist" | `"$100"` | `"$197"` |
| "Attorney Scorecard + Meeting Templates" | `"$75"` | `"$150"` |
| "Charge Reality Report" | `"$85"` | `"$197"` |

Sum: $197 + $297 + $197 + $197 + $197 + $150 + $197 = $1,432

Update `totalValue` from `"$882"` to `"$1,432"`.

Add `// anchor:self-defense` marker to each `value:` field.

- [ ] **Step 3: Update $147 premium playbook value stacks (3 slugs)**

For each of `white-collar`, `federal-criminal`, `drug-trafficking`:

| Component pattern (match by title) | Old value | New value |
|-------------------------------------|---------, |---------, |
| Contains "Emergency" or "Book 1" | `"$97"` | `"$247"` |
| Contains "Charge Reality" or "Reality Report" | `"$297"` | `"$497"` |
| Contains "Questions" | `"$197"` | `"$347"` |
| Contains "Roadmap" or "Stage" | `"$97"` | `"$247"` |
| Contains "Red Flag" or "Checklist" or "Evidence" | `"$97"` | `"$197"` |
| Contains "Scorecard" or "Progress" | `"$97"` | `"$197"` |

Update `totalValue` from `"$882"` to `"$1,732"`.

Add `// anchor:SLUG` markers with the premium playbook's own slug.

- [ ] **Step 4: Add reminder comments in tiers.ts**

For each of the 8 playbook slugs in `TIER_CORE`, add this comment block directly above the slug key:

```typescript
// When changing this price, also update valueStack in playbook-configs.ts
// Rule: 10x minimum multiple, no single component below product price
"dui-first-offense": {
```

The 8 slugs: `dui-first-offense`, `drug-possession`, `probation-violation`, `white-collar`, `sex-offense`, `federal-criminal`, `drug-trafficking`, `self-defense`.

- [ ] **Step 5: Verify value-stack math**

Manually check all 8 playbook totals:
- Standard ($127): $197 + $347 + $297 + $197 + $197 + $197 = $1,432 (11.3x)
- Premium ($147): $247 + $497 + $347 + $247 + $197 + $197 = $1,732 (11.8x)

Grep for any remaining `"$97"` in `playbook-configs.ts`, should only appear in non-value-stack contexts (like `seoDescription` or copy text). No `$97` should remain in any `value:` field.

Run: `npx tsc,noEmit,skipLibCheck`
Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/playbook-configs.ts src/lib/tiers.ts
git commit -m "refactor(pricing): raise value-stack anchors to Hormozi 10x+ with staleness markers"
```

---

### Task 7: Prose copy template functions (services/[slug]/page.tsx)

**Files:**
- Modify: `src/app/services/[slug]/page.tsx`

- [ ] **Step 1: Read the full PRODUCT_COPY map and rendering code**

Read `services/[slug]/page.tsx` fully. Identify:
1. The type definition for PRODUCT_COPY entries (around line 15)
2. Every `stakes:` field and whether it contains a dollar amount
3. The rendering site where `copy.stakes` is used (around line 638)
4. How the product data (with `priceDisplay`) is available in the component

- [ ] **Step 2: Update the type definition**

Change the `stakes` field type:

```typescript
// Before:
stakes: string;

// After:
stakes: string | ((price: string) => string);
```

- [ ] **Step 3: Convert stakes entries to template functions**

For every PRODUCT_COPY entry where `stakes` contains a dollar amount matching that product's price, convert from a string to a function.

Pattern for each entry, identify the product's canonical price from `products.ts`, then convert:

```typescript
// Example: plea-consequences is $97 in products.ts
// Before:
stakes: "A guilty plea closes doors you don't know are open. The $97 cost of knowing is invisible against those stakes.",

// After:
stakes: (price: string) => `A guilty plea closes doors you don't know are open. The ${price} cost of knowing is invisible against those stakes.`,
```

Important rules:
- Only replace the product's OWN price with `${price}`. Attorney comparison prices ("$200-400", "$2,000-5,000") stay hardcoded.
- If a stakes string contains NO dollar amount matching the product's price, leave it as a plain string.
- Each product may have a different price. Check `products.ts` for the canonical price of each slug before converting.

Process all 36 entries. Grep first to identify which entries have dollar amounts:
```bash
grep -n "stakes:" src/app/services/\[slug\]/page.tsx | grep '\$'
```

- [ ] **Step 4: Update the rendering site**

Find where `copy.stakes` is rendered (around line 638):

```tsx
// Before:
<p className="text-zinc-300 leading-relaxed">{copy.stakes}</p>

// After:
<p className="text-zinc-300 leading-relaxed">
  {typeof copy.stakes === "function" ? copy.stakes(product?.priceDisplay ?? "") : copy.stakes}
</p>
```

Ensure `product` is available in scope. It should come from:
```typescript
import { getProduct } from "@/lib/products";

// Inside the component, where params.slug is available:
const product = getProduct(params.slug);
```

If `getProduct` is not already imported, add it. If `product` is not already in scope at the rendering site, add the lookup. Read the file first to understand the existing data flow.

- [ ] **Step 5: Type-check**

Run: `npx tsc,noEmit,skipLibCheck`
Expected: No new errors. Watch for type errors on the union type, the `typeof` check should satisfy the compiler.

- [ ] **Step 6: Commit**

```bash
git add src/app/services/\[slug\]/page.tsx
git commit -m "refactor(pricing): template functions for prose copy in services/[slug] stakes"
```

---

### Task 8: Staleness detector script + hook configuration

**Files:**
- Create: `scripts/check-price-staleness.mjs`
- Modify: `scripts/hooks/pre-commit` (append price check)

**Important:** The project uses `core.hooksPath = scripts/hooks` (set in package.json `prepare` script). There is an existing `scripts/hooks/pre-commit` with a Blog QA safety gate. Do NOT install husky, it would conflict with this setup. Integrate into the existing hook instead.

- [ ] **Step 1: Verify existing hook infrastructure**

```bash
head -5 scripts/hooks/pre-commit
grep "hooksPath" package.json
```

Expected: existing pre-commit hook at `scripts/hooks/pre-commit`, `core.hooksPath = scripts/hooks` in prepare script.

- [ ] **Step 2: Create the staleness detector script**

Create `scripts/check-price-staleness.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Price Staleness Detector
 *
 * Scans src/ for // anchor:SLUG markers and validates:
 * 1. Each anchor value is >= the canonical product price
 * 2. Each playbook's totalValue matches the sum of its component anchors
 *
 * Runs as a pre-commit hook when tiers.ts or products.ts changes.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const SRC_DIR = join(import.meta.dirname, "..", "src");
const TIERS_FILE = join(SRC_DIR, "lib", "tiers.ts");
const PRODUCTS_FILE = join(SRC_DIR, "lib", "products.ts");

// ── Extract canonical prices from source files ──

function extractPrices(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const prices = {};
  // Match patterns like: "case-decoder": { ... price: 19700, ... priceDisplay: "$197", ...
  const slugRegex = /"([a-z0-9-]+)":\s*\{[^}]*?priceDisplay:\s*"(\$[\d,]+)"/gs;
  let match;
  while ((match = slugRegex.exec(content)) !== null) {
    prices[match[1]] = match[2];
  }
  return prices;
}

function parseDollar(str) {
  return parseInt(str.replace(/[$,]/g, ""), 10);
}

// ── Scan for anchor markers ──

function scanFiles(dir, results) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory() && entry !== "node_modules" && entry !== ".next") {
      scanFiles(fullPath, results);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      const content = readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const anchorMatch = line.match(/\/\/\s*anchor:([a-z0-9-]+)/);
        if (anchorMatch) {
          const slug = anchorMatch[1];
          const dollarMatch = line.match(/\$([\d,]+)/);
          if (dollarMatch) {
            results.push({
              file: relative(join(SRC_DIR, ".."), fullPath),
              line: i + 1,
              slug,
              value: `$${dollarMatch[1]}`,
              valueNum: parseDollar(`$${dollarMatch[1]}`),
            });
          }
        }
      }
    }
  }
  return results;
}

// ── Main ──

console.log("Scanning src/ for price markers...");

const tierPrices = extractPrices(TIERS_FILE);
const productPrices = extractPrices(PRODUCTS_FILE);
const canonical = { ...productPrices, ...tierPrices }; // tiers override products for dual-registered

const anchors = scanFiles(SRC_DIR, []);
console.log(`Found ${anchors.length} anchor markers\n`);

let failures = 0;

// Check each anchor >= canonical price
console.log("Checking anchors against canonical prices...");
for (const a of anchors) {
  const canonicalPrice = canonical[a.slug];
  if (!canonicalPrice) {
    console.log(`  ${a.file}:${a.line}, anchor:${a.slug} WARNING: slug not found in canonical sources`);
    failures++;
    continue;
  }
  const canonicalNum = parseDollar(canonicalPrice);
  if (a.valueNum < canonicalNum) {
    console.log(`  ${a.file}:${a.line}, anchor:${a.slug} value ${a.value} < product price ${canonicalPrice} FAIL`);
    failures++;
  }
}

// Check totalValue sums for playbook configs
console.log("\nChecking totalValue sums...");
const configContent = readFileSync(join(SRC_DIR, "lib", "playbook-configs.ts"), "utf-8");

const PLAYBOOK_SLUGS = [
  "dui-first-offense", "drug-possession", "probation-violation",
  "white-collar", "sex-offense", "federal-criminal",
  "drug-trafficking", "self-defense",
];

for (const slug of PLAYBOOK_SLUGS) {
  const slugAnchors = anchors.filter(
    (a) => a.slug === slug && a.file.includes("playbook-configs")
  );
  if (slugAnchors.length === 0) {
    console.log(`  ${slug}: no anchors found, SKIP`);
    continue;
  }
  const sum = slugAnchors.reduce((acc, a) => acc + a.valueNum, 0);

  // Find totalValue for this slug's config block
  // Look for totalValue near the anchors
  const totalMatch = configContent.match(
    new RegExp(`slug:\\s*"${slug}"[\\s\\S]*?totalValue:\\s*"\\$(\\d[\\d,]*)"`)
  );
  if (!totalMatch) {
    // Try finding it by proximity to the slug's anchor markers
    console.log(`  ${slug}: totalValue not found by slug match, SKIP`);
    continue;
  }
  const totalNum = parseDollar(`$${totalMatch[1]}`);
  if (totalNum !== sum) {
    console.log(`  ${slug}: totalValue $${totalMatch[1]} != component sum $${sum.toLocaleString()} FAIL`);
    failures++;
  } else {
    console.log(`  ${slug}: totalValue $${totalMatch[1]} matches component sum OK`);
  }
}

// Result
console.log(`\nRESULT: ${anchors.length} markers checked, ${failures} mismatches`);
process.exit(failures > 0 ? 1 : 0);
```

- [ ] **Step 3: Test the detector**

Run: `node scripts/check-price-staleness.mjs`

Expected: Should find all the anchor markers from Task 6 and report 0 mismatches (since we just set them to correct values). If Task 6 is not yet done, the script should find 0 markers.

- [ ] **Step 4: Append price check to existing pre-commit hook**

Read `scripts/hooks/pre-commit` fully. Append this block at the end of the file:

```bash
# ── Price staleness check ──
# When tiers.ts or products.ts is staged, verify value-stack anchors
# are still above product prices. Blocks commit on mismatch.
STAGED_FILES=$(git diff,cached,name-only)
if echo "$STAGED_FILES" | grep -qE "src/lib/(tiers|products)\.ts$"; then
  echo "[price-check] tiers.ts or products.ts staged, running staleness detector..."
  node scripts/check-price-staleness.mjs
  if [ $? -ne 0 ]; then
    echo "[price-check] BLOCKED: Price staleness detected. Fix value-stack anchors before committing."
    exit 1
  fi
  echo "[price-check] All anchors valid."
fi
```

Do NOT install husky or lint-staged. Do NOT create `.husky/` directory. The project uses `core.hooksPath = scripts/hooks` with an existing Blog QA pre-commit gate that must be preserved.

- [ ] **Step 5: Test the hook**

Run the detector directly:
```bash
node scripts/check-price-staleness.mjs
```

Expected: All markers checked, 0 mismatches.

Then test hook integration, make a trivial whitespace change to `tiers.ts`, stage it, run the hook:
```bash
bash scripts/hooks/pre-commit
```

Expected: Blog QA gate passes (no MDX staged), then price check runs detector, passes.

Revert the trivial change:
```bash
git checkout src/lib/tiers.ts
```

- [ ] **Step 6: Commit**

```bash
git add scripts/check-price-staleness.mjs scripts/hooks/pre-commit
git commit -m "feat(pricing): add staleness detector integrated into existing pre-commit hook"
```

---

### Task 9: Documentation (PRICING-ARCHITECTURE.md + CLAUDE.md)

**Files:**
- Create: `src/lib/PRICING-ARCHITECTURE.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Create PRICING-ARCHITECTURE.md**

Create `src/lib/PRICING-ARCHITECTURE.md` with the full content from the spec's Layer 5 section. The content is in the detail spec at `2026-04-14-dynamic-pricing-design-layers.md` under "Layer 5: LLM-Facing Documentation, Full Content". Copy the markdown block from within the code fence verbatim.

- [ ] **Step 2: Update CLAUDE.md**

Read `CLAUDE.md` first to find the right location. Add after the existing "Products & Pricing" or "What This Project Is" section:

```markdown
## Pricing Architecture
All prices come from `tiers.ts` (TIER_CORE) and `products.ts` (STANDALONE_PRODUCTS).
NEVER hardcode prices in components or pages. See `src/lib/PRICING-ARCHITECTURE.md` for the full three-layer system (mechanical, value-stack anchors, prose template functions).
When changing prices, the pre-commit hook validates automatically via `scripts/check-price-staleness.mjs`.
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/PRICING-ARCHITECTURE.md CLAUDE.md
git commit -m "docs(pricing): add PRICING-ARCHITECTURE.md and CLAUDE.md pricing section"
```

---

### Task 10: Verification sweep

**Files:** None modified, read-only verification.

- [ ] **Step 1: Type-check the entire project**

Run: `npx tsc,noEmit,skipLibCheck`
Expected: Only pre-existing errors in `tests/cross-validator.test.ts` and `tests/mechanical-extractor.test.ts`. Zero new errors.

- [ ] **Step 2: Grep for remaining hardcoded prices in src/**

Run these greps to find any remaining hardcoded prices that should have been converted:

```bash
# Check for $97 in non-comment, non-products.ts, non-tiers.ts files
grep -rn '"\$97"' src/,include="*.tsx",include="*.ts" | grep -v node_modules | grep -v products.ts | grep -v tiers.ts | grep -v playbook-configs.ts | grep -v "// " | grep -v ".test."

# Check for $197 outside of canonical sources (allow products.ts, tiers.ts)
grep -rn '"\$197"' src/,include="*.tsx",include="*.ts" | grep -v node_modules | grep -v products.ts | grep -v tiers.ts | grep -v playbook-configs.ts | grep -v "// " | grep -v ".test."

# Check for $997, $2,497, $4,997, $9,997 outside canonical sources
grep -rn '"\$[0-9,]*997"' src/,include="*.tsx",include="*.ts" | grep -v node_modules | grep -v tiers.ts | grep -v "// " | grep -v ".test."
```

Expected: Zero results for prices that should be dynamic. Legitimate matches (testimonials, competitor comparisons) are acceptable.

- [ ] **Step 3: Run staleness detector**

Run: `node scripts/check-price-staleness.mjs`
Expected: All markers checked, 0 mismatches.

- [ ] **Step 4: Verify excluded items are truly legitimate**

Spot-check these known legitimate hardcodings:
- Homepage testimonial: "$15,000 I paid my attorney", verify it's a quote, not a product price
- PricingTable.tsx: "$197+", verify it's a threshold description
- Competitor comparisons in services/[slug] stakes: "$200-400", "$2,000-5,000", verify these are attorney rate comparisons, not product prices

- [ ] **Step 5: Push to deploy**

```bash
git push origin master
```

Post-deploy spot-checks on production:
1. Homepage charge cards, each shows correct playbook price ($127 or $147)
2. /playbook/dui-first-offense, value stack shows $1,432 total, no $97 components
3. /services/plea-consequences, stakes copy shows correct product price
4. /judge-report-card, hero shows $197
5. /officer-background-check, hero shows $97
6. Blog post with PillarCTA, shows correct tier price

---

## Task Dependency Map

```
Task 1 (Component CTAs) ──┐
Task 2 (Page CTAs) ───────┤
Task 3 (Tier 9 pages) ────┤── All independent, can run in parallel
Task 4 (Checkout+renderer)┤
Task 5 (Backend files) ───┘
                           │
Task 6 (Value-stack) ──────┤── Independent of Tasks 1-5
                           │
Task 7 (Prose copy) ───────┤── Independent of Tasks 1-6
                           │
Task 8 (Staleness detector)┤── Should run AFTER Task 6 (needs anchor markers to validate)
                           │
Task 9 (Documentation) ────┤── Independent, can run anytime
                           │
Task 10 (Verification) ────┘── Must run LAST, after all other tasks
```

Tasks 1-5 can be dispatched as parallel subagents. Task 6, 7, 8, 9 can also run in parallel (except Task 8 should run after Task 6). Task 10 is the final gate.
