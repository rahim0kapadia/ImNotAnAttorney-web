# Pricing Architecture, How Prices Work in This Codebase

## Single Source of Truth

ALL product pricing lives in exactly two files:

- `src/lib/tiers.ts`, TIER_CORE object (18 tier products)
- `src/lib/products.ts`, STANDALONE_PRODUCTS object (44 standalone products)

Both export `priceDisplay` (e.g. "$197"), `price` (cents, e.g. 19700), and `name`.

## Three Layers of Price Display

### Layer 1: Mechanical (Dynamic)
CTA buttons, metadata, component props, monitoring labels, email templates, LLM prompts.
These ALWAYS import from tiers.ts or products.ts. NEVER hardcode a price string.
Example: `TIER_CORE["case-decoder"].priceDisplay` not `"$197"`.

### Layer 2: Value-Stack Anchors (Intentional Hardcoding)
File: `src/lib/playbook-configs.ts`, valueStack.sections[].value fields.
These are marketing perceived-value numbers, NOT product prices.
They represent "what you'd pay separately for each component."
Rules:
- No anchor below product price
- 10x minimum total multiple
- Marked with `// anchor:SLUG` for automated checking
- Review when product price changes

### Layer 3: Prose Copy (Template Functions)
File: `src/app/services/[slug]/page.tsx`, PRODUCT_COPY[slug].stakes fields.
Stakes fields are functions: `(price: string) => string`
The product's own price is passed in dynamically at render time.
Competitor comparison prices ("$200-400 for an attorney") stay hardcoded, those are not our prices.

## How to Change a Price

1. Update `price` and `priceDisplay` in `tiers.ts` or `products.ts`
2. Run `git add` and `git commit`
3. Pre-commit hook runs `scripts/check-price-staleness.mjs` automatically
4. If any value-stack anchor is now below the new price, the commit is blocked
5. Fix flagged anchors in `playbook-configs.ts`, re-commit
6. Mechanical prices (Layer 1) and prose prices (Layer 3) update automatically, no manual changes needed

## How to Add a New Product

1. Add entry to `tiers.ts` (TIER_CORE) or `products.ts` (STANDALONE_PRODUCTS)
2. If it has a sales page at /services/[slug]: add PRODUCT_COPY entry with `stakes` as a function receiving price
3. If it has a playbook config: add to `playbook-configs.ts` with value-stack anchors and `// anchor:SLUG` markers
4. Commit, detector validates automatically

## What NOT to Do

- NEVER hardcode a price string ("$197") in a component, page, or template
- NEVER put a value-stack anchor below the product price
- NEVER skip the staleness detector (do not use,no-verify to bypass)
- NEVER display a totalValue that does not match the sum of component values
- NEVER use a price from one product for a different product's display
