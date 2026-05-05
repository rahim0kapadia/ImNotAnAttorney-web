import { describe, it, expect } from "vitest";
import { renderJudgeReportCardStandalone } from "../render";
import type { JudgeReportCardStandaloneData } from "../query";
import type { BenchFingerprintResult } from "@/lib/cross-corpus/bench-fingerprint";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const emptyBenchFingerprint: BenchFingerprintResult = {
  meta: { generatedAt: "2026-01-01T00:00:00.000Z", matview: "mv_judge_bench_fingerprint" },
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
};

function makeEmptyData(overrides?: Partial<JudgeReportCardStandaloneData>): JudgeReportCardStandaloneData {
  return {
    meta: {
      generatedAt: "2026-05-04T12:00:00.000Z",
      judgeFullName: "Hon. Patricia Sullivan",
      state: "FL",
    },
    benchFingerprint: emptyBenchFingerprint,
    docketCaseload: null,
    civilPartyConflicts: [],
    motionOutcomeRates: [],
    quotes: [],
    isEmpty: true,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("renderJudgeReportCardStandalone", () => {
  it("returns valid HTML with doctype when isEmpty=true", () => {
    const html = renderJudgeReportCardStandalone(makeEmptyData());
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
    expect(html).toContain("No federal sentencing or caseload data found");
  });

  it("includes UPL gate text in non-empty report", () => {
    const data = makeEmptyData({
      isEmpty: false,
      benchFingerprint: {
        ...emptyBenchFingerprint,
        judge: { cl_person_id: 12345, profile_name: "Sullivan, Patricia", district: "M.D.Fla." },
        ussc: {
          ...emptyBenchFingerprint.ussc,
          total_cases: 100,
          median_sentence_months: 36,
          mean_sentence_months: 42,
          p25_sentence_months: 18,
          p75_sentence_months: 60,
          downward_departure_rate: 0.25,
          upward_departure_rate: 0.03,
          substantial_assistance_rate: 0.15,
          government_sponsored_below_range_rate: 0.1,
        },
      },
    });

    const html = renderJudgeReportCardStandalone(data);
    expect(html).toContain("Informational Use Only");
    expect(html).toContain("does not constitute legal advice");
  });

  it("renders bench fingerprint section when USSC data present", () => {
    const data = makeEmptyData({
      isEmpty: false,
      benchFingerprint: {
        ...emptyBenchFingerprint,
        ussc: {
          total_cases: 200,
          median_sentence_months: 48,
          mean_sentence_months: 52,
          p25_sentence_months: 24,
          p75_sentence_months: 72,
          downward_departure_rate: 0.18,
          upward_departure_rate: 0.02,
          substantial_assistance_rate: 0.12,
          government_sponsored_below_range_rate: 0.08,
        },
      },
    });

    const html = renderJudgeReportCardStandalone(data);
    expect(html).toContain("Federal Sentencing Fingerprint");
    expect(html).toContain("200"); // total_cases
    expect(html).toContain("48.0 mo"); // median
  });

  it("renders motion outcome rates section", () => {
    const data = makeEmptyData({
      isEmpty: false,
      motionOutcomeRates: [
        {
          judge_id: "uuid-123",
          motion_type: "Motion to Suppress",
          grant_rate: 0.12,
          sample_size: 85,
          source_urls: null,
        },
      ],
    });

    const html = renderJudgeReportCardStandalone(data);
    expect(html).toContain("Motion Outcome Rates");
    expect(html).toContain("Motion to Suppress");
    expect(html).toContain("12.0%");
    expect(html).toContain("85");
  });

  it("renders civil party conflicts section", () => {
    const data = makeEmptyData({
      isEmpty: false,
      civilPartyConflicts: [
        {
          judge_id: "uuid-123",
          party_name: "Acme Corp",
          conflict_type: "Financial Interest",
          disclosure_year: 2023,
          source_url: "https://example.com/disclosure",
        },
      ],
    });

    const html = renderJudgeReportCardStandalone(data);
    expect(html).toContain("Financial Disclosure");
    expect(html).toContain("Acme Corp");
    expect(html).toContain("Financial Interest");
    expect(html).toContain("2023");
  });

  it("renders judge quotes section", () => {
    const data = makeEmptyData({
      isEmpty: false,
      quotes: [
        {
          judge_id: "uuid-123",
          quote: "The evidence presented does not meet the clear and convincing standard required.",
          topic: "Evidence Standard",
          case_cited: "United States v. Smith, 2023",
          source_url: null,
        },
      ],
    });

    const html = renderJudgeReportCardStandalone(data);
    expect(html).toContain("Notable Quotes");
    expect(html).toContain("clear and convincing standard");
    expect(html).toContain("Evidence Standard");
  });

  it("escapes HTML special characters in judge name", () => {
    const data = makeEmptyData({
      meta: {
        generatedAt: "2026-05-04T12:00:00.000Z",
        judgeFullName: `Judge O'Brien & <Smith>`,
        state: "NY",
      },
    });

    const html = renderJudgeReportCardStandalone(data);
    expect(html).not.toContain(`O'Brien & <Smith>`);
    expect(html).toContain("O&#x27;Brien &amp; &lt;Smith&gt;");
  });

  it("includes dynamic attorney questions for low departure rate", () => {
    const data = makeEmptyData({
      isEmpty: false,
      benchFingerprint: {
        ...emptyBenchFingerprint,
        ussc: {
          ...emptyBenchFingerprint.ussc,
          total_cases: 150,
          median_sentence_months: 60,
          downward_departure_rate: 0.05, // below 10% threshold
        },
      },
    });

    const html = renderJudgeReportCardStandalone(data);
    expect(html).toContain("Questions Your Attorney Should Answer");
    expect(html).toContain("below-average rate");
  });
});
