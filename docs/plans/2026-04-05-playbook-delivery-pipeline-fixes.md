# Playbook Delivery Pipeline Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the playbook purchase E2E pipeline so (1) success page shows download buttons, (2) verify API accepts $0 QA orders, and (3) upgrade copy explains the credit mechanism clearly.

**Architecture:** Three surgical fixes across the verify API, success page, and webhook email. The verify API gains a Supabase lookup to return download URLs. The success page renders download buttons when URLs are available, with a fallback for the webhook race condition. Upgrade copy in both success page and delivery email explains full price + credit.

**Tech Stack:** Next.js 15, Stripe API, Supabase, React (client component)

---

## Pipeline Map

```
Checkout Page -> Checkout API -> Stripe Checkout -> Webhook -> Verify API -> Success Page
                                                      |                          |
                                                Download API  <, <,  Delivery Email
```

**Webhook** creates order + `download_token` in Supabase `orders` table, sends delivery email with download links.
**Verify API** confirms payment status; success page calls it on mount.
**Download API** (`/api/download/[token]`) validates token, generates signed Supabase Storage URL, redirects to PDF.
**Delivery email** (inside webhook) sends download buttons + upgrade CTA.

## Issues

| ID | Component | File | Problem |
|----|---------, |------|---------|
| A | Webhook | `api/webhooks/stripe/route.ts:131` | Rejects $0 amount, **FIXED** (`645fd13`) |
| B | Verify API | `api/checkout/verify/route.ts:85` | Rejects `payment_status="no_payment_required"` for $0 sessions |
| C | Success page | `checkout/success/page.tsx:332-343` | No download button, just says "check email" |
| D | Success page | `checkout/success/page.tsx:413,434` | Upgrade says "$100" without explaining CD is $197 with $97 credited |
| E | Delivery email | `api/webhooks/stripe/route.ts:435-436` | Same upgrade copy issue as D |

---

### Task 1: Fix verify API, accept $0 payments and return download URLs

**Files:**
- Modify: `src/app/api/checkout/verify/route.ts:82-109`

- [ ] **Step 1: Fix payment_status check**

In `src/app/api/checkout/verify/route.ts`, replace lines 82-87:

```typescript
    // Only treat "paid" as verified. Stripe sessions can also be "unpaid"
    // (abandoned) or "no_payment_required" (100% coupon). We require "paid"
    // because all our tiers have a non-zero price after any applicable credit.
    if (session.payment_status !== "paid") {
      return NextResponse.json({ verified: false });
    }
```

with:

```typescript
    // Treat "paid" and "no_payment_required" as verified. "no_payment_required"
    // occurs with 100% coupons (e.g., internal QA coupon for E2E testing).
    // "unpaid" means the customer abandoned, reject that.
    if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
      return NextResponse.json({ verified: false });
    }
```

- [ ] **Step 2: Add download URL lookup**

After `response` object construction (after line 103, before `return NextResponse.json(response)`), add:

```typescript
    // For digital products, look up the download token from the order record.
    // The webhook creates the token async, it may not exist yet if the customer
    // hits the success page before the webhook fires. Return null gracefully;
    // the success page shows "check email" as fallback.
    const tierSlug = session.metadata?.tier;
    if (session.metadata?.product_type === "digital-product" ||
        (tierSlug && !["case-decoder","intelligence-brief","x-ray","war-room","situation-room","extra-witness","witness-pack"].includes(tierSlug))) {
      const { data: order } = await supabase
        .from("orders")
        .select("download_token, download_token_expires_at")
        .eq("stripe_session_id", sessionId)
        .eq("product_type", "digital-product")
        .maybeSingle();

      if (order?.download_token) {
        const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
        response.downloadUrl = `${origin}/api/download/${order.download_token}`;
        response.emergencyDownloadUrl = `${origin}/api/download/${order.download_token}?doc=emergency`;
      }
    }
```

- [ ] **Step 3: Type check**

Run: `cd C:/Users/email/projects/ImNotAnAttorney-web && npx tsc,noEmit`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/checkout/verify/route.ts
git commit -m "fix(verify): accept no_payment_required + return download URLs for digital products"
```

---

### Task 2: Add download buttons to success page

**Files:**
- Modify: `src/app/checkout/success/page.tsx`
  - Lines 195-225 (state + fetch handler)
  - Lines 332-343 (digital product render block)

- [ ] **Step 1: Add download URL state**

After line 206 (`const [priorityDelivery, setPriorityDelivery] = useState(false);`), add:

```typescript
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [emergencyDownloadUrl, setEmergencyDownloadUrl] = useState<string | null>(null);
```

- [ ] **Step 2: Extract download URLs from verify response**

In the `.then((data) => {...})` block (after line 222 `if (data.priorityDelivery) setPriorityDelivery(true);`), add:

```typescript
        if (data.downloadUrl) setDownloadUrl(data.downloadUrl);
        if (data.emergencyDownloadUrl) setEmergencyDownloadUrl(data.emergencyDownloadUrl);
```

- [ ] **Step 3: Replace digital product render section**

Replace lines 332-343 (the `{info.isDigitalProduct ? (` block through its closing `</div>`) with:

```tsx
            {info.isDigitalProduct ? (
              <div className="mt-6">
                {downloadUrl ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
                      <p className="text-sm font-semibold text-red-400">Start Here, Emergency Playbook</p>
                      <p className="mt-1 text-xs text-zinc-400">Your First 72 Hours checklist, 5 Priority Questions, and what to do right now.</p>
                      <a
                        href={emergencyDownloadUrl || downloadUrl}
                        className="mt-3 inline-block rounded-lg bg-red-500 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-red-400"
                      >
                        Download Emergency Playbook
                      </a>
                    </div>
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
                      <p className="text-sm font-semibold text-amber-400">Full Defense Playbook</p>
                      <p className="mt-1 text-xs text-zinc-400">Complete reference, case stage roadmap, red flag checklist, scorecard, all 26 questions.</p>
                      <a
                        href={downloadUrl}
                        className="mt-3 inline-block rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-amber-400"
                      >
                        Download Full Playbook
                      </a>
                    </div>
                    <p className="text-xs text-zinc-500">
                      Download links also sent to {customerEmail}. Links expire in 72 hours.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-6">
                    <p className="text-zinc-400">
                      Your playbook download link has been sent to <span className="text-zinc-300">{customerEmail}</span>
                    </p>
                    <p className="mt-2 text-sm text-zinc-400">
                      Check your inbox, if you don&apos;t see it in 5 minutes, check spam.
                    </p>
                  </div>
                )}
              </div>
            ) : (
```

The fallback (no `downloadUrl`) handles the race condition where the webhook has not fired yet.

- [ ] **Step 4: Type check**

Run: `cd C:/Users/email/projects/ImNotAnAttorney-web && npx tsc,noEmit`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add src/app/checkout/success/page.tsx
git commit -m "feat(success): show download buttons for playbooks on success page"
```

---

### Task 3: Fix upgrade copy, success page

**Files:**
- Modify: `src/app/checkout/success/page.tsx:413,434`

- [ ] **Step 1: Update upgrade explanation (line 413)**

Replace:

```tsx
                  Your {TIER_CORE[tier as keyof typeof TIER_CORE]?.priceDisplay ?? "$97"} is already credited. The Playbook gives you general questions, the Case Decoder builds 15 questions from YOUR charges, YOUR state, YOUR stage.
```

with:

```tsx
                  The Case Decoder is {TIER_CORE["case-decoder"].priceDisplay}, your {TIER_CORE[tier as keyof typeof TIER_CORE]?.priceDisplay ?? "$97"} playbook purchase is fully credited, so you pay just {upgradeCostBetween(tier as TierSlug, "case-decoder")}. Every dollar moves upward. The Playbook gives you general questions, the Case Decoder builds 15 questions from YOUR charges, YOUR state, YOUR stage.
```

- [ ] **Step 2: Update upgrade CTA button (line 434)**

Replace:

```tsx
                  Upgrade to {TIER_CORE["case-decoder"].name}, {upgradeCostBetween(tier as TierSlug, "case-decoder")} &rarr;
```

with:

```tsx
                  Upgrade for {upgradeCostBetween(tier as TierSlug, "case-decoder")} (your {TIER_CORE[tier as keyof typeof TIER_CORE]?.priceDisplay ?? "$97"} credited) &rarr;
```

- [ ] **Step 3: Type check + commit**

```bash
npx tsc,noEmit
git add src/app/checkout/success/page.tsx
git commit -m "fix(success): explain full price + credit in upgrade copy"
```

---

### Task 4: Fix upgrade copy, delivery email

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts:435-436`

- [ ] **Step 1: Update email upgrade explanation (line 435)**

Replace:

```typescript
            <p style="margin: 8px 0 0; color: #D4D4D8;">Your ${TIER_CORE[upgradeTierSlug].priceDisplay} is fully credited toward the ${TIER_CORE["case-decoder"].name} (${TIER_CORE["case-decoder"].priceDisplay}). Get 15 questions built from YOUR charges, YOUR state, YOUR stage.</p>
```

with:

```typescript
            <p style="margin: 8px 0 0; color: #D4D4D8;">The ${TIER_CORE["case-decoder"].name} is ${TIER_CORE["case-decoder"].priceDisplay}, your ${TIER_CORE[upgradeTierSlug].priceDisplay} is fully credited, so you pay just ${upgradeCost}. Every dollar moves upward. Get 15 questions built from YOUR charges, YOUR state, YOUR stage.</p>
```

- [ ] **Step 2: Update email CTA button (line 436)**

Replace:

```typescript
            <a href="${origin}/checkout?tier=case-decoder" style="...">${upgradeCost ? `Upgrade for ${upgradeCost} →` : "Upgrade to Case Decoder →"}</a>
```

with:

```typescript
            <a href="${origin}/checkout?tier=case-decoder" style="...">${upgradeCost ? `Upgrade for ${upgradeCost} (your ${TIER_CORE[upgradeTierSlug].priceDisplay} credited) →` : "Upgrade to Case Decoder →"}</a>
```

- [ ] **Step 3: Type check + commit**

```bash
npx tsc,noEmit
git add src/app/api/webhooks/stripe/route.ts
git commit -m "fix(email): explain full price + credit in delivery email upgrade CTA"
```

---

### Task 5: Build + push + deploy

- [ ] **Step 1: Full build**

```bash
cd C:/Users/email/projects/ImNotAnAttorney-web && npm run build
```

- [ ] **Step 2: Push**

```bash
git push
```

- [ ] **Step 3: Wait for Vercel READY**

Check deployment via API until state = READY.

---

### Task 6: E2E production test

- [ ] **Step 1: Create checkout session with QA email**

```bash
curl -X POST https://imnotanattorney.com/api/checkout \
  -H "Content-Type: application/json" \
  -d '{"tier":"dui-first-offense","email":"admin@imnotanattorney.com"}'
```

- [ ] **Step 2: Verify $0 discount applied via Stripe API**

- [ ] **Step 3: Complete checkout in browser** (Rahim does this)

- [ ] **Step 4: Verify success page shows download buttons**

- [ ] **Step 5: Verify delivery email at admin@imnotanattorney.com**

- [ ] **Step 6: Verify download links serve PDFs**

- [ ] **Step 7: Verify order in Supabase**

```sql
SELECT id, email, tier, amount, status, download_token, product_type
FROM orders WHERE email = 'admin@imnotanattorney.com'
ORDER BY created_at DESC LIMIT 1;
```
