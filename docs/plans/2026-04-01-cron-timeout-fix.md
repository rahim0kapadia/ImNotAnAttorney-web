# Cron Route Timeout Fix

## Context
- Repo: ImNotAnAttorney-web
- Problem: demand-fetch and demand-score cron routes timeout on Vercel (default 15s) and cron-job.org (120s limit)
- Root cause: missing maxDuration exports + demand-fetch makes 120 Reddit requests (~180s total)

## Files to Modify
1. `src/app/api/cron/demand-fetch/route.ts` — add maxDuration=300 + dynamic exports
2. `src/app/api/cron/demand-score/route.ts` — add maxDuration=120 + dynamic exports
3. `src/lib/demand/fetch-signals.ts` — change terms.slice(0,2) → terms.slice(0,1) to halve Reddit requests
4. `vercel.json` — add maxDuration entries for both routes

## Tasks
1. Add `export const maxDuration = 300` and `export const dynamic = "force-dynamic"` to demand-fetch/route.ts (DONE)
2. Add `export const maxDuration = 120` and `export const dynamic = "force-dynamic"` to demand-score/route.ts (DONE)
3. Change `terms.slice(0, 2)` to `terms.slice(0, 1)` in fetch-signals.ts line 322
4. Add demand-fetch and demand-score entries to vercel.json functions object
