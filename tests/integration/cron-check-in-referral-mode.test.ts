/**
 * Integration test for the Task-3.5 short-circuit in
 * /api/cron/check-in-prompt: when NO partners have check_in_enabled=true
 * (i.e. every partner is in referral-only mode), both phases of the cron
 * must early-return with zero sends. This is the "referral-mode cron
 * respects opt-out" invariant.
 *
 * Plan spec: v2-diffs:468-471. Originally written as a supabase-local
 * fixture test; implemented here as a vitest unit with a stub Supabase
 * client that returns an empty partners pre-fetch. Same behavioral
 * assertion, no external dependency.
 *
 * To convert this to a true supabase-local integration test in the
 * future: remove the vi.mock() block, set SUPABASE_LOCAL=1, seed one
 * check_in_enabled=false partner + an active court_reminder, and assert
 * zero rows in email_sends after GET().
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Call = { table: string; filters: Array<{ method: string; args: unknown[] }> };
const calls: Call[] = [];
let sendEmailCalls = 0;
let sendSmsCalls = 0;

function makeChain(table: string): unknown {
  const current: Call = { table, filters: [] };
  calls.push(current);
  // partners pre-fetch returns EMPTY — simulates every partner in referral-only mode
  const defaultData: unknown[] = [];
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (...a: unknown[]) => { current.filters.push({ method: "eq", args: a }); return chain; },
    gt: (...a: unknown[]) => { current.filters.push({ method: "gt", args: a }); return chain; },
    contains: (...a: unknown[]) => { current.filters.push({ method: "contains", args: a }); return chain; },
    or: (...a: unknown[]) => { current.filters.push({ method: "or", args: a }); return chain; },
    not: (...a: unknown[]) => { current.filters.push({ method: "not", args: a }); return chain; },
    in: (...a: unknown[]) => { current.filters.push({ method: "in", args: a }); return chain; },
    range: async () => ({ data: [] }),
    update: () => chain,
    then: (fn: (x: unknown) => unknown) => fn({ data: defaultData }),
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (t: string) => makeChain(t) }),
}));
vi.mock("@/lib/auth/guards", () => ({
  requireCron: () => ({ authorized: true, error: null }),
}));
vi.mock("@/lib/cron-idempotency", () => ({
  acquireCronLock: async () => ({ shouldRun: true, executionId: "x" }),
  releaseCronLock: async () => {},
}));
vi.mock("@/lib/email", () => ({
  sendEmail: async () => { sendEmailCalls++; return { ok: true }; },
  escapeHtml: (s: string) => s,
}));
vi.mock("@/lib/sms", () => ({
  sendSMS: async () => { sendSmsCalls++; return { ok: true }; },
  capSMS: (s: string) => s,
}));
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: (fn: () => Promise<void>) => fn() };
});

import { GET } from "@/app/api/cron/check-in-prompt/route";
import { NextRequest } from "next/server";

beforeEach(() => {
  calls.length = 0;
  sendEmailCalls = 0;
  sendSmsCalls = 0;
});

describe("cron check-in-prompt — referral-only mode (no check_in_enabled partners)", () => {
  it("sends zero emails and zero SMS when no partner has check_in_enabled=true", async () => {
    await GET(new NextRequest("http://localhost/api/cron/check-in-prompt"));
    await new Promise((r) => setTimeout(r, 0));
    expect(sendEmailCalls).toBe(0);
    expect(sendSmsCalls).toBe(0);
  });

  it("never queries court_reminders when partners pre-fetch is empty", async () => {
    await GET(new NextRequest("http://localhost/api/cron/check-in-prompt"));
    await new Promise((r) => setTimeout(r, 0));
    const reminderQuery = calls.find((c) => c.table === "court_reminders");
    expect(reminderQuery).toBeUndefined();
  });

  it("queries partners pre-fetch with check_in_enabled=true filter", async () => {
    await GET(new NextRequest("http://localhost/api/cron/check-in-prompt"));
    await new Promise((r) => setTimeout(r, 0));
    const partnersPrefetch = calls.find((c) =>
      c.table === "partners" &&
      c.filters.some(
        (f) => f.method === "eq" && f.args[0] === "check_in_enabled" && f.args[1] === true,
      ),
    );
    expect(partnersPrefetch).toBeDefined();
  });
});
