# Plan: Add Vercel API Token to INAA .env Files

**Context:**
- Repo: ImNotAnAttorney-web (+ sibling repos)
- Problem: No Vercel API access for env var management, blocked on dashboard
- Key files: `.env.local` (web, parent), `.env` (engine)
- Tech stack: N/A (env config only)
- Key decisions: Project-scoped token (INAA-web only)
- Setup: Token created by Rahim in Vercel dashboard

## Files to Modify
1. `C:\Users\email\projects\ImNotAnAttorney-web\.env.local`
2. `C:\Users\email\projects\ImNotAnAttorney-engine\.env`
3. `C:\Users\email\projects\ImNotAnAttorney\.env.local`

## Files to Create
None.

## Tasks

### Task 1: Add VERCEL_TOKEN to ImNotAnAttorney-web/.env.local
Append after QA coupon block:
```
VERCEL_TOKEN=<redacted, see .env.local>
VERCEL_PROJECT_ID=prj_fgx7OUbudHbS2WrfoaLKb07jJAnB
VERCEL_TEAM_ID=team_UEzHXQJJI46GEPEYeFspl1Pq
```

### Task 2: Add VERCEL_TOKEN to ImNotAnAttorney-engine/.env
Append Vercel token (project ID/team ID same).

### Task 3: Add VERCEL_TOKEN to ImNotAnAttorney/.env.local
Append Vercel token (project ID/team ID same).

### Task 4: Set QA env vars on Vercel via API
Use the new token to POST INTERNAL_QA_COUPON_ID and INTERNAL_QA_EMAIL to Vercel production.
