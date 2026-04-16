# Bird SMS + Notification Preference System, Design Spec

**Date:** 2026-04-13
**Scope:** Replace Twilio with Bird API, add phone collection, per-notification-type channel preferences for both clients and bondsmen, bondsman client-reminded alerts, commission/payout notifications.
**Approach:** JSONB overrides with application-level defaults (Approach C from brainstorm).
**Expert basis:** Wroblewski (gradual engagement for phone collection), Fogg (B=MAP for crisis forms), Covello (mental noise, keep forms lean), Prussakov (45-day holdback, commission locking), Laja (optional phone kills 37% abandonment).

---

## Architecture Overview

Four phases, each ships independently:

1. **Foundation**, Bird API utility, DB schema (phone, notification_prefs, locked_at), 10DLC prep
2. **Client SMS**, Phone collection on prep page, cron sends SMS, client magic link SMS, check-in SMS
3. **Bondsman SMS**, "Client reminded" alerts, notification settings on dashboard, payout notifications
4. **Payout infrastructure**, locked_at cron, payout query, admin payout page, payout notification emails/SMS

---

## Phase 1: Foundation

### 1A. Bird API Utility

Replace `src/lib/twilio.ts` → `src/lib/sms.ts`.

Same interface: `sendSMS(to: string, body: string): Promise<{ success: boolean; error?: string }>`.

Bird API call:
```
POST https://api.bird.com/workspaces/{workspaceId}/channels/{channelId}/messages
Authorization: AccessKey {BIRD_API_KEY}
Content-Type: application/json

{
  "receiver": { "contacts": [{ "identifierValue": "+1XXXXXXXXXX" }] },
  "body": { "type": "text", "text": { "text": "message body" } }
}
```

Env vars:
- `BIRD_API_KEY`, API access key
- `BIRD_WORKSPACE_ID`, workspace identifier
- `BIRD_CHANNEL_ID`, SMS channel identifier

Graceful degradation: if env vars missing, log warning, return `{ success: false, error: "SMS not configured" }`. Same pattern as current Twilio.

Update import in `src/app/api/partner/magic-link/route.ts`: `@/lib/twilio` → `@/lib/sms`.

Delete `src/lib/twilio.ts` after swap.

### 1B. DB Migration

```sql
, Add phone to court_reminders (client phone, optional)
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS phone text;

, Add notification_prefs to court_reminders (client prefs, JSONB overrides)
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS notification_prefs jsonb DEFAULT NULL;

, Add notification_prefs to partners (bondsman prefs, JSONB overrides)
ALTER TABLE partners ADD COLUMN IF NOT EXISTS notification_prefs jsonb DEFAULT NULL;

, Add sms_consent_at to court_reminders (10DLC compliance timestamp)
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS sms_consent_at timestamptz;

, Add locked_at to referrals (45-day holdback for payouts)
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS locked_at timestamptz;
```

### 1C. Notification Preference Types + Defaults

```typescript
// src/lib/notification-prefs.ts

type Channel = "email" | "sms" | "both";

// Client notification types
interface ClientNotificationPrefs {
  court_reminders: Channel;    // 14d/7d/3d/1d reminders
  magic_link: Channel;         // login link delivery
  check_in: Channel;           // check-in confirmations
  post_court: Channel;         // post-court follow-up
}

// Bondsman notification types
interface PartnerNotificationPrefs {
  magic_link: Channel;         // login link delivery
  client_reminded: Channel;    // "We reminded Marcus of his court date"
  drip: Channel;               // onboarding/tips sequence
  payout: Channel;             // sale earned, commission confirmed, payout sent
}

const CLIENT_DEFAULTS: ClientNotificationPrefs = {
  court_reminders: "email",
  magic_link: "email",
  check_in: "email",
  post_court: "email",
};

const PARTNER_DEFAULTS: PartnerNotificationPrefs = {
  magic_link: "email",
  client_reminded: "email",
  drip: "email",
  payout: "email",
};

// Merge overrides with defaults
function getClientPrefs(overrides: Partial<ClientNotificationPrefs> | null): ClientNotificationPrefs {
  return { ...CLIENT_DEFAULTS, ...overrides };
}

function getPartnerPrefs(overrides: Partial<PartnerNotificationPrefs> | null): PartnerNotificationPrefs {
  return { ...PARTNER_DEFAULTS, ...overrides };
}

// When client adds phone, auto-upgrade court_reminders to "both"
function autoUpgradeOnPhone(current: Partial<ClientNotificationPrefs> | null): Partial<ClientNotificationPrefs> {
  const merged = { ...current };
  if (!merged.court_reminders || merged.court_reminders === "email") {
    merged.court_reminders = "both";
  }
  return merged;
}

// Helper: should we send via this channel for this notification type?
function shouldSendEmail(pref: Channel): boolean {
  return pref === "email" || pref === "both";
}

function shouldSendSMS(pref: Channel): boolean {
  return pref === "sms" || pref === "both";
}
```

### 1D. 10DLC Registration

External task (Rahim): Register with Bird for 10DLC compliance.
- ~$15 one-time registration fee
- Brand registration + campaign registration
- Required before sending SMS to US numbers
- Consent language (26 words, Covello-compliant):
  > "I agree to receive court date reminder texts from ImNotAnAttorney. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out."

---

## Phase 2: Client SMS

### 2A. Phone Collection on Prep Page (Post-Submit)

Per Wroblewski's gradual engagement: client fills out the existing 5-field court reminder form → lands on prep page → prep page shows a phone collection prompt.

Location: `src/app/prep/[token]/page.tsx`, new section after insider tips, before data-driven sections.

UI: Single phone input + consent checkbox + "Get Text Reminders" button.
- Input: `tel` type, placeholder "(555) 123-4567"
- Checkbox (unchecked by default): 26-word 10DLC consent text
- Button: "Get Text Reminders"
- On submit: `PATCH /api/court-reminders/[token]/phone`, saves phone, sets sms_consent_at, auto-upgrades notification_prefs.court_reminders to "both"
- Success state: checkmark + "You'll get text reminders before your court date."

New API route: `src/app/api/court-reminders/[token]/phone/route.ts`
- PATCH: validates phone (E.164 format), updates court_reminders row, sets sms_consent_at
- No auth beyond token (same as prep page access)

### 2B. Court Reminder Cron SMS

Update `src/app/api/cron/court-reminders/route.ts`:
- After building email, check `getClientPrefs(r.notification_prefs)`
- If `shouldSendEmail(prefs.court_reminders)` → send email (existing)
- If `shouldSendSMS(prefs.court_reminders)` AND `r.phone` → send SMS
- SMS content: short, no HTML. Example for 7d:
  > "[FirstName], your court date is in 7 days ([date]). Prep page: [url]., ImNotAnAttorney"
- Same for indemnitor: if indemnitor has phone (future), send SMS too. For now, indemnitor stays email-only.

### 2C. Client Magic Link SMS

Update `src/app/api/customer/magic-link/route.ts`:
- Look up customer's notification_prefs from their most recent court_reminders row (or cases row)
- If shouldSendSMS(prefs.magic_link) AND phone on file → send SMS with magic link
- SMS: "ImNotAnAttorney login: [url], expires in 15 min."

### 2D. Check-In Confirmation SMS

Update `src/app/api/check-in/route.ts`:
- After successful check-in, check notification_prefs
- If shouldSendSMS(prefs.check_in) AND phone on file → send confirmation SMS
- SMS: "Check-in confirmed for [date]. Next check-in available in 12 hours."

### 2E. Client Notification Settings

Add to prep page: small "Notification settings" link/section.
- Shows current preference per notification type
- Toggle between email / sms / both for each
- **SAFETY RULE: `court_reminders` restricted to "email" or "both", never "sms" alone.** If phone is dead at 3AM, email is the fallback. This keeps people out of jail. UI does not offer "SMS only" for court reminders. API validates and rejects `court_reminders: "sms"`.
- PATCH `/api/court-reminders/[token]/prefs` to save

Keep it minimal. Most clients won't touch this, defaults handle 95% of cases.

---

## Phase 3: Bondsman SMS

### 3A. "Client Reminded" Alerts

New notification path in court reminders cron:
- After sending client their reminder, check if `partner_promo_code` exists
- Look up partner → check `getPartnerPrefs(partner.notification_prefs).client_reminded`
- If email: send email "We reminded [FirstName] about their court date on [date]"
- If SMS: send text "INAA: Reminded [FirstName] [LastName] about court on [date]."
- If both: send both

### 3B. Bondsman Notification Settings

New section on partner dashboard (`src/app/partner/dashboard/page.tsx`):
- "Notification Preferences" card/section
- Grid: 4 notification types × 3 channel options (email / sms / both)
- Each row: label + 3-button toggle (email / sms / both)
- Save via PATCH `/api/partner/notification-prefs`
- New route: `src/app/api/partner/notification-prefs/route.ts`, requires partner auth, validates prefs shape, updates partners.notification_prefs

### 3C. Bondsman Phone Collection

Partners table already has `phone` column. If phone not on file, show a prompt on the dashboard:
- "Add your phone number to get text notifications"
- Same 10DLC consent pattern as client side
- PATCH `/api/partner/profile` to save phone + sms_consent

### 3D. Partner Magic Link, Already Works

`src/app/api/partner/magic-link/route.ts` already sends SMS when `partner.phone` exists. Just update:
- Read `getPartnerPrefs(partner.notification_prefs).magic_link`
- Route accordingly (email / sms / both)
- Change import from `@/lib/twilio` to `@/lib/sms`

### 3E. Partner Drip Sequence

Update `src/app/api/cron/partner-drip/route.ts`:
- Read partner notification_prefs.drip
- Send via preferred channel(s)
- SMS versions of drip emails: shortened, link-heavy, under 160 chars each

### 3F. Commission/Payout Notifications

Four touchpoints (Prussakov framework):

1. **Sale earned (immediate):** Triggered in Stripe webhook when partner-attributed sale completes. "You earned $[amount] from a new referral. Status: Pending (confirms [date+45d])."
2. **Commission confirmed (after 45d):** Triggered by daily locking cron. "Your $[amount] commission is confirmed. Included in next monthly payout."
3. **Payout pending (3 days before 1st):** Triggered by monthly cron. "Your [month] payout of $[total] processes on [date] via [method]."
4. **Payout sent (on payout day):** Triggered by admin marking payout complete. "We sent $[total] to your [Zelle/Venmo/etc]."

All four respect `getPartnerPrefs(partner.notification_prefs).payout` channel preference.

---

## Phase 4: Payout Infrastructure

### 4A. Commission Locking Cron

New cron route: `src/app/api/cron/lock-commissions/route.ts`
- Runs daily via cron-job.org
- Query: referrals WHERE locked_at IS NULL AND created_at < now() - 45 days AND commission_amount > 0 (refunded orders have commission zeroed by webhook RPC)
- Set locked_at = now()
- For each newly locked referral, send "commission confirmed" notification per partner's payout pref

### 4B. Monthly Payout Query

Admin page or script that runs on the 1st:
- Sum locked, unpaid commissions per partner WHERE amount >= $10
- Generate payout report
- Rahim manually sends payments
- Mark as paid (creates partner_payouts row)

### 4C. Admin Payout Page

`src/app/admin/payouts/page.tsx`:
- Table: partner name, payment method, amount due, last payout date
- "Mark Paid" button per partner
- Creates partner_payouts row, sends "payout sent" notification

### 4D. Partner Dashboard, Earnings Clarity

Update `EarningsSection` to show three states:
- **Pending**, sale recorded, in 45-day holdback
- **Confirmed**, holdback passed, eligible for next payout
- **Paid**, completed payouts

---

## Files Modified/Created (All Phases)

### New Files
- `src/lib/sms.ts`, Bird API sendSMS utility
- `src/lib/notification-prefs.ts`, types, defaults, merge logic, channel helpers
- `src/app/api/court-reminders/[token]/phone/route.ts`, client phone collection
- `src/app/api/court-reminders/[token]/prefs/route.ts`, client notification prefs
- `src/app/api/partner/notification-prefs/route.ts`, bondsman notification prefs
- `src/app/api/cron/lock-commissions/route.ts`, daily commission locking
- `src/app/admin/payouts/page.tsx`, admin payout management
- `supabase/migrations/20260414a_sms_notification_prefs.sql`, Phase 1 migration

### Modified Files
- `src/lib/twilio.ts`, DELETE after Phase 1
- `src/app/api/partner/magic-link/route.ts`, import swap, read prefs
- `src/app/api/customer/magic-link/route.ts`, add SMS path
- `src/app/api/cron/court-reminders/route.ts`, SMS path, bondsman alerts
- `src/app/api/cron/partner-drip/route.ts`, SMS path
- `src/app/api/check-in/route.ts`, SMS confirmation
- `src/app/api/webhooks/stripe/route.ts`, "sale earned" notification
- `src/app/prep/[token]/page.tsx`, phone collection section
- `src/app/partner/dashboard/page.tsx`, notification settings section
- `src/lib/court-reminders.ts`, phone + notification_prefs on interface
- `src/components/partner/AddClientModal.tsx`, phone field (secondary flow)
- `src/app/api/partner/add-client/route.ts`, accept phone
- `supabase/SCHEMA.md`, document new columns
- `ARCHITECTURE.md`, document SMS + notification system

### Env Vars (Vercel + .env.local)
- `BIRD_API_KEY`, Bird API access key
- `BIRD_WORKSPACE_ID`, Bird workspace ID
- `BIRD_CHANNEL_ID`, Bird SMS channel ID
- Remove: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

---

## 10DLC Compliance Checklist

- [ ] Register brand with Bird (company name, EIN, address)
- [ ] Register SMS campaign (court date reminders, transactional)
- [ ] Consent language on all phone collection points (26 words)
- [ ] Unchecked checkbox by default
- [ ] STOP/HELP handling (Bird handles automatically)
- [ ] sms_consent_at timestamp stored per opt-in
- [ ] Opt-in records retained 6+ years

---

## Cascade Analysis

| Node | Win |
|------|---, |
| **Defendant** | Text reminders at 2AM when they can't sleep. Shows up to court. Keeps freedom. |
| **Bondsman** | Knows client was reminded without lifting a finger. Bond stays intact. Payout notifications = transparency. |
| **Indemnitor** | Gets copy of reminder (email for now). Drags defendant to court. |
| **Court system** | Higher appearance rates, fewer bench warrants to serve. |
| **INAA** | SMS = higher engagement than email (8x response rate). Warm lead channel for paid tiers. Trust touchpoint. |
| **Future-us** | SMS infrastructure established. Reusable for paid tier delivery, case updates, new products. |
| **Bird** | New customer. Volume grows with INAA. |

---

## Testing Strategy

- Unit tests: notification-prefs.ts (merge logic, auto-upgrade, shouldSend helpers)
- Integration tests: court-reminders cron with SMS path (mock sendSMS)
- E2E: phone collection on prep page → verify DB row updated → cron sends SMS
- Manual QA: use test partner (e2e-test@imnotanattorney.com) + Bird test mode
