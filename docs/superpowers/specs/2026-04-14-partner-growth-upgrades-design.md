# Partner Portal Growth Upgrades — Design Spec

**Date:** 2026-04-14
**Status:** Approved
**Approach:** Big Bang — all 3 subsystems ship in parallel via independent agents

## Context

The partner portal is feature-complete across 4 plans (54 tasks, 6 safety invariants). This spec covers growth-phase upgrades to make it .01% best-in-class. Three independent subsystems, one migration, parallel implementation.

### Expert Basis

- **Co-branded pages:** Superfiliate/Tapfiliate data — 2-3x conversion lift from trust transfer on co-branded landing pages. HubSpot — personalized CTAs convert 202% better than generic.
- **Commission SMS:** Harry's razor pre-launch — first-sale confirmation is THE retention moment (4x more likely to keep referring). SMS has 98% open rate. Pavlovian reinforcement loop: intermittent variable rewards delivered immediately.
- **Conversion analytics:** Standard partner program table stakes. Nationwide Insurance — QR-code referral pipelines with closed-loop attribution are lowest CPA channel.
- **Adjacent industry patterns:** Surety 3 (bail bond referrals — one phone call, zero paperwork, overnight check), insurance agent referral pipelines (QR on existing materials = zero behavior change), Dropbox (3,900% growth — referral embedded in existing workflow, not layered on top).

### Audience

Bail bondsmen (primary), paralegals, legal advocates. Busy, low-tech, barely communicate. System must work without them thinking about it. They enter their own info; clients self-serve via referral link.

---

## Subsystem 1: Co-Branded Referral Page Enhancements

### What Exists

- `/r/[code]` server component queries partner by promo code, renders `BridgePage.tsx`
- `BridgePage.tsx` already shows partner name + company with trust-transfer copy: "{Name} from {Company} referred you. Here's why."
- Quiz flow at `/r/[code]/quiz` and product deep-link at `/r/[code]/[product]`
- 90-day referral cookie set by middleware

### 1.1 Dynamic OG Meta Tags

**Problem:** When bondsman shares their referral link on Facebook/iMessage/text, the preview shows generic "Court Prep for Your Case" — no trust transfer in the preview card.

**Solution:** `generateMetadata()` in `/r/[code]/page.tsx` needs partner context to inject into OG tags.

**Implementation:**

1. **Fix `generateMetadata()` signature** — Currently declared as `generateMetadata(): Promise<Metadata>` with NO params. Must change to `generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata>` to receive the route segment (same pattern as `/blog/[slug]`, `/services/[slug]`, `/report/[token]`).
2. **Shared query helper with `React.cache()`** — Create a `getPartnerByCode(code: string)` function wrapped in `React.cache()` at module level. Both `generateMetadata()` and the page component call this. `React.cache()` guarantees deduplication within the same server request (Supabase client calls are not plain `fetch()` with identical URLs, so Next.js auto-dedup does not apply).
3. **Expand partner SELECT** — The shared helper must select `name, company, city, promo_code, status` (adding `city` for Section 1.3).
4. If partner found and approved, set OG tags:
   - `og:title`: `"Court Prep for Your Case — Referred by {company || name}"`
   - `og:description`: `"{name} from {company} trusts this service. Understand your charges and get the right questions for your attorney."`
   - `twitter:title`: same as og:title
   - `twitter:description`: same as og:description
5. If partner not found, return existing generic meta (no change to fallback path)

### 1.2 Referral Event Tracking

**Problem:** No data on how many people click partner referral links, start quizzes, or complete quizzes. Cannot calculate conversion rates per partner.

**Solution:** New `partner_events` table. Fire-and-forget INSERT on page load in server components.

**Table schema:**

```sql
CREATE TABLE partner_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id),
  event_type text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_partner_events_funnel
  ON partner_events(partner_id, event_type, created_at);
```

**Event types and where they fire:**

| Event Type | File | Trigger | Metadata |
|------------|------|---------|----------|
| `link_click` | `src/app/r/[code]/page.tsx` | Server component render when approved partner found | `{"referrer_url": request_referrer_or_null}` |
| `quiz_start` | `src/app/r/[code]/quiz/page.tsx` | Server component render | `{}` |
| `quiz_complete` | `src/components/ReferralQuiz.tsx` via `POST /api/partner/track-event` | User reaches recommendation step (step === totalSteps) | `{"charge_type": selected_charge_slug}` |
| `purchase` | `src/app/api/webhooks/stripe/route.ts` | After `track_referral` RPC succeeds | `{"tier": tier_slug, "sale_amount_cents": amount}` |

**Fire-and-forget pattern:** Event INSERTs must NOT block page render or webhook response.

- **In server components** (`/r/[code]/page.tsx`, `/r/[code]/quiz/page.tsx`): Use Next.js `after()` API. `after()` runs callbacks after the response is sent but before the Vercel function is frozen — detached promises have no guarantee of completing in serverless environments. The webhook file already imports `after` from `next/server`.
- **In Route Handlers** (webhook, track-event endpoint): Detached promises are acceptable since the handler awaits other operations before returning.

Example for server component event tracking:

```typescript
import { after } from "next/server";

// In the server component body:
after(async () => {
  const supabase = createAdminClient();
  const { error } = await supabase.from("partner_events").insert({
    partner_id: partner.id,
    event_type: "link_click",
    metadata: { referrer_url: null },
  });
  if (error) console.warn("[PartnerEvents] Insert failed:", error.message);
});
```

**Invariant:** No PII in partner_events. No customer names, emails, phone numbers, or case details. Only partner_id, event_type, and the metadata fields listed above.

### 1.3 Optional City Field

**Problem:** Research says "Referred by ABC Bail Bonds, Tampa" is the optimal trust-transfer format. City adds locality signal.

**Solution:**

1. Add `city text` column to `partners` table (nullable, no default, not required)
2. `BridgePage.tsx` renders city when present:
   - With city: `"{Name} from {Company}, {City} referred you."`
   - Without city: `"{Name} from {Company} referred you."` (current behavior, unchanged)
3. `PartnerApplicationForm.tsx` gets an optional "City" text input between Company and Phone fields
4. Partner signup API route accepts and stores the city value
5. Existing partners are unaffected — null city means no display change

**BridgePage change:**

```typescript
const displayName = company
  ? city
    ? `${partnerName} from ${company}, ${city}`
    : `${partnerName} from ${company}`
  : partnerName;
```

### 1.4 Track-Event API Endpoint

**Problem:** The quiz is a client-side component (`ReferralQuiz.tsx`). It cannot use the Supabase admin client directly. The `quiz_complete` event needs a lightweight server endpoint to INSERT into `partner_events`.

**Solution:** New `POST /api/partner/track-event` route.

**Request body:**
```json
{
  "partner_promo_code": "SMITH10",
  "event_type": "quiz_complete",
  "metadata": { "charge_type": "dui-first-offense" }
}
```

**Validation:**
- `event_type` must be one of: `quiz_complete` (only client-side event type — `link_click` and `quiz_start` fire from server components, `purchase` fires from webhook)
- `partner_promo_code` must resolve to an approved partner
- Rate limit: no more than 10 events per promo code per minute (prevent abuse)

**Response:** `{ ok: true }` on success, `{ error: "..." }` on failure. Status 200 on success, 400 on bad input, 429 on rate limit.

**No auth required** — this endpoint is called from the public referral quiz page where there is no session. Partner is identified by promo code. The rate limit prevents abuse.

### Files Modified (Subsystem 1)

| File | Change Type | What Changes |
|------|-------------|--------------|
| `src/app/r/[code]/page.tsx` | Modify | Dynamic OG meta using partner context; link_click event INSERT; shared partner query helper |
| `src/app/r/[code]/quiz/page.tsx` | Modify | quiz_start event INSERT on server component render |
| `src/components/ReferralQuiz.tsx` | Modify | Fire quiz_complete event via fetch to /api/partner/track-event when recommendation step renders |
| `src/components/BridgePage.tsx` | Modify | Accept optional `city` prop; update `displayName` logic |
| `src/components/partner/PartnerApplicationForm.tsx` | Modify | Add optional city text input |
| `src/app/api/partner/track-event/route.ts` | Create | Lightweight POST endpoint for client-side event tracking |
| `src/app/api/partner/magic-link/route.ts` or partner signup API | Modify | Accept and store city field |
| Migration file | Create | `partner_events` table with index; `city` column on `partners` |

---

## Subsystem 2: Commission SMS Notification Enhancements

### What Exists

- Stripe webhook sends commission-earned SMS: `"INAA: You earned $X from a referral! Confirms {holdbackDate}."`
- Tier-upgrade email sent when `track_referral` RPC returns `tier_changed: true`
- Commission-locking cron sends confirmation SMS when 45-day holdback passes
- `notification-prefs.ts` has `payout` channel pref controlling commission/payout notifications
- SMS via text.email gateway ($0/msg), audit logged to `sms_log` table
- `capSMS()` truncates to 160 chars for single-segment delivery

### 2.1 First-Sale Celebration

**Problem:** First sale is THE retention moment (Harry's data: 4x more likely to keep referring after first conversion). Current SMS is identical for sale number 1 and sale number 50.

**Solution:** When `partner.total_referrals === 1` after `track_referral`, send a different, richer message.

**First-sale SMS template:**

```
INAA: Your FIRST referral just purchased a {tier_display_name}! You earned ${amount}. Code {PROMO_CODE} is working — keep those cards in the bail packets.
```

**Detection logic:** After `track_referral` RPC completes, the webhook already queries the partner record for notification details. The `total_referrals` field on the partner record reflects the post-increment value (the RPC atomically increments it). If `total_referrals === 1`, use first-sale template instead of standard template.

**Character count:** Longest realistic first-sale SMS: "INAA: Your FIRST referral just purchased an Intelligence Brief! You earned $89.73. Code SMITH10 is working — keep those cards in the bail packets." = 155 chars. Fits single segment.

### 2.2 Progress-to-Next-Tier in Commission SMS

**Problem:** Bondsmen do not log into the dashboard. They do not know they are 2 referrals away from a 50% commission rate increase (10% to 15%).

**Solution:** Append tier progress to every non-first-sale commission SMS.

**Progress line formats:**

- Not at max tier: `" [3/5 to Silver — 15%]"`
- At Gold (max tier): `" [Gold Partner — 20%]"`

**Computation:** Use `COMMISSION_TIERS_CONFIG` from `partner-data.ts`. Find current tier by `commission_tier` field. Find next tier via `getNextTier()`. Build progress string from `total_referrals` and `nextTier.threshold`.

**Full non-first-sale SMS template:**

```
INAA: You earned ${amount} from a referral! Confirms {holdback_date}. [3/5 to Silver — 15%]
```

**Character count:** Longest: "INAA: You earned $449.73 from a referral! Confirms Jun 29. [14/15 to Gold Partner — 20%]" = 88 chars. Well within 160.

### 2.3 Milestone Micro-Celebrations

**Problem:** Flat reward signals cause engagement cliff after initial burst (US Mobile research: escalating rewards prevent drop-off after the first few referrals).

**Solution:** At specific referral milestones, replace the standard progress line with a celebration line. Milestone numbers stored as a const array.

**Milestone definitions:**

```typescript
const MILESTONES: { count: number; message: string }[] = [
  { count: 3, message: "3 referrals! Momentum building." },
  { count: 10, message: "10 referrals! Top-tier INAA partner." },
  { count: 25, message: "25 referrals! Helping more defendants than most attorneys." },
  { count: 50, message: "50 referrals. Legend status." },
];
```

**Detection:** After `track_referral`, check if `partner.total_referrals` matches any milestone count. If yes, use milestone message instead of progress line for that one SMS. Next sale reverts to standard progress line.

**SMS with milestone:**

```
INAA: You earned $224.73 from a referral! Confirms Jun 29. 10 referrals! Top-tier INAA partner.
```

### 2.4 Monthly Earning Summary Cron

**Problem:** Partners who earn commissions over time have no periodic reinforcement unless they log into the dashboard. The dashboard is not the engagement channel for this audience.

**Solution:** New cron route that sends a monthly summary to all active-earning partners.

**Route:** `src/app/api/cron/partner-monthly-summary/route.ts`

**Schedule:** cron-job.org, `0 14 1 * *` (1st of each month, 2PM UTC / 10AM ET)

**Auth:** `requireCron(req)` with `CRON_AUTH_TOKEN` bearer token (same pattern as all other crons)

**Idempotency:** `acquireCronLock("partner-monthly-summary", 23 * 60 * 60 * 1000)` — prevents double-execution within 23 hours

**Logic:**

1. Compute the previous month's date range (first day to last day of previous month)
2. Query all partners who have at least one referral in the previous month OR have a pending balance (`total_commission > total_paid_out`)
3. For each qualifying partner:
   a. Sum `commission_amount` from referrals created in the previous month for this partner
   b. Count referrals in the previous month
   c. Compute pending balance: `total_commission - total_paid_out`
4. Check notification preferences via `getPartnerPrefs(partner.notification_prefs)`
5. If `shouldSendSMS(prefs.commission_earned)` and partner has phone:
   ```
   INAA Monthly: You earned ${month_earnings} in {month_name}. Balance: ${balance}. Payout processes this week.
   ```
6. If `shouldSendEmail(prefs.commission_earned)`:
   Send HTML email with:
   - Previous month earnings total
   - Referral count for the month
   - Per-tier breakdown (which products sold)
   - Current tier + progress to next tier
   - Pending payout balance
   - Payout ETA ("processes on the 1st")

**Rate limiting:** Process partners sequentially to avoid overwhelming the SMS gateway. No parallel sends.

**Return value:** `{ sent_sms: N, sent_email: N, partners_notified: N, skipped: N }`

### 2.5 Separate Notification Pref for Commission Alerts

**Problem:** Current `payout` pref controls both instant commission alerts AND payout processing notifications. A partner might want instant SMS alerts but email-only for payout confirmations.

**Solution:** Add `commission_earned` channel to `PartnerNotificationPrefs`.

**Changes to `notification-prefs.ts`:**

```typescript
export interface PartnerNotificationPrefs {
  magic_link: Channel;
  client_reminded: Channel;
  drip: Channel;
  payout: Channel;
  commission_earned: Channel;  // NEW
}

export const PARTNER_DEFAULTS: PartnerNotificationPrefs = {
  magic_link: "email",
  client_reminded: "email",
  drip: "email",
  payout: "email",
  commission_earned: "both",  // NEW — default to both for maximum engagement
};
```

**Notification routing after this change:**

| Event | Pref Key | Default |
|-------|----------|---------|
| Instant commission earned SMS/email | `commission_earned` | `"both"` |
| First-sale celebration | `commission_earned` | `"both"` |
| Milestone celebration | `commission_earned` | `"both"` |
| Monthly summary | `commission_earned` | `"both"` |
| Commission locked (45-day holdback) | `payout` | `"email"` |
| Payout processed | `payout` | `"email"` |

**No migration needed:** `notification_prefs` is a JSONB column. The new key is added via the `getPartnerPrefs()` spread which merges overrides with defaults. Existing partners with no override get the default `"both"`.

**NotificationSettings.tsx change:** Add a new toggle row for "Commission Alerts" between existing "Client Reminders" and "Payouts" rows. Label: "Commission Alerts — instant notifications when you earn". Options: Email / SMS / Both.

### SMS Message Builder Module

**New file:** `src/lib/partner-sms.ts`

Centralizes all partner SMS message construction. Single source of truth for all partner SMS copy.

**Exported functions:**

```typescript
/**
 * Builds the commission-earned SMS for a partner.
 * Handles first-sale detection, milestone detection, and progress computation.
 * Returns a string guaranteed to fit within 160 chars via capSMS().
 */
export function buildCommissionSMS(opts: {
  amountCents: number;
  tierName: string;
  totalReferrals: number;
  commissionTier: string;
  promoCode: string;
  holdbackDate: string;
}): string;

/**
 * Builds the monthly summary SMS for a partner.
 * Returns a string guaranteed to fit within 160 chars via capSMS().
 */
export function buildMonthlySummarySMS(opts: {
  monthName: string;
  monthEarningsCents: number;
  totalBalanceCents: number;
}): string;

/**
 * Checks if a referral count is a milestone.
 * Returns the milestone message if it is, null otherwise.
 */
export function getMilestoneMessage(totalReferrals: number): string | null;

/**
 * Builds the progress-to-next-tier string.
 * Returns "[3/5 to Silver — 15%]" or "[Gold Partner — 20%]" for max tier.
 */
export function buildTierProgress(totalReferrals: number, commissionTier: string): string;
```

**Internal logic of `buildCommissionSMS`:**

1. Format amount as dollars: `(amountCents / 100).toFixed(2)`
2. If `totalReferrals === 1`: return first-sale template with tierName, amount, promoCode
3. Check `getMilestoneMessage(totalReferrals)` — if non-null, use milestone as suffix
4. Otherwise, use `buildTierProgress()` as suffix
5. Compose full message: `"INAA: You earned ${amount} from a referral! Confirms ${holdbackDate}. ${suffix}"`
6. Pass through `capSMS()` and return

### Files Modified (Subsystem 2)

| File | Change Type | What Changes |
|------|-------------|--------------|
| `src/lib/partner-sms.ts` | Create | SMS message builders: buildCommissionSMS, buildMonthlySummarySMS, getMilestoneMessage, buildTierProgress |
| `src/app/api/webhooks/stripe/route.ts` | Modify | Replace inline SMS strings with `buildCommissionSMS()` calls in both referral-tracking paths (primary promo code path and metadata fallback path) |
| `src/lib/notification-prefs.ts` | Modify | Add `commission_earned: Channel` to `PartnerNotificationPrefs` interface and `PARTNER_DEFAULTS` |
| `src/components/partner/NotificationSettings.tsx` | Modify | Add "Commission Alerts" toggle row with email/sms/both options |
| `src/app/api/cron/partner-monthly-summary/route.ts` | Create | Monthly summary cron: query earning partners, send SMS and email summaries, cron-job.org registration |

---

## Subsystem 3: Partner Conversion Analytics

### What Exists

- `partner_analytics` RPC returns `{monthly: [{month, commission, count}], by_tier: [{tier, commission, count}], total_referrals: N}`
- `PartnerAnalytics.tsx` renders CSS bar chart for monthly earnings + table for by-tier breakdown
- Dashboard API at `/api/partner/dashboard` calls `partner_analytics` RPC and returns result alongside earnings, referrals, and payouts
- No top-of-funnel tracking. No data on link clicks, quiz starts, or quiz completions.

### 3.1 Conversion Funnel RPC

**Problem:** No way to measure partner effectiveness. A partner with 100 link clicks and 1 purchase versus a partner with 5 clicks and 3 purchases — currently invisible.

**Solution:** New RPC that queries `partner_events` table to return funnel metrics for two time windows.

**Full RPC SQL:**

```sql
CREATE OR REPLACE FUNCTION partner_conversion_funnel(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_30d jsonb;
  v_all jsonb;
BEGIN
  SELECT jsonb_build_object(
    'link_clicks', COUNT(*) FILTER (WHERE event_type = 'link_click'),
    'quiz_starts', COUNT(*) FILTER (WHERE event_type = 'quiz_start'),
    'quiz_completions', COUNT(*) FILTER (WHERE event_type = 'quiz_complete'),
    'purchases', COUNT(*) FILTER (WHERE event_type = 'purchase')
  ) INTO v_30d
  FROM partner_events
  WHERE partner_id = p_partner_id
    AND created_at > now() - interval '30 days';

  SELECT jsonb_build_object(
    'link_clicks', COUNT(*) FILTER (WHERE event_type = 'link_click'),
    'quiz_starts', COUNT(*) FILTER (WHERE event_type = 'quiz_start'),
    'quiz_completions', COUNT(*) FILTER (WHERE event_type = 'quiz_complete'),
    'purchases', COUNT(*) FILTER (WHERE event_type = 'purchase')
  ) INTO v_all
  FROM partner_events
  WHERE partner_id = p_partner_id;

  RETURN jsonb_build_object(
    'last_30_days', v_30d,
    'all_time', v_all
  );
END;
$$;

REVOKE ALL ON FUNCTION partner_conversion_funnel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_conversion_funnel(uuid) TO service_role;
```

**Return shape:**

```json
{
  "last_30_days": {
    "link_clicks": 42,
    "quiz_starts": 28,
    "quiz_completions": 15,
    "purchases": 3
  },
  "all_time": {
    "link_clicks": 180,
    "quiz_starts": 120,
    "quiz_completions": 65,
    "purchases": 12
  }
}
```

### 3.2 ConversionFunnel Dashboard Component

**New file:** `src/components/partner/ConversionFunnel.tsx`

**Props interface:**

```typescript
interface FunnelData {
  link_clicks: number;
  quiz_starts: number;
  quiz_completions: number;
  purchases: number;
}

interface ConversionFunnelProps {
  funnel: {
    last_30_days: FunnelData;
    all_time: FunnelData;
  };
}
```

**Visual design:** Four horizontal CSS bars stacked vertically, each bar width proportional to count relative to link_clicks (the widest). Same visual pattern as `PartnerAnalytics` monthly bar chart — amber bars on zinc-800 background, no chart library.

**Layout for each funnel step:**

```
Label (left) ───── [===== Bar =====] ──── Count (right)
                                          Drop-off % from previous step
```

**Four rows:**
1. "Link Clicks" — always 100% width (baseline)
2. "Quiz Starts" — width = (quiz_starts / link_clicks) * 100%
3. "Quiz Completed" — width = (quiz_completions / link_clicks) * 100%
4. "Purchases" — width = (purchases / link_clicks) * 100%

**Drop-off percentages:** Shown as small zinc-400 text below each count. Calculated as: `((previous_step - current_step) / previous_step * 100).toFixed(0)%` drop-off. First row (Link Clicks) shows no drop-off.

**Time window toggle:** Two buttons at top-right: "Last 30 Days" and "All Time". Client-side state toggle, no API call (both datasets already loaded). Default: "Last 30 Days".

**Empty state:** When all counts are zero: "Conversion data will appear here as defendants use your referral link."

**Accessibility:**
- Each bar uses `role="meter"` with `aria-valuenow`, `aria-valuemin={0}`, `aria-valuemax` (set to link_clicks for that time window)
- `aria-label` on each bar: "{Step name}: {count} ({percentage}% of link clicks)"
- Time window toggle buttons use `aria-pressed` for current selection

**Conversion rate callout:** Below the funnel, a summary line: "Conversion rate: {(purchases/link_clicks*100).toFixed(1)}%" in amber text. Shows "—" if link_clicks is zero to avoid division by zero.

### 3.3 Dashboard Integration

**Changes to `src/app/api/partner/dashboard/route.ts`:**

Add a call to `partner_conversion_funnel` RPC after the existing analytics call:

```typescript
const { data: funnel } = await supabase.rpc("partner_conversion_funnel", {
  p_partner_id: partner.id,
});
```

Add `funnel` to the response JSON:

```typescript
return NextResponse.json({
  partner: { /* existing fields */ },
  earnings: { /* existing fields */ },
  reminderSignups: reminderSignups ?? 0,
  courtClients: courtClients || [],
  checkInSummary,
  referrals: referrals || [],
  payouts: payouts || [],
  analytics: analytics || { monthly: [], by_tier: [], total_referrals: 0 },
  funnel: funnel || { last_30_days: { link_clicks: 0, quiz_starts: 0, quiz_completions: 0, purchases: 0 }, all_time: { link_clicks: 0, quiz_starts: 0, quiz_completions: 0, purchases: 0 } },
});
```

**Changes to `src/app/partner/dashboard/page.tsx`:**

1. Add `funnel` to component state with the same default shape as the API fallback
2. Set `funnel` from `data.funnel` in the `fetchDashboard` callback
3. Render `<ConversionFunnel funnel={funnel} />` between the `<PartnerAnalytics>` section and the "Recent Activity" section
4. Import `ConversionFunnel` from `@/components/partner/ConversionFunnel`

### Files Modified (Subsystem 3)

| File | Change Type | What Changes |
|------|-------------|--------------|
| Migration file | Create | `partner_conversion_funnel` RPC with REVOKE/GRANT |
| `src/components/partner/ConversionFunnel.tsx` | Create | Funnel visualization with 4 bars, time window toggle, conversion rate callout, empty state |
| `src/app/api/partner/dashboard/route.ts` | Modify | Call `partner_conversion_funnel` RPC, add `funnel` to response |
| `src/app/partner/dashboard/page.tsx` | Modify | Add funnel state, render ConversionFunnel component between Analytics and Recent Activity |

---

## Cross-Cutting: Single Migration

**File:** `supabase/migrations/20260414a_partner_growth_upgrades.sql`

All DB changes in one migration file, applied via `scripts/apply-pending-sql.mjs` using Supabase Management API.

**Migration contents in order:**

1. Create `partner_events` table:
   ```sql
   CREATE TABLE IF NOT EXISTS partner_events (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     partner_id uuid NOT NULL REFERENCES partners(id),
     event_type text NOT NULL,
     metadata jsonb DEFAULT '{}',
     created_at timestamptz DEFAULT now()
   );
   ```

2. Create index on `partner_events`:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_partner_events_funnel
     ON partner_events(partner_id, event_type, created_at);
   ```

3. Add `city` column to `partners`:
   ```sql
   ALTER TABLE partners ADD COLUMN IF NOT EXISTS city text;
   ```

4. Create `partner_conversion_funnel` RPC (full SQL as shown in Section 3.1)

5. Permissions:
   ```sql
   REVOKE ALL ON FUNCTION partner_conversion_funnel(uuid) FROM PUBLIC;
   GRANT EXECUTE ON FUNCTION partner_conversion_funnel(uuid) TO service_role;
   ```

6. RLS on `partner_events` (same pattern as other partner tables):
   ```sql
   ALTER TABLE partner_events ENABLE ROW LEVEL SECURITY;
   -- No public policies — accessed only via service_role (admin client)
   ```

---

## Invariants

1. **No PII in partner_events** — No customer names, emails, phone numbers, or case details. Only partner_id, event_type, and metadata containing tier slugs and amounts.
2. **All event tracking is fire-and-forget** — Event INSERTs are never awaited. They run as detached promises. Failures log warnings but never block page renders or webhook responses.
3. **SMS respects notification prefs** — Every SMS send checks `shouldSendSMS()` on the relevant pref key and verifies partner phone is non-null before sending.
4. **UPL clean** — No SMS or page copy provides legal advice. All messaging describes the service as research and questions, not legal counsel.
5. **Existing tests unbroken** — All changes are additive. No modified function signatures, no removed columns, no changed RPC return shapes.
6. **Single SMS segment** — All partner SMS messages are passed through `capSMS()` to guarantee they fit within 160 characters.
7. **Cron idempotency** — Monthly summary cron uses `acquireCronLock()` to prevent double-execution within 23 hours.

---

## Out of Scope

- **PayPal Payouts API** — Deferred until sales volume justifies a PayPal Business account. Payouts remain manual for now.
- **Physical bail packet cards** — Marketing and fulfillment decision outside the scope of this code spec.
- **Escalating commission rates within tiers** — Current 10%/15%/20% structure is validated by expert research and does not change.
- **Partner public profile pages** — The `/r/[code]` bridge page IS the partner's public page. A separate profile page is unnecessary.
- **Recurring/residual commissions** — LegalShield-style model requires subscription products which are not part of the current tier structure.
- **Stripe Connect automated splits** — Requires partner Stripe onboarding (identity verification), which creates too much friction for low-tech bondsmen. Deferred indefinitely.

---

## Summary of All New and Modified Files

### New Files (5)

| File | Purpose |
|------|---------|
| `supabase/migrations/20260414a_partner_growth_upgrades.sql` | Migration: partner_events table, city column, conversion_funnel RPC |
| `src/lib/partner-sms.ts` | SMS message builders for commission earned, monthly summary, milestones, tier progress |
| `src/app/api/cron/partner-monthly-summary/route.ts` | Monthly earning summary cron (1st of each month) |
| `src/app/api/partner/track-event/route.ts` | Lightweight POST endpoint for client-side event tracking (quiz_complete) |
| `src/components/partner/ConversionFunnel.tsx` | Funnel visualization component (link clicks through purchases) |

### Modified Files (10)

| File | Subsystem | What Changes |
|------|-----------|--------------|
| `src/app/r/[code]/page.tsx` | S1 | Dynamic OG meta tags; link_click event INSERT; shared partner query helper |
| `src/app/r/[code]/quiz/page.tsx` | S1 | quiz_start event INSERT on server component render |
| `src/components/ReferralQuiz.tsx` | S1 | Fire quiz_complete event via fetch to /api/partner/track-event when recommendation renders |
| `src/components/BridgePage.tsx` | S1 | Accept optional city prop; update displayName logic for city |
| `src/components/partner/PartnerApplicationForm.tsx` | S1 | Add optional city text input field |
| `src/app/api/webhooks/stripe/route.ts` | S1+S2 | Purchase event INSERT; replace inline SMS with buildCommissionSMS() |
| `src/lib/notification-prefs.ts` | S2 | Add commission_earned to PartnerNotificationPrefs and PARTNER_DEFAULTS |
| `src/components/partner/NotificationSettings.tsx` | S2 | Add Commission Alerts toggle row |
| `src/app/api/partner/dashboard/route.ts` | S3 | Call partner_conversion_funnel RPC; add funnel to response |
| `src/app/partner/dashboard/page.tsx` | S3 | Add funnel state; render ConversionFunnel component |
