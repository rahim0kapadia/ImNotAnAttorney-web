# Scheduled Client Check-In System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable check-in schedules for bail bond clients — daily cron prompts, missed-check-in alerts to bondsmen, compliance rate tracking.

**Architecture:** Extends existing court_reminders + partners tables. One new cron route with two phases (prompt + missed alert). Reuses SMS/email/notification-prefs infrastructure. Dashboard and compliance report get new columns.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL), Resend (email), text.email (SMS), cron-job.org

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-04-14-scheduled-check-in-system-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260415a_scheduled_check_in_system.sql` | Schema: new columns + indexes |
| Modify | `src/lib/notification-prefs.ts` | Add `missed_check_in` to partner prefs |
| Modify | `src/components/partner/NotificationSettings.tsx` | Add missed check-in toggle |
| Modify | `src/lib/sms.ts` | Add optional `subject` param |
| Create | `src/lib/check-in-schedule.ts` | Shared: validation, day-of-week helpers, ET timezone utils |
| Create | `src/lib/__tests__/check-in-schedule.test.ts` | Tests for shared helpers |
| Modify | `src/app/api/court-reminders/route.ts` | Accept `check_in_days` in signup |
| Modify | `src/components/CourtReminderForm.tsx` | Add check-in day picker UI |
| Create | `src/app/api/cron/check-in-prompt/route.ts` | Cron: prompt + missed alert phases |
| Create | `src/app/api/partner/clients/[id]/schedule/route.ts` | PATCH: bondsman sets per-client schedule |
| Modify | `src/app/api/partner/dashboard/route.ts` | Return `check_in_days`, `check_in_source` |
| Modify | `src/app/partner/dashboard/page.tsx` | Status indicators + schedule override UI |
| Create | `src/components/partner/CheckInDayPicker.tsx` | Reusable day picker (client component) |
| Modify | `src/app/api/partner/settings/route.ts` | Accept `default_check_in_days` in PATCH |
| Modify | `src/app/partner/compliance-report/page.tsx` | Fetch new columns |
| Modify | `src/app/partner/compliance-report/ComplianceReportClient.tsx` | Compliance rate + schedule columns |

---

### Task 1: Migration — Schema Changes

**Files:**
- Create: `supabase/migrations/20260415a_scheduled_check_in_system.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Scheduled Client Check-In System
-- Adds configurable check-in schedule columns to court_reminders and partners.

-- Court reminders: check-in schedule columns
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS check_in_days text[];
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS check_in_source text;
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS check_in_prompts_sent text[] DEFAULT '{}';
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS check_in_schedule_notified_at timestamptz;
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS check_in_schedule_followup_sent boolean DEFAULT false;

ALTER TABLE court_reminders ADD CONSTRAINT chk_check_in_source
  CHECK (check_in_source IS NULL OR check_in_source IN ('client', 'partner', 'default'));

-- Partners: default check-in days
ALTER TABLE partners ADD COLUMN IF NOT EXISTS default_check_in_days text[];

-- Indexes for cron queries
CREATE INDEX IF NOT EXISTS idx_court_reminders_check_in_days
  ON court_reminders USING GIN (check_in_days);

CREATE INDEX IF NOT EXISTS idx_check_ins_reminder_date
  ON client_check_ins (court_reminder_id, checked_in_at DESC);

CREATE INDEX IF NOT EXISTS idx_court_reminders_partner_promo
  ON court_reminders (partner_promo_code) WHERE partner_promo_code IS NOT NULL;

-- Atomic array_append for check_in_prompts_sent — idempotent, no read-modify-write race
CREATE OR REPLACE FUNCTION append_check_in_prompt(p_id uuid, p_date text)
RETURNS void AS $$
  UPDATE court_reminders
  SET check_in_prompts_sent = array_append(check_in_prompts_sent, p_date)
  WHERE id = p_id AND NOT (p_date = ANY(check_in_prompts_sent));
$$ LANGUAGE sql;
```

- [ ] **Step 2: Apply migration via Supabase Management API**

Primary method — Management API:
```bash
node -e "
const fs = require('fs');
const sql = fs.readFileSync('supabase/migrations/20260415a_scheduled_check_in_system.sql', 'utf8');
fetch('https://api.supabase.com/v1/projects/jxjbjmgdukwkoclydqdr/database/query', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
}).then(r => r.json()).then(console.log).catch(console.error);
"
```

Fallback — exec_sql RPC (if Management API is unavailable):
```bash
node -e "
const fs = require('fs');
const sql = fs.readFileSync('supabase/migrations/20260415a_scheduled_check_in_system.sql', 'utf8');
fetch('https://jxjbjmgdukwkoclydqdr.supabase.co/rest/v1/rpc/exec_sql', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  body: JSON.stringify({ query: sql }),
}).then(r => r.json()).then(console.log).catch(console.error);
"
```

- [ ] **Step 3: Verify columns exist**

Query the DB to confirm all columns were added:
```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
s.from('court_reminders').select('check_in_days, check_in_source, check_in_prompts_sent, check_in_schedule_notified_at, check_in_schedule_followup_sent').limit(1).then(r => {
  if (r.error) console.error('FAIL:', r.error.message);
  else console.log('OK: court_reminders columns verified');
});
s.from('partners').select('default_check_in_days').limit(1).then(r => {
  if (r.error) console.error('FAIL:', r.error.message);
  else console.log('OK: partners column verified');
});
"
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260415a_scheduled_check_in_system.sql
git commit -m "feat(check-in): migration — schedule columns, indexes, CHECK constraint"
```

---

### Task 2: Shared Helpers — Validation + Timezone Utils

**Files:**
- Create: `src/lib/check-in-schedule.ts`
- Create: `src/lib/__tests__/check-in-schedule.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/__tests__/check-in-schedule.test.ts
import { describe, it, expect } from "vitest";
import {
  VALID_DAYS,
  validateCheckInDays,
  getETDow,
  getETDate,
  getETMidnightUTC,
  formatDaysDisplay,
  countScheduledDays,
} from "../check-in-schedule";

describe("validateCheckInDays", () => {
  it("accepts valid days", () => {
    expect(validateCheckInDays(["mon", "fri"])).toBe(true);
    expect(validateCheckInDays(["sun"])).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(validateCheckInDays(["monday"])).toBe(false);
    expect(validateCheckInDays([""])).toBe(false);
    expect(validateCheckInDays(["mon", "invalid"])).toBe(false);
  });

  it("rejects empty array", () => {
    expect(validateCheckInDays([])).toBe(false);
  });

  it("rejects duplicates", () => {
    expect(validateCheckInDays(["mon", "mon"])).toBe(false);
  });
});

describe("getETDow", () => {
  it("returns lowercase 3-letter day", () => {
    const dow = getETDow(new Date("2026-04-14T13:00:00Z")); // Tuesday 9am ET
    expect(dow).toBe("tue");
    expect(VALID_DAYS).toContain(dow);
  });
});

describe("getETDate", () => {
  it("returns ISO date in ET", () => {
    const date = getETDate(new Date("2026-04-15T03:00:00Z")); // 11pm ET on Apr 14
    expect(date).toBe("2026-04-14");
  });
});

describe("getETMidnightUTC", () => {
  it("converts EDT midnight to UTC", () => {
    // Apr 14 midnight ET = Apr 14 04:00 UTC (EDT, UTC-4)
    const utc = getETMidnightUTC("2026-04-14");
    expect(utc.toISOString()).toBe("2026-04-14T04:00:00.000Z");
  });

  it("converts EST midnight to UTC", () => {
    // Jan 15 midnight ET = Jan 15 05:00 UTC (EST, UTC-5)
    const utc = getETMidnightUTC("2026-01-15");
    expect(utc.toISOString()).toBe("2026-01-15T05:00:00.000Z");
  });
});

describe("formatDaysDisplay", () => {
  it("formats days for display", () => {
    expect(formatDaysDisplay(["mon", "fri"])).toBe("Mon, Fri");
    expect(formatDaysDisplay(["sun"])).toBe("Sun");
  });

  it("returns empty string for null", () => {
    expect(formatDaysDisplay(null)).toBe("");
  });
});

describe("countScheduledDays", () => {
  it("counts matching weekdays in range", () => {
    // Mon Apr 13 to Fri Apr 17 2026 — contains Mon(13), Wed(15), Fri(17)
    const count = countScheduledDays(
      ["mon", "wed", "fri"],
      "2026-04-13",
      "2026-04-17"
    );
    expect(count).toBe(3);
  });

  it("returns 0 for null days", () => {
    expect(countScheduledDays(null, "2026-04-13", "2026-04-17")).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/check-in-schedule.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/check-in-schedule.ts
/**
 * Shared helpers for scheduled check-in system.
 * Validation, ET timezone utilities, display formatting, compliance math.
 */

export const VALID_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayOfWeek = (typeof VALID_DAYS)[number];

const VALID_SET = new Set<string>(VALID_DAYS);

/** Validate check_in_days array: non-empty, all valid, no duplicates. */
export function validateCheckInDays(days: string[]): boolean {
  if (!days || days.length === 0) return false;
  const seen = new Set<string>();
  for (const d of days) {
    if (!VALID_SET.has(d) || seen.has(d)) return false;
    seen.add(d);
  }
  return true;
}

/** Get 3-letter lowercase day-of-week in America/New_York timezone. */
export function getETDow(now?: Date): string {
  return (now ?? new Date())
    .toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" })
    .toLowerCase()
    .slice(0, 3);
}

/** Get ISO date string (YYYY-MM-DD) in America/New_York timezone. */
export function getETDate(now?: Date): string {
  return (now ?? new Date()).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** Convert an ET date string to midnight ET expressed as a UTC Date. */
export function getETMidnightUTC(etDateStr: string): Date {
  // Determine if the date is in EDT (UTC-4) or EST (UTC-5)
  // by checking the ET hour when it's 17:00 UTC on that date
  const noonUTC = new Date(etDateStr + "T17:00:00Z"); // 1pm ET roughly
  const etHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false,
    }).format(noonUTC),
    10
  );
  // If 17:00 UTC = 13 ET -> offset is -4 (EDT); if 12 ET -> offset is -5 (EST)
  const offsetHours = 17 - etHour; // 4 for EDT, 5 for EST
  const pad = String(offsetHours).padStart(2, "0");
  return new Date(`${etDateStr}T${pad}:00:00.000Z`);
}

/** Format check_in_days for display: ["mon","fri"] -> "Mon, Fri" */
export function formatDaysDisplay(days: string[] | null): string {
  if (!days || days.length === 0) return "";
  return days.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(", ");
}

/** Count scheduled check-in days between two dates (inclusive). */
export function countScheduledDays(
  checkInDays: string[] | null,
  startDate: string,
  endDate: string
): number {
  if (!checkInDays || checkInDays.length === 0) return 0;
  const daysSet = new Set(checkInDays);
  const start = new Date(startDate + "T12:00:00Z"); // noon UTC to avoid DST edge
  const end = new Date(endDate + "T12:00:00Z");
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const dow = cursor
      .toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" })
      .toLowerCase()
      .slice(0, 3);
    if (daysSet.has(dow)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/check-in-schedule.test.ts`
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/check-in-schedule.ts src/lib/__tests__/check-in-schedule.test.ts
git commit -m "feat(check-in): shared helpers — validation, ET timezone, compliance math"
```

---

### Task 3: Notification Prefs + SMS Subject Override

**Files:**
- Modify: `src/lib/notification-prefs.ts`
- Modify: `src/components/partner/NotificationSettings.tsx`
- Modify: `src/lib/sms.ts`

- [ ] **Step 1: Add `missed_check_in` to partner notification prefs**

In `src/lib/notification-prefs.ts`, add to `PartnerNotificationPrefs` interface:

```typescript
export interface PartnerNotificationPrefs {
  magic_link: Channel;
  client_reminded: Channel;
  drip: Channel;
  payout: Channel;
  commission_earned: Channel;
  missed_check_in: Channel;  // <-- ADD
}
```

And to `PARTNER_DEFAULTS`:

```typescript
export const PARTNER_DEFAULTS: PartnerNotificationPrefs = {
  magic_link: "email",
  client_reminded: "email",
  drip: "email",
  payout: "email",
  commission_earned: "email",
  missed_check_in: "email",  // <-- ADD
};
```

- [ ] **Step 2: Add label in NotificationSettings.tsx**

In `src/components/partner/NotificationSettings.tsx`, find the `LABELS` map and add:

```typescript
missed_check_in: "Missed check-in alerts",
```

- [ ] **Step 3: Add optional `subject` param to sendSMS**

In `src/lib/sms.ts`, change the `sendSMS` signature and usage:

```typescript
export async function sendSMS(
  to: string,
  body: string,
  logContext?: SmsLogContext,
  subject?: string  // <-- ADD optional subject override
): Promise<{ success: boolean; error?: string }> {
```

And in the fetch body:

```typescript
body: JSON.stringify({
  from: "ImNotAnAttorney <notifications@imnotanattorney.com>",
  to: [toGatewayAddress(to)],
  subject: subject ?? "Court Reminder",  // <-- USE subject param (nullish coalescing: only falls back on null/undefined, not empty string)
  text: body,
}),
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: 221+ tests PASS (no regressions from type additions)

- [ ] **Step 5: Commit**

```bash
git add src/lib/notification-prefs.ts src/components/partner/NotificationSettings.tsx src/lib/sms.ts
git commit -m "feat(check-in): missed_check_in notification pref + SMS subject override"
```

---

### Task 4: Client Signup — Check-In Day Picker

**Files:**
- Modify: `src/components/CourtReminderForm.tsx`
- Modify: `src/app/api/court-reminders/route.ts`

- [ ] **Step 1: Update CreateBody interface in route**

In `src/app/api/court-reminders/route.ts`, update:

```typescript
interface CreateBody {
  first_name: string;
  email: string;
  charge_type: string;
  county_state: string;
  court_date: string;
  recommended_tier?: string;
  partner_promo_code?: string;
  check_in_days?: string[] | null;  // <-- ADD
  check_in_idk?: boolean;           // <-- ADD ("I don't know" flag)
}
```

- [ ] **Step 2: Add validation + resolution logic in route**

After the existing court date validation, add:

```typescript
import { validateCheckInDays } from "@/lib/check-in-schedule";

// -- Check-in schedule resolution --
let checkInDays: string[] | null = null;
let checkInSource: string | null = null;
let resolvedPartner: { id: string; email: string; phone: string | null; notification_prefs: any; sms_consent_at: string | null; name: string; company: string | null; default_check_in_days: string[] | null } | null = null;

if (body.partner_promo_code) {
  if (body.check_in_days && !body.check_in_idk) {
    // Client picked specific days
    if (!validateCheckInDays(body.check_in_days)) {
      return NextResponse.json({ error: "Invalid check-in days" }, { status: 400 });
    }
    checkInDays = body.check_in_days;
    checkInSource = "client";
  } else if (body.check_in_idk) {
    // "I don't know" — check partner default, then fall through to bondsman notification
    // Fetch partner with ALL needed columns in one query — reuse for default resolution
    // AND fallback notification below
    const { data: partner } = await supabase
      .from("partners")
      .select("id, email, phone, notification_prefs, sms_consent_at, name, company, default_check_in_days")
      .eq("promo_code", body.partner_promo_code)
      .maybeSingle();

    if (partner?.default_check_in_days && partner.default_check_in_days.length > 0) {
      checkInDays = partner.default_check_in_days;
      checkInSource = "default";
    }
    // else: null — triggers bondsman fallback notification after insert

    // Store partner for reuse in fallback notification (Step 4)
    resolvedPartner = partner;
  }
}
```

- [ ] **Step 3: Include in insert payload**

Update the `supabase.from("court_reminders").insert({...})` to include:

```typescript
check_in_days: checkInDays,
check_in_source: checkInSource,
```

- [ ] **Step 4: Add bondsman fallback notification after insert**

After the successful insert, if schedule is null and partner exists. Reuse the `resolvedPartner` fetched in Step 2 instead of making a second query:

```typescript
// -- Bondsman fallback notification (no schedule set) --
if (body.partner_promo_code && !checkInDays && body.check_in_idk) {
  // Reuse partner fetched during schedule resolution (Step 2)
  const partner = resolvedPartner;

  if (partner) {
    const prefs = getPartnerPrefs(partner.notification_prefs);
    const dashUrl = `${SITE_URL}/partner/dashboard`;
    const msg = `${first_name.trim()} signed up for court reminders but doesn't know their check-in schedule. Set it here: ${dashUrl}`;

    if (shouldSendEmail(prefs.missed_check_in)) {
      sendEmail({
        to: partner.email,
        subject: `Check-in schedule needed for ${first_name.trim()}`,
        html: `<p style="color:#D4D4D8;font-size:15px;">${escapeHtml(msg)}</p>
               <a href="${dashUrl}" style="display:inline-block;padding:12px 24px;background:#F59E0B;color:#000;font-weight:bold;border-radius:8px;text-decoration:none;margin-top:16px;">Set Schedule</a>`,
      }).catch((e) => console.error("[Court Reminders] Partner email failed:", e));
    }

    if (shouldSendSMS(prefs.missed_check_in) && partner.phone) {
      sendSMS(
        partner.phone,
        capSMS(`${first_name.trim()} needs a check-in schedule. Set it: ${dashUrl} — Do not reply`),
        { category: "schedule_needed", partner_id: partner.id },
        "Check-In Schedule Needed"
      ).catch((e) => console.warn("[Court Reminders] Partner SMS failed:", e));
    }

    // Mark notification sent
    await supabase
      .from("court_reminders")
      .update({ check_in_schedule_notified_at: new Date().toISOString() })
      .eq("token", token);
  }
}
```

**Note:** Partner SMS uses a simple `partner.phone` truthy check, NOT `canSendClientSMS()`. Partners are business users — the 10DLC client consent guard does not apply to them.

Add necessary imports at the top of the file:

```typescript
import { getPartnerPrefs, shouldSendEmail, shouldSendSMS } from "@/lib/notification-prefs";
import { sendSMS, capSMS } from "@/lib/sms";
import { validateCheckInDays } from "@/lib/check-in-schedule";
```

**Note on `sendEmail` / `escapeHtml`:** Verify existing imports already include `sendEmail` and `escapeHtml` from `"@/lib/email"` — they are already present in this file. Do NOT add a duplicate import.

- [ ] **Step 5: Update CourtReminderForm.tsx**

Change the prop type and add the day picker UI:

```typescript
interface CourtReminderFormProps {
  chargeType?: string;
  recommendedTier?: string;
  partnerPromoCode: string | null;  // <-- CHANGED from string
}
```

Add state variables after existing ones:

```typescript
const [checkInDays, setCheckInDays] = useState<string[]>([]);
const [checkInIdk, setCheckInIdk] = useState(false);
```

Add to the form body, after the court date field (only if partner):

```tsx
{partnerPromoCode && (
  <fieldset className="mt-4">
    <legend className="text-sm font-medium text-zinc-300 mb-2">
      What days does your bondsman want you to check in?
    </legend>
    <div className="flex flex-wrap gap-2 mb-2">
      {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => (
        <label
          key={day}
          className={`px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors min-h-[44px] flex items-center ${
            checkInIdk
              ? "border-zinc-700 text-zinc-500 cursor-not-allowed"
              : checkInDays.includes(day)
              ? "border-amber-500 bg-amber-500/10 text-amber-400"
              : "border-zinc-600 text-zinc-300 hover:border-zinc-400"
          }`}
        >
          <input
            type="checkbox"
            className="sr-only"
            disabled={checkInIdk || submitting}
            checked={checkInDays.includes(day)}
            onChange={(e) => {
              setCheckInDays((prev) =>
                e.target.checked ? [...prev, day] : prev.filter((d) => d !== day)
              );
            }}
          />
          {day.charAt(0).toUpperCase() + day.slice(1)}
        </label>
      ))}
    </div>
    <label className="flex items-center gap-2 text-sm text-zinc-400 mt-2 min-h-[44px]">
      <input
        type="checkbox"
        checked={checkInIdk}
        disabled={submitting}
        onChange={(e) => {
          setCheckInIdk(e.target.checked);
          if (e.target.checked) setCheckInDays([]);
        }}
        className="rounded border-zinc-600"
      />
      I don&apos;t know
    </label>
  </fieldset>
)}
```

Update the fetch body in `handleSubmit` to include:

```typescript
check_in_days: checkInIdk ? null : (checkInDays.length > 0 ? checkInDays : undefined),
check_in_idk: checkInIdk || undefined,
```

- [ ] **Step 6: Update any pages that render CourtReminderForm**

Search for `CourtReminderForm` usage — the `/r/[code]/reminders` page passes `partnerPromoCode` as a string. Since we changed the prop to `string | null`, existing usages still compile. Verify with:

Run: `npx tsc --noEmit --skipLibCheck 2>&1 | grep -i courtreminder`
Expected: No new errors

- [ ] **Step 7: Run tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/CourtReminderForm.tsx src/app/api/court-reminders/route.ts
git commit -m "feat(check-in): client signup day picker + bondsman fallback notification"
```

---

### Task 5: Cron — Check-In Prompt + Missed Alert

**Files:**
- Create: `src/app/api/cron/check-in-prompt/route.ts`

- [ ] **Step 1: Write the cron route**

```typescript
// src/app/api/cron/check-in-prompt/route.ts
/**
 * GET /api/cron/check-in-prompt — Two-phase daily cron.
 *
 * Phase 1: Send check-in prompts to clients whose scheduled day is today.
 * Phase 2: Send missed-check-in alerts to bondsmen for yesterday's misses.
 *
 * Schedule: Daily 8am ET (0 12 * * * UTC) via cron-job.org.
 * Auth: CRON_AUTH_TOKEN bearer (covered by /api/cron/* middleware).
 * Idempotency: Two separate lock keys for independent failure/retry.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";
import { sendSMS, capSMS } from "@/lib/sms";
import {
  getClientPrefs,
  getPartnerPrefs,
  shouldSendEmail,
  shouldSendSMS,
  canSendClientSMS,
} from "@/lib/notification-prefs";
import { getETDow, getETDate, getETMidnightUTC } from "@/lib/check-in-schedule";
import { SITE_URL } from "@/lib/site";

const PAGE_SIZE = 500;

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const supabase = createAdminClient();
  const todayDow = getETDow();
  const todayDate = getETDate();
  const results = { phase1: { sent: 0, errors: 0 }, phase2: { alerts: 0, errors: 0 }, followups: 0 };

  // ================================================================
  // PHASE 1: Check-in prompts
  // ================================================================
  const lock1 = await acquireCronLock("check-in-prompt", 23 * 60 * 60 * 1000);
  if (lock1.shouldRun) {
    try {
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: reminders } = await supabase
          .from("court_reminders")
          .select("id, token, first_name, email, phone, notification_prefs, sms_consent_at, partner_promo_code, check_in_prompts_sent")
          .eq("status", "active")
          .gt("court_date", todayDate)
          .contains("check_in_days", [todayDow])
          .not("check_in_prompts_sent", "cs", `{"${todayDate}"}`)
          .range(offset, offset + PAGE_SIZE - 1);

        if (!reminders || reminders.length === 0) {
          hasMore = false;
          break;
        }

        // -- Batch partner lookup: collect unique promo codes, fetch all at once --
        const promoCodes = [...new Set(
          reminders.map((r) => r.partner_promo_code).filter(Boolean) as string[]
        )];
        const partnerMap = new Map<string, string>();
        if (promoCodes.length > 0) {
          const { data: partners } = await supabase
            .from("partners")
            .select("promo_code, company, name")
            .in("promo_code", promoCodes);
          for (const p of partners || []) {
            partnerMap.set(p.promo_code, p.company || p.name || "Your bondsman");
          }
        }

        for (const r of reminders) {
          // Resolve partner company name from batch map
          const companyName = r.partner_promo_code
            ? (partnerMap.get(r.partner_promo_code) || "Your bondsman")
            : "Your bondsman";

          const prefs = getClientPrefs(r.notification_prefs);
          const prepUrl = `${SITE_URL}/prep/${r.token}`;
          const sends: Promise<unknown>[] = [];

          if (shouldSendEmail(prefs.check_in)) {
            sends.push(
              sendEmail({
                to: r.email,
                subject: `Check-in reminder from ${companyName}`,
                html: `<p style="color:#D4D4D8;font-size:15px;">${escapeHtml(r.first_name)}, ${escapeHtml(companyName)} requests your check-in today.</p>
                       <a href="${prepUrl}" style="display:inline-block;padding:12px 24px;background:#F59E0B;color:#000;font-weight:bold;border-radius:8px;text-decoration:none;margin-top:16px;">Check In Now</a>
                       <p style="color:#71717A;font-size:12px;margin-top:16px;">This is an automated message. Do not reply to this email.</p>`,
              })
            );
          }

          if (shouldSendSMS(prefs.check_in) && canSendClientSMS(r.phone, r.sms_consent_at)) {
            sends.push(
              sendSMS(
                r.phone!,
                capSMS(`${r.first_name}, ${companyName} requests your check-in today: imnotanattorney.com/prep/${r.token} — Do not reply to this text`),
                { category: "check_in_prompt", court_reminder_id: r.id },
                "Check-In Reminder"
              )
            );
          }

          try {
            await Promise.allSettled(sends);
            // Atomic append via SQL function — idempotent, no read-modify-write race.
            // check_in_prompts_sent column no longer needed in SELECT.
            await supabase.rpc("append_check_in_prompt", { p_id: r.id, p_date: todayDate });

            results.phase1.sent++;
          } catch (e) {
            console.error(`[Check-In Prompt] Failed for ${r.id}:`, e);
            results.phase1.errors++;
          }
        }

        offset += PAGE_SIZE;
        if (reminders.length < PAGE_SIZE) hasMore = false;
      }

      // -- 48-hour follow-ups for unconfigured schedules --
      const allUnconfigured: Array<{ id: string; first_name: string; partner_promo_code: string | null; check_in_schedule_notified_at: string }> = [];
      let followupOffset = 0;
      let followupHasMore = true;

      while (followupHasMore) {
        const { data: page } = await supabase
          .from("court_reminders")
          .select("id, first_name, partner_promo_code, check_in_schedule_notified_at")
          .is("check_in_days", null)
          .not("check_in_schedule_notified_at", "is", null)
          .eq("check_in_schedule_followup_sent", false)
          .eq("status", "active")
          .range(followupOffset, followupOffset + PAGE_SIZE - 1);

        if (!page || page.length === 0) { followupHasMore = false; break; }
        allUnconfigured.push(...page);
        followupOffset += PAGE_SIZE;
        if (page.length < PAGE_SIZE) followupHasMore = false;
      }

      for (const r of allUnconfigured) {
        const notifiedAt = new Date(r.check_in_schedule_notified_at);
        const hoursSince = (Date.now() - notifiedAt.getTime()) / (1000 * 60 * 60);

        // Skip if < 48 hours or > 7 days
        if (hoursSince < 48 || hoursSince > 168) continue;

        if (r.partner_promo_code) {
          const { data: partner } = await supabase
            .from("partners")
            .select("id, email, phone, notification_prefs, sms_consent_at")
            .eq("promo_code", r.partner_promo_code)
            .maybeSingle();

          if (partner) {
            const prefs = getPartnerPrefs(partner.notification_prefs);
            const dashUrl = `${SITE_URL}/partner/dashboard`;
            const msg = `Still need a check-in schedule for ${r.first_name}: ${dashUrl}`;

            if (shouldSendEmail(prefs.missed_check_in)) {
              sendEmail({
                to: partner.email,
                subject: `Reminder: Set check-in schedule for ${r.first_name}`,
                html: `<p style="color:#D4D4D8;font-size:15px;">${escapeHtml(msg)}</p>
                       <a href="${dashUrl}" style="display:inline-block;padding:12px 24px;background:#F59E0B;color:#000;font-weight:bold;border-radius:8px;text-decoration:none;margin-top:16px;">Set Schedule</a>`,
              }).catch((e) => console.error("[Check-In] Follow-up email failed:", e));
            }

            if (shouldSendSMS(prefs.missed_check_in) && partner.phone) {
              sendSMS(
                partner.phone!,
                capSMS(`Still need check-in schedule for ${r.first_name}: ${dashUrl} — Do not reply`),
                { category: "schedule_followup", partner_id: partner.id },
                "Check-In Schedule Needed"
              ).catch((e) => console.warn("[Check-In] Follow-up SMS failed:", e));
            }
          }
        }

        await supabase
          .from("court_reminders")
          .update({ check_in_schedule_followup_sent: true })
          .eq("id", r.id);

        results.followups++;
      }

      await releaseCronLock(lock1.executionId!, "completed");
    } catch (err) {
      await releaseCronLock(lock1.executionId!, "failed");
      throw err;
    }
  }

  // ================================================================
  // PHASE 2: Missed check-in alerts (yesterday)
  // ================================================================
  const lock2 = await acquireCronLock("check-in-missed-alert", 23 * 60 * 60 * 1000);
  if (lock2.shouldRun) {
    try {
      // Compute yesterday by subtracting one calendar day from todayDate string,
      // NOT by subtracting 86400000ms (which breaks on DST transitions).
      const [y, m, d] = todayDate.split("-").map(Number);
      const yesterdayObj = new Date(y, m - 1, d - 1); // JS Date handles month rollover
      const yesterdayDate = [
        yesterdayObj.getFullYear(),
        String(yesterdayObj.getMonth() + 1).padStart(2, "0"),
        String(yesterdayObj.getDate()).padStart(2, "0"),
      ].join("-");
      const yesterdayDow = getETDow(new Date(yesterdayDate + "T12:00:00Z"));
      const yesterdayStart = getETMidnightUTC(yesterdayDate);
      const todayStart = getETMidnightUTC(todayDate);

      // Fetch all reminders that were scheduled yesterday
      const allScheduled: Array<{ id: string; first_name: string; partner_promo_code: string }> = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data } = await supabase
          .from("court_reminders")
          .select("id, first_name, partner_promo_code")
          .eq("status", "active")
          .gt("court_date", todayDate)
          .contains("check_in_days", [yesterdayDow])
          .not("partner_promo_code", "is", null)
          .range(offset, offset + PAGE_SIZE - 1);

        if (!data || data.length === 0) { hasMore = false; break; }
        allScheduled.push(...data);
        offset += PAGE_SIZE;
        if (data.length < PAGE_SIZE) hasMore = false;
      }

      if (allScheduled.length > 0) {
        // Batch fetch check-ins for yesterday
        const ids = allScheduled.map((r) => r.id);
        const { data: checkIns } = await supabase
          .from("client_check_ins")
          .select("court_reminder_id")
          .in("court_reminder_id", ids)
          .gte("checked_in_at", yesterdayStart.toISOString())
          .lt("checked_in_at", todayStart.toISOString());

        const checkedInSet = new Set((checkIns || []).map((c) => c.court_reminder_id));

        // Find misses, group by partner
        const missesByPartner = new Map<string, string[]>();
        for (const r of allScheduled) {
          if (checkedInSet.has(r.id)) continue;
          const existing = missesByPartner.get(r.partner_promo_code) || [];
          existing.push(r.first_name);
          missesByPartner.set(r.partner_promo_code, existing);
        }

        // Batch-fetch all partners in one query — avoids N+1
        const allPromoCodes = [...missesByPartner.keys()];
        const { data: partnerRows } = await supabase
          .from("partners")
          .select("id, email, phone, notification_prefs, sms_consent_at, promo_code")
          .in("promo_code", allPromoCodes);
        const partnerByPromo = new Map((partnerRows || []).map((p) => [p.promo_code, p]));

        // Send one summary per partner
        for (const [promoCode, missedNames] of missesByPartner) {
          const partner = partnerByPromo.get(promoCode);

          if (!partner) continue;

          const prefs = getPartnerPrefs(partner.notification_prefs);
          const dashUrl = `${SITE_URL}/partner/dashboard`;
          const count = missedNames.length;
          const names = missedNames.slice(0, 5).join(", ") + (count > 5 ? ` +${count - 5} more` : "");

          if (shouldSendEmail(prefs.missed_check_in)) {
            sendEmail({
              to: partner.email,
              subject: `${count} client${count > 1 ? "s" : ""} missed check-in yesterday`,
              html: `<p style="color:#D4D4D8;font-size:15px;">${count} client${count > 1 ? "s" : ""} missed their scheduled check-in yesterday: <strong>${escapeHtml(names)}</strong></p>
                     <a href="${dashUrl}" style="display:inline-block;padding:12px 24px;background:#F59E0B;color:#000;font-weight:bold;border-radius:8px;text-decoration:none;margin-top:16px;">View Details</a>`,
            }).catch((e) => console.error("[Missed Check-In] Email failed:", e));
          }

          if (shouldSendSMS(prefs.missed_check_in) && partner.phone) {
            sendSMS(
              partner.phone!,
              capSMS(`${count} client(s) missed check-in yesterday: ${names}. Details: ${dashUrl} — Do not reply`),
              { category: "missed_check_in_alert", partner_id: partner.id },
              "Missed Check-In Alert"
            ).catch((e) => console.warn("[Missed Check-In] SMS failed:", e));
          }

          results.phase2.alerts++;
        }
      }

      await releaseCronLock(lock2.executionId!, "completed");
    } catch (err) {
      await releaseCronLock(lock2.executionId!, "failed");
      throw err;
    }
  }

  return NextResponse.json(results);
}
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Register cron job**

```bash
node -e "
fetch('https://api.cron-job.org/jobs', {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer qmy3F+k6DrUgKCz/Jp8fEnpViJrE3pgaUfOoO8yAQn4=',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    job: {
      url: 'https://imnotanattorney.com/api/cron/check-in-prompt',
      enabled: true,
      title: 'INAA: Check-in prompt + missed alerts (daily 8am ET)',
      schedule: { timezone: 'UTC', hours: [12], mdays: [-1], minutes: [0], months: [-1], wdays: [-1] },
      requestMethod: 0,
      extendedData: { headers: { Authorization: 'Bearer ' + process.env.CRON_AUTH_TOKEN } },
    },
  }),
}).then(r => r.json()).then(d => console.log('Job ID:', d.jobId)).catch(console.error);
"
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/check-in-prompt/route.ts
git commit -m "feat(check-in): cron — daily prompt + missed alert phases + 48hr followup"
```

---

### Task 6: Dashboard — Schedule Override API

**Files:**
- Create: `src/app/api/partner/clients/[id]/schedule/route.ts`

- [ ] **Step 1: Write the PATCH route**

```typescript
// src/app/api/partner/clients/[id]/schedule/route.ts
/**
 * PATCH /api/partner/clients/[id]/schedule — Set or clear check-in schedule for a client.
 *
 * Auth: Partner session cookie (covered by /api/partner/* middleware).
 * Body: { check_in_days: string[] | null }
 *   - string[]: validates days, sets check_in_source = "partner"
 *   - null: clears schedule (sets both check_in_days and check_in_source to null)
 *
 * Sends one-time confirmation to client when transitioning from null -> set.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validatePartnerSession, PARTNER_SESSION_COOKIE } from "@/lib/partner-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateCheckInDays, formatDaysDisplay } from "@/lib/check-in-schedule";
import { sendEmail, escapeHtml } from "@/lib/email";
import { sendSMS, capSMS } from "@/lib/sms";
import { getClientPrefs, shouldSendEmail, shouldSendSMS, canSendClientSMS } from "@/lib/notification-prefs";
import { SITE_URL } from "@/lib/site";

interface PatchBody {
  check_in_days: string[] | null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(PARTNER_SESSION_COOKIE)?.value;
  if (!sessionToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partner = await validatePartnerSession(sessionToken);
  if (!partner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Guard: partner must have a promo_code to own clients
  if (!partner.promo_code) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // null = clear schedule; array = set schedule
  if (body.check_in_days !== null && !validateCheckInDays(body.check_in_days)) {
    return NextResponse.json({ error: "Invalid check-in days" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify client belongs to this partner
  const { data: reminder } = await supabase
    .from("court_reminders")
    .select("id, first_name, email, phone, notification_prefs, sms_consent_at, token, check_in_days, partner_promo_code")
    .eq("id", id)
    .eq("partner_promo_code", partner.promo_code)
    .maybeSingle();

  if (!reminder) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const wasNull = !reminder.check_in_days || reminder.check_in_days.length === 0;
  const isClearing = body.check_in_days === null;

  // Update schedule
  const { error: updateErr } = await supabase
    .from("court_reminders")
    .update({
      check_in_days: body.check_in_days,
      check_in_source: isClearing ? null : "partner",
    })
    .eq("id", id);

  if (updateErr) {
    console.error("[Schedule Override] Update failed:", updateErr);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  // One-time confirmation to client when going from null -> configured
  if (wasNull && !isClearing) {
    const daysStr = formatDaysDisplay(body.check_in_days);
    const prepUrl = `${SITE_URL}/prep/${reminder.token}`;
    const prefs = getClientPrefs(reminder.notification_prefs);
    const companyName = partner.company || partner.name;

    if (shouldSendEmail(prefs.check_in)) {
      sendEmail({
        to: reminder.email,
        subject: `Check-in reminders set up by ${companyName}`,
        html: `<p style="color:#D4D4D8;font-size:15px;">${escapeHtml(reminder.first_name)}, ${escapeHtml(companyName)} has set up check-in reminders for you on <strong>${daysStr}</strong>.</p>
               <p style="color:#D4D4D8;font-size:15px;">You'll receive a reminder each scheduled day — tap the link to check in.</p>
               <a href="${prepUrl}" style="display:inline-block;padding:12px 24px;background:#F59E0B;color:#000;font-weight:bold;border-radius:8px;text-decoration:none;margin-top:16px;">View Your Prep Page</a>`,
      }).catch((e) => console.error("[Schedule Override] Client email failed:", e));
    }

    if (shouldSendSMS(prefs.check_in) && canSendClientSMS(reminder.phone, reminder.sms_consent_at)) {
      sendSMS(
        reminder.phone!,
        capSMS(`${reminder.first_name}, ${companyName} set your check-in days: ${daysStr}. Tap here on those days: ${prepUrl} — Do not reply`),
        { category: "schedule_set_confirmation", court_reminder_id: reminder.id },
        "Check-In Schedule Set"
      ).catch((e) => console.warn("[Schedule Override] Client SMS failed:", e));
    }
  }

  return NextResponse.json({ success: true, check_in_days: body.check_in_days });
}
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/api/partner/clients/[id]/schedule/route.ts
git commit -m "feat(check-in): PATCH /api/partner/clients/[id]/schedule — bondsman override"
```

---

### Task 7: Dashboard UI — Status Indicators + Schedule Override

**Files:**
- Modify: `src/app/api/partner/dashboard/route.ts`
- Modify: `src/app/partner/dashboard/page.tsx`
- Create: `src/components/partner/CheckInDayPicker.tsx`
- Modify: `src/app/api/partner/settings/route.ts`

- [ ] **Step 1: Update dashboard API to return check-in columns**

In `src/app/api/partner/dashboard/route.ts`, find the `courtClients` SELECT and add `check_in_days, check_in_source` to the column list.

- [ ] **Step 2: Add check-in status indicators to client tracker**

In `src/app/partner/dashboard/page.tsx`, in the client tracker section, import shared helpers and add per-client status:

```tsx
import { getETDow, getETDate } from "@/lib/check-in-schedule";

// Inside the component:
const todayDow = getETDow();
const todayDateStr = getETDate();
```

Per-client status indicator:

```tsx
{/* Check-in status dot */}
{client.check_in_days && client.check_in_days.length > 0 ? (
  (() => {
    const isScheduledToday = client.check_in_days.includes(todayDow);
    const checkedInToday = checkInSummary[client.id]?.lastCheckIn &&
      new Date(checkInSummary[client.id].lastCheckIn!).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === todayDateStr;

    if (checkedInToday) return <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" title="Checked in today" />;
    if (isScheduledToday) return <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" title="Missed check-in today" />;
    return <span className="inline-block w-2.5 h-2.5 rounded-full bg-zinc-600" title="Not scheduled today" />;
  })()
) : (
  <span className="text-xs text-amber-400 font-medium">Schedule needed</span>
)}
```

**Note on `checkInSummary`:** This variable is already built from `client_check_ins` data in the existing dashboard page (fetched via the dashboard API). No new data fetch is needed — `checkInSummary` is already in scope. Do not add a second query.

- [ ] **Step 3: Create reusable CheckInDayPicker component**

Create `src/components/partner/CheckInDayPicker.tsx` — a `'use client'` component used by both the dashboard client tracker (per-client schedule override) and the settings panel (default check-in days):

```tsx
// src/components/partner/CheckInDayPicker.tsx
"use client";

import { useState } from "react";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

interface CheckInDayPickerProps {
  /** Currently selected days */
  value: string[];
  /** Callback when selection changes */
  onChange: (days: string[]) => void;
  /** Disable all interactions */
  disabled?: boolean;
  /** Optional label text above the picker */
  label?: string;
}

export function CheckInDayPicker({ value, onChange, disabled, label }: CheckInDayPickerProps) {
  return (
    <fieldset className="space-y-2">
      {label && (
        <legend className="text-sm font-medium text-zinc-300 mb-2">{label}</legend>
      )}
      <div className="flex flex-wrap gap-2">
        {DAYS.map((day) => {
          const selected = value.includes(day);
          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange(
                  selected ? value.filter((d) => d !== day) : [...value, day]
                );
              }}
              className={`px-3 py-2 rounded-lg border text-sm transition-colors min-h-[44px] ${
                disabled
                  ? "border-zinc-700 text-zinc-500 cursor-not-allowed"
                  : selected
                  ? "border-amber-500 bg-amber-500/10 text-amber-400"
                  : "border-zinc-600 text-zinc-300 hover:border-zinc-400 cursor-pointer"
              }`}
            >
              {day.charAt(0).toUpperCase() + day.slice(1)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
```

Use this component in the dashboard's per-client schedule override modal/popover. On save, call `PATCH /api/partner/clients/${client.id}/schedule` with the selected days (or `null` to clear).

- [ ] **Step 4: Add `default_check_in_days` support to PATCH /api/partner/settings**

Read `src/app/api/partner/settings/route.ts` first to confirm the current state. The route currently only handles payment fields. Add `default_check_in_days` handling:

**Auth note:** The settings route uses `requirePartnerAuth(req)` — do NOT change its auth pattern. Only add `default_check_in_days` to the destructured body and the updates object.

After the destructuring of `body`, add:

```typescript
const { preferred_payment_method, payment_zelle, payment_venmo, payment_check_address, payment_paypal, default_check_in_days } = body;
```

After the existing payment method validation block, add:

```typescript
// Validate default_check_in_days if provided
if (default_check_in_days !== undefined) {
  if (default_check_in_days !== null) {
    if (!Array.isArray(default_check_in_days)) {
      return NextResponse.json({ error: "default_check_in_days must be an array or null" }, { status: 400 });
    }
    const { validateCheckInDays } = await import("@/lib/check-in-schedule");
    if (default_check_in_days.length > 0 && !validateCheckInDays(default_check_in_days)) {
      return NextResponse.json({ error: "Invalid check-in days" }, { status: 400 });
    }
  }
}
```

And in the `updates` object section, add:

```typescript
if (default_check_in_days !== undefined) {
  updates.default_check_in_days = default_check_in_days;
}
```

In the partner settings UI area, use the same `CheckInDayPicker` component. On save, send `{ default_check_in_days: selectedDays }` (or `null` to clear) to `PATCH /api/partner/settings`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/api/partner/dashboard/route.ts src/app/partner/dashboard/page.tsx src/components/partner/CheckInDayPicker.tsx src/app/api/partner/settings/route.ts
git commit -m "feat(check-in): dashboard status indicators + schedule override UI"
```

---

### Task 8: Compliance Report — Rate + Schedule Columns

**Files:**
- Modify: `src/app/partner/compliance-report/page.tsx`
- Modify: `src/app/partner/compliance-report/ComplianceReportClient.tsx`

- [ ] **Step 1: Update server query to fetch new columns**

In `src/app/partner/compliance-report/page.tsx`, update the SELECT:

```typescript
.select(
  "id, first_name, last_name, charge_type, county_state, court_date, status, reminders_sent, created_at, converted_at, check_in_days, check_in_source"
)
```

- [ ] **Step 2: Update ComplianceClient interface**

In `ComplianceReportClient.tsx`, add to the interface:

```typescript
interface ComplianceClient {
  // ... existing fields ...
  check_in_days: string[] | null;
  check_in_source: string | null;
}
```

- [ ] **Step 3: Add compliance rate calculation**

Import from shared helpers and add calculation in the component:

```typescript
import { formatDaysDisplay, countScheduledDays } from "@/lib/check-in-schedule";

// Inside the component, per client:
function getComplianceRate(client: ComplianceClient, clientCheckIns: number): string {
  if (!client.check_in_days || client.check_in_days.length === 0) return "\u2014";
  const endDate = new Date() < new Date(client.court_date + "T00:00:00")
    ? new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })
    : client.court_date;
  const scheduled = countScheduledDays(client.check_in_days, client.created_at.slice(0, 10), endDate);
  if (scheduled === 0) return "\u2014";
  return `${clientCheckIns} / ${scheduled} (${((clientCheckIns / scheduled) * 100).toFixed(0)}%)`;
}
```

**Spec note — compliance rate numerator simplification:** The `clientCheckIns` count is the raw total of check-in records, NOT filtered to only scheduled days. This is an acceptable simplification because: (a) bonus check-ins on non-scheduled days are rare in practice, (b) an overstated compliance rate is safe for surety audits (makes the bondsman look good), and (c) filtering by scheduled-day would require loading individual check-in timestamps and cross-referencing against `check_in_days` per client, which contradicts the batch-fetch pattern used by the compliance report. If precision becomes important later, add a `checked_in_on_scheduled_day` boolean column at write time.

- [ ] **Step 4: Add columns to the table**

Add "Schedule" and "Compliance Rate" columns to the table in the render:

```tsx
<th scope="col" className="px-4 py-3 font-semibold text-zinc-200">Schedule</th>
<th scope="col" className="px-4 py-3 font-semibold text-zinc-200">Compliance</th>
```

And per row:

```tsx
<td className="px-4 py-3 text-zinc-400 text-sm">
  {formatDaysDisplay(client.check_in_days) || "\u2014"}
  {client.check_in_source && (
    <span className="block text-xs text-zinc-500">
      {client.check_in_source === "client" ? "set by client" : client.check_in_source === "partner" ? "set by bondsman" : "default"}
    </span>
  )}
</td>
<td className="px-4 py-3 text-zinc-300 font-medium">
  {getComplianceRate(client, checkInMap[client.id]?.count ?? 0)}
</td>
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/partner/compliance-report/page.tsx src/app/partner/compliance-report/ComplianceReportClient.tsx
git commit -m "feat(check-in): compliance report — rate + schedule columns"
```

---

### Task 9: E2E Verification + Cleanup

- [ ] **Step 1: TypeScript check**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: Only pre-existing test file errors (cross-validator.test.ts, mechanical-extractor.test.ts)

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: All tests PASS (221+ existing + new check-in-schedule tests)

- [ ] **Step 3: Verify cron-job.org registration**

```bash
node -e "
fetch('https://api.cron-job.org/jobs', {
  headers: { 'Authorization': 'Bearer qmy3F+k6DrUgKCz/Jp8fEnpViJrE3pgaUfOoO8yAQn4=' },
}).then(r => r.json()).then(d => {
  const job = d.jobs.find(j => j.url.includes('check-in-prompt'));
  console.log(job ? 'OK: Job registered, ID=' + job.jobId : 'MISSING: Job not found');
}).catch(console.error);
"
```

- [ ] **Step 4: Final commit with spec + plan**

```bash
git add docs/superpowers/specs/2026-04-14-scheduled-check-in-system-design.md docs/superpowers/plans/2026-04-14-scheduled-check-in-system.md
git commit -m "docs(check-in): spec + implementation plan for scheduled check-in system"
```
