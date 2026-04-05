# Partner Portal & Referral System — Design Spec + Plan

**Date:** 2026-03-20
**Status:** Draft — pending user review
**Triage:** FEATURE (5-8 new files, 3-5 modified files)

---

## Context

- **Repo:** `C:\Users\email\projects\ImNotAnAttorney-web`
- **Problem:** Partners (bondsmen, affiliates, anyone) can apply and get approved, but have zero self-service access. The FAQ promises "see your running total anytime" — that page doesn't exist. The referral flow sends customers directly to the main site with no warm-up, losing ~30% conversion potential. The system is branded exclusively for bondsmen but should be open to anyone.
- **Key files to read first:**
  - `src/app/partners/page.tsx` — current public partner signup page
  - `src/app/admin/partners/page.tsx` — admin partner dashboard
  - `src/app/api/admin/partners/route.ts` — partner CRUD API
  - `src/app/api/admin/partners/[id]/route.ts` — partner detail/update/payout API
  - `src/lib/referral.ts` — Stripe promo code creation + commission logic
  - `supabase/migrations/013-referral-system.sql` — DB schema (partners, referrals, partner_applications)
  - `src/middleware.ts` — auth patterns (admin password, operator secret, cron secret)
  - `src/app/score/page.tsx` — existing Defense Milestone Score quiz
  - `src/app/my-case/[token]/page.tsx` — existing customer portal
- **Tech stack:** Next.js 15 (App Router), Tailwind CSS, Supabase, Stripe, Resend, Vercel
- **Key decisions:**
  - Magic link auth for partners (email + SMS via Twilio) — no passwords
  - Flat partner structure — every partner is an individual, no hierarchy
  - Company is a text label only (bridge page display + admin filtering). Not a relational table.
  - Partners only see their own data — never other partners' data
  - One commission tier: 10% discount to customer, 10% commission to partner
  - Three payment methods: Zelle, Venmo, check (with mailing address)
  - Referral flow uses bridge page + guided quiz, not a pricing table
  - Trust transfer: partner's name + company carry through entire flow (Cialdini Unity Principle)
  - SMIQ-first quiz architecture (Levesque ASK Method)
  - Control/empowerment framing, not purchase framing (crisis psychology research)
- **Setup/prerequisites:** Twilio account needed. Env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

---

## 1. Partner Portal

### 1.1 Authentication — Magic Link

Partners log in via magic link sent to email and (optionally) SMS.

**Flow:**
1. Partner visits `/partner/login`
2. Enters their email address
3. System looks up email in `partners` table (must be `status: approved`)
4. If found, generates a time-limited token (15 min expiry), stores in `partner_magic_links` table
5. Sends magic link via Resend (email) AND Twilio (SMS, if phone on file)
6. Partner clicks link -> `/partner/login/verify?token=xxx`
7. Token validated -> sets a session cookie (httpOnly, secure, 30-day expiry)
8. Subsequent visits check the cookie -> auto-authenticated

**New DB table:**
```sql
CREATE TABLE partner_magic_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id),
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_partner_magic_links_token ON partner_magic_links(token);
```

**New DB table for sessions (supports multi-device):**
```sql
CREATE TABLE partner_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id),
  session_token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_partner_sessions_token ON partner_sessions(session_token);
```

**New DB table for payout history:**
```sql
CREATE TABLE partner_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id),
  amount integer NOT NULL,          -- cents
  payment_method text NOT NULL,     -- 'zelle' | 'venmo' | 'check'
  referral_ids uuid[] NOT NULL,     -- which referrals were included
  notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_partner_payouts_partner ON partner_payouts(partner_id);
```

**New DB columns on `partners`:**
```sql
ALTER TABLE partners ADD COLUMN preferred_payment_method text; -- 'zelle' | 'venmo' | 'check'
ALTER TABLE partners ADD COLUMN payment_zelle text;           -- email or phone
ALTER TABLE partners ADD COLUMN payment_venmo text;           -- venmo handle
ALTER TABLE partners ADD COLUMN payment_check_address text;   -- mailing address for checks
```

**New DB column on `partner_applications`:**
```sql
ALTER TABLE partner_applications ADD COLUMN source text;      -- 'bondsman' | 'generic' | null
```

**Security:**
- Magic link tokens are single-use (marked `used_at` on consumption)
- 15-minute expiry on magic link tokens
- Multi-device sessions via `partner_sessions` table (each login creates a new session row, no single-slot limitation)
- 30-day session cookie, httpOnly + secure flags
- Rate limit: 3 magic link requests per email per hour (use existing `checkRateLimit()` from `src/lib/rate-limit.ts`, key: `partner-magic:${email}`)
- Middleware: `/api/partner/*` routes check session cookie — MUST be inserted BEFORE the CSP block in `src/middleware.ts` (after cron auth, before line 84) to prevent fall-through
- Cleanup cron: delete expired/used magic link tokens and expired sessions periodically

### 1.2 Dashboard — Tools First

Post-login, the dashboard leads with action items. The partner wants to grab their tools and get back in the field.

**Layout (single page, scrollable sections):**

**Section 1: Your Toolkit** (top, always visible)
- Promo code (large, tap-to-copy)
- Referral URL: `imnotanattorney.com/r/CODE` (tap-to-copy)
- QR code (generated client-side, downloadable as PNG)
- "Preview what your clients see" button -> opens bridge page in new tab

**Section 2: Ready-to-Send Messages** (pre-written text templates)
- 3-4 templates with partner's code and URL pre-filled:
  - **Check-in pitch:** "Hey [name], checking in. Quick tip — a lot of my clients use this service to get the right questions to ask their attorney. Helped a few people catch things their lawyer missed. Use my code [CODE] for 10% off: [URL]"
  - **Right after bonding out:** "Hey [name], you're going to have a lot of questions about your case. This service researches your charges and gives you the exact questions to ask your attorney. Use my code [CODE] for 10% off: [URL]"
  - **Follow-up nudge:** "Hey [name], still dealing with your case? The people I've sent here say it helped them feel way more prepared for their attorney meetings. [URL] — my code [CODE] saves you 10%."
  - **General share:** "If you or someone you know is dealing with criminal charges, this service helps you hold your attorney accountable. Code [CODE] for 10% off: [URL]"
- Each template has a one-tap "Copy" button
- Templates use `[name]` placeholder — partner fills in the defendant's name when pasting

**Section 3: Your Earnings**
- Total earned (all time)
- Pending payout (unpaid commission)
- Total referrals count
- Payout history table (date, amount, method, status)

**Section 4: Recent Activity**
- List of recent referrals (date, tier purchased, commission earned)
- No customer names or PII — just: "Mar 18 — Case Decoder — $17.73 earned"

**Section 5: Payment Settings**
- Preferred payment method selector (Zelle / Venmo / Check)
- Conditional fields:
  - Zelle: email or phone number
  - Venmo: Venmo handle
  - Check: mailing address (street, city, state, zip)
- Save button -> PATCH to `/api/partner/settings`

**Section 6: Profile**
- Name, email, phone, company (display only — contact admin to change)
- "Need help? Email support@imnotanattorney.com"

### 1.3 Partner API Routes

All routes under `/api/partner/*`, authenticated via session cookie.

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/partner/magic-link` | Request magic link (public, rate-limited) |
| GET | `/api/partner/magic-link/verify` | Verify token, set session cookie |
| GET | `/api/partner/dashboard` | Return partner data + recent referrals |
| PATCH | `/api/partner/settings` | Update payment info |
| POST | `/api/partner/logout` | Clear session cookie |

---

## 2. Referral Flow

### 2.1 Referral URL: `/r/[code]`

A short redirect route that captures the partner's promo code and routes to the bridge page.

`imnotanattorney.com/r/MIKE10` -> renders bridge page with partner context.

**Implementation:** Next.js dynamic route at `src/app/r/[code]/page.tsx`. Server-side: looks up partner by `promo_code` WHERE `status = 'approved'`. If partner not found or suspended/pending, show a generic fallback page ("This referral link isn't active") with a CTA to the main site — no broken state. Passes partner name + company to the bridge page component. Also sets a cookie `ref=MIKE10` (30-day expiry, `httpOnly: false` — the checkout page is client-rendered and needs to read this cookie via JS) so the code persists through the entire flow to checkout.

**Edge cases:**
- Partner suspended → generic fallback, no partner name shown
- Partner pending → same fallback
- Code doesn't exist → same fallback
- Code exists but partner deleted → same fallback

### 2.2 Bridge Page

A short, warm interstitial that transfers trust from the partner to the service. Per Russell Brunson's bridge page framework — warm traffic from a trusted source, so the bridge is short and personal.

**Copy:**

> **"Mike from ABC Bail Bonds referred you. Here's why."**
>
> He sees a lot of people go through what you're going through. The ones who do best are the ones who show up to their attorney prepared with the right questions.
>
> This service researches your case and gives you exactly that.
>
> **His code MIKE10 saves you 10%.**
>
> [ Take Back Control of Your Case ]

**Design:** Minimal. Dark background (consistent with site). Partner's name + company prominent. One CTA. No nav, no distractions. Trust badges at bottom.

**Dynamic elements:**
- Partner name from DB (`Mike`)
- Company name from DB (`ABC Bail Bonds`) — if no company, just shows name
- Promo code from URL
- Copy uses gender-neutral "their/they" throughout: "They see a lot of people go through what you're going through." / "Their code MIKE10 saves you 10%."

### 2.3 SMIQ -> Quiz -> Recommendation

After the bridge page, the flow uses Ryan Levesque's ASK Method to guide the customer to the right product without showing a pricing table.

**Step 1 — SMIQ (Single Most Important Question):**
Full-screen, one question: "What are you charged with?"
- DUI / DWI → `dui-first-offense`
- Drug possession → `drug-possession`
- Drug trafficking → `drug-trafficking`
- White collar (fraud, embezzlement) → `white-collar`
- Federal charges → `federal-criminal`
- Probation violation → `probation-violation`
- Sex offense → `sex-offense`
- Self-defense claim → `self-defense`
- Other criminal charges → routes to `case-decoder` (no charge-specific playbook)

These map directly to charge-type-specific playbook slugs in `TIER_CORE`. Every SMIQ option maps to an actual existing slug — no non-existent tiers. The "Other" bucket routes to Case Decoder ($197) since there's no generic playbook.

**Step 2 — Micro-commitment follow-ups (2-3 questions):**
Based on SMIQ answer, 2-3 tailored follow-up questions. Examples:
- "Do you have an attorney yet?" (Yes / No / Public defender)
- "How long ago were you charged?" (This week / This month / Months ago)
- "What's your biggest concern right now?" (Don't understand charges / Attorney not communicating / Worried about outcome)

Each question one per screen, micro-commitment style. Progress bar at top.

**Step 3 — Personalized recommendation:**
Based on answers, recommend ONE tier from actual `TIER_CORE` slugs with empowerment framing. The recommendation engine maps answers to tiers:

| Situation | Recommended Tier | Price | Slug |
|-----------|-----------------|-------|------|
| Has attorney, wants quick prep | Charge-specific Playbook | $97 | `dui-first-offense`, `drug-possession`, etc. |
| Has attorney, not communicating | Case Decoder | $197 | `case-decoder` |
| Complex charges, needs full picture | Intelligence Brief | $997 | `intelligence-brief` |
| Federal/serious, has discovery docs | X-Ray | $2,497 | `x-ray` |

Note: Intelligence Brief is $997 (not $497). All prices come from `TIER_CORE` — never hardcoded in the quiz.

**Display:** Recommendation card with:
- What it does (empowerment framing, not feature list)
- Price with discount applied (strikethrough original, show discounted price)
- "Your code MIKE10 saves you $X"
- Single CTA: "Get Started" -> checkout with code pre-applied
- Small "See other options" link at bottom -> `/services` page (escape hatch only)

### 2.4 Referral Cookie Persistence + Stripe Integration

The `ref` cookie (set at `/r/[code]`, `httpOnly: false`) persists for 30 days.

**How it integrates with Stripe Checkout:**

The current checkout API (`src/app/api/checkout/route.ts`) uses `allow_promotion_codes: true`, which lets customers type a promo code on Stripe's hosted checkout page. For referral flow, we change the approach:

1. Checkout page reads `ref` cookie via client-side JS
2. If `ref` cookie exists, checkout page sends `promoCode` field in the POST to `/api/checkout`
3. Checkout API looks up the partner's `stripe_promo_code_id` from the `partners` table
4. Creates Stripe session with `discounts: [{ promotion_code: stripePromoCodeId }]` instead of `allow_promotion_codes: true`
5. If no referral cookie, behavior is unchanged (`allow_promotion_codes: true` — customer can still manually type a code)

**Conflict with upgrade credits:** Stripe Checkout in `mode: "payment"` only allows ONE entry in the `discounts` array. The "both referral + upgrade credit" case cannot use two separate discount entries.

**Solution for the "both" case:** Compute a single combined discount server-side:
1. Calculate the referral discount: 10% off the tier price (e.g., $197 tier → $19.70 off)
2. Add the upgrade credit amount (e.g., $97 from prior purchase)
3. Create a one-time `amount_off` coupon via Stripe API: `amount_off = referral_discount + upgrade_credit` in cents
4. Apply that single coupon: `discounts: [{ coupon: combinedCouponId }]`
5. Track referral attribution via `metadata` on the Stripe session (not the discount): `metadata: { partner_id, partner_promo_code }` — the webhook reads this for partner credit

**The 4-way conditional:**
```
if (hasReferral && hasUpgradeCredit):
  → compute combined amount_off coupon, set metadata for attribution
if (hasReferral && !hasUpgradeCredit):
  → discounts: [{ promotion_code: stripePromoCodeId }]
if (!hasReferral && hasUpgradeCredit):
  → discounts: [{ coupon: upgradeCreditCouponId }]  (existing behavior)
if (!hasReferral && !hasUpgradeCredit):
  → allow_promotion_codes: true  (existing behavior — customer can manually type a code)
```

Note: `allow_promotion_codes` must be `false` when using `discounts` array — this is by Stripe design.

**Attribution flow:**
1. Cookie carries the promo code through to checkout
2. Stripe webhook receives the `promotion_code` in the checkout session
3. Existing webhook logic traces promo code -> partner -> referral record (already built in `src/lib/referral.ts`)
4. Display "Your code saved you X%" on checkout page (client-side, from cookie) and customer portal (from referral record in DB)

---

## 3. Partner Landing Pages

### 3.1 Generic: `/partners` (rewrite)

Rewrite current bondsman-specific page to be inclusive of all partner types.

**Key changes:**
- Hero: broader language (not bondsman-specific)
- Use cases section: bondsmen, paralegals, content creators, community advocates, anyone
- Same commission table, FAQ, application form
- Application form adds optional "How did you hear about us?" field

### 3.2 Bondsman-specific: `/partners/bondsman`

Targeted version with existing bondsman-focused copy. Mostly preserves current `/partners` content.

**Key changes:**
- URL moves from `/partners` to `/partners/bondsman`
- Hero keeps bondsman language: "Your Clients Need Help. Earn Commission Sending It."
- All existing sections preserved
- Application form pre-tags as `source: bondsman`

Both pages submit to the same `/api/partners/apply` endpoint.

---

## 4. Customer Portal Upgrade

### 4.1 Always-On Home Base

Upgrade `/my-case/[token]` from a status/delivery page to a permanent home base.

**Changes:**
- Post-delivery: portal stays active, report always accessible
- Tier-aware content: show resources for their specific purchase (tiers are independent products, NOT nested)
  - Playbook buyer: their specific playbook + general resources
  - Case Decoder buyer: Case Decoder report + general resources
  - Intelligence Brief buyer: IB report + general resources
  - X-Ray buyer: X-Ray report + general resources
  - General resources (all tiers): FAQs, "how to talk to your attorney" guide, court prep checklist
  - Note: each purchase has its own case/token/portal URL. Multi-product display is per-case, not per-customer. If a customer bought multiple products, each has its own `/my-case/[token]` URL.
- "What to do next" section: actionable next steps based on case status
  - Pre-delivery: "We're researching your case. Here's what's happening."
  - Post-delivery: "You have your questions. Here's how to use them with your attorney."
- Court date reminder (if provided during intake)

### 4.2 Referral Attribution Display

If customer came through a partner referral:
- Show: "Your bondsman's code **MIKE10** saved you 10% on your purchase."
- Subtle, non-intrusive — makes the bondsman look good

### 4.3 Future: Chatbot (Out of Scope)

Tier-aware chatbot that knows customer's purchase, charge type, and case details. Separate project.

---

## 5. Infrastructure

### 5.1 Twilio Integration

New utility at `src/lib/twilio.ts`:
- `sendSMS(to: string, body: string): Promise<void>`
- Used for magic link delivery
- Env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

### 5.2 QR Code Generation

Client-side QR code generation using `qrcode` npm package. Encodes partner's referral URL. Downloadable as PNG.

### 5.3 Referral Cookie

`ref` cookie set at `/r/[code]`:
- Value: partner's promo code
- Expiry: 30 days
- Path: `/`
- Read at checkout to auto-apply discount and attribute sale

### 5.4 Middleware Updates

Update `src/middleware.ts`:

**Matcher config:** Add `"/api/partner/:path*"` to the explicit matcher array (alongside `/api/admin/:path*`, etc.) for consistency.

**Auth approach — route-level, NOT middleware-level:** The existing middleware runs in Edge Runtime and only checks headers/env vars — no DB calls. Adding a Supabase query to middleware would add latency and a failure point to every partner API request. Instead:

- Middleware: for `/api/partner/*` routes, check if path is an exempt public route first. Pseudocode:
  ```
  if (pathname.startsWith("/api/partner")) {
    // Public routes — no auth needed
    if (pathname === "/api/partner/magic-link" ||
        pathname === "/api/partner/magic-link/verify") {
      return NextResponse.next();
    }
    // All other partner routes — check cookie exists (no DB call)
    const session = req.cookies.get("partner-session");
    if (!session?.value) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }
  ```
- Route handlers: each protected route calls `validatePartnerSession(cookieValue)` from `src/lib/partner-auth.ts`, which does the Supabase lookup on `partner_sessions` table. This keeps the DB call in the Node runtime (not Edge) and co-located with the business logic.
- Rate limiting for magic link requests happens in the `/api/partner/magic-link` route handler (Node runtime), NOT in middleware. Uses existing `checkRateLimit()` from `src/lib/rate-limit.ts` with key `partner-magic:${email}`.

**Cookie spec:** `partner-session`, httpOnly, secure, sameSite strict, 30-day expiry.

**Naming:** Partner portal routes use `/api/partner/*` (singular). Existing public endpoint stays at `/api/partners/apply` (plural). The singular/plural distinction maps to: singular = authenticated partner actions, plural = public partner-related actions. Middleware only protects `/api/partner/*` (singular).

**Magic link verify page:** The `/partner/login/verify` page is a CLIENT-RENDERED page (not a direct API redirect). The email/SMS link goes to the page, which calls the verify API from the same origin via fetch. This avoids Safari ITP issues with cookies set on cross-origin GET redirects.

### 5.5 Database Migration

New migration `014-partner-portal.sql`:
- `partner_magic_links` table (magic link tokens)
- `partner_sessions` table (multi-device session support)
- `partner_payouts` table (payout history with method + batch tracking)
- New columns on `partners` table: payment info fields
- New column on `partner_applications` table: `source` text
- `UNIQUE` partial index on `partners.promo_code`: `CREATE UNIQUE INDEX idx_partners_promo_unique ON partners(promo_code) WHERE promo_code IS NOT NULL;` (allows NULLs, prevents duplicate codes)
- Indexes on tokens and foreign keys
- Cleanup: expired magic link tokens and sessions (add cron or TTL policy)

**RPC function for atomic partner total increments** (required by Phase 0 bug fixes):
```sql
CREATE OR REPLACE FUNCTION increment_partner_total(
  p_partner_id uuid,
  p_column text,
  p_amount integer
) RETURNS void AS $$
BEGIN
  EXECUTE format(
    'UPDATE partners SET %I = COALESCE(%I, 0) + $1, updated_at = now() WHERE id = $2',
    p_column, p_column
  ) USING p_amount, p_partner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```
Used by: payout handler (task 1: `total_paid_out`), webhook (task 2: `total_referrals`, `total_commission`). Follows the existing `increment_counter` pattern from migration 012.

---

## 6. Design Principles (Expert-Sourced)

| Principle | Source | Application |
|-----------|--------|-------------|
| Trust transfer | Cialdini, Unity Principle (*Pre-Suasion*) | Bridge page carries partner's name + company. "Mike from ABC Bail Bonds referred you. Here's why." |
| Bridge page | Brunson, Bridge Funnel (*DotCom Secrets*) | Short interstitial — acknowledge referrer, one CTA. Warm traffic = short bridge. |
| SMIQ-first quiz | Levesque, ASK Method (*Ask*) | First question: "What are you charged with?" Buckets before follow-ups. |
| Micro-commitments | Levesque, ASK Method (*Ask*) | One question per screen, progress bar, each answer builds understanding. |
| No pricing table | Hormozi, Value Equation (*$100M Offers*) | Guided recommendation of ONE tier. No menu, no comparison. |
| Empowerment framing | Crisis purchasing psychology (PMC/Frontiers) | "Take back control of your case" — not "buy our research." Defendants buy to regain control. |
| Bridge +30% conversion | ClickBank affiliate research 2025 | Bridge pages convert ~30% higher than direct linking. |

---

## 7. Out of Scope

- Chatbot for customer portal (future project)
- Partner notifications (new referral, payout) — fast follow
- Company aggregate views — explicitly rejected (no partner sees another's data)
- Partner invite system — future
- Custom commission UI — DB supports it, UI doesn't expose it
- A/B testing bridge vs direct — can add later
- Twilio for partner notifications — only magic links in v1

---

## 8. Files to Create

| # | File | Purpose |
|---|------|---------|
| 1 | `supabase/migrations/014-partner-portal.sql` | New tables + columns |
| 2 | `src/lib/twilio.ts` | Twilio SMS utility |
| 3 | `src/lib/partner-auth.ts` | Magic link generation, verification, session management |
| 4 | `src/app/partner/login/page.tsx` | Partner login page (email input) |
| 5 | `src/app/partner/login/verify/page.tsx` | Magic link verification + cookie set |
| 6 | `src/app/partner/dashboard/page.tsx` | Partner dashboard (tools, earnings, settings) |
| 7 | `src/app/api/partner/magic-link/route.ts` | Request magic link API |
| 8 | `src/app/api/partner/magic-link/verify/route.ts` | Verify magic link API |
| 9 | `src/app/api/partner/dashboard/route.ts` | Dashboard data API |
| 10 | `src/app/api/partner/settings/route.ts` | Update payment settings API |
| 11 | `src/app/api/partner/logout/route.ts` | Logout API |
| 12 | `src/app/r/[code]/page.tsx` | Referral URL -> bridge page |
| 13 | `src/app/partners/bondsman/page.tsx` | Bondsman-specific landing page |
| 14 | `src/components/BridgePage.tsx` | Bridge page component |
| 15 | `src/components/ReferralQuiz.tsx` | SMIQ + micro-commitment quiz |
| 16 | `src/components/QRCode.tsx` | QR code generator component |
| 17 | `src/components/MessageTemplates.tsx` | Pre-written text template cards |

## 9. Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `src/middleware.ts` | Add `/api/partner/:path*` to matcher + cookie-exists check (no DB call in Edge) |
| 2 | `src/app/partners/page.tsx` | Rewrite to generic affiliate language, derive commission table from TIER_CORE |
| 3 | `src/app/my-case/[token]/page.tsx` | Add tier-aware content, always-on sections, referral attribution |
| 4 | `src/app/checkout/page.tsx` | Read `ref` cookie (client-side, not httpOnly), send promoCode to API, show attribution |
| 5 | `src/app/api/checkout/route.ts` | Accept `promoCode` field, look up Stripe promo code ID, use `discounts` array (4-way: referral only, upgrade only, both, neither) |
| 6 | `src/app/admin/partners/page.tsx` | Display payment info, filter by company, add error handling on toggleStatus/markPayout |
| 7 | `src/app/api/admin/partners/[id]/route.ts` | Payout POST: create `partner_payouts` record + fix race condition (atomic increment on `total_paid_out`) |
| 8 | `src/app/api/admin/partners/route.ts` | Fix promo code generation: add uniqueness check + randomized suffix for collision avoidance |
| 9 | `src/app/api/webhooks/stripe/route.ts` | Fix race condition: atomic increment on `total_referrals` and `total_commission` |
| 10 | `src/middleware.ts` | Fix timing-safe compare: use HMAC-SHA256 comparison via Web Crypto API (eliminates length oracle) |

## 10. Implementation Tasks (ordered)

### Phase 0: Fix Existing Bugs (before building on top)
1. Fix race condition in payout: atomic increment on `total_paid_out` in `src/app/api/admin/partners/[id]/route.ts` (use Supabase RPC or raw SQL `total_paid_out = total_paid_out + $amount`)
2. Fix race condition in webhook: atomic increment on `total_referrals` and `total_commission` in `src/app/api/webhooks/stripe/route.ts`
3. Fix promo code generation in `src/app/api/admin/partners/route.ts`: add DB uniqueness check + randomized suffix for collision avoidance
4. Fix timing-safe compare in `src/middleware.ts`: replace current XOR approach with HMAC-SHA256 comparison (hash both values with a fixed key, then compare fixed-length hashes — eliminates length oracle entirely). Edge Runtime supports `crypto.subtle.importKey` + `crypto.subtle.sign` for HMAC.
5. Add error handling to `toggleStatus` and `markPayout` in `src/app/admin/partners/page.tsx`

### Phase 1: Foundation
6. Write + run migration `014-partner-portal.sql` (includes UNIQUE constraint on `promo_code`)
7. Create `src/lib/twilio.ts` — SMS utility
8. Create `src/lib/partner-auth.ts` — magic link + session logic + `validatePartnerSession()` helper
9. Update `src/middleware.ts` — add `/api/partner/:path*` to matcher + cookie-exists check (no DB in Edge)

### Phase 2: Partner Portal
10. Create `/partner/login` page + `/api/partner/magic-link` API
11. Create `/partner/login/verify` page + `/api/partner/magic-link/verify` API
12. Create `/api/partner/dashboard` API route
13. Create `/api/partner/settings` API route
14. Create `/api/partner/logout` API route
15. Create `/partner/dashboard` page (full dashboard UI)
16. Create `QRCode` component
17. Create `MessageTemplates` component

### Phase 3: Referral Flow
18. Create `/r/[code]` route + `BridgePage` component (with suspended/invalid code fallback)
19. Create `ReferralQuiz` component (SMIQ + micro-commitments + recommendation from TIER_CORE)
20. Modify checkout page to read `ref` cookie, send promoCode to API, show attribution
21. Modify checkout API: accept `promoCode`, build `discounts` array (4-way: referral only, upgrade only, both, neither)

### Phase 4: Landing Pages
22. Rewrite `/partners` page to generic affiliate language + derive commission table from TIER_CORE
23. Create `/partners/bondsman` page (relocated existing copy)
24. Update payout POST handler: create `partner_payouts` record with method + batch info

### Phase 5: Customer Portal
25. Upgrade `/my-case/[token]` — tier-aware content, always-on, referral attribution (extract sub-components to keep under 1000 lines)
