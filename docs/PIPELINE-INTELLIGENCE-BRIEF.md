# Intelligence Brief ($797) — Pipeline Documentation

## Pipeline Overview

The Case Intelligence Brief is the $797 tier (`intelligence-brief` slug). It provides deeper case analysis than the Case Decoder: judge tendencies, jurisdiction-specific plea statistics, motion landscape, and 35-50 targeted questions.

**Delivery target:** 48-72 hours (24 hours with priority add-on at $297).

This document maps every step of the pipeline, flagging what is built and operational versus what is NOT built and requires manual intervention.

---

## What Is Built

### 1. Stripe Checkout

**File:** `src/lib/stripe.ts`

The `intelligence-brief` tier is fully defined in the `TIERS` constant:

```ts
"intelligence-brief": {
  name: "Case Intelligence Brief",
  price: 79700,           // $797.00
  delivery: "48-72 hours",
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
| `post_intelligence_brief_upsell` | Day 10 | Purchase | "When you get discovery -- we're ready" | Upsell to X-Ray ($1,497), credits $797 |

Notes:
- The day-0 delivery email is sent by the `/api/deliver` endpoint at delivery time, not by the cron.
- The story harvest email uses `relativeToDelivery: true`, so the 5-day delay starts from `cases.delivered_at`.
- The upsell email promotes the X-Ray tier with full upgrade credit ($797 applied, customer pays $700).

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

## What Is NOT Built

### 1. Generation Endpoint

There is no `/api/generate/intelligence-brief` endpoint. The only generation endpoint is `/api/generate/case-decoder/route.ts`, which:

- Dispatches to the Supabase Edge Function `generate-report`.
- The Edge Function runs Claude Sonnet 4.6 with a Case Decoder-specific prompt.
- The prompt template generates a 9-section Case Decoder report.

None of this infrastructure has been adapted for the Intelligence Brief. Specifically missing:

- **No dispatcher route** at `src/app/api/generate/intelligence-brief/route.ts`.
- **No Edge Function** (or Edge Function branch) for Intelligence Brief prompts.
- **No prompt template** deployed for generating an Intelligence Brief report.

### 2. Auto-Trigger from Webhook

The webhook only auto-triggers generation for `case-decoder`. Even if a generation endpoint existed for Intelligence Brief, the webhook would not call it. Both the webhook (line 290) and intake endpoint (line 123) have explicit `tier === "case-decoder"` guards.

### 3. Delivery Email Personalization

The `/api/deliver` endpoint's delivery email references "Case Decoder" specifically in the subject line and body. It does not branch on tier to send tier-appropriate copy. The drip email template `post_intelligence_brief_delivery` exists in `drip-emails.ts` but is only used by the cron's drip recording, not by the actual delivery email sent in `/api/deliver`.

### 4. Case Decoder-Specific Cron Logic

The cron's stuck-case detection (Parts 4 and 5) monitors `"intake"` and `"generating"` statuses. For Intelligence Brief cases that sit in `"intake"` status for 2+ hours (which is expected since there is no auto-generation), the cron will mark them `"intake-stalled"` and alert the operator. This is a false positive for this tier.

---

## What Happens Today (Manual Process)

Given the gaps above, the current Intelligence Brief delivery workflow is:

```
1. Customer pays $797 via Stripe Checkout
2. Webhook creates order (paid) + case (awaiting-intake or intake)
3. Customer receives payment confirmation email
4. Operator receives new order notification email
5. Customer fills intake form (if not already done)
   - Intake links to case, status becomes "intake"
6. Operator receives intake notification email
7. --- MANUAL ZONE ---
8. Operator reads intake data from Supabase
9. Operator manually creates the Intelligence Brief report
   (using prompt templates from system/templates/ and elite skills)
10. Operator manually sets report_html + report_token on the case in Supabase
11. Operator manually updates case status to "review"
12. Operator uses /api/deliver to send the report to the customer
    (or sends the delivery email manually if the hardcoded Case Decoder
    copy in /api/deliver is unacceptable)
13. Case status becomes "delivered"
14. Drip cron sends story harvest email 5 days after delivery
15. Drip cron sends X-Ray upsell email 10 days after purchase
```

**Important caveat:** Step 5 may trigger a false "intake-stalled" alert from the cron if the case sits in `"intake"` for more than 2 hours. The operator should expect and ignore this alert for Intelligence Brief cases.

---

## Drip Sequence Detail

### Post-Purchase Emails (intelligence-brief tier)

**Day 0 — Delivery** (`post_intelligence_brief_delivery`)
- Triggered: At delivery time by `/api/deliver` drip recording
- Content: Instructions to start with Judge Tendencies Card, review motion landscape, pick 10 questions from the 35-50 generated
- CTA: Reply with which question got the most reaction (story harvest)

**Day 5 after delivery** (`post_intelligence_brief_story_harvest`)
- Triggered: Cron Part 2, relative to `cases.delivered_at`
- Content: Asks which question made the attorney pause
- CTA: Reply to email

**Day 10 after purchase** (`post_intelligence_brief_upsell`)
- Triggered: Cron Part 2, relative to purchase date
- Content: Promotes X-Ray ($1,497) for when customer receives discovery
- CTA: "Upgrade to The X-Ray -- $700" (after $797 credit)

Additionally, if the customer subscribed to the email list, they may also receive nurture sequence emails (days 1, 3, 5, 7, 10, 14 after subscribe). The nurture sequence is independent of purchases.

---

## Next Steps for Full Automation

To bring the Intelligence Brief pipeline to the same level of automation as Case Decoder, the following work is needed:

### 1. Prompt Template for Intelligence Brief
Create Claude prompt template(s) that generate the Intelligence Brief report sections:
- Charges explained (deeper than Case Decoder)
- Judge tendencies and sentencing patterns
- Jurisdiction-specific plea statistics
- Motion landscape report
- 35-50 targeted questions (vs. 10-15 for Case Decoder)
- Attorney accountability analysis
- Judge Tendencies Card (bonus)

### 2. Edge Function Update
Either extend the existing `generate-report` Edge Function to branch on tier, or create a separate `generate-intelligence-brief` Edge Function. The function needs:
- To read intake data from Supabase
- To call Claude with the Intelligence Brief prompt template
- To store `report_html` and `report_token` on the case
- To update case status to `"review"`
- To notify the operator with a delivery link

### 3. Dispatcher Endpoint
Create `src/app/api/generate/intelligence-brief/route.ts` following the same pattern as the Case Decoder dispatcher:
- Auth via OPERATOR_SECRET bearer token
- Idempotency check (skip if already generating/review/delivered)
- Atomic guard (conditional UPDATE to prevent race conditions)
- Fire-and-forget call to the Edge Function

### 4. Auto-Trigger Wiring
Update the webhook (`src/app/api/webhooks/stripe/route.ts`) and intake endpoint (`src/app/api/intake/route.ts`) to also trigger generation for `intelligence-brief` tier:
- Webhook line ~290: Add `|| tier === "intelligence-brief"` to the guard
- Intake line ~123: Add `|| pendingCase.tier === "intelligence-brief"` to the guard
- Both need to call the new `/api/generate/intelligence-brief` endpoint

### 5. Delivery Email Personalization
Update `/api/deliver` to branch on `caseData.tier` and send tier-appropriate email copy:
- Subject: "Your Intelligence Brief is Ready"
- Body: Instructions specific to Intelligence Brief sections
- Drip recording: Use `post_intelligence_brief_delivery` key instead of `post_case_decoder_delivery`

### 6. Cron False Positive Fix
Update the cron's stuck-intake detection (Part 4) to only flag `case-decoder` cases, or increase the threshold for higher tiers that have longer manual processing times.

---

## File Reference

| File | Role in Pipeline |
|------|-----------------|
| `src/lib/stripe.ts` | Tier definition (price, delivery, priority) |
| `src/app/api/webhooks/stripe/route.ts` | Order + case creation on payment |
| `src/app/api/intake/route.ts` | Intake submission + case linking |
| `src/lib/drip-emails.ts` | Post-purchase email templates (3 emails) |
| `src/app/api/deliver/route.ts` | Operator delivery endpoint (reusable) |
| `src/app/api/generate/case-decoder/route.ts` | Generation dispatcher (Case Decoder only -- pattern to replicate) |
| `src/app/api/cron/drip/route.ts` | Daily cron: drip emails + stuck-case detection |
| `src/app/report/[token]/page.tsx` | Token-gated report viewer (tier-agnostic) |
| `supabase/functions/generate-report/` | Edge Function for LLM report generation (Case Decoder only) |
