// src/lib/war-room/__tests__/cross-corpus-sections.test.ts
import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Chainable Supabase mock
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

import { renderWarRoomCrossCorpusSections } from "../cross-corpus-sections";

describe("renderWarRoomCrossCorpusSections", () => {
  it("SC-2: returns combined string containing all 3 section headers", async () => {
    const result = await renderWarRoomCrossCorpusSections({
      caseId: "case-123",
      judgeName: "Judge Smith",
      state: "FL",
      chargeType: "dui",
      officerName: "Officer Jones",
    });
    // closedEcosystem section header
    expect(result.closedEcosystem).toContain("## Closed-Ecosystem Map");
    // benchFingerprint section header
    expect(result.benchFingerprint).toContain("## Federal Sentencing Bench Fingerprint");
    // officerJudgeRates: non-null (officer was provided)
    expect(result.officerJudgeRates).not.toBeNull();
    // combined has all pieces
    expect(result.combined).toContain("## Closed-Ecosystem Map");
    expect(result.combined).toContain("## Federal Sentencing Bench Fingerprint");
  });

  it("returns null for officerJudgeRates when no officerName provided", async () => {
    const result = await renderWarRoomCrossCorpusSections({
      caseId: "case-456",
      judgeName: "Judge Brown",
      state: "TX",
    });
    expect(result.officerJudgeRates).toBeNull();
  });

  it("combined is non-empty string with section separator", async () => {
    const result = await renderWarRoomCrossCorpusSections({
      caseId: "case-789",
      judgeName: "Judge Davis",
      state: "CA",
      officerName: "Officer Lee",
    });
    expect(typeof result.combined).toBe("string");
    expect(result.combined.length).toBeGreaterThan(50);
    expect(result.combined).toContain("---");
  });

  it("combined excludes officer section separator when no officer provided", async () => {
    const withOfficer = await renderWarRoomCrossCorpusSections({
      caseId: "case-aaa",
      judgeName: "Judge A",
      state: "FL",
      officerName: "Officer A",
    });
    const withoutOfficer = await renderWarRoomCrossCorpusSections({
      caseId: "case-bbb",
      judgeName: "Judge B",
      state: "FL",
    });
    // With officer: 3 sections = 2 separators
    // Without officer: 2 sections = 1 separator
    const withCount = (withOfficer.combined.match(/---/g) ?? []).length;
    const withoutCount = (withoutOfficer.combined.match(/---/g) ?? []).length;
    expect(withCount).toBeGreaterThan(withoutCount);
  });
});
