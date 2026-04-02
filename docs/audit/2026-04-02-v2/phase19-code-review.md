# Phase 19: Code Review Report

**Date:** 2026-04-02
**Scope:** Recent commits (8017e39, f45536a, 9932808) + critical path files
**Reviewer:** Atlas (automated code review)

---

## Summary

Reviewed 15+ files across the recently-changed code and the payment/webhook critical path. Found **1 real logic bug** (stale WHERE clause in intake route), **4 dead code issues**, **3 type safety concerns**, **1 error handling gap**, and **1 fragile pattern** worth documenting. The codebase is well-structured overall -- the dual-mode Stripe architecture, rate limiting with fallback, timing-safe auth guards, and HTML escaping are all solid.

---

## CRITICAL: Logic Bug

### C1. Stale status WHERE clause in auto-trigger generation (intake route)

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\intake\route.ts`
**Lines:** 253-276
**Severity:** CRITICAL -- Case Decoder auto-generation silently fails for Flow B (paid before intake)

The code first updates the case status from `awaiting-intake` to `intake` (line 257), then immediately tries to update it from `awaiting-intake` to `generating` (line 274-276). The second update has `.eq("status", "awaiting-intake")` as a WHERE clause, but the status was already changed to `intake` by the first update. This means:

1. The second `UPDATE` matches zero rows (no-op)
2. The status remains `intake` instead of transitioning to `generating`
3. The fire-and-forget fetch to `/api/generate/case-decoder` still fires (line 278)
4. But the stuck-generating cron cannot detect failures since the status was never set to `generating`

```typescript
// Line 253-264: First update — status becomes "intake"
await supabase
  .from("cases")
  .update({ intake_id: latestIntake.id, status: "intake", ... })
  .eq("id", pendingCase.id);

// Line 272-276: Second update — tries to match status "awaiting-intake" (ALREADY CHANGED)
await supabase
  .from("cases")
  .update({ status: "generating", updated_at: new Date().toISOString() })
  .eq("id", pendingCase.id)
  .eq("status", "awaiting-intake");  // <-- BUG: status is now "intake", not "awaiting-intake"
```

**Impact:** The report generation still fires (the fetch happens regardless of the update result), so customers DO get their reports. But the stuck-generating detection cron cannot catch failures because the case never enters the `generating` state. If the fire-and-forget fetch silently fails, the case sits in `intake` status indefinitely with no automated recovery.

**Fix:** Change the WHERE clause on line 276 from `"awaiting-intake"` to `"intake"`:
```typescript
.eq("status", "intake");
```

---

## HIGH: Error Handling Gaps

### H1. Missing try/catch around req.json() in checkout route

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\checkout\route.ts`
**Line:** 54
**Severity:** HIGH -- unhandled rejection on malformed request body

The checkout route calls `await req.json()` without a try/catch. If a client sends a non-JSON body (empty body, form-encoded, etc.), this throws an unhandled error that falls through to the outer catch block, which returns a generic "Failed to create checkout session" 500 error AND triggers coupon cleanup on a coupon that was never created.

Compare with the intake route (line 72-75) and IndexNow route (line 22-25), which both wrap `req.json()` in a dedicated try/catch with a 400 response. The checkout route should follow the same pattern.

```typescript
// Line 54 — no protection against malformed body
const body = await req.json();
```

**Impact:** A malformed request to `/api/checkout` returns a 500 instead of 400. Not a data-loss risk since no Stripe session is created yet, but it pollutes error logs and the generic message is unhelpful for debugging.

---

## MEDIUM: Dead Code

### M1. Unused import: `AnimatedCounter`

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\page.tsx`
**Line:** 37
**Severity:** LOW -- no runtime impact, minor bundle cost

`AnimatedCounter` is imported but never used anywhere in the file's JSX. It was likely removed during a prior homepage redesign but the import was left behind.

```typescript
import { AnimatedCounter } from "@/components/motion/AnimatedCounter";
```

### M2. Unused destructured variable: `productType`

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\checkout\route.ts`
**Line:** 55
**Severity:** LOW -- no runtime impact

`productType` is destructured from the request body but never referenced anywhere in the function. The `product_type` metadata is determined by `tierConfig.isDigitalProduct`, not by client input, which is the correct behavior (server-side determination is more secure than trusting client-provided product type).

```typescript
const { tier, email, consent, priorityDelivery, courtDate, chargeType, existingCaseNumber, existingCaseState, productType, promoCode, paymentPlan } = body;
//                                                                                                                   ^^^^^^^^^^^^ never used
```

### M3. `as any` usage in invoice.payment_failed handler

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\webhooks\stripe\route.ts`
**Line:** 1103
**Severity:** LOW -- type safety bypass

```typescript
const invoice = event.data.object as any;
```

The Stripe SDK provides typed event data. Using `as any` bypasses TypeScript's ability to catch property access errors on `invoice.subscription`, `invoice.amount_due`, `invoice.customer_email`, and `invoice.attempt_count`. The correct type would be `Stripe.Invoice`.

### M4. `as any` usage in deliver route (evaluation teams)

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\deliver\route.ts`
**Lines:** 110, 132, 136
**Severity:** LOW -- type safety bypass

The evaluation `teams` object is cast to `any` to iterate its criteria. This is understandable for dynamic evaluation data from Supabase Edge Functions, but an interface definition would be preferable.

---

## MEDIUM: Architectural Observations

### A1. Charge-taxonomy routes silently return `[]` on all errors

**Files:**
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\charge-taxonomy\categories\route.ts` (line 13-15)
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\charge-taxonomy\charges\route.ts` (line 43-45)
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\charge-taxonomy\questions\route.ts` (line 21-23)
**Severity:** MEDIUM -- silent failures

All three charge-taxonomy routes catch ALL errors and return `[]` with a 200 status. This means database outages, misconfigured env vars (missing SUPABASE_SERVICE_ROLE_KEY), and query errors all look identical to the client -- an empty category list. The client has no way to distinguish "no categories exist" from "the database is down."

This is a deliberate degradation pattern (the UI shows an empty selector instead of an error), but it also swallows env var misconfigurations that should be caught during deployment. The missing-env-var check (lines 7-8 in categories/route.ts) returns `[]` instead of logging or alerting.

### A2. `interpolateScoreVars` nested-div fragility

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\drip-emails.ts`
**Lines:** 192-200
**Severity:** LOW -- works correctly with current templates

The charge-variant stripping logic finds the first `</div>` after the opening tag. This works because current variant content (lines 387-430) contains only `<p>`, `<ul>`, `<li>` elements -- no nested `<div>` tags. But if someone adds a `<div>` inside a variant block in the future, the stripping logic will truncate content mid-element. The existing CONTEXT.md (line 230) documents this as a known gotcha, so it's tracked.

### A3. Redundant email normalization in intake route

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\intake\route.ts`
**Lines:** 119, 183, 237, 346, 350
**Severity:** LOW -- no functional impact

`email.toLowerCase().trim()` is called 5 separate times instead of being normalized once into a variable at the top. The `normalizeEmail()` utility from `@/lib/site` exists and is used in the checkout and webhook routes, but the intake route does inline normalization. The dedup check (line 119) normalizes the email, then the insert (line 183) normalizes it again, and the case linking (line 237) normalizes it a third time. This isn't a bug but is inconsistent with the pattern used in the other payment-critical routes.

---

## LOW: Style / Consistency

### S1. Operator notification email metadata mismatch in intake route

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\intake\route.ts`
**Line:** 398
**Severity:** LOW -- misleading metadata

The operator notification email uses `{ flow: "paid" }` in the metadata for ALL intakes, regardless of whether the customer has paid or not. This metadata is sent even for Flow A (intake before payment), where the customer hasn't paid.

```typescript
}, { category: "intake-confirmation", metadata: { charge_type: chargeType, flow: "paid" } });
```

Should use `hasPendingCase ? "paid" : "free"` or similar.

### S2. HomepageHero `as TierSlug` used 3x on same value

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\components\HomepageHero.tsx`
**Line:** 36-37
**Severity:** LOW -- type assertion repeated

```typescript
? `Get Your ${TIER_CORE[playbookSlug as TierSlug].name} — ${TIER_CORE[playbookSlug as TierSlug].priceDisplay}`
```

The `as TierSlug` assertion is applied twice on the same line. Extracting to a typed variable would be cleaner and safer (could use `satisfies` or a type guard at the assignment point).

---

## Not Issues (Verified Correct)

- **Webhook signature verification loop:** Tries both test and live secrets. If the wrong secret is tried first, the `constructEvent` throws, and the loop continues to the next secret. Correct behavior.
- **Upgrade credit cap to $0.50 minimum:** Prevents zero-amount sessions that can't be refunded. Sound business logic.
- **Rate limit fail-closed with in-memory fallback:** When Supabase is down, the in-memory limiter activates with conservative limits. Correct pattern.
- **HMAC-based timing-safe comparison:** Eliminates length oracle in `timingSafeCompare`. Industry best practice.
- **Score calculator observation ordering:** Charge-specific observation fires for every result (line 115). Padding observations (lines 307-321) only fire if fewer than 3 exist. Correct.
- **Score banding boundaries:** 0-30, 31-50, 51-70, 71-85, 86-100. No gaps, no overlaps. Correct.
- **Duplicate webhook handling via Postgres 23505:** Idempotent -- returns 200 on duplicate. Correct.
- **`requireCron()` guard on IndexNow route:** Prevents public abuse of the IndexNow submission endpoint. Good security.
- **IntakeChargeQuestions radio semantics:** `role="radiogroup"` on `<fieldset>` and `role="radio"` + `aria-checked` on buttons. Correct a11y pattern for custom radio controls.
- **PartnerApplicationForm htmlFor/id:** All labels correctly associated with inputs via matching `htmlFor`/`id` pairs. No a11y issues.

---

## Findings by Severity

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| CRITICAL | 1 | C1 (stale WHERE clause) |
| HIGH | 1 | H1 (missing try/catch on checkout JSON parse) |
| MEDIUM | 3 | M1, M2, A1 |
| LOW | 6 | M3, M4, A2, A3, S1, S2 |

---

## Recommended Priority

1. **Fix C1 immediately** -- the stale WHERE clause means stuck-generating detection is broken for Flow B (intake after payment). One-line fix.
2. **Fix H1** -- add try/catch around `req.json()` in checkout route. Quick fix, prevents confusing 500s.
3. **Clean up M1/M2** -- remove unused import and destructured variable. No risk.
4. **Consider A1** -- add console.error logging to charge-taxonomy catch blocks so silent failures at least appear in logs.
