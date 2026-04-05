## Context
- **Repo:** C:\Users\email\projects\ImNotAnAttorney-web
- **Problem:** INAA has zero distribution channels. Defendants are CRISIS BUYERS — they don't subscribe to newsletters or follow social accounts before arrest. Traditional launch marketing (email blasts, content calendars, social posting) won't work. The #1 intercept point is bail bondsmen — the first human a defendant talks to after arrest. We need a referral system where bondsmen hand defendants a discount code, bondsmen earn commission, and INAA gets customers at the exact moment of crisis.
- **Key files to read first:**
  - `src/app/api/checkout/route.ts` (463 lines — checkout flow)
  - `src/app/api/webhooks/stripe/route.ts` (webhook handler)
  - `src/lib/tiers.ts` (356 lines — tier definitions)
  - `src/lib/stripe.ts` (69 lines — Stripe dual-mode clients)
  - `src/middleware.ts` (133 lines — auth + route protection)
  - `supabase/migrations/` (existing schema, 12 migrations)
- **Tech stack:** Next.js 16.1.6, React 19, Tailwind 4, Stripe SDK v20.3.1, Supabase PostgreSQL (52 tables), Resend email, Vercel deployment
- **Key decisions:**
  - **10% commission** to bondsman (on collected amount after discount)
  - **10% discount** to client (applied via Stripe Promotion Code)
  - **All tiers** — $97 Playbooks through $9,997 Situation Room
  - **No Stripe Connect** — track commissions in Supabase, pay out manually (Venmo/Zelle/check) until volume justifies Connect
  - **Stripe Promotion Codes** (not raw coupons) — one master coupon, unique codes per bondsman with metadata
  - **Both inbound + outreach** — public partner signup page AND admin ability to create partners manually
  - **Dashboard** — admin panel to create codes on the fly, see conversions, calculate payouts
- **Setup/prerequisites:** Supabase project live (jxjbjmgdukwkoclydqdr), Stripe live keys active for DUI Playbook, existing admin auth via X-Admin-Password header, dual-mode Stripe (test/live)

---

## Background — Why This Approach

Criminal defendants are crisis buyers with a 7-day decision window. They don't exist as a marketable audience until arrest. No email list, no social following, no newsletter subscribers. The only marketing that works is INTERCEPT marketing — being found at the moment of need.

Bail bondsmen are the perfect intercept: they're literally the first person a defendant talks to after arrest. A bondsman handing out a discount code costs zero and puts INAA in front of every defendant at the exact crisis moment.

Commission math (10% to bondsman, 10% discount to client):

| Tier | Price | Client Pays | Bondsman Gets | INAA Keeps |
|------|-------|-------------|---------------|------------|
| DUI Playbook | $97 | $87.30 | $8.73 | $78.57 |
| Case Decoder | $197 | $177.30 | $17.73 | $159.57 |
| Intelligence Brief | $997 | $897.30 | $89.73 | $807.57 |
| The X-Ray | $2,497 | $2,247.30 | $224.73 | $2,022.57 |
| The War Room | $4,997 | $4,497.30 | $449.73 | $4,047.57 |
| The Situation Room | $9,997 | $8,997.30 | $899.73 | $8,097.57 |

---

## What We're Building

A bail bondsman referral system with 3 surfaces:

1. **Partner Signup Page** (`/partners`) — public page where bondsmen apply
2. **Admin Partner Dashboard** (`/admin/partners`) — create/manage bondsmen, generate codes, view referrals, track payouts
3. **Checkout + Webhook Integration** — apply promo codes at checkout, track which bondsman referred, calculate commissions

---

## Database Schema

### Task 1: Supabase Migration

Create migration `013_referral_system.sql`:

```sql
-- Bondsman partners
CREATE TABLE partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text,
  email text NOT NULL UNIQUE,
  phone text,
  region text,
  status text NOT NULL DEFAULT 'pending',  -- pending | approved | suspended
  commission_rate integer NOT NULL DEFAULT 10,
  stripe_coupon_id text,
  stripe_promo_code_id text,
  promo_code text,
  notes text,
  total_referrals integer DEFAULT 0,
  total_commission integer DEFAULT 0,
  total_paid_out integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Individual referral events
CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id),
  order_id uuid NOT NULL REFERENCES orders(id),
  tier text NOT NULL,
  sale_amount integer NOT NULL,
  discount_amount integer NOT NULL,
  commission_amount integer NOT NULL,
  commission_paid boolean DEFAULT false,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Partner applications (before approval)
CREATE TABLE partner_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text,
  email text NOT NULL,
  phone text,
  region text,
  message text,
  status text DEFAULT 'new',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_referrals_partner ON referrals(partner_id);
CREATE INDEX idx_referrals_order ON referrals(order_id);
CREATE INDEX idx_partners_promo ON partners(promo_code);
CREATE INDEX idx_partners_status ON partners(status);
```

---

## Stripe Integration

### Task 2: Promo Code Helpers

**File:** `src/lib/referral.ts` (NEW)

- `ensureMasterCoupon()` — creates 10%-off coupon if missing (idempotent, ID: `bondsman-referral-10pct`)
- `createPartnerPromoCode(partnerId, code, metadata)` — creates Stripe Promotion Code per bondsman with metadata
- `calculateCommission(saleAmount, commissionRate)` — returns commission in cents
- `getPartnerByPromoCode(stripePromoCodeId)` — Supabase lookup

### Task 3: Modify Checkout

**File:** `src/app/api/checkout/route.ts`

- Add `allow_promotion_codes: true` to Stripe Checkout session creation
- One-line change. Stripe handles discount application.

### Task 4: Modify Webhook

**File:** `src/app/api/webhooks/stripe/route.ts`

After order creation in `checkout.session.completed`:
1. Retrieve session with expanded discounts
2. If promotion code used, retrieve via `stripe.promotionCodes.retrieve()`
3. Read metadata (`partner_id`)
4. Insert into `referrals` table
5. Update `partners` totals (total_referrals, total_commission)

---

## Admin Dashboard

### Task 5: Partner API Routes

**File:** `src/app/api/admin/partners/route.ts` (NEW)
- `GET` — list all partners with stats
- `POST` — create partner + generate Stripe promo code on the fly

**File:** `src/app/api/admin/partners/[id]/route.ts` (NEW)
- `GET` — partner detail + referral history
- `PATCH` — update status/notes/commission
- `POST .../payout` — mark commissions paid

### Task 6: Admin Dashboard Page

**File:** `src/app/admin/partners/page.tsx` (NEW)

Uses existing admin auth pattern (`useOperatorPassword()`). Features:
- Partner list with promo code, referral count, unpaid commission
- Create partner form (name, company, email, phone, region, custom code)
- Partner detail with referral history
- Payout action + status toggles

### Task 7: Route Protection

**File:** `src/middleware.ts`
- Verify `/api/admin/partners/*` caught by existing wildcard
- Add `/admin/partners` page to admin auth if needed

---

## Public Partner Page

### Task 8: Partner Signup Page

**File:** `src/app/partners/page.tsx` (NEW)

- Value prop, how it works (3 steps), commission table, application form, FAQ
- Matches existing site design (Tailwind 4, INAA brand)

### Task 9: Application API

**File:** `src/app/api/partners/apply/route.ts` (NEW)

- `POST` — public, rate-limited, inserts into partner_applications
- Sends operator notification via Resend

---

## Files Summary

**New (9):** migration, referral.ts, 2 admin API routes, admin page, public page, apply API
**Modified (3):** checkout route (+1 line), webhook route (+referral tracking), middleware (verify)

## Execution Order

1. Task 1 (migration) → 2 (referral.ts) → 7 (middleware) → 3 (checkout) → 4 (webhook) → 5 (admin API) → 6 (admin UI) → 8 (public page) → 9 (apply API)

## Verification

1. Run migration, verify 3 tables
2. Create test partner via admin → verify Stripe promo code created
3. Test checkout with promo code → verify 10% discount
4. Complete purchase → verify referral row + commission calculated
5. Admin dashboard → partner stats visible
6. Mark payout → totals update
7. Public signup → application row + operator email
8. Edge cases: no promo code (no referral), duplicate webhook (idempotent)
9. Visual QA: /partners + /admin/partners desktop + mobile

## To Execute This Plan

Open a fresh session in `C:\Users\email\projects\ImNotAnAttorney-web\` and run:
```
Read docs/plans/2026-03-19-bondsman-referral-system.md then execute it
```
(Copy this plan to that repo's docs/plans/ first)
