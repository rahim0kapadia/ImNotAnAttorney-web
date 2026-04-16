# Scheduled Client Check-In System, Design Spec

Date: 2026-04-14
Status: Reviewed (3 review rounds complete)

## Problem

Bail bondsmen need clients to check in on specific days (e.g., Monday/Friday) for surety insurance compliance. Our system has check-in infrastructure (button, API, table, compliance report) but no scheduled cadence, no outbound prompts, no missed-check-in alerts, no configurable schedule. Bondsmen currently do this manually via text message.

## Solution

Configurable check-in schedules set by clients at signup (or by bondsmen via dashboard), daily cron-driven prompts on scheduled days, next-morning missed-check-in batch alerts to bondsmen, and compliance rate tracking for surety audits.

## Data Model Changes

### `court_reminders` (existing table, add columns)

| Column | Type | Default | Description |
|------, |------|---------|-------------|
| `check_in_days` | `text[]` | `null` | Scheduled days, e.g., `["mon","fri"]`. Null = not yet configured. |
| `check_in_source` | `text` | `null` | Who set the schedule: `"client"`, `"partner"`, or `"default"`. CHECK constraint enforced. |
| `check_in_prompts_sent` | `text[]` | `'{}'` | ISO date strings of days prompts were sent (e.g., `["2026-04-14"]`). Prevents double-send on crash/retry. |
| `check_in_schedule_notified_at` | `timestamptz` | `null` | When bondsman was first notified about missing schedule ("I don't know" flow). |
| `check_in_schedule_followup_sent` | `boolean` | `false` | Whether the 48-hour follow-up was sent. |

### `partners` (existing table, add column)

| Column | Type | Default | Description |
|------, |------|---------|-------------|
| `default_check_in_days` | `text[]` | `null` | Bondsman's default schedule for new clients. |

### `notification_prefs` (existing JSONB on `partners`)

New key: `missed_check_in`, values: `"email"` | `"sms"` | `"both"`. Default: `"email"`.

**TypeScript touch points (all required):**
1. `src/lib/notification-prefs.ts`, add `missed_check_in: Channel` to `PartnerNotificationPrefs` interface
2. `src/lib/notification-prefs.ts`, add `missed_check_in: "email"` to `PARTNER_DEFAULTS`
3. `src/components/partner/NotificationSettings.tsx`, add `missed_check_in: "Missed check-in alerts"` to `LABELS` map

### Client notification prefs

The existing `check_in` key in `ClientNotificationPrefs` is repurposed for scheduled check-in prompts. This is its intended semantic, "how should check-in-related notifications be delivered." No new key needed.

### No new tables.

### Migration

File: `supabase/migrations/20260415a_scheduled_check_in_system.sql`

```sql
, Court reminders: check-in schedule columns
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS check_in_days text[];
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS check_in_source text;
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS check_in_prompts_sent text[] DEFAULT '{}';
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS check_in_schedule_notified_at timestamptz;
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS check_in_schedule_followup_sent boolean DEFAULT false;

ALTER TABLE court_reminders ADD CONSTRAINT chk_check_in_source
  CHECK (check_in_source IS NULL OR check_in_source IN ('client', 'partner', 'default'));

, Partners: default check-in days
ALTER TABLE partners ADD COLUMN IF NOT EXISTS default_check_in_days text[];

, Indexes for cron queries
CREATE INDEX IF NOT EXISTS idx_court_reminders_check_in_days
  ON court_reminders USING GIN (check_in_days);

CREATE INDEX IF NOT EXISTS idx_check_ins_reminder_date
  ON client_check_ins (court_reminder_id, checked_in_at DESC);

, Partner promo code index for missed-check-in grouping
CREATE INDEX IF NOT EXISTS idx_court_reminders_partner_promo
  ON court_reminders (partner_promo_code) WHERE partner_promo_code IS NOT NULL;
```

## Flows

### 1. Client Signup (via `/r/[code]/reminders`)

Existing fields unchanged (name, email, court date, charge, state).

New field after court date: "What days does your bondsman want you to check in?" Multi-select checkboxes for Mon-Sun, plus an "I don't know" option.

**Input validation:** `check_in_days` values validated against allowlist `["mon","tue","wed","thu","fri","sat","sun"]` on both signup and dashboard override. Invalid values rejected with 400.

**Files to modify:**
- `src/components/CourtReminderForm.tsx`, add multi-select UI (only renders when `partnerPromoCode` prop is non-null). Note: `partnerPromoCode` prop is currently typed as `string`, change to `string | null` to support the conditional.
- `src/app/api/court-reminders/route.ts`, add `check_in_days` to `CreateBody` interface, validate, include in insert payload

**Resolution logic (precedence):**
- **Client picks days** → `check_in_days = ["mon","fri"]`, `check_in_source = "client"`.
- **"I don't know" AND partner has `default_check_in_days` set** → auto-apply default, `check_in_source = "default"`. No bondsman notification needed.
- **"I don't know" AND partner has NO default** → `check_in_days = null`, `check_in_source = null` → triggers bondsman fallback notification.

### 2. Bondsman Fallback Notification

Fires immediately when client selects "I don't know" AND partner has no `default_check_in_days`.

Sets `check_in_schedule_notified_at = now()` on the `court_reminders` row.

Message to bondsman (per their `missed_check_in` notification pref, same key used for all check-in-related partner alerts):
> "[Client first name] signed up for court reminders but doesn't know their check-in schedule. Set it here: [dashboard link]"

**48-hour follow-up** (handled by check-in prompt cron):
- Cron checks rows where `check_in_days IS NULL AND check_in_schedule_notified_at IS NOT NULL AND check_in_schedule_followup_sent = false AND now() - check_in_schedule_notified_at > interval '48 hours'`.
- Sends follow-up, sets `check_in_schedule_followup_sent = true`.

**7-day stop:** After 7 days (`now() - check_in_schedule_notified_at > interval '7 days'`), no more follow-ups. Client still gets court date reminders (14d/7d/3d/1d), just no check-in prompts.

**Dashboard indicator:** Clients with `check_in_days = null` show a "Schedule needed" badge in the client tracker so bondsmen can self-serve after the 7-day notification window.

### 3. Daily Check-In Prompt Cron

**SMS subject override:** `sendSMS()` currently hardcodes `subject: "Court Reminder"`. Add optional `subject` parameter to `sendSMS()`. Use `"Check-In Reminder"` for client prompts, `"Missed Check-In Alert"` for partner alerts. Keeps `sms_log` audit trail clean.

**Schedule override write path:** Per-client schedule changes from the dashboard save via `PATCH /api/partner/clients/[id]/schedule`, new route, validates `check_in_days` against allowlist, sets `check_in_source = "partner"`, triggers one-time confirmation to client (see Section 5).

**Route:** `GET /api/cron/check-in-prompt`
**Schedule:** Daily, 8am ET (`0 12 * * *` UTC, adjusts for DST).
**Lock key:** `"check-in-prompt"` via `acquireCronLock()`, 23-hour idempotency window.
**Registration:** cron-job.org via API (`PUT https://api.cron-job.org/jobs`).

**Timezone rule:** All day-of-week AND date calculations use `America/New_York` timezone. Two distinct variables, never confuse them:
```typescript
// todayDow = 3-letter day-of-week string for check_in_days array matching
const todayDow = new Date().toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' }).toLowerCase().slice(0, 3);
// todayDate = ISO date string for court_date comparison and idempotency tracking
const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // "2026-04-15"
```

Logic:
1. Query all active `court_reminders` where `check_in_days @> ARRAY[todayDow]` AND `court_date > todayDate` AND `todayDate NOT = ANY(check_in_prompts_sent)`. Paginate with Range headers (PAGE_SIZE=500, not `.limit()`).
2. For each, send SMS/email per client `check_in` notification prefs.
3. After successful send, atomically append date: `UPDATE court_reminders SET check_in_prompts_sent = array_append(check_in_prompts_sent, $todayDate) WHERE id = $id AND NOT ($todayDate = ANY(check_in_prompts_sent))`. The `NOT ANY` guard prevents duplicates even under fail-open race conditions.

**Idempotency:** The `check_in_prompts_sent` array + atomic Postgres `array_append` with `NOT ANY` guard prevents re-sending if cron crashes mid-batch and retries. Each client is only prompted once per calendar day.

**SMS category:** `"check_in_prompt"` in `SmsLogContext`.

SMS template (must fit 160 chars):
> `[Name], [Company] requests your check-in today: imnotanattorney.com/prep/[token], Do not reply to this text`

Email subject: "Check-in reminder from [Company]"
Email body: Same message with styled CTA button linking to prep page.

**Phone/SMS:** Clients without phone or `sms_consent_at` receive email only. The existing `PhoneOptIn` component on the prep page handles phone collection post-signup. SMS check-in prompts only fire once `canSendClientSMS()` returns true.

Client lands on prep page → `CheckInButton` (existing) → `POST /api/check-in` (existing) → `client_check_ins` row inserted.

### 4. Missed Check-In Alert Cron

**Route:** Same `GET /api/cron/check-in-prompt` handler, second phase.
**Lock key:** `"check-in-missed-alert"` via separate `acquireCronLock()`, 23-hour idempotency window.
**Two lock keys in one handler = independent failure/retry per phase.**

Logic:
1. Compute `yesterdayDow` and `yesterdayDate` (ET timezone, same `America/New_York` pattern as Section 3). Also compute `todayDate`.
2. Query all active `court_reminders` where `check_in_days @> ARRAY[yesterdayDow]` AND `court_date > todayDate`. Paginate with Range headers.
3. Collect all `court_reminder_id` values into an array.
4. **Single batch query:** Time boundaries are ET midnight → UTC: `yesterdayStart` = midnight ET of `yesterdayDate` converted to UTC, `todayStart` = midnight ET of `todayDate` converted to UTC. Query: `SELECT court_reminder_id FROM client_check_ins WHERE court_reminder_id = ANY($ids) AND checked_in_at >= $yesterdayStart AND checked_in_at < $todayStart`. Build a `Set` of IDs that checked in. (ET anchoring prevents false "missed" alerts for clients who checked in at 11:50pm ET.)
5. Filter to misses (IDs NOT in the Set). Group by `partner_promo_code`.
6. For each partner, send one summary (per their `missed_check_in` notification pref).

**SMS category:** `"missed_check_in_alert"` in `SmsLogContext`.

SMS template:
> `[N] client(s) missed check-in yesterday: [first names]. Details: [dashboard link], Do not reply`

Email: Same content, styled, with direct links to each client in the tracker.

### 5. Dashboard Additions

**Partner settings section:**
- "Default check-in days", multi-select Mon-Sun. Applies to new clients who select "I don't know."
- Saved to `partners.default_check_in_days`.

**Client tracker:**
- Per-client check-in day override, edit icon next to each client row, opens day picker.
- Status indicator per client: green (checked in today), red (missed scheduled check-in), gray (not scheduled today), amber "Schedule needed" badge (no schedule configured).
- `check_in_days` and `check_in_source` must be included in the dashboard API response.

**Files to modify:**
- `src/app/api/partner/dashboard/route.ts`, add `check_in_days, check_in_source` to courtClients SELECT
- `src/app/partner/dashboard/page.tsx`, render status indicators + schedule override UI

**Notification settings:**
- New toggle: "Missed check-in alerts", email / SMS / both. (Covered by TypeScript touch points in Data Model section.)

**Confirmation to client:** When bondsman sets schedule (from null → value), send one-time email/SMS to client: "Your bondsman has set up check-in reminders for you on [days]. You'll receive a reminder each scheduled day, tap the link to check in."

### 6. Compliance Report Enhancement

**New column: "Compliance Rate"**
- Formula: `checked_in_count / scheduled_check_in_count` per client.
- `scheduled_check_in_count` = number of days between signup and today (or court date, whichever is earlier) where day-of-week was in CURRENT `check_in_days`.
- Display: "23 / 28 (82%)" format.
- **Schedule change note:** Compliance is calculated against the CURRENT schedule applied retroactively. This is a simplification, no historical schedule audit trail is maintained. If a bondsman changes Mon/Fri to Tue/Thu, the compliance rate recalculates against the new schedule. This is acceptable because (a) schedule changes are rare, (b) the bondsman knows what they changed, and (c) historical precision adds significant complexity for minimal surety audit value.

**New column: "Schedule"**
- Shows check-in days (e.g., "Mon, Fri") and source ("set by client" / "set by bondsman" / "default").

**Bonus check-ins:** Check-ins on non-scheduled days are included in raw check-in count (existing column) but NOT counted toward the compliance rate denominator or numerator. No separate "bonus" display, the raw count column already captures them.

**Files to modify:**
- `src/app/partner/compliance-report/page.tsx`, add `check_in_days, check_in_source` to SELECT
- `src/app/partner/compliance-report/ComplianceReportClient.tsx`, add `check_in_days` and `check_in_source` to `ComplianceClient` interface, add compliance rate calculation helper, add Schedule column

**Existing columns unchanged.** Raw check-in counts remain for backward compatibility.

Print-friendly: compliance rate and schedule columns included in print stylesheet.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No bondsman (direct signup, no `partner_promo_code`) | Check-in schedule question not shown. No prompts sent. Feature is partner-only. |
| "I don't know" + partner has default | Auto-apply default, `check_in_source = "default"`. No bondsman notification. |
| "I don't know" + no partner default | Null schedule, notify bondsman, 48hr follow-up, stop after 7 days. |
| Bondsman never sets schedule | "Schedule needed" badge in dashboard. Client gets court reminders only. |
| Court date passes | Check-in prompts stop. Cron filters `court_date > today`. |
| Check-in on non-scheduled day | Allowed. Button always works. Counts in raw total, not compliance rate. |
| Multiple check-ins same day | 12-hour cooldown enforced by existing `/api/check-in`. First counts for compliance. |
| Bondsman changes schedule mid-stream | Applies going forward. Compliance rate recalculates against current schedule (see Section 6 note). |
| Client unsubscribes | Check-in prompts stop (existing `status = "active"` filter). Bondsman sees "unsubscribed" in tracker. |
| Cron crashes mid-batch | `check_in_prompts_sent` array prevents re-send on retry. Each client deduped by date. |
| Client has no phone | Email-only prompts. `PhoneOptIn` on prep page handles phone collection. |

## SMS Rules

- All client-facing SMS include "Do not reply to this text", text.email gateway is one-way.
- All SMS pass through `capSMS()` (160-char limit).
- All SMS gated on `canSendClientSMS()` (phone + consent).
- All bondsman SMS gated on partner notification prefs.
- UPL: use "requests" not "needs", avoids implying legal enforcement authority.
- SMS log categories: `"check_in_prompt"` for client nudges, `"missed_check_in_alert"` for partner alerts.

## Auth & Middleware

- `/api/cron/check-in-prompt`, already covered by `/api/cron/*` middleware (requires `CRON_AUTH_TOKEN` Bearer header). No additional whitelist needed.
- Dashboard endpoints (`/api/partner/*`), already cookie-gated by partner session middleware. No additional auth needed.
- Validation: `check_in_days` values validated against `["mon","tue","wed","thu","fri","sat","sun"]` allowlist on all write paths.

## What This Reuses

| Existing Infrastructure | How It's Used |
|------------------------|---------------|
| `client_check_ins` table | Check-in storage (no changes) |
| `CheckInButton` component | Client check-in UI on prep page (no changes) |
| `/api/check-in` route | Check-in API with 12-hour cooldown (no changes) |
| `sms.ts` + text.email gateway | SMS delivery (no changes) |
| `notification-prefs.ts` | Channel routing for both client and partner (add `missed_check_in` key) |
| `email.ts` + Resend | Email delivery (no changes) |
| Court reminders cron pattern | Same cron-job.org + `acquireCronLock()` pattern |
| Compliance report | Extend with compliance rate + schedule columns |
| Partner dashboard | Extend settings + client tracker |
| `PhoneOptIn` component | Phone collection on prep page (no changes) |

## What This Does NOT Build

- No new tables
- No new auth system
- No new SMS provider
- No inbound SMS handling
- No real-time push notifications
- No mobile app
- No historical schedule audit trail (compliance uses current schedule retroactively)
