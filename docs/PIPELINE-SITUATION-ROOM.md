# The Situation Room ($9,997), Pipeline Documentation

The Situation Room is the premium tier at $9,997. It delivers Trial Intelligence Operations with priority response for customers approaching or actively in trial. It requires a prior paid War Room ($4,997) purchase, enforced via a soft prerequisite gate in the checkout route.

---

## 1. Pipeline Overview

```
Customer (has prior War Room order)
  |
  v
POST /api/checkout (tier: "situation-room")
  |, Prerequisite gate: query orders table for paid war-room order
  |, Consent validation ($2,497+ threshold)
  |, Upgrade credit calculation (100% from all lower tiers, 12-month window)
  |, Stripe Checkout Session created with metadata flags
  |
  v
Stripe Hosted Checkout,> Customer pays
  |
  v
Stripe webhook: checkout.session.completed
  |, Create order in Supabase (status: "paid")
  |, Create case (status: "pending", discovery tier)
  |, Link intake if exists (email match)
  |, Payment confirmation email to customer (includes upload link)
  |, Operator notification email
  |
  v
Customer uploads discovery documents
  |, POST /api/upload (per file, ownership verified by email)
  |, Each file stored in Supabase Storage (discovery-files bucket)
  |, Receipt email per file
  |
  v
POST /api/upload/finalize
  |, Case status: "pending",> "submitted"
  |, Operator notification: documents ready for analysis
  |, Customer confirmation: analysis begins
  |
  v
Manual analysis by operator (Trial Intelligence Operations)
  |
  v
Delivery + drip sequence begins
```

---

## 2. War Room Prerequisite Gate

### How It Works

The prerequisite check runs in `POST /api/checkout` (step 5 in the route). When `tier === "situation-room"`, the route queries the `orders` table for a matching paid War Room order:

```
SELECT id FROM orders
WHERE email = {normalizedEmail}
  AND tier = 'war-room'
  AND status = 'paid'
LIMIT 1
```

### Soft Gate (Not Hard Block)

This is a **soft gate**. If no War Room order is found, the checkout **still proceeds**. The behavior is:

| Scenario | Result |
|----------|------, |
| War Room order found (status: paid) | Normal checkout, no flags |
| No War Room order found | `prerequisite_skipped: "true"` set in Stripe session metadata |
| No email provided (anonymous checkout) | `prerequisite_skipped: "true"`, cannot verify, auto-skipped |
| War Room order exists but refunded | Not found by query (status != paid), prerequisite_skipped: "true" |
| Supabase query error | Error logged, checkout proceeds, no flag set (fails open) |

### What Happens When Skipped

When `prerequisite_skipped` is true:

1. **Stripe line item description** is modified to include: `"Note: War Room prerequisite not confirmed"`
2. **Stripe session metadata** includes `prerequisite_skipped: "true"`, visible in Stripe Dashboard
3. **Operator receives the standard new-order notification**, they see the flag on the Stripe session and follow up manually (e.g., verify if the customer has a War Room under a different email, or discuss next steps)

The soft gate was chosen over a hard block because:
- Customers may have purchased the War Room under a different email address
- The operator can always verify and process manually
- Blocking a $9,997 purchase on a false negative is worse than letting it through and following up

### Implementation Location

- **File:** `src/app/api/checkout/route.ts`, lines 138-164
- **Metadata key:** `prerequisite_skipped` (string "true" or absent)
- **Description annotation:** Added to `lineItems[0].price_data.product_data.description`

---

## 3. Checkout Flow Differences

The Situation Room checkout shares the same `POST /api/checkout` route as all tiers but has several distinct behaviors:

### Prerequisite Check (Unique to Situation Room)

See section 2 above. No other tier has a prerequisite gate.

### Consent Requirement

The Situation Room price ($999,700 cents = $9,997) exceeds the $2,497 consent threshold ($249,700 cents). The checkout route enforces server-side consent validation:

```typescript
if (tierConfig.price >= 249700 && !consent) {
  return NextResponse.json(
    { error: "Consent required for this tier" },
    { status: 400 }
  );
}
```

The customer must check a consent box on the checkout page acknowledging they understand the service provides legal **information**, not legal **advice**. The consent timestamp is recorded in Stripe session metadata (`consent_timestamp`).

### No Priority Delivery Add-On

The Situation Room tier has `priorityPrice: null` and `priorityDelivery: null` in `src/lib/stripe.ts`. Priority response is already built into the base tier, the standard delivery is "24-48hr priority turnaround." There is no separate priority add-on to purchase.

### Upgrade Credit Calculation

All prior paid orders from lower tiers are credited at 100% toward the Situation Room, within a 12-month rolling window. The tier ordering used for credit calculation:

```
case-decoder (0) < intelligence-brief (1) < x-ray (2) < war-room (3) < situation-room (4)
```

Only orders with a lower tier index qualify for credit. A customer who purchased all prior tiers would receive credit for:
- Case Decoder: $197
- Intelligence Brief: $997
- X-Ray: $2,497
- War Room: $4,997
- **Total credit: $8,688** (applied as a one-time Stripe coupon, net price: $1,309)

Credit is voided entirely if any prior order was refunded (the refund check in step 4 of the checkout route sets `upgradeCreditVoided = true`).

### Stripe Session Metadata

The Situation Room session metadata may include all of these keys:

| Key | Value | When Set |
|---, |-------|----------|
| `tier` | `"situation-room"` | Always |
| `product_name` | `"The Situation Room"` | Always |
| `prerequisite_skipped` | `"true"` | No paid War Room found or no email |
| `upgrade_credit_voided` | `"true"` | Prior refund exists |
| `consent_timestamp` | ISO 8601 | Always (consent required) |
| `priority_delivery` | `"true"` | N/A, not available for this tier |
| `court_date` | String | If customer provided |
| `charge_type` | String | From intake or client request |
| `upgrade_credit_applied` | Cents string | If prior purchases exist |

---

## 4. Trial Intelligence Operations

The Situation Room delivers Trial Intelligence Operations, the most comprehensive case intelligence package. Per the tier configuration and drip email content, this includes:

### Pre-Trial Phase
- **Priority analysis (24-48 hours per stage):** The case moves to the front of the queue. All War Room deliverables are produced on an accelerated timeline.
- **Full War Room deliverables on priority timeline:** Complete case analysis, witness dossiers (up to 8), prosecution analysis, motion landscape, attorney delivery package, case law references, and strategy questions, all delivered faster than the standard War Room 25-28 day window.

### Trial Phase
- **Evening debrief:** After each trial day, an analysis of what happened and its implications.
- **Morning prep brief:** Before each trial day, preparation intelligence for the day ahead.
- **Research-based JOA questions:** Questions about Judgment of Acquittal standards specific to the case.
- **Witness background research:** Intelligence on witnesses for the attorney's use.

### Ongoing
- **Priority response line:** 2-hour response during trial prep, 4-hour during trial.
- **Dedicated communication channel:** Active for urgent questions at any time.
- **Extra witness add-ons ($149 each):** Additional witness dossiers can be purchased separately and are included in the next update cycle.

### Delivery Timeframe

Standard delivery: **"24-48hr priority turnaround"** (per `src/lib/stripe.ts`). This refers to the turnaround for each stage of analysis, not the total engagement. The Situation Room is an ongoing engagement tied to the case lifecycle through trial.

---

## 5. Priority Response

The Situation Room has built-in priority response, unlike lower tiers where priority is a paid add-on:

| Tier | Standard Delivery | Priority Add-On |
|------|------------------|----------------|
| Case Decoder | 48 hours | $97 (4 hours) |
| Intelligence Brief | 48-72 hours | $297 (24 hours) |
| X-Ray | 10 business days | $497 (5 business days) |
| War Room | 25-28 days + weekly | $997 (20-day delivery) |
| **Situation Room** | **24-48hr priority turnaround** | **N/A, included** |

The Situation Room's priority is not just faster delivery, it includes a response SLA:
- **2-hour response** during trial preparation
- **4-hour response** during active trial

This SLA is communicated in the post-purchase delivery email (`post_situation_room_delivery` in `drip-emails.ts`) and is enforced manually by the operator.

---

## Engagement Elements (Cross-Pipeline Standard)

Expert basis: Cialdini (commitment/consistency), Kahneman (cognitive ease), Eyal (Hook Model).

The Situation Room is the $9,997 premium tier, an ongoing, trial-focused engagement. All engagement elements from lower tiers are active with full discovery document references, plus this tier adds **trial cycle bridges** that maintain momentum through the daily debrief/prep rhythm of an active trial.

Every report section must include:

1. **Section-End Executive Summary**, 3-5 key findings + recommended next action. Clearly boxed/separated from analysis text. At this tier, summaries are phase-aware (like War Room) AND trial-aware, they reference what was delivered in prior phases, what the current phase adds, and how findings connect to upcoming trial events. Example: "The timeline gaps from Phase 1 and witness contradictions from Phase 2 converge on the prosecution's weakest link, Officer [Name]'s chain-of-custody testimony scheduled for Day 3."

2. **"Your Case" Personalization**, At least 1 personalized reference per section using the client's actual case details, jurisdiction-level intelligence, AND specific discovery document references. At this tier, personalization also references findings from ALL prior delivery phases and ties to the trial calendar. Example: "In Phase 1 we identified the 33-minute gap. Phase 2 confirmed [Witness]'s contradicting statement. Tomorrow's cross-examination of Officer [Name] is the moment to surface both."

3. **Section Bridges**, Final 1-2 sentences of each section create anticipation for the next. Standard within-report and cross-phase bridges apply (same as War Room). Additionally, this tier requires **trial cycle bridges**:
   - **Evening debrief closing bridge:** "Based on today's testimony from [Witness], tomorrow morning's prep will focus on the chain-of-custody gaps this creates for the prosecution's timeline."
   - **Morning prep closing bridge:** "Today's hearing on [Motion] will determine whether the Phase 2 witness dossier findings are admissible, tonight's debrief will analyze the ruling's impact."
   - **Weekly update bridges** (pre-trial): Same as War Room, connect prior week's findings to current developments.

4. **Progress Structure**, Each section header includes position: "Section N of M: [Section Title]". Progress is tracked at THREE levels:
   - **Within a phase:** "Phase 1, Section 3 of 5: Discovery Deep Dive"
   - **Across the engagement:** "Phase 2 of 3: Witness and Prosecution Analysis"
   - **Trial cycle:** "Day 3 Evening Debrief" / "Day 4 Morning Prep"

**Tier-specific enhancements over War Room ($4,997):**
- Trial cycle bridges (debrief→prep→debrief) create a continuous daily narrative through active trial
- Personalization references the trial calendar and connects all prior phases to upcoming courtroom events
- Progress structure adds a third level for trial day tracking
- Executive summaries are trial-aware, connecting analytical findings to specific scheduled testimony/hearings
- Morning prep briefs explicitly reference the previous evening's debrief findings

**Tier-specific notes:**
- This is the highest tier, no upsell constraints on engagement elements
- Trial cycle bridges are the unique differentiator vs. War Room's weekly update bridges
- Operator is directly engaged with the client, so engagement elements complement (not replace) direct communication

---

## 6. What's Built vs. Manual

### Built (Automated)

| Component | Location | Status |
|---------, |----------|------, |
| Prerequisite gate (War Room check) | `src/app/api/checkout/route.ts` | Working, soft gate with metadata flag |
| Consent enforcement | `src/app/api/checkout/route.ts` | Working, server-side, $2,497+ threshold |
| Upgrade credit calculation | `src/app/api/checkout/route.ts` | Working, 100% credit, 12-month window, refund voiding |
| Stripe Checkout session creation | `src/app/api/checkout/route.ts` | Working, inline price_data, metadata, coupon |
| Webhook order/case creation | `src/app/api/webhooks/stripe/route.ts` | Working, order + case records in Supabase |
| Case status assignment | `src/app/api/webhooks/stripe/route.ts` | Working, sets "pending" for discovery tiers |
| Payment confirmation email | `src/app/api/webhooks/stripe/route.ts` | Working, includes upload link for discovery tiers |
| Operator notification email | `src/app/api/webhooks/stripe/route.ts` | Working, full order details |
| Discovery upload (per-file) | `src/app/api/upload/route.ts` | Working, ownership check, MIME validation, 50MB limit |
| Upload finalize | `src/app/api/upload/finalize/route.ts` | Working, status transition + notifications |
| Upload page UI | `src/app/upload/page.tsx` | Working, drag-and-drop, progress, submit |
| Post-purchase drip emails | `src/lib/drip-emails.ts` | Working, delivery + story harvest |
| Drip cron (daily sends) | `src/app/api/cron/drip/route.ts` | Working, skips refunded, respects unsubscribe |
| Refund handling | `src/app/api/webhooks/stripe/route.ts` | Working, full/partial, access revocation |
| Checkout success page | `src/app/checkout/success/page.tsx` | Working, tier-specific next steps |

### Manual (Operator-Driven)

| Component | Description | Who |
|---------, |-------------|---, |
| Prerequisite follow-up | When prerequisite_skipped is true, operator verifies and contacts customer | Operator |
| Case analysis | Review uploaded discovery documents, run through elite skills | Operator + Claude |
| Report generation | Create Trial Intelligence Operations deliverables | Operator + Claude |
| Trial day briefs | Evening debrief and morning prep during trial | Operator + Claude |
| Priority response | 2-hour / 4-hour response SLA monitoring | Operator |
| Report delivery | Send completed analysis to customer via `/api/deliver` | Operator |
| Weekly updates | Ongoing case intelligence updates (post-initial delivery) | Operator |

### Not Yet Built

| Component | Description | Priority |
|---------, |-------------|----------|
| Application gate UI | A form on the services page for Situation Room inquiries (currently links to standard checkout) | Low, soft gate works for now |
| Automated trial brief pipeline | Automated evening debrief / morning prep generation | Future, depends on ImNotAnAttorney-engine |
| Priority response tracking | SLA monitoring and alerting for 2hr/4hr response times | Future |
| Prerequisite hard gate | Client-side warning before checkout if no War Room found | Low, soft gate is sufficient |

---

## 7. Drip Sequence

The Situation Room has two post-purchase emails defined in `src/lib/drip-emails.ts`:

### Email 1: Delivery (Day 0)

- **Key:** `post_situation_room_delivery`
- **Subject:** "Your Situation Room engagement begins now"
- **Trigger:** Sent by the delivery endpoint (`/api/deliver`) when the report is delivered, NOT by the cron job
- **Content:**
  - Priority Analysis (24-48 hours per stage), case moves to front of queue
  - Trial Intelligence Operations, evening debrief + morning prep brief every trial day
  - Priority Response Line, 2-hour during trial prep, 4-hour during trial
  - Dedicated communication channel is active
  - Sets expectation: full War Room deliverables on priority timeline + trial preparation

### Email 2: Story Harvest (Day 5 after delivery)

- **Key:** `post_situation_room_story_harvest`
- **Subject:** "How's the case progressing?"
- **Trigger:** Sent by the drip cron (`/api/cron/drip`, Part 2) 5 days after `cases.delivered_at`
- **Flag:** `relativeToDelivery: true`, delay is measured from delivery date, not purchase date
- **Content:** Asks "What's made the biggest difference so far?", harvests customer stories for service improvement and future testimonials

### Sequence Comparison Across Tiers

| Tier | Delivery | Story Harvest | Upsell | Referral |
|------|----------|------------, |------, |----------|
| Case Decoder | Day 0 | Day 5 (delivery) | Day 7 | Day 14 |
| Intelligence Brief | Day 0 | Day 5 (delivery) | Day 10 |, |
| X-Ray | Day 0 | Day 5 (delivery) |, |, |
| War Room | Day 0 |, |, | Day 14 (delivery) |
| **Situation Room** | **Day 0** | **Day 5 (delivery)** | **, ** | **, ** |

War Room has no story harvest or update drips, the operator communicates directly with War Room customers via weekly updates, so automated drips would conflict. A referral email sends 14 days after delivery instead.

The Situation Room has no upsell email because it is the highest tier, there is no tier above it to upsell into. The extra-witness add-on ($149) is communicated via the delivery email and ongoing operator interactions, not via a drip email.

### Drip Deduplication

All drip emails are deduplicated via the `drip_emails` table, which stores `(subscriber_id, email_key)` pairs with a unique constraint. The day-0 delivery email is recorded when the operator delivers the report via `/api/deliver`, preventing the cron from re-sending it. The day-5 story harvest is sent by the cron only if the key `post_situation_room_story_harvest` has not already been recorded for that subscriber.

---

## Source Files

| File | What It Contains |
|------|---------------, |
| `src/app/api/checkout/route.ts` | Prerequisite gate, consent, upgrade credit, Stripe session |
| `src/app/api/webhooks/stripe/route.ts` | Order/case creation, payment confirmation, operator notification |
| `src/app/api/upload/route.ts` | Per-file discovery document upload |
| `src/app/api/upload/finalize/route.ts` | Upload finalization, status transition, notifications |
| `src/app/api/cron/drip/route.ts` | Daily drip email sends (Part 2 handles post-purchase) |
| `src/lib/stripe.ts` | Tier config: price ($999,700), delivery, requiresDiscovery |
| `src/lib/drip-emails.ts` | Delivery + story harvest email templates |
| `src/lib/email.ts` | Resend API wrapper, CAN-SPAM footer |
| `src/lib/site.ts` | Shared constants (SITE_URL, normalizeEmail) |
| `supabase/SCHEMA.md` | Full column-level database schema reference |
| `supabase/CONTEXT.md` | Case status state machine (19 statuses, ALLOWED_TRANSITIONS) |
| `ARCHITECTURE.md` (root) | System overview, architecture patterns, tier inclusion model |
