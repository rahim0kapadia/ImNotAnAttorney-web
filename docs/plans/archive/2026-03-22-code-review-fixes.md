## Context
- **Repo:** `C:/Users/email/projects/ImNotAnAttorney-web`
- **Problem:** Deep code review found 109 issues (19 CRITICAL, 23 HIGH). Fixing the most impactful ones.
- **Key files to read first:** `docs/reviews/2026-03-22-deep-code-review.md`, `src/lib/stripe.ts`, `src/lib/tiers.ts`
- **Tech stack:** Next.js 14 (App Router), TypeScript, Supabase (PostgREST), Stripe (dual-mode test/live), Resend email
- **Key decisions:** Fake social proof (#13) DEFERRED, will swap to real data later. All other CRITICALs and HIGHs are fix targets.
- **Setup/prerequisites:** `npm install` already done. TypeScript check: `npx tsc,noEmit,skipLibCheck`. No test suite.

## Review Source
Full report: `docs/reviews/2026-03-22-deep-code-review.md`

---

## Batch 1: Payment Integrity (CRITICAL, fix first)

### Task 1.1: Fix playbook credit double-counting
**File:** `src/app/api/checkout/route.ts`
**Lines:** 301-325
**Bug:** Playbook tiers (e.g., `dui-first-offense`) aren't in the `tierOrder` array (line 304). `tierOrder.indexOf("dui-first-offense")` returns `-1`, which is `< currentTierIndex(0)` for `case-decoder`. So playbook orders pass the standard tier credit filter (line 314-315) AND the playbook-specific credit block (line 274-298). Credit applied twice.
**Fix:** Add a guard to the standard tier filter to exclude digital product tiers. Add this condition at line 314:
```typescript
tierOrder.indexOf(o.tier) >= 0 && // Only count service tiers, not digital products
tierOrder.indexOf(o.tier) < currentTierIndex
```
**Verify:** Read the file, confirm the fix is correct, TypeScript check passes.

### Task 1.2: Fix commission reversal NaN zeroing
**File:** `src/app/api/webhooks/stripe/route.ts`
**Lines:** 940-953
**Bug:** Inline `await` inside `.update()`, if inner `select` fails, `undefined - 1 = NaN`, `NaN || 0 = 0`, `Math.max(0, 0) = 0`. Zeroes out partner totals.
**Fix:** Separate the reads from the write. Read partner totals first, validate non-NaN, then write:
```typescript
// Read first
const { data: partnerData } = await supabase
  .from("partners")
  .select("total_referrals, total_commission")
  .eq("id", referral.partner_id)
  .single();

if (!partnerData) {
  console.error("[Webhook] Could not read partner data for reversal:", referral.partner_id);
} else {
  await supabase
    .from("partners")
    .update({
      total_referrals: Math.max(0, (partnerData.total_referrals || 0) - 1),
      total_commission: Math.max(0, (partnerData.total_commission || 0) - referral.commission_amount),
      updated_at: new Date().toISOString(),
    })
    .eq("id", referral.partner_id);
}
```
**Verify:** TypeScript check passes.

### Task 1.3: Fix verify endpoint accepting test-mode sessions
**File:** `src/app/api/checkout/verify/route.ts`
**Lines:** 62-69
**Bug:** Tries `stripeTest` first. Test-mode sessions (free to create) return `verified: true`.
**Fix:** Use `stripeForTier` based on the session's metadata tier. If no tier in metadata, fall back to checking `session.livemode`. Or simpler: after retrieving, check `session.livemode` and reject test-mode sessions when `NODE_ENV === "production"`:
```typescript
// After retrieving session:
if (process.env.NODE_ENV === "production" && !session.livemode) {
  return NextResponse.json({ verified: false });
}
```
**Verify:** TypeScript check passes.

### Task 1.4: Fix $0 amount webhook creating paid orders
**File:** `src/app/api/webhooks/stripe/route.ts`
**Line:** 128
**Bug:** `amount == null` passes for `amount === 0`.
**Fix:** Change to `amount == null || amount < 50` (matching checkout's 50-cent minimum):
```typescript
if (!tier || !email || amount == null || amount < 50) {
```
**Verify:** TypeScript check passes.

---

## Batch 2: Auth Hardening (CRITICAL + HIGH)

### Task 2.1: Fix partner session accumulation
**File:** `src/lib/partner-auth.ts`
**Lines:** 91-108
**Bug:** `createPartnerSession` inserts new session but never deletes old ones. Unlike `createCustomerSession` which deletes first.
**Fix:** Add deletion before insert:
```typescript
// Delete old sessions for this partner
await supabase.from("partner_sessions").delete().eq("partner_id", partnerId);
```
Add this before the `.insert()` at line 96.
**Verify:** TypeScript check passes.

### Task 2.2: Add token format validation to partner magic-link verify
**File:** `src/app/api/partner/magic-link/verify/route.ts`
**Lines:** 37-39
**Bug:** Only checks `if (!token)`. Customer verify validates `/^[0-9a-f]{64}$/`.
**Fix:** Add same validation:
```typescript
if (!token || !/^[0-9a-f]{64}$/.test(token)) {
  return NextResponse.json({ error: "Invalid token format" }, { status: 400 });
}
```
**Verify:** TypeScript check passes.

### Task 2.3: Add upload endpoint auth to middleware
**File:** `src/middleware.ts`
**Bug:** `/api/upload/` paths fall through to CSP-only branch. No auth gate.
**Fix:** This is tricky, upload is used by customers who just paid but may not have a customer session yet (the upload page is linked from the checkout success page). The upload route already validates email+caseId ownership against the orders table. Adding middleware cookie auth would break the flow. Instead, add rate limiting to the upload routes if not already present, and add UUID validation on caseId.
**Files to modify:**
- `src/app/api/upload/route.ts`, add UUID validation on caseId (line ~172)
- Verify rate limiting is already in place (it was added in the previous review session per handoff)
**Verify:** Read upload route to confirm rate limiting exists, add UUID check.

---

## Batch 3: Cron Correctness (CRITICAL)

### Task 3.1: Fix dedup cleanup destroying active subscriber records
**File:** `src/lib/cron/compliance.ts`
**Lines:** 75-92
**Bug:** Deletes ALL `drip_emails` records older than 90 days, including for active subscribers. Causes re-sends.
**Fix:** Only delete dedup records for subscribers who have unsubscribed:
```typescript
const { count: dripPurged } = await ctx.supabase
  .from("drip_emails")
  .delete({ count: "exact" })
  .lt("created_at", dripCutoff.toISOString())
  .in("subscriber_id", /* subquery for unsubscribed subscribers */);
```
Since Supabase doesn't support subqueries in `.in()`, fetch unsubscribed subscriber IDs first, then delete their dedup records. Or use an RPC.
**Verify:** TypeScript check passes.

### Task 3.2: Fix stale month in drip email template
**File:** `src/lib/drip-emails.ts`
**Line:** 327
**Bug:** `new Date().toLocaleDateString(...)` evaluated at module load time. Month is frozen.
**Fix:** Convert the static `SCORE_CRISIS_EMAILS` array to a function that generates emails at call time. Or just replace the one template literal with a function call:
```typescript
// Before (line 327):
${new Date().toLocaleDateString("en-US", { month: "long" })}
// After:
${getCurrentMonth()}
```
Add helper at top of file:
```typescript
function getCurrentMonth(): string {
  return new Date().toLocaleDateString("en-US", { month: "long" });
}
```
Then change `SCORE_CRISIS_EMAILS` from a `const` array to a function that returns the array, OR just change the one email that uses it to be a getter function.
**Verify:** TypeScript check passes.

### Task 3.3: Fix operator alerts not checking sendEmail result before setting flags
**File:** `src/lib/cron/operator-alerts.ts`
**Bug:** Multiple functions set permanent flags (e.g., `review_reminder_sent = true`) without checking if `sendEmail` succeeded.
**Fix in each function:**
- `sendReviewReminders` (line 42-62): wrap flag update in `if (sendResult.success)`, increment `result.sent` or `result.errors`
- `detectStuckIntakes` (line 92-111): same pattern, check email result before status change
- `detectStuckGenerating` and `detectStuckIBGeneration`: same pattern
**Verify:** TypeScript check passes.

### Task 3.4: Fix `new Date()` vs `ctx.now` inconsistency
**File:** `src/lib/cron/operator-alerts.ts` (lines 110, 157, 204, 236) + `src/lib/cron/pipeline.ts` (line 139)
**Bug:** Status updates use wall clock instead of `ctx.now`.
**Fix:** Replace all `new Date().toISOString()` with `ctx.now.toISOString()` in cron task files.
**Verify:** Grep for `new Date()` in `src/lib/cron/` to ensure none remain.

---

## Batch 4: Input Validation (HIGH)

### Task 4.1: Add try/catch on req.json() in generate/evaluate routes
**Files:** `src/app/api/generate/case-decoder/route.ts`, `generate/intelligence-brief/route.ts`, `judge-research/route.ts`, `evaluate/case-decoder/route.ts`
**Fix:** Wrap `await req.json()` in try/catch, return 400 on parse error.

### Task 4.2: Add UUID validation to operator case/job ID params
**Files:** `src/app/api/operator/cases/[id]/route.ts`, `cases/[id]/status/route.ts`, `jobs/[id]/retry/route.ts`
**Fix:** Add `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)` check.

### Task 4.3: Validate intake array elements as strings
**File:** `src/app/api/intake/route.ts`
**Lines:** 172, 176, 188
**Fix:** Add `.filter((s: unknown) => typeof s === "string")` before `.slice()`.

### Task 4.4: Add input length limits to Phase 2 intake
**File:** `src/app/api/intake/intelligence-brief/route.ts`
**Lines:** 98-115
**Fix:** Apply same `cap()` function (or inline `.slice(0, N)`) to all formData fields.

### Task 4.5: Fix job retry race condition
**File:** `src/app/api/operator/jobs/[id]/retry/route.ts`
**Lines:** 61-72
**Fix:** Add `.eq("status", "failed")` to the update query. Check affected rows.

---

## Batch 5: Infrastructure (HIGH)

### Task 5.1: Fix path traversal in blog slug
**File:** `src/lib/blog.ts:105`
**Fix:** Validate slug with `/^[a-z0-9][a-z0-9-]*$/`.

### Task 5.2: Add demand scores param validation + pagination
**File:** `src/app/api/admin/demand/scores/route.ts`
**Fix:** Validate `window` and `dimension` against allowed values. Add `.limit(100)`.

### Task 5.3: Fix admin page param (NaN offset)
**File:** `src/app/api/admin/emails/route.ts`
**Fix:** Add `Math.max(1, parseInt(...) || 1)` on page param.

---

## Session Management

- **After each batch:** commit, verify with `npx tsc,noEmit,skipLibCheck`
- **If compaction needed:** use `/save-and-clear` with this plan file as the continuation point
- **Handoff format:** Write to `docs/handoff/2026-03-22-code-review-fixes-batch-N.md` with completed tasks and next batch number
- **Progress tracking:** Check off tasks in THIS file by changing `###` to `### ~~TaskName~~ DONE`
