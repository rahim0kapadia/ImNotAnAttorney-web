/**
 * Unit tests for X-Ray Section X1 — Federal PJI Cross-Reference (X-Ray $2,497 E2).
 *
 * Focus areas:
 *   1. Tier monotonicity (X-Ray strictly exceeds M4 $97 on PJI depth)
 *   2. UPL banned-phrase blocklist
 *   3. URL suppression — every cited case has a CourtListener URL in render
 *   4. Quote coverage (extracted quote per case; graceful fallback)
 *   5. Judge-attack cross-reference (X-Ray exclusive; missing from M4 + IB E1)
 *   6. Empty / limitation / federal-only paths
 */
import { describe, it, expect } from "vitest";
import {
  renderXrayFederalPjiCrossRef,
  XRAY_ATTACK_TOP_N,
  XRAY_JUDGE_ATTACK_INSUFFICIENT_N,
  INSTRUCTION_ATTACK_MOTION_TYPES,
  type XrayFederalPjiData,
  type XrayAttackAuthority,
  type XrayCircuitVariant,
  type XrayJudgeAttackRow,
} from "../federal-pji-cross-ref";
import { UPL_BANNED_PHRASES } from "@/lib/charge-slug-maps";
import type { PjiMatch } from "@/lib/tier9-reports/federal-jury-instruction-brief";

// ------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------

function mkPji(over: Partial<PjiMatch> = {}): PjiMatch {
  return {
    id: 42,
    circuit: 9,
    instruction_number: "8.124",
    title: "Wire Fraud — Elements",
    body:
      "The government must prove each of the following elements beyond a reasonable doubt: First, that there was a scheme to defraud. Second, that the defendant used interstate wire communications. Third, that the defendant acted with intent to defraud.",
    commentary: null,
    statute_citations: ["18 U.S.C. § 1343"],
    source_url: "https://www.ce9.uscourts.gov/jury-instructions/node/239",
    effective_date: "2023-10-01",
    ...over,
  };
}

function mkAuth(over: Partial<XrayAttackAuthority> = {}): XrayAttackAuthority {
  return {
    rank: 1,
    case_name: "Neder v. United States",
    date_filed: "1999-06-10",
    citation: "527 U.S. 1",
    citation_count_in_charge: 420,
    citation_count_total: 5400,
    authority_tier: "landmark",
    quote_sentence:
      "Materiality of falsehood is an element of the federal mail fraud, wire fraud, and bank fraud statutes.",
    quote_frequency: 38,
    source_url: "https://www.courtlistener.com/opinion/118306/neder-v-united-states/",
    framing:
      "Cases where the defense cited challenging elements of instructions for Wire Fraud (18 U.S.C. § 1343).",
    ...over,
  };
}

function mkVariant(over: Partial<XrayCircuitVariant> = {}): XrayCircuitVariant {
  return {
    circuit: 1,
    circuitName: "First Circuit",
    instruction_number: "4.18.1343",
    title: "Wire Fraud",
    difference_summary:
      "Length delta +3% vs primary; first divergent phrasing: \"knowingly devised or intended to devise…\"",
    source_url: "https://www.ca1.uscourts.gov/sites/ca1/files/citations/4.18.1343.pdf",
    is_primary: false,
    ...over,
  };
}

function mkJudgeAttack(over: Partial<XrayJudgeAttackRow> = {}): XrayJudgeAttackRow {
  return {
    motion_type: "motion_to_suppress",
    filed_count: 34,
    granted_count: 11,
    grant_rate: 0.324,
    baseline_grant_rate: 0.280,
    deviation_from_baseline: 0.044,
    insufficient_sample: false,
    relevance_note:
      "Suppression challenges often hinge on how the burden-of-proof instruction is phrased for the underlying element.",
    ...over,
  };
}

function mkData(over: Partial<XrayFederalPjiData> = {}): XrayFederalPjiData {
  return {
    federalCharge: "wire-fraud",
    federalChargeLabel: "Wire Fraud (18 U.S.C. § 1343)",
    circuit: "9",
    circuitName: "Ninth Circuit",
    state: "CA",
    judgeDisplayName: "Jane Doe",
    judgeResolved: true,
    ambiguousJudge: false,
    pji: mkPji(),
    burdenSentences: [
      { sentence: "The government must prove each of the following elements beyond a reasonable doubt." },
    ],
    attackAuthorities: [mkAuth()],
    circuitVariants: [
      {
        circuit: 9,
        circuitName: "Ninth Circuit",
        instruction_number: "8.124",
        title: "Wire Fraud — Elements",
        difference_summary: "Primary instruction selected for this case.",
        source_url: "https://www.ce9.uscourts.gov/jury-instructions/node/239",
        is_primary: true,
      },
      mkVariant(),
    ],
    judgeAttackRows: [mkJudgeAttack()],
    limitations: [],
    federalOnly: false,
    isEmpty: false,
    ...over,
  };
}

// ------------------------------------------------------------
// Tier monotonicity (HARD)
// ------------------------------------------------------------

describe("Section X1 — Federal PJI Cross-Reference · tier monotonicity guardrails", () => {
  it("X-Ray attack TOP_N (10) strictly exceeds M4 top 5", () => {
    // M4 ($97) caps at 5. X-Ray ($2,497) must go deeper.
    expect(XRAY_ATTACK_TOP_N).toBeGreaterThan(5);
    expect(XRAY_ATTACK_TOP_N).toBe(10);
  });

  it("X-Ray carries extracted quote per case (M4 is citation-only)", () => {
    const data = mkData({
      attackAuthorities: [
        mkAuth({
          quote_sentence:
            "The defendant has a right to have the jury find every element beyond a reasonable doubt.",
        }),
      ],
    });
    const md = renderXrayFederalPjiCrossRef(data);
    expect(md).toContain(
      "The defendant has a right to have the jury find every element beyond a reasonable doubt",
    );
  });

  it("X-Ray circuit variants are not capped at M4's 3", () => {
    // Render with 8 variants (every covered circuit) — monotonicity over M4's 3-cap.
    const variants: XrayCircuitVariant[] = [
      {
        circuit: 9,
        circuitName: "Ninth Circuit",
        instruction_number: "8.124",
        title: "Wire Fraud — Elements",
        difference_summary: "Primary instruction selected for this case.",
        source_url: "https://www.ce9.uscourts.gov/jury-instructions/node/239",
        is_primary: true,
      },
      mkVariant({ circuit: 1, circuitName: "First Circuit" }),
      mkVariant({ circuit: 3, circuitName: "Third Circuit" }),
      mkVariant({ circuit: 5, circuitName: "Fifth Circuit" }),
      mkVariant({ circuit: 6, circuitName: "Sixth Circuit" }),
      mkVariant({ circuit: 7, circuitName: "Seventh Circuit" }),
      mkVariant({ circuit: 8, circuitName: "Eighth Circuit" }),
      mkVariant({ circuit: 10, circuitName: "Tenth Circuit" }),
    ];
    const md = renderXrayFederalPjiCrossRef(mkData({ circuitVariants: variants }));
    expect(md).toContain("First Circuit");
    expect(md).toContain("Third Circuit");
    expect(md).toContain("Fifth Circuit");
    expect(md).toContain("Sixth Circuit");
    expect(md).toContain("Seventh Circuit");
    expect(md).toContain("Eighth Circuit");
    expect(md).toContain("Ninth Circuit");
    expect(md).toContain("Tenth Circuit");
    // Count distinct circuit headings rendered; must exceed M4 maximum of 3.
    const renderedDistinctCircuits = variants.filter((v) =>
      md.includes(v.circuitName),
    );
    expect(renderedDistinctCircuits.length).toBeGreaterThan(3);
  });

  it("X-Ray surfaces judge-attack cross-reference (absent from M4 and IB E1)", () => {
    const md = renderXrayFederalPjiCrossRef(mkData());
    expect(md).toContain("Judge-Attack Cross-Reference");
  });

  it("judge-attack cross-reference uses the exported motion-type filter set", () => {
    // INSTRUCTION_ATTACK_MOTION_TYPES must contain the canonical instruction-
    // attack motions; this is an invariant consumers (edge fn / engine) rely on.
    expect(INSTRUCTION_ATTACK_MOTION_TYPES.has("motion_to_suppress")).toBe(true);
    expect(INSTRUCTION_ATTACK_MOTION_TYPES.has("motion_to_dismiss")).toBe(true);
    expect(INSTRUCTION_ATTACK_MOTION_TYPES.has("motion_for_judgment_of_acquittal")).toBe(
      true,
    );
    expect(INSTRUCTION_ATTACK_MOTION_TYPES.has("motion_for_new_trial")).toBe(true);
    expect(INSTRUCTION_ATTACK_MOTION_TYPES.has("motion_in_limine")).toBe(true);
  });
});

// ------------------------------------------------------------
// UPL banned phrases
// ------------------------------------------------------------

describe("Section X1 — Federal PJI Cross-Reference · UPL blocklist", () => {
  it("never emits banned UPL phrases on fully populated render", () => {
    const data = mkData({
      attackAuthorities: Array.from({ length: XRAY_ATTACK_TOP_N }, (_, i) =>
        mkAuth({ rank: i + 1, case_name: `Case ${i}` }),
      ),
      judgeAttackRows: [
        mkJudgeAttack({ filed_count: 3, insufficient_sample: true }),
        mkJudgeAttack({ motion_type: "motion_to_dismiss", filed_count: 50 }),
      ],
      limitations: [
        "No pattern instruction cached for the Third Circuit; showing the Ninth Circuit instruction as the closest available reference.",
      ],
    });
    const md = renderXrayFederalPjiCrossRef(data).toLowerCase();
    for (const phrase of UPL_BANNED_PHRASES) {
      expect(
        md.includes(phrase),
        `rendered markdown must not contain banned phrase "${phrase}"`,
      ).toBe(false);
    }
  });

  it("emits the legal-INFORMATION methodology gate on every non-empty render", () => {
    const md = renderXrayFederalPjiCrossRef(mkData());
    expect(md).toContain("legal INFORMATION");
    expect(md).toContain("not legal ADVICE");
    expect(md).toMatch(/not a prediction/i);
  });

  it("does not characterize judges as harsh/lenient/biased", () => {
    const data = mkData({
      judgeAttackRows: [
        mkJudgeAttack({ grant_rate: 0.02, baseline_grant_rate: 0.30 }),
      ],
    });
    const md = renderXrayFederalPjiCrossRef(data).toLowerCase();
    for (const slur of ["harsh", "lenient", "biased", "hostile", "pro-defense", "pro-prosecution"]) {
      expect(md.includes(slur), `judge rendered with banned characterization "${slur}"`).toBe(
        false,
      );
    }
  });
});

// ------------------------------------------------------------
// URL + quote coverage
// ------------------------------------------------------------

describe("Section X1 — Federal PJI Cross-Reference · URL + quote coverage", () => {
  it("every attack authority row includes its CourtListener URL in the markdown", () => {
    const data = mkData({
      attackAuthorities: [
        mkAuth({
          rank: 1,
          case_name: "Apprendi v. New Jersey",
          source_url:
            "https://www.courtlistener.com/opinion/118398/apprendi-v-new-jersey/",
        }),
        mkAuth({
          rank: 2,
          case_name: "Alleyne v. United States",
          source_url: "https://www.courtlistener.com/opinion/891125/alleyne-v-united-states/",
          quote_sentence: null,
          quote_frequency: null,
        }),
      ],
    });
    const md = renderXrayFederalPjiCrossRef(data);
    expect(md).toContain(
      "https://www.courtlistener.com/opinion/118398/apprendi-v-new-jersey/",
    );
    expect(md).toContain(
      "https://www.courtlistener.com/opinion/891125/alleyne-v-united-states/",
    );
  });

  it("falls back gracefully when an authority has no cached quote", () => {
    const data = mkData({
      attackAuthorities: [mkAuth({ quote_sentence: null, quote_frequency: null })],
    });
    const md = renderXrayFederalPjiCrossRef(data);
    expect(md).toContain("No canonical citing-court quote cached");
  });
});

// ------------------------------------------------------------
// Judge-attack cross-reference (X-Ray exclusive)
// ------------------------------------------------------------

describe("Section X1 — Federal PJI Cross-Reference · judge-attack cross-reference", () => {
  it("surfaces insufficient samples with n label rather than suppressing", () => {
    const data = mkData({
      judgeAttackRows: [mkJudgeAttack({ filed_count: 3, insufficient_sample: true })],
    });
    const md = renderXrayFederalPjiCrossRef(data);
    expect(md).toMatch(/insufficient/i);
    expect(md).toContain("n=3");
  });

  it("labels the threshold used for insufficient-sample classification", () => {
    const md = renderXrayFederalPjiCrossRef(mkData());
    // The section text references the threshold (10) so the reader knows
    // where the caveat applies.
    expect(md).toContain(String(XRAY_JUDGE_ATTACK_INSUFFICIENT_N));
  });
});

// ------------------------------------------------------------
// Empty + limitation + federal-only paths
// ------------------------------------------------------------

describe("Section X1 — Federal PJI Cross-Reference · empty + limitation paths", () => {
  it("empty data renders empty string (X-Ray assembler skips the section)", () => {
    const empty: XrayFederalPjiData = {
      federalCharge: "not-federal",
      federalChargeLabel: "not-federal",
      circuit: null,
      circuitName: null,
      state: null,
      judgeDisplayName: null,
      judgeResolved: false,
      ambiguousJudge: false,
      pji: null,
      burdenSentences: [],
      attackAuthorities: [],
      circuitVariants: [],
      judgeAttackRows: [],
      limitations: [],
      federalOnly: true,
      isEmpty: true,
    };
    expect(renderXrayFederalPjiCrossRef(empty)).toBe("");
  });

  it("limitations surface in a Known limitations section when non-empty", () => {
    const md = renderXrayFederalPjiCrossRef(
      mkData({
        limitations: ["No charge-specific cache for Tax Evasion; used fallback."],
      }),
    );
    expect(md).toContain("Known limitations");
    expect(md).toContain("No charge-specific cache for Tax Evasion");
  });

  it("renders the section heading at the X1 canonical level", () => {
    const md = renderXrayFederalPjiCrossRef(mkData());
    expect(md).toContain("## Section X1: Federal Pattern Jury Instruction — Cross-Reference");
    // Must not collide with IB's Appendix G heading (different product).
    expect(md).not.toContain("## Appendix G");
  });
});
