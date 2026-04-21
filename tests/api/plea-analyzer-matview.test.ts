/**
 * Integration test — plea-analyzer's USSC matview augmentation.
 *
 * Verifies:
 *   - With district+offguide+xcrhissr+citizen+age supplied AND matview has both
 *     plea and trial rows → sentencingContext contains "trial tax" with the
 *     computed delta.
 *   - Without those fields → matview query skipped, existing context preserved.
 *   - With the fields but only plea row → no trial-tax line (still ships).
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
const trialRow = {
  ...pleaRow,
  plea_or_trial: "1",
  n_cases: 6,
  median_senttot: 25.5,
  pct_got_prison: 83.3,
  pct_downward_departure: null,
  earliest_fy: 19,
  latest_fy: 23,
};

const insertCalls: unknown[] = [];
let matviewRows: unknown[] = [];

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: (cb: () => Promise<void> | void) => { void cb(); } };
});

vi.mock("@/lib/supabase/admin", () => {
  const sentencingRows = [{ median_months: 3.13, p25: 1.82, p75: 5.76, sample_size: 7033 }];
  const outcomeRows = [{ plea_rate: 0.94, trial_rate: 0.06 }];

  const makeChain = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      gte: () => chain,
      order: () => chain,
      limit: () => {
        if (table === "sentencing_distributions") {
          return Promise.resolve({ data: sentencingRows, error: null });
        }
        if (table === "outcome_benchmarks") {
          return Promise.resolve({ data: outcomeRows, error: null });
        }
        return Promise.resolve({ data: [], error: null });
      },
      then(resolve: (r: { data: unknown[]; error: null }) => void) {
        if (table === "ussc_similar_cases_summary") {
          resolve({ data: matviewRows, error: null });
        } else {
          resolve({ data: [], error: null });
        }
      },
      insert: (payload: unknown) => {
        insertCalls.push(payload);
        return {
          select: () => ({
            single: async () => ({ data: { id: "order-123" }, error: null }),
          }),
        };
      },
    };
    return chain;
  };

  return {
    createAdminClient: () => ({ from: (t: string) => makeChain(t) }),
  };
});

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false })),
}));

import { POST } from "@/app/api/plea-analyzer/route";
import { NextRequest } from "next/server";

function buildReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/plea-analyzer", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

const baseIntake: Record<string, unknown> = {
  email: "jane+test@example.com",
  state: "FL",
  chargeType: "drug-possession",
  pleaOfferDetails: "20 years concurrent, drop counts 2-5, no enhancements.",
  originalCharges: "Trafficking > 400g cocaine",
  offeredCharges: "Possession with intent",
  sentencingExposure: "25-life",
};

beforeEach(() => {
  insertCalls.length = 0;
  matviewRows = [];
  globalThis.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
});

describe("POST /api/plea-analyzer — USSC matview augmentation", () => {
  it("appends trial-tax line to sentencingContext when both outcomes present + bucket fields supplied", async () => {
    matviewRows = [pleaRow, trialRow];
    // Intake uses friendly values (priorConvictions/citizenship/ageBucket);
    // route maps them through mapIntakeToBucket to USSC codes.
    // chargeType "drug-trafficking" maps to offguide "17".
    const res = await POST(
      buildReq({
        ...baseIntake,
        email: `matview-trial-tax-${Date.now()}@example.com`,
        chargeType: "drug-trafficking",
        priorConvictions: "none",
        citizenship: "citizen",
        ageBucket: "25-34",
      }),
    );
    expect(res.status).toBe(200);
    expect(insertCalls.length).toBe(1);
    const inserted = insertCalls[0] as {
      standalone_intake: { sentencingContext: string };
    };
    const ctx = inserted.standalone_intake.sentencingContext;
    expect(ctx).toContain("trial-vs-plea gap");
    expect(ctx).toMatch(/22\.4 months/);
    expect(ctx).toContain("USSC Individual Offender Datafiles");
  });

  it("works without bucket fields (matview skipped, JUSTFAIR context preserved)", async () => {
    const res = await POST(buildReq({ ...baseIntake, email: `no-matview-${Date.now()}@example.com` }));
    expect(res.status).toBe(200);
    const inserted = insertCalls[0] as {
      standalone_intake: { sentencingContext: string };
    };
    expect(inserted.standalone_intake.sentencingContext).toContain("District median");
    expect(inserted.standalone_intake.sentencingContext).not.toContain("trial-vs-plea gap");
  });

  it("omits trial-tax line when only plea row available in matview", async () => {
    matviewRows = [pleaRow];
    const res = await POST(
      buildReq({
        ...baseIntake,
        chargeType: "drug-trafficking",
        priorConvictions: "none",
        citizenship: "citizen",
        ageBucket: "25-34",
        email: `plea-only-${Date.now()}@example.com`,
      }),
    );
    expect(res.status).toBe(200);
    const inserted = insertCalls[0] as {
      standalone_intake: { sentencingContext: string };
    };
    expect(inserted.standalone_intake.sentencingContext).not.toContain("trial-vs-plea gap");
    expect(inserted.standalone_intake.sentencingContext).toContain("District median");
  });
});
