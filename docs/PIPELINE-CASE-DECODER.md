# Case Decoder ($197) — Automated Pipeline Documentation

This document describes the full automated pipeline for the Case Decoder product, from Stripe checkout through report delivery and post-purchase drip emails.

## Pipeline Overview

```
                         CUSTOMER                                    SYSTEM                                   OPERATOR
                         --------                                    ------                                   --------

  1. Visit /checkout?tier=case-decoder
     or submit intake form + checkout     ------>   POST /api/checkout
                                                      |
                                                      | Creates Stripe Checkout Session
                                                      | (metadata: tier, email, chargeType, etc.)
                                                      |
  2. Complete payment on Stripe hosted page  -------> Stripe fires webhook
                                                      |
                                                      v
                                                   POST /api/webhooks/stripe
                                                      |
                                                      |-- INSERT orders (unique on stripe_session_id)
                                                      |-- INSERT cases (status depends on intake)
                                                      |-- Lookup intake by email
                                                      |
                                              +-------+-------+
                                              |               |
                                        Intake EXISTS    No intake found
                                              |               |
                                        case.status =    case.status =
                                          "intake"       "awaiting-intake"
                                              |               |
                                              |         Email customer:
                                              |         "Complete your case details"
                                              |               |
                                              |         Customer fills intake form
                                              |               |
                                              |         POST /api/intake
                                              |           |-- INSERT intakes
                                              |           |-- Link intake to case
                                              |           |-- case.status = "intake"
                                              |               |
                                              +-------+-------+
                                                      |
                                                      v
                                     Fire-and-forget: POST /api/generate/case-decoder
                                                      |
                                                      |-- Auth check (OPERATOR_SECRET)
                                                      |-- Idempotency check (skip if already processing)
                                                      |-- Atomic guard: UPDATE cases SET status='generating'
                                                      |   WHERE status NOT IN ('generating','review','delivered')
                                                      |
                                                      v
                                     Fire-and-forget: Supabase Edge Function
                                                      /functions/v1/generate-report
                                                      |
                                                      |-- Fetch case + intake from Supabase
                                                      |-- Call Claude Haiku 4.5 API (~60-120s)
                                                      |-- Render markdown to branded HTML
                                                      |-- Save report_html + report_token
                                                      |-- case.status = "review"
                                                      |
                                                      v
                                                   Operator email:                ------>  3. Review report
                                                   "Review Report: [charge] — [name]"        (Preview link)
                                                   [Approve & Deliver] [Preview]              |
                                                                                              |
                                                                                        Click "Approve & Deliver"
                                                                                              |
                                                      +--------------------------------------+
                                                      |
                                                      v
                                                   GET /api/deliver
                                                      |-- Render confirmation page (safe for email prefetch)
                                                      |
                                                   Operator clicks "Confirm Delivery"
                                                      |
                                                      v
                                                   POST /api/deliver
                                                      |-- Send delivery email to customer
                                                      |-- case.status = "delivered"
                                                      |-- Record drip: "post_case_decoder_delivery"
                                                      |
  4. Receive delivery email               <------     v
     "Your Case Decoder Report is Ready"
     [View Your Report] button
                                                      |
                                                      v
                                                   /api/cron/drip (daily 14:00 UTC)
                                                      |-- Part 2: Post-purchase drip sequence
                                                      |   Day 5: Story harvest email
                                                      |   Day 7: Upsell to Intelligence Brief
                                                      |   Day 14: Referral email
  5. Receive drip emails                  <------     |
```

## Step-by-Step Flow

### Step 1: Checkout Session Creation

**File:** `src/app/api/checkout/route.ts`

The customer initiates a purchase via `POST /api/checkout` with body `{ tier: "case-decoder", email, chargeType, ... }`.

The checkout route performs these operations before creating the Stripe session:

1. **Tier validation** -- Rejects unknown tier slugs against the `TIERS` config.
2. **Email normalization** -- Lowercase + trim for consistent DB lookups.
3. **Email capture** -- Upserts email into `subscribers` table (powers abandonment recovery even if checkout is abandoned).
4. **Charge type auto-detection** -- If no `chargeType` provided, looks up the customer's most recent intake form.
5. **Refund check** -- Customers with a prior refund forfeit all upgrade credit.
6. **Situation Room prerequisite gate** -- Not applicable for Case Decoder, but runs for all tiers.
7. **Consent validation** -- Not required for Case Decoder ($197 < $1,497 threshold).
8. **Upgrade credit calculation** -- 100% credit from prior lower-tier purchases (12-month window), implemented as a one-time Stripe coupon.
9. **Stripe session creation** -- All business context (tier, credit, consent, charge type) is packed into session metadata so the webhook can create records without re-querying.

**Output:** Returns `{ url }` pointing to Stripe-hosted checkout.

**Redirect URLs:** Sourced from `NEXT_PUBLIC_SITE_URL` env var, never from the request Origin header, to prevent open-redirect attacks.

---

### Step 2: Stripe Webhook — Order + Case Creation

**File:** `src/app/api/webhooks/stripe/route.ts`

**Event:** `checkout.session.completed`

After the customer pays, Stripe fires a webhook. The handler:

1. **Verifies Stripe signature** -- Using `STRIPE_WEBHOOK_SECRET`.
2. **Extracts metadata** -- `tier`, `email` (normalized), `amount`, plus all the checkout metadata fields.
3. **Creates order record** -- Inserts into `orders` table. The `stripe_session_id` column has a unique constraint for deduplication (see Idempotency section below).
4. **Creates case record** -- Assigns a `crypto.randomUUID()` as the case ID. Looks up the most recent intake by email match. Sets initial status:
   - **Intake found** + non-discovery tier = `"intake"` (ready for generation)
   - **No intake found** = `"awaiting-intake"` (customer needs to fill the form)
5. **Triggers generation or sends intake request email** -- See Trigger Paths below.
6. **Sends payment confirmation email** to customer (product name, amount, delivery timeframe).
7. **Sends operator notification email** (full order details).

---

### Step 3: Report Generation Dispatcher

**File:** `src/app/api/generate/case-decoder/route.ts`

This is a thin dispatcher running on Vercel Hobby (10s timeout). It cannot do the actual generation (which takes 60-120s), so it delegates to the Supabase Edge Function.

1. **Auth check** -- `OPERATOR_SECRET` bearer token. Includes an explicit undefined-guard: if the env var is missing, ALL requests are rejected (prevents `"Bearer undefined"` matching a missing env var).
2. **Idempotency check** -- Reads case status. If already `"generating"`, `"review"`, or `"delivered"`, returns early (unless `force: true`).
3. **Atomic guard** -- Conditional `UPDATE cases SET status = 'generating' WHERE id = ? AND status NOT IN ('generating', 'review', 'delivered')`. Only one concurrent caller can win this UPDATE (see Idempotency section). The loser gets zero rows back and bails.
4. **Fire-and-forget** -- Calls `{SUPABASE_URL}/functions/v1/generate-report` via fetch without awaiting the response. Returns `{ success: true, status: "generating" }` immediately.

---

### Step 4: Supabase Edge Function — Report Generation

**File:** `supabase/functions/generate-report/index.ts`

This is the heavy-lift function that runs in the Supabase Deno runtime with a 150-second timeout.

1. **Fetches case record** from Supabase via raw PostgREST (no SDK -- avoids 60-90s cold start from esm.sh imports).
2. **Idempotency check** -- If case is already `"review"` or `"delivered"`, returns early (unless `force: true`).
3. **Finds linked intake** -- First by `intake_id` FK, then by email fallback. If no intake found, emails operator and returns 404.
4. **Calls Claude Haiku 4.5 API** -- Model `claude-haiku-4-5-20251001`, max 8000 tokens, temperature 0.3. The system prompt encodes expertise from 40+ defense attorneys. The user prompt is built from all intake fields and includes charge-specific blocks and evidence-specific question prompts.
5. **Renders markdown to branded HTML** -- Dark theme (#0C0A09 background), amber accents (#F59E0B), print-optimized CSS, 9-section report structure.
6. **Saves to Supabase** -- Updates the case record with `report_html`, `report_token` (UUID for URL-safe access), `generated_at`, `status: "review"`, and the `charge_type` from intake.
7. **Emails operator** -- Subject: "Review Report: [charge] -- [name]". Contains two action buttons:
   - **"Approve & Deliver"** -- Links to `GET /api/deliver?token={OPERATOR_SECRET}&case={caseId}`
   - **"Preview Report"** -- Links to `/report/{report_token}`

**On Claude API failure:**
- Sets `case.status = "generation-failed"`
- Emails operator with error details and a working curl retry command

---

### Step 5: Operator Review and Delivery

**File:** `src/app/api/deliver/route.ts`

**GET** (read-only confirmation page):
- Validates operator auth (raw `OPERATOR_SECRET` or HMAC-signed token).
- Shows case details (customer email, tier, charge type, case ID).
- Includes a "Preview Report" link and a POST form with "Confirm Delivery" button.
- Safe for email prefetch bots -- GET never modifies state.

**POST** (actual delivery):
1. **Auth validation** -- Same dual-token support (raw secret or HMAC-signed).
2. **Status guard** -- Only cases in `"review"` status can be delivered. Already-delivered cases return a friendly idempotent message.
3. **Send delivery email** to customer -- "Your Case Decoder Report is Ready" with report view link, usage instructions (print it, start with priority questions, document answers), and upgrade upsell ($197 credit).
4. **Retry on failure** -- If first email fails, waits 2s and retries with a simplified HTML template. If both fail, alerts operator with the report URL for manual forwarding.
5. **Update case status** -- Sets `status: "delivered"`, `delivered_at`, `reviewed_by: "operator"`, `reviewed_at`, and `deliverable_url`.
6. **Record drip** -- Inserts `"post_case_decoder_delivery"` into `drip_emails` table via upsert. This prevents the cron from re-sending the delivery notification.

**Email-before-status pattern:** The delivery email is sent BEFORE the status update to "delivered". If the email fails silently, the case would otherwise look complete but the customer would never be notified. By sending email first, the system knows whether notification succeeded.

---

### Step 6: Post-Purchase Drip Sequence

**File:** `src/app/api/cron/drip/route.ts` + `src/lib/drip-emails.ts`

See the "Drip Email Sequence" section below for full details.

---

## Trigger Paths

There are two entry paths to report generation, both converging at the same dispatcher endpoint.

### Path A: Intake Exists at Payment Time

This is the happy path when the customer fills the intake form before purchasing.

```
Customer fills intake form  --->  POST /api/intake (inserts into intakes table)
     |
     v
Customer pays               --->  Stripe webhook fires
     |
     v
Webhook looks up intake by email  --->  Found!
     |
     v
Creates case with status = "intake"
     |
     v
Fire-and-forget: POST /api/generate/case-decoder  { caseId }
     |
     v
Dispatcher claims case (atomic guard) --> Edge Function --> Report generated
```

**Files involved:**
1. `src/app/api/intake/route.ts` -- Intake insertion (earlier, separate request)
2. `src/app/api/webhooks/stripe/route.ts` -- Order + case creation, intake lookup, generation trigger
3. `src/app/api/generate/case-decoder/route.ts` -- Dispatcher (auth, idempotency, atomic guard)
4. `supabase/functions/generate-report/index.ts` -- Claude API call, report rendering, DB save

### Path B: Intake Submitted After Payment

This handles the flow where the customer pays first, then receives an email prompting them to fill the intake form.

```
Customer pays               --->  Stripe webhook fires
     |
     v
Webhook looks up intake by email  --->  Not found
     |
     v
Creates case with status = "awaiting-intake"
     |
     v
Sends email to customer: "Complete Your Case Details"
(link: /intake?email={email}&tier=case-decoder)
     |
     v
Customer fills intake form  --->  POST /api/intake
     |
     v
Intake route checks for cases with status = "awaiting-intake" matching this email
     |
     v
Found! Links intake to case, updates status to "intake"
     |
     v
Fire-and-forget: POST /api/generate/case-decoder  { caseId }
     |
     v
Dispatcher claims case (atomic guard) --> Edge Function --> Report generated
```

**Files involved:**
1. `src/app/api/webhooks/stripe/route.ts` -- Order + case creation, no-intake detection, intake request email
2. `src/app/api/intake/route.ts` -- Intake insertion, pending case detection, intake linking, generation trigger
3. `src/app/api/generate/case-decoder/route.ts` -- Dispatcher
4. `supabase/functions/generate-report/index.ts` -- Claude API call, report rendering, DB save

### Path C: Manual Operator Retry

When generation fails (either via Claude API error or detected by cron), the operator can retry manually.

```
Operator receives failure alert email with curl command
     |
     v
curl -X POST /api/generate/case-decoder \
  -H "Authorization: Bearer $OPERATOR_SECRET" \
  -d '{"caseId":"...", "force": true}'
     |
     v
Dispatcher (force=true bypasses idempotency check) --> Edge Function --> Report generated
```

---

## Status Transitions

| From | To | Triggered By | File |
|------|----|-------------|------|
| _(new)_ | `awaiting-intake` | Webhook: no intake found for email | `webhooks/stripe/route.ts` |
| _(new)_ | `intake` | Webhook: intake found for email | `webhooks/stripe/route.ts` |
| `awaiting-intake` | `intake` | Intake submitted post-payment | `intake/route.ts` |
| `intake` | `generating` | Dispatcher atomic guard | `generate/case-decoder/route.ts` |
| `generating` | `review` | Edge function: report saved successfully | `generate-report/index.ts` |
| `generating` | `generation-failed` | Edge function: Claude API error | `generate-report/index.ts` |
| `generating` | `generation-failed` | Cron Part 5: stuck for 30+ minutes | `cron/drip/route.ts` |
| `intake` | `intake-stalled` | Cron Part 4: stuck for 2+ hours | `cron/drip/route.ts` |
| `review` | `delivered` | Operator clicks Confirm Delivery | `deliver/route.ts` |
| _(any)_ | `refunded` | Stripe charge.refunded (full refund) | `webhooks/stripe/route.ts` |
| `generation-failed` | `generating` | Operator retry with `force: true` | `generate/case-decoder/route.ts` |
| `intake-stalled` | `generating` | Operator retry with `force: true` | `generate/case-decoder/route.ts` |

---

## Edge Function Details

### Why Supabase Edge Function Instead of Vercel

Vercel Hobby plan has a **10-second function timeout**. Claude Sonnet 4.6 API calls typically take 40-90 seconds for the 7+3-section Case Decoder report (16000 max tokens). The Supabase Edge Function has a **150-second timeout**, which is sufficient.

### Fire-and-Forget Pattern

The Vercel dispatcher (`/api/generate/case-decoder`) makes a `fetch()` call to the Edge Function URL and intentionally does NOT `await` the response. The `fetch()` is wrapped in `.catch()` to log errors without crashing the dispatcher. The dispatcher returns `200` immediately.

This means:
- The webhook or intake endpoint is not blocked waiting for generation.
- If the Edge Function crashes silently, nothing detects it in real time.
- The cron job (Part 5) acts as a safety net, detecting cases stuck in `"generating"` for 30+ minutes.

### Zero External Imports

The Edge Function has NO npm/esm.sh imports. Importing `@supabase/supabase-js` via esm.sh adds 60-90 seconds of cold start latency. Instead:
- Supabase operations use raw **PostgREST** fetch calls.
- Email uses raw **Resend API** fetch.
- Claude uses raw **Anthropic API** fetch.

### Model Choice

**Model:** `claude-sonnet-4-6`

Sonnet 4.6 chosen for structured report quality. At ~$0.10/report with ~3-4K word output, cost is negligible vs $197 price. Haiku 4.5 had weak instruction-following (67 questions instead of 15, missing sections). Sonnet completes well within 150s with per-section word budgets.

**Parameters:** `max_tokens: 16000`, `temperature: 0.3`

### Report Format (v2 — 7+3 Empowerment Architecture)

The generated report is a 7-section + 0-3 conditional section markdown document rendered to branded HTML.

**Core design principle:** Empower, don't blame. The report never blames the attorney. Gaps are framed as things to clarify. Questions are the tool.

**Always Present (7 sections + Letter + Closing + Postscript):**

- **A Letter to You** -- Quotes defendant's own words, validates instinct, previews report
1. **Where Things Stand** -- 4-area diagnostic table (Communication, Preparation, Strategy, Filing Activity). NO aggregate X/100 score. Each row says "You reported..." and links to specific questions.
2. **Your Charges — What You're Facing** -- Elements with "Question for Your Attorney" column (NOT difficulty ratings), penalty ranges, "Your Rights" box
3. **Communication Playbook** -- Ready-to-send email template, opening script, escalation ladder (8 levels, 5-7 days between), follow-up template
4. **Targeted Questions for Your Attorney** -- 15 calibrated questions, each referencing intake data with 5-part format (question, why it matters, good answer, red flag response, source)
5. **Things Worth Asking About** -- 5-6 items with labels: ADDRESS FIRST / LOOK INTO / ASK ABOUT. Never blames attorney.
6. **Is There Something We Missed?** -- Open channel for follow-up (help@imnotanattorney.com). No upgrade pitch.
7. **Your Action Blueprint** -- 7-day plan + Meeting Ready Sheet (safe for attorney) + future pacing
- **What This Report Cannot Tell You** -- Honest limitations
- **What Comes Next** (Postscript) -- ONLY upgrade language. Pipeline: questions → answers → verification via Intelligence Brief ($797)

**Conditional Sections (0-3, based on intake data):**

- **C1: Case Clock** -- ONLY if `arrest_date` exists. Informational speedy trial status + question. No "URGENT" alerts.
- **C2: Plea Landscape** -- ONLY if `plea_offered = "yes"` OR `attorney_strategy` mentions plea. Educational, not evaluative. Collateral consequences + alternatives.
- **C3: Discovery Readiness Guide** -- ONLY if `has_discovery != "no"` OR case 60+ days old. Future-looking checklist.

**Removed Sections (from v1):**
- Defense Milestone Score (X/100) -- replaced by diagnostic table
- Prosecution Difficulty Ratings -- replaced by "Question for Your Attorney"
- Plea Quality Ratings -- replaced by educational content
- Motion Recommendations -- integrated into S4 questions
- Evidence Accountability Checklist -- replaced by conditional Discovery Guide
- Case Stage Benchmark -- merged into S1 and S7
- Verify Facts (standalone) -- moved to S4 callout

**Section Budget:** 2,950 words (minimum) to 3,750 words (all conditionals). Down from ~4,800 in v1.

The HTML includes:
- Dark theme (`#0C0A09` background, `#D4D4D8` text, `#F59E0B` amber accents)
- Print-optimized CSS (`@media print` overrides for light backgrounds)
- Report metadata header (name, charges, jurisdiction, court date, days since arrest)
- Legal disclaimer ("not legal advice")
- Soft upgrade CTA footer ("After your meeting, if you want to verify... No pressure.")

---

## Operator Workflow

### New Order Notification

When payment is received, the operator gets an email with:
- Product name, customer email, amount, tier, Stripe session ID
- Case ID (if created successfully)
- Whether discovery is required
- Timestamp

### Report Review

When the Edge Function completes generation, the operator gets a "Review Report" email with:
- Customer name, email, charge type, state, case ID, generation date
- **"Approve & Deliver" button** -- Links to `GET /api/deliver?token={OPERATOR_SECRET}&case={caseId}`
- **"Preview Report" button** -- Links to `/report/{report_token}` (the same URL the customer will receive)

### Delivery Approval

1. Operator clicks "Approve & Deliver" in the email.
2. A confirmation page renders showing case details and a "Preview Report" link.
3. Operator can preview the report, then clicks "Confirm Delivery".
4. The POST handler sends the delivery email to the customer and updates the case status.
5. Operator sees a confirmation page: "Report Delivered" with the report URL.

### Review Reminder (24-hour guarantee protection)

If a report sits in `"review"` status for 12+ hours without delivery, the cron (Part 3) sends the operator a reminder email with:
- How many hours the report has been waiting
- Customer details
- A fresh "Approve & Deliver" link (HMAC-signed, 24-hour expiry)

The reminder is sent only once per case (`review_reminder_sent` flag).

---

## Drip Email Sequence

**File:** `src/lib/drip-emails.ts` (templates) + `src/app/api/cron/drip/route.ts` (scheduler)

**Cron schedule:** Daily at 14:00 UTC (9:00 AM EST), triggered by cron-job.org calling `GET /api/cron/drip` with `CRON_SECRET` bearer token.

### Emails Sent During the Pipeline (Not by Cron)

These are sent in real time by the respective route handlers:

| When | Email | Sent By | Recipient |
|------|-------|---------|-----------|
| Payment received | "Payment Confirmed -- Your Case Decoder is Being Prepared" | `webhooks/stripe/route.ts` | Customer |
| Payment received | "New Order: Case Decoder -- $197" | `webhooks/stripe/route.ts` | Operator |
| No intake at payment | "Complete Your Case Details to Start Your Report" | `webhooks/stripe/route.ts` | Customer |
| Intake submitted | "We Received Your Case Details, [Name]" | `intake/route.ts` | Customer |
| Intake submitted | "New Intake: [charge] -- [name]" | `intake/route.ts` | Operator |
| Report generated | "Review Report: [charge] -- [name]" | `generate-report/index.ts` | Operator |
| Report delivered | "Your Case Decoder Report is Ready" | `deliver/route.ts` | Customer |

### Post-Purchase Drip Sequence (Sent by Cron)

The Case Decoder tier has four post-purchase emails defined in `POST_PURCHASE_EMAILS`:

| Key | Delay | Relative To | Subject | Purpose |
|-----|-------|------------|---------|---------|
| `post_case_decoder_delivery` | Day 0 | Purchase | "Your Attorney Meeting Prep Kit is ready" | Skipped by cron (day-0 emails handled by delivery endpoint) |
| `post_case_decoder_story_harvest` | Day 5 | **Delivery** | "You met with your attorney -- what was the first question they stopped to think about?" | Collect customer stories for social proof |
| `post_case_decoder_upsell` | Day 7 | Purchase | "Ready to go deeper?" | Upsell to Intelligence Brief ($797, $600 after credit) |
| `post_case_decoder_referral` | Day 14 | Purchase | "Know someone facing charges?" | Referral request with share link |

**Key design decisions:**

- **`relativeToDelivery` flag:** The story harvest email (day 5) is measured from `cases.delivered_at`, not the purchase date. This ensures the email arrives ~5 days after the customer actually received their report, not 5 days after payment (which could be before delivery).

- **Day-0 skip:** The cron explicitly skips emails with `delayDays === 0` because they are sent in real time by the delivery endpoint. The `post_case_decoder_delivery` drip key is recorded in `drip_emails` by `deliver/route.ts` to prevent the cron from re-sending it.

- **Refunded orders excluded:** Part 2 of the cron only queries orders with `status: "paid"`. Refunded orders receive no further drip emails.

- **CAN-SPAM compliance:** The cron checks `subscribers.unsubscribed_at` and skips unsubscribed customers.

### Nurture Sequence (Free Subscribers)

Separate from the post-purchase flow, free subscribers receive a 6-email nurture sequence on days 1, 3, 5, 7, 10, and 14 after subscribing. Goal: demonstrate expertise, build trust, convert to Case Decoder purchase.

---

## Error Recovery

### Generation Failure (Claude API Error)

**Detection:** The Edge Function catches Claude API errors immediately.

**Response:**
1. Sets `case.status = "generation-failed"` in Supabase.
2. Emails operator with error details and a curl retry command:
   ```
   curl -X POST {SITE_URL}/api/generate/case-decoder \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $OPERATOR_SECRET" \
     -d '{"caseId":"...","force":true}'
   ```

**Retry:** Operator runs the curl command. The `force: true` flag bypasses the idempotency check, allowing the case to re-enter `"generating"` even from `"generation-failed"`.

### Stuck in "generating" (Edge Function Crash/Timeout)

**Detection:** Cron Part 5 runs daily and queries cases with `status = "generating"` and `updated_at` older than 30 minutes.

**Response:**
1. Sets `case.status = "generation-failed"`.
2. Emails operator with the case details, minutes stuck, and a curl retry command.

**Why 30 minutes?** The Edge Function has a 150-second timeout. Normal generation takes 60-120 seconds. If a case is still "generating" after 30 minutes, the Edge Function definitely crashed, timed out, or never ran. The 30-minute threshold provides generous margin.

### Stuck in "intake" (Generation Never Triggered)

**Detection:** Cron Part 4 runs daily and queries cases with `status = "intake"` and `updated_at` older than 2 hours.

**Response:**
1. Sets `case.status = "intake-stalled"`.
2. Emails operator with case details and a manual trigger command.

**Possible causes:**
- The fire-and-forget fetch to `/api/generate/case-decoder` failed silently.
- The dispatcher rejected the request (auth failure, env var issue).
- A race condition left the case in `"intake"` after the atomic guard rejected the claim.

### Email Delivery Failure

**Pattern (webhook):** `sendEmailWithRetry()` -- send once, wait 2s, retry once. If both fail, email operator for manual send. Never crash.

**Pattern (deliver):** Send delivery email, retry with simplified HTML on failure, alert operator with report URL if both fail. Case is marked `"delivered"` regardless -- the report URL works even without the email, and the operator can share it manually.

### Order Insert Failure (Critical)

If the order INSERT fails with a non-duplicate error, the webhook:
1. Emails operator with "URGENT: Order insert failed" including customer email, tier, amount, Stripe session ID.
2. Returns `{ received: true }` to Stripe (to prevent retries that would also fail).

The operator must manually create the order record in Supabase.

### Case Insert Failure

If the case INSERT fails, the webhook:
1. Emails operator with "URGENT: Case creation failed" including order ID.
2. Continues to send the payment confirmation email to the customer.
3. Sets `caseId = null` so no generation is triggered (there is no case to generate for).

The operator must manually create the case record.

---

## Idempotency Safeguards

### Webhook Deduplication via Unique Constraint

**Table:** `orders`
**Column:** `stripe_session_id` (unique constraint)

Stripe retries webhooks up to 3 times over 72 hours on non-2xx responses (or slow responses). On a retry, the INSERT into `orders` fails with PostgreSQL error code **23505** (unique_violation). The webhook handler detects this:

```typescript
const isDuplicate = orderError.code === "23505" || orderError.message?.includes("duplicate");
if (isDuplicate) {
  console.log("[Stripe Webhook] Duplicate webhook event, skipping:", session.id);
  return NextResponse.json({ received: true });
}
```

This returns 200 to Stripe, which stops further retries. No duplicate order or case is created.

### Atomic Guard Pattern (Generation Dispatcher)

**Problem:** Both the webhook (Path A) and the intake endpoint (Path B) can trigger generation. If the customer pays and submits intake nearly simultaneously, both triggers could fire within milliseconds.

**Solution:** Two-layer protection in `src/app/api/generate/case-decoder/route.ts`:

**Layer 1 -- Idempotency check (read):**
```typescript
if (!force && ["generating", "review", "delivered"].includes(caseData.status)) {
  return { skipped: true, message: "Report already [status]" };
}
```
This catches the common case where generation has already started or completed.

**Layer 2 -- Atomic guard (write):**
```typescript
const { data: guardData } = await supabase
  .from("cases")
  .update({ status: "generating", updated_at: new Date().toISOString() })
  .eq("id", caseId)
  .not("status", "in", '("generating","review","delivered")')
  .select("id")
  .single();

if (!guardData) {
  return { skipped: true, message: "Already processing or completed" };
}
```

This conditional UPDATE is atomic at the database level. If two requests both pass Layer 1 with `status = "intake"`, only ONE can win the UPDATE (PostgreSQL row-level locking). The loser gets `null` back and returns early. This is cheaper and more reliable than advisory locks.

### Edge Function Idempotency

The Edge Function (`generate-report/index.ts`) has its own idempotency check:
```typescript
if (!force && (caseData.status === "review" || caseData.status === "delivered")) {
  return { skipped: true };
}
```
This prevents re-generation if the Edge Function is somehow invoked for an already-completed case (e.g., stale queue entry).

### Drip Email Deduplication

**Table:** `drip_emails`
**Unique constraint:** `(subscriber_id, email_key)`

Each drip email send is recorded in this table. The unique constraint prevents the same email from being sent twice to the same subscriber, even if the cron runs multiple times or the delivery endpoint is triggered twice.

The delivery endpoint uses an upsert with `onConflict: "subscriber_id,email_key"` to be idempotent.

---

## Files Reference

| File | Role in Pipeline |
|------|-----------------|
| `src/app/api/checkout/route.ts` | Creates Stripe Checkout session with metadata |
| `src/app/api/webhooks/stripe/route.ts` | Order + case creation, intake linking, generation trigger (Path A), payment emails |
| `src/app/api/intake/route.ts` | Intake form submission, pending case detection, generation trigger (Path B) |
| `src/app/api/generate/case-decoder/route.ts` | Auth, idempotency, atomic guard, fire-and-forget to Edge Function |
| `supabase/functions/generate-report/index.ts` | Claude API call, HTML rendering, DB save, operator review email |
| `src/app/api/deliver/route.ts` | Operator review confirmation page (GET), actual delivery (POST) |
| `src/app/api/cron/drip/route.ts` | Daily cron: drip emails, review reminders, stuck case detection |
| `src/lib/drip-emails.ts` | Email templates and sequences (nurture + post-purchase) |
| `src/lib/email.ts` | Resend API wrapper, branded HTML template, CAN-SPAM footer |
| `src/lib/stripe.ts` | Stripe client, tier config (prices, delivery timeframes) |
| `src/lib/site.ts` | Shared constants, `normalizeEmail()`, `signOperatorToken()`, `verifyOperatorToken()` |
| `src/lib/supabase/admin.ts` | Supabase admin client (service role key, bypasses RLS) |
| `src/app/report/[token]/page.tsx` | Token-gated report viewer page (customer-facing) |

---

## Environment Variables Used

| Variable | Used By | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | All routes, Edge Function | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | All routes, Edge Function | Full DB access (bypasses RLS) |
| `STRIPE_SECRET_KEY` | Checkout, webhook | Stripe API access |
| `STRIPE_WEBHOOK_SECRET` | Webhook | Verify Stripe webhook signatures |
| `RESEND_API_KEY` | Email routes, Edge Function | Send transactional emails |
| `RESEND_FROM_EMAIL` | Edge Function | Sender address for Edge Function emails |
| `OPERATOR_EMAIL` | All alert routes | Operator notification recipient |
| `OPERATOR_SECRET` | Generate, deliver | Auth token for operator-only endpoints |
| `NEXT_PUBLIC_SITE_URL` | All routes, Edge Function | Base URL for email links and redirects |
| `ANTHROPIC_API_KEY` | Edge Function only | Claude API for report generation |
| `CRON_SECRET` | Cron route | Authenticate cron requests |
