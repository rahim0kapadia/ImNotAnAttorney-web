/**
 * PATCH /api/partner/clients/[id]/schedule — referral-mode 403 (Task 7, bondsman-modes v2).
 *
 * Contract:
 *   - partner.check_in_enabled === false  → 403, audit event inserted,
 *     no writes to court_reminders.
 *   - partner.check_in_enabled === true   → handler proceeds (does NOT 403).
 *
 * Style mirrors tests/api/partner-settings-flip-at.test.ts — Supabase client is
 * mocked with a chainable thenable that records each invocation so we can
 * assert the audit INSERT fires AND no court_reminders update is attempted.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

interface FilterCall { method: string; args: unknown[] }
interface ChainCall {
  table: string;
  op: "select" | "update" | "insert" | "maybeSingle" | null;
  payload: Record<string, unknown> | null;
  filters: FilterCall[];
}

const calls: ChainCall[] = [];

// Mutable partner fixture; each test mutates check_in_enabled then exercises PATCH.
const currentPartner: {
  id: string;
  promo_code: string;
  check_in_enabled: boolean;
} = { id: "p_1", promo_code: "BOND123", check_in_enabled: false };

// When true, the court_reminders lookup returns a matching client row
// (positive path). Referral-mode test never reaches the lookup.
//
// `check_in_days` is non-empty so `wasNull` is false in the positive-path
// test, which skips the sendEmail/sendSMS branch. That keeps the positive
// path assertion narrow ("!== 403") and stable against unrelated changes
// to the confirmation-send flow.
const reminderRow = {
  id: "r_1",
  first_name: "Test",
  email: "test@example.com",
  phone: null,
  notification_prefs: null,
  sms_consent_at: null,
  token: "tok_abc",
  check_in_days: ["MON"],
  partner_promo_code: "BOND123",
};

function makeChain(table: string): unknown {
  const current: ChainCall = { table, op: null, payload: null, filters: [] };
  calls.push(current);

  const chain: Record<string, unknown> = {
    select: (..._args: unknown[]) => {
      if (current.op === null) current.op = "select";
      return chain;
    },
    insert: (payload: Record<string, unknown>) => {
      current.op = "insert";
      current.payload = payload;
      return chain;
    },
    update: (payload: Record<string, unknown>) => {
      current.op = "update";
      current.payload = payload;
      return chain;
    },
    eq: (...a: unknown[]) => {
      current.filters.push({ method: "eq", args: a });
      return chain;
    },
    maybeSingle: async () => {
      if (current.table === "court_reminders") {
        return { data: reminderRow, error: null };
      }
      return { data: null, error: null };
    },
    // Thenable so `await chain` resolves — needed for inserts (fire-and-forget
    // via .then()) and updates (handler awaits the chain directly).
    then: (onFulfilled: (x: unknown) => unknown, _onRejected?: (e: unknown) => unknown) => {
      if (current.op === "insert") return onFulfilled({ data: null, error: null });
      if (current.op === "update") return onFulfilled({ error: null });
      return onFulfilled({ data: null, error: null });
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (t: string) => makeChain(t) }),
}));

vi.mock("@/lib/partner-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/partner-helpers")>("@/lib/partner-helpers");
  return {
    ...actual,
    requirePartnerAuth: async () => ({
      partner: {
        id: currentPartner.id,
        promo_code: currentPartner.promo_code,
        check_in_enabled: currentPartner.check_in_enabled,
      },
      error: null,
    }),
  };
});

// Downstream email/sms helpers — mock to no-ops so the positive path
// doesn't try to hit Resend/Twilio in tests.
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  escapeHtml: (s: string) => s,
}));
vi.mock("@/lib/sms", () => ({
  sendSMS: vi.fn().mockResolvedValue(undefined),
  capSMS: (s: string) => s,
}));

// after() runs post-response on Vercel; in tests, mock it to execute the
// callback immediately (pattern mirrors tests/api/cron-check-in-filter.test.ts).
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: (fn: () => Promise<void> | void) => fn() };
});

import { PATCH } from "@/app/api/partner/clients/[id]/schedule/route";
import { NextRequest } from "next/server";

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/partner/clients/r_1/schedule", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function invoke(body: unknown) {
  return PATCH(makeReq(body), { params: Promise.resolve({ id: "r_1" }) });
}

beforeEach(() => {
  calls.length = 0;
  currentPartner.check_in_enabled = false;
});

describe("PATCH /api/partner/clients/[id]/schedule — referral-mode 403 (Task 7)", () => {
  it("returns 403 with explicit error message when partner.check_in_enabled is false", async () => {
    const res = await invoke({ check_in_days: ["MON", "THU"] });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/Referral mode/);
  });

  it("inserts a partner_events audit row (event_type=schedule_denied_referral_mode) on 403", async () => {
    await invoke({ check_in_days: ["MON"] });
    // let the after() microtask run
    await new Promise((r) => setTimeout(r, 0));
    const audit = calls.find(
      (c) => c.table === "partner_events" && c.op === "insert",
    );
    expect(audit).toBeDefined();
    expect(audit!.payload).toMatchObject({
      partner_id: "p_1",
      event_type: "schedule_denied_referral_mode",
      metadata: { client_id: "r_1", promo_code: "BOND123" },
    });
    // Belt-and-suspenders: the audit insert must NOT chain any .eq()/.in() filters.
    // Locks the insert shape so a future refactor that accidentally turns this
    // into an upsert-like filtered insert fails loudly.
    expect(audit!.filters.length).toBe(0);
  });

  it("does NOT update court_reminders when in referral mode", async () => {
    await invoke({ check_in_days: ["MON"] });
    const reminderUpdate = calls.find(
      (c) => c.table === "court_reminders" && c.op === "update",
    );
    expect(reminderUpdate).toBeUndefined();
  });

  it("does NOT 403 when partner.check_in_enabled is true (positive path proceeds)", async () => {
    currentPartner.check_in_enabled = true;
    const res = await invoke({ check_in_days: ["MON", "THU"] });
    // Key invariant: no 403 when check-in is enabled. The positive-path write
    // target (court_reminders.update) is validated by other tests in the
    // project; here we only care that the referral-mode gate does not trip.
    // reminderRow.check_in_days is non-empty so wasNull=false → the
    // sendEmail/sendSMS branch is skipped. Keeps the assertion narrow.
    expect(res.status).not.toBe(403);
  });
});
