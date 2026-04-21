/**
 * Integration tests for POST /api/tools/federal-sentencing-distribution.
 *
 * Covers:
 *   - Valid request returns distribution + monte_carlo + histogram + district_display
 *   - Unmapped charge type returns 400
 *   - Missing district falls back to national (match_depth="widened_district")
 *   - Rate limit 429
 *   - Validation errors 400
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fsdRow = {
  fy: 22,
  district: "42",
  circdist: "36",
  offguide_code: 10,
  offguide_label: "Drug Trafficking",
  offense_category: "drug",
  criminal_history_category: "3",
  n: 150,
  mean_months: 48.5,
  median_months: 36,
  p10_months: 12,
  p25_months: 24,
  p75_months: 72,
  p90_months: 120,
  downward_departure_rate: 0.15,
  upward_departure_rate: 0.02,
  probation_rate: 0.05,
};

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: (cb: () => Promise<void> | void) => { void cb(); } };
});

let fsdRowsForExactBucket: unknown[] = [];
let fsdRowsForNationalFallback: unknown[] = [];
let districtLookupRow: unknown | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let hasDistrictFilter = false;
      const chain = {
        select: () => chain,
        eq(col: string) {
          if (col === "district") hasDistrictFilter = true;
          return chain;
        },
        gte: () => chain,
        lte: () => chain,
        maybeSingle: () => {
          if (table !== "ussc_districts") {
            throw new Error(`[test-mock] Unexpected maybeSingle() on '${table}'`);
          }
          return Promise.resolve({ data: districtLookupRow, error: null });
        },
        then(resolve: (r: { data: unknown[]; error: null }) => void) {
          if (table === "federal_sentencing_distributions") {
            resolve({
              data: hasDistrictFilter ? fsdRowsForExactBucket : fsdRowsForNationalFallback,
              error: null,
            });
          } else {
            resolve({ data: [], error: null });
          }
        },
      };
      return chain;
    },
    rpc: () => ({
      then: (resolve: (r: { error: null }) => void) => resolve({ error: null }),
    }),
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false })),
}));

import { POST } from "@/app/api/tools/federal-sentencing-distribution/route";
import { NextRequest } from "next/server";

function buildReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/tools/federal-sentencing-distribution", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  fsdRowsForExactBucket = [];
  fsdRowsForNationalFallback = [];
  districtLookupRow = null;
});

describe("POST /api/tools/federal-sentencing-distribution", () => {
  it("returns distribution + monte_carlo + histogram + district_display for a valid request", async () => {
    fsdRowsForExactBucket = [fsdRow];
    fsdRowsForNationalFallback = [{ ...fsdRow, district: "0", n: 5000 }];
    districtLookupRow = {
      district_code: "42",
      short_name: "W.D. Texas",
      district_name: "Western District of Texas",
      state_code: "TX",
      circuit: "5th",
    };
    const res = await POST(
      buildReq({
        chargeType: "drug-trafficking",
        district: "42",
        criminalHistoryCategory: "3",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.match_depth).toBe("exact");
    expect(body.result.district_agg.total_n).toBe(150);
    expect(body.result.district_agg.offguide_label).toBe("Drug Trafficking");
    expect(body.result.monte_carlo).toHaveLength(1000);
    expect(body.result.histogram.length).toBeGreaterThan(0);
    expect(body.result.district_display.short_name).toBe("W.D. Texas");
    expect(body.result.national_agg.total_n).toBe(5000);
    expect(body.result.federalOnly).toBe(true);
    // UPL-safe — no banned phrases in response.
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/\byou should\b/i);
    expect(text).not.toMatch(/\bwe recommend\b/i);
    expect(text).not.toMatch(/\bwe advise\b/i);
  });

  it("returns 400 for unmapped chargeType (e.g. dui is state-only)", async () => {
    const res = await POST(
      buildReq({
        chargeType: "dui",
        district: "42",
        criminalHistoryCategory: "3",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/insufficient data/i);
  });

  it("derives criminalHistoryCategory from priorConvictions when explicit not supplied", async () => {
    fsdRowsForExactBucket = [fsdRow];
    const res = await POST(
      buildReq({
        chargeType: "drug-trafficking",
        district: "42",
        priorConvictions: "felony", // maps to category "3"
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.input.criminalHistoryCategory).toBe("3");
  });

  it("falls back to national averages when the district has no data", async () => {
    // Exact + widened_criminal_history both miss — only national fallback hits.
    fsdRowsForExactBucket = [];
    fsdRowsForNationalFallback = [{ ...fsdRow, district: "0" }];
    const res = await POST(
      buildReq({
        chargeType: "drug-trafficking",
        district: "99", // unknown district
        criminalHistoryCategory: "3",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.match_depth).toBe("widened_district");
  });

  it("rejects missing chargeType with 400", async () => {
    const res = await POST(buildReq({ district: "42" }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid fyFrom/fyTo with 400", async () => {
    const res = await POST(
      buildReq({
        chargeType: "drug-trafficking",
        fyFrom: 10, // out of range
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate-limited", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ limited: true });
    const res = await POST(buildReq({ chargeType: "drug-trafficking" }));
    expect(res.status).toBe(429);
  });
});
