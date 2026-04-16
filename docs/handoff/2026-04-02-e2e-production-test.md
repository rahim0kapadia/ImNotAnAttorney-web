# Handoff: End-to-End Production Test
Date: 2026-04-02 02:15

## Task
Run a full end-to-end production test of the Case Decoder flow, the LAST technical blocker before go-live. This means running a real purchase through: Stripe test checkout → webhook → intake form → report generation → UPL evaluation → operator review → delivery email. Every step must work in production (Vercel + Supabase + Resend + Claude API).

## Context
- **All 8 playbooks are LIVE** ($97 each, Stripe live mode) since Mar 24
- **Service tiers ($197-$9,997) are test mode**, blocked on this E2E test + Rahim's go-ahead
- **Cron system just overhauled**, 27 fixes across P1/P2/P3 pushed to production (commits `61eac91`, `23557cd`, `3e07817`)
- **New RPC deployed**: `acquire_cron_lock` (migration 033) already live in Supabase
- **Go-live blockers status**: all done EXCEPT this E2E test and final Stripe live mode switch

## What Was Done This Session (Cron Review)
All 27 cron findings fixed and deployed:
- P1 (5 fixes): data corruption, security leak, idempotency locks, race conditions, broken monitoring
- P2 (9 fixes): N+1 queries (258→1, 450→3, 200→10), wall-time guards, atomic lock RPC, after() pattern
- P3 (13 fixes): validation, error propagation, FK cleanup, slug collision cap, cron_executions retention
- `demand_scores` table deduped: 1,539→81 rows

## Key Files for E2E Test
- `C:\Users\email\projects\ImNotAnAttorney-web\ARCHITECTURE.md`, read first
- `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\CONTEXT.md`, core business logic
- `C:\Users\email\projects\ImNotAnAttorney-web\supabase\CONTEXT.md`, DB + Edge Functions
- `C:\Users\email\projects\ImNotAnAttorney-web\.env.local`, all API keys
- `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\tiers.ts`, tier configs + live flags

## E2E Test Steps (Suggested)
1. Verify deployment, hit imnotanattorney.com and confirm latest code is live
2. Create test Stripe checkout, use Case Decoder tier ($197, test mode) via /api/checkout
3. Simulate webhook, trigger checkout.session.completed event via Stripe CLI or test helper
4. Verify case created, check cases table for new row with status = pending
5. Submit intake form, POST to /api/intake with test data
6. Verify generation triggers, check Edge Function generate-report fires
7. Wait for generation, monitor cases.status (should reach review within 5 min)
8. Verify UPL evaluation, evaluate-report Edge Function should run
9. Operator delivery, hit /api/deliver with operator secret
10. Verify email received, check Resend logs
11. Verify drip enrollment, check drip_state for post-purchase sequence

## Verification Commands
- `npx tsc,noEmit,skipLibCheck`, TypeScript check
- `npx supabase db query,linked "SELECT id, status, evaluation_status FROM cases ORDER BY created_at DESC LIMIT 5"`, check case states
- `npx supabase db query,linked "SELECT job_name, status, started_at FROM cron_executions ORDER BY started_at DESC LIMIT 10"`, verify cron health

## Gotchas
- Edge Function generate-report has 150s timeout; Opus can take 250-294s. Backup worker (batch-poll cron every 5 min) picks up stuck cases.
- Stripe test mode uses STRIPE_SECRET_KEY (not _LIVE). Case Decoder tier has live: false in tiers.ts.
- batch-poll route now has idempotency lock (P1-03 fix), verify it does not skip legitimate polling.
- cron-idempotency.ts now has staleThresholdMs option, demand routes use custom thresholds.
