/**
 * Integration tests for GET /api/ussc-districts.
 *
 * Verifies:
 *   - Valid state code returns the districts list sorted by short_name
 *   - Missing state → 400
 *   - Non-2-letter state → 400
 *   - Lowercase state is upper-cased before query
 *   - Query error path falls back to empty array (200, not 500)
 *   - Rate limiting returns 429
 *
 * Mocks supabase `.from("ussc_districts").select(...).eq(...).order(...)` chain.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const txRows = [
  { district_code: "40", short_name: "S.D. Texas", district_name: "Southern District of Texas", circuit: "5th" },
  { district_code: "38", short_name: "N.D. Texas", district_name: "Northern District of Texas", circuit: "5th" },
  { district_code: "39", short_name: "E.D. Texas", district_name: "Eastern District of Texas", circuit: "5th" },
  { district_code: "42", short_name: "W.D. Texas", district_name: "Western District of Texas", circuit: "5th" },
];

let rowsByState: Record<string, unknown[]> = {};
let queryError: Error | null = null;
let lastOrderCall: { col: string; opts: unknown } | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let stateFilter: string | undefined;
      const chain = {
        select: () => chain,
        eq(col: string, val: string) {
          if (col === "state_code") stateFilter = val;
          return chain;
        },
        order(col: string, opts: unknown) {
          // Assert mock fidelity to the real supabase-js chain — route MUST
          // sort by short_name ascending or the E2E spec's ordering assertion
          // breaks silently (fixture alphabetical order is load-bearing).
          lastOrderCall = { col, opts };
          if (table !== "ussc_districts") {
            return Promise.resolve({ data: [], error: null });
          }
          if (queryError) {
            return Promise.resolve({ data: null, error: queryError });
          }
          return Promise.resolve({
            data: rowsByState[stateFilter ?? ""] ?? [],
            error: null,
          });
        },
      };
      return chain;
    },
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false })),
}));

import { GET } from "@/app/api/ussc-districts/route";
import { NextRequest } from "next/server";

function buildReq(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/ussc-districts${query}`, {
    headers: { "x-real-ip": "1.2.3.4" },
  });
}

beforeEach(() => {
  rowsByState = { TX: txRows };
  queryError = null;
  lastOrderCall = null;
});

describe("GET /api/ussc-districts", () => {
  it("returns districts for a valid state + sorts short_name ascending", async () => {
    const res = await GET(buildReq("?state=TX"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.districts).toHaveLength(4);
    expect(body.districts.every((d: { state_code?: string }) => !("state_code" in d))).toBe(true);
    const codes = body.districts.map((d: { district_code: string }) => d.district_code);
    expect(codes).toContain("42");
    // Contract: route calls .order("short_name", { ascending: true }). Any
    // drift (e.g. descending, or sorting by a different column) would
    // silently break the frontend's expected alphabetical render order —
    // assert the exact args so the test catches it pre-merge.
    expect(lastOrderCall).toEqual({ col: "short_name", opts: { ascending: true } });
  });

  it("upper-cases lowercase state codes before query", async () => {
    const res = await GET(buildReq("?state=tx"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.districts).toHaveLength(4);
  });

  it("returns 400 when state query param missing", async () => {
    const res = await GET(buildReq(""));
    expect(res.status).toBe(400);
  });

  it("returns 400 when state is not 2 letters", async () => {
    const res1 = await GET(buildReq("?state=T"));
    expect(res1.status).toBe(400);
    const res2 = await GET(buildReq("?state=TXX"));
    expect(res2.status).toBe(400);
    const res3 = await GET(buildReq("?state=12"));
    expect(res3.status).toBe(400);
  });

  it("returns empty array for a state with no districts", async () => {
    rowsByState = {};
    const res = await GET(buildReq("?state=TX"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.districts).toEqual([]);
  });

  it("returns 503 + no-store when the query errors (CDN must not cache)", async () => {
    queryError = new Error("connection refused");
    const res = await GET(buildReq("?state=TX"));
    // 503 signals transient failure — CDN edge won't cache, so a DB blip
    // doesn't poison the cache for 24h.
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.districts).toEqual([]);
    expect(body.error).toBeTruthy();
    expect(res.headers.get("Cache-Control") || "").toContain("no-store");
  });

  it("returns 429 when rate-limited", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ limited: true });
    const res = await GET(buildReq("?state=TX"));
    expect(res.status).toBe(429);
  });

  it("sets a long-lived Cache-Control header (codebook data is static)", async () => {
    const res = await GET(buildReq("?state=TX"));
    const cc = res.headers.get("Cache-Control") || "";
    expect(cc).toMatch(/max-age=3600/);
    expect(cc).toMatch(/s-maxage=86400/);
  });
});
