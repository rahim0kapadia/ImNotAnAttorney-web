# Partner Program: Best-in-Class Upgrade, Design Spec

**Date:** 2026-04-12
**Status:** Approved
**Scope:** Full overhaul of the existing partner/affiliate system to match best-in-class SaaS affiliate programs (GoHighLevel, ClickFunnels, ThriveCart benchmarks)

## Context

The partner system infrastructure is solid, 8 routes, 6 DB tables, 4 atomic RPCs, Stripe dual-mode promo codes, bridge page with SMIQ quiz, QR codes, magic link auth. But the program is invisible (zero nav links), activation is broken (no lifecycle emails), and retention levers are missing (flat commission, no notifications, no payout schedule).

**Research sources:** Dustin Howes (affiliate activation), GoHighLevel/FirstPromoter (signup friction), ClickFunnels (tiered commissions), ThriveCart (tracking flexibility), FTC 2026 enforcement guidelines, Performance Marketing Association industry study.

**Key stat:** 50-70% of approved affiliates never make their first share. The #1 fix is lifecycle emails engineered for first-share within 48 hours.

## Terminology

**"Partner"**, not "affiliate." Bondsmen are old-school relationship people. "Affiliate" is internet marketing jargon they don't know. All UI copy, emails, and docs use "partner" exclusively.

---

## Phase 0: Pre-Upgrade Cleanup

Before adding new features, fix structural issues that would compound during implementation. These are NOT refactors for their own sake, each directly unblocks or de-risks a specific upgrade section.

### 0a. Extract Dashboard Page Sections

**Problem:** `src/app/partner/dashboard/page.tsx` is 452 lines with 10+ useState calls. The upgrade adds 4 new sections, without extraction, it balloons to 700+ lines.

**Extract into:**
- `src/components/partner/PaymentSettingsForm.tsx`, payment method form (currently lines 342-419)
- `src/components/partner/EarningsSection.tsx`, earnings cards + payout history (currently lines 261-315)
- `src/components/partner/ToolkitSection.tsx`, promo code, referral URL, QR code (currently lines 201-249)

### 0b. Consolidate Partner Lookup by Promo Code

**Problem:** Same query written in 4 places with slight variations. Upgrade adds a 5th copy (deep link page).

**Fix:** Consolidate into a single `getPartnerByPromoCode()` in `src/lib/referral.ts` (already exists but unused by page routes). Make `/r/[code]/page.tsx`, `/r/[code]/quiz/page.tsx`, and checkout route use it.

### 0c. Extract `sanitizePromoCode` to Shared Lib

**Problem:** Defined locally inside `/api/admin/partners/route.ts`. Auto-approve flow needs it.

**Fix:** Move to `src/lib/referral.ts` alongside other promo code helpers.

### 0d. Export Shared Partner Type

**Problem:** `PartnerData` interface defined in 3 places. Adding `commission_tier` means 3 updates.

**Fix:** Export canonical `Partner` interface from `src/lib/partner-data.ts`. Dashboard and auth import it.

### 0e. Extract `VALID_STATUSES` to Shared Lib

**Fix:** Move `["pending", "approved", "suspended"]` from inline in admin PATCH handler to `src/lib/partner-data.ts`.

### 0f. Remove `"use client"` from Partner Landing Pages

**Problem:** `src/app/partners/page.tsx` and `src/app/partners/bondsman/page.tsx` are marked `"use client"` but only contain static content + a client component (`PartnerApplicationForm`). Ships unnecessary JS.

**Fix:** Remove `"use client"` from both pages. The form component already has its own client boundary.

### 0g. Extract Cookie Duration Constant

**Fix:** Add `REFERRAL_COOKIE_MAX_AGE = 90 * 24 * 60 * 60` to `src/lib/referral.ts`. Used by both `/r/[code]/page.tsx` and the new `/r/[code]/[product]/page.tsx` to prevent duration mismatch.

---

## 1. Discovery, Footer Link

**Problem:** `/partners` page exists but has zero inbound navigation anywhere on the site.

**Fix:** Add "Become a Partner" link in the Footer's Explore column, between "About" and "Get Started →".

**Files:**
- `src/components/Footer.tsx`, add one `<Link>` element

**No header change**, primary nav is for defendants. Partner discovery belongs in the footer (matches GoHighLevel, ClickFunnels pattern for secondary audiences).

---

## 2. Auto-Approve + Instant Onboarding

**Problem:** Application → manual review → admin manually creates partner → partner discovers login somehow. 30-50% drop-off at this stage industry-wide.

**New flow:**
1. Application form adds UPL compliance checkbox + Partner Terms link (both required)
2. `/api/partners/apply` validates compliance, checks for existing partner email
3. **Duplicate email handling (CRITICAL, `partners.email` has UNIQUE constraint):**
   - Email exists + `status: "approved"` → return "You're already a partner! Check your email for your dashboard link" + send fresh magic link
   - Email exists + `status: "suspended"` → insert into `partner_applications` only (admin review), return generic "Application received" (no info leakage)
   - Email exists + `status: "pending"` → update existing record, generate promo code, approve
   - Email doesn't exist → create new partner row
4. Auto-creates `partners` row with `status: "approved"`
5. Generates Stripe promo code via `createPartnerPromoCode()` (uses extracted `sanitizePromoCode` from Phase 0c)
6. **Promo code activation gate (SECURITY, prevents code farming):** Promo code created on Stripe with `active: false`. Welcome email magic link, when clicked, activates the code via a new `activatePartnerPromoCode()` in `referral.ts`. Without email verification, an attacker could farm 10% discount codes with fake emails. Rate limit (3/IP/hr) is trivially bypassable with VPN.
7. Sends welcome email immediately with magic link (Email 1 of activation sequence)
8. Admin gets notification (can suspend later, approve-first, moderate-after model)
9. Partner clicks magic link → promo code activates → lands on dashboard within 60 seconds

**Success message update:** Current form shows "We'll review your application and email you within 24 hours." Change to: "You're in! Check your email for your partner code and dashboard link."

**Compliance checkbox copy:**
> "I agree to the [Partner Terms of Service](/partners/terms) and will not make claims about case outcomes or provide legal advice on behalf of ImNotAnAttorney."

**Why approve-first with email gate:** Bondsmen are pre-qualified by profession. UPL risk mitigated by compliance agreement. Email verification via magic link click prevents discount code farming while keeping the partner experience instant (code arrives in their inbox immediately).

**Files:**
- `src/app/api/partners/apply/route.ts`, auto-create partner + promo code (inactive) + send welcome email
- `src/app/api/partner/magic-link/verify/route.ts`, add promo code activation after token verification
- `src/components/partner/PartnerApplicationForm.tsx`, add compliance checkbox + terms link + updated success message
- `src/lib/referral.ts`, reuse `createPartnerPromoCode()`, add `activatePartnerPromoCode()`, use extracted `sanitizePromoCode`

**DB changes:** None, `partners` table already has all required columns. `partner_applications` table still records the application for audit trail.

---

## 3. Partner Lifecycle Emails

### 3a. Activation Sequence (5 emails)

| # | Key | Timing | Subject | Content | Goal |
|---|---, |------, |---------|---------|------|
| 1 | `partner_welcome` | Instant (Day 0) | "Welcome, your partner code is {CODE}" | Promo code, dashboard magic link, first message template, commission table | Dashboard visit |
| 2 | `partner_first_share` | Day 1 | "Send this to your next client (copy-paste)" | Pre-written message + QR code download + "takes 30 seconds" | First share in 48h |
| 3 | `partner_the_math` | Day 3 | "5 referrals = ${monthly_amount}/month" | Commission calculator per tier, real dollar amounts | Motivation |
| 4 | `partner_social_proof` | Day 7 | "How partners are using this" | 3 sharing scenarios (in-person, text, email) | Legitimacy |
| 5 | `partner_checkin` | Day 14 | "Quick check-in" | Performance so far + tips + "reply if you have questions" | Retention |

### 3b. Real-Time Sale Notification

Triggered in Stripe webhook when `track_referral` RPC succeeds:
- Subject: "You earned ${commission}!"
- Body: Tier name, commission amount, running total, dashboard link
- Sent via Resend (fire-and-forget, same as operator notifications)

### 3c. Payout Notification

Triggered when admin processes payout via `/api/admin/partners/[id]`:
- Subject: "Payment sent: ${amount}"
- Body: Amount, payment method, referral breakdown, dashboard link

### 3d. Commission Tier Upgrade Notification

Triggered when a sale pushes partner across a tier threshold:
- Subject: "You've been upgraded to {Silver/Gold} Partner!"
- Body: New rate, what changed, earnings projection at new rate

**Files:**
- `src/lib/partner-emails.ts`, NEW file: all partner email templates (activation + notifications)
- `src/app/api/cron/partner-drip/route.ts`, NEW: cron handler for Day 1/3/7/14 activation emails
- `src/app/api/webhooks/stripe/route.ts`, add sale notification send after `track_referral`
- `src/app/api/admin/partners/[id]/route.ts`, add payout notification send after `process_partner_payout`

**Cron registration:** `POST https://api.cron-job.org/jobs`, runs every 6 hours, hits `/api/cron/partner-drip`.

**Email style:** Matches existing drip emails, dark bg (`#0C0A09`), zinc text (`#D4D4D8`), amber accent (`#F59E0B`). CAN-SPAM footer added by `sendEmail()`.

---

## 4. Cookie Duration: 30 → 90 Days

**Problem:** 30-day cookie is too short for $997-$9,997 products with crisis-delayed purchase decisions.

**Fix:** Change `maxAge` from `30 * 24 * 60 * 60` to `90 * 24 * 60 * 60` in `/r/[code]/page.tsx`.

**Research basis:** GoHighLevel uses 90 days. For high-ticket + long-consideration products, 90 days captures the tail of the conversion curve. Cookie duration research shows 30-day captures ~98% for typical products, but criminal defense has abnormally long decision windows (arrest → trial can be months).

**Files:**
- `src/app/r/[code]/page.tsx`, one constant change

---

## 5. Tiered Commissions

**Structure (ClickFunnels model adapted for one-time high-ticket):**

| Tier | Threshold | Rate | Display Name |
|------|---------, |------|------------, |
| Partner | 0-4 lifetime sales | 10% | Partner |
| Silver | 5-14 lifetime sales | 15% | Silver Partner |
| Gold | 15+ lifetime sales | 20% | Gold Partner |

**Why lifetime thresholds (not monthly):** Bondsmen refer sporadically. Monthly resets are demoralizing. Lifetime creates permanent progression, once Gold, always Gold. This matches ClickFunnels' approach for non-SaaS products.

**Implementation:**
- Tier evaluation runs in the Stripe webhook after each `track_referral` call
- If sale pushes partner across threshold: update `commission_rate` + `commission_tier` on `partners` row
- Future sales use new rate automatically (webhook already reads `partner.commission_rate`)
- Send tier upgrade notification email

**DB changes:**
- Add `commission_tier text DEFAULT 'partner'` to `partners` table (display purposes)
- Commission rate already exists and is per-partner

**Files:**
- `src/lib/partner-tiers.ts`, NEW: tier definitions, evaluation logic, threshold constants
- `src/app/api/webhooks/stripe/route.ts`, add tier evaluation after referral tracking
- `src/app/partner/dashboard/page.tsx`, display current tier + progress bar
- `src/lib/partner-data.ts`, update commission table to show tiered rates
- Migration: add `commission_tier` column

---

## 6. Deep Linking

**Problem:** All referral traffic funnels through `/r/[code]` bridge page. Partners can't link directly to specific products.

**New route:** `/r/[code]/[product]`

| Deep Link | Redirects To |
|---------, |-------------|
| `/r/CODE/case-decoder` | `/checkout?tier=case-decoder` |
| `/r/CODE/intelligence-brief` | `/checkout?tier=intelligence-brief` |
| `/r/CODE/x-ray` | `/checkout?tier=x-ray` |
| `/r/CODE/war-room` | `/checkout?tier=war-room` |
| `/r/CODE/dui` | `/checkout?tier=dui-first-offense` |

**Behavior:** Sets ref cookie (90 days) + redirects to checkout. No bridge page for deep links, the partner already told the client what to buy.

**Generic `/r/CODE`** still works (bridge page → quiz → recommendation) for when the partner doesn't know which tier the defendant needs.

**Files:**
- `src/app/r/[code]/[product]/page.tsx`, NEW: deep link handler (server component, sets cookie, redirects)

---

## 7. Sub-ID Tracking

**Problem:** Partners can't tell which of their channels (YouTube vs email vs in-person) converts.

**Implementation:**
- Partners append `?sub=youtube` or `?sub=email-list` to any referral URL
- `/r/[code]` and `/r/[code]/[product]` read `sub` query param
- Stored in ref cookie as `ref_sub` alongside `ref`
- Checkout passes through to Stripe session metadata as `partner_sub_id`
- Webhook stores in `referrals.sub_id`
- Dashboard groups earnings by sub-ID

**DB changes:**
- Add `sub_id text` column to `referrals` table

**Files:**
- `src/app/r/[code]/page.tsx`, read `sub` query param, store in cookie
- `src/app/r/[code]/[product]/page.tsx`, same
- `src/app/api/checkout/route.ts`, pass `ref_sub` cookie to Stripe metadata
- `src/app/api/webhooks/stripe/route.ts`, store `sub_id` in referral record
- `src/app/partner/dashboard/page.tsx`, group by sub-ID in activity table
- Migration: add `sub_id` column

---

## 8. Payout Improvements

**Current:** Manual payouts (Zelle/Venmo/check), no defined schedule, no PayPal.

**Changes:**
- **Add PayPal** to `VALID_PAYMENT_METHODS` and partner settings UI
- **Define NET-30 schedule:** Payouts processed on the 1st of each month for previous month's confirmed sales
- **Dashboard display:** Next payout date, pending amount, payout history
- **FAQ update:** Replace vague "monthly" with specific NET-30 language

**Files:**
- `src/lib/partner-data.ts`, add `"paypal"` to `VALID_PAYMENT_METHODS`, update FAQ
- `src/app/api/partner/settings/route.ts`, accept `payment_paypal` field
- `src/app/partner/dashboard/page.tsx`, show next payout date + PayPal option
- Migration: add `payment_paypal text` column to `partners`

---

## 9. Compliance Kit

**Critical for UPL safety.** One bad partner post claiming "they'll win your case" = legal exposure.

**Content (displayed in dashboard toolkit section):**

### Approved Language
- "This service researches your case and generates questions for your attorney"
- "They provide legal information, not legal advice"
- "It helps you hold your attorney accountable"
- "They dig into your case facts and give you the right questions to ask"

### Prohibited Language
- No promising outcomes ("they'll get you off")
- No "better than a lawyer" / anti-attorney language
- No case outcome predictions
- No specific legal advice
- No "they're your legal team" / anything implying attorney-client relationship

### FTC Disclosure Templates
- **Social:** "Partner link, I earn a commission if you purchase, at no extra cost to you. #ad"
- **Email:** "Disclosure: I'm a partner of ImNotAnAttorney and earn a commission on purchases made through my link."
- **Verbal (bondsmen):** "I work with a company that researches cases and helps defendants prepare questions for their attorney. If you use my code, I get a small commission, doesn't cost you any extra."

### Partner Terms of Service
- Link from application form (separate page at `/partners/terms`)
- Covers: prohibited methods, brand guidelines, termination clauses, compliance requirements

**Files:**
- `src/app/partners/terms/page.tsx`, NEW: partner terms of service page
- `src/components/partner/ComplianceKit.tsx`, NEW: approved/prohibited language + FTC templates (dashboard section)
- `src/app/partner/dashboard/page.tsx`, add ComplianceKit to toolkit section

---

## 10. Creative Assets Expansion

**Current toolkit:** 4 message templates + QR code.

**Add to dashboard toolkit:**

| Asset | Type | Description |
|-------|------|-------------|
| 3 social posts | Copy-paste text | X post, Facebook post, general social (per-tier variants) |
| 2 email swipe templates | HTML/text | For partners with email lists, intro + follow-up |
| Verbal script | Text | For bondsmen: what to say when handing out cards |
| One-pager PDF | Downloadable | Printable summary for office posting |

**Files:**
- `src/components/partner/CreativeAssets.tsx`, NEW: expanded asset library component
- `src/app/partner/dashboard/page.tsx`, add CreativeAssets to toolkit section
- `public/partner-assets/partner-one-pager.pdf`, NEW: downloadable PDF

---

## 11. Session Cleanup Cron

**Problem:** Expired magic links and sessions accumulate indefinitely (TODO from migration 015).

**Fix:** API route at `/api/cron/partner-cleanup` that:
- Deletes `partner_magic_links` where `expires_at < now()` or `used_at IS NOT NULL`
- Deletes `partner_sessions` where `expires_at < now()`
- Returns count of cleaned rows

**Cron:** Registered via cron-job.org, runs daily at 3am ET.

**Files:**
- `src/app/api/cron/partner-cleanup/route.ts`, NEW: cleanup handler
- Auth: `CRON_AUTH_TOKEN` header check (matches existing cron pattern)

---

## 12. Partner Analytics (Dashboard Enhancement)

**Current dashboard:** Basic earnings number + recent activity list.

**Add:**
- **Earnings chart:** Last 30/60/90 days, simple bar chart (monthly buckets)
- **Conversion summary:** Total referral link visits vs total sales (conversion rate)
- **Per-tier breakdown:** Which products earn the most
- **Commission tier progress:** Visual progress bar to next tier threshold

**Implementation:** All data derivable from existing `referrals` table, no new data collection needed. Chart renders server-side as a simple CSS bar chart (no chart library dependency).

**Files:**
- `src/components/partner/PartnerAnalytics.tsx`, NEW: analytics component
- `src/app/api/partner/dashboard/route.ts`, extend to return analytics data (monthly aggregates, tier breakdown)
- `src/app/partner/dashboard/page.tsx`, add analytics section

---

## DB Migration Summary

Single migration file with all schema changes:

```sql
, Add commission tier display name
ALTER TABLE partners ADD COLUMN IF NOT EXISTS commission_tier text DEFAULT 'partner';

, Add PayPal payment option
ALTER TABLE partners ADD COLUMN IF NOT EXISTS payment_paypal text;

, Add sub-ID tracking for referrals
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS sub_id text;

, Add partner activation email tracking
ALTER TABLE partners ADD COLUMN IF NOT EXISTS activation_email_sent_at timestamptz;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS last_activation_email_key text;

, Index for partner drip cron efficiency
CREATE INDEX IF NOT EXISTS idx_partners_activation_drip
  ON partners (status, activation_email_sent_at)
  WHERE status = 'approved';
```

---

## New Files Summary

| File | Purpose |
|------|---------|
| `src/lib/partner-emails.ts` | All partner email templates (activation + notifications) |
| `src/lib/partner-tiers.ts` | Tier definitions, evaluation logic, threshold constants |
| `src/app/api/cron/partner-drip/route.ts` | Cron: activation email sequence |
| `src/app/api/cron/partner-cleanup/route.ts` | Cron: expired session/token cleanup |
| `src/app/r/[code]/[product]/page.tsx` | Deep link handler |
| `src/app/partners/terms/page.tsx` | Partner terms of service |
| `src/components/partner/ComplianceKit.tsx` | Approved/prohibited language + FTC templates |
| `src/components/partner/CreativeAssets.tsx` | Expanded asset library |
| `src/components/partner/PartnerAnalytics.tsx` | Earnings chart + conversion + tier progress |
| `public/partner-assets/partner-one-pager.pdf` | Downloadable one-pager |
| `supabase/migrations/2026XXXX_partner_program_upgrade.sql` | Schema changes |

## Modified Files Summary

| File | Change |
|------|------, |
| `src/components/Footer.tsx` | Add "Become a Partner" link |
| `src/components/partner/PartnerApplicationForm.tsx` | Add compliance checkbox |
| `src/app/api/partners/apply/route.ts` | Auto-approve flow |
| `src/app/r/[code]/page.tsx` | Cookie 90 days + sub-ID |
| `src/app/api/checkout/route.ts` | Pass sub-ID to Stripe metadata |
| `src/app/api/webhooks/stripe/route.ts` | Sale notification + tier evaluation + sub-ID |
| `src/app/api/admin/partners/[id]/route.ts` | Payout notification email |
| `src/app/partner/dashboard/page.tsx` | Tier display, analytics, compliance kit, creative assets, PayPal |
| `src/app/api/partner/dashboard/route.ts` | Return analytics data |
| `src/app/api/partner/settings/route.ts` | Accept PayPal field |
| `src/lib/partner-data.ts` | Add PayPal, update FAQ, tiered commission table |

---

## Cascade Analysis

| Stakeholder | Win |
|-------------|---, |
| **Us** | Higher partner activation → more referral revenue → lower CAC |
| **Partners (bondsmen)** | Instant onboarding, clear earnings path, professional toolkit, predictable payouts |
| **Defendants (partner's clients)** | 10% discount, discover a service they need during crisis, better case preparation |
| **Defense attorneys** | Better-prepared clients asking better questions → more productive meetings |
| **Ecosystem (bail bond industry)** | Bondsmen add value beyond bonding → service diversification → industry elevation |
| **Future-us** | Scalable partner infrastructure, compliance-first design prevents legal issues |

---

## Non-Goals (Explicitly Out of Scope)

- **Stripe Connect migration**, manual payouts work at current scale. Revisit at 50+ active partners.
- **Multi-tier coupons per partner**, single master coupon with per-partner promo codes is sufficient.
- **Partner API/webhook**, partners don't need programmatic access yet.
- **Leaderboard**, nice-to-have, not essential for launch. Add when there are 10+ active partners.
- **Partner community (Slack/Discord)**, premature at current scale.

---

## Review Findings, Amendments (Code Review + Simplify + Gap Analysis)

Three parallel reviews ran against this spec + the existing partner codebase. The following amendments incorporate all CRITICAL, HIGH, and select MEDIUM findings.

### Amendment A: Section 3, Cron + Email Patterns

**Cron pattern (must match existing `drip/route.ts`):**
- Auth: `requireCron(req)` from `@/lib/auth/guards`
- Idempotency: `acquireCronLock("partner-drip", 5 * 60 * 60 * 1000)`, 5h lock window for 6h run interval
- Task runner: export async function per `CronContext`/`CronResult` types from `@/lib/cron/types`
- Records run in `cron_runs` table with merged results

**Email function:** Use `sendEmail()` from `@/lib/email` (params: `{ to, subject, html, unsubscribeEmail? }`). Inner HTML only, `sendEmail()` wraps in branded dark template + CAN-SPAM footer. Use `EmailLogContext.category = "partner-activation"` or `"partner-notification"`.

**Sale notification placement (HIGH):** The webhook's referral tracking block (lines 483-563) is wrapped in a try-catch that swallows errors. Sale notification email MUST be sent OUTSIDE this try-catch, after referral tracking succeeds but in its own try-catch. Otherwise email failures are silently swallowed and partners never learn about sales.

**Partner drip email tracking:** The spec's `last_activation_email_key` (singular text column) is sufficient for the 5-email linear sequence. The existing subscriber drip uses a `drip_keys_sent` JSONB array because subscribers can enter multiple overlapping sequences. Partners have one linear sequence, single-key tracking works. Query: `WHERE status='approved' AND (last_activation_email_key IS NULL OR last_activation_email_key < target_key)`.

### Amendment B: Section 5, Tier Evaluation Race Condition (CRITICAL)

**Problem:** Spec says tier evaluation runs in webhook "after `track_referral` call." But `track_referral` RPC is atomic (INSERT referral + INCREMENT totals), while the proposed tier evaluation is a SEPARATE read + update. Two concurrent webhook calls for the same partner could race, both read pre-increment `total_referrals`, both evaluate, second overwrites first.

**Fix:** Add tier evaluation INSIDE the `track_referral` RPC itself. The RPC already atomically increments `total_referrals`. After the increment, check thresholds and update `commission_rate` + `commission_tier` in the same transaction. Return the new tier as part of the RPC response so the webhook knows whether to send a tier upgrade email.

**Updated `track_referral` RPC signature:**
```sql
CREATE OR REPLACE FUNCTION track_referral(
  p_partner_id uuid, p_order_id uuid, p_tier text,
  p_sale_amount bigint, p_discount_amount bigint,
  p_commission_amount bigint, p_sub_id text DEFAULT NULL
) RETURNS jsonb , was void, now returns { tier_changed: bool, new_tier: text }
```

**Tier thresholds hardcoded in SQL** (not application code) to prevent drift:
```sql
CASE
  WHEN new_total >= 15 THEN 'gold'
  WHEN new_total >= 5 THEN 'silver'
  ELSE 'partner'
END
```

**Refund policy (HIGH):** Refunded sales DO decrement `total_referrals` (existing `reverse_referral_commission` RPC), but tiers are NEVER downgraded. "Once Gold, always Gold" is the explicit business rule. The `commission_tier` and `commission_rate` are only ever upgraded, never set backwards. This means the counter may show 14 while the tier says Gold, this is intentional and consistent.

### Amendment C: Section 7, Sub-ID RPC + Sanitization (CRITICAL + HIGH)

**RPC change required:** The `track_referral` RPC has a hardcoded INSERT column list. Adding `sub_id` to the `referrals` table without updating the RPC means it's always NULL. Amendment B above adds `p_sub_id text DEFAULT NULL` parameter, this also solves the sub-ID storage.

**Sub-ID sanitization (HIGH):** The `sub` query param is user-controlled freeform input going into cookie → Stripe metadata → DB. Rules:
- Max 50 characters (truncate, don't reject)
- Alphanumeric + hyphens + underscores only: `/^[a-zA-Z0-9_-]{1,50}$/`
- Strip anything else silently
- Stripe metadata values cap at 500 chars, but we cap tighter

**Checkout flow clarification:** The checkout API does NOT read cookies directly. The client-side checkout form reads `ref` and `ref_sub` cookies via `document.cookie` and passes them in the POST body. Sub-ID follows the same pattern: `ref_sub` cookie → client reads → includes as `refSub` in POST body → checkout passes to Stripe metadata.

### Amendment D: Section 4, Cookie Duration Shared Constant

**Already addressed in Phase 0g.** `REFERRAL_COOKIE_MAX_AGE` constant in `src/lib/referral.ts` prevents the deep link page (`/r/[code]/[product]`) from shipping with a different cookie duration than the bridge page.

### Amendment E: Section 11, Cleanup Audit Trail

**Change:** Do NOT delete magic links where `used_at IS NOT NULL`. These serve as an audit trail of partner authentication events. Only delete:
- `partner_magic_links` where `expires_at < now()` AND `used_at IS NULL` (expired, never used)
- `partner_sessions` where `expires_at < now()` (expired sessions)

Used magic links can be purged on a 90-day rolling basis if storage becomes an issue.

### Amendment F: Section 12, Dashboard Analytics Query

**Problem:** Current dashboard API fetches referrals with `.limit(50)`. Analytics need full aggregation.

**Fix:** Add a SQL RPC `partner_analytics(p_partner_id uuid)` that returns pre-aggregated data: monthly commission totals, per-tier breakdown, total referral count. This avoids fetching all rows to the application layer. The existing `.limit(50)` query stays for the "Recent Activity" table, analytics uses the new RPC.

### Amendment G: Hardcoded 10% Commission (from Simplifier)

**Problem:** "10%" is hardcoded in 5+ files: `partner-data.ts` (commission table), `BridgePage.tsx`, `partners/page.tsx`, `partners/bondsman/page.tsx`, `ReferralQuiz.tsx`.

**Fix applied during implementation:**
- Customer discount stays at 10% regardless of partner tier (this is the Stripe coupon, not the commission). The master coupon `bondsman-referral-10pct` is unchanged.
- Landing page copy changes to "They save 10%. You earn up to 20%."
- Commission table in `partner-data.ts` shows all 3 tier rates
- Bridge page: "saves you 10%" stays accurate (that's the customer discount)
- Welcome email shows the full tier progression table for motivation

### Amendment H: Sitemap

Add to `src/app/sitemap.ts`:
- `/partners`, priority 0.5, yearly change
- `/partners/terms`, priority 0.3, yearly change

Do NOT add: `/r/[code]`, `/r/[code]/[product]` (referral redirects, not content), `/partner/dashboard` or `/partner/login` (auth-protected).

### Amendment I: Updated File Lists

**New files (updated):**

| File | Purpose |
|------|---------|
| `src/lib/partner-emails.ts` | All partner email templates (activation + notifications) |
| `src/lib/partner-tiers.ts` | Tier definitions, evaluation logic, threshold constants |
| `src/app/api/cron/partner-drip/route.ts` | Cron: activation email sequence |
| `src/app/api/cron/partner-cleanup/route.ts` | Cron: expired session/token cleanup |
| `src/app/r/[code]/[product]/page.tsx` | Deep link handler |
| `src/app/partners/terms/page.tsx` | Partner terms of service |
| `src/components/partner/ComplianceKit.tsx` | Approved/prohibited language + FTC templates |
| `src/components/partner/CreativeAssets.tsx` | Expanded asset library |
| `src/components/partner/PartnerAnalytics.tsx` | Earnings chart + conversion + tier progress |
| `src/components/partner/PaymentSettingsForm.tsx` | Extracted from dashboard (Phase 0a) |
| `src/components/partner/EarningsSection.tsx` | Extracted from dashboard (Phase 0a) |
| `src/components/partner/ToolkitSection.tsx` | Extracted from dashboard (Phase 0a) |
| `public/partner-assets/partner-one-pager.pdf` | Downloadable one-pager |
| `supabase/migrations/20260412a_partner_program_upgrade.sql` | Schema changes + updated RPC |

**Modified files (updated):**

| File | Change |
|------|------, |
| `src/components/Footer.tsx` | Add "Become a Partner" link |
| `src/components/partner/PartnerApplicationForm.tsx` | Compliance checkbox + terms link + success message |
| `src/app/api/partners/apply/route.ts` | Auto-approve flow with duplicate email handling |
| `src/app/api/partner/magic-link/verify/route.ts` | Activate Stripe promo code on verification |
| `src/app/r/[code]/page.tsx` | Cookie 90 days (shared constant) + sub-ID |
| `src/app/api/checkout/route.ts` | Pass `refSub` body field to Stripe metadata |
| `src/app/api/webhooks/stripe/route.ts` | Sale notification (outside try-catch) + tier check (via RPC return) + sub-ID |
| `src/app/api/admin/partners/[id]/route.ts` | Payout notification email |
| `src/app/partner/dashboard/page.tsx` | Refactor to use extracted components + add new sections |
| `src/app/api/partner/dashboard/route.ts` | Return analytics via new RPC |
| `src/app/api/partner/settings/route.ts` | Accept PayPal field |
| `src/lib/partner-data.ts` | Add PayPal, update FAQ, tiered commission table, export Partner type + VALID_STATUSES |
| `src/lib/referral.ts` | Extract `sanitizePromoCode`, add `activatePartnerPromoCode`, export `REFERRAL_COOKIE_MAX_AGE` |
| `src/app/partners/page.tsx` | Remove `"use client"`, update "10%" copy to "up to 20%" |
| `src/app/partners/bondsman/page.tsx` | Remove `"use client"`, update "10%" copy |
| `src/app/sitemap.ts` | Add `/partners` and `/partners/terms` |

**Updated migration:**

```sql
, Partner program upgrade
, Migration: 20260412a_partner_program_upgrade.sql

, Commission tier display
ALTER TABLE partners ADD COLUMN IF NOT EXISTS commission_tier text DEFAULT 'partner';

, PayPal payment option
ALTER TABLE partners ADD COLUMN IF NOT EXISTS payment_paypal text;

, Sub-ID tracking
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS sub_id text;

, Activation email tracking
ALTER TABLE partners ADD COLUMN IF NOT EXISTS activation_email_sent_at timestamptz;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS last_activation_email_key text;

, Drip cron index
CREATE INDEX IF NOT EXISTS idx_partners_activation_drip
  ON partners (status, activation_email_sent_at)
  WHERE status = 'approved';

, Update track_referral RPC: add sub_id param + atomic tier evaluation
CREATE OR REPLACE FUNCTION track_referral(
  p_partner_id uuid, p_order_id uuid, p_tier text,
  p_sale_amount bigint, p_discount_amount bigint,
  p_commission_amount bigint, p_sub_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_total integer;
  v_old_tier text;
  v_new_tier text;
  v_new_rate integer;
BEGIN
 , Insert referral (idempotent via unique constraint)
  INSERT INTO referrals (partner_id, order_id, tier, sale_amount, discount_amount, commission_amount, sub_id)
  VALUES (p_partner_id, p_order_id, p_tier, p_sale_amount, p_discount_amount, p_commission_amount, p_sub_id)
  ON CONFLICT (order_id, partner_id) DO NOTHING;

 , Atomic increment
  UPDATE partners SET
    total_referrals = total_referrals + 1,
    total_commission = total_commission + p_commission_amount
  WHERE id = p_partner_id
  RETURNING total_referrals, commission_tier INTO v_new_total, v_old_tier;

 , Tier evaluation (only upgrades, never downgrades)
  v_new_tier := CASE
    WHEN v_new_total >= 15 THEN 'gold'
    WHEN v_new_total >= 5 THEN 'silver'
    ELSE 'partner'
  END;
  v_new_rate := CASE v_new_tier
    WHEN 'gold' THEN 20
    WHEN 'silver' THEN 15
    ELSE 10
  END;

  IF v_new_tier != v_old_tier AND v_new_rate > (SELECT commission_rate FROM partners WHERE id = p_partner_id) THEN
    UPDATE partners SET commission_tier = v_new_tier, commission_rate = v_new_rate
    WHERE id = p_partner_id;
    RETURN jsonb_build_object('tier_changed', true, 'new_tier', v_new_tier, 'new_rate', v_new_rate);
  END IF;

  RETURN jsonb_build_object('tier_changed', false, 'new_tier', v_old_tier);
END;
$$;

, Revoke from public, grant to service_role only
REVOKE ALL ON FUNCTION track_referral FROM PUBLIC;
GRANT EXECUTE ON FUNCTION track_referral TO service_role;

, Partner analytics RPC
CREATE OR REPLACE FUNCTION partner_analytics(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_monthly jsonb;
  v_by_tier jsonb;
  v_total_count integer;
BEGIN
  SELECT jsonb_agg(row_to_json(m)) INTO v_monthly FROM (
    SELECT date_trunc('month', created_at)::date AS month,
           SUM(commission_amount) AS commission,
           COUNT(*) AS count
    FROM referrals WHERE partner_id = p_partner_id
    GROUP BY 1 ORDER BY 1 DESC LIMIT 12
  ) m;

  SELECT jsonb_agg(row_to_json(t)) INTO v_by_tier FROM (
    SELECT tier, SUM(commission_amount) AS commission, COUNT(*) AS count
    FROM referrals WHERE partner_id = p_partner_id
    GROUP BY 1 ORDER BY 2 DESC
  ) t;

  SELECT COUNT(*) INTO v_total_count
  FROM referrals WHERE partner_id = p_partner_id;

  RETURN jsonb_build_object(
    'monthly', COALESCE(v_monthly, '[]'::jsonb),
    'by_tier', COALESCE(v_by_tier, '[]'::jsonb),
    'total_referrals', v_total_count
  );
END;
$$;

REVOKE ALL ON FUNCTION partner_analytics FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_analytics TO service_role;
```
