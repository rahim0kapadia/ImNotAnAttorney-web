# Bird SMS + Notification Preference System, Implementation Plan v2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> 
> **SUPERSEDES:** `2026-04-13-bird-sms-notification-system.md` (v1 had override-based fixes that contradicted task code blocks). This v2 merges ALL review fixes directly into task code. No separate override section needed.

**Goal:** Replace Twilio with Bird SMS API and build a per-notification-type channel preference system for both clients (defendants) and partners (bondsmen).

**Architecture:** JSONB override columns on `court_reminders` and `partners` tables store only non-default preferences. Application-level merge with hardcoded defaults. Bird API utility replaces Twilio with same `sendSMS()` interface. Phone collected post-submit on prep page (gradual engagement). Bondsman notification settings on dashboard. `dispatchNotification()` helper centralizes channel routing + consent checks.

**Tech Stack:** Next.js 15, Supabase (PostgreSQL), Bird REST API, Vitest, TypeScript

**Spec:** `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-04-13-bird-sms-notification-system-design.md`

**Safety invariants (enforced in code):**
- `court_reminders` channel: "email" or "both" only, NEVER "sms" alone. Keeps people out of jail.
- All client SMS gated on `sms_consent_at` being set (10DLC compliance).
- All user-supplied strings escaped with `escapeHtml()` before email HTML interpolation.
- All dynamic SMS bodies capped at 160 chars via `capSMS()`.
- Commission locking excludes refunded orders (`commission_amount > 0`).

---

## Phase 1: Foundation

### Task 1: Notification Preferences Library

**Files:**
- Create: `src/lib/notification-prefs.ts`
- Test: `tests/notification-prefs.test.ts`

- [ ] **Step 1: Write failing tests**

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
  canSendClientSMS,
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

describe("COURT_REMINDER_SAFE_CHANNELS", () => {
  it("only allows email or both, never sms alone", () => {
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
  });
});

describe("canSendClientSMS", () => {
  it("returns false without sms_consent_at", () => {
    expect(canSendClientSMS("+15551234567", null)).toBe(false);
  });

  it("returns false without phone", () => {
    expect(canSendClientSMS(null, "2026-04-14T00:00:00Z")).toBe(false);
  });

  it("returns true with both phone and consent", () => {
    expect(canSendClientSMS("+15551234567", "2026-04-14T00:00:00Z")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/notification-prefs.test.ts`
Expected: FAIL, module not found

- [ ] **Step 3: Implement notification-prefs.ts**

```typescript
// src/lib/notification-prefs.ts
/**
 * @fileoverview Notification channel preference system.
 *
 * JSONB override columns on court_reminders (client) and partners (bondsman)
 * store only non-default preferences. This module provides types, defaults,
 * merge logic, channel routing helpers, and consent guards.
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

// SAFETY: court_reminders must NEVER be "sms" alone.
// If phone is dead at 3AM, email is the fallback that keeps people out of jail.
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

export function autoUpgradeOnPhone(
  current: Partial<ClientNotificationPrefs> | null
): Partial<ClientNotificationPrefs> {
  const merged = { ...(current || {}) };
  if (!merged.court_reminders || merged.court_reminders === "email") {
    merged.court_reminders = "both";
  }
  return merged;
}

/** Validates client pref overrides. Returns false if court_reminders is "sms" (unsafe). */
export function validateClientPrefs(overrides: Partial<ClientNotificationPrefs>): boolean {
  if (overrides.court_reminders && !COURT_REMINDER_SAFE_CHANNELS.has(overrides.court_reminders)) {
    return false;
  }
  return true;
}

export function shouldSendEmail(pref: Channel): boolean {
  return pref === "email" || pref === "both";
}

export function shouldSendSMS(pref: Channel): boolean {
  return pref === "sms" || pref === "both";
}

/** 10DLC consent guard, ALL client SMS must pass through this. */
export function canSendClientSMS(
  phone: string | null | undefined,
  smsConsentAt: string | null | undefined
): boolean {
  return !!(phone && smsConsentAt);
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run tests/notification-prefs.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/notification-prefs.ts tests/notification-prefs.test.ts
git commit -m "feat(sms): notification preference types, defaults, merge logic, consent guards"
```

---

### Task 2: Bird SMS Utility

**Files:**
- Create: `src/lib/sms.ts`
- Test: `tests/sms.test.ts`
- Delete: `src/lib/twilio.ts`
- Modify: `src/app/api/partner/magic-link/route.ts:13` (import swap)

- [ ] **Step 1: Write failing tests**

```typescript
// tests/sms.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("sendSMS", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
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
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.bird.com/workspaces/test-workspace/channels/test-channel/messages");
    expect(opts.headers["Authorization"]).toBe("AccessKey test-key");
    const body = JSON.parse(opts.body);
    expect(body.receiver.contacts[0].identifierValue).toBe("+15551234567");
    expect(body.body.text.text).toBe("Hello world");
  });

  it("returns error on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ message: "Invalid phone" }) });
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

describe("capSMS", () => {
  it("returns text unchanged if under limit", async () => {
    const { capSMS } = await import("@/lib/sms");
    expect(capSMS("short")).toBe("short");
  });

  it("truncates and appends ... at 160 chars", async () => {
    const { capSMS } = await import("@/lib/sms");
    const long = "x".repeat(200);
    const result = capSMS(long);
    expect(result.length).toBe(160);
    expect(result.endsWith("...")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

- [ ] **Step 3: Implement sms.ts**

```typescript
// src/lib/sms.ts
/**
 * @fileoverview Bird SMS utility.
 *
 * Sends SMS via Bird (formerly MessageBird) REST API.
 * Gracefully degrades if Bird credentials not configured.
 *
 * Env vars: BIRD_API_KEY, BIRD_WORKSPACE_ID, BIRD_CHANNEL_ID
 */

// ── SMS Core ──────────────────────────────────────────────

/** Truncate SMS to single segment. Appends "..." if truncated. */
export function capSMS(text: string, maxLen = 160): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen - 3) + "...";
}

export async function sendSMS(
  to: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.BIRD_API_KEY;
  const workspaceId = process.env.BIRD_WORKSPACE_ID;
  const channelId = process.env.BIRD_CHANNEL_ID;

  if (!apiKey || !workspaceId || !channelId) {
    console.warn("[Bird SMS] Not configured, skipping SMS");
    return { success: false, error: "SMS not configured" };
  }

  try {
    const url = `https://api.bird.com/workspaces/${workspaceId}/channels/${channelId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `AccessKey ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        receiver: { contacts: [{ identifierValue: to }] },
        body: { type: "text", text: { text: body } },
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

> **Note:** `sms_log` table is created in migration (Phase 1) for future audit logging. SMS audit logging infrastructure (`sendSMSLogged`) will be added in a follow-up when SMS volume justifies it. For now all sends use `sendSMS` directly.

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Swap import in partner magic-link route**

In `src/app/api/partner/magic-link/route.ts` line 13: `@/lib/twilio` → `@/lib/sms`

- [ ] **Step 6: Delete twilio.ts**

```bash
git rm src/lib/twilio.ts
```

- [ ] **Step 7: Add `normalizePhone` and `isValidPhone` to `src/lib/site.ts`**

Add alongside the existing `normalizeEmail` / `isValidEmail` pattern:

```typescript
/** Normalize phone to E.164 format (+1XXXXXXXXXX). Strips formatting, prepends +1 for bare 10-digit. */
export function normalizePhone(raw: string): string {
  const stripped = raw.replace(/[\s\-\(\)\.]/g, "");
  if (/^\d{10}$/.test(stripped)) return "+1" + stripped;
  return stripped;
}

/** Validates US E.164 phone number. */
export function isValidPhone(phone: string): boolean {
  return /^\+1\d{10}$/.test(phone);
}
```

- [ ] **Step 8: Type check + commit**

Run: `npx tsc,noEmit`

```bash
git add src/lib/sms.ts tests/sms.test.ts src/app/api/partner/magic-link/route.ts src/lib/site.ts
git commit -m "feat(sms): replace Twilio with Bird API, add capSMS + phone validation"
```

---

### Task 3: Database Migration

**Files:**
- Create: `supabase/migrations/20260414a_sms_notification_prefs.sql`
- Modify: `supabase/SCHEMA.md`
- Modify: `src/lib/court-reminders.ts`

- [ ] **Step 1: Write migration SQL**

```sql
, supabase/migrations/20260414a_sms_notification_prefs.sql
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS sms_consent_at timestamptz;
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS notification_prefs jsonb;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS notification_prefs jsonb;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS locked_at timestamptz;

, SMS audit log (mirrors email_log pattern)
CREATE TABLE IF NOT EXISTS sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  body text,
  category text NOT NULL,
  court_reminder_id uuid REFERENCES court_reminders(id) ON DELETE SET NULL,
  partner_id uuid REFERENCES partners(id) ON DELETE SET NULL,
  success boolean NOT NULL DEFAULT false,
  error_message text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;
, Deny anon/authenticated, only service_role writes via createAdminClient()
CREATE POLICY "sms_log_deny_all" ON sms_log FOR ALL USING (false);

CREATE INDEX IF NOT EXISTS idx_sms_log_recipient ON sms_log(recipient);
CREATE INDEX IF NOT EXISTS idx_sms_log_category ON sms_log(category);
```

- [ ] **Step 2: Apply via Supabase Management API**

- [ ] **Step 3: Update CourtReminder interface**

In `src/lib/court-reminders.ts`, add after `last_name`:

```typescript
  phone?: string | null;
  sms_consent_at?: string | null;
  notification_prefs?: Partial<import("./notification-prefs").ClientNotificationPrefs> | null;
```

- [ ] **Step 4: Update SCHEMA.md** with new columns

- [ ] **Step 5: Update `validatePartnerSession` in `src/lib/partner-auth.ts`**

Add `notification_prefs` to the `.select()` string at line 149 AND add to the return type interface:
```typescript
notification_prefs: Partial<import("./notification-prefs").PartnerNotificationPrefs> | null;
```

- [ ] **Step 6: Update `generateMagicLink` in `src/lib/partner-auth.ts`**

Add `notification_prefs` to the `.select("id, name, phone")` at line 41 → `.select("id, name, phone, notification_prefs")` and update the return type:
```typescript
partner: { id: string; name: string; phone: string | null; notification_prefs: Record<string, string> | null };
```

- [ ] **Step 6B: Update `Partner` interface in `src/lib/partner-data.ts`**

Add `notification_prefs` to the `Partner` interface (line 41), dashboard page imports this type and Task 9's NotificationSettings component needs the field:
```typescript
  notification_prefs: Partial<import("./notification-prefs").PartnerNotificationPrefs> | null;
```

Add after the `payment_paypal` field (line 54).

- [ ] **Step 7: Type check + commit**

```bash
git add supabase/migrations/20260414a_sms_notification_prefs.sql supabase/SCHEMA.md src/lib/court-reminders.ts src/lib/partner-auth.ts src/lib/partner-data.ts
git commit -m "feat(sms): add phone, notification_prefs, locked_at columns + update partner-auth selects"
```

---

## Phase 2: Client SMS

### Task 4: Phone Collection on Prep Page

**Files:**
- Create: `src/app/api/court-reminders/[token]/phone/route.ts`
- Create: `src/components/PhoneOptIn.tsx`
- Modify: `src/app/prep/[token]/page.tsx`

- [ ] **Step 1: Build phone collection API route**

```typescript
// src/app/api/court-reminders/[token]/phone/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoUpgradeOnPhone } from "@/lib/notification-prefs";
import { normalizePhone, isValidPhone } from "@/lib/site";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  let body: { phone: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const phone = normalizePhone(body.phone || "");
  if (!isValidPhone(phone)) {
    return NextResponse.json({ error: "Enter a valid 10-digit US phone number" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: reminder, error: fetchErr } = await supabase
    .from("court_reminders")
    .select("id, notification_prefs")
    .eq("token", token)
    .eq("status", "active")
    .maybeSingle();

  if (fetchErr || !reminder) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error: updateErr } = await supabase
    .from("court_reminders")
    .update({
      phone,
      sms_consent_at: new Date().toISOString(),
      notification_prefs: autoUpgradeOnPhone(reminder.notification_prefs),
    })
    .eq("id", reminder.id);

  if (updateErr) {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Build PhoneOptIn component**

```tsx
// src/components/PhoneOptIn.tsx
"use client";

import { useState } from "react";
import { normalizePhone, isValidPhone } from "@/lib/site";

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

    const normalized = normalizePhone(phone);
    if (!isValidPhone(normalized)) {
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

Add `phone` to the reminder select query. Render `<PhoneOptIn token={token} hasPhone={!!reminder.phone} />` after header, before insider tips.

- [ ] **Step 4: Type check + commit**

---

### Task 5: Court Reminder Cron, SMS Path + Partner Alerts

**Files:**
- Modify: `src/app/api/cron/court-reminders/route.ts`

This is the most critical path, court reminders keep people out of jail.

- [ ] **Step 1: Add imports**

```typescript
import { sendSMS, capSMS } from "@/lib/sms";
import { getClientPrefs, getPartnerPrefs, shouldSendEmail, shouldSendSMS, canSendClientSMS } from "@/lib/notification-prefs";
import { escapeHtml } from "@/lib/email";
```

- [ ] **Step 2: Extend existing batch partner fetch (lines 71-80)**

Replace the existing `partnerMap` with an expanded version that includes notification data:

```typescript
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

Update the `ctx.partnerCompany` assignment to use `partnerMap[code]?.company`:
```typescript
partnerCompany: r.partner_promo_code ? partnerMap[r.partner_promo_code]?.company : undefined,
```

- [ ] **Step 3: Update pre-court reminder sending**

Replace the inner loop body. Email+SMS run in parallel per reminder via `Promise.allSettled`:

```typescript
for (const interval of REMINDER_INTERVALS) {
  if (daysUntil <= interval.daysBefore && !alreadySent.has(interval.key)) {
    const builder = EMAIL_BUILDERS[interval.key];
    if (!builder) continue;

    const prefs = getClientPrefs(r.notification_prefs);

    try {
      const email = builder(ctx);
      const sends: Promise<unknown>[] = [];

      if (shouldSendEmail(prefs.court_reminders)) {
        sends.push(sendEmail({ to: r.email, subject: email.subject, html: email.html }));
      }

      if (shouldSendSMS(prefs.court_reminders) && canSendClientSMS(r.phone, r.sms_consent_at)) {
        const smsBody = capSMS(`${r.first_name}, court in ${interval.daysBefore}d (${r.court_date}). Prep: https://imnotanattorney.com/prep/${r.token}`);
        sends.push(sendSMS(r.phone!, smsBody));
      }

      const results = await Promise.allSettled(sends);
      // Gate on at least one successful send, if ALL fail, don't mark sent so cron retries next run
      const anySucceeded = results.some(
        (res) => res.status === "fulfilled" && (res.value as { success?: boolean })?.success !== false
      );
      if (!anySucceeded && results.length > 0) {
        console.error(`[Cron] All sends failed for ${interval.key} / ${r.id}`);
        errors++;
        continue; // skip alreadySent, will retry next cron run
      }
      alreadySent.add(interval.key);
      sent++;

      // Indemnitor, email only for now
      if (r.indemnitor_email) {
        await sendEmail({
          to: r.indemnitor_email,
          subject: `${r.first_name}'s court date reminder`,
          html: email.html,
        }).catch(e => console.warn(`[Cron] Indemnitor email failed for ${r.id}:`, e));
      }

      // Partner "client reminded" notification (uses batch-fetched partnerMap, no N+1)
      if (r.partner_promo_code && partnerMap[r.partner_promo_code]) {
        const p = partnerMap[r.partner_promo_code];
        const partnerPrefs = getPartnerPrefs(p.notification_prefs as Record<string, string> | null);
        const msg = `We reminded ${r.first_name} about their court date on ${r.court_date}.`;
        const partnerSends: Promise<unknown>[] = [];

        if (shouldSendEmail(partnerPrefs.client_reminded)) {
          partnerSends.push(
            sendEmail({
              to: p.email,
              subject: `Client reminder sent: ${r.first_name}`,
              html: `<p style="color:#D4D4D8;font-size:15px;">${escapeHtml(msg)}</p>`,
              unsubscribeEmail: p.email,
            }, {
              category: "partner-client-reminded",
              metadata: { court_reminder_id: r.id, partner_promo_code: r.partner_promo_code },
            }).catch(e => console.warn("[Cron] Partner notification email failed:", e))
          );
        }

        if (shouldSendSMS(partnerPrefs.client_reminded) && p.phone) {
          partnerSends.push(
            sendSMS(p.phone, capSMS(`INAA: ${msg}`))
              .catch(e => console.warn("[Cron] Partner notification SMS failed:", e))
          );
        }

        await Promise.allSettled(partnerSends);
      }
    } catch (e) {
      console.error(`[Cron] Failed ${interval.key} for ${r.id}:`, e);
      errors++;
    }
  }
}
```

- [ ] **Step 4: Update post-court similarly** (same pattern: `canSendClientSMS`, `capSMS`, `Promise.allSettled`)

- [ ] **Step 5: Type check + run existing tests**

Run: `npx tsc,noEmit && npx vitest run`

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/court-reminders/route.ts
git commit -m "feat(sms): court reminder cron, SMS + partner alerts with consent guards"
```

---

### Task 6: Client Magic Link SMS

**Files:**
- Modify: `src/app/api/customer/magic-link/route.ts`

- [ ] **Step 1: Add SMS with consent check**

```typescript
import { sendSMS, capSMS } from "@/lib/sms";
import { getClientPrefs, shouldSendSMS, shouldSendEmail, canSendClientSMS } from "@/lib/notification-prefs";
```

After `generateCustomerMagicLink` succeeds, replace the unconditional email with:

```typescript
const { token } = result;
const magicUrl = `${SITE_URL}/my-cases/login/verify#token=${token}`;

const { data: reminderRow } = await supabase
  .from("court_reminders")
  .select("phone, notification_prefs, sms_consent_at")
  .eq("email", normalizedEmail)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

const prefs = getClientPrefs(reminderRow?.notification_prefs || null);

if (shouldSendEmail(prefs.magic_link)) {
  await sendCustomerMagicLinkEmail(normalizedEmail, magicUrl);
}

if (shouldSendSMS(prefs.magic_link) && canSendClientSMS(reminderRow?.phone, reminderRow?.sms_consent_at)) {
  await sendSMS(reminderRow!.phone!, capSMS(`ImNotAnAttorney login: ${magicUrl}`))
    .catch(e => console.warn("[Customer Magic Link] SMS failed:", e));
}
```

- [ ] **Step 2: Type check + commit**

---

### Task 6B: Client Notification Settings

**Files:**
- Create: `src/app/api/court-reminders/[token]/prefs/route.ts`
- Modify: `src/app/prep/[token]/page.tsx` (add minimal settings UI)

- [ ] **Step 1: Build client prefs API route**

```typescript
// src/app/api/court-reminders/[token]/prefs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientPrefs, validateClientPrefs, CLIENT_DEFAULTS } from "@/lib/notification-prefs";
import type { ClientNotificationPrefs } from "@/lib/notification-prefs";

const VALID_CHANNELS = new Set(["email", "sms", "both"]);
const VALID_KEYS = new Set(Object.keys(CLIENT_DEFAULTS));

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createAdminClient();
  const { data: reminder } = await supabase
    .from("court_reminders")
    .select("notification_prefs")
    .eq("token", token)
    .eq("status", "active")
    .maybeSingle();

  if (!reminder) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(getClientPrefs(reminder.notification_prefs));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  let body: Partial<ClientNotificationPrefs>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  for (const [key, val] of Object.entries(body)) {
    if (!VALID_KEYS.has(key)) return NextResponse.json({ error: `Unknown key: ${key}` }, { status: 400 });
    if (!VALID_CHANNELS.has(val as string)) return NextResponse.json({ error: `Invalid channel: ${val}` }, { status: 400 });
  }

  // SAFETY: court_reminders must never be "sms" alone
  if (!validateClientPrefs(body)) {
    return NextResponse.json(
      { error: "Court reminders require email, choose Email or Both." },
      { status: 400 }
    );
  }

  // SMS prefs require phone + consent on file
  const supabase = createAdminClient();
  const { data: reminder } = await supabase
    .from("court_reminders")
    .select("id, phone, sms_consent_at, notification_prefs")
    .eq("token", token)
    .eq("status", "active")
    .maybeSingle();

  if (!reminder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const needsSMS = Object.values(body).some(v => v === "sms" || v === "both");
  if (needsSMS && (!reminder.phone || !reminder.sms_consent_at)) {
    return NextResponse.json({ error: "Add your phone number first." }, { status: 400 });
  }

  const updated = { ...(reminder.notification_prefs || {}), ...body };
  const { error: updateErr } = await supabase
    .from("court_reminders")
    .update({ notification_prefs: updated })
    .eq("id", reminder.id);

  if (updateErr) return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  return NextResponse.json(getClientPrefs(updated));
}
```

- [ ] **Step 2: Add minimal settings link on prep page**

On the prep page, below the PhoneOptIn component (only visible if phone is set):

```tsx
{reminder.phone && (
  <details className="text-xs text-zinc-500 mt-2">
    <summary className="cursor-pointer hover:text-zinc-400">Notification settings</summary>
    {/* Minimal inline pref toggles, same pattern as NotificationSettings but for client types */}
  </details>
)}
```

Keep it minimal. 95% of clients won't touch this. The API enforces `court_reminders` safety server-side regardless of UI.

- [ ] **Step 3: Type check + commit**

```bash
git add src/app/api/court-reminders/[token]/prefs/route.ts src/app/prep/[token]/page.tsx
git commit -m "feat(sms): client notification settings with court_reminders safety gate"
```

---

### Task 7: Check-In Confirmation SMS

**Files:**
- Modify: `src/app/api/check-in/route.ts`

- [ ] **Step 1: Update select and add SMS**

Change `.select("id")` to `.select("id, phone, notification_prefs, sms_consent_at")`.

After check-in insert:

```typescript
import { sendSMS } from "@/lib/sms";
import { getClientPrefs, shouldSendSMS, canSendClientSMS } from "@/lib/notification-prefs";

if (canSendClientSMS(reminder.phone, reminder.sms_consent_at)) {
  const prefs = getClientPrefs(reminder.notification_prefs);
  if (shouldSendSMS(prefs.check_in)) {
    sendSMS(reminder.phone!, `Check-in confirmed for ${new Date().toLocaleDateString("en-US")}.`)
      .catch(e => console.warn("[Check-In] SMS failed:", e));
  }
}
```

- [ ] **Step 2: Type check + commit**

---

## Phase 3: Bondsman SMS

### Task 8: Partner Magic Link, Preference-Aware

**Files:**
- Modify: `src/app/api/partner/magic-link/route.ts`

- [ ] **Step 1: Use notification_prefs from generateMagicLink (no extra query)**

Since Task 3 Step 6 already added `notification_prefs` to `generateMagicLink`, use it directly:

```typescript
import { getPartnerPrefs, shouldSendEmail, shouldSendSMS } from "@/lib/notification-prefs";
import { capSMS } from "@/lib/sms";

const { token, partner } = result;
const magicUrl = `${SITE_URL}/partner/login/verify#token=${token}`;
const prefs = getPartnerPrefs(partner.notification_prefs || null);

if (shouldSendEmail(prefs.magic_link)) {
  await sendEmail({ /* existing email HTML */ });
}

if (shouldSendSMS(prefs.magic_link) && partner.phone) {
  sendSMS(partner.phone, capSMS(`ImNotAnAttorney Partner Login: ${magicUrl}`))
    .catch(e => console.warn("[Partner Magic Link] SMS failed:", e));
}
```

No extra DB query needed.

- [ ] **Step 2: Type check + commit**

---

### Task 9: Bondsman Notification Settings UI

**Files:**
- Create: `src/app/api/partner/notification-prefs/route.ts`
- Create: `src/components/partner/NotificationSettings.tsx`
- Modify: `src/app/partner/dashboard/page.tsx`

- [ ] **Step 1: Build notification prefs API route**

```typescript
// src/app/api/partner/notification-prefs/route.ts
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
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  for (const [key, val] of Object.entries(body)) {
    if (!VALID_KEYS.has(key)) return NextResponse.json({ error: `Unknown key: ${key}` }, { status: 400 });
    if (!VALID_CHANNELS.has(val as string)) return NextResponse.json({ error: `Invalid channel for ${key}: ${val}` }, { status: 400 });
  }

  const needsSMS = Object.values(body).some((v) => v === "sms" || v === "both");
  if (needsSMS && !partner.phone) {
    return NextResponse.json({ error: "Add your phone number before enabling SMS notifications." }, { status: 400 });
  }

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

- [ ] **Step 2: Build NotificationSettings component**

```tsx
// src/components/partner/NotificationSettings.tsx
"use client";

import { useState, useEffect } from "react";
import type { Channel, PartnerNotificationPrefs } from "@/lib/notification-prefs";

const LABELS: Record<keyof PartnerNotificationPrefs, string> = {
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
  const [prefs, setPrefs] = useState<PartnerNotificationPrefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/partner/notification-prefs")
      .then((r) => r.json())
      .then(setPrefs)
      .catch(() => setError("Failed to load preferences"));
  }, []);

  async function handleChange(key: keyof PartnerNotificationPrefs, channel: Channel) {
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
        {(Object.keys(LABELS) as (keyof PartnerNotificationPrefs)[]).map((key) => (
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
2. Partner data already fetched (includes `phone`). Pass `hasPhone={!!partner.phone}`.
3. Add `<NotificationSettings hasPhone={!!partner.phone} />` after existing sections.

- [ ] **Step 4: Type check + commit**

---

### Task 10: Partner Drip, SMS Path

**Files:**
- Modify: `src/app/api/cron/partner-drip/route.ts`

- [ ] **Step 1: Update `PartnerRow` interface and select**

Add `phone: string | null` and `notification_prefs: Record<string, string> | null` to interface. Add both to select query.

- [ ] **Step 2: Add SMS to drip sending (PRESERVES existing EmailLogContext + drip progression)**

Replace the existing `sendEmail(...)` + `result.success` block with preference-aware routing. Critical: `last_activation_email_key` update must fire on ANY successful channel, not just email.

```typescript
import { sendSMS, capSMS } from "@/lib/sms";
import { getPartnerPrefs, shouldSendEmail, shouldSendSMS } from "@/lib/notification-prefs";

const prefs = getPartnerPrefs(partner.notification_prefs);
let anySendSucceeded = false;

if (shouldSendEmail(prefs.drip)) {
  const result = await sendEmail(
    {
      to: partner.email,
      subject,
      html,
      unsubscribeEmail: partner.email,
    },
    {
      category: "partner-drip",
      email_key: nextStep.key,
      metadata: {
        partner_id: partner.id,
        step: nextStep.key,
        day: nextStep.dayThreshold,
      },
    }
  );
  if (result.success) anySendSucceeded = true;
}

if (shouldSendSMS(prefs.drip) && partner.phone) {
  const smsResult = await sendSMS(partner.phone, capSMS(`${subject}. Dashboard: https://imnotanattorney.com/partner/dashboard`));
  if (smsResult.success) anySendSucceeded = true;
  else console.warn("[Partner Drip] SMS failed:", smsResult.error);
}

if (anySendSucceeded) {
  await supabase
    .from("partners")
    .update({
      last_activation_email_key: nextStep.key,
      activation_email_sent_at: new Date().toISOString(),
    })
    .eq("id", partner.id);
  sent++;
} else {
  console.error(`[Partner Drip] All channels failed for ${nextStep.key} to ${partner.email}`);
  errors++;
}
```

- [ ] **Step 3: Type check + commit**

---

### Task 11: Commission Sale Notification (Stripe Webhook)

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts`

- [ ] **Step 1: Update partnerDetail select**

Both the primary path (~line 562) and metadata fallback path (~line 644) query partnerDetail with `.select("name, email, total_commission")`. Add `phone, notification_prefs` to BOTH selects.

- [ ] **Step 2: ADD SMS alongside existing builder (preserve `partnerSaleNotificationEmail`)**

Keep the existing `partnerSaleNotificationEmail` builder, wrap in preference check + add SMS path. Lines 557-580:

```typescript
import { sendSMS, capSMS } from "@/lib/sms";
import { getPartnerPrefs, shouldSendEmail, shouldSendSMS } from "@/lib/notification-prefs";

// Existing builder preserved, only wrapping in pref check + adding SMS
const { partnerSaleNotificationEmail } = await import("@/lib/partner-emails");
const { data: partnerDetail } = await supabase
  .from("partners")
  .select("name, email, total_commission, phone, notification_prefs")
  .eq("id", partner.id)
  .single();

if (partnerDetail?.email) {
  const partnerPrefs = getPartnerPrefs(partnerDetail.notification_prefs || null);
  const tierName = tier in TIER_CORE ? TIER_CORE[tier as TierSlug].name : tier;
  const commissionDollars = (commissionAmount / 100).toFixed(2);
  const holdbackDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US");

  if (shouldSendEmail(partnerPrefs.payout)) {
    const { subject, html } = partnerSaleNotificationEmail(
      partnerDetail.name,
      tierName,
      commissionAmount,
      partnerDetail.total_commission || 0
    );
    await sendEmail({ to: partnerDetail.email, subject, html, unsubscribeEmail: partnerDetail.email }, {
      category: "partner-sale-notification",
      metadata: { partner_id: partner.id, tier, commission: commissionAmount },
    });
  }

  // Fire-and-forget SMS, don't await, avoid webhook timeout risk
  if (shouldSendSMS(partnerPrefs.payout) && partnerDetail.phone) {
    sendSMS(partnerDetail.phone, capSMS(`INAA: You earned $${commissionDollars} from a referral! Confirms ${holdbackDate}.`))
      .catch(e => console.warn("[Webhook] Partner sale SMS failed:", e));
  }
}
```

- [ ] **Step 3: Apply same pattern to metadata fallback path** (~lines 641-660), same wrapper: pref check around existing builder call + SMS path

- [ ] **Step 4: Type check + commit**

---

## Phase 4: Payout Infrastructure

### Task 12: Commission Locking Cron

**Files:**
- Create: `src/app/api/cron/lock-commissions/route.ts`

- [ ] **Step 1: Build cron** (same structure as v1 but with refund filter)

Key query, includes `.gt("commission_amount", 0)` to exclude refunded orders:

```typescript
const { data: referrals, error: fetchErr } = await supabase
  .from("referrals")
  .select("id, partner_id, commission_amount")
  .is("locked_at", null)
  .lt("created_at", cutoff)
  .gt("commission_amount", 0)
  .limit(200);
```

Full cron implementation (DO NOT reference v1, table name was wrong there):

```typescript
// src/app/api/cron/lock-commissions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";
import { sendSMS, capSMS } from "@/lib/sms";
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

    const { data: referrals, error: fetchErr } = await supabase
      .from("referrals")
      .select("id, partner_id, commission_amount")
      .is("locked_at", null)
      .lt("created_at", cutoff)
      .gt("commission_amount", 0)
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
    for (const ref of referrals) {
      if (!byPartner[ref.partner_id]) {
        byPartner[ref.partner_id] = { ids: [], total: 0 };
      }
      byPartner[ref.partner_id].ids.push(ref.id);
      byPartner[ref.partner_id].total += ref.commission_amount || 0;
    }

    // Lock all referrals in one UPDATE
    const allIds = referrals.map((ref) => ref.id);
    const { error: lockErr } = await supabase
      .from("referrals")
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
              <p style="color:#D4D4D8;font-size:15px;">Hey ${escapeHtml(partner.name)},</p>
              <p style="color:#F59E0B;font-size:20px;font-weight:bold;">$${dollars} confirmed</p>
              <p style="color:#D4D4D8;font-size:14px;">This amount is confirmed and will be included in your next monthly payout on the 1st.</p>
            `,
            unsubscribeEmail: partner.email,
          }, {
            category: "commission-locked",
            metadata: { partner_id: partnerId, amount: total },
          });
        } catch (e) {
          console.warn("[Lock Commissions] Notification email failed:", e);
        }
      }

      if (shouldSendSMS(prefs.payout) && partner.phone) {
        sendSMS(partner.phone, capSMS(`INAA: $${dollars} commission confirmed! Included in your next monthly payout.`))
          .catch((e) => console.warn("[Lock Commissions] Notification SMS failed:", e));
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

- [ ] **Step 2: Register cron job with cron-job.org**

Register daily at 06:00 UTC: `https://imnotanattorney.com/api/cron/lock-commissions` with Bearer `CRON_AUTH_TOKEN`.

- [ ] **Step 3: Type check + commit**

---

### Task 13: Update ARCHITECTURE.md + Clean Up Stale Twilio References

- [ ] **Step 1: Document SMS + notification system, Bird env vars, consent requirements, commission holdback**
- [ ] **Step 2: Update `src/lib/CONTEXT.md`**, replace `twilio.ts` reference (line 100) with `sms.ts` and update description from "Twilio SMS" to "Bird SMS (court reminders, magic links, partner notifications)"
- [ ] **Step 3: Commit**

---

### Task 14: Final Verification

- [ ] **Step 1:** `npx tsc,noEmit`, 0 errors
- [ ] **Step 2:** `npx vitest run`, all tests pass
- [ ] **Step 3:** CV: `node ~/projects/continuous-verification/verify.mjs,project inna,probe-only,no-trends`
- [ ] **Step 4:** Verify no Twilio refs: `grep -r "twilio\|TWILIO" src/,include="*.ts",include="*.tsx"`, no matches
- [ ] **Step 5:** Final commit if needed

---

## External Tasks (Rahim)

1. **Bird account:** Sign up, create workspace, install SMS channel, get API key + workspace ID + channel ID
2. **10DLC registration:** ~$15 one-time, brand + campaign
3. **Vercel env vars:** Add `BIRD_API_KEY`, `BIRD_WORKSPACE_ID`, `BIRD_CHANNEL_ID`. Remove Twilio vars.
4. **Terms update:** Add 45-day holdback clause to partner terms Section 5

---

## Review Fix Changelog (from v1)

All fixes from the v1 code review are merged inline above. For reference:
- **C1:** `COURT_REMINDER_SAFE_CHANNELS` + `validateClientPrefs()` in Task 1
- **C2:** `.gt("commission_amount", 0)` in Task 12
- **I1:** `notification_prefs` added to `validatePartnerSession` select in Task 3 Step 5
- **I2:** SMS fire-and-forget in webhook (Task 11)
- **I3:** Batch partner fetch extended in Task 5 Step 2 (no N+1)
- **I4:** `canSendClientSMS()` consent guard on ALL client SMS paths (Tasks 5, 6, 7)
- **I5:** Check-in select updated to include phone + prefs (Task 7)
- **I6:** PartnerRow interface + select updated (Task 10)
- **I7:** Typed notification_prefs as `Partial<ClientNotificationPrefs>` (Task 3)
- **S2/S3:** `capSMS()` called on all dynamic SMS bodies
- **S6:** Webhook notification replaced, not duplicated (Task 11)
- **S7:** Both webhook paths covered (Task 11 Steps 2-3)
- **Reuse:** `normalizePhone`/`isValidPhone` in site.ts (Task 2 Step 7)
- **Reuse:** `escapeHtml()` on all user strings in email HTML
- **Efficiency:** Email+SMS parallel via `Promise.allSettled` per reminder (Task 5)
- **Efficiency:** `generateMagicLink` select extended, no extra query (Task 3 Step 6, Task 8)
- **Quality:** Env vars read inside function, not module scope (Task 2)
- **Quality:** PII not logged in "not configured" warning (Task 2)
- **Quality:** Import types from notification-prefs.ts, not redefined locally (Task 9)

## Review Fix Changelog (v2.1, pre-execution code review)

All fixes below are patched inline above:
- **C1-v2:** `Promise.allSettled` in court reminder cron now gates `alreadySent.add` on at least one successful send. Prevents silent swallowing of transient failures. (Task 5 Step 3)
- **C2-v2:** Partner drip preserves `EmailLogContext` second arg to `sendEmail()` and gates `last_activation_email_key` update on ANY channel succeeding, not just email. Prevents drip sequence infinite loop when pref is SMS-only. (Task 10 Step 2)
- **W1-v2:** Removed `escapeHtml()` from indemnitor email subject line, subjects are plain text, HTML entities render literally (`O&#39;Brien`). `escapeHtml` reserved for HTML body only. (Task 5 Step 3)
- **W2-v2:** `sms_log` table now has `ENABLE ROW LEVEL SECURITY` + deny-all policy. Matches every other table in the project. (Task 3 Step 1)
- **W3-v2:** `sms_log` FK constraints changed from default `RESTRICT` to `ON DELETE SET NULL`. Audit logs should never block business operations. (Task 3 Step 1)
- **W4-v2:** Removed dead `escapeHtml` import from `sms.ts`. (Task 2 Step 3)
- **W5-v2:** Added Step 6B to Task 3: update `Partner` interface in `src/lib/partner-data.ts` with `notification_prefs`. Dashboard imports this type, without it, Task 9's NotificationSettings component would have a type error. (Task 3 Step 6B)
- **W6-v2:** Stripe webhook (Task 11) now preserves existing `partnerSaleNotificationEmail` builder instead of replacing with inline HTML. Keeps partner email template pattern consistent. SMS added alongside, not instead. (Task 11 Step 2)
- **W7-v2:** Task 13 now includes Step 2 to update `src/lib/CONTEXT.md` Twilio reference → Bird. (Task 13 Step 2)

## Review Fix Changelog (v2.2, round 2 code review)

- **C3-v2:** Task 12 inlined full cron code. v1 reference used wrong table `partner_referrals` → corrected to `referrals`. (Task 12 Step 1)
- **C4-v2:** Task 12 commission locking email: `partner.name` now wrapped in `escapeHtml()` to prevent XSS. (Task 12 Step 1)
- **W8-v2:** Partner "client reminded" email subject: removed `escapeHtml(r.first_name)`, same W1 class bug in different line. (Task 5 Step 3)
- **W9-v2:** Task 3 commit `git add` now includes `src/lib/partner-data.ts`. (Task 3 Step 7)
- **W10-v2:** Task 9 now has full inline code blocks (API route + NotificationSettings component). No v1 cross-reference needed. (Task 9 Steps 1-3)
- **W11-v2:** Removed dead code from `sms.ts`: `sendSMSWithRetry`, `dispatchClientNotification`, `dispatchPartnerNotification`, defined but never called by any task. (Task 2 Step 3)
- **S1-v2:** Variable shadowing: `results.some((r) =>` renamed to `results.some((res) =>` to avoid shadowing outer `r` loop variable. (Task 5 Step 3)
- **S2-v2:** All `toLocaleDateString()` calls now use explicit `"en-US"` locale for consistent formatting across Vercel environments. (Tasks 7, 11)

## Review Fix Changelog (v2.3, round 3 code review)

- **W12-v2:** Task 4 PhoneOptIn component inlined with `normalizePhone`/`isValidPhone` from `@/lib/site`. No v1 cross-reference needed. (Task 4 Step 2)
- **S3-v2:** Task 12 commission email now includes `unsubscribeEmail: partner.email` for CAN-SPAM consistency with other partner emails. (Task 12 Step 1)
- **S4-v2:** Task 12 commission email now includes `EmailLogContext` (`category: "commission-locked"`) for audit trail consistency. (Task 12 Step 1)

## Review Fix Changelog (v2.4, round 4 code review)

- **W13-v2:** Partner "client reminded" email (Task 5 Step 3) now includes `unsubscribeEmail` + `EmailLogContext`. Last partner-facing email that was missing both. (Task 5 Step 3)
- **W14-v2:** Removed `sendSMSLogged`, `logSMSSend`, `SMSLogContext`, and `createAdminClient` import from `sms.ts`, dead code, no task called it. `sms_log` table stays in migration for future use. (Task 2 Step 3)
- **S5-v2:** Task 12 duplicate `import { sendEmail }` / `import { escapeHtml }` from `@/lib/email` merged into single import. (Task 12 Step 1)
