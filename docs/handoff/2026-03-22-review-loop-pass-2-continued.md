# Handoff: Code Review Loop, Pass 2 (continued)
Date: 2026-03-22 07:30

## Task
Continue autonomous code review loop on ImNotAnAttorney-web. Pass 2 review found 66 issues. 42 have been fixed across 3 commits.

## What Was Done (Pass 2 Fixes)

### Commit `aec58d9`, 28 issues across 27 files
**Security CRITICALs:**
- XSS in unsubscribe page: HTML-escape emailParam in hidden input
- Constant-time webhook signature comparison (resend + resend-inbound)
- BlogInlineCapture source attribution: add blog-inline-* to ALLOWED_SOURCES
- Sanitize inbound email HTML before storage (sanitize-html)

**Payment integrity:**
- Orphaned Stripe coupons: cleanup on failure + delete original in combined path
- Clarify installment commission math

**Cron reliability:**
- Return 409 (not 200) when cron lock not acquired
- Add year to weekly progress dedup key
- Scope purchase suppression query to subscriber emails
- Pre-set generating/auto-generating status before fire-and-forget fetch

**Auth/admin:**
- Use getClientIp() consistently (customer/logout, upload/finalize)
- Reduce in-memory rate limit fallback from 10 to 3 per minute
- Remove report_html from case detail response (saves 200-500KB per request)
- Replace error.message with generic errors in 7 admin routes
- Add .limit() to partners list and referral history
- Add window allowlist on performance route
- Validate firstName as string in intake route
- Update score route docs to reflect aggregate writes
- Footer Situation Room link to /intake

### Commit `8925fd3`, 8 issues
- customer-lifecycle: upsert subscriber for dedup (non-subscriber duplicate emails)
- operator-alerts: same fix for awaiting-intake + escalation emails
- Both intake routes: wrap req.json() in try/catch returning 400
- intake: sanitize firstName (strip \r\n for header injection)

### Commit `a0ea922`, 6 issues (N+1 batch)
- reconciliation: batch-fetch existing orders by session IDs
- customer-lifecycle: batch-fetch paid orders + dedup for abandoned checkout
- monitoring: batch subscribers + dedup for weekly progress (3N to 2 queries)

## Full Review Report
`docs/reviews/2026-03-22-pass2-review.md`, 66 issues (P2-1 through P2-66)

## Remaining Issues (24 unfixed)

### HIGH, N+1 queries still open
- **P2-17:** N+1 in pipeline completion check (`pipeline.ts:123-126`)
- **P2-18:** N+1 in operator-alerts, 5 sections (`operator-alerts.ts:281-580`)
- **P2-19:** N+1 in drip-post-purchase (`drip-post-purchase.ts:123-132,208-213`)
- **P2-21:** Commission reversal race condition, non-atomic read-then-write (`stripe/route.ts:936-963`)
- **P2-23:** Metrics full table scans in JavaScript (`operator/metrics/route.ts:42-50`)
- **P2-25:** select("*") across 5 operator queries (partially done, report_html removed)

### MEDIUM, still open
- **P2-35:** Reconciliation can create duplicate orders (no upsert guard)
- **P2-36:** Dead-code status filter in drip-post-purchase
- **P2-37:** Discount loop can attribute order to multiple partners (no break)
- **P2-38:** One-time coupon on subscription only discounts first installment
- **P2-39:** N+1 in webhook included-tier dedup
- **P2-40:** Admin demand routes missing id/notes type validation
- **P2-42:** Operator tasks ID/notes not validated
- **P2-43:** Admin emails PATCH id not validated
- **P2-45:** StatusBadge duplicated across 4-5 files

### LOW, skip or quick fix
- P2-51 through P2-66 (rate limiting, ARIA, code duplication, minor cleanup)

## Verification
- `cd C:/Users/email/projects/ImNotAnAttorney-web && npx tsc,noEmit,skipLibCheck`, compiles clean
- `cd C:/Users/email/projects/ImNotAnAttorney-web && git log,oneline -5`, verify commits

## Recommended Next Steps
1. Continue fixing remaining HIGHs (N+1 queries, metrics full-scan, commission race)
2. Fix remaining MEDIUMs (input validation batch, StatusBadge extraction)
3. Run Pass 3 review to verify clean
4. Repeat until clean

## Business Decision (carried from Pass 1)
- **Social proof (#13):** DEFERRED. Will swap fake for real data as purchases come in.
