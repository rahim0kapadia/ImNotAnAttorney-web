/**
 * Unit tests for sentencing-fingerprint render layer.
 *
 * Focus: apex product-copy guardrails (REPRICE-THEN-SHIP verdict).
 * The render MUST NEVER emit banned prediction/scoring language.
 * The gate line MUST appear verbatim on every rendered block.
 */
import { describe, it, expect } from "vitest";
import {
  renderSentencingFingerprintSection,
  type SentencingFingerprintData,
  type SentencingFingerprintInput,
} from "../sentencing-fingerprint";

const BASE_INPUT: SentencingFingerprintInput = {
  judgeName: "Jane Doe",
  chargeType: "drug-possession",
};

const BANNED_WORDS = [
  "grade",
  "score",
  "report card",
  "rating",
  "predicts",
  "underperforms",
  "suggests your case",
  "elevated risk",
];

const GATE_LINE = "This is not a prediction";

function mkData(over: Partial<SentencingFingerprintData> = {}): SentencingFingerprintData {
  return {
    judgeCanonicalId: "f7bcb00-d135-4a40-bfc0-c7d1fdb8cf88",
    judgeDisplayName: "Jane Doe",
    authorId: "71",
    signal1_topAuthorities: [],
    signal2_motionOutcomes: [],
    signal3_dispositionProfile: null,
    signal4_reversalRate: null,
    signal5_dispositionTime: null,
    limitations: [],
    isEmpty: false,
    ...over,
  };
}

function assertNoBannedWords(html: string) {
  const lower = html.toLowerCase();
  for (const word of BANNED_WORDS) {
    expect(
      lower.includes(word),
      `rendered HTML must not contain banned word "${word}"`,
    ).toBe(false);
  }
}

describe("Sentencing Fingerprint — apex product-copy guardrails", () => {
  it("emits the required gate line on every render", () => {
    const html = renderSentencingFingerprintSection(mkData(), BASE_INPUT);
    expect(html).toContain(GATE_LINE);
  });

  it("never emits banned prediction / scoring words even with all signals populated", () => {
    const data = mkData({
      signal1_topAuthorities: [
        {
          rank: 1,
          case_name: "United States v. Sample",
          date_filed: "2021-01-01",
          citation_count_in_charge: 10,
          citation_count_total: 100,
          authority_tier_overall: "landmark",
          source_url: "https://example.com/opinion",
        },
      ],
      signal2_motionOutcomes: [
        {
          motion_type: "dismiss_motion",
          filed_count: 18,
          granted_count: 12,
          denied_count: 4,
          grant_rate: 0.75,
          baseline_grant_rate: 0.62,
          deviation_from_baseline: 0.13,
        },
      ],
      signal3_dispositionProfile: {
        judge_name: "Jane Doe",
        district_id: "nysd",
        n_cases: 123,
        disposition_data_available: false,
        baseline_source: null,
      },
      signal4_reversalRate: {
        judge_name: "Jane Doe",
        n_total_authored: 150,
        n_appealable_opinions: 30,
        n_reversed: 3,
        n_vacated: 2,
        reversal_rate_conditional: 0.1667,
        true_reversal_rate: 0.0333,
        review_coverage_rate: 0.2,
        baseline_rate: 0.0975,
        deviation_from_baseline: 0.0692,
        baseline_source: "federal appellate citation graph, jackknife baseline (excludes current judge) 2026-04-23",
      },
    });
    const html = renderSentencingFingerprintSection(data, BASE_INPUT);
    assertNoBannedWords(html);
  });

  it("renders both conditional AND true reversal rates when Signal 4 present (apex: never show one alone)", () => {
    const data = mkData({
      signal4_reversalRate: {
        judge_name: "Jane Doe",
        n_total_authored: 150,
        n_appealable_opinions: 30,
        n_reversed: 3,
        n_vacated: 2,
        reversal_rate_conditional: 0.1667,
        true_reversal_rate: 0.0333,
        review_coverage_rate: 0.2,
        baseline_rate: 0.0975,
        deviation_from_baseline: 0.0692,
        baseline_source: null,
      },
    });
    const html = renderSentencingFingerprintSection(data, BASE_INPUT);
    expect(html).toMatch(/Conditional reversal rate/i);
    expect(html).toMatch(/True reversal rate/i);
  });

  it("hides disposition rates when disposition_data_available = false (prevents 0% misread)", () => {
    const data = mkData({
      signal3_dispositionProfile: {
        judge_name: "Jane Doe",
        district_id: "nysd",
        n_cases: 123,
        disposition_data_available: false,
        baseline_source: null,
      },
    });
    const html = renderSentencingFingerprintSection(data, BASE_INPUT);
    // The caveat MAY mention "plea rate"/"conviction rate" to explain what is
    // intentionally withheld.  What must never render is an actual numeric
    // rate value (NN% / NN.N%) in the Signal 3 block — that would be the
    // misread risk.
    const signal3Block = html.match(/class="sf-signal sf-signal-3"[\s\S]*?<\/section>/);
    expect(signal3Block, "expected Signal 3 block to render").toBeTruthy();
    expect(signal3Block![0]).not.toMatch(/\d+(?:\.\d+)?%/);
    expect(html).toMatch(/Disposition data not yet loaded/i);
  });

  it("omits Signal 4 block when data is null (no statistical floor met)", () => {
    const data = mkData({ signal4_reversalRate: null });
    const html = renderSentencingFingerprintSection(data, BASE_INPUT);
    expect(html).not.toContain("Appellate history");
  });

  it("escapes HTML in judge name to prevent injection", () => {
    const data = mkData({ judgeDisplayName: "<script>x</script>" });
    const html = renderSentencingFingerprintSection(data, {
      judgeName: "<script>x</script>",
      chargeType: "drug-possession",
    });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("surfaces limitations section when present", () => {
    const data = mkData({
      limitations: [
        "Multiple judges match 'Smith'; add a middle name or court to disambiguate.",
      ],
    });
    const html = renderSentencingFingerprintSection(data, BASE_INPUT);
    expect(html).toContain("Known limitations");
    expect(html).toContain("Multiple judges match");
  });

  it("renders Signal 5 disposition-time block when populated (TICKET-2)", () => {
    const data = mkData({
      signal5_dispositionTime: {
        judge: {
          authorId: 71,
          caseClass: "criminal",
          sampleN: 80,
          p25Days: 159,
          medianDays: 249,
          p75Days: 441,
          primaryCourtId: "cod",
          dataAsOf: "2026-05-03T00:00:00Z",
        },
        district: {
          courtId: "cod",
          caseClass: "criminal",
          sampleN: 5000,
          p10Days: 60,
          p25Days: 100,
          medianDays: 188,
          p75Days: 250,
          p90Days: 400,
          dataAsOf: "2026-05-03T00:00:00Z",
        },
        judgePercentileInDistrict: 73,
        judgeMedianRatio: 1.32,
      },
    });
    const html = renderSentencingFingerprintSection(data, BASE_INPUT);
    expect(html).toMatch(/How long this judge takes/i);
    expect(html).toMatch(/249 days/);
    expect(html).toMatch(/188 days/); // district median
    expect(html).toMatch(/longer than 73% of the bench/);
    // Apex banned-words guard still passes
    assertNoBannedWords(html);
  });

  it("omits Signal 5 block when null (below coverage floor)", () => {
    const data = mkData({ signal5_dispositionTime: null });
    const html = renderSentencingFingerprintSection(data, BASE_INPUT);
    expect(html).not.toContain("How long this judge takes");
  });

  it("uses question-framing intro language instead of prediction framing", () => {
    const data = mkData({
      signal1_topAuthorities: [
        {
          rank: 1,
          case_name: "Foo v. Bar",
          date_filed: null,
          citation_count_in_charge: 5,
          citation_count_total: 50,
          authority_tier_overall: null,
          source_url: null,
        },
      ],
      signal2_motionOutcomes: [
        {
          motion_type: "suppress",
          filed_count: 10,
          granted_count: 4,
          denied_count: 6,
          grant_rate: 0.4,
          baseline_grant_rate: 0.35,
          deviation_from_baseline: 0.05,
        },
      ],
    });
    const html = renderSentencingFingerprintSection(data, BASE_INPUT);
    // Question-frame markers
    expect(html).toMatch(/Patterns in published court records/i);
    expect(html).toMatch(/questions/i);
  });
});
