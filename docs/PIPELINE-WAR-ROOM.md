# The War Room ($4,997) — Pipeline Documentation

## Pipeline Overview

The War Room is the fourth service tier ($4,997). It shares the same discovery upload infrastructure as The X-Ray ($2,497) but adds multi-phase delivery with weekly updates over the life of the case. This is the prerequisite tier for The Situation Room ($9,997).

### Purchase-to-Delivery Flow

```
Customer Journey:
  Checkout Page → POST /api/checkout (tier=war-room)
    → Stripe Hosted Checkout → Stripe Webhook (checkout.session.completed)
    → Order created (orders table, status: "paid")
    → Case created (cases table, status: "pending" if intake exists, "awaiting-intake" if not)
    → Payment confirmation email (includes upload CTA)
    → Customer uploads discovery docs → POST /api/upload (per file)
    → Customer clicks "Submit for Analysis" → POST /api/upload/finalize
    → Case status: "pending" → "submitted"
    → Operator notification email
    → Manual multi-phase analysis (25-28 days)
    → Operator delivers via POST /api/deliver → Case status: "delivered"
    → Post-purchase drip sequence begins
```

### Case Status Progression

| Status | Meaning | Trigger |
|--------|---------|---------|
| `awaiting-intake` | Paid but no intake form exists | Webhook: no intake found for email |
| `pending` | Intake linked, waiting for discovery upload | Webhook: intake exists + discovery tier |
| `submitted` | Discovery uploaded and finalized | POST /api/upload/finalize |
| `delivered` | Initial package sent to customer | Operator via POST /api/deliver |
| `refunded` | Full refund processed | Stripe charge.refunded webhook |

The `pending` to `submitted` transition is the same flow used by The X-Ray. The key difference is what happens after `submitted`: War Room analysis takes 25-28 days (vs. 10 business days for X-Ray) and includes multi-phase delivery with weekly updates.

## Discovery Upload Flow

War Room uses the same two-part upload infrastructure as X-Ray and Situation Room.

### Part 1: File Upload (POST /api/upload)

- Customer uploads individual files via the `/upload` page
- Each file is stored in Supabase Storage (`discovery-files` bucket, private)
- Storage path: `{caseId}/{timestamp}-{sanitized-filename}`
- Ownership verified: email on request must match email on case record
- Server-side validation: MIME type allowlist (PDF, images, text, Word), 50MB max per file
- Receipt email sent per file with running total count
- Source: `src/app/api/upload/route.ts`

### Part 2: Finalize (POST /api/upload/finalize)

- Customer clicks "Submit for Analysis" when all files are uploaded
- Case status transitions from `pending` to `submitted`
- Operator receives notification email with: customer email, tier, file count, case ID
- Customer receives confirmation email: "Analysis Begins"
- Idempotent: calling on an already-submitted case returns success without re-processing
- Validates at least one file exists before allowing finalization
- Source: `src/app/api/upload/finalize/route.ts`

### Consent Requirement

War Room ($4,997) requires the consent checkbox at checkout. This is enforced server-side in `/api/checkout`:

```
if (tierConfig.price >= 249700 && !consent) {
  return NextResponse.json({ error: "Consent required for this tier" }, { status: 400 });
}
```

The consent timestamp is stored in Stripe session metadata and carried through to the orders table via the webhook.

## Multi-Phase Delivery

War Room delivery spans 25-28 days and is broken into three phases. All analysis is currently manual (operator-driven). Weekly updates continue after the initial package delivery.

### Phase 1: Full Case Analysis (Days 1-7)

- Charges analysis in plain English
- Judge intelligence (sentencing patterns, tendencies)
- Discovery deep dive (document index, timeline, discrepancies)
- Initial question generation

### Phase 2: Witness and Prosecution Analysis (Days 7-21)

- Witness dossiers (up to 8 witnesses included in base price)
- Prosecution case strength analysis
- Motion landscape report (applicable motions, deadlines, strategy)
- Officer dossiers

### Phase 3: Final Package Assembly (Days 21-28)

- Attorney delivery package (formatted for the defense attorney)
- Case law references
- Strategy questions (comprehensive, based on full analysis)
- Evidence Chain Audit
- Witness Reliability Rankings
- Defense Opportunity Index

### Weekly Updates (Post-Delivery, Ongoing)

After the initial 25-28 day package is delivered:
- Weekly intelligence updates for the duration of the case
- Updates incorporate new developments: new discovery, hearings, filings
- Customer can reply to update emails with case changes
- Extra Witness Intel add-ons are delivered in the next update cycle

### Priority Delivery Option

War Room supports a priority delivery add-on:
- Price: $997 (defined in `stripe.ts` as `priorityPrice: 99700`)
- Timeline: "Expedited 20-day delivery" (vs. standard 25-28 days)
- Added as a second Stripe Checkout line item when selected
- Stored in order metadata as `priority_delivery: true`

## Witness Add-Ons

Two witness-related add-on products are available. These are standalone Stripe products with their own tier slugs.

### Extra Witness Intel ($149 each)

- Tier slug: `extra-witness`
- Adds one additional witness dossier beyond the 8 included in War Room base
- Delivery: "Next update cycle" -- folded into the next weekly War Room update
- Does NOT require discovery upload (`requiresDiscovery: false` in `stripe.ts`)
- The witness analysis is added to the customer's existing case
- Post-purchase drip: delivery confirmation only (day 0)
- Source: `TIERS["extra-witness"]` in `src/lib/stripe.ts`

### Standalone Witness Pack ($297)

- Tier slug: `witness-pack`
- Covers up to 3 witnesses with statement analysis, inconsistency report, cross-exam questions
- Delivery: 3-5 business days
- Requires discovery upload (`requiresDiscovery: true` in `stripe.ts`)
- Uses the same upload/finalize flow as War Room
- Post-purchase drip: delivery confirmation (day 0) + upsell to X-Ray or War Room (day 7)
- The day-7 upsell mentions War Room by name with credit applied: "Or go deeper with The War Room ($4,997)"
- Source: `TIERS["witness-pack"]` in `src/lib/stripe.ts`

## Upgrade Credits

### How Credits Work

100% of any prior lower-tier purchase is credited toward War Room within a 12-month rolling window.

| Prior Purchase | War Room Price | Credit | Customer Pays |
|---------------|---------------|--------|---------------|
| Case Decoder ($197) | $4,997 | $197 | $4,800 |
| Intelligence Brief ($997) | $4,997 | $997 | $4,000 |
| X-Ray ($2,497) | $4,997 | $2,497 | $2,500 |
| Case Decoder + Intelligence Brief | $4,997 | $1,194 | $3,803 |
| Case Decoder + X-Ray | $4,997 | $2,694 | $2,303 |

### Credit Calculation Logic (in /api/checkout)

1. Look up all paid orders for the customer's email within the last 12 months
2. Filter to only orders from tiers LOWER than `war-room` in the tier hierarchy:
   `case-decoder < intelligence-brief < x-ray < war-room < situation-room`
3. Sum the amounts of qualifying orders
4. Cap the credit at the session total (base price + priority delivery if selected)
5. Create a one-time Stripe coupon with the credit amount
6. Attach the coupon to the Stripe Checkout session
7. Store the credit amount in session metadata as `upgrade_credit_applied`

### Credit Voiding

If the customer has ANY refunded order on record, all upgrade credits are voided. This prevents the abuse pattern of: buy low tier, upgrade with credit, refund the original.

The refund check happens before credit calculation in `/api/checkout`. If the check fails (Supabase error), the checkout returns a 500 rather than risk granting unearned credit.

### Credit Metadata Flow

```
/api/checkout → Stripe session metadata (upgrade_credit_applied: "99700")
  → Stripe webhook → orders table (upgrade_credit_applied: 99700)
```

## Situation Room Prerequisite

The Situation Room ($9,997) requires a prior paid War Room order. This is enforced in `/api/checkout`:

### Prerequisite Check

```
if (tier === "situation-room" && normalizedEmail) {
  const { data: warRoomOrder } = await supabase
    .from("orders")
    .select("id")
    .eq("email", normalizedEmail)
    .eq("tier", "war-room")
    .eq("status", "paid")
    .limit(1)
    .maybeSingle();

  if (!warRoomOrder) {
    prerequisiteSkipped = true;
  }
}
```

### Soft Gate Behavior

The prerequisite is a **soft gate**, not a hard block:
- If no paid War Room order is found, `prerequisiteSkipped = true`
- The Stripe line item description gets a note: "War Room prerequisite not confirmed"
- Session metadata includes `prerequisite_skipped: "true"`
- The operator sees the warning on the Stripe dashboard and follows up manually
- The purchase is NOT blocked -- the customer can still complete checkout

This design allows edge cases (e.g., War Room purchased under a different email) to proceed with operator intervention rather than being hard-blocked.

### War Room Upgrade Credit to Situation Room

When a War Room customer upgrades to Situation Room:
- The full $4,997 War Room payment is credited (within 12-month window)
- Situation Room effective cost: $9,997 - $4,997 = $5,000
- All prior lower-tier credits also stack (e.g., Case Decoder + X-Ray + War Room)

## Drip Sequence

War Room has two post-purchase emails defined in `src/lib/drip-emails.ts`. Weekly updates and story harvesting are handled directly by the operator since War Room is an ongoing, time-sensitive engagement.

### Email 1: Package Assembly Notification (Day 0)

- Key: `post_war_room_delivery`
- Trigger: Sent at purchase time by the delivery/webhook flow, NOT by the cron
- Subject: "Your War Room package is being assembled"
- Content: Three-phase timeline (Days 1-7, 7-21, 21-28), upload CTA, delivery expectation (25-28 business days)
- Sets expectations for the multi-phase delivery process

### Email 2: Referral (Day 14 After Delivery)

- Key: `post_war_room_referral`
- Trigger: Cron job, 14 days after `cases.delivered_at` (uses `relativeToDelivery: true`)
- Subject: "Know someone facing charges?"
- Content: Encourages customer to refer others, links to free Case Progress Score
- Purpose: Word-of-mouth acquisition from high-value customers

### Why No Automated Story Harvest or Update Emails

War Room is an ongoing engagement with weekly operator contact. Unlike lower tiers where automated drip fills the communication gap, War Room customers receive direct operator updates. Story harvesting and feedback happen naturally during those interactions. Automated update emails would conflict with operator-driven communication.

### Drip Timing Notes

- Day-0 emails are sent by the webhook/delivery endpoints, not the cron. The cron skips `delayDays: 0` entries.
- The `relativeToDelivery` flag on the referral email means the 14-day delay is measured from `cases.delivered_at`, not from the purchase date. Since War Room delivery takes 25-28 days, this ensures the referral arrives ~2 weeks after the customer has their package and has experienced the value.
- Drip deduplication uses the `drip_emails` table with a unique constraint on `(subscriber_id, email_key)`.
- Refunded orders are skipped by the cron (Part 2 filters by `status: "paid"`).
- Unsubscribed customers are filtered out via subscriber record check.

## What's Built vs. Manual

### Built (Automated Infrastructure)

| Component | Location | Status |
|-----------|----------|--------|
| Stripe checkout session creation | `src/app/api/checkout/route.ts` | Working |
| Stripe webhook (order + case creation) | `src/app/api/webhooks/stripe/route.ts` | Working |
| Payment confirmation email (with upload CTA) | Webhook handler | Working |
| Consent validation (server-side) | `/api/checkout` | Working |
| Upgrade credit calculation + coupon | `/api/checkout` | Working |
| Situation Room prerequisite check | `/api/checkout` | Working |
| Discovery document upload (per-file) | `src/app/api/upload/route.ts` | Working |
| Upload finalization + operator notification | `src/app/api/upload/finalize/route.ts` | Working |
| Upload receipt emails (per-file) | Upload handler | Working |
| Case status state machine (pending, submitted) | Webhook + finalize | Working |
| Drip email templates (3 emails) | `src/lib/drip-emails.ts` | Working |
| Drip cron job (daily sends) | `src/app/api/cron/drip/route.ts` | Working |
| Refund handling (full + partial) | Webhook handler | Working |
| Checkout success page (War Room specific) | `src/app/checkout/success/page.tsx` | Working |
| Report delivery endpoint | `src/app/api/deliver/route.ts` | Working |
| Operator email notifications | Throughout pipeline | Working |

### Manual (Operator-Driven)

| Component | Current Process | Notes |
|-----------|----------------|-------|
| Phase 1 analysis (days 1-7) | Operator runs analysis using elite skills | Uses god-mode-trial, elite-drug-defense, master-strategy-trial |
| Phase 2 witness dossiers (days 7-21) | Operator creates witness + prosecution analysis | Up to 8 witnesses in base price |
| Phase 3 package assembly (days 21-28) | Operator compiles attorney delivery package | Case law, strategy questions, scored deliverables |
| Weekly updates | Operator produces weekly intelligence | Based on case developments + new discovery |
| Report delivery | Operator triggers POST /api/deliver | Sends delivery email, updates case status to "delivered" |
| Extra Witness Intel fulfillment | Operator adds to next update cycle | Attached to existing case |
| Witness Pack fulfillment | Operator analyzes up to 3 witnesses | Separate 3-5 day turnaround |

### Not Yet Built (Future: ImNotAnAttorney-engine)

| Component | Description |
|-----------|-------------|
| Automated discovery parsing | PDF/image extraction + indexing |
| AI-assisted case analysis | Claude-powered analysis using elite skills |
| Report generation pipeline | Automated multi-section report builder |
| Weekly update automation | AI-generated updates from case changes |
| Witness dossier generation | Automated cross-reference + inconsistency detection |

These are planned for the ImNotAnAttorney-engine backend service, which has not been created yet. Until then, all analysis and report generation for War Room is manual.

## Stripe Configuration

From `src/lib/stripe.ts`:

```typescript
"war-room": {
  name: "The War Room",
  price: 499700,                              // $4,997.00
  delivery: "25-28 days + weekly updates",
  requiresDiscovery: true,
  priorityPrice: 99700,                       // $997.00 add-on
  priorityDelivery: "Expedited 20-day delivery",
},
```

Related add-on tiers:

```typescript
"extra-witness": {
  name: "Extra Witness Intel",
  price: 14900,                               // $149.00
  delivery: "Next update cycle",
  requiresDiscovery: false,
  priorityPrice: null,
  priorityDelivery: null,
},
"witness-pack": {
  name: "Standalone Witness Pack",
  price: 29700,                               // $297.00
  delivery: "3-5 business days",
  requiresDiscovery: true,
  priorityPrice: null,
  priorityDelivery: null,
},
```

## Key File References

| File | Role in War Room Pipeline |
|------|--------------------------|
| `src/lib/stripe.ts` | Tier definition, pricing, discovery flag |
| `src/lib/drip-emails.ts` | 3 post-purchase email templates |
| `src/app/api/checkout/route.ts` | Session creation, consent, credits, prerequisite check |
| `src/app/api/webhooks/stripe/route.ts` | Order + case creation, payment confirmation email |
| `src/app/api/upload/route.ts` | Per-file discovery upload |
| `src/app/api/upload/finalize/route.ts` | Submit for analysis, operator notification |
| `src/app/api/deliver/route.ts` | Operator delivers report, updates case status |
| `src/app/api/cron/drip/route.ts` | Daily drip email processing |
| `src/app/checkout/success/page.tsx` | War Room success page with upload prompt + upsell |
| `src/lib/site.ts` | Shared constants (email normalization, site URL) |
| `src/lib/supabase/admin.ts` | Supabase admin client |
