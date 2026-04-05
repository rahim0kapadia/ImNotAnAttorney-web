# Review Remaining Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 5 genuinely remaining issues from the Mar 22 code review passes (9 of the original 15 were already fixed during the 128-issue sprint).

**Architecture:** Two Supabase RPCs (atomic commission reversal + revenue sum), one defensive validation, and three GET parameter allowlists. All fixes are isolated — no cross-dependencies.

**Tech Stack:** Next.js 15, TypeScript, Supabase (PostgreSQL), Stripe

---

## Context

- **Repo:** `C:/Users/email/projects/ImNotAnAttorney-web/`
- **Problem:** 15 issues (6 HIGH, 9 MEDIUM) were flagged as unfixed in the Mar 22 handoff. Verification against current code shows 9 are already resolved. The remaining 5 are documented below.
- **Key files to read first:**
  - `src/app/api/webhooks/stripe/route.ts` — commission reversal (line 940-974)
  - `src/app/api/operator/metrics/route.ts` — revenue sum (lines 65-74)
  - `src/app/api/admin/demand/gaps/route.ts` — GET validation (line 14)
  - `src/app/api/admin/demand/emerging/route.ts` — GET validation (line 14)
  - `src/app/api/operator/tasks/route.ts` — GET validation (lines 29-44)
- **Key decisions:** Create RPCs for atomic operations rather than patching JS-side logic. GET parameter validation uses existing allowlist constants where available.

---

## Already Resolved (No Action Needed)

These 9 issues were verified as fixed or non-issues during codebase read:

| Issue | Original Description | Status | Evidence |
|-------|---------------------|--------|----------|
| P2-17 | N+1 in pipeline completion | **FIXED** | `pipeline.ts:124-130` — batch-fetch with `.in(case_id, caseIds)` |
| P2-18 | N+1 in operator-alerts (5 sections) | **FIXED** | `operator-alerts.ts:276-293, 414-438, 536-552, 616-632` — all batch-fetch |
| P2-19 | N+1 in drip-post-purchase | **FIXED** | `drip-post-purchase.ts:44-121` — 5 batch-fetches |
| P2-25 | select("*") in operator queries | **FIXED** | `operator/cases/route.ts:16` — uses `CASE_LIST_FIELDS` constant |
| P2-35 | Reconciliation duplicate orders | **PROTECTED** | `reconciliation.ts:62-72` — upsert with `onConflict: "stripe_session_id"` |
| P2-36 | Dead-code status filter | **NON-ISSUE** | `drip-post-purchase.ts:32` — intentional filter excluding refunded orders |
| P2-37 | Discount loop multi-attribution | **PROTECTED** | `stripe/route.ts:303` — `break` prevents double-attribution |
| P2-43 | Admin emails PATCH id not validated | **FIXED** | `admin/emails/route.ts:51-54` — proper string + boolean type check |
| P2-45 | StatusBadge duplicated | **FIXED** | Single component at `components/StatusBadge.tsx`, 14 usages via import |

Additionally, **P2-39 (N+1 webhook tier dedup)** is bounded to 2-6 queries per checkout (max 3 included tiers x 2 checks). At INAA's volume this is negligible.

---

## Execution Order

Task 1 (RPC migration) must run before Task 2 and Task 3 since the RPCs need to exist. Tasks 4-5 are independent.

---

## Task 1: Create Supabase RPCs for atomic operations

Two RPCs: commission reversal (P2-21) + revenue sum (P2-23).

**Files:**
- Create: `supabase/migrations/024-atomic-rpcs.sql`

- [ ] **Step 1: Write the migration**

```sql
-- P2-21: Atomic commission reversal (eliminates optimistic-locking race condition)
CREATE OR REPLACE FUNCTION reverse_referral_commission(
  p_referral_id uuid,
  p_partner_id uuid,
  p_commission_amount bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE partners
  SET total_referrals = GREATEST(0, total_referrals - 1),
      total_commission = GREATEST(0, total_commission - p_commission_amount),
      updated_at = NOW()
  WHERE id = p_partner_id;

  UPDATE referrals
  SET commission_amount = 0,
      commission_paid = true,
      updated_at = NOW()
  WHERE id = p_referral_id;
END;
$$;

REVOKE ALL ON FUNCTION reverse_referral_commission(uuid, uuid, bigint) FROM public;
GRANT EXECUTE ON FUNCTION reverse_referral_commission(uuid, uuid, bigint) TO service_role;


-- P2-23: Sum paid revenue without fetching all rows client-side
CREATE OR REPLACE FUNCTION sum_paid_revenue()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(amount_cents), 0)::bigint FROM orders WHERE status = 'paid';
$$;

REVOKE ALL ON FUNCTION sum_paid_revenue() FROM public;
GRANT EXECUTE ON FUNCTION sum_paid_revenue() TO service_role;
```

- [ ] **Step 2: Apply migration to production via Supabase Management API**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/024-atomic-rpcs.sql
git commit -m "feat(db): add atomic RPCs for commission reversal + revenue sum"
```

---

## Task 2: Use sum_paid_revenue RPC in metrics route (P2-23)

**Files:**
- Modify: `src/app/api/operator/metrics/route.ts` (lines 65-74 and ~110-120)

- [ ] **Step 1: Replace client-side sum with RPC call**

At lines 65-74, replace the orders query + TODO comment with:

```typescript
    // 4. Total revenue from paid orders (atomic RPC — no row limit)
    supabase.rpc("sum_paid_revenue"),
```

- [ ] **Step 2: Update the destructuring that processes the result**

Change the revenue processing from array reduce to scalar read:

```typescript
// Before: const totalRevenue = (revenueResult.data ?? []).reduce((sum, o) => sum + (o.amount_cents || 0), 0);
// After:
const totalRevenue = revenueResult.data ?? 0;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/operator/metrics/route.ts
git commit -m "fix: use sum_paid_revenue RPC to eliminate full-table scan in metrics (P2-23)"
```

---

## Task 3: Remove optimistic-locking fallback in webhook (P2-21)

Now that the `reverse_referral_commission` RPC exists, the manual fallback at lines 942-973 is dead code.

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts` (lines 940-974)

- [ ] **Step 1: Read the current code at lines 935-975**

- [ ] **Step 2: Replace the fallback block with operator alert on RPC failure**

Replace lines 940-974 with:

```typescript
                if (rpcResult.error) {
                  console.error("[Webhook] Commission reversal RPC failed:", rpcResult.error.message);
                  await supabase.from("operator_tasks").insert({
                    case_id: refundedOrder.case_id,
                    task_type: "commission_reversal_failed",
                    title: `Commission reversal failed for referral ${referral.id}`,
                    description: `RPC reverse_referral_commission failed: ${rpcResult.error.message}. Partner: ${referral.partner_id}, Amount: $${(referral.commission_amount / 100).toFixed(2)}`,
                    priority: "HIGH",
                    priority_rank: 2,
                  });
                }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts
git commit -m "fix: remove non-atomic commission reversal fallback, use RPC only (P2-21)"
```

---

## Task 4: Add GET parameter validation to 3 routes (P2-40, P2-42)

**Files:**
- Modify: `src/app/api/admin/demand/gaps/route.ts` (line ~14)
- Modify: `src/app/api/admin/demand/emerging/route.ts` (line ~14)
- Modify: `src/app/api/operator/tasks/route.ts` (lines ~29-44)

- [ ] **Step 1: gaps/route.ts — add status allowlist**

```typescript
const VALID_STATUSES = ["identified", "queued", "in-progress", "published", "declined"];
const status = url.searchParams.get("status") || "identified";
if (!VALID_STATUSES.includes(status)) {
  return NextResponse.json({ error: "Invalid status" }, { status: 400 });
}
```

- [ ] **Step 2: emerging/route.ts — add status allowlist**

```typescript
const VALID_STATUSES = ["detected", "promoted", "dismissed"];
const status = url.searchParams.get("status") || "detected";
if (!VALID_STATUSES.includes(status)) {
  return NextResponse.json({ error: "Invalid status" }, { status: 400 });
}
```

- [ ] **Step 3: tasks/route.ts — validate against existing VALID_TASK_STATUSES**

Move `VALID_TASK_STATUSES` to top of file, then in GET handler:

```typescript
const statusParam = url.searchParams.get("status");
if (statusParam && !VALID_TASK_STATUSES.includes(statusParam)) {
  return NextResponse.json({ error: "Invalid status" }, { status: 400 });
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/demand/gaps/route.ts src/app/api/admin/demand/emerging/route.ts src/app/api/operator/tasks/route.ts
git commit -m "fix: validate GET status parameter in 3 routes (P2-40, P2-42)"
```

---

## Task 5: Add defensive coupon duration validation (P2-38)

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts` (around lines 219-280)

- [ ] **Step 1: Read the installment coupon handling section**

- [ ] **Step 2: Add warning after discount extraction for installments**

```typescript
if (isInstallment && discountAmount > 0) {
  const couponDuration = session.total_details?.breakdown?.discounts?.[0]?.discount?.coupon?.duration;
  if (couponDuration && couponDuration !== "once") {
    console.warn(`[Webhook] Non-once coupon "${couponDuration}" on installment ${session.subscription}`);
    await sendEmail({
      to: operatorEmail,
      subject: "Warning: Unexpected coupon duration on installment",
      html: `<p>Subscription ${session.subscription} has a "${couponDuration}" coupon instead of "once". Commission assumes one-time discount.</p>`,
    }, { category: "operator-alert" });
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts
git commit -m "fix: warn on non-once coupon duration in installment subscriptions (P2-38)"
```

---

## Verification

After all 5 tasks:

```bash
npx tsc --noEmit --skipLibCheck
grep -n "total_commission.*partnerData" src/app/api/webhooks/stripe/route.ts  # Expected: 0
grep -n "Invalid status" src/app/api/admin/demand/gaps/route.ts src/app/api/admin/demand/emerging/route.ts src/app/api/operator/tasks/route.ts  # Expected: 3
grep -n "sum_paid_revenue" src/app/api/operator/metrics/route.ts  # Expected: 1
```
