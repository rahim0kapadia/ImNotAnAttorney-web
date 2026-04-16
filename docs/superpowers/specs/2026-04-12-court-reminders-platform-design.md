# Court Reminders Platform, Design Spec

**Date:** 2026-04-12
**Status:** Draft
**Scope:** Free court date reminder system that captures defendants who complete the referral quiz but aren't ready to buy. Adds a "Set Up Free Court Reminders" option on the quiz recommendation page, a reminder sign-up form, a personalized prep page, and an automated reminder email engine.

## Context

The partner program infrastructure is fully shipped (12 sections, 16 commits as of 2026-04-12). CRO score improved from 5.2 to 8.1/10. Three conversion gaps remain: zero social proof (needs real data), copy inconsistency ("instant approval" vs "24 hours"), and bondsman page differentiation.

The bigger opportunity: defendants who complete the referral quiz but don't buy immediately are lost forever. There's no capture mechanism. Court reminders solve this, they provide genuine value (don't miss your hearing), collect case info for future targeting, and create ongoing email touchpoints where each reminder includes the product recommendation.

**Expert frameworks applied:**
- **Vincent Covello (Mental Noise Model):** Stressed people process 27 words / 9 seconds / 3 messages max. All defendant-facing copy follows CCO order (Compassion → Conviction → Optimism). Form fields minimized.
- **BJ Fogg (Behavior Model):** B=MAP. Bondsman motivation is low → don't require new behavior from them. Defendant motivation is HIGH (it's their freedom) → reduce friction (4 fields, not 10). The reminder sign-up is anchored to the existing quiz flow, not a separate path.
- **Wes Bush (Product-Led Growth):** The free tool IS the distribution. Court reminders are genuinely useful → defendant engages → INAA brand embedded in every touchpoint → conversion over time.

**Cascade check:**
| Node | Win |
|------|---, |
| Us | Captures 100% of quiz completers (buyers + non-buyers). Ongoing email touchpoints for conversion. |
| Bondsman | Single link still works (`/r/[code]`). Clients get more value = bondsman looks better. |
| Defendant | Free court date reminders + case prep content. Genuine value regardless of purchase. |
| Attorney | Better-prepared client who shows up to court. |
| Court system | Fewer FTAs (failure to appear). Research shows text/email reminders reduce FTA by ~7%. |
| Future-us | Every reminder sign-up = email address + case data + ongoing conversion opportunity. |

---

## 1. Quiz Recommendation Page, Second CTA

**File:** `src/components/ReferralQuiz.tsx` (step 4, recommendation phase)

**Current state:** Shows one product recommendation with price, discount, and "Get Started" button linking to checkout. Below that, a "See other options" link to `/services`.

**Change:** Add a second CTA below the checkout button, separated by a divider:

```
[ Get Started → ]          ← existing checkout CTA (primary, amber)

─── or ───

[ Set Up Free Court Reminders ]   ← new secondary CTA (outlined, zinc border)
```

The secondary CTA links to `/r/[promoCode]/reminders?charge=[chargeSlug]&rec=[recommendedTierSlug]`.

Query params pass the quiz results so the reminder form doesn't re-ask charge type, and the prep page knows which product to recommend.

**Copy below the secondary CTA (Covello CCO, under 27 words):**
> "Free court date reminders + what to expect at your hearing. We'll also save your personalized recommendation."

**Design:** Secondary CTA uses outlined style (border-zinc-500, hover:border-amber-500) to maintain visual hierarchy. The primary "Get Started" button stays dominant.

---

## 2. Court Reminder Sign-Up Page

**Route:** `/r/[code]/reminders`

**Server component behavior:**
1. Looks up partner by `[code]` (same pattern as `/r/[code]/page.tsx`)
2. If partner not found → redirect to `/`
3. Sets ref cookie (90-day, same as existing)
4. Reads `?charge=` and `?rec=` query params from quiz
5. Renders the `CourtReminderForm` client component

**Form fields (4 fields, charge type pre-filled from quiz):**

| Field | Type | Required | Source |
|-------|------|----------|------, |
| First name | text input | Yes | Defendant enters |
| Court date | date picker | Yes | Defendant enters (from bond paperwork) |
| County & State | text input | Yes | Defendant enters. Placeholder: "e.g. Pinellas County, FL". Stored as-is; displayed as entered. No structured validation, parsing is a Phase 2 enhancement. |
| Email | email input | Yes | Defendant enters ("Where we send your reminders") |

**Pre-filled from quiz (hidden fields):**
- `charge_type` (from `?charge=` param)
- `recommended_tier` (from `?rec=` param)
- `partner_promo_code` (from `[code]` route param)

**Headline (Covello 27/9/3):**
> **Don't miss your court date.**
> Free reminders + what to expect at your hearing.

**Submit button:** "Set Up My Reminders"

**Below form:** "Free. No account needed. Legal information, not legal advice."

**On submit, API route `/api/court-reminders`:**
1. Validates all fields (server-side)
2. Creates `court_reminders` row in Supabase (new table, see Section 5)
3. Generates unique token (uuid v4)
4. Links to partner via `partner_promo_code` for attribution
5. Sends immediate confirmation email via Resend: "Your court reminders are set up. Here's your prep page: [link]"
6. Redirects to `/prep/[token]`

**Direct access (no quiz):** If someone navigates to `/r/[code]/reminders` without quiz params, the form includes a charge type dropdown (same options as quiz step 1). This handles the case where the bondsman shares the reminders link directly.

---

## 3. Personalized Prep Page

**Route:** `/prep/[token]`

**Server component behavior:**
1. Looks up `court_reminders` row by token
2. If not found → 404. If `status = 'unsubscribed'` → 404. If court date is more than 30 days past → show "This prep page has expired" with link to `/services`.
3. Refreshes the ref cookie from stored `partner_promo_code` (ensures attribution survives across visits)
4. Renders personalized content based on stored case info

**Page content (mobile-first, single column):**

### Section A: Court Date Countdown
- Large countdown: "Your court date is in **14 days**" (or whatever the math is)
- Date displayed: "Thursday, May 15, 2026, Pinellas County, FL"
- If court date has passed: "Your court date was [date]. Need to reschedule? Talk to your attorney."

### Section B: What to Expect
- **Content source:** `src/lib/court-reminders.ts` exports a `COURT_PREP_CONTENT` map keyed by charge slug. Each entry has: `whatToExpect` (string), `whatToBring` (string[]), `whatToWear` (string), `arrivalTips` (string).
- Generic fallback content covers charge types without specific entries (drug-trafficking, federal-criminal, sex-offense, self-defense, other). Every charge type renders, none 404.
- Content is general court process education: what happens when you arrive, who's in the room, typical timeline, what to wear, what to bring, how to address the judge.
- **UPL safe:** General legal information about court process, not advice about their specific case.

### Section C: The Line Between Free and Paid (CRITICAL)

**FREE (prep page):** General court logistics available on any legal blog, what to expect, what to wear, what to bring, arrival tips, court date reminders. We package it better, not differently.

**PAID (our products):** Case-specific intelligence, charge analysis, judge sentencing patterns, attorney track record, 10-50 targeted questions based on THEIR case facts. This does not exist anywhere else.

**NO free questions.** The prep page does NOT give sample attorney questions. Questions are the product. The prep page shows the defendant THAT case-specific questions exist for their situation, without delivering them:

> "Your [charge type] case has specific angles an attorney should investigate. The [Product Name] identifies them and gives you the exact questions."

This is the taste, the promise, not the delivery. The defendant sees their charge type acknowledged specifically, understands that targeted questions exist, and gets a clear path to the product.

### Section D: Product Recommendation
- Same product the quiz recommended (stored in `recommended_tier`)
- **Discount calculation:** Extract `calculatePartnerDiscount(priceInCents)` to `src/lib/referral.ts` (returns `{ original, discounted, savings }` in cents). Used by both `ReferralQuiz.tsx` (client) and prep page (server). Currently hardcoded as `price * 0.9` in the quiz, extract, don't duplicate.
- CTA: "Get questions specific to YOUR case →" button → checkout with ref cookie
- Below CTA: "Your [charge type] case. Your judge. Your attorney's track record. [Product Name] researches all of it."

### Section E: Footer
- "ImNotAnAttorney provides legal information, not legal advice."
- "Reminders will be sent to [email] at 14, 7, 3, and 1 day(s) before your court date."
- "Unsubscribe" link

**OG metadata (for when defendant shares or bookmarks):**
- Title: "Court Prep, [County], [Charge Type]"
- Description: "Your court date is [date]. Here's what to expect and how to prepare."

---

## 4. Court Date Reminder Emails

**Engine:** New cron route `/api/cron/court-reminders`, same pattern as partner drip and case drip.

**Schedule:** Runs every 6 hours (via cron-job.org). Queries for reminders where:
- `status = 'active'`
- Court date minus current date matches a reminder interval
- That interval hasn't been sent yet

**Reminder intervals and content:**

| Days Before | Email Key | Subject | Content Focus |
|-------------|---------, |---------|---------------|
| 14 | `reminder_14d` | "Your court date is in 2 weeks" | What to expect overview + prep page link + product CTA |
| 7 | `reminder_7d` | "1 week until your court date" | Questions for your attorney + prep page link + product CTA |
| 3 | `reminder_3d` | "3 days, are you prepared?" | Checklist (what to bring, wear, arrive time) + product CTA |
| 1 | `reminder_1d` | "Tomorrow: [County] Court" | Logistics only (time, location if available, what to bring). Calm, supportive tone. Product CTA is minimal, this is a service email, not a sales email. |

**Email template style:** Matches existing drip emails, dark bg (#0C0A09), zinc text (#D4D4D8), amber accent (#F59E0B). CAN-SPAM footer + unsubscribe link.

**Covello CCO applied to each email:**
- **Compassion first:** "We know this is stressful. Here's what will help."
- **Conviction:** Specific, actionable content (checklist, questions, what to expect)
- **Optimism:** "People who prepare have better experiences in court."

**After court date passes:** One final email at +1 day. Handled by a SEPARATE query condition in the cron: `court_date + interval '1 day' <= now() AND 'post_court' NOT IN (reminders_sent)`. This is distinct from the "days before" logic.
- "How did it go? If your case is ongoing, here's how to stay prepared."
- Links to prep page + product CTA
- Sets reminder status to `completed`

**Unsubscribe:** Each email includes unsubscribe link → `/api/court-reminders/unsubscribe?token=[token]` → sets `status = 'unsubscribed'`.

**Auth:** `CRON_AUTH_TOKEN` header check (matches existing cron pattern).

**Cron registration:** `PUT https://api.cron-job.org/jobs`, runs every 6 hours.

---

## 5. Database Schema

**New table: `court_reminders`**

| Column | Type | Notes |
|------, |------|-------|
| `id` | uuid PK | Default `gen_random_uuid()` |
| `token` | text UNIQUE NOT NULL | URL token for prep page |
| `first_name` | text NOT NULL | |
| `email` | text NOT NULL | Not unique-constrained, same person can have multiple court dates |
| `charge_type` | text NOT NULL | Slug from quiz charge options |
| `county_state` | text NOT NULL | Free text, e.g. "Pinellas County, FL" |
| `court_date` | date NOT NULL | |
| `recommended_tier` | text | Product slug from quiz recommendation |
| `partner_promo_code` | text | Partner attribution (FK-ish to partners.promo_code) |
| `status` | text NOT NULL DEFAULT 'active' | active / completed / unsubscribed |
| `reminders_sent` | text[] DEFAULT '{}' | Array of sent keys: `['reminder_14d', 'reminder_7d', 'post_court']` |
| `created_at` | timestamptz DEFAULT now() | |
| `converted_at` | timestamptz | Set when defendant completes checkout |
| `order_id` | uuid | Links to orders table if converted |

**Indexes:**
- `idx_court_reminders_active_date` ON `(status, court_date)` WHERE `status = 'active'`, cron query
- `idx_court_reminders_token` ON `(token)`, prep page lookup
- `idx_court_reminders_partner` ON `(partner_promo_code)` WHERE `partner_promo_code IS NOT NULL`, partner dashboard

**RLS:** Disabled (server-only access via admin client, same as other cron-managed tables).

---

## 6. Partner Dashboard Updates

**File:** `src/app/partner/dashboard/page.tsx` and related components

### 6a. Reminder Stats in Dashboard

Add to the existing earnings/activity section:
- "Court reminder sign-ups: **[count]**", how many defendants signed up through their link
- "Reminder conversions: **[count]**", how many of those eventually purchased

Query: `SELECT count(*) FROM court_reminders WHERE partner_promo_code = [code]` and similar for converted.

### 6b. No New Link Required

The bondsman's existing referral link (`/r/[code]`) already works. Defendants reach the reminders through the quiz recommendation page. The dashboard explains this:

> "When your referrals take the quiz, they'll see an option to set up free court date reminders. You earn commission whether they buy now or through a reminder later."

---

## 7. Conversion Attribution

**Problem:** When a defendant signs up for reminders and later buys through a reminder email link, the partner needs credit.

**Primary mechanism (cookie-based):** The prep page (`/prep/[token]`) refreshes the ref cookie from stored `partner_promo_code` on every visit. When the defendant clicks "Get the full analysis →" → checkout → ref cookie is set. Existing webhook attribution works unchanged.

**Secondary mechanism (token-based tracking):** When checkout completes and the Stripe webhook fires, check if the checkout session metadata contains a `court_reminder_token`. If so, update that row's `converted_at` and `order_id`. The prep page's checkout link passes `?reminder_token=[token]` to checkout, which stores it in Stripe session metadata.

**Why not email matching:** Email-based matching is fragile, defendant may sign up with one email and checkout with another, or have multiple reminder rows. Token-based tracking is deterministic.

---

## 8. Remaining CRO Fixes + Partner Pitch Copy

Bundled into this spec since they're small and related.

### 8a. Copy Inconsistency Fix

**Files:** `src/app/partners/page.tsx` (line 165), `src/app/partners/bondsman/page.tsx` (line 142)

**Current:** "Takes 60 seconds. We'll review and get back to you within 24 hours."
**Fix:** "Takes 60 seconds. Instant approval, check your email."

The auto-approve flow is already shipped. The "24 hours" copy is stale.

### 8b. Bondsman Page Differentiation + Pitch

**File:** `src/app/partners/bondsman/page.tsx`

Currently nearly identical to the generic partner page. Rewrite the value prop section to pitch the court reminders as the hook, this is what makes the partner program worth the bondsman's time:

**Hero pitch (Covello CCO, under 27 words):**
> **Your clients need court date reminders. We handle that, and you earn on every case they prepare for.**

**Value prop bullets:**
- "Your clients get free court date reminders and a personalized prep page for their hearing."
- "When they're ready, they can upgrade to a full case analysis. You earn 10-20% on every purchase."
- "One link. Send it to every client. We do the rest."

**How It Works section (3 steps for the bondsman):**
1. "Sign up, takes 60 seconds, instant approval."
2. "Share your link with clients, text it, email it, say it out loud."
3. "Earn commission, 10% to start, 15% at 5 sales, 20% at 15 sales."

**How It Works for the client (3 steps the bondsman can explain):**
1. "They take a 30-second quiz about their charges."
2. "They can set up free court date reminders, we email them before every hearing."
3. "When they're ready, they get a full case analysis with questions for their attorney."

### 8c. Generic Partner Page Pitch Update

**File:** `src/app/partners/page.tsx`

Update the value prop to mention court reminders alongside the existing commission pitch. The generic page serves attorneys, paralegals, and other non-bondsman partners, keep it broader:

> "Your referrals get free court date reminders and case prep. You earn 10-20% on every product they purchase."

### 8d. Post-Signup Dashboard Copy

**File:** `src/app/partner/dashboard/page.tsx` (or relevant dashboard component)

After sign-up, the partner needs to understand both tools. Update the dashboard's "Getting Started" or toolkit section:

> **Two ways your clients find us:**
> 1. **Share your link**, they take a quick quiz, get a product recommendation, and can set up free court reminders.
> 2. **Say the name**, "imnotanattorney.com" is memorable. They'll find us.
>
> You earn commission either way. Court reminder sign-ups convert at their own pace, you get credit whenever they buy.

### 8e. Social Proof (Deferred)

Real social proof requires real partner data (sign-up count, earnings aggregate). Cannot fabricate. Add dynamic counters once we have 10+ active partners.

---

## 9. Files Changed / Created Summary

| Action | File | Section |
|------, |------|---------|
| Edit | `src/components/ReferralQuiz.tsx` | 1, Add second CTA on recommendation page |
| Create | `src/app/r/[code]/reminders/page.tsx` | 2, Server component for reminder sign-up |
| Create | `src/components/CourtReminderForm.tsx` | 2, Client component for form |
| Create | `src/app/api/court-reminders/route.ts` | 2, API: create reminder |
| Create | `src/app/prep/[token]/page.tsx` | 3, Personalized prep page |
| Create | `src/lib/court-reminders.ts` | 3, 4, Shared types, helpers, content generators, `COURT_PREP_CONTENT` map |
| Create | `src/lib/court-reminder-emails.ts` | 4, Email templates for all reminder intervals |
| Create | `src/app/api/cron/court-reminders/route.ts` | 4, Cron handler for sending reminders |
| Create | `src/app/api/court-reminders/unsubscribe/route.ts` | 4, Unsubscribe handler |
| Create | `supabase/migrations/20260412b_court_reminders.sql` | 5, New table + indexes |
| Edit | `src/lib/referral.ts` | 3, Extract `calculatePartnerDiscount()` |
| Edit | `src/app/partner/dashboard/page.tsx` | 6, 8d, Add reminder stats + post-signup copy |
| Edit | `src/app/partners/page.tsx` | 8a, 8c, Fix copy + add reminders pitch |
| Edit | `src/app/partners/bondsman/page.tsx` | 8a, 8b, Fix copy + full bondsman pitch rewrite |
| Edit | `src/app/api/checkout/route.ts` | 7, Pass `reminder_token` to Stripe metadata |
| Edit | `src/app/api/webhooks/stripe/route.ts` | 7, Token-based conversion tracking |

**New files:** 9
**Edited files:** 7
**DB migration:** 1 table, 3 indexes

---

## 10. What This Spec Does NOT Cover

- **Court record lookup:** Future enhancement. Requires per-jurisdiction scrapers. Phase 2.
- **SMS reminders:** Requires Twilio. Phase 3 when email proves the model.
- **Bondsman client management dashboard:** The "My Clients" tab idea. Deferred, defendants enter their own info, bondsmen don't need to.
- **Organic traffic court reminders:** Currently only accessible via partner referral flow (quiz → reminders). Site-wide rollout (`/reminders` standalone page) is Phase 2 if partner flow converts.
- **Social proof counters:** Requires real data. Infrastructure exists, threshold-gated display is Phase 2.
