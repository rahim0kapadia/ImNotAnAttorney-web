# Identity Shift + Plain-Language Copy Pass

## Date: 2026-03-12

## Agent Assignment (no file overlap)

### Agent A — Identity + Story + Family (10 files)
- `src/app/about/page.tsx` — A1 (collective rewrite), C1 (DUI story), C2 (federal story)
- `src/app/page.tsx` — A2 (anonymous proof), D1 (family pain point), D2 (inclusive language)
- `src/app/layout.tsx` — A3 (remove named founder from JSON-LD)
- `src/app/terms/page.tsx` — A4 (Rahim -> ImNotAnAttorney)
- `src/app/privacy/page.tsx` — A5 (Rahim -> ImNotAnAttorney)
- `src/app/api/subscribe/route.ts` — A6 (collective welcome email)
- `src/lib/drip-emails.ts` — A7 (verify no personal references)
- `src/app/intake/page.tsx` — A8 (placeholder case number)
- `src/app/intake/intelligence-brief/page.tsx` — A8 (placeholder case number)
- `content/blog/what-500-pages-of-drug-trafficking-discovery-contained.mdx` — A9 (remove "R")

### Agent B — Services + Checkout (2 files)
- `src/app/services/page.tsx` — B1 (tier descriptions), D3 (family callout), E1 (meta title)
- `src/app/checkout/page.tsx` — A8 (placeholder), B5 (feature clarifiers), C3 (tier stories)

### Agent C — Blog Plain-Language (6 files)
- `content/blog/should-you-take-the-plea-deal.mdx` — B4
- `content/blog/discovery-rights-drug-cases.mdx` — B4
- `content/blog/what-motions-should-your-attorney-be-filing.mdx` — B4
- `content/blog/trafficking-charges-constructive-possession.mdx` — B4
- `content/blog/can-dui-be-dismissed.mdx` — B4
- `content/blog/what-happens-at-arraignment.mdx` — B4

### Post-agent (CC main)
- B2: Homepage legal terms (page.tsx — after Agent A)
- B3: About page legal terms (about/page.tsx — after Agent A)

## Verification
1. `npx tsc --noEmit --skipLibCheck`
2. Grep for "Rahim" in .tsx pages
3. Grep for "23-01773-CF" in customer-facing files
