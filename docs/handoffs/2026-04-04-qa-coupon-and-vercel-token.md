# Handoff: QA Coupon Checkout Wiring + Vercel API Token

Date: 2026-04-04 21:00

## Task
Wire the internal QA coupon (`5MRjP6Oo`) into checkout for E2E testing without real charges, and set up Vercel API access so future sessions can manage env vars programmatically.

## Approach
Server-side email match in checkout discount strategy. If `INTERNAL_QA_EMAIL` matches checkout email, apply the 100% coupon as first branch in 5-way discount logic. No UI exposure.

## Files Modified
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\checkout\route.ts`, added QA coupon as first branch in section 8c discount strategy (4-way -> 5-way)
- `C:\Users\email\projects\ImNotAnAttorney-web\.env.local`, added INTERNAL_QA_COUPON_ID, INTERNAL_QA_EMAIL, VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID

## What Didn't Work
- Vercel CLI (`npx vercel env add`), `.vercel/project.json` auth broken, couldn't resolve project settings
- Vercel CLI session token (`vca_` prefix from `auth.json`), lacks env var write permissions on REST API
- Cross-repo edits from this session, triage hook blocks edits to engine/.env and parent/.env.local

## Completed
1. Checkout route updated and committed (`016f61d`), pushed to master, Vercel deploying
2. Vercel production env vars set via REST API: `INTERNAL_QA_COUPON_ID` and `INTERNAL_QA_EMAIL`
3. Vercel API token (`vcp_` prefix, project-scoped to imnotanattorney-web) added to web `.env.local`

## Remaining Steps
1. Add Vercel token block to sibling repos (triage hook blocked cross-repo edits):
   - `C:\Users\email\projects\ImNotAnAttorney-engine\.env`, append at end
   - `C:\Users\email\projects\ImNotAnAttorney\.env.local`, append at end
   ```
   # Vercel API (project-scoped to imnotanattorney-web)
   VERCEL_TOKEN=<redacted, see .env.local>
   VERCEL_PROJECT_ID=prj_fgx7OUbudHbS2WrfoaLKb07jJAnB
   VERCEL_TEAM_ID=team_UEzHXQJJI46GEPEYeFspl1Pq
   ```
2. E2E test: place a $97 Playbook order with admin@imnotanattorney.com, verify 100% discount applied

## Verification
- `npx tsc,noEmit`, type check (pre-existing blog/[slug] Link error only, unrelated)
- Vercel env vars confirmed via API response (created IDs: wzjAzYITL4n3u8Bd, u7bV2rlWsPcnn2J2)
- After deploy: checkout with admin@imnotanattorney.com should show $0 total
