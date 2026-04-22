/**
 * Integration tests for GET /api/tools/scotus-case-search.
 *
 * Mocks `supabase.rpc("scotus_case_search", ...)`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let lastRpcArgs: Record<string, unknown> | null = null;
let rpcRows: unknown[] = [];
let rpcError: Error | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn !== "scotus_case_search") {
        throw new Error(`unexpected rpc: ${fn}`);
      }
      lastRpcArgs = args;
      if (rpcError) return { data: null, error: rpcError };
      return { data: rpcRows, error: null };
    },
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false })),
}));

import { GET } from "@/app/api/tools/scotus-case-search/route";
import { NextRequest } from "next/server";

function buildReq(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/tools/scotus-case-search${query}`, {
    headers: { "x-real-ip": "1.2.3.4" },
  });
}

beforeEach(() => {
  lastRpcArgs = null;
  rpcRows = [];
  rpcError = null;
});

describe("GET /api/tools/scotus-case-search", () => {
  it("empty query → RPC called with q=null, default limit 20", async () => {
    rpcRows = [
      { case_id: 1, name: "Foo v. Bar", rank: 0, citation_year: "2020" },
    ];
    const res = await GET(buildReq(""));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.count).toBe(1);
    expect(lastRpcArgs).toEqual({
      q: null,
      year_from: null,
      year_to: null,
      result_limit: 20,
    });
    expect(body.dataSource).toMatch(/Oyez/);
    expect(body.disclaimer).toMatch(/legal INFORMATION/i);
  });

  it("trims + passes non-empty query to RPC", async () => {
    rpcRows = [];
    await GET(buildReq("?q=%20miranda%20warnings%20"));
    expect(lastRpcArgs?.q).toBe("miranda warnings");
  });

  it("accepts and passes through valid year filters", async () => {
    rpcRows = [];
    await GET(buildReq("?q=test&year_from=2000&year_to=2010&limit=5"));
    expect(lastRpcArgs).toEqual({
      q: "test",
      year_from: "2000",
      year_to: "2010",
      result_limit: 5,
    });
  });

  it("rejects invalid year_from (non-4-digit)", async () => {
    const res = await GET(buildReq("?q=test&year_from=abcd"));
    expect(res.status).toBe(400);
    const res2 = await GET(buildReq("?q=test&year_from=123"));
    expect(res2.status).toBe(400);
    const res3 = await GET(buildReq("?q=test&year_from=12345"));
    expect(res3.status).toBe(400);
  });

  it("rejects invalid year_to (non-4-digit)", async () => {
    const res = await GET(buildReq("?q=test&year_to=xyz"));
    expect(res.status).toBe(400);
  });

  it("ignores blank year_from / year_to query params", async () => {
    rpcRows = [];
    await GET(buildReq("?q=test&year_from=&year_to="));
    expect(lastRpcArgs?.year_from).toBeNull();
    expect(lastRpcArgs?.year_to).toBeNull();
  });

  it("rejects limit out of 1..50", async () => {
    const res = await GET(buildReq("?q=test&limit=0"));
    expect(res.status).toBe(400);
    const res2 = await GET(buildReq("?q=test&limit=51"));
    expect(res2.status).toBe(400);
    const res3 = await GET(buildReq("?q=test&limit=abc"));
    expect(res3.status).toBe(400);
  });

  it("rejects q longer than 300 chars (avoid pathological inputs)", async () => {
    const longQ = "a".repeat(301);
    const res = await GET(buildReq(`?q=${longQ}`));
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate-limited", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ limited: true });
    const res = await GET(buildReq("?q=test"));
    expect(res.status).toBe(429);
  });

  it("returns 500 when RPC errors", async () => {
    rpcError = new Error("db down");
    const res = await GET(buildReq("?q=test"));
    expect(res.status).toBe(500);
  });

  it("sets short-lived Cache-Control with SWR", async () => {
    rpcRows = [];
    const res = await GET(buildReq("?q=test"));
    const cc = res.headers.get("Cache-Control") || "";
    expect(cc).toMatch(/max-age=300/);
    expect(cc).toMatch(/stale-while-revalidate/);
  });

  it("clamps limit default to 20", async () => {
    rpcRows = [];
    await GET(buildReq("?q=test"));
    expect(lastRpcArgs?.result_limit).toBe(20);
  });

  it("rejects year_from > year_to (sane range)", async () => {
    const res = await GET(buildReq("?q=test&year_from=2020&year_to=2000"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/year_from.*less than or equal/i);
  });

  it("whitespace-only q is null-coerced (not sent as string)", async () => {
    rpcRows = [];
    await GET(buildReq("?q=%20%20%20"));
    expect(lastRpcArgs?.q).toBeNull();
  });

  it("websearch-to-tsquery syntax in q passes through unescaped (the RPC sanitizes)", async () => {
    // SQL-injection attempt against RPC — Supabase param-binding + the RPC's
    // use of websearch_to_tsquery should sanitize it. This test documents the
    // contract: the route does not reject arbitrary q content below the length cap.
    rpcRows = [];
    const inj = `"); DROP TABLE scotus_cases; --`;
    await GET(buildReq(`?q=${encodeURIComponent(inj)}`));
    expect(lastRpcArgs?.q).toBe(inj);
  });

  it("Cache-Control specifies exact max-age + SWR window", async () => {
    rpcRows = [];
    const res = await GET(buildReq("?q=test"));
    const cc = res.headers.get("Cache-Control") || "";
    expect(cc).toMatch(/public/);
    expect(cc).toMatch(/max-age=300\b/);
    expect(cc).toMatch(/stale-while-revalidate=3600\b/);
  });
});
