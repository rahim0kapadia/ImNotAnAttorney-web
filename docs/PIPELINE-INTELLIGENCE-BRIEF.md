# Intelligence Brief ($997) — Pipeline Documentation

> **STATUS (2026-03-03):** Pipeline is fully deployed and audited. Phase A (5 sections, parallel) + Phase B (4 sections, sequential) + static appendices + HTML rendering all automated. Operator intervenes only for judge research between phases. See `AUDIT-CHECKLIST.md` for the IB audit results.
>
> The canonical delivery SOP is `system/templates/intelligence-brief/delivery-sop.md` in the ImNotAnAttorney repo.

## Pipeline Overview

The Case Intelligence Brief is the $997 tier (`intelligence-brief` slug). It includes the Case Decoder ($197) as Part 1, then generates a deeper 9-section + 3-appendix report as Part 2 via a two-phase pipeline.

**Delivery target:** 72 hours (24 hours with priority add-on at $297).

**Pipeline flow:** Checkout → Webhook → CD auto-generation → Phase 2 intake → Phase A (5 sections parallel) → Operator judge research → Phase B (4 sections sequential) → HTML report compiled → Operator review → Delivery email.

---

## What Is Built

### 1. Stripe Checkout

**File:** `src/lib/stripe.ts`

The `intelligence-brief` tier is fully defined in the `TIERS` constant:

```ts
"intelligence-brief": {
  name: "Case Intelligence Brief",
  price: 99700,           // $997.00
  delivery: "72 hours",
  requiresDiscovery: false,
  priorityPrice: 29700,   // $297 priority add-on
  priorityDelivery: "24 hours",
},
```

Checkout session creation (`/api/checkout`) uses this config to create Stripe sessions with `tier: "intelligence-brief"` in the session metadata. This is identical to the Case Decoder checkout flow.

### 2. Webhook: Order + Case Creation

**File:** `src/app/api/webhooks/stripe/route.ts`

When Stripe fires `checkout.session.completed`, the webhook:

1. Extracts `tier`, `email`, and `amount` from the session.
2. Creates an `orders` row with `tier: "intelligence-brief"`, `status: "paid"`.
3. Looks up the most recent intake for the customer's email.
4. Creates a `cases` row:
   - **If intake exists:** `status: "intake"` (since `requiresDiscovery: false`).
   - **If no intake:** `status: "awaiting-intake"`.
5. Sends payment confirmation email to customer (includes delivery timeframe from tier config).
6. Sends operator notification email with full order details.

**Key difference from Case Decoder:** The webhook does NOT auto-trigger report generation for this tier. The auto-trigger block (lines 290-318 in route.ts) is gated by `tier === "case-decoder"`:

```ts
if (caseId && tier === "case-decoder") {
  // Only case-decoder gets auto-triggered here.
  // Higher tiers require discovery documents or manual operator action.
}
```

For `intelligence-brief`, the webhook creates the order and case, then stops. No generation endpoint is called.

### 3. Intake Form + Case Linking

**File:** `src/app/api/intake/route.ts`

The intake form is shared across all tiers. When a customer submits:

1. Intake row is created in Supabase.
2. If a case with `status: "awaiting-intake"` exists for this email, the intake is linked to the case and status updates to `"intake"`.
3. Auto-trigger for generation fires only for `case-decoder` tier (line 123):

```ts
if (pendingCase.tier === "case-decoder") {
  fetch(`${origin}/api/generate/case-decoder`, { ... });
}
```

For `intelligence-brief`, the intake is linked and status becomes `"intake"`, but no generation endpoint is called. The case sits in `"intake"` status until the operator manually processes it.

### 4. Drip Email Sequence

**File:** `src/lib/drip-emails.ts`

Three post-purchase emails are defined for this tier:

| Key | Delay | Relative To | Subject | Purpose |
|-----|-------|-------------|---------|---------|
| `post_intelligence_brief_delivery` | Day 0 | Purchase | "Your Intelligence Brief is ready -- here's how to use it in your next meeting" | Sent at delivery time by `/api/deliver` |
| `post_intelligence_brief_story_harvest` | Day 5 | `delivered_at` | "You met with your attorney -- what was the first question they stopped to think about?" | Story harvest / feedback |
| `post_intelligence_brief_upsell` | Day 10 | Purchase | "When you get discovery -- we're ready" | Upsell to X-Ray ($1,497), credits $997 |

Notes:
- The day-0 delivery email is sent by the `/api/deliver` endpoint at delivery time, not by the cron.
- The story harvest email uses `relativeToDelivery: true`, so the 5-day delay starts from `cases.delivered_at`.
- The upsell email promotes the X-Ray tier with full upgrade credit ($997 applied, customer pays $500).

### 5. Delivery Endpoint (Reusable)

**File:** `src/app/api/deliver/route.ts`

The `/api/deliver` endpoint is tier-agnostic. It works for Intelligence Brief orders the same way it works for Case Decoder:

1. **GET** — Renders operator confirmation page with case details.
2. **POST** — Sends delivery email, updates case `status` to `"delivered"`, records drip.

Requirements for delivery:
- Case must be in `"review"` status.
- A `report_token` must exist on the case (so the report URL works).
- `report_html` should be populated (for the report viewer page at `/report/[token]`).

The delivery email is currently hardcoded for Case Decoder content ("Your Case Decoder Report is Ready"). For Intelligence Brief, the operator would need to either:
- Manually set `report_html` and `report_token` on the case before using `/api/deliver`, OR
- Send the delivery email manually and update case status via Supabase directly.

### 6. Report Viewer Page

**File:** `src/app/report/[token]/page.tsx`

The token-gated report viewer renders whatever HTML is stored in `cases.report_html`. It is tier-agnostic — if `report_html` contains an Intelligence Brief, it renders an Intelligence Brief.

---

## ~~What Is NOT Built~~ — RESOLVED (2026-03-03)

All items below have been built and deployed. Kept for historical reference.

### ~~1. Generation Endpoint~~ — BUILT
- Phase A dispatcher: `src/app/api/generate/intelligence-brief/route.ts`
- Phase B dispatcher: `src/app/api/generate/intelligence-brief/judge-research/route.ts`
- Edge Function: `supabase/functions/generate-report/index.ts` (handles `tier=intelligence-brief`, `phase=A` and `phase=B`)

### ~~2. Auto-Trigger from Webhook~~ — BUILT
- Webhook auto-triggers CD generation for IB tier (included product)
- Phase A auto-triggers after Phase 1 intake submission
- Phase B triggered by operator via judge-research endpoint

### ~~3. Delivery Email Personalization~~ — BUILT
- `/api/deliver` branches on tier for subject line and body copy
- Post-purchase drip emails tier-aware in `drip-emails.ts`

### ~~4. Case Decoder-Specific Cron Logic~~ — FIXED
- Cron stuck-intake detection skips IB-tier cases in `intake` status
- IB-specific stuck detection: `researching` (24h) and `compiling` (30min)

---

## Current Automated Pipeline

```
1. Customer pays $997 via Stripe Checkout
2. Webhook creates order (paid) + case
3. CD auto-generated (included Part 1) → delivered
4. Customer completes Phase 2 intake (judge, county, case details)
5. Phase A auto-triggers → 5 sections generated in parallel
6. Phase A failure threshold: 4+/5 failures → generation-failed + operator alert
7. Operator receives judge-research instructions email
8. Operator researches judge → POSTs to judge-research endpoint
9. Phase B auto-triggers → 4 sections generated sequentially
10. HTML report compiled with ToC + 3 static appendices + page breaks
11. Case → review, operator notified with delivery link
12. Operator reviews → delivers via /api/deliver
13. Customer receives delivery email with report link
14. Drip: story harvest (day 5), X-Ray upsell (day 10)
```

**Operator touchpoints:** Judge research (step 8) and review/delivery (step 12). Everything else is automated.

---

## Drip Sequence Detail

### Post-Purchase Emails (intelligence-brief tier)

**Day 0 — Delivery** (`post_intelligence_brief_delivery`)
- Triggered: At delivery time by `/api/deliver` drip recording
- Content: Instructions to start with 48-Hour Priority List, read Attorney Accountability Score, review 10-15 questions in Appendix D
- CTA: Reply with which question got the most reaction (story harvest)

**Day 5 after delivery** (`post_intelligence_brief_story_harvest`)
- Triggered: Cron Part 2, relative to `cases.delivered_at`
- Content: Asks which question made the attorney pause
- CTA: Reply to email

**Day 10 after purchase** (`post_intelligence_brief_upsell`)
- Triggered: Cron Part 2, relative to purchase date
- Content: Promotes X-Ray ($1,497) for when customer receives discovery
- CTA: "Upgrade to The X-Ray -- $500" (after $997 credit)

Additionally, if the customer subscribed to the email list, they may also receive nurture sequence emails (days 1, 3, 5, 7, 10, 14 after subscribe). The nurture sequence is independent of purchases.

---

## ~~Next Steps for Full Automation~~ — ALL COMPLETE (2026-03-03)

All 6 items below are implemented and deployed. See `AUDIT-CHECKLIST.md` for the full IB audit.

1. ~~Prompt Template~~ — 9 section prompts in Edge Function (`buildIBPrompt`)
2. ~~Edge Function~~ — Extended `generate-report` with `handleIBPhaseA` and `handleIBPhaseB`
3. ~~Dispatcher Endpoints~~ — Phase A: `/api/generate/intelligence-brief/route.ts`, Phase B: `.../judge-research/route.ts`
4. ~~Auto-Trigger~~ — Webhook and intake trigger CD generation; Phase A triggers after Phase 2 intake
5. ~~Delivery Email~~ — `/api/deliver` branches on tier for subject and body
6. ~~Cron Fix~~ — IB-specific stuck detection for `researching` (24h) and `compiling` (30min)

---

## Remaining Deferred Items

See `AUDIT-CHECKLIST.md` items IB1-IB8 for known low-severity gaps.

---

## File Reference

| File | Role in Pipeline |
|------|-----------------|
| `src/lib/stripe.ts` | Tier definition (price, delivery, priority) |
| `src/app/api/webhooks/stripe/route.ts` | Order + case creation on payment, CD auto-trigger |
| `src/app/api/intake/route.ts` | Phase 1 intake + case linking |
| `src/app/api/intake/intelligence-brief/route.ts` | Phase 2 intake (judge, county, case details) |
| `src/app/api/generate/intelligence-brief/route.ts` | Phase A dispatcher |
| `src/app/api/generate/intelligence-brief/judge-research/route.ts` | Phase B dispatcher (judge research + trigger) |
| `supabase/functions/generate-report/index.ts` | Edge Function: Phase A (5 parallel) + Phase B (4 sequential) + HTML render |
| `src/lib/drip-emails.ts` | Post-purchase email templates (delivery + story harvest + upsell) |
| `src/app/api/deliver/route.ts` | Operator delivery endpoint (tier-aware) |
| `src/app/api/cron/drip/route.ts` | Daily cron: drip emails + stuck-case detection (IB-aware) |
| `src/app/report/[token]/page.tsx` | Token-gated report viewer (tier-agnostic) |
| `src/lib/intelligence-brief/render.ts` | Canonical HTML renderer (reference — Edge Function has Deno duplicate) |
