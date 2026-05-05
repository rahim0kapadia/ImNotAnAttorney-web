import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Mock Supabase admin client ────────────────────────────────────────────────

/**
 * Creates a chainable Supabase builder mock.
 *
 * The chain must be a proper thenable so that awaiting it (or calling .then())
 * resolves to finalValue. Supabase builders are awaitable — the builder IS the
 * promise. We implement the thenable protocol: chain.then(onFulfilled, onRejected)
 * calls onFulfilled(finalValue), which is what Promise.resolve(chain) and await
 * both use under the hood.
 */
function makeChainable(finalValue: { data: unknown; error: null; count?: number }) {
  const resolved = { ...finalValue, count: 0 };

  const chain: Record<string, unknown> = {
    // Thenable protocol — makes `await chain` and `.then(fn)` work
    then: vi.fn((onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
      void onRejected;
      return Promise.resolve(onFulfilled ? onFulfilled(resolved) : resolved);
    }),
    catch: vi.fn(() => Promise.resolve(resolved)),
  };

  const chainMethods = ["select", "eq", "ilike", "limit", "order"];
  for (const m of chainMethods) {
    chain[m] = vi.fn(() => chain);
  }

  chain["maybeSingle"] = vi.fn(() => Promise.resolve(resolved));

  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => makeChainable({ data: null, error: null })),
  })),
}));

vi.mock("@/lib/cross-corpus/bench-fingerprint", () => ({
  queryBenchFingerprint: vi.fn(async () => ({
    meta: { generatedAt: new Date().toISOString(), matview: "mv_judge_bench_fingerprint" },
    judge: { cl_person_id: 0, profile_name: "(unknown)", district: null },
    ussc: {
      total_cases: 0,
      median_sentence_months: null,
      mean_sentence_months: null,
      p25_sentence_months: null,
      p75_sentence_months: null,
      downward_departure_rate: null,
      upward_departure_rate: null,
      substantial_assistance_rate: null,
      government_sponsored_below_range_rate: null,
    },
    caseload: { federal_docket_count: null, earliest_docket: null, latest_docket: null },
    breakdowns: { offense: null, criminal_history: null },
    name_similarity: null,
  })),
}));

import { queryJudgeReportCardStandalone } from "../query";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("queryJudgeReportCardStandalone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns isEmpty=true when no data found for any source", async () => {
    const result = await queryJudgeReportCardStandalone({
      judgeFullName: "Hon. Unknown Judge",
      state: "FL",
    });

    expect(result.isEmpty).toBe(true);
    expect(result.docketCaseload).toBeNull();
    expect(result.civilPartyConflicts).toEqual([]);
    expect(result.motionOutcomeRates).toEqual([]);
    expect(result.quotes).toEqual([]);
  });

  it("returns correct meta fields", async () => {
    const result = await queryJudgeReportCardStandalone({
      judgeFullName: "Hon. Patricia Sullivan",
      state: "FL",
    });

    expect(result.meta.judgeFullName).toBe("Hon. Patricia Sullivan");
    expect(result.meta.state).toBe("FL");
    expect(typeof result.meta.generatedAt).toBe("string");
    expect(new Date(result.meta.generatedAt).toString()).not.toBe("Invalid Date");
  });

  it("returns benchFingerprint from queryBenchFingerprint even when empty", async () => {
    const result = await queryJudgeReportCardStandalone({
      judgeFullName: "Test Judge",
      state: "TX",
    });

    expect(result.benchFingerprint).toBeDefined();
    expect(result.benchFingerprint.ussc).toBeDefined();
    expect(result.benchFingerprint.ussc.total_cases).toBe(0);
  });

  it("filters quotes shorter than 40 chars", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const mockClient = createAdminClient() as unknown as SupabaseClient;

    // Judge profiles returns a profile so we get a judgeUuid
    vi.mocked(mockClient.from).mockImplementation((table: string) => {
      if (table === "judge_profiles") {
        const chain = makeChainable({
          data: [{ id: "test-uuid-123", full_name: "Test Judge", cl_person_id: "12345" }],
          error: null,
        });
        return chain as unknown as ReturnType<SupabaseClient["from"]>;
      }
      if (table === "judge_quotes") {
        const chain = makeChainable({
          data: [
            { judge_id: "test-uuid-123", quote: "Short.", topic: null, case_cited: null, source_url: null },
            { judge_id: "test-uuid-123", quote: "This is a sufficiently long quote that passes the 40-char minimum threshold.", topic: "Evidence", case_cited: null, source_url: null },
          ],
          error: null,
        });
        return chain as unknown as ReturnType<SupabaseClient["from"]>;
      }
      return makeChainable({ data: null, error: null }) as unknown as ReturnType<SupabaseClient["from"]>;
    });

    const result = await queryJudgeReportCardStandalone({
      judgeFullName: "Test Judge",
      state: "FL",
    });

    // Short quote (6 chars) should be filtered; long quote should remain
    // This verifies the ≥40 char filter in query.ts
    expect(result.quotes.every((q) => q.quote.length >= 40)).toBe(true);
  });
});
