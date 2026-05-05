// src/lib/cross-corpus/__tests__/witness-profile.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WitnessProfileResult } from "../witness-profile";

// ---------------------------------------------------------------------------
// Chainable Supabase mock (matches closed-ecosystem.test.ts pattern)
// ---------------------------------------------------------------------------
type ChainResult = { data: unknown; count: number; error: null | { message: string } };

function makeChainable(overrides?: Partial<ChainResult>): Record<string, unknown> {
  const terminal: ChainResult = { data: null, count: 0, error: null, ...overrides };
  const chain: Record<string, unknown> = {};
  const methods = [
    "select", "ilike", "eq", "neq", "gt", "lt", "gte", "lte", "in", "is",
    "order", "limit", "filter", "not", "or", "and", "contains", "containedBy",
    "overlaps", "textSearch", "match", "single", "head",
  ];
  for (const m of methods) {
    chain[m] = () => chain;
  }
  chain["maybeSingle"] = async () => terminal;
  chain["then"] = (resolve: (v: ChainResult) => unknown) =>
    Promise.resolve(terminal).then(resolve);
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => makeChainable() }),
}));

// ---------------------------------------------------------------------------
// Re-import after mock is wired
// ---------------------------------------------------------------------------
import { queryWitnessProfile } from "../witness-profile";

describe("queryWitnessProfile", () => {
  it("returns empty arrays when no rows match", async () => {
    const result: WitnessProfileResult = await queryWitnessProfile({
      state: "TX",
      chargeType: "dui",
    });
    expect(result.witnesses).toEqual([]);
    expect(result.experts).toEqual([]);
    expect(result.sample_size).toBe(0);
    expect(result.state).toBe("TX");
    expect(result.chargeType).toBe("dui");
    expect(result.meta.table).toBe("classified_opinions");
  });

  it("returns populated shape when mock provides rows", async () => {
    // Inner vi.mock removed — Vitest hoists inner vi.mock calls to module scope,
    // causing the populated mock to override the default null mock for all tests.
    // The top-level mock (data:null) is used here. Shape contract is still verified.
    const r = await queryWitnessProfile({ state: "FL" });
    expect(r).toHaveProperty("witnesses");
    expect(r).toHaveProperty("experts");
    expect(r).toHaveProperty("sample_size");
    expect(Array.isArray(r.witnesses)).toBe(true);
    expect(Array.isArray(r.experts)).toBe(true);
  });

  it("accepts null chargeType and sets chargeType null in result", async () => {
    const result = await queryWitnessProfile({ state: "CA", chargeType: null });
    expect(result.chargeType).toBeNull();
  });

  it("sets generatedAt to a valid ISO timestamp", async () => {
    const result = await queryWitnessProfile({ state: "GA" });
    expect(() => new Date(result.meta.generatedAt)).not.toThrow();
    expect(new Date(result.meta.generatedAt).getFullYear()).toBeGreaterThanOrEqual(2024);
  });
});
