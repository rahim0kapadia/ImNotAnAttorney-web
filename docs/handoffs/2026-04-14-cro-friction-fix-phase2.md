# Handoff: CRO Friction Fix — Phase 2-5

Date: 2026-04-14 14:12

## Task

Executing the CRO friction fix plan at:
  `C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-14-cro-friction-fix.md`

Phase 1 (revenue-blocking bugs) is DONE and committed (`f018d5c`). Phases 2-5 remain.

## Approach

Plan has 15 tasks across 5 phases. Phase 1 (Tasks 1-4) fixed stale $97 prices, charge card mismatch, StickyMobileCTA routing, and BlogCTA fallback. All verified via tsc + grep. Committed with prior uncommitted changes (ScoreClient, Header, Footer, pillar-registry).

## Files Modified (Phase 1 — committed as `f018d5c`)

- `src/components/HomepageHero.tsx` — "$97 each" → dynamic `from ${TIER_CORE["dui-first-offense"].priceDisplay}`
- `src/app/playbooks/page.tsx` — stripped $97 from metadata, hero subtitle now dynamic
- `src/app/page.tsx` — charge cards pull price from each card's actual playbook tier (was hardcoded DUI price)
- `src/components/StickyMobileCTA.tsx` — href `/start` → `/score`, label "Check Your Defense — Free"
- `src/components/BlogCTA.tsx` — general-defense fallback → `case-decoder` (was `dui-first-offense`), added `isCaseDecoder` flag for copy that reflects 15 questions + 48hr delivery
- `src/app/score/ScoreClient.tsx` — (prior session) quiz Q8→Q1 reorder, charge param support
- `src/components/Header.tsx` — (prior session) "Get Started" → /score
- `src/components/Footer.tsx` — (prior session) "Get Started" → /score
- `src/data/pillar-registry.json` — (prior session) backfill data

## What Didn't Work

- First attempt to edit `playbooks/page.tsx` hero subtitle was blocked by anti-thrash hook (two edits to same file in one batch). Fixed by re-reading the file between edits.
- `head` piped from Bash blocked by hook. Used raw tsc output instead.

## Remaining Steps

### Phase 2: High-Leverage CRO Wins (Tasks 5-8)
5. Add buy CTA after DiscoveryReveal section (`src/components/motion/DiscoveryReveal.tsx` ~line 216)
6. Swap BlogCTA primary button to direct checkout (`src/components/BlogCTA.tsx` ~line 118)
7. Add buy CTAs after How It Works + value anchor on homepage (`src/app/page.tsx`)
8. Add paid CTA to /family page (`src/app/family/page.tsx`)

### Phase 3: Trust Gaps (Tasks 9-11)
9. Add guarantee + delivery time to /sample CTAs (`src/app/sample/page.tsx`)
10. Add TrustBadges + guarantee to standalone checkout (`src/app/checkout/page.tsx`)
11. Fix /contact confidentiality + /resources dead guide cards

### Phase 4: Email Gaps (Tasks 12-13)
12. Add post-purchase drip for all 8 playbook types (`src/lib/drip-emails.ts`)
13. Add Extra Witness post-purchase sequence

### Phase 5: Verification + Ship (Tasks 14-15)
14. Full type-check + verification sweep (grep $97, /start CTAs, visual checks)
15. Git push to deploy

## Verification

- `cd C:/Users/email/projects/ImNotAnAttorney-web && npx tsc --noEmit --skipLibCheck` — pre-existing errors in tests/ only
- `grep -r '\$97' src/components/ src/app/playbooks/` — should be zero matches in Phase 1 files
- Branch is 3 commits ahead of origin (2 prior + 1 Phase 1). Push at Phase 5.

## Key Context

- Plan path: `C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-14-cro-friction-fix.md`
- Site is LIVE — changes deploy on git push via Vercel
- Pre-existing tsc errors in `tests/cross-validator.test.ts` and `tests/mechanical-extractor.test.ts` (unrelated)
- BlogCTA now has `isCaseDecoder` flag — Phase 2 Task 6 should build on this when swapping primary button
- Expert consultation hook may fire on page.tsx / landing page edits — plan was already Peep Laja-reviewed
