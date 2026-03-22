# Deep Code Review: ImNotAnAttorney-web
**Date:** 2026-03-22
**Scope:** Full site — 49 API routes, 38 lib files, 37 components, middleware
**Agents:** 6 parallel reviewers (payments, auth, cron, admin, public, frontend)
**Raw findings:** 114 issues (18 CRITICAL, 28 HIGH, 38 MEDIUM, 30 LOW)

Below: deduplicated, prioritized by business impact.

---

## CRITICAL (Fix Immediately)

### 1. Playbook credit double-counted in upgrade checkout
**File:** `src/app/api/checkout/route.ts:274-325`
**Impact:** Customer pays $3 instead of $100 for Case Decoder after buying $97 playbook.
**Root cause:** Playbook tiers aren't in `tierOrder` array (line 304), so `indexOf()` returns -1, which is `< currentTierIndex(0)`, causing the playbook order to pass the standard tier credit filter (line 315) IN ADDITION to the playbook-specific credit block (line 274-298). Credit applied twice.
**Fix:** Exclude digital product tiers from the standard upgrade credit filter, or merge the two credit paths.

### 2. Commission reversal fallback can zero out partner totals
**File:** `src/app/api/webhooks/stripe/route.ts:940-950`
**Impact:** If the `reverse_referral_commission` RPC is unavailable and the inner `select` fails, `undefined - 1 = NaN`, then `NaN || 0 = 0`, then `Math.max(0, 0) = 0`. Both `total_referrals` and `total_commission` get set to 0.
**Fix:** Use atomic SQL (`GREATEST(0, total_referrals - 1)`), or validate non-NaN before writing.

### 3. Drip email log cleanup destroys dedup records for active subscribers
**File:** `src/lib/cron/compliance.ts:75-92`
**Impact:** After 90 days, dedup records are purged. Next cron run re-sends day-1 nurture emails to 90+ day subscribers. Win-back emails (start day 75) get re-sent after day 165.
**Fix:** Only delete records for unsubscribed/inactive subscribers, or use a separate dedup mechanism.

### 4. `new Date()` in drip-emails.ts evaluated at module load, not send time
**File:** `src/lib/drip-emails.ts:327`
**Impact:** The month name in the email template is frozen to whenever the serverless module was first loaded. Could say "January" in a March email.
**Fix:** Convert to a function that generates the HTML at send time.

### 5. Upload endpoint has NO session-based auth
**File:** `src/app/api/upload/route.ts` + `upload/finalize/route.ts`
**Impact:** Anyone who knows a caseId UUID + email can upload files. Not behind middleware auth. CaseId appears in customer URLs, email is often known.
**Fix:** Add middleware cookie check for `/api/upload/` paths, or require a session token.

### 6. Partner session accumulation — old sessions never invalidated on new login
**File:** `src/lib/partner-auth.ts:91-108`
**Impact:** Unlike customer auth (which deletes old sessions), partner auth inserts without deleting. Compromised tokens remain valid for 30 days even after re-login.
**Fix:** Add `await supabase.from("partner_sessions").delete().eq("partner_id", partner.id)` before creating new session.

### 7. Partner magic-link verify has no token format validation
**File:** `src/app/api/partner/magic-link/verify/route.ts:29-39`
**Impact:** Customer verify validates `/^[0-9a-f]{64}$/`, but partner verify only checks `if (!token)`. Arbitrary-length strings (megabytes) sent to DB for SHA-256 hashing.
**Fix:** Add same hex format validation as customer verify.

### 8. Operator alerts: multiple functions never track results + mark flags before checking email success
**File:** `src/lib/cron/operator-alerts.ts:23-343`
**Impact:** `sendReviewReminders`, `detectStuckIntakes`, `detectStuckGenerating`, `detectStuckIBGeneration` all set permanent state flags (e.g., `review_reminder_sent = true`) WITHOUT checking if `sendEmail` succeeded. Failed emails are permanently marked as sent.
**Fix:** Check `sendResult.success` before updating flags; increment result counters.

### 9. `new Date()` used instead of `ctx.now` in cron tasks
**File:** `src/lib/cron/operator-alerts.ts:110,157,204,236` + `pipeline.ts:139`
**Impact:** Status updates use wall clock instead of frozen `ctx.now`, causing temporal inconsistency within a single cron run. Cases could re-match detection queries.
**Fix:** Replace all `new Date()` with `ctx.now` in cron task files.

### 10. Verify endpoint accepts test-mode Stripe sessions in production
**File:** `src/app/api/checkout/verify/route.ts:62-69`
**Impact:** `stripeTest` is tried first. Test-mode sessions (trivially created with test cards) return `verified: true`. Success page could display "Payment confirmed" for a $0 test payment.
**Fix:** In production, only use `stripeLive`, or check `session.livemode` flag.

### 11. $0 amount checkout sessions create paid orders
**File:** `src/app/api/webhooks/stripe/route.ts:128`
**Impact:** `amount == null` passes for `amount === 0`. If a 100% coupon or Stripe anomaly produces $0, webhook creates a "paid" order with no price validation against tier.
**Fix:** Assert `amount >= 50` (matching checkout's minimum) before creating the order.

### 12. Phase 2 intake form has no input length limits
**File:** `src/app/api/intake/intelligence-brief/route.ts:98-115`
**Impact:** `judgeName`, `county`, `attorneyName`, `biggestConcern`, etc. stored to DB without length caps. Attacker can submit MB-sized strings. Main intake route correctly caps all fields.
**Fix:** Apply same `cap()` pattern from main intake route.

### 13. Fake social proof notification (FTC risk)
**File:** `src/components/RecentPurchaseNotification.tsx:1-60`
**Impact:** Displays "Others are getting their questions right now" on a timer loop with NO real data. Fabricated urgency for a legal services company serving criminal defendants. FTC has taken action on similar practices (FTC v. Sunday Riley, 2019).
**Fix:** Either connect to real (anonymized) order data, or remove.

---

## HIGH (Fix This Sprint)

### 14. IP spoofing bypasses ALL rate limiting
**File:** `src/lib/request.ts:12-18`
**Impact:** `getClientIp` trusts `cf-connecting-ip`, `x-real-ip`, `x-forwarded-for` without proxy validation. If Cloudflare is bypassed (direct origin access), attacker sets any IP to circumvent all rate limits.
**Fix:** Only trust these headers when behind a verified proxy. Pin to Cloudflare IP ranges or use Vercel's built-in IP detection.

### 15. Advisory lock via Supabase REST may not prevent concurrent cron
**File:** `src/app/api/cron/drip/route.ts:85-88`
**Impact:** PostgreSQL advisory locks are session-scoped, but PostgREST uses connection pooling. Lock acquired on connection A, released on connection B (which never held it). Two concurrent crons could both acquire the lock.
**Fix:** Use transaction-scoped locks (`pg_try_advisory_xact_lock`) or a row-level lock in a single transaction.

### 16. Non-subscriber customers get duplicate lifecycle emails
**File:** `src/lib/cron/customer-lifecycle.ts:37-52`
**Impact:** If customer has no subscriber record, dedup check is skipped but dedup record is also not inserted (line 66: `if (sendResult.success && expSub?.id)` — false when `expSub` is null). Same email sent daily.
**Fix:** Create a subscriber record for the customer, or use the order table for dedup.

### 17. Installment commission uses inconsistent discount amount
**File:** `src/app/api/webhooks/stripe/route.ts:277-278`
**Impact:** `saleAmount = fullPrice - firstInstallmentDiscount`. But Stripe applies subscription discounts per-invoice. Commission base is overstated for installment plans.
**Fix:** Clarify commission model — commission on full price, or per-payment? Adjust discount accordingly.

### 18. Generate/evaluate routes missing try/catch on req.json()
**Files:** `generate/case-decoder/route.ts:54`, `generate/intelligence-brief/route.ts:39`, `judge-research/route.ts:36`, `evaluate/case-decoder/route.ts:38`
**Impact:** Malformed JSON throws unhandled exception with stack trace in response. All admin routes already have this protection.
**Fix:** Wrap in try/catch, return 400.

### 19. Job retry race condition — not atomic
**File:** `src/app/api/operator/jobs/[id]/retry/route.ts:61-72`
**Impact:** Read-then-write without conditional update. Two operators retrying simultaneously both succeed, incrementing retry_count twice.
**Fix:** Add `.eq("status", "failed")` to update query, check affected rows.

### 20. Unbounded query for purchase suppression fetches ALL paid orders
**File:** `src/lib/cron/drip-nurture.ts:68-74`
**Impact:** No limit or date filter. Scales linearly with total orders ever. Will eventually cause memory pressure and cron timeouts.
**Fix:** Filter to only emails in the current subscriber batch, or add date-range filter.

### 21. Path traversal in blog slug lookup
**File:** `src/lib/blog.ts:105`
**Impact:** `path.join(BLOG_DIR, \`${slug}.mdx\`)` — slug like `../../etc/passwd` resolves outside blog directory. Function is exported and could be called from other contexts.
**Fix:** Validate slug with `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`.

### 22. Admin password stored plaintext in sessionStorage
**File:** `src/components/OperatorShell.tsx:36-42,62-63`
**Impact:** Any XSS on the site can read `sessionStorage.getItem("admin-password")` for full operator access.
**Fix:** Use httpOnly cookie-based auth for operator sessions (matching partner/customer pattern).

### 23. Operator case ID params not validated as UUID
**Files:** `operator/cases/[id]/route.ts:24`, `operator/cases/[id]/status/route.ts:24`, `operator/jobs/[id]/retry/route.ts:22`
**Impact:** Arbitrary strings passed to Supabase queries. Partner routes correctly validate UUID format.
**Fix:** Add UUID regex validation matching the partner route pattern.

### 24. Upload path traversal via unsanitized caseId
**File:** `src/app/api/upload/route.ts:219-220`
**Impact:** `caseId` from user input used directly in storage path without format validation. `finalize/route.ts:69` correctly validates UUID format.
**Fix:** Add UUID format validation before using caseId in storage path.

### 25. Demand scores endpoint: no pagination, no param validation
**File:** `src/app/api/admin/demand/scores/route.ts:14-22`
**Impact:** `window` and `dimension` params passed to Supabase without allowlist validation. No `.limit()` on results.
**Fix:** Validate params against allowed values, add `.limit(100)`.

### 26. Metrics endpoint: full table scans counted in JavaScript
**File:** `src/app/api/operator/metrics/route.ts:43-50`
**Impact:** Fetches ALL rows from cases and orders tables to count/sum in JS. Scales linearly with data growth. Will eventually timeout.
**Fix:** Use database-level aggregation (Supabase RPC or views).

### 27. Intake array elements not validated as strings
**File:** `src/app/api/intake/route.ts:172,176,188`
**Impact:** `services`, `arrestCircumstances`, `evidenceType` arrays checked with `Array.isArray()` but individual elements could be objects/numbers. Causes `escapeHtml()` crash when rendering.
**Fix:** Filter elements: `.filter((s: unknown) => typeof s === "string")`.

### 28. Score route documentation claims no data is stored, but it stores aggregate counters
**File:** `src/app/api/score/route.ts:25-29,500`
**Impact:** File header promises "NO data is stored" but line 500 writes to Supabase. Compliance/privacy audit would flag this.
**Fix:** Update documentation to accurately describe aggregate counter writes.

---

## MEDIUM (Fix This Month) — 38 items

Key themes:
- **N+1 queries** in cron tasks (drip-post-purchase:123, reconciliation:37, operator-alerts:255+, monitoring:110)
- **Missing rate limiting** on unsubscribe, score/count, partner logout
- **Non-constant-time signature comparison** in Resend webhooks (resend/route.ts:54, resend-inbound/route.ts:49)
- **Fire-and-forget fetch** losing critical generation triggers (intake/route.ts:253, intelligence-brief/route.ts:200)
- **IP extraction inconsistency** — customer/logout and upload/finalize use raw header instead of `getClientIp()`
- **In-memory rate limit fallback** allows 600/hr vs intended 3/hr when Supabase is down (rate-limit.ts:21-23)
- **Week number dedup key** missing year component (monitoring.ts:107)
- **Report HTML** returned in every case detail response, bloating payloads (operator/cases/[id]/route.ts:185)
- **select("*")** returning all columns including potential future sensitive ones (operator/cases/[id]/route.ts:50)
- **Inbound email HTML** stored without sanitization (resend-inbound/route.ts:103-114)
- **Missing input validation** on admin demand routes (gaps:44, emerging:39, subreddits:39)
- **BlogInlineCapture source attribution** broken — `blog-inline-*` not in ALLOWED_SOURCES (BlogInlineCapture.tsx:41)
- **caseId format check** missing on upload/finalize too (upload/route.ts:69 vs finalize)
- **Lock-not-acquired** returns 200 OK, misleading monitoring (cron/drip/route.ts:87)

---

## LOW (Backlog) — 30 items

Key themes:
- Orphaned Stripe coupons on session creation failure
- Unused function parameters
- Missing accessibility (ARIA, keyboard nav on radio groups)
- Hardcoded HMAC keys (cosmetic — not real secrets)
- Pagination missing on partners list, referral history
- Footer Situation Room link bypasses application gate
- Email subject header injection potential
- Code duplication (StatusBadge across 3 operator pages, duplicate sign functions in site.ts)
- `<img>` instead of `next/image` on sales page
- Loading skeleton missing aria-busy

---

## Summary Table

| Category | CRITICAL | HIGH | MEDIUM | LOW | Total |
|----------|----------|------|--------|-----|-------|
| Payments/Checkout | 3 | 2 | 5 | 4 | 14 |
| Auth/Security | 3 | 3 | 5 | 4 | 15 |
| Cron/Pipeline | 5 | 5 | 7 | 4 | 21 |
| Admin/Operator | 2 | 5 | 5 | 5 | 17 |
| Public Routes | 3 | 4 | 8 | 6 | 21 |
| Frontend | 3 | 4 | 7 | 7 | 21 |
| **TOTAL** | **19** | **23** | **37** | **30** | **109** |

## Recommended Fix Order

1. **Payment integrity** (#1 playbook double-credit, #2 commission zeroing, #11 $0 amount)
2. **Auth hardening** (#5 upload auth, #6 partner sessions, #7 token validation, #10 test-mode verify)
3. **Cron correctness** (#3 dedup cleanup, #4 stale month, #8 flag-before-check, #9 ctx.now)
4. **Input validation batch** (#12 phase2 length, #18 req.json, #23 UUID validation, #27 array types)
5. **Infrastructure** (#14 IP spoofing, #15 advisory lock, #22 operator auth)
6. **Social proof** (#13) — DEFERRED. Will swap fake for real data as purchases come in. TODO: research the .01% expert on soliciting social proof/testimonials from customers (especially in legal/sensitive services).
