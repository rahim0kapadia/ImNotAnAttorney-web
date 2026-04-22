/**
 * PATCH /api/partner/settings — allowlist + flip_at race-safe stamping.
 *
 * Fix #9 review deltas (Task 6 + atomic flip_at stamp):
 *   1. Unknown body fields reject with 400 "Unknown field(s): ..."
 *   2. No-op (check_in_enabled matches current) → flip_at NOT stamped
 *   3. Real flip (opposite value) → flip_at stamped as ISO timestamp
 *
 * Mirrors tests/api/cron-check-in-filter.test.ts — records every Supabase
 * chain invocation so we can assert the scoped .eq("check_in_enabled", !v)
 * + flip_at presence in the update payload.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

interface FilterCall { method: string; args: unknown[] }
interface ChainCall {
  table: string;
  op: "select" | "update" | null;
  updatePayload: Record<string, unknown> | null;
  filters: FilterCall[];
  selectReturned: number; // rows returned from terminal .select()
}

const calls: ChainCall[] = [];

// Partner fixture: currently check_in_enabled=false.
const currentPartner = {
  id: "p_1",
  check_in_enabled: false,
};

// Controls which calls.update(...).eq(...).eq("check_in_enabled", X).select() rows come back.
// When true, the scoped flip update matches a row (real flip); when false, zero rows match.
let scopedFlipMatches = true;

function makeChain(table: string): unknown {
  const current: ChainCall = { table, op: null, updatePayload: null, filters: [], selectReturned: 0 };
  calls.push(current);

  const chain: Record<string, unknown> = {
    select: (..._args: unknown[]) => {
      if (current.op === null) current.op = "select";
      return chain;
    },
    update: (payload: Record<string, unknown>) => {
      current.op = "update";
      current.updatePayload = payload;
      return chain;
    },
    eq: (...a: unknown[]) => {
      current.filters.push({ method: "eq", args: a });
      return chain;
    },
    // Make the chain thenable so `await` resolves. For update().eq().eq().select()
    // we decide rows based on whether the second .eq matched current state.
    then: (fn: (x: unknown) => unknown) => {
      if (current.op === "update") {
        // Scoped flip update: filters include eq("check_in_enabled", !requested)
        const scopedFilter = current.filters.find(
          (f) => f.method === "eq" && f.args[0] === "check_in_enabled"
        );
        const hasSelect = (current.updatePayload && "flip_at" in current.updatePayload);
        if (scopedFilter && hasSelect) {
          // This is the FIRST attempt (flip path)
          current.selectReturned = scopedFlipMatches ? 1 : 0;
          return fn({
            data: scopedFlipMatches ? [{ id: "p_1" }] : [],
            error: null,
          });
        }
        // Regular update (no flip_at)
        return fn({ error: null });
      }
      // Plain select path — not used by new handler but kept for safety.
      return fn({ data: { check_in_enabled: currentPartner.check_in_enabled }, error: null });
    },
    // Also expose .single() for defensive compatibility if code ever adds a read path.
    single: async () => ({ data: { check_in_enabled: currentPartner.check_in_enabled }, error: null }),
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (t: string) => makeChain(t) }),
}));

// Phase-3 rate-limit guard is out of scope for this spec — short-circuit
// to "not limited" so the route proceeds to the business logic under test.
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ limited: false }),
}));

vi.mock("@/lib/partner-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/partner-helpers")>("@/lib/partner-helpers");
  return {
    ...actual,
    requirePartnerAuth: async () => ({
      partner: { id: "p_1", check_in_enabled: currentPartner.check_in_enabled },
      error: null,
    }),
  };
});

import { PATCH } from "@/app/api/partner/settings/route";
import { NextRequest } from "next/server";

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/partner/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  calls.length = 0;
  currentPartner.check_in_enabled = false;
  scopedFlipMatches = true;
});

describe("PATCH /api/partner/settings — field allowlist", () => {
  it("rejects unknown fields with 400 and 'Unknown field(s)' message", async () => {
    const res = await PATCH(makeReq({ foo: 1 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Unknown field\(s\)/);
    expect(json.error).toContain("foo");
  });

  it("lists multiple unknown fields in the error message", async () => {
    const res = await PATCH(makeReq({ foo: 1, bar: 2, payment_zelle: "z" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("foo");
    expect(json.error).toContain("bar");
    expect(json.error).not.toContain("payment_zelle");
  });
});

describe("PATCH /api/partner/settings — flip_at stamping", () => {
  it("no-op: check_in_enabled matches current → flip_at NOT stamped", async () => {
    // Current is false; send false. Scoped flip update targets eq(check_in_enabled, true)
    // which matches zero rows → handler falls through to regular update WITHOUT flip_at.
    scopedFlipMatches = false;
    const res = await PATCH(makeReq({ check_in_enabled: false }));
    expect(res.status).toBe(200);

    const updates = calls.filter((c) => c.op === "update");
    // Two update attempts: scoped flip (no match) + regular update fallback.
    expect(updates.length).toBeGreaterThanOrEqual(1);
    const regular = updates[updates.length - 1];
    expect(regular.updatePayload).toBeDefined();
    expect(regular.updatePayload).not.toHaveProperty("flip_at");
  });

  it("real flip: opposite check_in_enabled → flip_at stamped as ISO string", async () => {
    // Current false, request true. Scoped flip targets eq(check_in_enabled, false) — matches.
    scopedFlipMatches = true;
    const res = await PATCH(makeReq({ check_in_enabled: true }));
    expect(res.status).toBe(200);

    const flipUpdate = calls.find((c) => c.op === "update" && c.updatePayload && "flip_at" in c.updatePayload);
    expect(flipUpdate).toBeDefined();
    const flipAt = flipUpdate!.updatePayload!.flip_at as string;
    expect(typeof flipAt).toBe("string");
    // ISO 8601 sanity check.
    expect(flipAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    // And the scoped filter must target the OPPOSITE value.
    const scoped = flipUpdate!.filters.find(
      (f) => f.method === "eq" && f.args[0] === "check_in_enabled",
    );
    expect(scoped?.args[1]).toBe(false);
  });

  it("rejects non-boolean check_in_enabled with 400", async () => {
    const res = await PATCH(makeReq({ check_in_enabled: "yes" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/check_in_enabled must be a boolean/);
  });
});
