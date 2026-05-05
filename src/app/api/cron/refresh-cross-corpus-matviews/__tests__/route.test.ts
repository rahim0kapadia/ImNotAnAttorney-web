/**
 * Unit tests for /api/cron/refresh-cross-corpus-matviews.
 *
 * Exercises:
 *   - MATVIEWS drift-lock (exact set of matviews is a contract)
 *   - refreshOne: success, failure, error message propagation
 *   - GET handler: auth rejection, missing env, all-ok, partial-failure
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MATVIEWS, refreshOne } from "../route";
import type { MatviewName } from "../route";

// ── MATVIEWS drift-lock ───────────────────────────────────────────────────

describe("MATVIEWS drift-lock", () => {
  it("contains exactly the three cross-corpus matviews", () => {
    expect(MATVIEWS).toHaveLength(3);
    expect(MATVIEWS).toContain("mv_judge_officer_motion_rates");
    expect(MATVIEWS).toContain("mv_judge_bench_fingerprint");
    expect(MATVIEWS).toContain("mv_judge_docket_caseload");
  });

  it("first entry is J3 (officer × judge rates)", () => {
    expect(MATVIEWS[0]).toBe("mv_judge_officer_motion_rates");
  });

  it("second entry is BR-J1 (bench fingerprint)", () => {
    expect(MATVIEWS[1]).toBe("mv_judge_bench_fingerprint");
  });

  it("third entry is J1 (docket caseload)", () => {
    expect(MATVIEWS[2]).toBe("mv_judge_docket_caseload");
  });
});

// ── refreshOne unit tests ─────────────────────────────────────────────────

function makeStubClient(opts: { throws?: Error } = {}) {
  const queries: string[] = [];
  const client = {
    query: async (sql: string) => {
      queries.push(sql);
      if (opts.throws) throw opts.throws;
    },
    queries,
  };
  return client as unknown as import("pg").Client & { queries: string[] };
}

describe("refreshOne", () => {
  it("returns ok:true and records the SQL on success", async () => {
    const client = makeStubClient();
    const result = await refreshOne(client, "mv_judge_bench_fingerprint");
    expect(result.ok).toBe(true);
    expect(result.matview).toBe("mv_judge_bench_fingerprint");
    expect(result.ms).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
    expect(client.queries[0]).toContain("REFRESH MATERIALIZED VIEW CONCURRENTLY");
    expect(client.queries[0]).toContain("mv_judge_bench_fingerprint");
  });

  it("returns ok:false and error message on pg error", async () => {
    const boom = new Error("relation does not exist");
    const client = makeStubClient({ throws: boom });
    const result = await refreshOne(client, "mv_judge_officer_motion_rates");
    expect(result.ok).toBe(false);
    expect(result.matview).toBe("mv_judge_officer_motion_rates");
    expect(result.error).toBe("relation does not exist");
    expect(result.ms).toBeGreaterThanOrEqual(0);
  });

  it("returns ok:false with stringified error when non-Error is thrown", async () => {
    const client = {
      query: async () => { throw "plain string error"; },
    } as unknown as import("pg").Client;
    const result = await refreshOne(client, "mv_judge_docket_caseload");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("plain string error");
  });

  it("uses CONCURRENTLY in the SQL (readers never blocked)", async () => {
    const client = makeStubClient();
    await refreshOne(client, "mv_judge_docket_caseload");
    expect(client.queries[0]).toMatch(/CONCURRENTLY/);
  });

  it("never throws — always returns a result object", async () => {
    const error = new Error("catastrophic");
    const client = makeStubClient({ throws: error });
    // refreshOne must never reject — call directly and verify the return value.
    const result = await refreshOne(client, "mv_judge_bench_fingerprint");
    expect(result).toBeDefined();
    expect(result.ok).toBe(false);
  });
});

// ── GET handler integration tests ────────────────────────────────────────

// Mock the pg module so GET handler never dials a real DB
vi.mock("pg", () => {
  const Client = vi.fn();
  Client.prototype.connect = vi.fn().mockResolvedValue(undefined);
  Client.prototype.end = vi.fn().mockResolvedValue(undefined);
  Client.prototype.query = vi.fn().mockResolvedValue({ rows: [] });
  return { default: { Client } };
});

// Mock requireCron to control auth in handler tests
vi.mock("@/lib/auth/guards", () => ({
  requireCron: vi.fn(),
}));

import { GET } from "../route";
import { NextRequest } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import pg from "pg";

function makeReq(url = "https://inaa.com/api/cron/refresh-cross-corpus-matviews") {
  return new NextRequest(url, { method: "GET" });
}

function mockCronAuth(authorized: boolean) {
  if (authorized) {
    vi.mocked(requireCron).mockReturnValue({ authorized: true, error: null });
  } else {
    const errResp = Response.json({ error: "Unauthorized" }, { status: 401 });
    vi.mocked(requireCron).mockReturnValue({
      authorized: false,
      error: errResp as unknown as import("next/server").NextResponse,
    });
  }
}

describe("GET handler", () => {
  beforeEach(() => {
    vi.mocked(pg.Client.prototype.query).mockResolvedValue({ rows: [] } as unknown as never);
    process.env.SUPABASE_DB_URL = "postgresql://localhost/test";
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.SUPABASE_DB_URL;
  });

  it("returns 401 when cron auth fails", async () => {
    mockCronAuth(false);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 500 when SUPABASE_DB_URL is missing", async () => {
    mockCronAuth(true);
    delete process.env.SUPABASE_DB_URL;
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("SUPABASE_DB_URL");
  });

  it("returns 200 with all results ok when all queries succeed", async () => {
    mockCronAuth(true);
    vi.mocked(pg.Client.prototype.query).mockResolvedValue({ rows: [] } as unknown as never);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.results).toHaveLength(3);
    expect(body.results.every((r: { ok: boolean }) => r.ok)).toBe(true);
    expect(typeof body.timestamp).toBe("string");
    expect(typeof body.totalMs).toBe("number");
  });

  it("returns 500 with ok:false when any matview refresh fails", async () => {
    mockCronAuth(true);
    let callCount = 0;
    vi.mocked(pg.Client.prototype.query).mockImplementation(async (sql: string) => {
      callCount++;
      if (typeof sql === "string" && sql.includes("mv_judge_bench_fingerprint")) {
        throw new Error("matview lock timeout");
      }
      return { rows: [] };
    });
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.results).toHaveLength(3);
    const failed = body.results.find((r: { matview: string; ok: boolean }) => r.matview === "mv_judge_bench_fingerprint");
    expect(failed?.ok).toBe(false);
    expect(failed?.error).toContain("matview lock timeout");
  });

  it("calls client.connect() and client.end() exactly once per request", async () => {
    mockCronAuth(true);
    await GET(makeReq());
    expect(pg.Client.prototype.connect).toHaveBeenCalledTimes(1);
    expect(pg.Client.prototype.end).toHaveBeenCalledTimes(1);
  });

  it("calls client.end() even when all queries fail", async () => {
    mockCronAuth(true);
    vi.mocked(pg.Client.prototype.query).mockRejectedValue(new Error("all fail"));
    await GET(makeReq());
    expect(pg.Client.prototype.end).toHaveBeenCalledTimes(1);
  });

  it("response includes matview names for all three matviews", async () => {
    mockCronAuth(true);
    const res = await GET(makeReq());
    const body = await res.json();
    const names = body.results.map((r: { matview: MatviewName }) => r.matview);
    expect(names).toContain("mv_judge_officer_motion_rates");
    expect(names).toContain("mv_judge_bench_fingerprint");
    expect(names).toContain("mv_judge_docket_caseload");
  });
});
