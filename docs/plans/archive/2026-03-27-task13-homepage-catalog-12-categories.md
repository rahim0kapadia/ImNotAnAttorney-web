---
# Task 13: Expand Homepage Catalog to 12 Charge Categories + Update knowsAbout Schema

## Context
- Repo: ImNotAnAttorney-web
- Problem: Catalog section currently renders 8 playbook slugs from `allPlaybookSlugs()`. We need 12 fixed charge categories with two CTA variants: playbook link ($97) or /start link ($197).
- Key files: `src/app/page.tsx` (only file modified)
- Tech stack: Next.js 15, Tailwind CSS
- Classification: QUICK_FIX — 2 edits in 1 file

## Files to Modify
- `src/app/page.tsx`
  - Edit 1: Replace `knowsAbout` array (lines ~169-178) with 12 entries
  - Edit 2: Replace PLAYBOOK CATALOG section (lines ~583-621) with static CHARGE_CATEGORIES array

## Files to Create
- None

## Numbered Tasks
1. Update `knowsAbout` in the LegalService JSON-LD schema (lines 169-178)
2. Replace catalog section (lines 583-621): add `CHARGE_CATEGORIES` const + new grid render
3. Run `npx next build` — fix any TypeScript/JSX errors
4. Commit
