/**
 * Unit tests for GET /api/admin/extraction-coverage.
 *
 * Tests auth (401 without header, 200 with valid header) and response
 * shape validation. Stubs Supabase + requireAdmin so no real DB calls.
 *
 * Shape contract: all fields in ExtractionCoveragePayload must be present
 * with correct types regardless of whether the admin_extraction_coverage
 * RPC path or the manual-count fallback executes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock requireAdmin ────────────────────────────────────────────────────
vi.mock("@/lib/auth/guards", () => ({
  requireAdmin: vi.fn(),
}));

// ── Mock createAdminClient ────────────────────────────────────────────────
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { requireAdmin } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { GET } from "../route";
import type { ExtractionCoveragePayload } from "../route";

// ── Helpers ───────────────────────────────────────────────────────────────

function makeReq(adminPassword?: string): NextRequest {
  const headers: HeadersInit = adminPassword
    ? { "x-admin-password": adminPassword }
    : {};
  return new NextRequest("http://localhost/api/admin/extraction-coverage", {
    headers,
  });
}

function makeUnauthorizedResponse() {
  const { NextResponse } = require("next/server");
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// Builds a stub Supabase client that returns the provided coverage data
// from the admin_extraction_coverage RPC and minimal data for other calls.
function makeStubSupabase(opts: {
  rpcData?: Record<string, unknown> | null;
  rpcError?: boolean;
  officersTotal?: number;
  officersGrouped?: Array<{ provenance_source: string }>;
  cronRow?: { started_at: string; completed_at: string | null; errors: string[] } | null;
} = {}) {
  const {
    rpcData = null,
    rpcError = false,
    officersTotal = 506031,
    officersGrouped = [
      { provenance_source: "cpd" },
      { provenance_source: "nypd" },
      { provenance_source: "cpd" },
    ],
    cronRow = { started_at: "2026-05-04T00:00:00Z", completed_at: "2026-05-04T00:01:00Z", errors: [] },
  } = opts;

  // Tracks which RPC was called.
  const rpcCalls: string[] = [];

  const fromHandlers: Record<string, unknown> = {
    entities_officers: {
      select: (cols: string, selectOpts?: unknown) => {
        if (typeof selectOpts === "object" && selectOpts !== null && (selectOpts as { head?: boolean }).head) {
          return { count: officersTotal, error: null };
        }
        // grouped query (no head)
        return {
          not: (_col: string, _op: string, _val: unknown) => ({
            data: officersGrouped,
            error: null,
          }),
          data: officersGrouped,
          error: null,
        };
      },
    },
    mv_judge_officer_motion_rates: {
      select: () => ({ count: 309, error: null }),
    },
    mv_judge_bench_fingerprint: {
      select: () => ({ count: 2822, error: null }),
    },
    mv_judge_docket_caseload: {
      select: () => ({ count: 3306, error: null }),
    },
    cron_runs: {
      select: () => ({
        order: () => ({
          limit: () => ({
            maybeSingle: async () => ({ data: cronRow, error: null }),
          }),
        }),
      }),
    },
  };

  return {
    rpc: vi.fn(async (name: string) => {
      rpcCalls.push(name);
      if (name === "admin_extraction_coverage") {
        if (rpcError) return { data: null, error: { message: "rpc not found" } };
        return {
          data: rpcData ?? {
            total: 400000,
            officer_names: 136000,
            witness_names: 235000,
            expert_witness_names: 100000,
            prosecutor_names: 10000,
            defense_attorney_names: 4000,
            sentence_months_extracted: 86000,
            fine_dollars_extracted: 19000,
            restitution_dollars_extracted: 4000,
            extracted_at_oldest: "2023-01-01T00:00:00Z",
            extracted_at_newest: "2026-05-04T00:00:00Z",
          },
          error: null,
        };
      }
      if (name === "admin_matview_last_refresh") {
        return { data: "2026-05-04T03:00:00Z", error: null };
      }
      return { data: null, error: { message: "unknown rpc" } };
    }),
    from: vi.fn((table: string) => fromHandlers[table] ?? {
      select: () => ({ count: 0, error: null }),
    }),
    _rpcCalls: rpcCalls,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("GET /api/admin/extraction-coverage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 without admin password header", async () => {
    const mockGuard = requireAdmin as ReturnType<typeof vi.fn>;
    const errorRes = makeUnauthorizedResponse();
    mockGuard.mockReturnValue({ authorized: false, error: errorRes });

    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid admin password", async () => {
    const mockGuard = requireAdmin as ReturnType<typeof vi.fn>;
    mockGuard.mockReturnValue({ authorized: true, error: null });

    const mockClient = makeStubSupabase();
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient);

    const res = await GET(makeReq("correct-password"));
    expect(res.status).toBe(200);
  });

  it("response has correct top-level shape", async () => {
    const mockGuard = requireAdmin as ReturnType<typeof vi.fn>;
    mockGuard.mockReturnValue({ authorized: true, error: null });

    const mockClient = makeStubSupabase();
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient);

    const res = await GET(makeReq("pw"));
    const body = await res.json() as ExtractionCoveragePayload;

    expect(body).toHaveProperty("classified_opinions");
    expect(body).toHaveProperty("entities_officers");
    expect(body).toHaveProperty("matviews");
    expect(body).toHaveProperty("cron");
  });

  it("classified_opinions section has all required columns", async () => {
    const mockGuard = requireAdmin as ReturnType<typeof vi.fn>;
    mockGuard.mockReturnValue({ authorized: true, error: null });

    const mockClient = makeStubSupabase();
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient);

    const res = await GET(makeReq("pw"));
    const body = await res.json() as ExtractionCoveragePayload;
    const co = body.classified_opinions;

    expect(typeof co.total).toBe("number");
    const colKeys = [
      "officer_names",
      "witness_names",
      "expert_witness_names",
      "prosecutor_names",
      "defense_attorney_names",
      "sentence_months_extracted",
      "fine_dollars_extracted",
      "restitution_dollars_extracted",
    ] as const;
    for (const key of colKeys) {
      expect(typeof co[key].populated).toBe("number");
      expect(typeof co[key].pct).toBe("number");
    }
    // extracted_at fields: null or ISO string
    expect(co.extracted_at_oldest === null || typeof co.extracted_at_oldest === "string").toBe(true);
    expect(co.extracted_at_newest === null || typeof co.extracted_at_newest === "string").toBe(true);
  });

  it("pct values are 0-100 and match populated/total ratio", async () => {
    const mockGuard = requireAdmin as ReturnType<typeof vi.fn>;
    mockGuard.mockReturnValue({ authorized: true, error: null });

    const mockClient = makeStubSupabase();
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient);

    const res = await GET(makeReq("pw"));
    const body = await res.json() as ExtractionCoveragePayload;
    const co = body.classified_opinions;

    // officer_names: 136000 / 400000 = 34.00
    expect(co.officer_names.pct).toBeCloseTo(34.0, 1);
    expect(co.officer_names.pct).toBeGreaterThanOrEqual(0);
    expect(co.officer_names.pct).toBeLessThanOrEqual(100);
  });

  it("entities_officers has correct shape with provenance grouping", async () => {
    const mockGuard = requireAdmin as ReturnType<typeof vi.fn>;
    mockGuard.mockReturnValue({ authorized: true, error: null });

    const mockClient = makeStubSupabase({
      officersGrouped: [
        { provenance_source: "cpd" },
        { provenance_source: "cpd" },
        { provenance_source: "oei" },
      ],
    });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient);

    const res = await GET(makeReq("pw"));
    const body = await res.json() as ExtractionCoveragePayload;
    const eo = body.entities_officers;

    expect(typeof eo.total).toBe("number");
    expect(typeof eo.with_provenance).toBe("number");
    expect(typeof eo.pct).toBe("number");
    expect(eo.by_source["cpd"]).toBe(2);
    expect(eo.by_source["oei"]).toBe(1);
    expect(eo.with_provenance).toBe(3);
  });

  it("matviews array has correct length and shape", async () => {
    const mockGuard = requireAdmin as ReturnType<typeof vi.fn>;
    mockGuard.mockReturnValue({ authorized: true, error: null });

    const mockClient = makeStubSupabase();
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient);

    const res = await GET(makeReq("pw"));
    const body = await res.json() as ExtractionCoveragePayload;

    expect(Array.isArray(body.matviews)).toBe(true);
    expect(body.matviews.length).toBe(3);
    for (const mv of body.matviews) {
      expect(typeof mv.name).toBe("string");
      expect(typeof mv.rows).toBe("number");
      expect(mv.last_refresh === null || typeof mv.last_refresh === "string").toBe(true);
    }
  });

  it("matviews rows match expected values", async () => {
    const mockGuard = requireAdmin as ReturnType<typeof vi.fn>;
    mockGuard.mockReturnValue({ authorized: true, error: null });

    const mockClient = makeStubSupabase();
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient);

    const res = await GET(makeReq("pw"));
    const body = await res.json() as ExtractionCoveragePayload;

    const mv = Object.fromEntries(body.matviews.map((m) => [m.name, m]));
    expect(mv["mv_judge_officer_motion_rates"].rows).toBe(309);
    expect(mv["mv_judge_bench_fingerprint"].rows).toBe(2822);
    expect(mv["mv_judge_docket_caseload"].rows).toBe(3306);
  });

  it("cron section reflects ok status when no errors", async () => {
    const mockGuard = requireAdmin as ReturnType<typeof vi.fn>;
    mockGuard.mockReturnValue({ authorized: true, error: null });

    const mockClient = makeStubSupabase({
      cronRow: { started_at: "2026-05-04T00:00:00Z", completed_at: "2026-05-04T00:01:00Z", errors: [] },
    });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient);

    const res = await GET(makeReq("pw"));
    const body = await res.json() as ExtractionCoveragePayload;

    expect(body.cron.last_status).toBe("ok");
    expect(body.cron.last_run).toBe("2026-05-04T00:00:00Z");
  });

  it("cron section reflects error status when cron_runs.errors is non-empty", async () => {
    const mockGuard = requireAdmin as ReturnType<typeof vi.fn>;
    mockGuard.mockReturnValue({ authorized: true, error: null });

    const mockClient = makeStubSupabase({
      cronRow: { started_at: "2026-05-04T00:00:00Z", completed_at: null, errors: ["mv refresh failed"] },
    });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient);

    const res = await GET(makeReq("pw"));
    const body = await res.json() as ExtractionCoveragePayload;

    expect(body.cron.last_status).toBe("error");
  });

  it("cron section is null when no cron runs exist", async () => {
    const mockGuard = requireAdmin as ReturnType<typeof vi.fn>;
    mockGuard.mockReturnValue({ authorized: true, error: null });

    const mockClient = makeStubSupabase({ cronRow: null });
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient);

    const res = await GET(makeReq("pw"));
    const body = await res.json() as ExtractionCoveragePayload;

    expect(body.cron.last_run).toBeNull();
    expect(body.cron.last_status).toBeNull();
  });

  it("falls back gracefully when admin_extraction_coverage RPC is not deployed", async () => {
    const mockGuard = requireAdmin as ReturnType<typeof vi.fn>;
    mockGuard.mockReturnValue({ authorized: true, error: null });

    // When RPC fails the route falls back to manual COUNT queries on
    // classified_opinions. Provide a stub that returns a count for every
    // .select(..., { head: true }) call and null for the maybeSingle date
    // range queries, plus the standard entities_officers / matviews / cron.
    const countStub = {
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) {
          // Return a chainable object satisfying COUNT result and two chained .not() calls
          // (array cols call .not(col,"is",null).not(col,"eq","{}")).
          const leafCount = { count: 200000, error: null };
          const notChain = { count: 200000, error: null, not: () => leafCount };
          const countResult = { count: 400000, error: null, not: () => notChain };
          return countResult;
        }
        // extracted_at maybeSingle queries
        return {
          not: (_c: string, _o: string, _v: unknown) => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        };
      },
    };

    const client = {
      rpc: vi.fn(async (name: string) => {
        if (name === "admin_extraction_coverage") {
          return { data: null, error: { message: "rpc not found" } };
        }
        if (name === "admin_matview_last_refresh") {
          return { data: null, error: null };
        }
        return { data: null, error: { message: "unknown" } };
      }),
      from: vi.fn((table: string) => {
        if (table === "classified_opinions") return countStub;
        if (table === "entities_officers") {
          return {
            select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
              if (opts?.head) return { count: 506031, error: null };
              return {
                not: () => ({ data: [{ provenance_source: "cpd" }], error: null }),
              };
            },
          };
        }
        if (
          table === "mv_judge_officer_motion_rates" ||
          table === "mv_judge_bench_fingerprint" ||
          table === "mv_judge_docket_caseload"
        ) {
          return { select: () => ({ count: 0, error: null }) };
        }
        if (table === "cron_runs") {
          return {
            select: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          };
        }
        return { select: () => ({ count: 0, error: null }) };
      }),
    };

    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    const res = await GET(makeReq("pw"));
    // Should still return 200 — fallback path is non-fatal.
    expect(res.status).toBe(200);
    const body = await res.json() as ExtractionCoveragePayload;
    expect(body).toHaveProperty("classified_opinions");
    expect(body.classified_opinions.total).toBeGreaterThanOrEqual(0);
  });
});
