import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture every Supabase filter chain invocation so we can assert the join filter.
type Call = { table: string; filters: Array<{ method: string; args: unknown[] }> };
const calls: Call[] = [];

function makeChain(table: string): unknown {
  const current: Call = { table, filters: [] };
  calls.push(current);
  // partners pre-fetch resolves with at least one enabled code so downstream queries run
  const partnersData = [{ promo_code: "TESTCODE", company: "Test Co", name: "Test" }];
  const defaultData = table === "partners" ? partnersData : [];
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
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: (fn: () => Promise<void>) => fn() };
});

import { GET } from "@/app/api/cron/check-in-prompt/route";
import { NextRequest } from "next/server";

beforeEach(() => { calls.length = 0; });

describe("cron check-in-prompt — check_in_enabled filter (v2 pre-fetch pattern)", () => {
  it("pre-fetches partners with check_in_enabled=true and filters reminders via .in()", async () => {
    await GET(new NextRequest("http://localhost/api/cron/check-in-prompt"));
    // let the after() microtask run
    await new Promise(r => setTimeout(r, 0));

    const reminderQuery = calls.find((c) => c.table === "court_reminders");
    expect(reminderQuery).toBeDefined();
    const inFilter = reminderQuery?.filters.find((f) => f.method === "in");
    expect(inFilter).toBeDefined();
    expect(inFilter?.args[0]).toBe("partner_promo_code");

    const partnersPrefetch = calls.find((c) =>
      c.table === "partners" &&
      c.filters.some((f) => f.method === "eq" && f.args[0] === "check_in_enabled" && f.args[1] === true)
    );
    expect(partnersPrefetch).toBeDefined();
  });
});
