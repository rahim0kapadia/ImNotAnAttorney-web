# Handoff: Go-Live — Stripe E2E, RLS Audit, Vercel Deploy Fix
Date: 2026-03-24 22:30

## Task
Clear all go-live blockers for ImNotAnAttorney-web: Stripe E2E testing, QA swarm re-run, cron verification, Supabase RLS audit, Vercel env vars, and live Stripe key activation.

## Approach
Dispatched parallel agents for independent audit tasks (RLS, cron, QA) while running E2E sequentially. Fixed issues as found. Activated live Stripe for DUI playbook first (gradual go-live plan).

## What Got Done
1. **Stripe E2E**: All 6 pipelines pass (112/112 assertions) — playbooks, CD, IB, X-Ray, War Room, Situation Room
2. **QA swarm re-run**: 46 routes, 0 broken imports, 0 dead links — PASS
3. **Cron verification**: PASS with 1 bug fixed (branch `main`→`master` in generate-backup)
4. **Supabase RLS audit**: Migration 026 written and applied via Management API — dropped 6 over-permissive policies, enabled RLS on 3 tables, added 14 anon deny policies, restricted 7 SECURITY DEFINER functions
5. **Review issues**: All HIGHs and MEDIUMs verified fixed (P2-21, P2-23, P2-38, P2-40, P2-42)
6. **Stripe products fixed**: 3 price mismatches corrected (IB $797→$997, X-Ray $1497→$2497, War Room $3497→$4997), 2 junk products archived
7. **Live Stripe keys**: `sk_live_*` and `whsec_*` saved to all 3 INAA projects + Vercel
8. **Live webhook endpoint created**: `we_1TEdEGPiLdDv55hyAGg1NcyI`
9. **DUI playbook**: Flipped to `live: true` — verified with `cs_live_*` session in E2E
10. **Vercel deploy fixed**: Removed Pro-only `crons` block and `maxDuration: 300` from vercel.json — was causing "Unexpected error" on every deploy
11. **Correct Vercel account**: Project linked to `rahim-kapadias-projects/imnotanattorney-web` (NOT tastedrops-projects). 19 env vars pushed.
12. **Build succeeded**: Deploy status Ready on rahim-kapadias-projects

## Files Modified
- `src/lib/tiers.ts` — DUI to `live: true`, other 7 playbooks to `live: false as boolean`
- `src/app/api/cron/generate-backup/route.ts` — branch `main`→`master`
- `supabase/migrations/026-rls-audit-remediation.sql` — NEW: RLS hardening (applied to prod)
- `scripts/e2e-all-pipelines.mjs` — regex fix for `cs_live_` session IDs
- `scripts/apply-pending-sql.mjs` — NEW: Supabase Management API migration helper
- `vercel.json` — removed `crons` block, `maxDuration` 300→60
- `.env.local` — added `STRIPE_SECRET_KEY_LIVE` and `STRIPE_WEBHOOK_SECRET_LIVE`
- `ImNotAnAttorney/.env.local` — added live Stripe keys
- `ImNotAnAttorney-engine/.env` — added live Stripe keys

## What Didn't Work
- E2E against production (`imnotanattorney.com`) — Vercel was missing env vars, webhook signature mismatch
- Vercel deploys under `tastedrops-projects` — wrong account, "Unexpected error" for 4+ days
- `vercel.json` with `crons` and `maxDuration: 300` — requires Pro plan, causes instant build failure on Hobby with zero useful error message
- Deleting `.vercel/` directory to relink — broke the project config, don't do this
- Trying to force-move domain across Vercel accounts — not supported

## Remaining Steps
1. **CRITICAL: Assign `imnotanattorney.com` domain** to the correct Vercel project:
   - The domain is stuck on an old project under the wrong account (tastedrops-projects)
   - Rahim needs to release it from there via the Vercel dashboard (https://vercel.com/tastedrops-projects/imnotanattorney-web/settings/domains)
   - Then on the correct account (rahim0kapadia-1967): `npx vercel domains add imnotanattorney.com`
   - **DO NOT login to tastedrops-projects from the CLI** — handle domain removal via dashboard only
   - **WARNING**: Site will be briefly unreachable during this swap. Do it fast.
2. **Verify production checkout** works after domain migration
3. **Flip remaining 7 playbooks to `live: true`** one at a time, E2E verify each
4. **Flip service tiers to `live: true`** (case-decoder first, then IB, X-Ray, War Room, Situation Room)

## Key Decisions
- Gradual go-live: one tier at a time, DUI playbook ($97) first
- Crons via cron-job.org, NOT Vercel crons (Hobby plan limitation)
- RLS audit: all fixes are defense-in-depth (app uses service_role which bypasses RLS)
- E2E script signs webhooks with test secret; server tries both secrets (test + live) — works for both modes

## Verification
- `npx vercel whoami` — must show `rahim0kapadia-1967`
- `npx vercel ls` — should show Ready deployment under `rahim-kapadias-projects`
- `npx tsc --noEmit --skipLibCheck` — TypeScript clean
- `NEXT_PUBLIC_SITE_URL=http://localhost:3000 node scripts/e2e-all-pipelines.mjs` — all 6 pipelines pass

## Account Reference
| Service | Account | Team/Org |
|---------|---------|----------|
| Vercel (INAA) | rahim0kapadia-1967 | rahim-kapadias-projects |
| Vercel (TasteDrop) | tastedrop1-dotcom | tastedrops-projects |
| GitHub | rahim0kapadia | cloudculture.sp@gmail.com |
| Stripe | acct_1T2dePB5xpvzEyEn | — |
| Supabase | jxjbjmgdukwkoclydqdr | Management token in ImNotAnAttorney/.env.local |
