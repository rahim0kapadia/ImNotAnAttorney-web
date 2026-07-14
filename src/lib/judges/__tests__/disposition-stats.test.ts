/**
 * @file Unit tests for disposition-stats helper.
 *
 * Pure helpers (computePercentileInDistribution, renderDispositionLine) are
 * tested without the DB. The DB-touching path is tested via mock supabase
 * client because the matview state is non-deterministic (refresh window).
 *
 * TICKET-2 (2026-05-03).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  computePercentileInDistribution,
  renderDispositionLine,
  buildJudgeDispositionResearchBlock,
  JUDGE_COVERAGE_FLOOR,
  type DistrictDispositionStats,
  type JudgeDispositionResult,
} from "../disposition-stats";

// ─────────────────────────────────────────────────────────────────
// Mock setup
// ─────────────────────────────────────────────────────────────────

const mockChain = (rows: unknown[] | null, error: unknown = null) => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: rows, error }),
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
const createAdminClientMock = createAdminClient as unknown as ReturnType<typeof vi.fn>;

// ─────────────────────────────────────────────────────────────────
// Pure helper tests
// ─────────────────────────────────────────────────────────────────

describe("computePercentileInDistribution", () => {
  const district = {
    p10Days: 100,
    p25Days: 200,
    medianDays: 400,
    p75Days: 700,
    p90Days: 1000,
  };

  it("clamps below p10 to 5", () => {
    expect(computePercentileInDistribution(50, district)).toBe(5);
    expect(computePercentileInDistribution(0, district)).toBe(5);
  });

  it("clamps above p90 to 95", () => {
    expect(computePercentileInDistribution(2000, district)).toBe(95);
    expect(computePercentileInDistribution(1500, district)).toBe(95);
  });

  it("returns the anchor pct at exact anchor values", () => {
    expect(computePercentileInDistribution(100, district)).toBe(10);
    expect(computePercentileInDistribution(200, district)).toBe(25);
    expect(computePercentileInDistribution(400, district)).toBe(50);
    expect(computePercentileInDistribution(700, district)).toBe(75);
    expect(computePercentileInDistribution(1000, district)).toBe(90);
  });

  it("interpolates linearly between anchors", () => {
    // Halfway between p25=200 and median=400 should be 37 or 38 (avg of 25 and 50)
    expect(computePercentileInDistribution(300, district)).toBeGreaterThanOrEqual(37);
    expect(computePercentileInDistribution(300, district)).toBeLessThanOrEqual(38);
    // Halfway between median=400 and p75=700 should be 62 or 63
    expect(computePercentileInDistribution(550, district)).toBeGreaterThanOrEqual(62);
    expect(computePercentileInDistribution(550, district)).toBeLessThanOrEqual(63);
  });

  it("handles degenerate (equal anchors) without divide by zero", () => {
    const flat = { p10Days: 100, p25Days: 100, medianDays: 100, p75Days: 100, p90Days: 100 };
    // value === all anchors → first matching anchor (p10) returned, no NaN
    expect(computePercentileInDistribution(100, flat)).toBe(10);
    expect(computePercentileInDistribution(50, flat)).toBe(5); // below
    expect(computePercentileInDistribution(200, flat)).toBe(95); // above
  });
});

// ─────────────────────────────────────────────────────────────────
// Render helper tests
// ─────────────────────────────────────────────────────────────────

describe("renderDispositionLine", () => {
  const judgeBase = {
    authorId: 12345,
    caseClass: "criminal" as const,
    sampleN: 80,
    p25Days: 90,
    medianDays: 180,
    p75Days: 360,
    primaryCourtId: "flsd",
    dataAsOf: "2026-05-03T00:00:00Z",
  };

  const districtBase: DistrictDispositionStats = {
    courtId: "flsd",
    caseClass: "criminal",
    sampleN: 5000,
    p10Days: 60,
    p25Days: 100,
    medianDays: 150,
    p75Days: 250,
    p90Days: 400,
    dataAsOf: "2026-05-03T00:00:00Z",
  };

  it("returns null when result is null", () => {
    expect(renderDispositionLine(null)).toBeNull();
  });

  it("renders 'longer than X% of bench' when judge percentile >= 60", () => {
    const r: JudgeDispositionResult = {
      judge: { ...judgeBase, medianDays: 300 },
      district: districtBase,
      judgePercentileInDistrict: 75,
      judgeMedianRatio: 2.0,
    };
    const line = renderDispositionLine(r);
    expect(line).toContain("longer than 75% of the bench");
    expect(line).toContain("criminal cases");
    expect(line).toContain("Plan for the longer runway");
  });

  it("renders 'faster than X% of bench' when judge percentile <= 40", () => {
    const r: JudgeDispositionResult = {
      judge: { ...judgeBase, medianDays: 80 },
      district: districtBase,
      judgePercentileInDistrict: 25,
      judgeMedianRatio: 0.5,
    };
    const line = renderDispositionLine(r);
    expect(line).toContain("faster than 75% of the bench");
    expect(line).toContain("Filings move quickly");
  });

  it("renders 'near district median' when judge percentile in 41-59", () => {
    const r: JudgeDispositionResult = {
      judge: { ...judgeBase, medianDays: 150 },
      district: districtBase,
      judgePercentileInDistrict: 50,
      judgeMedianRatio: 1.0,
    };
    const line = renderDispositionLine(r);
    expect(line).toContain("near the district median");
    expect(line).toContain("Pace is typical");
  });

  it("falls back to judge-only line when district unavailable", () => {
    const r: JudgeDispositionResult = {
      judge: judgeBase,
      district: null,
      judgePercentileInDistrict: null,
      judgeMedianRatio: null,
    };
    const line = renderDispositionLine(r);
    expect(line).toContain("median over 80 cases");
    expect(line).not.toContain("bench");
  });

  it("uses years label when median >= 12 months", () => {
    const r: JudgeDispositionResult = {
      judge: { ...judgeBase, medianDays: 730 }, // 2 years
      district: { ...districtBase, medianDays: 730 },
      judgePercentileInDistrict: 50,
      judgeMedianRatio: 1.0,
    };
    const line = renderDispositionLine(r);
    expect(line).toContain("2.0 years");
  });

  it("uses month label when median < 12 months", () => {
    const r: JudgeDispositionResult = {
      judge: { ...judgeBase, medianDays: 90 },
      district: { ...districtBase, medianDays: 90 },
      judgePercentileInDistrict: 50,
      judgeMedianRatio: 1.0,
    };
    const line = renderDispositionLine(r);
    expect(line).toContain("~3 months");
  });

  it("never includes advice verbs (UPL-safe Mercer voice check)", () => {
    const r: JudgeDispositionResult = {
      judge: { ...judgeBase, medianDays: 300 },
      district: districtBase,
      judgePercentileInDistrict: 75,
      judgeMedianRatio: 2.0,
    };
    const line = renderDispositionLine(r) ?? "";
    // Banned advice verbs from no-hallucinated-legal-data + brand-voice rules
    expect(line.toLowerCase()).not.toMatch(/\byou should\b/);
    expect(line.toLowerCase()).not.toMatch(/\bfile a\b/);
    expect(line.toLowerCase()).not.toMatch(/\btake the\b/);
    expect(line.toLowerCase()).not.toMatch(/\bhire\b/);
  });
});

// ─────────────────────────────────────────────────────────────────
// IB research block builder tests
// ─────────────────────────────────────────────────────────────────

describe("buildJudgeDispositionResearchBlock", () => {
  const judgeBase = {
    authorId: 12345,
    caseClass: "criminal" as const,
    sampleN: 80,
    p25Days: 90,
    medianDays: 180,
    p75Days: 360,
    primaryCourtId: "flsd",
    dataAsOf: "2026-05-03T00:00:00Z",
  };

  it("returns empty string when result is null", () => {
    expect(buildJudgeDispositionResearchBlock(null)).toBe("");
  });

  it("emits XML-like tags so the prompt parser can quote without paraphrasing", () => {
    const r: JudgeDispositionResult = {
      judge: judgeBase,
      district: null,
      judgePercentileInDistrict: null,
      judgeMedianRatio: null,
    };
    const block = buildJudgeDispositionResearchBlock(r);
    expect(block).toMatch(/^<judge_disposition_data>/);
    expect(block).toMatch(/<\/judge_disposition_data>$/);
    expect(block).toMatch(/judge_median_days: 180/);
    expect(block).toMatch(/judge_sample_n: 80/);
  });

  it("includes district baselines + percentile + ratio when present", () => {
    const r: JudgeDispositionResult = {
      judge: judgeBase,
      district: {
        courtId: "flsd",
        caseClass: "criminal",
        sampleN: 5000,
        p10Days: 60,
        p25Days: 100,
        medianDays: 150,
        p75Days: 250,
        p90Days: 400,
        dataAsOf: "2026-05-03T00:00:00Z",
      },
      judgePercentileInDistrict: 73,
      judgeMedianRatio: 1.4,
    };
    const block = buildJudgeDispositionResearchBlock(r);
    expect(block).toMatch(/district_median_days: 150/);
    expect(block).toMatch(/judge_percentile_in_district: 73/);
    expect(block).toMatch(/judge_median_ratio_vs_district: 1\.4/);
    expect(block).toMatch(/headline_line: /);
  });

  it("cites the source so downstream prompts know it is verified data not a hallucination", () => {
    const r: JudgeDispositionResult = {
      judge: judgeBase,
      district: null,
      judgePercentileInDistrict: null,
      judgeMedianRatio: null,
    };
    const block = buildJudgeDispositionResearchBlock(r);
    expect(block).toMatch(/source: cl_dockets/);
    expect(block).toMatch(/TICKET-2/);
  });
});

// ─────────────────────────────────────────────────────────────────
// Coverage gate tests (DB-mocked)
// ─────────────────────────────────────────────────────────────────

describe("getJudgeDispositionStats coverage gate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("exposes JUDGE_COVERAGE_FLOOR = 30 (Mercer-voice rule)", () => {
    expect(JUDGE_COVERAGE_FLOOR).toBe(30);
  });

  it("returns null when sample_n below coverage floor", async () => {
    const judgeRow = {
      author_id: 12345,
      case_class: "criminal",
      sample_n: 12, // below floor
      p25_days: 90,
      median_days: 180,
      p75_days: 360,
      primary_court_id: "flsd",
      data_as_of: "2026-05-03T00:00:00Z",
    };
    createAdminClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue(mockChain([judgeRow])),
    });
    const { getJudgeDispositionStats } = await import("../disposition-stats");
    const r = await getJudgeDispositionStats(12345, "criminal");
    expect(r).toBeNull();
  });

  it("returns null when judge has no row", async () => {
    createAdminClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue(mockChain([])),
    });
    const { getJudgeDispositionStats } = await import("../disposition-stats");
    const r = await getJudgeDispositionStats(99999, "criminal");
    expect(r).toBeNull();
  });

  it("returns null when DB error (graceful degradation, no throw)", async () => {
    createAdminClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue(mockChain(null, { message: "boom" })),
    });
    const { getJudgeDispositionStats } = await import("../disposition-stats");
    const r = await getJudgeDispositionStats(12345, "criminal");
    expect(r).toBeNull();
  });

  it("returns full result when sample_n >= floor + district found", async () => {
    const judgeRow = {
      author_id: 12345,
      case_class: "criminal",
      sample_n: 80,
      p25_days: 90,
      median_days: 180,
      p75_days: 360,
      primary_court_id: "flsd",
      data_as_of: "2026-05-03T00:00:00Z",
    };
    const distRow = {
      court_id: "flsd",
      case_class: "criminal",
      sample_n: 5000,
      p10_days: 60,
      p25_days: 100,
      median_days: 150,
      p75_days: 250,
      p90_days: 400,
      data_as_of: "2026-05-03T00:00:00Z",
    };
    let call = 0;
    createAdminClientMock.mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        call += 1;
        return mockChain(call === 1 ? [judgeRow] : [distRow]);
      }),
    });
    const { getJudgeDispositionStats } = await import("../disposition-stats");
    const r = await getJudgeDispositionStats(12345, "criminal");
    expect(r).not.toBeNull();
    expect(r?.judge.sampleN).toBe(80);
    expect(r?.district?.medianDays).toBe(150);
    expect(r?.judgeMedianRatio).toBeCloseTo(1.2, 1);
    expect(r?.judgePercentileInDistrict).toBeGreaterThanOrEqual(50);
  });
});
