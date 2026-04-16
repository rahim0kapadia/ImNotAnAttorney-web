# Dynamic Pricing Architecture, Design Spec

**Date:** 2026-04-14
**Repo:** `C:\Users\email\projects\ImNotAnAttorney-web\`
**Problem:** 80+ hardcoded price strings across 20+ files. Playbook prices raised from $97 to $127/$147 but 28 value-stack anchors and multiple CTAs still show $97. Next price change creates the same mess.
**Solution:** Three-layer pricing architecture, dynamic mechanical prices, intentional value-stack anchors, templated prose copy, with automated staleness detection.
**Detail spec:** See `2026-04-14-dynamic-pricing-design-layers.md` for file-by-file changes.

## Expert Basis

- **Alex Hormozi (Grand Slam Offer):** Value-stack anchors are perceived-value marketing, not system data. 10x minimum multiple. No component anchor below product price. Odd totals over round numbers for believability.
- **Joanna Wiebe (Copyhackers):** Price inside persuasive prose is copy, not a data point. Anchor-to-price distance is a copywriting decision. User chose full templating (Approach C) to eliminate all staleness risk, overriding Wiebe's preference for hand-crafted prose.

## Canonical Pricing Sources (No Changes Needed)

Two files are the single source of truth. Both are complete, every product that shows a price on the site exists in one or both.

| File | Export | What | Count |
|------|------, |------|-------|
| `src/lib/tiers.ts` | `TIER_CORE` | Tier products (playbooks, CD, IB, X-Ray, WR, SR, Tier 9, add-ons) | 18 slugs |
| `src/lib/products.ts` | `STANDALONE_PRODUCTS` | Standalone research products | 44 slugs |

Both export `priceDisplay` (formatted string like `"$197"`), `price` (integer cents like `19700`), and `name`.

Helper functions in `tiers.ts`:
- `tierPriceNum(slug)`, returns price in whole dollars (cents / 100)
- `upgradeCostBetween(fromSlug, toSlug)`, returns display string of cost difference between two tiers
- `upgradePrice(slug)`, returns display string of cost to upgrade to next tier
- `tierDisplayName(slug)`, returns human-readable tier name

Helper function in `products.ts`:
- `getProduct(slug)`, returns full product definition including `priceDisplay`, or undefined

Dual-registered products (matching prices in both files):
- `judge-report-card`, $197 in both
- `officer-background-check`, $97 in both
- `similar-cases-analyzer`, $297 in both

## Architecture Overview

### Layer 1: Mechanical Prices, Dynamic Imports (50 instances, 17 files)

CTA buttons, metadata titles, component props, monitoring labels, email HTML, LLM prompt templates. Replace hardcoded strings with `TIER_CORE[slug].priceDisplay` or `getProduct(slug)?.priceDisplay`.

### Layer 2: Value-Stack Anchors, Hormozi Numbers (28 instances, 1 file)

Marketing perceived-value anchors in `playbook-configs.ts`. Raise to 10x+ multiple. $1,432 total for $127 standard playbooks (11.3x). $1,732 total for $147 premium playbooks (11.8x). No component anchor below product price.

### Layer 3: Prose Copy, Template Functions (30 instances, 4 files)

Prices in persuasive body text. Convert `stakes` fields from `string` to `string | ((price: string) => string)`. Product price passed in at render time. Competitor comparison prices stay hardcoded.

### Layer 4: Staleness Detector, Automated (1 new script)

`scripts/check-price-staleness.mjs` scans for `// anchor:SLUG` markers and validates anchors are >= product price. Runs as pre-commit hook when `tiers.ts` or `products.ts` is staged.

### Layer 5: LLM-Facing Documentation (1 new doc + CLAUDE.md update)

`src/lib/PRICING-ARCHITECTURE.md` documents the three-layer system so any LLM session understands the mechanisms. Brief pointer added to CLAUDE.md.

## Out of Scope

- Testimonial quotes with prices (e.g. "$15,000 I paid my attorney"), legitimate hardcoding
- Competitor/attorney price comparisons in body copy (e.g. "attorneys charge $200-400"), legitimate hardcoding
- Code comments referencing prices (e.g. "raised from $97 to $127"), documentation, not display
- PricingTable.tsx guarantee threshold ("$197+"), low risk, marginal value

## File Summary

| Layer | Files Modified | Files Created |
|-------|---------------|---------------|
| Layer 1 (Mechanical) | 17 | 0 |
| Layer 2 (Value Stack) | 1 (`playbook-configs.ts`) + comments in `tiers.ts` | 0 |
| Layer 3 (Prose) | 1 (`services/[slug]/page.tsx`) | 0 |
| Layer 4 (Detector) | 1 (`package.json` for lint-staged) | 1 (`scripts/check-price-staleness.mjs`) |
| Layer 5 (Documentation) | 1 (`CLAUDE.md`) | 1 (`src/lib/PRICING-ARCHITECTURE.md`) |
| **Total** | **19 modified** (some overlap) | **2 created** |
