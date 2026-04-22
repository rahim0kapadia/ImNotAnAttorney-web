/**
 * Integration test — sentencing-calculator's USSC matview perspective.
 *
 * Verifies the additive districtDistribution field:
 *   - With district+offguide+xcrhissr supplied AND matview has a row →
 *     districtDistribution populated with match_depth='exact'.
 *   - Without those fields → districtDistribution is null, existing contract
 *     preserved (districtPatterns, chargeDistribution, judgePattern, federalOnly).
 *   - With the fields but matview misses → districtDistribution.match_depth ===
 *     'insufficient_data', outcomes.plea is null.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const pleaRow = {
  district: "42",
  offguide: "17",
  xcrhissr: "1",
  citizen: "3",
  age_bucket: "25-34",
  plea_or_trial: "0",
  n_cases: 7033,
  p10_senttot: 0.03,
  p25_senttot: 1.82,
  median_senttot: 3.13,
  p75_senttot: 5.76,
  p90_senttot: 9,
  mean_senttot: 4.66,
  pct_got_prison: 15.3,
  pct_downward_departure: 0,
  earliest_fy: 18,
  latest_fy: 24,
};

let matviewRows: unknown[] = [];
let districtRow: unknown | null = null;

vi.mock("@/lib/supabase/admin", () => {
  const makeChain = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      gte: () => chain,
      ilike: () => chain,
      order: () => chain,
      limit: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: () => {
        // Defensive — only ussc_districts uses maybeSingle in the tested
        // code paths. Throw loudly if a future code change routes another
        // table through maybeSingle so tests fail fast instead of passing
        // against a silently-null mock.
        if (table !== "ussc_districts") {
          throw new Error(
            `[test-mock] Unexpected maybeSingle() on table '${table}' — only ussc_districts is wired`,
          );
        }
        return Promise.resolve({ data: districtRow, error: null });
      },
      then(resolve: (r: { data: unknown[]; error: null }) => void) {
        if (table === "ussc_similar_cases_summary") {
          resolve({ data: matviewRows, error: null });
        } else {
          resolve({ data: [], error: null });
        }
      },
    };
    return chain;
  };
  return {
    createAdminClient: () => ({
      from: (t: string) => makeChain(t),
      rpc: () => ({
        then: (resolve: (r: { error: null }) => void) => resolve({ error: null }),
      }),
    }),
  };
});

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false })),
}));

import { POST } from "@/app/api/tools/sentencing-calculator/route";
import { NextRequest } from "next/server";

function buildReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/tools/sentencing-calculator", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  matviewRows = [];
  districtRow = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
});

describe("POST /api/tools/sentencing-calculator — districtDistribution perspective", () => {
  it("populates districtDistribution when bucket fields supplied", async () => {
    matviewRows = [pleaRow];
    const res = await POST(
      buildReq({
        state: "FL",
        chargeType: "drug-possession",
        district: "42",
        offguide: "17",
        xcrhissr: "1",
        citizen: "3",
        age: 28,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.districtDistribution).not.toBeNull();
    expect(body.result.districtDistribution.match_depth).toBe("exact");
    expect(body.result.districtDistribution.outcomes.plea.median_months).toBe(3.13);
    expect(body.result.districtDistribution.outcomes.trial).toBeNull();
    // Existing contract preserved
    expect(body.result.federalOnly).toBe(true);
    expect(Array.isArray(body.result.districtPatterns)).toBe(true);
    expect("chargeDistribution" in body.result).toBe(true);
    expect("judgePattern" in body.result).toBe(true);
  });

  it("returns null districtDistribution when bucket fields not supplied", async () => {
    const res = await POST(buildReq({ state: "FL", chargeType: "drug-possession" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.districtDistribution).toBeNull();
    expect(body.result.federalOnly).toBe(true);
  });

  it("returns insufficient_data when matview misses completely", async () => {
    matviewRows = [];
    const res = await POST(
      buildReq({
        state: "FL",
        chargeType: "drug-possession",
        district: "99",
        offguide: "ZZ",
        xcrhissr: "9",
        citizen: "9",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.districtDistribution.match_depth).toBe("insufficient_data");
    expect(body.result.districtDistribution.outcomes.plea).toBeNull();
    expect(body.result.districtDistribution.outcomes.trial).toBeNull();
  });

  it("rejects non-string district with 400", async () => {
    const res = await POST(
      buildReq({
        state: "FL",
        chargeType: "drug-possession",
        district: 42,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("attaches district_display metadata when the code resolves in ussc_districts", async () => {
    matviewRows = [pleaRow];
    districtRow = {
      district_code: "42",
      short_name: "W.D. Texas",
      district_name: "Western District of Texas",
      state_code: "TX",
      circuit: "5th",
    };
    const res = await POST(
      buildReq({
        state: "TX",
        chargeType: "drug-possession",
        district: "42",
        offguide: "17",
        xcrhissr: "1",
        citizen: "3",
        age: 28,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.districtDistribution.district_display).not.toBeNull();
    expect(body.result.districtDistribution.district_display.short_name).toBe("W.D. Texas");
    expect(body.result.districtDistribution.district_display.circuit).toBe("5th");
  });

  it("leaves district_display null when the code is not in ussc_districts", async () => {
    matviewRows = [pleaRow];
    districtRow = null;
    const res = await POST(
      buildReq({
        state: "FL",
        chargeType: "drug-possession",
        district: "42",
        offguide: "17",
        xcrhissr: "1",
        citizen: "3",
        age: 28,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.districtDistribution.district_display).toBeNull();
  });
});
