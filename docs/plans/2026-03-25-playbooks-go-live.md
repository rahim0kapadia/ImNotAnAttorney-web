# Plan: Flip All 8 Playbooks to Live Stripe

## Context
- **Repo:** ImNotAnAttorney-web
- **Problem:** 7 of 8 playbooks still using test Stripe keys. DUI already live since Mar 24.
- **Key files:** `src/lib/tiers.ts`
- **Tech stack:** Next.js 15, Stripe dual-mode (live flag per tier)
- **Key decisions:** All playbooks go live simultaneously — downloads verified working for all charge types.

## Tasks

1. Edit `src/lib/tiers.ts` — set `live: true` on all 7 remaining playbook tiers, then run `npx tsc --noEmit --skipLibCheck` to verify
