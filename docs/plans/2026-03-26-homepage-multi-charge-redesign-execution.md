# Homepage Multi-Charge Redesign — Execution Plan

## Context
- **Repo:** ImNotAnAttorney-web
- **Problem:** Homepage is DUI-only. Must become umbrella for all 8 charge types + 5 service tiers.
- **Spec:** `docs/superpowers/specs/2026-03-26-homepage-multi-charge-redesign.md`
- **Tech stack:** Next.js 15 App Router, Tailwind CSS, TypeScript, `src/lib/tiers.ts` as single source of truth
- **Key files:**
  - `src/app/page.tsx` — homepage server component (hero hardcoded to DUI)
  - `src/components/ChargeTypeSelector.tsx` — charge picker (Task 1 complete)
  - `src/components/HomepageHero.tsx` — to be created (Task 2)
  - `src/lib/tiers.ts` — TIER_CORE, TierSlug

## Tasks

### Task 1 — Rewrite ChargeTypeSelector (DONE)
- 8 charges + onSelect callback wired
- Committed

### Task 2 — Create HomepageHero client component (IN PROGRESS)
- File: `src/components/HomepageHero.tsx`
- Extracts hero from page.tsx into `"use client"` component
- ChargeTypeSelector drives CTA text + href dynamically
- Default CTA: Case Decoder when no charge selected
- Selected charge: routes to `/checkout?tier=<slug>`

### Task 3 — Swap hero in page.tsx + fix DUI hardcodes
- Replace inline hero sections with `<HomepageHero />`
- Remove the standalone `<ChargeTypeSelector />` section (now inside HomepageHero)
- Fix 6 DUI-specific hardcodes in page.tsx
- Update meta title/description to umbrella framing

### Task 4 — Playbook Catalog grid + knowsAbout schema
- Add catalog grid section showing all 8 charge types
- Update Organization schema `knowsAbout` array

### Task 5 — Diversify testimonials + add family buyer
- Add family buyer segment testimonial
- Diversify existing testimonials by charge type

### Task 6 — Verification
- `npx tsc --noEmit`
- `grep -r "dui-first-offense" src/app/page.tsx` (should be 0)
- Visual check via Puppeteer screenshot
