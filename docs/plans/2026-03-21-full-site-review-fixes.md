# Full Site Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 28+ issues found across 7 code review agents covering auth, payments, cron, feature flags, and customer portal.

**Architecture:** Fixes are grouped by risk and file proximity. Payment-critical fixes first, then security, then code quality. Each task is scoped to minimize blast radius.

**Tech Stack:** Next.js 16, React 19, Supabase (PostgreSQL), Stripe (dual-mode), TypeScript

---

## Context

- **Repo:** `C:/Users/email/projects/ImNotAnAttorney-web/`
- **Problem:** Full-site code review found 6 critical issues, 11 security warnings, 9 business logic warnings, and 11 code quality warnings. The most severe are in the payment pipeline (checkout + webhook + cron).
- **Key files to read first:**
  - `src/app/api/checkout/route.ts` (~592 lines) — main checkout flow
  - `src/app/api/webhooks/stripe/route.ts` (~968 lines) — webhook handler
  - `src/app/api/cron/drip/route.ts` (~2087 lines) — daily cron
  - `src/lib/auth/guards.ts` — auth guard library
  - `src/lib/feature-flags.ts` — feature flag helper
  - `src/lib/customer-auth.ts` — customer auth library
  - `src/middleware.ts` — centralized middleware
- **Key decisions:**
  - Payment fixes are highest priority — they affect revenue and could be exploited
  - Cron refactoring is deferred to a separate plan (2087-line file needs a full decomposition, not a patch)
  - Each fix must preserve existing behavior for non-buggy paths

---

## Execution Order

Grouped by blast radius. Payment fixes first (highest risk), then security, then quality.

---

## Task 1: Fix productType bypass (CRITICAL C1)

**Risk:** A client can POST `productType: "digital-product"` for any tier, causing the webhook to skip case creation.

**Files:**
- Modify: `src/app/api/checkout/route.ts` (~line 560)

- [ ] **Step 1: Read checkout route, find where productType is passed to metadata**
- [ ] **Step 2: Replace client-trusted productType with server-derived value**

Before:
```typescript
...(productType === "digital-product" && { product_type: "digital-product" }),
```

After:
```typescript
...(tierConfig.isDigitalProduct && { product_type: "digital-product" }),
```

This ensures the webhook only gets `product_type: "digital-product"` when the TIER CONFIG says it's a digital product, not when the client claims it is.

- [ ] **Step 3: Verify & commit**

```bash
npx tsc --noEmit
git commit -m "fix: validate productType from tier config, not client input (security)"
```

---

## Task 2: Add invoice.payment_failed webhook handler (CRITICAL C2)

**Risk:** Installment customers get the product on 1st payment. Failed 2nd payments are never detected.

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts`

- [ ] **Step 1: Read the webhook file, understand the event routing structure**
- [ ] **Step 2: Add handler for `invoice.payment_failed` event**

After the existing `charge.refunded` handler, add:

```typescript
if (event.type === "invoice.payment_failed") {
  const invoice = event.data.object;
  const subscriptionId = invoice.subscription;
  if (subscriptionId) {
    // Find the order by stripe metadata or subscription ID
    // Send operator alert email
    // Log the failure for follow-up
    console.error("[Webhook] Invoice payment failed for subscription:", subscriptionId);
    // Email operator
    await sendEmail({
      to: operatorEmail,
      subject: `⚠️ Installment Payment Failed — Subscription ${subscriptionId}`,
      html: `<p>A customer's second installment payment failed.</p>
             <p>Subscription ID: ${subscriptionId}</p>
             <p>Amount due: $${(invoice.amount_due / 100).toFixed(2)}</p>
             <p>Customer email: ${invoice.customer_email || "unknown"}</p>
             <p>Action needed: Follow up with customer or revoke access.</p>`,
    });
  }
  return NextResponse.json({ received: true });
}
```

- [ ] **Step 3: Register `invoice.payment_failed` in the Stripe webhook dashboard (manual step for Rahim)**
- [ ] **Step 4: Commit**

```bash
git commit -m "fix: add invoice.payment_failed handler to detect failed installments"
```

---

## Task 3: Add commission reversal on refund (CRITICAL C3)

**Risk:** Partners keep commission credit on refunded orders.

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts` (refund handler section)
- Create: SQL migration for `untrack_referral` RPC (or inline the reversal)

- [ ] **Step 1: Read the refund handler section of the webhook**
- [ ] **Step 2: After the refund status updates, add commission reversal**

Find the referral for this order and reverse it:

```typescript
// Inside charge.refunded handler, after updating order/case status:
const { data: referral } = await supabase
  .from("referrals")
  .select("id, partner_id, commission")
  .eq("order_id", order.id)
  .maybeSingle();

if (referral) {
  // Decrement partner totals
  await supabase.rpc("sql", {
    query: `UPDATE partners
            SET total_referrals = GREATEST(0, total_referrals - 1),
                total_commission = GREATEST(0, total_commission - $1)
            WHERE id = $2`,
    params: [referral.commission, referral.partner_id]
  });
  // Mark referral as reversed
  await supabase
    .from("referrals")
    .update({ status: "reversed", reversed_at: new Date().toISOString() })
    .eq("id", referral.id);
}
```

NOTE: Read the actual schema first — the referrals table may have different column names. Use the actual Supabase update pattern (not raw SQL) if an RPC doesn't exist. The key principle: decrement `total_referrals` and `total_commission` on the partner, and mark the referral as reversed.

- [ ] **Step 3: Commit**

```bash
git commit -m "fix: reverse partner commission on order refund"
```

---

## Task 4: Fix Stripe reconciliation blind spot (CRITICAL C4)

**Risk:** Live-mode payments with missed webhooks are never detected.

**Files:**
- Modify: `src/app/api/cron/drip/route.ts` (~line 1345)

- [ ] **Step 1: Read the reconciliation section (Part 9) of the cron**
- [ ] **Step 2: Add a second check using `stripeLive` (if configured)**

After the existing `stripe.checkout.sessions.list(...)` call, add:

```typescript
// Also check live Stripe for missed payments
if (stripeLive) {
  const liveSessions = await stripeLive.checkout.sessions.list({
    // Same parameters as test sessions query
  });
  // Merge into sessions array and process
}
```

Import `stripeLive` from `@/lib/stripe` alongside the existing `stripe` import.

- [ ] **Step 3: Commit**

```bash
git commit -m "fix: reconciliation checks both test and live Stripe for missed payments"
```

---

## Task 5: Add NaN guard on installment amount (CRITICAL C6)

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts` (~line 108-110)

- [ ] **Step 1: Read the installment amount parsing**
- [ ] **Step 2: Add NaN guard**

```typescript
const parsedAmount = parseInt(session.metadata.full_price, 10);
if (isNaN(parsedAmount) || parsedAmount <= 0) {
  console.error("[Webhook] Invalid full_price metadata:", session.metadata.full_price);
  await sendEmail({ to: operatorEmail, subject: "⚠️ Invalid installment amount", html: "..." });
  return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
}
amount = parsedAmount;
```

- [ ] **Step 3: Commit**

```bash
git commit -m "fix: guard against NaN from installment metadata parsing"
```

---

## Task 6: Fix playbook credit stacking (CRITICAL C5)

**Files:**
- Modify: `src/app/api/checkout/route.ts` (~lines 303-323)

- [ ] **Step 1: Read the playbook credit calculation section**
- [ ] **Step 2: Cap playbook credit at the target tier's price**

After calculating `playbookCredit`, add:

```typescript
// Cap credit at target tier price (prevent $776 credit toward $197 product)
const targetPrice = TIER_CORE[tier]?.price || 0;
playbookCredit = Math.min(playbookCredit, targetPrice - 50); // Leave at least $0.50
if (playbookCredit < 0) playbookCredit = 0;
```

- [ ] **Step 3: Commit**

```bash
git commit -m "fix: cap playbook upgrade credit at target tier price"
```

---

## Task 7: Fix auth guard length oracle (S11)

**Files:**
- Modify: `src/lib/auth/guards.ts` (~line 35)

- [ ] **Step 1: Replace early-return length check with HMAC-then-compare**

```typescript
function timingSafeCompare(a: string, b: string): boolean {
  const key = Buffer.from("inna-guard-hmac-key");
  const hmacA = require("crypto").createHmac("sha256", key).update(a).digest();
  const hmacB = require("crypto").createHmac("sha256", key).update(b).digest();
  return timingSafeEqual(hmacA, hmacB);
}
```

This eliminates the length oracle because HMAC digests are always 32 bytes.

- [ ] **Step 2: Commit**

```bash
git commit -m "fix: eliminate length oracle in auth guard timing-safe comparison"
```

---

## Task 8: Fix deliver route timing-safe + migrate to guard (S10)

**Files:**
- Modify: `src/app/api/deliver/route.ts` (~line 332)

- [ ] **Step 1: Read the deliver route's auth pattern (it has HMAC-signed tokens + raw secret)**
- [ ] **Step 2: Replace raw `===` comparison with `requireOperatorSecret()` from guards**

The deliver route has a complex auth pattern (HMAC-signed tokens for GET, Bearer or raw secret for POST). Only the raw secret comparison needs fixing — replace `token === process.env.OPERATOR_SECRET` with the guard's timing-safe version.

- [ ] **Step 3: Commit**

```bash
git commit -m "fix: use timing-safe comparison for OPERATOR_SECRET in deliver route"
```

---

## Task 9: Customer portal security hardening (S6, S7, S8, S9)

**Files:**
- Modify: `src/app/api/customer/magic-link/route.ts` — add email validation, fix rate limit window
- Modify: `src/app/api/customer/magic-link/verify/route.ts` — add token format validation
- Modify: `src/lib/customer-auth.ts` — invalidate old sessions on new login
- Modify: `src/lib/email.ts` — escape magicLinkUrl

- [ ] **Step 1: Add email validation to magic-link route**

```typescript
import { isValidEmail } from "@/lib/site";
// After extracting email from body:
if (!email || typeof email !== "string" || !isValidEmail(email)) {
  return NextResponse.json({ error: "Invalid email" }, { status: 400 });
}
```

- [ ] **Step 2: Fix IP rate limit window from 300s to 3600s (match partner)**

```typescript
// Change: checkRateLimit(supabase, `customer-magic:${ip}`, 10, 300)
// To:     checkRateLimit(supabase, `customer-magic:${ip}`, 10, 3600)
```

- [ ] **Step 3: Add token format validation to verify route**

```typescript
if (!token || typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) {
  return NextResponse.json({ error: "Invalid token" }, { status: 400 });
}
```

- [ ] **Step 4: Invalidate old sessions on new login in customer-auth.ts**

In `createCustomerSession()`, before inserting the new session:

```typescript
// Invalidate all existing sessions for this email
await supabase.from("customer_sessions").delete().eq("email", email);
```

- [ ] **Step 5: Escape magicLinkUrl in email template**

```typescript
// In sendCustomerMagicLinkEmail:
const safeUrl = magicLinkUrl.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
// Use safeUrl in href
```

- [ ] **Step 6: Commit**

```bash
git commit -m "fix: harden customer portal — email validation, rate limits, session invalidation, URL escaping"
```

---

## Task 10: Fix feature flag tier_scope bypass (B8)

**Files:**
- Modify: `src/lib/feature-flags.ts` (~lines 19-20, 41-42)

- [ ] **Step 1: Return false when tier_scope is set but no tier argument provided**

```typescript
// Cached path (line 19-20), change:
if (cached.tierScope && tier && !cached.tierScope.includes(tier)) return false;
return cached.enabled;

// To:
if (cached.tierScope) {
  if (!tier || !cached.tierScope.includes(tier)) return false;
}
return cached.enabled;
```

Apply same fix to the fresh-fetch path (lines 41-42).

- [ ] **Step 2: Commit**

```bash
git commit -m "fix: feature flag tier_scope correctly blocks when tier argument omitted"
```

---

## Task 11: Fix referral commission double-subtraction (B6)

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts` (~line 261)

- [ ] **Step 1: Read how `amount` and `discountAmount` are set**

`amount` comes from `session.amount_total` (already post-discount for one-time payments) or `full_price` metadata (pre-discount for installments). `discountAmount` is the discount.

- [ ] **Step 2: Fix the calculation**

For one-time payments, `amount_total` is already net of discount, so `saleAmount` should just be `amount`:

```typescript
// For installments, amount = full_price (pre-discount), so subtract discount
// For one-time, amount = amount_total (post-discount), don't subtract again
const saleAmount = isInstallment ? amount - discountAmount : amount;
```

- [ ] **Step 3: Commit**

```bash
git commit -m "fix: prevent double-subtraction of discount in commission calculation"
```

---

## Task 12: Fix webhook metadata handling + missing retry (B4, Q6)

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts`

- [ ] **Step 1: Return 500 (not 200) when critical metadata is missing so Stripe retries**

```typescript
// Change line ~125:
// return NextResponse.json({ received: true });
// To:
return NextResponse.json({ error: "Missing required metadata" }, { status: 500 });
```

- [ ] **Step 2: Commit**

```bash
git commit -m "fix: return 500 on missing webhook metadata to trigger Stripe retry"
```

---

## Task 13: Add paymentPlan validation (B7)

**Files:**
- Modify: `src/app/api/checkout/route.ts` (~line 490)

- [ ] **Step 1: Validate paymentPlan is strictly boolean true**

```typescript
// Change:
if (paymentPlan && tierConfig.isDigitalProduct) {
// To:
if (paymentPlan === true && tierConfig.isDigitalProduct) {
```

- [ ] **Step 2: Commit**

```bash
git commit -m "fix: validate paymentPlan is boolean true, not any truthy value"
```

---

## Task 14: Add rate limiting to upload/finalize + customer/logout (S5, S9-logout)

**Files:**
- Modify: `src/app/api/upload/finalize/route.ts`
- Modify: `src/app/api/customer/logout/route.ts`

- [ ] **Step 1: Add rate limiting to both endpoints**

Upload finalize: `checkRateLimit(supabase, \`finalize:\${ip}\`, 10, 300)`
Customer logout: `checkRateLimit(supabase, \`customer-logout:\${ip}\`, 10, 300)`

- [ ] **Step 2: Commit**

```bash
git commit -m "fix: add rate limiting to upload/finalize and customer/logout"
```

---

## Task 15: Fix feature flags admin API (B9, Q9)

**Files:**
- Modify: `src/app/api/admin/feature-flags/route.ts`

- [ ] **Step 1: Add type check, length check, and 404 on missing flag**

```typescript
if (!flagKey || typeof flagKey !== "string" || flagKey.length > 100) {
  return NextResponse.json({ error: "Invalid flagKey" }, { status: 400 });
}

// After update:
const { data, error } = await supabase
  .from("feature_flags")
  .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
  .eq("flag_key", flagKey)
  .select("id");

if (!data || data.length === 0) {
  return NextResponse.json({ error: "Flag not found" }, { status: 404 });
}
```

- [ ] **Step 2: Wrap req.json() in try/catch**
- [ ] **Step 3: Commit**

```bash
git commit -m "fix: validate flagKey type/length, return 404 on missing flag, handle malformed JSON"
```

---

## Task 16: Add try/catch to req.json() in admin routes (Q7)

**Files:**
- Modify: `src/app/api/admin/emails/route.ts` (PATCH)
- Modify: `src/app/api/admin/reply/route.ts` (POST)
- Modify: `src/app/api/admin/demand/gaps/route.ts` (PATCH)
- Modify: `src/app/api/admin/demand/emerging/route.ts` (PATCH)
- Modify: `src/app/api/admin/demand/subreddits/route.ts` (PATCH)

- [ ] **Step 1: Wrap each `await req.json()` in try/catch, return 400 on parse failure**

```typescript
let body;
try { body = await req.json(); } catch {
  return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "fix: handle malformed JSON in 5 admin routes"
```

---

## Task 17: Add missing indexes to customer tables (Q8)

**Files:**
- Create: `supabase/migrations/023-customer-portal-indexes.sql`

```sql
CREATE INDEX IF NOT EXISTS idx_customer_magic_links_expires ON customer_magic_links(expires_at);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_expires ON customer_sessions(expires_at);
```

- [ ] **Step 1: Create migration file**
- [ ] **Step 2: Commit**

```bash
git commit -m "fix: add expiry indexes to customer auth tables"
```

---

## Task 18: Fix cron — ISO week calculation + reconciliation (Q3, C4)

**Files:**
- Modify: `src/app/api/cron/drip/route.ts` (~line 1906)

- [ ] **Step 1: Fix ISO week number calculation**

Replace the non-standard formula with a correct one:

```typescript
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
```

- [ ] **Step 2: Commit**

```bash
git commit -m "fix: correct ISO week calculation for weekly progress emails"
```

---

## Task 19: Add requireCron guard to cron routes (Q10)

**Files:**
- Modify: `src/app/api/cron/drip/route.ts` (add defense-in-depth)

- [ ] **Step 1: Add `requireCron(req)` at the top of the handler**

```typescript
import { requireCron } from "@/lib/auth/guards";
// At top of handler:
const auth = requireCron(req);
if (!auth.authorized) return auth.error;
```

- [ ] **Step 2: Check if there are other cron routes and add to those too**
- [ ] **Step 3: Commit**

```bash
git commit -m "fix: add defense-in-depth cron auth guard to cron routes"
```

---

## Task 20: Fix score API info disclosure (S3)

**Files:**
- Modify: `src/app/api/score/route.ts`

- [ ] **Step 1: Read the score route, find where user input is reflected in error responses**
- [ ] **Step 2: Replace `${body[field]}` with generic error message**

```typescript
// Change: `Missing required field: ${field}`
// To:     "Missing required fields"
```

- [ ] **Step 3: Commit**

```bash
git commit -m "fix: remove user input reflection from score API error responses"
```

---

## Deferred (separate plan needed)

These items are real issues but require a larger refactoring effort:

| Issue | Why deferred |
|-------|-------------|
| **Q11** Cron is 2087 lines in one function | Needs full decomposition plan — extracting 19 parts into separate functions with error isolation |
| **Q1** N+1 query storm in cron Part 2 | Part of the cron decomposition |
| **Q4** Unbounded N+1 in cron Part 7 | Part of the cron decomposition |
| **Q5** Fire-and-forget fetch in cron Part 12 | Part of the cron decomposition |
| **S2** Upload ownership (email-only) | Needs design decision on session-based upload auth |
| **B2** Situation Room prerequisite soft gate | Business decision: hard-block or keep soft |
| **B3** Orphaned Stripe coupons | Needs a cleanup cron job |
| **B5** Installment ignores priority delivery | Needs Stripe subscription line-item redesign |

---

## Verification

```bash
cd ~/projects/ImNotAnAttorney-web
# TypeScript compiles
npx tsc --noEmit
# No remaining timing-unsafe comparisons in routes
grep -r "=== .*OPERATOR_SECRET\|=== .*ADMIN_PASSWORD" src/app/ --include="*.ts"
# All admin routes have try/catch on req.json()
grep -rn "req.json()" src/app/api/admin/ --include="*.ts" -A2 | grep -v "try\|catch"
# Feature flag tier_scope fix
grep -n "tierScope" src/lib/feature-flags.ts
```
