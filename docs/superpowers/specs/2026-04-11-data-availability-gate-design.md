# Data Availability Gate, Design Spec

**Date:** 2026-04-11
**Repo:** `C:\Users\email\projects\ImNotAnAttorney-web\`
**Problem:** All 3 Tier 9 standalone products take payment BEFORE the customer enters who they want data about. If we don't have data, they get a refund email, a trust-destroying experience for defendants at 3AM. The landing page FAQ even claims "you'll be notified before purchase" but that's false.
**Scope:** Judge Report Card ($197), Officer Background Check ($97), Similar Cases Analyzer ($297)

## Design

### Core Concept

Move intake fields (judge name, officer name, charge type, state) from the post-payment intake form to the landing page itself. The check feels like the product starting to work, not a gate.

**Covered:** Show a coverage preview ("247 court opinions, 12 sentencing records") → CTA button appears → checkout carries intake data → report generates instantly after payment (no second intake step).

**Not covered:** Show waitlist capture ("We're building coverage for Judge Smith in FL. Enter your email, we'll notify you when ready.") → Telegram alert to admin → no CTA, no way to pay for something we can't deliver.

### User Flow

```
Landing page (/judge-report-card)
  │
  ├─ Customer types judge name + state
  │
  ├─ [API] POST /api/check-availability/[slug]
  │    └─ Returns: { available: bool, coverage: { quotes, sentencing, pairings, appellate, ... } }
  │
  ├─ IF available:
  │    ├─ Show coverage preview (quote count, sentencing rows, etc.)
  │    ├─ CTA button appears: "Get Your Judge Report Card, $197"
  │    ├─ Checkout receives intake data via query params or session
  │    ├─ Stripe session created with intake in metadata
  │    ├─ Webhook creates order WITH intake already populated
  │    └─ Report generates immediately (no intake email step)
  │
  └─ IF not available:
       ├─ Show "We're building coverage for [Judge Name] in [State]"
       ├─ Email capture: "Enter your email, we'll notify you when ready"
       ├─ [DB] Insert into data_waitlist table
       ├─ [Telegram] Alert admin: "New judge request: [name], [state], [email]"
       └─ No CTA button. No way to purchase.
```

### Components

#### 1. Availability Check API

**Route:** `POST /api/check-availability/[slug]`

**Input:**
- `judge-report-card`: `{ judgeName: string, state: string }`
- `officer-background-check`: `{ officerName: string, state: string }`
- `similar-cases-analyzer`: `{ chargeType: string, state: string }`

**Logic:** Runs a lightweight version of the existing query functions (queryJudgeReportCard, queryOfficerBackground, querySimilarCases) but returns coverage counts instead of full data. A product is "available" when it meets a minimum data threshold:

| Product | Minimum Threshold |
|---------|------------------|
| Judge Report Card | Judge found in judge_profiles AND (quotes >= 5 OR sentencing >= 1 OR pairings >= 1) |
| Officer Background | At least 1 officer name match |
| Similar Cases | At least 3 feature vectors for charge_slug + state |

**Output:**
```json
{
  "available": true,
  "coverage": {
    "quotes": 247,
    "sentencing": 3,
    "pairings": 1,
    "appellate": 12,
    "benchJury": 0
  },
  "judgeName": "Ronald Moon",
  "court": "hid"
}
```

**Rate limiting:** 10 requests per minute per IP (prevent scraping the judge database).

#### 2. Landing Page Intake Fields

Each landing page gets a client-side form section ABOVE the CTA. Fields match the existing intake form fields:

- **Judge Report Card:** Judge name (text) + State (select dropdown, all 50 states)
- **Officer Background:** Officer name (text) + State (select)
- **Similar Cases:** Charge type (select, from ALLOWED_CHARGE_TYPES) + State (select)

**States:**
- `idle`, form visible, CTA hidden
- `checking`, spinner, "Checking our database..."
- `available`, coverage preview shown, CTA appears
- `unavailable`, waitlist capture shown, no CTA
- `waitlisted`, confirmation: "We'll notify you when ready"
- `error`, "Something went wrong, please try again"

The existing hero copy stays. The form replaces the current static CTA section.

#### 3. Waitlist Table + Telegram Alert

**Table:** `data_waitlist`
```sql
CREATE TABLE data_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug text NOT NULL,
  search_params jsonb NOT NULL, , { judgeName, state } or { officerName, state } etc.
  email text,
  status text DEFAULT 'pending', , pending | notified | converted
  created_at timestamptz DEFAULT now(),
  notified_at timestamptz,
  UNIQUE (product_slug, email, search_params)
);
```

**Telegram alert** (on waitlist insert):
```
node C:\Users\email\.claude\scripts\telegram\telegram-send.js,bot legal \
 ,message "🔍 New data request: Judge [Name], [State]\nProduct: Judge Report Card\nCustomer: [email]\nCoverage: 0 quotes, 0 sentencing\nAction: Run extraction for this judge"
```

#### 4. Checkout Flow Modification

When the availability check passes and the customer clicks the CTA:

- The CTA links to `/checkout?standaloneProduct=judge-report-card&judgeName=Ronald+Moon&state=HI&chargeType=dui` (intake data in query params)
- The checkout API reads these params and includes them in the Stripe session metadata
- The webhook creates the order with `standalone_intake` already populated (no need for the intake email/token step)
- `generateTier9Report(orderId)` fires immediately after order creation
- Customer gets the report delivery email directly, no intake form, no waiting

**Backward compatibility:** The post-payment intake flow (email with token link) remains for orders that somehow don't have pre-populated intake (edge case / legacy orders).

#### 5. Email Recognition (Level 1)

When a customer enters their email for the waitlist:
- Store email in `data_waitlist`
- Set a `localStorage` key: `inna_email` = email
- On future visits to any landing page, pre-fill state from localStorage
- When matching by email on a subsequent purchase, show "Welcome back" in the checkout success page

No cookies, no server-side sessions, no accounts. Pure client-side localStorage for convenience.

### Fixes Included

1. **Broken checkout links:** Landing page CTAs currently use `/checkout?tier=judge-report-card` which dead-ends. New CTAs use `/checkout?standaloneProduct=judge-report-card` with intake params.

2. **False FAQ claim:** "you'll be notified before purchase" is currently false. After this change, it becomes true, the availability check IS the notification.

3. **Faster delivery:** Report generates on webhook (seconds after payment) instead of waiting for customer to check email, click link, fill intake form, submit. Eliminates 5-10 minutes of customer wait time.

### What This Does NOT Include

- User accounts or authentication
- Automated judge extraction pipeline (manual Telegram → admin action)
- Auto-notification when data becomes available (future: cron checks waitlist against DB)
- Changes to the report rendering or data quality (separate workstream)
- Changes to the Officer Background or Similar Cases landing pages beyond adding the check form (they follow the same pattern as Judge Report Card)

### Files to Modify

| File | Change |
|------|------, |
| `src/app/api/check-availability/[slug]/route.ts` | **NEW**, availability check endpoint |
| `src/app/judge-report-card/page.tsx` | Add intake form + availability check (convert to client component or add client island) |
| `src/app/officer-background-check/page.tsx` | Same pattern |
| `src/app/similar-cases-analyzer/page.tsx` | Same pattern |
| `src/app/api/webhooks/stripe/route.ts` | Read pre-populated intake from Stripe metadata, skip intake email when present |
| `src/app/api/checkout/route.ts` | Accept intake params for standalone products, store in Stripe session metadata |
| `src/lib/tier9-reports/query.ts` | Extract lightweight coverage-check functions (reuse existing queries, return counts) |
| `supabase/migrations/` | **NEW**, data_waitlist table |

### Success Criteria

1. Customer cannot pay for a product we can't deliver
2. Customer who searches an uncovered judge gets waitlisted, admin gets Telegram alert
3. Customer who searches a covered judge sees coverage stats, can buy, and gets report within 60 seconds of payment
4. No changes to existing non-Tier-9 purchase flows
