/**
 * Unit tests for Appendix G — Motion Strategy (IB $997 E1).
 *
 * Focus areas:
 *   1. UPL banned-phrase blocklist
 *   2. Tier monotonicity (IB strictly exceeds M1 $197)
 *   3. Quote coverage + fallback (every row has URL; quote optional)
 *   4. Render emits CourtListener URLs for every citation
 *   5. Insufficient-sample judge rows surface with caveat (M1 suppresses)
 */
import { describe, it, expect } from "vitest";
import {
  renderMotionStrategy,
  IB_MOTION_TOP_N,
  IB_CITATION_TOP_N,
  IB_JUDGE_INSUFFICIENT_THRESHOLD,
  type MotionStrategyData,
  type MotionRateRow,
  type JudgeMotionRow,
  type MotionCitationRow,
} from "../motion-strategy";
import { UPL_BANNED_PHRASES } from "@/lib/charge-slug-maps";

// ------------------------------------------------------------
// Test fixtures
// ------------------------------------------------------------

function mkMotion(over: Partial<MotionRateRow> = {}): MotionRateRow {
  return {
    motion_type: "motion_to_suppress",
    filed_count: 42,
    granted_count: 14,
    denied_count: 28,
    grant_rate: 0.333,
    baseline_grant_rate: 0.25,
    deviation_from_baseline: 0.083,
    data_scope: "charge_national",
    ...over,
  };
}

function mkJudge(over: Partial<JudgeMotionRow> = {}): JudgeMotionRow {
  return {
    motion_type: "motion_to_dismiss",
    filed_count: 5,
    granted_count: 2,
    grant_rate: 0.4,
    baseline_grant_rate: 0.3,
    deviation_from_baseline: 0.1,
    insufficient_sample: true,
    ...over,
  };
}

function mkCitation(over: Partial<MotionCitationRow> = {}): MotionCitationRow {
  return {
    rank: 1,
    case_name: "Katz v. United States",
    date_filed: "1967-12-18",
    citation: "389 U.S. 347",
    authority_tier: "landmark",
    citation_count_in_charge: 200,
    citation_count_total: 2500,
    quote_sentence:
      "The Fourth Amendment protects people, not places. What a person knowingly exposes to the public is not a subject of Fourth Amendment protection.",
    quote_frequency: 12,
    source_url: "https://www.courtlistener.com/opinion/107564/katz-v-united-states/",
    data_scope: "charge_type",
    ...over,
  };
}

function mkData(over: Partial<MotionStrategyData> = {}): MotionStrategyData {
  return {
    chargeType: "drug-possession",
    circuit: "9",
    circuitName: "Ninth Circuit",
    judgeDisplayName: "Jane Doe",
    judgeResolved: true,
    ambiguousJudge: false,
    motions: [mkMotion()],
    judgeMotions: [mkJudge()],
    citations: [mkCitation()],
    limitations: [],
    isEmpty: false,
    ...over,
  };
}

// ------------------------------------------------------------
// UPL banned phrases
// ------------------------------------------------------------

describe("Appendix G — Motion Strategy · UPL blocklist", () => {
  it("never emits banned UPL phrases on fully populated render", () => {
    const data = mkData({
      motions: Array.from({ length: IB_MOTION_TOP_N }, (_, i) =>
        mkMotion({ motion_type: `motion_type_${i}`, filed_count: 100 - i }),
      ),
      judgeMotions: [
        mkJudge({ filed_count: 3, insufficient_sample: true }),
        mkJudge({ motion_type: "motion_to_exclude", filed_count: 45, insufficient_sample: false }),
      ],
      citations: Array.from({ length: IB_CITATION_TOP_N }, (_, i) =>
        mkCitation({ rank: i + 1, case_name: `Case ${i}` }),
      ),
      limitations: [
        "No circuit-specific motion baseline for Ninth Circuit; vs circuit column omitted.",
      ],
    });
    const md = renderMotionStrategy(data);
    const lower = md.toLowerCase();
    for (const phrase of UPL_BANNED_PHRASES) {
      expect(
        lower.includes(phrase),
        `rendered markdown must not contain banned phrase "${phrase}"`,
      ).toBe(false);
    }
  });

  it("emits the methodology legal-INFORMATION gate on every non-empty render", () => {
    const md = renderMotionStrategy(mkData());
    expect(md).toContain("legal INFORMATION");
    expect(md).toContain("not legal ADVICE");
    // Methodology must disclaim prediction (any equivalent phrasing)
    expect(md).toMatch(/not a prediction|is a prediction\./i);
  });
});

// ------------------------------------------------------------
// Tier monotonicity (HARD)
// ------------------------------------------------------------

describe("Appendix G — Motion Strategy · tier monotonicity guardrails", () => {
  it("IB top-N motions threshold strictly exceeds M1 top 10", () => {
    // M1 ($197) caps at 10. IB ($997) must go deeper.
    expect(IB_MOTION_TOP_N).toBeGreaterThan(10);
    expect(IB_MOTION_TOP_N).toBe(20);
  });

  it("IB citation row count is at least M1's 10 (and carries quote)", () => {
    expect(IB_CITATION_TOP_N).toBeGreaterThanOrEqual(10);
  });

  it("IB judge-insufficient threshold is identical to M1's MIN_N (but IB surfaces instead of suppresses)", () => {
    expect(IB_JUDGE_INSUFFICIENT_THRESHOLD).toBe(10);
  });

  it("each citation can carry an extracted quote (monotonicity depth over M1 'citation-only')", () => {
    const data = mkData({
      citations: [
        mkCitation({
          rank: 1,
          quote_sentence: "The defendant has a right to confront witnesses.",
          quote_frequency: 8,
        }),
      ],
    });
    const md = renderMotionStrategy(data);
    // Quote must appear in markdown output
    expect(md).toContain("The defendant has a right to confront witnesses");
  });

  it("IB renders judge rows with n < 10 (M1 suppresses; IB surfaces with caveat)", () => {
    const data = mkData({
      judgeMotions: [mkJudge({ filed_count: 3, insufficient_sample: true })],
    });
    const md = renderMotionStrategy(data);
    expect(md).toMatch(/insufficient/i);
    expect(md).toContain("n=3");
  });
});

// ------------------------------------------------------------
// Quote coverage + URL fallback
// ------------------------------------------------------------

describe("Appendix G — Motion Strategy · URL + quote coverage", () => {
  it("every citation row includes its CourtListener URL in the markdown", () => {
    const data = mkData({
      citations: [
        mkCitation({
          rank: 1,
          case_name: "Terry v. Ohio",
          source_url: "https://www.courtlistener.com/opinion/107729/terry-v-ohio/",
        }),
        mkCitation({
          rank: 2,
          case_name: "Mapp v. Ohio",
          source_url: "https://www.courtlistener.com/opinion/106285/mapp-v-ohio/",
          quote_sentence: null,
          quote_frequency: null,
        }),
      ],
    });
    const md = renderMotionStrategy(data);
    expect(md).toContain("https://www.courtlistener.com/opinion/107729/terry-v-ohio/");
    expect(md).toContain("https://www.courtlistener.com/opinion/106285/mapp-v-ohio/");
  });

  it("falls back gracefully when a citation has no cached quote", () => {
    const data = mkData({
      citations: [mkCitation({ quote_sentence: null, quote_frequency: null })],
    });
    const md = renderMotionStrategy(data);
    expect(md).toContain("No canonical quote cached");
  });
});

// ------------------------------------------------------------
// Empty + limitation paths
// ------------------------------------------------------------

describe("Appendix G — Motion Strategy · empty + limitation paths", () => {
  it("empty data renders empty string (edge-function skips the appendix)", () => {
    const empty: MotionStrategyData = {
      chargeType: "other",
      circuit: null,
      circuitName: null,
      judgeDisplayName: null,
      judgeResolved: false,
      ambiguousJudge: false,
      motions: [],
      judgeMotions: [],
      citations: [],
      limitations: [],
      isEmpty: true,
    };
    expect(renderMotionStrategy(empty)).toBe("");
  });

  it("limitations surface in a Known limitations section when non-empty", () => {
    const md = renderMotionStrategy(
      mkData({
        limitations: ["No charge-specific motion data cached for \"arson\"."],
      }),
    );
    expect(md).toContain("Known limitations");
    expect(md).toContain("No charge-specific motion data cached");
  });
});

// ------------------------------------------------------------
// Cross-reference note (task spec)
// ------------------------------------------------------------

describe("Appendix G — Motion Strategy · cross-reference", () => {
  it("includes the War Room cross-ref note", () => {
    const md = renderMotionStrategy(mkData());
    expect(md).toContain("War Room");
    expect(md).toContain("Similar Cases");
  });

  it("appendix heading is Appendix G (not F)", () => {
    const md = renderMotionStrategy(mkData());
    expect(md).toContain("## Appendix G: Motion Strategy");
    // Must not emit Appendix F heading — that's the rising-precedents appendix.
    expect(md).not.toContain("## Appendix F");
  });
});
