/**
 * Unit tests for courthouse-intelligence render layer.
 *
 * Focus:
 *   1. UPL guardrails — banned prediction/scoring language NEVER in output.
 *   2. Apex gate line ("This is not a prediction") appears verbatim.
 *   3. Tier monotonicity — aggregate-only rendering; no judge-specific
 *      fingerprint tables in this product; suppressed prosecutor section
 *      emits the deliberate "not yet indexed" note rather than fabricating.
 *   4. Circuit motion rates use the charge_type='(all)' appellate baseline
 *      (tested via content shape, not data fetch).
 *   5. Empty-state renders cleanly with limitations block.
 */
import { describe, it, expect } from "vitest";
import {
  renderCourthouseIntelligence,
  type CourthouseIntelligenceData,
} from "../courthouse-intelligence";

// Product-copy guardrails pulled from apex verdict REPRICE-THEN-SHIP
// (docs/handoff/2026-04-23-judge-fingerprint-v3-safety-pass.md). Same set
// the Judge Report Card ships under.
const BANNED_WORDS = [
  "grade",
  "report card",
  "rating",
  "predicts",
  "underperforms",
  "suggests your case",
  "elevated risk",
];

const GATE_LINE = "This is not a prediction";

function mkData(
  over: Partial<CourthouseIntelligenceData> = {},
): CourthouseIntelligenceData {
  return {
    stateCode: "TX",
    courthouseFilter: null,
    matchedDistricts: [
      {
        cl_court_id: "txsd",
        district_code: "41",
        district_name: "Southern District of Texas",
        short_name: "S.D. Tex.",
        circuit: "5th",
      },
    ],
    judges: [
      {
        judge_name: "Jane Doe",
        district_id: "txsd",
        n_cases: 302,
        has_full_fingerprint: false,
      },
      {
        judge_name: "John Roe",
        district_id: "txsd",
        n_cases: 171,
        has_full_fingerprint: false,
      },
    ],
    circuit: "5",
    circuitMotionRates: [
      {
        motion_type: "discovery_motion",
        filed_count: 1190,
        granted_count: 569,
        denied_count: 275,
        grant_rate: 0.6742,
        baseline_grant_rate: 0.592,
        deviation_from_baseline: 0.0822,
      },
    ],
    usscAggregates: [
      {
        district_code: "41",
        district_name: "Southern District of Texas",
        short_name: "S.D. Tex.",
        circuit: "5th",
        n_cases: 1203,
        median_months: 36.0,
        mean_months: 48.7,
        pct_got_prison: 87.5,
        pct_downward_departure: 14.3,
        earliest_fy: 14,
        latest_fy: 23,
      },
    ],
    prosecutorsAvailable: false,
    limitations: [
      "Most-assigned-prosecutors section suppressed: attorney role data not yet indexed in the court-records corpus.",
    ],
    isEmpty: false,
    ...over,
  };
}

function assertNoBannedWords(html: string) {
  const lower = html.toLowerCase();
  for (const word of BANNED_WORDS) {
    expect(
      lower.includes(word.toLowerCase()),
      `rendered HTML must not contain banned word "${word}"`,
    ).toBe(false);
  }
}

describe("Courthouse Intelligence — UPL + apex guardrails", () => {
  it("emits the required gate line on every render", () => {
    const html = renderCourthouseIntelligence(mkData());
    expect(html).toContain(GATE_LINE);
  });

  it("never emits banned prediction/scoring language (populated)", () => {
    const html = renderCourthouseIntelligence(mkData());
    assertNoBannedWords(html);
  });

  it("never emits banned language on empty-data render", () => {
    const html = renderCourthouseIntelligence(
      mkData({
        judges: [],
        circuitMotionRates: [],
        usscAggregates: [],
        matchedDistricts: [],
        isEmpty: true,
        limitations: [
          "No federal district courts indexed for that state.",
        ],
      }),
    );
    assertNoBannedWords(html);
    expect(html).toContain(GATE_LINE);
  });

  it("includes the 'Legal Information, Not Legal Advice' UPL disclaimer", () => {
    const html = renderCourthouseIntelligence(mkData());
    expect(html).toContain("Legal Information, Not Legal Advice");
    expect(html).toContain("legal INFORMATION, not legal ADVICE");
  });
});

describe("Courthouse Intelligence — tier monotonicity", () => {
  it("does not include judge-specific motion histograms (Judge Report Card $197 territory)", () => {
    // We only render judge rows with name + n_cases + district_id. Any
    // "motion_type × grant_rate" rendered alongside a judge's NAME would
    // be out-of-scope.
    const html = renderCourthouseIntelligence(mkData());
    // Judge rows are in one table; motion rates are a separate table.
    // Naive proof: judge name "Jane Doe" should not appear in the same
    // table row as a motion type string.
    const judgeRowIdx = html.indexOf("Jane Doe");
    const motionTypeIdx = html.indexOf("discovery_motion");
    expect(judgeRowIdx).toBeGreaterThan(-1);
    expect(motionTypeIdx).toBeGreaterThan(-1);
    // They must be separated by a </table> closing tag.
    const between = html.slice(
      Math.min(judgeRowIdx, motionTypeIdx),
      Math.max(judgeRowIdx, motionTypeIdx),
    );
    expect(between).toContain("</table>");
  });

  it("cross-references the upsell to Judge Question Brief, not Judge Report Card ($197)", () => {
    // Apex rename: "Judge Report Card" → "Judge Question Brief".
    const html = renderCourthouseIntelligence(mkData());
    expect(html.toLowerCase()).toContain("judge question brief");
  });

  it("emits the deliberate prosecutor-suppressed note rather than fabricating data", () => {
    const html = renderCourthouseIntelligence(mkData());
    expect(html).toContain("Most-assigned prosecutors");
    expect(html).toContain("deliberately withheld");
  });
});

describe("Courthouse Intelligence — circuit motion rate framing", () => {
  it("labels circuit motion rates as appellate direction, not trial-court grant rates", () => {
    const html = renderCourthouseIntelligence(mkData());
    expect(html.toLowerCase()).toContain("appellate-direction");
    expect(html.toLowerCase()).toContain("not trial-court grant rates");
  });

  it("renders deviation column with signed percentage points", () => {
    const html = renderCourthouseIntelligence(mkData());
    expect(html).toContain("+8.2pp");
  });
});

describe("Courthouse Intelligence — empty + limitation surfaces", () => {
  it("renders cleanly when matchedDistricts is empty and surfaces a limitation", () => {
    const html = renderCourthouseIntelligence(
      mkData({
        matchedDistricts: [],
        judges: [],
        circuitMotionRates: [],
        usscAggregates: [],
        circuit: null,
        isEmpty: true,
        limitations: ["No federal district courts indexed for Foo."],
      }),
    );
    expect(html).toContain("No federal district courts indexed for Foo.");
    expect(html).toContain(GATE_LINE);
  });

  it("surfaces every limitation line in the methodology section", () => {
    const html = renderCourthouseIntelligence(
      mkData({
        limitations: ["Limitation A.", "Limitation B.", "Limitation C."],
      }),
    );
    expect(html).toContain("Limitation A.");
    expect(html).toContain("Limitation B.");
    expect(html).toContain("Limitation C.");
  });
});

describe("Courthouse Intelligence — aggregate framing", () => {
  it("describes the judge section as caseload aggregate with case counts only", () => {
    const html = renderCourthouseIntelligence(mkData());
    expect(html).toContain("Caseload Aggregate");
    expect(html).toContain("Case counts only");
  });

  it("renders USSC aggregates with FY range", () => {
    const html = renderCourthouseIntelligence(mkData());
    expect(html).toContain("FY14-23");
  });
});
