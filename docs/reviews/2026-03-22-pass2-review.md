# Deep Code Review: Pass 2
**Date:** 2026-03-22
**Scope:** Full site, focused on remaining MEDIUM/LOW from Pass 1 + regressions
**Agents:** 6 parallel reviewers (payments, auth, cron, admin, public, frontend)
**Raw findings:** 97 issues across all agents (deduplicated below)

---

## CRITICAL, 8 issues

### P2-1. XSS in unsubscribe confirmation page
**File:** `src/app/api/unsubscribe/route.ts:106`
**Bug:** `emailParam` interpolated unescaped in HTML `value` attribute. Crafted base64 can break out of attribute context.
**Impact:** Reflected XSS on imnotanattorney.com, attacker crafts malicious unsubscribe URL.
**Fix:** HTML-escape `emailParam` before interpolation, or validate base64 charset.

### P2-2. Advisory lock via Supabase REST is broken
**File:** `src/app/api/cron/drip/route.ts:85-88`
**Bug:** `pg_try_advisory_lock()` is session-scoped but PostgREST uses connection pooling. Lock acquired on connection A, released on connection B (no-op). Two concurrent crons both succeed.
**Impact:** Duplicate emails, duplicate orders/cases in reconciliation, duplicate operator alerts.
**Fix:** Replace with row-level lock table (`cron_locks` with `locked_until` timestamp).

### P2-3. Lock-not-acquired returns 200 OK
**File:** `src/app/api/cron/drip/route.ts:87`
**Bug:** When lock fails, returns 200. Vercel Cron treats as success, no retry, no alerting.
**Impact:** Entire daily cron cycle silently lost. No nurture emails, no stuck-case detection for 24+ hours.
**Fix:** Return 409 or 503 so Vercel logs it as failure.

### P2-4. Week number dedup key missing year component
**File:** `src/lib/cron/monitoring.ts:107`
**Bug:** Key is `weekly-progress-${id}-w${weekNumber}`, no year. Week 1 of 2027 collides with week 1 of 2026.
**Impact:** Highest-paying customers (War Room/Situation Room) miss weekly progress emails at year boundaries.
**Fix:** Add `${ctx.now.getFullYear()}` to key.

### P2-5. Non-constant-time webhook signature comparison (2 files)
**Files:** `src/app/api/webhooks/resend/route.ts:54`, `resend-inbound/route.ts:52`
**Bug:** `signatures.includes(expectedSig)` uses standard string comparison, timing side-channel attack.
**Impact:** Attacker can forge Resend webhook payloads, triggering false unsubscriptions or injecting data.
**Fix:** Use `crypto.timingSafeEqual` on fixed-length buffers.

### P2-6. Installment commission base inflated
**File:** `src/app/api/webhooks/stripe/route.ts:277-278`
**Bug:** `saleAmount = fullPrice - firstInstallmentDiscount` but discount is per-installment, not total. Commission overstated.
**Impact:** Over-payment of referral commissions on every installment order with promo code.
**Fix:** Account for total discount across both installments.

### P2-7. Orphaned Stripe coupons on session creation failure
**File:** `src/app/api/checkout/route.ts:340-555`
**Bug:** Coupons created before `checkout.sessions.create`. If session creation throws, coupons never deleted. In combined-discount path, original upgrade coupon is ALWAYS orphaned (100% hit rate).
**Fix:** Try/catch around session creation with coupon cleanup. Delete original coupon in combined path.

### P2-8. BlogInlineCapture source attribution silently dropped
**Files:** `src/components/BlogInlineCapture.tsx:41`, `src/app/api/subscribe/route.ts:47`
**Bug:** `blog-inline-*` sources not in `ALLOWED_SOURCES`. Falls back to `"lead-capture"` silently.
**Impact:** All non-DUI blog inline captures lose source attribution. Analytics corrupted.
**Fix:** Add `blog-inline-*` values to `ALLOWED_SOURCES`.

---

## HIGH, 18 issues (deduplicated)

### P2-9. Inbound email HTML stored without sanitization
**File:** `src/app/api/webhooks/resend-inbound/route.ts:109`
**Impact:** Stored XSS when operator views inbound emails (chained with P2-11 for credential theft).

### P2-10. IP spoofing bypasses ALL rate limiting
**File:** `src/lib/request.ts:12-18`
**Impact:** `getClientIp` trusts headers without proxy validation. All rate limits bypassable.

### P2-11. Admin password stored plaintext in sessionStorage
**File:** `src/components/OperatorShell.tsx:36-37,63`
**Impact:** Any XSS can read admin password. Combined with P2-9, immediate credential theft path.

### P2-12. In-memory rate limit fallback 200x too permissive
**File:** `src/lib/rate-limit.ts:22-23`
**Impact:** 600/hr vs intended 3/hr when Supabase down. Serverless cold starts reset the map.

### P2-13. Fire-and-forget fetch drops report generation triggers
**Files:** `src/app/api/intake/route.ts:253`, `intake/intelligence-brief/route.ts:204`
**Impact:** Case stays in `intake` forever, cron only detects stuck `generating`.

### P2-14. Unbounded query for purchase suppression
**File:** `src/lib/cron/drip-nurture.ts:68-74`
**Impact:** Fetches ALL paid orders ever. Will eventually timeout.

### P2-15. N+1 queries in reconciliation (Part 9a, 9b)
**File:** `src/lib/cron/reconciliation.ts:37-41,125-129`
**Impact:** Up to 50 sequential queries per cron run.

### P2-16. N+1 queries in monitoring, SLA breach + weekly progress
**Files:** `src/lib/cron/monitoring.ts:31-37,110-132`
**Impact:** N+1 for SLA breach tasks + 3N queries for weekly progress emails.

### P2-17. N+1 queries in pipeline completion check
**File:** `src/lib/cron/pipeline.ts:123-126`
**Impact:** Sequential query per processing case.

### P2-18. N+1 queries in operator-alerts (5 sections)
**File:** `src/lib/cron/operator-alerts.ts:281-580` (5 loop sections)
**Impact:** N+1 subscriber + drip_emails queries in each stuck-case loop.

### P2-19. N+1 queries in drip-post-purchase
**File:** `src/lib/cron/drip-post-purchase.ts:123-132,208-213`
**Impact:** Up to 400 extra queries for 200 orders.

### P2-20. N+1 in customer-lifecycle abandoned checkout
**File:** `src/lib/cron/customer-lifecycle.ts:102-108`
**Impact:** Per-subscriber query for paid order check.

### P2-21. Commission reversal race condition (non-atomic read-then-write)
**File:** `src/app/api/webhooks/stripe/route.ts:936-963`
**Impact:** Concurrent refunds can over-decrement partner totals.

### P2-22. Original upgrade coupon ALWAYS orphaned in combined-discount path
**File:** `src/app/api/checkout/route.ts:428-450`
**Impact:** 100% hit rate, every combined-discount checkout leaks a coupon.

### P2-23. Metrics endpoint full table scans in JavaScript
**File:** `src/app/api/operator/metrics/route.ts:42-50`
**Impact:** Pulls thousands of rows to count/sum in JS. Degrades linearly.

### P2-24. report_html in every case detail response
**File:** `src/app/api/operator/cases/[id]/route.ts:185`
**Impact:** 200-500KB extra per case detail request.

### P2-25. select("*") across 5 operator queries
**Files:** `operator/cases/[id]/route.ts:50,103,110`, `jobs/route.ts:33`, `tasks/route.ts:34`
**Impact:** Future columns auto-exposed including potential PII/debug data.

### P2-26. Partners list + referral history have no pagination
**Files:** `admin/partners/route.ts:32`, `admin/partners/[id]/route.ts:47-51`
**Impact:** Unbounded response size.

---

## MEDIUM, 24 issues (deduplicated)

### P2-27. IP extraction inconsistency (2 files use raw header)
`customer/logout/route.ts:14`, `upload/finalize/route.ts:47`, use `x-forwarded-for` instead of `getClientIp()`

### P2-28. No rate limiting on partner logout
`partner/logout/route.ts`, no rate limiting

### P2-29. No rate limiting on unsubscribe
`unsubscribe/route.ts`, no rate limiting on POST

### P2-30. Hardcoded HMAC key in middleware
`middleware.ts:21`, `"inna-middleware-hmac-key"` hardcoded

### P2-31. Non-subscriber customers get duplicate lifecycle emails
`customer-lifecycle.ts:37-52`, no dedup record written when subscriber record missing

### P2-32. Awaiting-intake reminder dedup fails for non-subscribers
`operator-alerts.ts:507-543`, same pattern as P2-31

### P2-33. Intake escalation dedup fails for non-subscribers
`operator-alerts.ts:576-614`, same pattern as P2-31

### P2-34. Redundant subscriber query in weekly progress
`monitoring.ts:110-132`, queries subscribers twice for same email

### P2-35. Reconciliation can create duplicate orders (no upsert guard)
`reconciliation.ts:50-62`, no unique constraint guard on INSERT

### P2-36. Dead-code status filter in drip-post-purchase
`drip-post-purchase.ts:147-152`

### P2-37. Discount loop can attribute order to multiple partners
`webhooks/stripe/route.ts:253-301`, no break after first match

### P2-38. One-time coupon on subscription only discounts first installment
`checkout/route.ts:469-506`

### P2-39. N+1 in webhook included-tier dedup
`webhooks/stripe/route.ts:558-643`, 8-12 queries for situation-room

### P2-40. Admin demand routes missing input validation
`demand/gaps/route.ts`, `emerging/route.ts`, `subreddits/route.ts`, no type/length on id, notes

### P2-41. Admin demand performance missing window validation
`demand/performance/route.ts:14`

### P2-42. Operator tasks ID/notes not validated
`operator/tasks/route.ts:76-78,112-113`

### P2-43. Admin emails PATCH id not validated
`admin/emails/route.ts:51-53`

### P2-44. Raw Supabase errors exposed in admin API responses
12 error paths across admin routes

### P2-45. StatusBadge duplicated across 4-5 files
Operator pages + my-cases page

### P2-46. Email subject header injection via firstName
`intake/route.ts:321-322,336`, `\r\n` in firstName

### P2-47. firstName not validated as string (type confusion)
`intake/route.ts:72,79,164`, non-string passes truthiness check

### P2-48. caseId not validated as string across generate/evaluate routes
5 files, truthiness only, no type check

### P2-49. Score route docs contradict implementation
`score/route.ts:24-28` claims no data stored but stores aggregates

### P2-50. Footer Situation Room link bypasses application gate
`Footer.tsx:145`, links to `/checkout?tier=situation-room` instead of `/intake`

---

## LOW, 16 issues (deduplicated)

### P2-51. No rate limiting on score/count endpoint
### P2-52. RIFF magic bytes overlap (WebP/WAV)
### P2-53. Verify endpoint tries test key first (doubles latency)
### P2-54. Upload URL doesn't encode caseId
### P2-55. productType destructured but never used (dead code)
### P2-56. Missing .limit() on 5 unbounded cron queries
### P2-57. cleanupDripEmailLogs may hit URL length limit
### P2-58. Compliance abandoned intake cleanup doesn't paginate
### P2-59. Admin demand GET status defaults inconsistent
### P2-60. Recipient email logged in plaintext
### P2-61. Helper functions (formatDate, formatCurrency) duplicated across 5 files
### P2-62. body_html included in email list response
### P2-63. Missing aria-busy on loading states
### P2-64. ChargeTypeSelector missing keyboard navigation
### P2-65. BlogCategoryFilter missing ARIA selection state
### P2-66. Footer is client component unnecessarily

---

## Fix Priority (batched)

### Batch A: Security CRITICALs
P2-1 (XSS), P2-5 (timing attack), P2-8 (source attribution)

### Batch B: Cron CRITICALs
P2-2 (advisory lock), P2-3 (200 OK on lock fail), P2-4 (year in dedup key)

### Batch C: Payment CRITICALs
P2-6 (installment commission), P2-7 + P2-22 (orphaned coupons)

### Batch D: HIGH security
P2-9 (inbound HTML), P2-10 (IP spoofing), P2-12 (rate limit fallback), P2-13 (fire-and-forget)

### Batch E: HIGH performance (N+1 queries)
P2-14 through P2-20 (N+1 batch fixes across cron)

### Batch F: HIGH admin/operator
P2-23 (metrics scans), P2-24 (report_html), P2-25 (select *), P2-26 (pagination)

### Batch G: MEDIUM fixes
P2-27 through P2-50

### Batch H: LOW fixes (skip cosmetic-only)
Selected items from P2-51 through P2-66

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 8 |
| HIGH | 18 |
| MEDIUM | 24 |
| LOW | 16 |
| **TOTAL** | **66** |
