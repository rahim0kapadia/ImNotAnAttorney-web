# Handoff: Cross-Project Auth, Review & Cron Decomposition
Date: 2026-03-22 03:30

## Task
Massive session covering 4 areas: (1) cross-pollinate auth/infrastructure between INNA and TasteDrop, (2) full-site code review of INNA, (3) fix all issues found, (4) decompose 2087-line cron handler.

## What Was Built (15 commits on INNA, 1 on TasteDrop)

### INNA — New Features
- **Auth Guard Library** (`src/lib/auth/guards.ts`) — typed `requireAdmin()`, `requireOperatorSecret()`, `requireCron()` with HMAC-then-compare (no length oracle). 20 routes migrated from scattered inline checks.
- **Feature Flags** (`src/lib/feature-flags.ts` + `src/app/api/admin/feature-flags/route.ts` + migration 021) — DB-backed flags with 5-min cache, tier scoping, admin CRUD API. Completely separate from `tier.live` (Stripe routing).
- **Customer My Cases Portal** — magic link auth mirroring partner system. Files: `src/lib/customer-auth.ts`, `src/lib/customer-helpers.ts`, `src/app/api/customer/` (4 routes), `src/app/my-cases/` (3 pages), middleware update, migration 022+023. Cookie: `customer-session`. Feature-gated behind `customer-portal` flag (currently disabled).

### TasteDrop — Rate Limiting
- Added `checkRateLimit` to 6 unprotected endpoints. Commit `d5db6d5`.

## What Was Reviewed (7 agents)
Full-site code review covering auth, payments, cron, security, code quality. Found 6 critical, 11 security warnings, 9 business logic warnings, 11 code quality warnings.

## What Was Fixed (12 commits, 20 issues)

### Critical Payment Fixes
- `productType` bypass — server validates from tierConfig, not client input
- `invoice.payment_failed` handler added for installment failures
- Commission reversal on refund
- Stripe reconciliation checks both test AND live clients
- NaN guard on installment `parseInt(full_price)`
- Playbook credit capped at target tier price

### Security Fixes
- Auth guard length oracle eliminated (HMAC-then-compare)
- Deliver route timing-safe comparison
- Customer portal hardened (email validation, token format, rate limits, session invalidation, URL escaping)
- Feature flag tier_scope bypass fixed
- Rate limiting added to upload/finalize and customer/logout
- Score API info disclosure removed
- Cron defense-in-depth (requireCron guard)

### Code Quality Fixes
- try/catch on req.json() in 6 admin routes
- Customer table expiry indexes (migration 023)
- ISO week calculation corrected
- Feature flags admin: input validation, 404 on missing flag

## Cron Decomposition (3 commits)
- 8 task files under `src/lib/cron/` + `types.ts`
- `src/app/api/cron/drip/route.ts` — 150-line orchestrator (was 2087)
- N+1 fixes in drip-post-purchase.ts and compliance.ts
- Fire-and-forget fetch fix in pipeline.ts

## Business Decisions Made
1. **Situation Room prerequisite** — REMOVED. Pipeline delivers tiers sequentially.
2. **Upload ownership** — Keep email-only. Family/attorneys need access.
3. **Orphaned Stripe coupons** — Leave as-is. Correct per Stripe API.

## Supabase Migrations Applied
All 3 migrations (021, 022, 023) applied to production via Management API.

## Remaining Steps
1. **Register `invoice.payment_failed` in Stripe webhook dashboard** — Rahim must add this event type manually.
2. **Enable customer portal** — flip `customer-portal` feature flag via admin API when ready.
3. **Deploy** — all changes committed but not pushed.

## Verification
- `npx tsc --noEmit --skipLibCheck` — TypeScript compiles
- `wc -l src/app/api/cron/drip/route.ts` — should be 150
- `ls src/lib/cron/` — should show 9 files
- `grep -r "isOperatorAuthorized" src/` — should return nothing
