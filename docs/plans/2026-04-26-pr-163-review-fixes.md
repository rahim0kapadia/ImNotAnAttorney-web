# PR #163 Review Fixes — Apply All Findings

**Date:** 2026-04-26
**Branch:** fix/audit-services-routing
**PR:** #163
**Scope:** Apply 9 review findings from PR #163 review (F1-F9). One skip (S1) — out of scope.

## Context

PR #163 unblocked bundle 404s on `/services/<slug>` and surfaced invisible standalone products on `/services` index. Review surfaced 9 fixes plus one out-of-scope refactor. Pristine-or-Nothing applies — fix every item.

## Files Touched

1. `src/app/services/page.tsx` — F1, F3, F4, F9
2. `src/app/services/[slug]/page.tsx` — F5, F6, F7
3. `src/app/sitemap.ts` — F2, F8
4. `src/lib/tiers.ts` — F4 (add `description` field on add-ons)

## Plan

### F1 (CRITICAL) — Match tier-ladder card style
File: `src/app/services/page.tsx` lines 893-915.
The new listing cards in IIFE use `border-amber-500/50 bg-zinc-900` (post-discovery section). Tier-ladder cards (lines 798-828) use `flex h-full flex-col rounded-xl border border-zinc-500 bg-zinc-900/50 p-6`. The new cards diverge visually from the existing pattern.
Fix: rewrite renderCard to use `flex h-full flex-col rounded-xl border border-zinc-500 bg-zinc-900/50 p-6 transition-colors hover:border-zinc-400`. Preserve amber-400 price color. Match padding (p-6), radius (rounded-xl), flex column, h-full.

### F2 (WARN) — Dedupe sitemap entries
File: `src/app/sitemap.ts`.
Tier 9 slugs (`judge-report-card`, `officer-background-check`, `similar-cases-analyzer`) have dedicated routes at `/<slug>`. The new serviceProductEntries also adds `/services/<slug>`. Duplicate.
Fix: build `DEDICATED_ROUTE_SLUGS = new Set(["judge-report-card", "officer-background-check", "similar-cases-analyzer"])` at module top. Filter in `serviceProductEntries` builder.

### F3 (WARN) — Derive add-ons dynamically
File: `src/app/services/page.tsx` lines 889-891.
Replace hardcoded `["extra-witness", "witness-pack"]` with derivation from TIER_CORE.
Fix: `const addons = Object.entries(TIER_CORE).filter(([, t]) => t.isAddon === true && t.live !== false).map(([slug]) => ({ slug, tier: TIER_CORE[slug as keyof typeof TIER_CORE] }))`.

### F4 (WARN) — Consistent description field
File: `src/app/services/page.tsx` lines 992-997 + `src/lib/tiers.ts`.
Add-ons section uses `tier.deliveryDetail`. Other categories use `product.description`. Mixed copy fields produce uneven card heights.
Fix: add concrete `description` strings on the two add-on tier definitions in tiers.ts (`extra-witness`: "Extra Witness Intel deep-research add-on for active War Room engagements." and `witness-pack`: "Standalone witness analysis package — 3-5 business day delivery."). In services/page.tsx, prefer `tier.description` when present, else fall back to `tier.deliveryDetail` truncated to 160 chars.

### F5 (WARN) — Verify checkout round-trip for bundles
File: `src/app/services/[slug]/page.tsx` line 646.
VERIFIED via Read of `src/app/api/checkout/route.ts` lines 109-207: `standaloneProduct` accepts ANY slug in STANDALONE_PRODUCTS via `isValidProduct(slug)`. Bundles validate identically to research products. No branching needed.
Fix: add a one-line comment above the CTA documenting the verification path.

### F6 (WARN) — Add value-scaffolding to fallback render
File: `src/app/services/[slug]/page.tsx` lines 629-657.
Bundles get only description + price + CTA. Equivalently-priced research products get full PRODUCT_COPY treatment.
Fix: in the fallback branch, after the description block, add a "What you get" section built from `intakeFields` via a static mapping. Mapping covers common intake field names (state, chargeType, county, judgeName, officerName, sentenceMonths, custodyCredits, prisonType, offenseDate, chargeDate, tollingEvents, priorConvictions, chargeCategory, etc.). Each maps to a clinical sentence. Add a delivery + deliveryDetail block above the CTA. Match disclaimer pattern from copy branch.

### F7 (WARN) — Fix CTA grammar
File: `src/app/services/[slug]/page.tsx` line 649 (and 713 — both render the same string).
Change "Get Your X, $Y" to "Get the X — $Y" on both occurrences.

### F8 (SUGGESTION) — Stable sitemap lastModified
File: `src/app/sitemap.ts` line 75 (within serviceProductEntries).
Change `new Date()` to `new Date("2026-04-26")` matching the literal-date pattern of static entries.

### F9 (SUGGESTION) — Hoist renderCard
File: `src/app/services/page.tsx` lines 893-915.
`renderCard` is defined inside an IIFE on every render. Hoist to top-level function above the page export. Take same args (href, name, priceDisplay, description, key) and return the JSX. Update call sites to use the hoisted function.

### S1 (SKIP) — UPL disclaimer extraction
Out of scope — separate refactor PR planned for centralized UPL disclaimer component.

## Cascade Map
- Us: cleaner cards, no sitemap dupes, less hardcoded glue.
- Direct counterparty (defendant browsing /services): consistent visual rhythm, no ambiguous CTA grammar.
- Downstream (Stripe/checkout): same — bundle path verified working, no surprise breaks.
- Ecosystem (search crawlers): deduped sitemap = clean ranking signals.
- Future-us: dynamic add-on derivation auto-picks future add-ons; hoisted renderCard easier to swap to component later.

## Verification
1. `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck` — 0 errors
2. Visual diff: all listing sections (Reports / Bundles / Calculators / Add-ons) plus tier-ladder share zinc-500 / bg-zinc-900/50 / rounded-xl visual rhythm

## Commit
Single commit, message per spec, with Plan reference. Co-Authored-By footer required.
