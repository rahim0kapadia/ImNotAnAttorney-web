# Bird SMS + Notification Preference System, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Twilio with Bird SMS API and build a per-notification-type channel preference system for both clients (defendants) and partners (bondsmen).

**Architecture:** JSONB override columns on `court_reminders` and `partners` tables store only non-default preferences. Application-level merge with hardcoded defaults. Bird API utility replaces Twilio with same `sendSMS()` interface. Phone collected post-submit on prep page (gradual engagement). Bondsman notification settings on dashboard.

**Tech Stack:** Next.js 15, Supabase (PostgreSQL), Bird REST API, Vitest, TypeScript

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-04-13-bird-sms-notification-system-design.md`

---

## MANDATORY Review Fixes (read BEFORE implementing any task)

These override specific sections in the tasks below. Code review identified 2 critical, 7 important, and 4 suggestion-level issues. All are fixed here.

### C1. SAFETY, court_reminders must never be "sms" alone (affects Tasks 1, 9)

If a defendant sets court reminders to SMS-only and their phone is dead at 3AM, they get ZERO notification and miss court. `court_reminders` channel is restricted to `"email"` or `"both"`, never `"sms"` alone.

**Task 1 already updated** with `COURT_REMINDER_SAFE_CHANNELS`, `validateClientPrefs()`, and tests.

**Task 9 (NotificationSettings.tsx):** For `court_reminders` row only, the "SMS" button must be disabled/hidden. The API route for client prefs (`/api/court-reminders/[token]/prefs`) must call `validateClientPrefs()` and reject `{ court_reminders: "sms" }` with 400.

### C2. Commission locking query ignores refunds (affects Task 12)

**Override Task 12, Step 1 query.** Replace:
```typescript
.is("locked_at", null)
.lt("created_at", cutoff)
.limit(200)
```
With:
```typescript
.is("locked_at", null)
.lt("created_at", cutoff)
.gt("commission_amount", 0)  // Refunded orders have commission zeroed by webhook RPC
.limit(200)
```

### I1. validatePartnerSession missing notification_prefs (affects Tasks 8, 9, 10)

`src/lib/partner-auth.ts` line 149, add `notification_prefs` to the `.select()` string:
```typescript
.select("id, name, email, phone, company, promo_code, commission_rate, commission_tier, status, preferred_payment_method, payment_zelle, payment_venmo, payment_check_address, payment_paypal, total_referrals, total_commission, total_paid_out, notification_prefs")
```
AND add to the return type interface (line 114-132):
```typescript
notification_prefs: Record<string, string> | null;
```

### I2. Stripe webhook timeout risk from SMS (affects Task 11)

Move SMS send inside `waitUntil` or `after()` to avoid contributing to Stripe's 30-second webhook timeout. **Override Task 11, Step 2**, wrap the SMS call:

```typescript
// Use waitUntil to prevent webhook timeout from Bird API latency
if (shouldSendSMS(partnerPrefs.payout) && partnerDetail.phone) {
  // Fire-and-forget, don't await in the webhook response path
  sendSMS(
    partnerDetail.phone,
    `INAA: You earned $${commissionDollars} from a new referral! Confirms ${holdbackDate}.`
  ).catch((e) => console.warn("[Webhook] Partner sale notification SMS failed:", e));
}
```
Note: `sendSMS` is already non-throwing (returns `{ success: false }` on error), but removing the `await` ensures zero latency impact on the webhook response.

### I3. N+1 partner queries in cron (affects Task 5, Step 4)

**Override Task 5, Step 4.** Instead of querying partners inside the reminder loop, extend the existing batch fetch (lines 71-80 of current cron) to include `email, phone, notification_prefs`:

```typescript
// Replace existing batch fetch (lines 71-80) with:
const promoCodes = [...new Set(reminders.filter(r => r.partner_promo_code).map(r => r.partner_promo_code as string))];
const partnerMap: Record<string, { company: string; email: string; phone: string | null; notification_prefs: unknown }> = {};
if (promoCodes.length > 0) {
  const { data: partners } = await supabase
    .from("partners")
    .select("promo_code, company, name, email, phone, notification_prefs")
    .in("promo_code", promoCodes);
  for (const p of (partners || [])) {
    partnerMap[p.promo_code] = {
      company: p.company || p.name,
      email: p.email,
      phone: p.phone,
      notification_prefs: p.notification_prefs,
    };
  }
}
```
Then in the notification block, use `partnerMap[partnerCode]` directly instead of querying.

### I4. Customer magic link SMS needs consent check (affects Task 6)

**Override Task 6, Step 1.** Add `sms_consent_at` to the court_reminders select and guard the SMS send:

```typescript
const { data: reminderRow } = await supabase
  .from("court_reminders")
  .select("phone, notification_prefs, sms_consent_at")
  .eq("email", normalizedEmail)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

// Only send SMS if client explicitly consented (sms_consent_at set)
if (shouldSendSMS(prefs.magic_link) && reminderRow?.phone && reminderRow?.sms_consent_at) {
```

### I5. Check-in route needs exact select string (affects Task 7)

**Override Task 7, Step 2.** The current check-in route selects `.select("id")`. Change to:
```typescript
.select("id, phone, notification_prefs")
```

### I6. Partner drip PartnerRow interface + select (affects Task 10)

**Override Task 10, Step 1.** Update `PartnerRow` interface in `src/app/api/cron/partner-drip/route.ts`:
```typescript
interface PartnerRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  promo_code: string | null;
  total_referrals: number;
  total_commission: number;
  last_activation_email_key: string | null;
  created_at: string;
  notification_prefs: Record<string, string> | null;
}
```
AND update the select query to include `phone, notification_prefs`.

### I7. CourtReminder interface loose typing (affects Task 3)

**Override Task 3, Step 3.** Replace:
```typescript
notification_prefs?: Record<string, string> | null;
```
With:
```typescript
notification_prefs?: Partial<import("./notification-prefs").ClientNotificationPrefs> | null;
```
Or if circular import is an issue, use inline type:
```typescript
notification_prefs?: { court_reminders?: "email" | "sms" | "both"; magic_link?: "email" | "sms" | "both"; check_in?: "email" | "sms" | "both"; post_court?: "email" | "sms" | "both" } | null;
```

### S2/S3. SMS messages may exceed 160 chars (affects Tasks 5, 10)

Cap all SMS bodies at 160 chars. Add helper to `src/lib/sms.ts`:
```typescript
/** Truncate SMS to 160 chars (single segment). Appends "..." if truncated. */
export function capSMS(text: string, maxLen = 160): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen - 3) + "...";
}
```
Use `capSMS(smsBody)` on all `sendSMS` calls where the body is dynamic (court reminders, partner drip, partner sale notification).

### S6. Webhook sends DUPLICATE partner sale email (affects Task 11)

The webhook already sends `partnerSaleNotificationEmail` (lines 558-578). Task 11 adds a SECOND email with holdback info. **Fix: REPLACE the existing notification block (lines 557-580) with the new preference-aware version from Task 11** instead of adding alongside it. Same for the metadata fallback path (lines 641-660).

### S7. Metadata fallback path needs same treatment (affects Task 11)

The Stripe webhook has two referral paths: primary (promo code discount, ~line 534) and metadata fallback (~line 617). **Task 11 must apply the preference-aware notification to BOTH paths.** Copy the same notification block to the metadata fallback path after its "Referral tracked" log line (~line 639).

---

## Phase 1: Foundation

### Task 1: Notification Preferences Library

**Files:**
- Create: `src/lib/notification-prefs.ts`
- Test: `tests/notification-prefs.test.ts`

- [ ] **Step 1: Write failing tests for preference merge logic**

```typescript
// tests/notification-prefs.test.ts
import { describe, it, expect } from "vitest";
import {
  getClientPrefs,
  getPartnerPrefs,
  autoUpgradeOnPhone,
  shouldSendEmail,
  shouldSendSMS,
  validateClientPrefs,
  CLIENT_DEFAULTS,
  PARTNER_DEFAULTS,
  COURT_REMINDER_SAFE_CHANNELS,
} from "@/lib/notification-prefs";

describe("getClientPrefs", () => {
  it("returns all defaults when overrides is null", () => {
    const prefs = getClientPrefs(null);
    expect(prefs).toEqual(CLIENT_DEFAULTS);
  });

  it("merges partial overrides with defaults", () => {
    const prefs = getClientPrefs({ court_reminders: "both" });
    expect(prefs.court_reminders).toBe("both");
    expect(prefs.magic_link).toBe("email");
    expect(prefs.check_in).toBe("email");
    expect(prefs.post_court).toBe("email");
  });

  it("handles empty object as overrides", () => {
    const prefs = getClientPrefs({});
    expect(prefs).toEqual(CLIENT_DEFAULTS);
  });
});

describe("getPartnerPrefs", () => {
  it("returns all defaults when overrides is null", () => {
    const prefs = getPartnerPrefs(null);
    expect(prefs).toEqual(PARTNER_DEFAULTS);
  });

  it("merges partial overrides with defaults", () => {
    const prefs = getPartnerPrefs({ payout: "sms", client_reminded: "both" });
    expect(prefs.payout).toBe("sms");
    expect(prefs.client_reminded).toBe("both");
    expect(prefs.magic_link).toBe("email");
    expect(prefs.drip).toBe("email");
  });
});

describe("autoUpgradeOnPhone", () => {
  it("upgrades court_reminders to both when currently null", () => {
    const result = autoUpgradeOnPhone(null);
    expect(result.court_reminders).toBe("both");
  });

  it("upgrades court_reminders from email to both", () => {
    const result = autoUpgradeOnPhone({ court_reminders: "email" });
    expect(result.court_reminders).toBe("both");
  });

  it("does not downgrade court_reminders if already both", () => {
    const result = autoUpgradeOnPhone({ court_reminders: "both" });
    expect(result.court_reminders).toBe("both");
  });

  it("preserves other overrides", () => {
    const result = autoUpgradeOnPhone({ magic_link: "sms" });
    expect(result.court_reminders).toBe("both");
    expect(result.magic_link).toBe("sms");
  });
});

describe("COURT_REMINDER_SAFE_CHANNELS", () => {
  it("only allows email or both for court_reminders (never sms-only)", () => {
    expect(COURT_REMINDER_SAFE_CHANNELS).toEqual(new Set(["email", "both"]));
  });
});

describe("validateClientPrefs", () => {
  it("rejects sms-only for court_reminders", () => {
    expect(validateClientPrefs({ court_reminders: "sms" })).toBe(false);
  });

  it("allows email or both for court_reminders", () => {
    expect(validateClientPrefs({ court_reminders: "email" })).toBe(true);
    expect(validateClientPrefs({ court_reminders: "both" })).toBe(true);
  });

  it("allows sms-only for non-court notification types", () => {
    expect(validateClientPrefs({ magic_link: "sms" })).toBe(true);
    expect(validateClientPrefs({ check_in: "sms" })).toBe(true);
  });
});

describe("shouldSendEmail / shouldSendSMS", () => {
  it("email: true for email and both", () => {
    expect(shouldSendEmail("email")).toBe(true);
    expect(shouldSendEmail("both")).toBe(true);
    expect(shouldSendEmail("sms")).toBe(false);
  });

  it("sms: true for sms and both", () => {
    expect(shouldSendSMS("sms")).toBe(true);
    expect(shouldSendSMS("both")).toBe(true);
    expect(shouldSendSMS("email")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/notification-prefs.test.ts`
Expected: FAIL, module `@/lib/notification-prefs` not found

- [ ] **Step 3: Implement notification-prefs.ts**

```typescript
// src/lib/notification-prefs.ts
/**
 * @fileoverview Notification channel preference system.
 *
 * JSONB override columns on court_reminders (client) and partners (bondsman)
 * store only non-default preferences. This module provides types, defaults,
 * merge logic, and channel routing helpers.
 *
 * DB columns: court_reminders.notification_prefs, partners.notification_prefs
 * Both are JSONB, nullable, default NULL (= all defaults).
 */

export type Channel = "email" | "sms" | "both";

export interface ClientNotificationPrefs {
  court_reminders: Channel;
  magic_link: Channel;
  check_in: Channel;
  post_court: Channel;
}

export interface PartnerNotificationPrefs {
  magic_link: Channel;
  client_reminded: Channel;
  drip: Channel;
  payout: Channel;
}

export const CLIENT_DEFAULTS: ClientNotificationPrefs = {
  court_reminders: "email",
  magic_link: "email",
  check_in: "email",
  post_court: "email",
};

export const PARTNER_DEFAULTS: PartnerNotificationPrefs = {
  magic_link: "email",
  client_reminded: "email",
  drip: "email",
  payout: "email",
};

// SAFETY: court_reminders must NEVER be "sms" alone. If phone is dead at 3AM,
// email is the fallback that keeps people out of jail.
export const COURT_REMINDER_SAFE_CHANNELS = new Set<Channel>(["email", "both"]);

export function getClientPrefs(
  overrides: Partial<ClientNotificationPrefs> | null
): ClientNotificationPrefs {
  return { ...CLIENT_DEFAULTS, ...overrides };
}

export function getPartnerPrefs(
  overrides: Partial<PartnerNotificationPrefs> | null
): PartnerNotificationPrefs {
  return { ...PARTNER_DEFAULTS, ...overrides };
}

/** Validates client pref overrides. Returns false if court_reminders is "sms" (unsafe). */
export function validateClientPrefs(overrides: Partial<ClientNotificationPrefs>): boolean {
  if (overrides.court_reminders && !COURT_REMINDER_SAFE_CHANNELS.has(overrides.court_reminders)) {
    return false;
  }
  return true;
}

export function autoUpgradeOnPhone(
  current: Partial<ClientNotificationPrefs> | null
): Partial<ClientNotificationPrefs> {
  const merged = { ...(current || {}) };
  if (!merged.court_reminders || merged.court_reminders === "email") {
    merged.court_reminders = "both";
  }
  return merged;
}

export function shouldSendEmail(pref: Channel): boolean {
  return pref === "email" || pref === "both";
}

export function shouldSendSMS(pref: Channel): boolean {
  return pref === "sms" || pref === "both";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/notification-prefs.test.ts`
Expected: All 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/notification-prefs.ts tests/notification-prefs.test.ts
git commit -m "feat(sms): add notification preference types, defaults, and merge logic"
```

---

### Task 2: Bird SMS Utility

**Files:**
- Create: `src/lib/sms.ts`
- Test: `tests/sms.test.ts`
- Delete: `src/lib/twilio.ts`
- Modify: `src/app/api/partner/magic-link/route.ts:13` (import swap)

- [ ] **Step 1: Write failing tests for sendSMS**

```typescript
// tests/sms.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("sendSMS", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    // Set env vars for each test
    vi.stubEnv("BIRD_API_KEY", "test-key");
    vi.stubEnv("BIRD_WORKSPACE_ID", "test-workspace");
    vi.stubEnv("BIRD_CHANNEL_ID", "test-channel");
  });

  it("returns not configured when env vars missing", async () => {
    vi.stubEnv("BIRD_API_KEY", "");
    vi.stubEnv("BIRD_WORKSPACE_ID", "");
    vi.stubEnv("BIRD_CHANNEL_ID", "");
    const { sendSMS } = await import("@/lib/sms");
    const result = await sendSMS("+15551234567", "test");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not configured");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends correct request to Bird API", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 202, json: async () => ({ id: "msg-1" }) });
    const { sendSMS } = await import("@/lib/sms");
    const result = await sendSMS("+15551234567", "Hello world");
    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.bird.com/workspaces/test-workspace/channels/test-channel/messages");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Authorization"]).toBe("AccessKey test-key");
    expect(opts.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(opts.body);
    expect(body.receiver.contacts[0].identifierValue).toBe("+15551234567");
    expect(body.body.text.text).toBe("Hello world");
  });

  it("returns error on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: "Invalid phone" }),
    });
    const { sendSMS } = await import("@/lib/sms");
    const result = await sendSMS("+1bad", "test");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid phone");
  });

  it("returns error on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network timeout"));
    const { sendSMS } = await import("@/lib/sms");
    const result = await sendSMS("+15551234567", "test");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Network timeout");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/sms.test.ts`
Expected: FAIL, module `@/lib/sms` not found

- [ ] **Step 3: Implement sms.ts**

```typescript
// src/lib/sms.ts
/**
 * @fileoverview Bird SMS utility.
 *
 * Sends SMS messages via Bird (formerly MessageBird) REST API.
 * Used for court date reminders, magic link auth, check-in confirmations,
 * partner notifications. Gracefully degrades if Bird credentials not configured.
 *
 * Env vars: BIRD_API_KEY, BIRD_WORKSPACE_ID, BIRD_CHANNEL_ID
 * API docs: https://docs.bird.com/api/channels-api/supported-channels/programmable-sms/sending-sms-messages
 */

const BIRD_API_KEY = process.env.BIRD_API_KEY;
const BIRD_WORKSPACE_ID = process.env.BIRD_WORKSPACE_ID;
const BIRD_CHANNEL_ID = process.env.BIRD_CHANNEL_ID;

export async function sendSMS(
  to: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  if (!BIRD_API_KEY || !BIRD_WORKSPACE_ID || !BIRD_CHANNEL_ID) {
    console.warn("[Bird SMS] Not configured, skipping SMS to", to);
    return { success: false, error: "SMS not configured" };
  }

  try {
    const url = `https://api.bird.com/workspaces/${BIRD_WORKSPACE_ID}/channels/${BIRD_CHANNEL_ID}/messages`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `AccessKey ${BIRD_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        receiver: {
          contacts: [{ identifierValue: to }],
        },
        body: {
          type: "text",
          text: { text: body },
        },
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const errMsg = (data as Record<string, string>).message || `HTTP ${res.status}`;
      console.error("[Bird SMS] Send failed:", errMsg);
      return { success: false, error: errMsg };
    }

    return { success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Bird SMS] Error:", errMsg);
    return { success: false, error: errMsg };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/sms.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Swap import in partner magic-link route**

In `src/app/api/partner/magic-link/route.ts`, change line 13:

```typescript
// OLD
import { sendSMS } from "@/lib/twilio";
// NEW
import { sendSMS } from "@/lib/sms";
```

- [ ] **Step 6: Delete twilio.ts**

```bash
git rm src/lib/twilio.ts
```

- [ ] **Step 7: Type check**

Run: `npx tsc,noEmit`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add src/lib/sms.ts tests/sms.test.ts src/app/api/partner/magic-link/route.ts
git commit -m "feat(sms): replace Twilio with Bird API, same sendSMS interface"
```

---

### Task 3: Database Migration

**Files:**
- Create: `supabase/migrations/20260414a_sms_notification_prefs.sql`
- Modify: `supabase/SCHEMA.md` (document new columns)
- Modify: `src/lib/court-reminders.ts` (update CourtReminder interface)

- [ ] **Step 1: Write migration SQL**

```sql
, supabase/migrations/20260414a_sms_notification_prefs.sql
, Bird SMS + notification preference system foundation.
, Adds phone, notification_prefs (JSONB overrides), sms_consent_at to court_reminders.
, Adds notification_prefs to partners.
, Adds locked_at to partner_referrals for 45-day commission holdback.

, Client phone + SMS consent
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS sms_consent_at timestamptz;

, Notification preferences (JSONB overrides, NULL = all defaults)
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS notification_prefs jsonb;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS notification_prefs jsonb;

, Commission holdback (45-day locking period)
ALTER TABLE partner_referrals ADD COLUMN IF NOT EXISTS locked_at timestamptz;
```

- [ ] **Step 2: Apply migration via Supabase Management API**

Read `C:\Users\email\.claude\projects\C, Users-email-projects-ImNotAnAttorney-web\memory\reference-supabase-management-api.md` for the API pattern. Apply using the management API, do NOT use `supabase db push` CLI.

- [ ] **Step 3: Update CourtReminder interface**

In `src/lib/court-reminders.ts`, add new fields to the interface (after line 29):

```typescript
export interface CourtReminder {
  id: string;
  token: string;
  first_name: string;
  email: string;
  charge_type: string;
  county_state: string;
  court_date: string;
  recommended_tier: string | null;
  partner_promo_code: string | null;
  status: "active" | "completed" | "unsubscribed";
  reminders_sent: string[];
  created_at: string;
  converted_at: string | null;
  order_id: string | null;
  indemnitor_name?: string | null;
  indemnitor_email?: string | null;
  last_name?: string | null;
  phone?: string | null;
  sms_consent_at?: string | null;
  notification_prefs?: Record<string, string> | null;
}
```

- [ ] **Step 4: Update SCHEMA.md**

Add these columns to the `court_reminders` and `partners` table documentation in `supabase/SCHEMA.md`:

Under `court_reminders`:
```
phone               | text        | NULL    | Client phone (E.164), optional
sms_consent_at      | timestamptz | NULL    | When client consented to SMS (10DLC compliance)
notification_prefs  | jsonb       | NULL    | Channel pref overrides {court_reminders,magic_link,check_in,post_court}
```

Under `partners`:
```
notification_prefs  | jsonb       | NULL    | Channel pref overrides {magic_link,client_reminded,drip,payout}
```

Under `partner_referrals`:
```
locked_at           | timestamptz | NULL    | Commission confirmed after 45-day holdback
```

- [ ] **Step 5: Type check**

Run: `npx tsc,noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260414a_sms_notification_prefs.sql supabase/SCHEMA.md src/lib/court-reminders.ts
git commit -m "feat(sms): add phone, notification_prefs, locked_at columns"
```

---

## Phase 2: Client SMS

### Task 4: Phone Collection on Prep Page

**Files:**
- Create: `src/components/PhoneOptIn.tsx`
- Create: `src/app/api/court-reminders/[token]/phone/route.ts`
- Modify: `src/app/prep/[token]/page.tsx` (add PhoneOptIn section)

- [ ] **Step 1: Build phone collection API route**

```typescript
// src/app/api/court-reminders/[token]/phone/route.ts
/**
 * PATCH /api/court-reminders/[token]/phone, Add phone to a court reminder.
 *
 * Validates E.164 format, stores phone + sms_consent_at,
 * auto-upgrades notification_prefs.court_reminders to "both".
 * No auth beyond token (same access model as prep page).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoUpgradeOnPhone } from "@/lib/notification-prefs";

const E164_REGEX = /^\+1\d{10}$/;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  let body: { phone: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const phone = (body.phone || "").replace(/[\s\-\(\)\.]/g, "");
  if (!E164_REGEX.test(phone)) {
    return NextResponse.json(
      { error: "Phone must be a valid US number (e.g. +15551234567)" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Verify token exists and is active
  const { data: reminder, error: fetchErr } = await supabase
    .from("court_reminders")
    .select("id, notification_prefs")
    .eq("token", token)
    .eq("status", "active")
    .maybeSingle();

  if (fetchErr || !reminder) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const upgradedPrefs = autoUpgradeOnPhone(reminder.notification_prefs);

  const { error: updateErr } = await supabase
    .from("court_reminders")
    .update({
      phone,
      sms_consent_at: new Date().toISOString(),
      notification_prefs: upgradedPrefs,
    })
    .eq("id", reminder.id);

  if (updateErr) {
    console.error("[Phone OptIn] Update error:", updateErr);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Build PhoneOptIn client component**

```tsx
// src/components/PhoneOptIn.tsx
"use client";
/**
 * Phone opt-in for text reminders. Shown on prep page after initial signup.
 * Single phone input + 10DLC consent checkbox + submit.
 */

import { useState } from "react";

interface PhoneOptInProps {
  token: string;
  hasPhone: boolean;
}

export function PhoneOptIn({ token, hasPhone }: PhoneOptInProps) {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">(
    hasPhone ? "done" : "idle"
  );
  const [error, setError] = useState("");

  if (status === "done") {
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-center">
        <p className="text-green-400 text-sm font-medium">
          Text reminders are set up.
        </p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) {
      setError("Please agree to receive text reminders.");
      return;
    }
    setError("");
    setStatus("submitting");

    // Normalize: strip formatting, prepend +1 if needed
    let normalized = phone.replace(/[\s\-\(\)\.]/g, "");
    if (/^\d{10}$/.test(normalized)) normalized = "+1" + normalized;
    if (!/^\+1\d{10}$/.test(normalized)) {
      setError("Enter a valid 10-digit US phone number.");
      setStatus("idle");
      return;
    }

    try {
      const res = await fetch(`/api/court-reminders/${token}/phone`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong.");
        setStatus("idle");
        return;
      }

      setStatus("done");
    } catch {
      setError("Connection error. Try again.");
      setStatus("idle");
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
      <h3 className="text-sm font-bold text-amber-400 mb-2">
        Want a text reminder before your court date?
      </h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none text-sm"
          aria-label="Phone number for text reminders"
        />
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 accent-amber-500"
          />
          <span className="text-xs text-zinc-400 leading-tight">
            I agree to receive court date reminder texts from ImNotAnAttorney.
            Msg frequency varies. Msg &amp; data rates may apply. Reply HELP
            for help, STOP to opt out.
          </span>
        </label>
        {error && <p className="text-red-400 text-xs" role="alert">{error}</p>}
        <button
          type="submit"
          disabled={status === "submitting"}
          className="w-full px-4 py-2 bg-amber-500 text-black font-bold rounded-lg text-sm hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
        >
          {status === "submitting" ? "Saving..." : "Get Text Reminders"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Add PhoneOptIn to prep page**

In `src/app/prep/[token]/page.tsx`, after fetching the reminder data and before the insider tips section:

1. Add `phone` to the select query (wherever the reminder row is fetched).
2. Import `PhoneOptIn` from `@/components/PhoneOptIn`.
3. Render `<PhoneOptIn token={token} hasPhone={!!reminder.phone} />` after the header section, before insider tips.

Exact insertion point depends on current page structure, the component goes between the header/hero and the first content section.

- [ ] **Step 4: Type check**

Run: `npx tsc,noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/components/PhoneOptIn.tsx src/app/api/court-reminders/[token]/phone/route.ts src/app/prep/[token]/page.tsx
git commit -m "feat(sms): phone collection on prep page with 10DLC consent"
```

---

### Task 5: Court Reminder Cron, SMS Path

**Files:**
- Modify: `src/app/api/cron/court-reminders/route.ts`

- [ ] **Step 1: Add imports**

At top of `src/app/api/cron/court-reminders/route.ts`, add:

```typescript
import { sendSMS } from "@/lib/sms";
import { getClientPrefs, shouldSendEmail, shouldSendSMS } from "@/lib/notification-prefs";
```

- [ ] **Step 2: Update reminder sending logic**

Replace the inner loop body (lines 101-128) where pre-court reminders are sent. Currently sends email unconditionally. Change to check prefs:

```typescript
// Pre-court reminders
for (const interval of REMINDER_INTERVALS) {
  if (daysUntil <= interval.daysBefore && !alreadySent.has(interval.key)) {
    const builder = EMAIL_BUILDERS[interval.key];
    if (!builder) continue;

    const prefs = getClientPrefs(r.notification_prefs);

    try {
      const email = builder(ctx);

      // Send email if preferred
      if (shouldSendEmail(prefs.court_reminders)) {
        await sendEmail({ to: r.email, subject: email.subject, html: email.html });
      }

      // Send SMS if preferred and phone on file
      if (shouldSendSMS(prefs.court_reminders) && r.phone) {
        const smsBody = `${r.first_name}, your court date is in ${interval.daysBefore} day${interval.daysBefore === 1 ? "" : "s"} (${r.court_date}). Prep: ${process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com"}/prep/${r.token}`;
        const smsResult = await sendSMS(r.phone, smsBody);
        if (!smsResult.success) {
          console.warn(`[Court Reminders Cron] SMS failed for ${r.id}:`, smsResult.error);
        }
      }

      alreadySent.add(interval.key);
      sent++;

      // Send to indemnitor (co-signer) if applicable, email only for now
      if (r.indemnitor_email) {
        try {
          await sendEmail({
            to: r.indemnitor_email,
            subject: `${r.first_name}'s court date reminder`,
            html: email.html,
          });
        } catch (e) {
          console.warn(`[Court Reminders Cron] Indemnitor email failed for ${r.id}:`, e);
        }
      }
    } catch (e) {
      console.error(`[Court Reminders Cron] Failed ${interval.key} for ${r.id}:`, e);
      errors++;
    }
  }
}
```

- [ ] **Step 3: Update post-court sending similarly**

In the post-court block (around line 132), add the same pattern:

```typescript
// Post-court follow-up (+1 day)
if (daysUntil < -1 && !alreadySent.has(POST_COURT_KEY)) {
  const prefs = getClientPrefs(r.notification_prefs);
  try {
    const email = postCourtEmail(ctx);

    if (shouldSendEmail(prefs.post_court)) {
      await sendEmail({ to: r.email, subject: email.subject, html: email.html });
    }

    if (shouldSendSMS(prefs.post_court) && r.phone) {
      await sendSMS(r.phone, `${r.first_name}, how did your court date go? We'd love to hear: https://imnotanattorney.com`);
    }

    alreadySent.add(POST_COURT_KEY);
    sent++;

    await supabase
      .from("court_reminders")
      .update({ status: "completed", reminders_sent: Array.from(alreadySent) })
      .eq("id", r.id);
    continue;
  } catch (e) {
    console.error(`[Court Reminders Cron] Failed post_court for ${r.id}:`, e);
    errors++;
  }
}
```

- [ ] **Step 4: Add bondsman "client reminded" notification**

After the pre-court reminder loop (after the indemnitor email), add partner notification:

```typescript
// Notify bondsman that we reminded their client
if (r.partner_promo_code && partnerMap[r.partner_promo_code]) {
  const partnerCode = r.partner_promo_code;
  // Fetch partner prefs (batch this outside loop in a future optimization)
  const { data: partnerRow } = await supabase
    .from("partners")
    .select("email, phone, notification_prefs")
    .eq("promo_code", partnerCode)
    .maybeSingle();

  if (partnerRow) {
    const partnerPrefs = getPartnerPrefs(partnerRow.notification_prefs);
    const partnerMsg = `We reminded ${r.first_name} about their court date on ${r.court_date}.`;

    if (shouldSendEmail(partnerPrefs.client_reminded)) {
      try {
        await sendEmail({
          to: partnerRow.email,
          subject: `Client reminder sent: ${r.first_name}`,
          html: `<p style="color:#D4D4D8;font-size:15px;">${partnerMsg}</p>`,
        });
      } catch (e) {
        console.warn("[Court Reminders Cron] Partner notification email failed:", e);
      }
    }

    if (shouldSendSMS(partnerPrefs.client_reminded) && partnerRow.phone) {
      const smsResult = await sendSMS(partnerRow.phone, `INAA: ${partnerMsg}`);
      if (!smsResult.success) {
        console.warn("[Court Reminders Cron] Partner notification SMS failed:", smsResult.error);
      }
    }
  }
}
```

Also add import at top: `import { getClientPrefs, getPartnerPrefs, shouldSendEmail, shouldSendSMS } from "@/lib/notification-prefs";`

- [ ] **Step 5: Type check**

Run: `npx tsc,noEmit`
Expected: 0 errors

- [ ] **Step 6: Run existing tests**

Run: `npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add src/app/api/cron/court-reminders/route.ts
git commit -m "feat(sms): court reminder cron sends SMS + notifies bondsman per prefs"
```

---

### Task 6: Client Magic Link SMS

**Files:**
- Modify: `src/app/api/customer/magic-link/route.ts`

- [ ] **Step 1: Add SMS to customer magic link**

Add imports at top:

```typescript
import { sendSMS } from "@/lib/sms";
import { getClientPrefs, shouldSendSMS, shouldSendEmail } from "@/lib/notification-prefs";
```

After `generateCustomerMagicLink` succeeds (around line 72), look up the customer's phone and prefs from their most recent court_reminders row:

```typescript
const { token } = result;
const magicUrl = `${SITE_URL}/my-cases/login/verify#token=${token}`;

// Look up customer phone + notification prefs from their court reminder
const { data: reminderRow } = await supabase
  .from("court_reminders")
  .select("phone, notification_prefs")
  .eq("email", normalizedEmail)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

const prefs = getClientPrefs(reminderRow?.notification_prefs || null);

// Send via email if preferred
if (shouldSendEmail(prefs.magic_link)) {
  await sendCustomerMagicLinkEmail(normalizedEmail, magicUrl);
}

// Send via SMS if preferred and phone on file
if (shouldSendSMS(prefs.magic_link) && reminderRow?.phone) {
  const smsResult = await sendSMS(
    reminderRow.phone,
    `ImNotAnAttorney login: ${magicUrl}, expires in 15 min.`
  );
  if (!smsResult.success) {
    console.warn("[Customer Magic Link] SMS failed:", smsResult.error);
  }
}
```

Remove the existing unconditional `sendCustomerMagicLinkEmail` call and replace with the preference-aware version above.

- [ ] **Step 2: Type check**

Run: `npx tsc,noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/customer/magic-link/route.ts
git commit -m "feat(sms): customer magic link respects notification channel prefs"
```

---

### Task 7: Check-In Confirmation SMS

**Files:**
- Modify: `src/app/api/check-in/route.ts`

- [ ] **Step 1: Read current check-in route**

Read `src/app/api/check-in/route.ts` to understand current structure.

- [ ] **Step 2: Add SMS confirmation**

After successful check-in insert, look up the court_reminder's phone and prefs:

```typescript
import { sendSMS } from "@/lib/sms";
import { getClientPrefs, shouldSendSMS } from "@/lib/notification-prefs";
```

After the check-in row is inserted successfully:

```typescript
// Send SMS confirmation if preferred
if (reminder.phone) {
  const prefs = getClientPrefs(reminder.notification_prefs);
  if (shouldSendSMS(prefs.check_in)) {
    await sendSMS(
      reminder.phone,
      `Check-in confirmed for ${new Date().toLocaleDateString()}. Next check-in available in 12 hours.`
    ).catch((e) => console.warn("[Check-In] SMS failed:", e));
  }
}
```

Ensure the reminder query includes `phone` and `notification_prefs` in the select.

- [ ] **Step 3: Type check**

Run: `npx tsc,noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/check-in/route.ts
git commit -m "feat(sms): check-in confirmation respects notification channel prefs"
```

---

## Phase 3: Bondsman SMS

### Task 8: Partner Magic Link, Preference-Aware

**Files:**
- Modify: `src/app/api/partner/magic-link/route.ts`

- [ ] **Step 1: Update to read notification prefs**

Import notification-prefs:

```typescript
import { getPartnerPrefs, shouldSendEmail, shouldSendSMS } from "@/lib/notification-prefs";
```

In `generateMagicLink` return type, the partner already includes phone. After getting the result (around line 70), wrap the email/SMS sends in pref checks:

```typescript
const { token, partner } = result;
const magicUrl = `${SITE_URL}/partner/login/verify#token=${token}`;

// Fetch partner notification prefs
const { data: partnerRow } = await supabase
  .from("partners")
  .select("notification_prefs")
  .eq("id", partner.id)
  .maybeSingle();

const prefs = getPartnerPrefs(partnerRow?.notification_prefs || null);

// Send via email if preferred
if (shouldSendEmail(prefs.magic_link)) {
  await sendEmail({
    to: normalizedEmail,
    subject: "Your ImNotAnAttorney Partner Login Link",
    html: `...existing HTML...`,
  });
}

// Send via SMS if preferred and phone on file
if (shouldSendSMS(prefs.magic_link) && partner.phone) {
  const smsResult = await sendSMS(
    partner.phone,
    `ImNotAnAttorney Partner Login: ${magicUrl}, expires in 15 min.`
  );
  if (!smsResult.success) {
    console.warn("[Partner Magic Link] SMS failed:", smsResult.error);
  }
}
```

Replace the existing unconditional email send + conditional SMS send with the preference-aware version.

- [ ] **Step 2: Type check**

Run: `npx tsc,noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/partner/magic-link/route.ts
git commit -m "feat(sms): partner magic link respects notification channel prefs"
```

---

### Task 9: Bondsman Notification Settings UI

**Files:**
- Create: `src/components/partner/NotificationSettings.tsx`
- Create: `src/app/api/partner/notification-prefs/route.ts`
- Modify: `src/app/partner/dashboard/page.tsx` (add settings section)

- [ ] **Step 1: Build notification prefs API route**

```typescript
// src/app/api/partner/notification-prefs/route.ts
/**
 * GET/PATCH /api/partner/notification-prefs, Read/update partner notification preferences.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePartnerAuth } from "@/lib/partner-helpers";
import type { PartnerNotificationPrefs } from "@/lib/notification-prefs";
import { PARTNER_DEFAULTS, getPartnerPrefs } from "@/lib/notification-prefs";

const VALID_CHANNELS = new Set(["email", "sms", "both"]);
const VALID_KEYS = new Set(Object.keys(PARTNER_DEFAULTS));

export async function GET(req: NextRequest) {
  const { partner, error } = await requirePartnerAuth(req);
  if (error) return error;

  const prefs = getPartnerPrefs(partner.notification_prefs || null);
  return NextResponse.json(prefs);
}

export async function PATCH(req: NextRequest) {
  const { partner, error: authError } = await requirePartnerAuth(req);
  if (authError) return authError;

  let body: Partial<PartnerNotificationPrefs>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate: only known keys, only valid channels
  for (const [key, val] of Object.entries(body)) {
    if (!VALID_KEYS.has(key)) {
      return NextResponse.json({ error: `Unknown key: ${key}` }, { status: 400 });
    }
    if (!VALID_CHANNELS.has(val as string)) {
      return NextResponse.json({ error: `Invalid channel for ${key}: ${val}` }, { status: 400 });
    }
  }

  // SMS requires phone on file
  const needsSMS = Object.values(body).some((v) => v === "sms" || v === "both");
  if (needsSMS && !partner.phone) {
    return NextResponse.json(
      { error: "Add your phone number before enabling SMS notifications." },
      { status: 400 }
    );
  }

  // Merge with existing overrides
  const existing = partner.notification_prefs || {};
  const updated = { ...existing, ...body };

  const supabase = createAdminClient();
  const { error: updateErr } = await supabase
    .from("partners")
    .update({ notification_prefs: updated })
    .eq("id", partner.id);

  if (updateErr) {
    console.error("[Partner Notification Prefs] Update error:", updateErr);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json(getPartnerPrefs(updated));
}
```

- [ ] **Step 2: Build NotificationSettings client component**

```tsx
// src/components/partner/NotificationSettings.tsx
"use client";
/**
 * Notification preference settings for partners.
 * Grid of 4 notification types x 3 channel options.
 */

import { useState, useEffect } from "react";

type Channel = "email" | "sms" | "both";

interface Prefs {
  magic_link: Channel;
  client_reminded: Channel;
  drip: Channel;
  payout: Channel;
}

const LABELS: Record<keyof Prefs, string> = {
  magic_link: "Login links",
  client_reminded: "Client reminder alerts",
  drip: "Tips & onboarding",
  payout: "Commission & payouts",
};

const CHANNELS: Channel[] = ["email", "sms", "both"];

interface NotificationSettingsProps {
  hasPhone: boolean;
}

export function NotificationSettings({ hasPhone }: NotificationSettingsProps) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/partner/notification-prefs")
      .then((r) => r.json())
      .then(setPrefs)
      .catch(() => setError("Failed to load preferences"));
  }, []);

  async function handleChange(key: keyof Prefs, channel: Channel) {
    if (!prefs) return;
    if ((channel === "sms" || channel === "both") && !hasPhone) {
      setError("Add your phone number first to enable SMS.");
      return;
    }
    setError("");
    setSaving(true);
    setSaved(false);

    const updated = { ...prefs, [key]: channel };
    setPrefs(updated);

    try {
      const res = await fetch("/api/partner/notification-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: channel }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to save");
        setPrefs(prefs); // revert
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      setError("Connection error");
      setPrefs(prefs); // revert
    }
    setSaving(false);
  }

  if (!prefs) return <div className="text-zinc-500 text-sm">Loading preferences...</div>;

  return (
    <section className="bg-zinc-900 rounded-xl border border-zinc-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Notification Preferences</h2>
        {saved && <span className="text-green-400 text-xs">Saved</span>}
      </div>
      <div className="space-y-3">
        {(Object.keys(LABELS) as (keyof Prefs)[]).map((key) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="text-sm text-zinc-300">{LABELS[key]}</span>
            <div className="flex gap-1">
              {CHANNELS.map((ch) => (
                <button
                  key={ch}
                  onClick={() => handleChange(key, ch)}
                  disabled={saving}
                  className={`px-3 py-1 text-xs rounded-lg transition-colors cursor-pointer ${
                    prefs[key] === ch
                      ? "bg-amber-500 text-black font-bold"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                  aria-label={`${LABELS[key]}: ${ch}`}
                  aria-pressed={prefs[key] === ch}
                >
                  {ch === "both" ? "Both" : ch === "sms" ? "SMS" : "Email"}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {error && <p className="text-red-400 text-xs mt-2" role="alert">{error}</p>}
      {!hasPhone && (
        <p className="text-zinc-500 text-xs mt-3">
          Add your phone number to enable SMS options.
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Add NotificationSettings to partner dashboard**

In `src/app/partner/dashboard/page.tsx`:
1. Import `NotificationSettings` from `@/components/partner/NotificationSettings`
2. The partner data is already fetched (includes `phone`). Pass `hasPhone={!!partner.phone}`.
3. Add `<NotificationSettings hasPhone={!!partner.phone} />` after the existing sections (below ComplianceReportButton or EarningsSection).

- [ ] **Step 4: Update requirePartnerAuth to include notification_prefs**

Check `src/lib/partner-helpers.ts`, ensure `requirePartnerAuth` returns `notification_prefs` in the partner object. If the select query doesn't include it, add it.

- [ ] **Step 5: Type check**

Run: `npx tsc,noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/components/partner/NotificationSettings.tsx src/app/api/partner/notification-prefs/route.ts src/app/partner/dashboard/page.tsx
git commit -m "feat(sms): bondsman notification settings, per-type channel preferences"
```

---

### Task 10: Partner Drip, SMS Path

**Files:**
- Modify: `src/app/api/cron/partner-drip/route.ts`

- [ ] **Step 1: Add SMS to partner drip**

Add imports:

```typescript
import { sendSMS } from "@/lib/sms";
import { getPartnerPrefs, shouldSendEmail, shouldSendSMS } from "@/lib/notification-prefs";
```

In the sending loop, wrap the existing `sendEmail` call:

```typescript
const prefs = getPartnerPrefs(partner.notification_prefs);

if (shouldSendEmail(prefs.drip)) {
  await sendEmail({ to: partner.email, subject: email.subject, html: email.html });
}

if (shouldSendSMS(prefs.drip) && partner.phone) {
  // Short SMS version, strip HTML, truncate to 160 chars
  const smsBody = email.subject + ". Check your partner dashboard: https://imnotanattorney.com/partner/dashboard";
  await sendSMS(partner.phone, smsBody);
}
```

Ensure the partner query includes `phone` and `notification_prefs` in the select.

- [ ] **Step 2: Type check**

Run: `npx tsc,noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/partner-drip/route.ts
git commit -m "feat(sms): partner drip sequence respects notification channel prefs"
```

---

### Task 11: Commission Sale Notification (Stripe Webhook)

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts`

- [ ] **Step 1: Read the Stripe webhook referral tracking section**

Read `src/app/api/webhooks/stripe/route.ts` lines 520-580 where partner referral is tracked.

- [ ] **Step 2: Add "sale earned" notification after referral insert**

After the existing partner referral tracking succeeds (after the `console.log` that says "Referral tracked"), add:

```typescript
import { sendSMS } from "@/lib/sms";
import { getPartnerPrefs, shouldSendEmail, shouldSendSMS } from "@/lib/notification-prefs";
```

```typescript
// Notify partner of earned commission
if (partnerDetail) {
  const partnerPrefs = getPartnerPrefs(partnerDetail.notification_prefs || null);
  const holdbackDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toLocaleDateString();
  const commissionDollars = (commissionAmount / 100).toFixed(2);

  if (shouldSendEmail(partnerPrefs.payout)) {
    try {
      await sendEmail({
        to: partnerDetail.email,
        subject: `You earned $${commissionDollars} from a new referral`,
        html: `
          <p style="color:#D4D4D8;font-size:15px;">A new sale just came through your referral link.</p>
          <p style="color:#F59E0B;font-size:20px;font-weight:bold;">Commission: $${commissionDollars}</p>
          <p style="color:#D4D4D8;font-size:14px;">Status: Pending (confirms ${holdbackDate})</p>
          <p style="color:#71717A;font-size:13px;">Confirmed commissions are included in your next monthly payout.</p>
        `,
      });
    } catch (e) {
      console.warn("[Webhook] Partner sale notification email failed:", e);
    }
  }

  if (shouldSendSMS(partnerPrefs.payout) && partnerDetail.phone) {
    await sendSMS(
      partnerDetail.phone,
      `INAA: You earned $${commissionDollars} from a new referral! Confirms ${holdbackDate}.`
    ).catch((e) => console.warn("[Webhook] Partner sale notification SMS failed:", e));
  }
}
```

Ensure `partnerDetail` select includes `phone, notification_prefs`.

- [ ] **Step 3: Type check**

Run: `npx tsc,noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts
git commit -m "feat(sms): notify partner on sale earned via preferred channel"
```

---

## Phase 4: Payout Infrastructure

### Task 12: Commission Locking Cron

**Files:**
- Create: `src/app/api/cron/lock-commissions/route.ts`

- [ ] **Step 1: Build commission locking cron**

```typescript
// src/app/api/cron/lock-commissions/route.ts
/**
 * GET /api/cron/lock-commissions, Lock commissions past 45-day holdback.
 *
 * Schedule: Daily via cron-job.org.
 * Protected by CRON_AUTH_TOKEN bearer token.
 *
 * Sets locked_at on partner_referrals older than 45 days with no refund.
 * Sends "commission confirmed" notification to partner per payout pref.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { sendSMS } from "@/lib/sms";
import { getPartnerPrefs, shouldSendEmail, shouldSendSMS } from "@/lib/notification-prefs";

const HOLDBACK_DAYS = 45;

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const lock = await acquireCronLock("lock-commissions", 23 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();
  let locked = 0;
  let errors = 0;

  try {
    const cutoff = new Date(Date.now() - HOLDBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Find unlocked referrals past holdback
    const { data: referrals, error: fetchErr } = await supabase
      .from("partner_referrals")
      .select("id, partner_id, commission_amount")
      .is("locked_at", null)
      .lt("created_at", cutoff)
      .limit(200);

    if (fetchErr) {
      console.error("[Lock Commissions] Fetch error:", fetchErr);
      await releaseCronLock(lock.executionId, "failed");
      return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
    }

    if (!referrals || referrals.length === 0) {
      await releaseCronLock(lock.executionId, "completed");
      return NextResponse.json({ locked: 0, message: "No commissions to lock" });
    }

    // Group by partner for batch notifications
    const byPartner: Record<string, { ids: string[]; total: number }> = {};
    for (const r of referrals) {
      if (!byPartner[r.partner_id]) {
        byPartner[r.partner_id] = { ids: [], total: 0 };
      }
      byPartner[r.partner_id].ids.push(r.id);
      byPartner[r.partner_id].total += r.commission_amount || 0;
    }

    // Lock each referral
    const allIds = referrals.map((r) => r.id);
    const { error: lockErr } = await supabase
      .from("partner_referrals")
      .update({ locked_at: new Date().toISOString() })
      .in("id", allIds);

    if (lockErr) {
      console.error("[Lock Commissions] Lock error:", lockErr);
      errors++;
    } else {
      locked = allIds.length;
    }

    // Notify each partner
    for (const [partnerId, { total }] of Object.entries(byPartner)) {
      const { data: partner } = await supabase
        .from("partners")
        .select("email, phone, notification_prefs, name")
        .eq("id", partnerId)
        .maybeSingle();

      if (!partner) continue;

      const prefs = getPartnerPrefs(partner.notification_prefs);
      const dollars = (total / 100).toFixed(2);

      if (shouldSendEmail(prefs.payout)) {
        try {
          await sendEmail({
            to: partner.email,
            subject: `$${dollars} commission confirmed`,
            html: `
              <p style="color:#D4D4D8;font-size:15px;">Hey ${partner.name},</p>
              <p style="color:#F59E0B;font-size:20px;font-weight:bold;">$${dollars} confirmed</p>
              <p style="color:#D4D4D8;font-size:14px;">This amount is confirmed and will be included in your next monthly payout on the 1st.</p>
            `,
          });
        } catch (e) {
          console.warn("[Lock Commissions] Notification email failed:", e);
        }
      }

      if (shouldSendSMS(prefs.payout) && partner.phone) {
        await sendSMS(
          partner.phone,
          `INAA: $${dollars} commission confirmed! Included in your next monthly payout.`
        ).catch((e) => console.warn("[Lock Commissions] Notification SMS failed:", e));
      }
    }

    await releaseCronLock(lock.executionId, "completed");
    return NextResponse.json({ locked, errors, partners: Object.keys(byPartner).length });
  } catch (err) {
    console.error("[Lock Commissions] Fatal:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Register cron job**

Register with cron-job.org: daily at 06:00 UTC, hitting `https://imnotanattorney.com/api/cron/lock-commissions` with Bearer `CRON_AUTH_TOKEN`.

Use the cron-job.org API:
```bash
node -e "
const url = 'https://api.cron-job.org/jobs';
const key = 'qmy3F+k6DrUgKCz/Jp8fEnpViJrE3pgaUfOoO8yAQn4=';
fetch(url, {
  method: 'PUT',
  headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    job: {
      url: 'https://imnotanattorney.com/api/cron/lock-commissions',
      title: 'INAA Lock Commissions (daily)',
      enabled: true,
      saveResponses: true,
      schedule: { timezone: 'UTC', hours: [6], mdays: [-1], minutes: [0], months: [-1], wdays: [-1] },
      requestMethod: 0,
      extendedData: { headers: { Authorization: 'Bearer ' + process.env.CRON_AUTH_TOKEN } }
    }
  })
}).then(r => r.json()).then(console.log);
"
```

- [ ] **Step 3: Type check**

Run: `npx tsc,noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/lock-commissions/route.ts
git commit -m "feat(payout): commission locking cron, 45-day holdback + partner notifications"
```

---

### Task 13: Update ARCHITECTURE.md

**Files:**
- Modify: `ARCHITECTURE.md`

- [ ] **Step 1: Add SMS + notification system documentation**

Add a new section to ARCHITECTURE.md documenting:
- Bird SMS integration (env vars, sendSMS utility)
- Notification preference system (JSONB overrides, defaults, merge logic)
- Client notification types: court_reminders, magic_link, check_in, post_court
- Partner notification types: magic_link, client_reminded, drip, payout
- Commission holdback: 45-day locking, locked_at column, daily cron
- 10DLC compliance requirements

- [ ] **Step 2: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs: add SMS notification system and payout holdback to architecture"
```

---

### Task 14: Final Verification

- [ ] **Step 1: Full type check**

Run: `npx tsc,noEmit`
Expected: 0 errors

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (existing + new notification-prefs + sms tests)

- [ ] **Step 3: Run CV**

Run: `node ~/projects/continuous-verification/verify.mjs,project inna,probe-only,no-trends`
Expected: All probes pass (except pre-existing H2 drift)

- [ ] **Step 4: Verify no Twilio references remain**

Run: `grep -r "twilio\|TWILIO" src/,include="*.ts",include="*.tsx"`
Expected: No matches

- [ ] **Step 5: Final commit if any remaining changes**

```bash
git status
# Stage and commit any remaining changes
```

---

## External Tasks (Rahim)

These require manual action outside the codebase:

1. **Bird account setup:** Sign up at bird.com, create workspace, install SMS channel, get API key + workspace ID + channel ID.
2. **10DLC registration:** Register brand + campaign with Bird for US carrier compliance (~$15).
3. **Vercel env vars:** Add `BIRD_API_KEY`, `BIRD_WORKSPACE_ID`, `BIRD_CHANNEL_ID` to production Vercel project. Remove `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`.
4. **Terms update:** Add 45-day holdback clause to partner terms (Section 5).
