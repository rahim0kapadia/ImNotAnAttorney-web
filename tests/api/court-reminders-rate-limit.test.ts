/**
 * Unit tests for POST /api/court-reminders rate-limit + phone-path challenge.
 *
 * Covers A1 spam-abuse guards added in the 2026-04-20 quality-gate deferred
 * fix-list:
 *   - IP 3/hr, email 1/day → 4th IP or 2nd email returns 429 + Retry-After
 *   - Rejection path increments abuse counter; Telegram alert fires once
 *     per hour when >20 rejections land
 *   - Phone opt-in requires partner_promo_code that resolves to a real
 *     partner row (challenge); missing or unknown code → 400
 *   - Happy-path enrollment (no phone) still returns 200 inside the window
 *
 * Mocks @/lib/rate-limit, @/lib/supabase/admin, @/lib/email, @/lib/sms,
 * @/lib/notification-prefs. No network, no database.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// B4: POST uses after() from next/server for the welcome SMS. Outside a
// real request scope it throws — stub it so the callback runs inline.
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: (cb: () => Promise<void> | void) => { void cb(); } };
});

// ── Mutable behaviour for checkRateLimit across tests ──
let ipLimited = false;
let emailLimited = false;
let abuseLimited = false;
let alertDedupLimited = false;
let telegramFetches: string[] = [];
const originalFetch = globalThis.fetch;

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async (_sb: unknown, key: string) => {
    if (key.startsWith("court-reminders:ip:")) return { limited: ipLimited };
    if (key.startsWith("court-reminders:email:")) return { limited: emailLimited };
    if (key === "court-reminders:abuse:global") return { limited: abuseLimited };
    if (key === "court-reminders:abuse-alert:global") return { limited: alertDedupLimited };
    return { limited: false };
  }),
}));

// ── Supabase mock supports partner lookup + insert ──
let partnerExists = true;
interface Call { table: string; op: string; payload?: unknown }
const calls: Call[] = [];

function makeChain(table: string): unknown {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => {
      if (table === "partners") {
        return partnerExists
          ? { data: { id: "p1", email: "p@example.com", phone: null, notification_prefs: null, sms_consent_at: null, name: "Test", company: "TestCo", default_check_in_days: null }, error: null }
          : { data: null, error: null };
      }
      return { data: null, error: null };
    },
    insert: (payload: unknown) => {
      calls.push({ table, op: "insert", payload });
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

function buildReq(body: Record<string, unknown>, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/court-reminders", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": "1.2.3.4", ...headers },
    body: JSON.stringify(body),
  });
}

const futureDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

beforeEach(() => {
  ipLimited = false;
  emailLimited = false;
  abuseLimited = false;
  alertDedupLimited = false;
  partnerExists = true;
  calls.length = 0;
  telegramFetches = [];
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
    telegramFetches.push(typeof url === "string" ? url : url.toString());
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
});

describe("POST /api/court-reminders — A1 rate-limit + phone-path challenge", () => {
  it("returns 200 inside the limit (happy path, no phone)", async () => {
    const res = await POST(buildReq({
      first_name: "Jane", email: "jane@example.com", court_date: futureDate,
    }));
    expect(res.status).toBe(200);
  });

  it("returns 429 + Retry-After when IP hits the hourly cap", async () => {
    ipLimited = true;
    const res = await POST(buildReq({
      first_name: "Jane", email: "jane@example.com", court_date: futureDate,
    }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
    expect(calls.find((c) => c.op === "insert")).toBeUndefined();
  });

  it("returns 429 + Retry-After when email hits the daily cap", async () => {
    emailLimited = true;
    const res = await POST(buildReq({
      first_name: "Jane", email: "jane@example.com", court_date: futureDate,
    }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("86400");
    expect(calls.find((c) => c.op === "insert")).toBeUndefined();
  });

  it("fires Telegram alert once when abuse counter crosses the threshold", async () => {
    process.env.TELEGRAM_BOT_TOKEN_LEGAL = "tok";
    process.env.TELEGRAM_CHAT_ID = "chat";
    ipLimited = true;
    abuseLimited = true;
    alertDedupLimited = false; // first breach in the window
    const res = await POST(buildReq({
      first_name: "Jane", email: "jane@example.com", court_date: futureDate,
    }));
    expect(res.status).toBe(429);
    // Telegram alert is fire-and-forget; give the microtask queue a tick.
    await new Promise((r) => setTimeout(r, 0));
    expect(telegramFetches.some((u) => u.includes("api.telegram.org"))).toBe(true);
  });

  it("suppresses duplicate Telegram alerts within the dedup window", async () => {
    process.env.TELEGRAM_BOT_TOKEN_LEGAL = "tok";
    process.env.TELEGRAM_CHAT_ID = "chat";
    ipLimited = true;
    abuseLimited = true;
    alertDedupLimited = true; // alert already sent this hour
    await POST(buildReq({
      first_name: "Jane", email: "jane@example.com", court_date: futureDate,
    }));
    await new Promise((r) => setTimeout(r, 0));
    expect(telegramFetches.some((u) => u.includes("api.telegram.org"))).toBe(false);
  });

  it("rejects phone signup with no partner_promo_code (400)", async () => {
    const res = await POST(buildReq({
      first_name: "Jane", email: "jane@example.com", court_date: futureDate,
      phone: "5551234567", consent: true,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/partner link/i);
    expect(calls.find((c) => c.op === "insert")).toBeUndefined();
  });

  it("rejects phone signup when partner_promo_code does not resolve (400)", async () => {
    partnerExists = false;
    const res = await POST(buildReq({
      first_name: "Jane", email: "jane@example.com", court_date: futureDate,
      phone: "5551234567", consent: true, partner_promo_code: "ghost-code",
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid partner link/i);
    expect(calls.find((c) => c.op === "insert")).toBeUndefined();
  });

  it("accepts phone signup with a valid partner_promo_code", async () => {
    partnerExists = true;
    const res = await POST(buildReq({
      first_name: "Jane", email: "jane@example.com", court_date: futureDate,
      phone: "5551234567", consent: true, partner_promo_code: "real-code",
    }));
    expect(res.status).toBe(200);
    expect(calls.find((c) => c.op === "insert")).toBeDefined();
  });
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});
