import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase admin so the route under test can pretend to hit the DB.
// All queries resolve with empty arrays / zero counts — we only care about
// the shape of `partner.check_in_enabled` in the JSON response.
function makeChain(): unknown {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: async () => ({ data: [], error: null }),
    range: async () => ({ data: [], error: null }),
    in: () => chain,
    then: (fn: (x: unknown) => unknown) => fn({ data: [], error: null, count: 0 }),
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => makeChain(),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

// Configurable partner stub. Each test mutates `partnerStub.check_in_enabled`
// before hitting GET to exercise the Boolean() coercion branch.
const partnerStub: Record<string, unknown> = {
  id: "p_1",
  name: "Test Partner",
  email: "test@example.com",
  phone: null,
  company: "Test Bondsman",
  city: "Test City",
  promo_code: "TESTCODE",
  commission_rate: 10,
  commission_tier: "bronze",
  preferred_payment_method: null,
  payment_zelle: null,
  payment_venmo: null,
  payment_check_address: null,
  payment_paypal: null,
  source: null,
  total_referrals: 0,
  total_commission: 0,
  total_paid_out: 0,
  check_in_enabled: true,
};

vi.mock("@/lib/partner-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/partner-helpers")>("@/lib/partner-helpers");
  return {
    ...actual,
    requirePartnerAuth: async () => ({ partner: partnerStub, error: null }),
    // Route uses paginatedQuery + batchedInQuery — stub both to empty.
    paginatedQuery: async () => ({ data: [], errors: [] }),
    batchedInQuery: async () => ({ data: [], errors: [] }),
  };
});

import { GET } from "@/app/api/partner/dashboard/route";
import { NextRequest } from "next/server";

beforeEach(() => {
  partnerStub.check_in_enabled = true;
});

describe("GET /api/partner/dashboard — partner.check_in_enabled coercion", () => {
  it("returns check_in_enabled as strict boolean true when DB value is true", async () => {
    partnerStub.check_in_enabled = true;
    const res = await GET(new NextRequest("http://localhost/api/partner/dashboard"));
    const body = await res.json();
    expect(body.partner.check_in_enabled).toBe(true);
    expect(typeof body.partner.check_in_enabled).toBe("boolean");
  });

  it("returns check_in_enabled as strict boolean false when DB value is false", async () => {
    partnerStub.check_in_enabled = false;
    const res = await GET(new NextRequest("http://localhost/api/partner/dashboard"));
    const body = await res.json();
    expect(body.partner.check_in_enabled).toBe(false);
    expect(typeof body.partner.check_in_enabled).toBe("boolean");
  });

  it("coerces undefined DB value to boolean false (SELECT-drift guard)", async () => {
    // Simulate a schema drift where SELECT omits the column and partner.check_in_enabled is undefined.
    partnerStub.check_in_enabled = undefined as unknown as boolean;
    const res = await GET(new NextRequest("http://localhost/api/partner/dashboard"));
    const body = await res.json();
    expect(body.partner.check_in_enabled).toBe(false);
    expect(typeof body.partner.check_in_enabled).toBe("boolean");
  });
});
