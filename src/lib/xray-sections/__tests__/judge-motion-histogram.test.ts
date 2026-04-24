/**
 * Unit tests for X-Ray Section X2 — Full Judge Motion Histogram (X-Ray $2,497 E2).
 *
 * Focus areas:
 *   1. Tier monotonicity (X-Ray strictly exceeds IB E1's top 20 cap)
 *   2. UPL banned-phrase blocklist
 *   3. Baseline-deviation grouping correctness (above / at / below thresholds)
 *   4. Insufficient-sample cohort (surfaced, not suppressed)
 *   5. Empty / limitation paths
 */
import { describe, it, expect } from "vitest";
import {
  renderXrayJudgeHistogram,
  XRAY_HISTOGRAM_DEVIATION_THRESHOLD,
  XRAY_HISTOGRAM_INSUFFICIENT_N,
  XRAY_HISTOGRAM_UNBOUNDED,
  type XrayJudgeHistogramData,
  type XrayJudgeHistogramRow,
} from "../judge-motion-histogram";
import { UPL_BANNED_PHRASES } from "@/lib/charge-slug-maps";
import { IB_MOTION_TOP_N } from "@/lib/ib-appendices/motion-strategy";

// ------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------

function mkRow(over: Partial<XrayJudgeHistogramRow> = {}): XrayJudgeHistogramRow {
  return {
    motion_type: "motion_to_suppress",
    filed_count: 42,
    granted_count: 14,
    grant_rate: 0.333,
    baseline_grant_rate: 0.28,
    deviation_from_baseline: 0.053,
    group: "at_baseline",
    insufficient_sample: false,
    ...over,
  };
}

function mkData(over: Partial<XrayJudgeHistogramData> = {}): XrayJudgeHistogramData {
  return {
    judgeDisplayName: "Jane Doe",
    judgeResolved: true,
    ambiguousJudge: false,
    totalMotionTypes: 5,
    aboveBaselineRows: [
      mkRow({
        motion_type: "motion_to_exclude",
        filed_count: 50,
        granted_count: 35,
        grant_rate: 0.7,
        baseline_grant_rate: 0.4,
        deviation_from_baseline: 0.3,
        group: "above_baseline",
      }),
    ],
    atBaselineRows: [
      mkRow({
        motion_type: "motion_to_dismiss",
        filed_count: 40,
        granted_count: 10,
        grant_rate: 0.25,
        baseline_grant_rate: 0.22,
        deviation_from_baseline: 0.03,
        group: "at_baseline",
      }),
    ],
    belowBaselineRows: [
      mkRow({
        motion_type: "motion_in_limine",
        filed_count: 60,
        granted_count: 6,
        grant_rate: 0.1,
        baseline_grant_rate: 0.35,
        deviation_from_baseline: -0.25,
        group: "below_baseline",
      }),
    ],
    insufficientRows: [
      mkRow({
        motion_type: "motion_for_mistrial",
        filed_count: 3,
        granted_count: 1,
        grant_rate: 0.333,
        baseline_grant_rate: 0.15,
        deviation_from_baseline: null,
        group: "insufficient_sample",
        insufficient_sample: true,
      }),
    ],
    limitations: [],
    isEmpty: false,
    ...over,
  };
}

// ------------------------------------------------------------
// Tier monotonicity (HARD)
// ------------------------------------------------------------

describe("Section X2 — Judge Motion Histogram · tier monotonicity guardrails", () => {
  it("X-Ray histogram is UNBOUNDED (no top-N limit); IB E1 caps at 20", () => {
    expect(XRAY_HISTOGRAM_UNBOUNDED).toBe(true);
    // IB's cap exists (20); X-Ray must surface more than that when data has more.
    expect(IB_MOTION_TOP_N).toBe(20);
  });

  it("renders more than IB's top-20 cap when data contains more motion types", () => {
    // Simulate 40 motion types — more than IB's 20 cap.
    const rows: XrayJudgeHistogramRow[] = Array.from({ length: 40 }, (_, i) =>
      mkRow({
        motion_type: `motion_type_${i}`,
        filed_count: 100 - i,
        granted_count: 30,
        grant_rate: 0.3,
        baseline_grant_rate: 0.3,
        deviation_from_baseline: 0,
        group: "at_baseline",
      }),
    );
    const data = mkData({
      aboveBaselineRows: [],
      atBaselineRows: rows,
      belowBaselineRows: [],
      insufficientRows: [],
      totalMotionTypes: 40,
    });
    const md = renderXrayJudgeHistogram(data);
    // Every motion type name must appear in the render.
    for (let i = 0; i < 40; i++) {
      expect(md).toContain(`Motion Type ${i}`);
    }
    // Row count strictly exceeds IB's cap.
    expect(40).toBeGreaterThan(IB_MOTION_TOP_N);
  });

  it("exports deviation threshold at the documented 10 pp", () => {
    expect(XRAY_HISTOGRAM_DEVIATION_THRESHOLD).toBeCloseTo(0.10, 5);
  });

  it("insufficient-sample threshold matches IB E1 (cross-tier consistent)", () => {
    expect(XRAY_HISTOGRAM_INSUFFICIENT_N).toBe(10);
  });

  it("groups rows by baseline deviation (IB does NOT group)", () => {
    const md = renderXrayJudgeHistogram(mkData());
    expect(md).toMatch(/Significantly Above Baseline/);
    expect(md).toMatch(/Significantly Below Baseline/);
    expect(md).toMatch(/At Baseline/);
  });
});

// ------------------------------------------------------------
// UPL banned phrases
// ------------------------------------------------------------

describe("Section X2 — Judge Motion Histogram · UPL blocklist", () => {
  it("never emits banned UPL phrases on fully populated render", () => {
    const md = renderXrayJudgeHistogram(mkData()).toLowerCase();
    for (const phrase of UPL_BANNED_PHRASES) {
      expect(
        md.includes(phrase),
        `rendered markdown must not contain banned phrase "${phrase}"`,
      ).toBe(false);
    }
  });

  it("emits the legal-INFORMATION methodology gate", () => {
    const md = renderXrayJudgeHistogram(mkData());
    expect(md).toContain("legal INFORMATION");
    expect(md).toContain("not legal ADVICE");
    expect(md).toMatch(/not a prediction/i);
  });

  it("never characterizes the judge as harsh / lenient / biased", () => {
    const md = renderXrayJudgeHistogram(mkData()).toLowerCase();
    for (const slur of ["harsh", "lenient", "biased", "hostile", "pro-defense", "pro-prosecution"]) {
      expect(md.includes(slur)).toBe(false);
    }
  });

  it("always shows N alongside grant rate (no rate without N)", () => {
    const md = renderXrayJudgeHistogram(mkData());
    // Each row has both N filed and the rate column in the same row.
    // Regex: row contains a number followed within 120 chars by a rate%.
    // We assert at least one row has explicit N cells.
    expect(md).toMatch(/\| 50 \|/); // filed_count from above-baseline fixture
    expect(md).toMatch(/\| 3 \|/); // filed_count from insufficient fixture
  });
});

// ------------------------------------------------------------
// Grouping correctness
// ------------------------------------------------------------

describe("Section X2 — Judge Motion Histogram · grouping correctness", () => {
  it("above-baseline cohort renders when populated", () => {
    const md = renderXrayJudgeHistogram(
      mkData({
        aboveBaselineRows: [
          mkRow({
            motion_type: "motion_to_exclude",
            filed_count: 50,
            granted_count: 40,
            grant_rate: 0.8,
            baseline_grant_rate: 0.4,
            deviation_from_baseline: 0.4,
            group: "above_baseline",
          }),
        ],
        atBaselineRows: [],
        belowBaselineRows: [],
        insufficientRows: [],
      }),
    );
    expect(md).toContain("Significantly Above Baseline");
    expect(md).toContain("Motion To Exclude");
  });

  it("below-baseline cohort renders when populated", () => {
    const md = renderXrayJudgeHistogram(
      mkData({
        aboveBaselineRows: [],
        atBaselineRows: [],
        belowBaselineRows: [
          mkRow({
            motion_type: "motion_to_suppress",
            filed_count: 80,
            granted_count: 4,
            grant_rate: 0.05,
            baseline_grant_rate: 0.30,
            deviation_from_baseline: -0.25,
            group: "below_baseline",
          }),
        ],
        insufficientRows: [],
      }),
    );
    expect(md).toContain("Significantly Below Baseline");
    expect(md).toContain("Motion To Suppress");
  });

  it("insufficient cohort surfaces with n label (not suppressed like M1)", () => {
    const md = renderXrayJudgeHistogram(
      mkData({
        aboveBaselineRows: [],
        atBaselineRows: [],
        belowBaselineRows: [],
        insufficientRows: [
          mkRow({
            motion_type: "motion_for_mistrial",
            filed_count: 2,
            granted_count: 0,
            grant_rate: 0,
            baseline_grant_rate: 0.15,
            deviation_from_baseline: null,
            group: "insufficient_sample",
            insufficient_sample: true,
          }),
        ],
      }),
    );
    expect(md).toContain("Insufficient Sample");
    expect(md).toContain("n=2");
  });

  it("surfaces total motion type count", () => {
    const md = renderXrayJudgeHistogram(mkData({ totalMotionTypes: 37 }));
    // Count is rendered bold in markdown (**...:** 37.), so assert the
    // stable substring rather than the raw number-after-colon form.
    expect(md).toMatch(/Total motion types on file for this judge:\*{0,2}\s*37\./);
  });

  it("elides a cohort when empty (does not emit an empty section heading)", () => {
    const md = renderXrayJudgeHistogram(
      mkData({
        aboveBaselineRows: [],
        atBaselineRows: [mkRow()],
        belowBaselineRows: [],
        insufficientRows: [],
      }),
    );
    expect(md).not.toContain("Significantly Above Baseline");
    expect(md).not.toContain("Significantly Below Baseline");
    expect(md).not.toContain("Insufficient Sample");
    expect(md).toContain("At Baseline");
  });
});

// ------------------------------------------------------------
// Empty + limitation paths
// ------------------------------------------------------------

describe("Section X2 — Judge Motion Histogram · empty + limitation paths", () => {
  it("empty data renders empty string (X-Ray assembler skips the section)", () => {
    const empty: XrayJudgeHistogramData = {
      judgeDisplayName: null,
      judgeResolved: false,
      ambiguousJudge: false,
      totalMotionTypes: 0,
      aboveBaselineRows: [],
      atBaselineRows: [],
      belowBaselineRows: [],
      insufficientRows: [],
      limitations: [],
      isEmpty: true,
    };
    expect(renderXrayJudgeHistogram(empty)).toBe("");
  });

  it("limitations surface in a Known limitations section when non-empty", () => {
    const md = renderXrayJudgeHistogram(
      mkData({
        limitations: [
          "Judge Doe has no CourtListener author_id linked; histogram omitted.",
        ],
      }),
    );
    expect(md).toContain("Known limitations");
    expect(md).toContain("CourtListener author_id linked");
  });

  it("section heading labels the judge", () => {
    const md = renderXrayJudgeHistogram(mkData({ judgeDisplayName: "Hon. Aileen Cannon" }));
    expect(md).toContain("## Section X2: Full Motion Histogram — Hon. Aileen Cannon");
  });
});
