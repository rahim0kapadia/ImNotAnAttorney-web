/**
 * Unit tests for POST /api/court-reminders compact-mode behaviour.
 *
 * Covers quality-review deltas on commit 31faf161:
 *   - Persist phone + sms_consent_at when phone is provided and consent is true
 *   - Reject when phone provided without consent (400)
 *   - Reject when phone fails isValidPhone (400)
 *   - Reject when consent key is present but not strictly true (400)
 *
 * Mocks: @/lib/supabase/admin, @/lib/email, @/lib/sms, @/lib/notification-prefs.
 * No network, no database, no Resend/SMS side effects.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

type Call = { table: string; op: string; payload?: unknown; filters: Array<{ method: string; args: unknown[] }> };
const calls: Call[] = [];

function makeChain(table: string): unknown {
  const current: Call = { table, op: "select", filters: [] };
  calls.push(current);
  const chain: Record<string, unknown> = {
    select: (...a: unknown[]) => { current.filters.push({ method: "select", args: a }); return chain; },
    eq: (...a: unknown[]) => { current.filters.push({ method: "eq", args: a }); return chain; },
    maybeSingle: async () => ({ data: null, error: null }),
    insert: (payload: unknown) => {
      const insertCall: Call = { table, op: "insert", payload, filters: [] };
      calls.push(insertCall);
      return Promise.resolve({ error: null });
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (t: string) => makeChain(t) }),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "mock-email" })),
  escapeHtml: (s: string) => s,
}));

vi.mock("@/lib/sms", () => ({
  sendSMS: vi.fn(async () => ({ success: true })),
  capSMS: (s: string) => s,
}));

vi.mock("@/lib/notification-prefs", () => ({
  getPartnerPrefs: () => ({ missed_check_in: "both" }),
  shouldSendEmail: () => false,
  shouldSendSMS: () => false,
}));

import { POST } from "@/app/api/court-reminders/route";
import { NextRequest } from "next/server";

function buildReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/court-reminders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Use a court_date 30 days in the future (ISO YYYY-MM-DD)
const futureDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

beforeEach(() => {
  calls.length = 0;
});

describe("POST /api/court-reminders — compact-mode consent + phone", () => {
  it("returns 400 when phone is provided without consent=true", async () => {
    const res = await POST(buildReq({
      first_name: "Jane",
      email: "jane@example.com",
      court_date: futureDate,
      phone: "5551234567",
      consent: false,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    // Could be tripped by either the consent-must-be-true gate (consent: false)
    // or the phone-without-consent gate; both are correct rejections.
    expect(body.error).toMatch(/consent/i);
    // Insert must NOT have been called.
    expect(calls.find((c) => c.op === "insert")).toBeUndefined();
  });

  it("returns 400 when phone is provided and consent is missing", async () => {
    const res = await POST(buildReq({
      first_name: "Jane",
      email: "jane@example.com",
      court_date: futureDate,
      phone: "5551234567",
      // consent key intentionally absent
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Consent required for SMS notifications");
    expect(calls.find((c) => c.op === "insert")).toBeUndefined();
  });

  it("returns 400 with a specific message when consent key is present but not strictly true", async () => {
    const res = await POST(buildReq({
      first_name: "Jane",
      email: "jane@example.com",
      court_date: futureDate,
      consent: "true", // wrong type, must be boolean true
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("consent must be boolean true");
  });

  it("returns 400 when phone is not a valid US 10-digit number", async () => {
    const res = await POST(buildReq({
      first_name: "Jane",
      email: "jane@example.com",
      court_date: futureDate,
      phone: "abc", // fails normalizePhone/isValidPhone
      consent: true,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Enter a valid 10-digit US phone number");
    expect(calls.find((c) => c.op === "insert")).toBeUndefined();
  });

  it("persists phone + sms_consent_at when consent=true + valid phone", async () => {
    const res = await POST(buildReq({
      first_name: "Jane",
      email: "jane@example.com",
      court_date: futureDate,
      phone: "(555) 123-4567",
      consent: true,
    }));
    expect(res.status).toBe(200);

    const insertCall = calls.find((c) => c.op === "insert");
    expect(insertCall).toBeDefined();
    const payload = insertCall!.payload as Record<string, unknown>;

    // Normalized to E.164 +1XXXXXXXXXX
    expect(payload.phone).toBe("+15551234567");
    // sms_consent_at is a non-null ISO string when phone + consent both present
    expect(typeof payload.sms_consent_at).toBe("string");
    expect(payload.sms_consent_at as string).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Compact-mode defaults applied.
    expect(payload.charge_type).toBe("other");
    expect(payload.county_state).toBe("Unknown County");
  });

  it("does not set sms_consent_at when phone is omitted (no SMS opt-in)", async () => {
    const res = await POST(buildReq({
      first_name: "Jane",
      email: "jane@example.com",
      court_date: futureDate,
      // no phone, no consent
    }));
    expect(res.status).toBe(200);

    const insertCall = calls.find((c) => c.op === "insert");
    expect(insertCall).toBeDefined();
    const payload = insertCall!.payload as Record<string, unknown>;
    expect(payload.phone).toBeNull();
    expect(payload.sms_consent_at).toBeNull();
  });
});
