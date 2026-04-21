/**
 * Integration tests for POST /api/tools/similar-cases ($297 product).
 *
 * Covers:
 *   - Exact-match bucket with plea + trial rows
 *   - Progressive widening when exact empty
 *   - Insufficient data fallback
 *   - Input validation (missing fields → 400)
 *   - Missing age normalizes to UNK (triggers widening)
 *   - UPL-safe phrasing in the response
 *
 * Uses mocked Supabase client — NO live DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fixturePlea = {
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
const fixtureTrial = {
  ...fixturePlea,
  plea_or_trial: "1",
  n_cases: 6,
  median_senttot: 25.5,
  pct_got_prison: 83.3,
  pct_downward_departure: null,
  earliest_fy: 19,
  latest_fy: 23,
};

function filterKey(filters: Record<string, string>): string {
  return Object.entries(filters)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
}

let rowsByFilterKey: Record<string, unknown[]> = {};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const filters: Record<string, string> = {};
      const chain = {
        select: () => chain,
        eq(col: string, val: string) {
          filters[col] = val;
          return chain;
        },
        then(resolve: (r: { data: unknown[]; error: null }) => void) {
          resolve({ data: rowsByFilterKey[filterKey(filters)] ?? [], error: null });
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

import { POST } from "@/app/api/tools/similar-cases/route";
import { NextRequest } from "next/server";

function buildReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/tools/similar-cases", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  rowsByFilterKey = {};
});

describe("POST /api/tools/similar-cases", () => {
  it("returns exact-match bucket with both plea and trial rows", async () => {
    rowsByFilterKey[
      filterKey({
        age_bucket: "25-34",
        citizen: "3",
        district: "42",
        offguide: "17",
        xcrhissr: "1",
      })
    ] = [fixturePlea, fixtureTrial];

    const res = await POST(
      buildReq({ district: "42", offguide: "17", xcrhissr: "1", citizen: "3", age: 28 }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.match_depth).toBe("exact");
    expect(body.result.input.age_bucket).toBe("25-34");
    expect(body.result.total_cases).toBe(7039);
    expect(body.result.outcomes.plea.median_months).toBe(3.13);
    expect(body.result.outcomes.trial.median_months).toBe(25.5);
    expect(body.result.trial_tax_months).toBeCloseTo(22.37, 2);
    expect(body.result.sample_size_caveat).toContain("7039 cases");
    expect(body.result.federalOnly).toBe(true);

    const text = JSON.stringify(body);
    expect(text).not.toMatch(/\byou should\b/i);
    expect(text).not.toMatch(/\bwe recommend\b/i);
    expect(text).not.toMatch(/\bwe advise\b/i);
  });

  it("widens by dropping age when exact bucket empty", async () => {
    rowsByFilterKey[
      filterKey({
        citizen: "3",
        district: "42",
        offguide: "17",
        xcrhissr: "1",
      })
    ] = [fixturePlea];

    const res = await POST(
      buildReq({ district: "42", offguide: "17", xcrhissr: "1", citizen: "3", age: 75 }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.match_depth).toBe("widened_age");
    expect(body.result.widening_note).toBeTruthy();
  });

  it("returns insufficient_data when nothing matches", async () => {
    const res = await POST(
      buildReq({ district: "99", offguide: "ZZ", xcrhissr: "9", citizen: "9", age: 30 }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.match_depth).toBe("insufficient_data");
    expect(body.result.outcomes.plea).toBeNull();
    expect(body.result.outcomes.trial).toBeNull();
    expect(body.result.trial_tax_months).toBeNull();
  });

  it("rejects missing required fields with 400", async () => {
    const res = await POST(buildReq({ district: "42" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/validation/i);
  });

  it("rejects non-number age with 400", async () => {
    const res = await POST(
      buildReq({
        district: "42",
        offguide: "17",
        xcrhissr: "1",
        citizen: "3",
        age: "twenty",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("accepts missing age (normalizes to UNK, triggers widening)", async () => {
    rowsByFilterKey[
      filterKey({
        age_bucket: "UNK",
        citizen: "3",
        district: "42",
        offguide: "17",
        xcrhissr: "1",
      })
    ] = [];
    rowsByFilterKey[
      filterKey({
        citizen: "3",
        district: "42",
        offguide: "17",
        xcrhissr: "1",
      })
    ] = [fixturePlea];

    const res = await POST(
      buildReq({ district: "42", offguide: "17", xcrhissr: "1", citizen: "3" }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.input.age_bucket).toBe("UNK");
    expect(body.result.match_depth).toBe("widened_age");
  });

  it("returns 429 when rate-limited", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ limited: true });
    const res = await POST(
      buildReq({ district: "42", offguide: "17", xcrhissr: "1", citizen: "3", age: 28 }),
    );
    expect(res.status).toBe(429);
  });
});
