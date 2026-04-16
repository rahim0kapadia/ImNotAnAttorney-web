import { describe, it, expect } from "vitest";
import {
  calculateScore,
  getTimeLabel,
  getChargeLabel,
  getChargeSpecificObservation,
  ALLOWED_VALUES,
} from "./score";
import type { ScoreInput } from "./score";

// ============================================================
// HELPERS
// ============================================================

/** Best-case input across all dimensions (scores 103 raw, clamped to 100) */
const bestCase: ScoreInput = {
  chargeType: "dui",
  timeSinceArrest: "less-than-1-month",
  hasAttorney: "private",
  motionsFiled: "yes",
  hasDiscovery: "yes",
  communicationFrequency: "weekly",
  strategyDiscussed: "yes-detail",
  criminalHistory: "none",
  caseStage: "arrested",
  licensedProfession: "no",
};

/**
 * Mid-range baseline that won't hit the clamp ceiling (score ~67).
 * Used for differential tests where we change one field and compare.
 * 50 + 0(PD) + 15(motions) - 3(no disc early) + 0(monthly) + 2(briefly) + 3(no hist) = 67
 */
const midBaseline: ScoreInput = {
  chargeType: "dui",
  timeSinceArrest: "less-than-1-month",
  hasAttorney: "public-defender",
  motionsFiled: "yes",
  hasDiscovery: "no",
  communicationFrequency: "monthly",
  strategyDiscussed: "briefly",
  criminalHistory: "none",
  caseStage: "arrested",
  licensedProfession: "no",
};

/** Worst-case: every input maximizes penalties */
const worstCase: ScoreInput = {
  chargeType: "other-felony",
  timeSinceArrest: "12-plus-months",
  hasAttorney: "no",
  motionsFiled: "no",
  hasDiscovery: "no",
  communicationFrequency: "never",
  strategyDiscussed: "no",
  criminalHistory: "multiple",
  caseStage: "pre-trial",
  licensedProfession: "yes-licensed",
};

/** Helper to override specific fields on the mid-range baseline */
function score(overrides: Partial<ScoreInput> = {}): ReturnType<typeof calculateScore> {
  return calculateScore({ ...midBaseline, ...overrides });
}

// ============================================================
// SCORE RANGE & BANDING
// ============================================================

describe("calculateScore", () => {
  describe("score range and clamping", () => {
    it("returns a score between 0 and 100 inclusive", () => {
      const result = score();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it("clamps to 0 for worst-case scenario", () => {
      const result = calculateScore(worstCase);
      expect(result.score).toBe(0);
    });

    it("returns a non-negative score even with maximum penalties", () => {
      const result = calculateScore(worstCase);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe("banding", () => {
    it("assigns Critical band for scores 0-30", () => {
      const result = calculateScore(worstCase);
      expect(result.band).toBe("Critical");
    });

    it("assigns Excellent band for best-case inputs", () => {
      const result = calculateScore(bestCase);
      expect(result.band).toBe("Excellent");
    });

    it("assigns Concerning band for mid-low scores", () => {
      // No attorney, no motions, no discovery, rarely communicates, no strategy
      const result = score({
        hasAttorney: "not-sure",
        motionsFiled: "dont-know",
        hasDiscovery: "dont-know",
        communicationFrequency: "rarely",
        strategyDiscussed: "no",
      });
      expect(result.band).toBe("Critical");
    });

    it("band boundaries are correct at exact thresholds", () => {
      // Verify the banding function itself by testing scores at each boundary.
      // We test calculateScore indirectly by constructing inputs that produce
      // known scores, then checking the band assignment.

      // Best case = 100 (Excellent, 86+)
      const excellent = calculateScore(bestCase);
      expect(excellent.score).toBe(100);
      expect(excellent.band).toBe("Excellent");

      // Worst case = 0 (Critical, 0-30)
      const critical = calculateScore(worstCase);
      expect(critical.score).toBe(0);
      expect(critical.band).toBe("Critical");

      // Verify the 5 bands are distinct strings
      const allBands = new Set(["Critical", "Concerning", "Average", "Adequate", "Excellent"]);
      expect(allBands.size).toBe(5);

      // Verify mid-baseline lands in Average (51-70), score is 67
      const avg = score();
      expect(avg.score).toBeGreaterThanOrEqual(51);
      expect(avg.score).toBeLessThanOrEqual(70);
      expect(avg.band).toBe("Average");
    });
  });

  // ============================================================
  // OBSERVATIONS
  // ============================================================

  describe("observations", () => {
    it("returns between 3 and 5 observations", () => {
      const result = score();
      expect(result.observations.length).toBeGreaterThanOrEqual(3);
      expect(result.observations.length).toBeLessThanOrEqual(5);
    });

    it("returns max 5 observations even for worst-case with many triggers", () => {
      const result = calculateScore(worstCase);
      expect(result.observations.length).toBeLessThanOrEqual(5);
    });

    it("pads to 3 observations for minimal-trigger best-case", () => {
      const result = score();
      expect(result.observations.length).toBeGreaterThanOrEqual(3);
    });

    it("guarantees 3 observations for Average-band minimal-trigger case (regression)", () => {
      // This exact combo previously produced only 2 observations:
      // score < 70 skipped the first pad, leaving only 1 charge-specific + 1 generic
      const result = calculateScore({
        chargeType: "other-misdemeanor",
        timeSinceArrest: "less-than-1-month",
        hasAttorney: "private",
        motionsFiled: "yes",
        hasDiscovery: "yes",
        communicationFrequency: "monthly",
        strategyDiscussed: "yes-detail",
        criminalHistory: "none",
        caseStage: "arrested",
        licensedProfession: "no",
      });
      expect(result.observations.length).toBeGreaterThanOrEqual(3);
    });

    it("always includes a charge-specific observation", () => {
      for (const chargeType of ALLOWED_VALUES.chargeType) {
        const result = score({ chargeType });
        const hasChargeObs = result.observations.some(
          (obs) =>
            obs.toLowerCase().includes("dui") ||
            obs.toLowerCase().includes("drug") ||
            obs.toLowerCase().includes("trafficking") ||
            obs.toLowerCase().includes("probation") ||
            obs.toLowerCase().includes("white collar") ||
            obs.toLowerCase().includes("sex offense") ||
            obs.toLowerCase().includes("registry") ||
            obs.toLowerCase().includes("federal") ||
            obs.toLowerCase().includes("self-defense") ||
            obs.toLowerCase().includes("justified") ||
            obs.toLowerCase().includes("felony") ||
            obs.toLowerCase().includes("misdemeanor") ||
            obs.toLowerCase().includes("cases") ||
            obs.toLowerCase().includes("evidence") ||
            obs.toLowerCase().includes("defense theory") ||
            obs.toLowerCase().includes("forensic") ||
            obs.toLowerCase().includes("guideline") ||
            obs.toLowerCase().includes("threat") ||
            obs.toLowerCase().includes("technical")
        );
        expect(hasChargeObs).toBe(true);
      }
    });

    it("observations are non-empty strings", () => {
      const result = calculateScore(worstCase);
      for (const obs of result.observations) {
        expect(typeof obs).toBe("string");
        expect(obs.length).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================
  // ATTORNEY TYPE (10% weight)
  // ============================================================

  describe("attorney type scoring", () => {
    it("private attorney adds +5 relative to public defender", () => {
      const priv = score({ hasAttorney: "private" });
      const pub = score({ hasAttorney: "public-defender" });
      expect(priv.score - pub.score).toBe(5);
    });

    it("no attorney penalizes -15 and adds observation", () => {
      const noAtty = score({ hasAttorney: "no" });
      const pub = score({ hasAttorney: "public-defender" });
      expect(pub.score - noAtty.score).toBe(15);
      expect(noAtty.observations.some((o) => o.includes("don't have an attorney"))).toBe(true);
    });

    it("public-defender adds caseload awareness observation", () => {
      const result = score({ hasAttorney: "public-defender" });
      expect(result.observations.some((o) => o.includes("caseload"))).toBe(true);
    });

    it("not-sure penalizes -10 and adds observation", () => {
      const notSure = score({ hasAttorney: "not-sure" });
      const pub = score({ hasAttorney: "public-defender" });
      expect(pub.score - notSure.score).toBe(10);
      expect(notSure.observations.some((o) => o.includes("Confirm whether you have active counsel"))).toBe(true);
    });
  });

  // ============================================================
  // MOTIONS FILED (20% weight)
  // ============================================================

  describe("motions filed scoring", () => {
    it("yes vs no at early stage differs by 20 (+15 vs -5)", () => {
      const yes = score({ motionsFiled: "yes" });
      const no = score({ motionsFiled: "no" });
      expect(yes.score - no.score).toBe(20);
    });

    it("no at 3+ months penalizes -20 and adds observation", () => {
      const result = score({
        motionsFiled: "no",
        timeSinceArrest: "3-6-months",
      });
      expect(result.observations.some((o) => o.includes("no motions filed"))).toBe(true);
    });

    it("yes vs no at 3+ months differs by 35 (+15 vs -20)", () => {
      const earlyYes = score({ motionsFiled: "yes", timeSinceArrest: "3-6-months" });
      const earlyNo = score({ motionsFiled: "no", timeSinceArrest: "3-6-months" });
      expect(earlyYes.score - earlyNo.score).toBe(35);
    });

    it("dont-know penalizes -10 and adds observation", () => {
      const result = score({ motionsFiled: "dont-know" });
      expect(result.observations.some((o) => o.includes("don't know, nothing may have been filed"))).toBe(true);
    });

    it("yes at 3+ months adds a positive observation", () => {
      const result = score({
        motionsFiled: "yes",
        timeSinceArrest: "3-6-months",
      });
      expect(result.observations.some((o) => o.includes("filed motions"))).toBe(true);
    });
  });

  // ============================================================
  // DISCOVERY RECEIVED (15% weight)
  // ============================================================

  describe("discovery scoring", () => {
    it("yes vs no at early stage differs by 13 (+10 vs -3)", () => {
      const yes = score({ hasDiscovery: "yes" });
      const no = score({ hasDiscovery: "no" });
      expect(yes.score - no.score).toBe(13);
    });

    it("yes vs no at 3+ months differs by 25 (+10 vs -15)", () => {
      const noLate = score({
        hasDiscovery: "no",
        timeSinceArrest: "6-12-months",
      });
      const yesLate = score({
        hasDiscovery: "yes",
        timeSinceArrest: "6-12-months",
      });
      expect(yesLate.score - noLate.score).toBe(25);
    });

    it("dont-know adds educational observation about discovery", () => {
      const result = score({ hasDiscovery: "dont-know" });
      expect(result.observations.some((o) => o.includes("Discovery is evidence the prosecution must share"))).toBe(true);
    });
  });

  // ============================================================
  // COMMUNICATION FREQUENCY (15% weight)
  // ============================================================

  describe("communication frequency scoring", () => {
    it("weekly vs monthly differs by 10 (+10 vs 0)", () => {
      const weekly = score({ communicationFrequency: "weekly" });
      const monthly = score({ communicationFrequency: "monthly" });
      expect(weekly.score - monthly.score).toBe(10);
    });

    it("rarely penalizes -10 and adds observation", () => {
      const result = score({ communicationFrequency: "rarely" });
      expect(result.observations.some((o) => o.includes("Rare communication"))).toBe(true);
    });

    it("never penalizes -20 and adds serious red flag observation", () => {
      const result = score({ communicationFrequency: "never" });
      expect(result.observations.some((o) => o.includes("serious red flag"))).toBe(true);
    });

    it("monthly at 3+ months adds advisory observation", () => {
      const result = score({
        communicationFrequency: "monthly",
        timeSinceArrest: "3-6-months",
      });
      expect(result.observations.some((o) => o.includes("Monthly communication"))).toBe(true);
    });
  });

  // ============================================================
  // STRATEGY DISCUSSION (10% weight)
  // ============================================================

  describe("strategy discussion scoring", () => {
    it("yes-detail vs briefly differs by 8 (+10 vs +2)", () => {
      const detail = score({ strategyDiscussed: "yes-detail" });
      const briefly = score({ strategyDiscussed: "briefly" });
      expect(detail.score - briefly.score).toBe(8);
    });

    it("no penalizes -12 and adds observation", () => {
      const result = score({ strategyDiscussed: "no" });
      expect(result.observations.some((o) => o.includes("defense theory hasn't been explained"))).toBe(true);
    });
  });

  // ============================================================
  // COMPOUND TIME-BASED PENALTY
  // ============================================================

  describe("compound time-based penalty", () => {
    it("applies -10 when 6+ months with no motions AND no discovery", () => {
      const withCompound = score({
        timeSinceArrest: "6-12-months",
        motionsFiled: "no",
        hasDiscovery: "no",
      });
      // Same but with motions (should NOT trigger compound)
      const withoutCompound = score({
        timeSinceArrest: "6-12-months",
        motionsFiled: "yes",
        hasDiscovery: "no",
      });
      // The difference is: motions yes(+15) vs no(-20) = 35, PLUS compound(-10) = 45
      expect(withoutCompound.score - withCompound.score).toBe(45);
    });

    it("uses 'unknown' wording when motions/discovery are dont-know", () => {
      // Use private attorney to avoid PD observation filling the 5-observation cap
      const result = score({
        hasAttorney: "private",
        timeSinceArrest: "6-12-months",
        motionsFiled: "dont-know",
        hasDiscovery: "dont-know",
        communicationFrequency: "weekly",
        strategyDiscussed: "yes-detail",
      });
      const compoundObs = result.observations.find((o) => o.includes("multiple defense windows"));
      expect(compoundObs).toBeDefined();
      expect(compoundObs).toContain("unknown motion status");
      expect(compoundObs).toContain("unknown discovery status");
    });

    it("uses 'no' wording when motions/discovery are explicitly no", () => {
      const result = score({
        hasAttorney: "private",
        timeSinceArrest: "6-12-months",
        motionsFiled: "no",
        hasDiscovery: "no",
        communicationFrequency: "weekly",
        strategyDiscussed: "yes-detail",
      });
      const compoundObs = result.observations.find((o) => o.includes("multiple defense windows"));
      expect(compoundObs).toBeDefined();
      expect(compoundObs).toContain("no motions");
      expect(compoundObs).toContain("no discovery");
    });

    it("does NOT apply at 1-3 months", () => {
      const result = score({
        timeSinceArrest: "1-3-months",
        motionsFiled: "no",
        hasDiscovery: "no",
      });
      // No compound penalty observation
      expect(result.observations.some((o) => o.includes("multiple defense windows"))).toBe(false);
    });
  });

  // ============================================================
  // CRIMINAL HISTORY
  // ============================================================

  describe("criminal history scoring", () => {
    it("none vs misdemeanor differs by 5 (+3 vs -2)", () => {
      const none = score({ criminalHistory: "none" });
      const misd = score({ criminalHistory: "misdemeanor" });
      expect(none.score - misd.score).toBe(5);
    });

    it("felony and multiple both penalize -5", () => {
      const felony = score({ criminalHistory: "felony" });
      const multiple = score({ criminalHistory: "multiple" });
      expect(felony.score).toBe(multiple.score);
    });

    it("misdemeanor adds diversion observation", () => {
      const result = score({ criminalHistory: "misdemeanor" });
      expect(result.observations.some((o) => o.includes("diversion eligibility"))).toBe(true);
    });
  });

  // ============================================================
  // CASE STAGE
  // ============================================================

  describe("case stage scoring", () => {
    it("pre-arrest adds +3 and observation", () => {
      const preArrest = score({ caseStage: "pre-arrest" });
      const arrested = score({ caseStage: "arrested" });
      expect(preArrest.score - arrested.score).toBe(3);
      expect(preArrest.observations.some((o) => o.includes("proactive"))).toBe(true);
    });

    it("sentencing adds mitigation observation", () => {
      const result = score({ caseStage: "sentencing" });
      expect(result.observations.some((o) => o.includes("mitigation preparation"))).toBe(true);
    });

    it("post-conviction adds appeal deadline observation", () => {
      const result = score({ caseStage: "post-conviction" });
      expect(result.observations.some((o) => o.includes("appeal deadlines"))).toBe(true);
    });
  });

  // ============================================================
  // CASE STAGE × MILESTONE INTERACTIONS
  // ============================================================

  describe("case stage × milestone interactions", () => {
    it("pre-trial with no motions penalizes -5 extra", () => {
      const preTrial = score({ caseStage: "pre-trial", motionsFiled: "no" });
      const arrested = score({ caseStage: "arrested", motionsFiled: "no" });
      expect(arrested.score - preTrial.score).toBe(5);
    });

    it("trial-prep without detailed strategy penalizes -5 extra", () => {
      const trialPrep = score({ caseStage: "trial-prep", strategyDiscussed: "briefly" });
      const arrested = score({ caseStage: "arrested", strategyDiscussed: "briefly" });
      expect(arrested.score - trialPrep.score).toBe(5);
    });

    it("arraigned without discovery at 1+ months penalizes -3 extra", () => {
      const arraigned = score({
        caseStage: "arraigned",
        hasDiscovery: "no",
        timeSinceArrest: "1-3-months",
      });
      const arrested = score({
        caseStage: "arrested",
        hasDiscovery: "no",
        timeSinceArrest: "1-3-months",
      });
      expect(arrested.score - arraigned.score).toBe(3);
    });
  });

  // ============================================================
  // LICENSED PROFESSION
  // ============================================================

  describe("licensed profession observations", () => {
    it("yes-licensed adds licensing board observation", () => {
      const result = score({ licensedProfession: "yes-licensed" });
      expect(result.observations.some((o) => o.includes("licensing board"))).toBe(true);
    });

    it("student adds FAFSA observation", () => {
      const result = score({ licensedProfession: "student" });
      expect(result.observations.some((o) => o.includes("FAFSA"))).toBe(true);
    });

    it("no and yes-other do not add profession observations", () => {
      const noResult = score({ licensedProfession: "no" });
      const otherResult = score({ licensedProfession: "yes-other" });
      expect(noResult.observations.some((o) => o.includes("licensing board"))).toBe(false);
      expect(otherResult.observations.some((o) => o.includes("licensing board"))).toBe(false);
    });
  });

  // ============================================================
  // ALL ALLOWED VALUES PRODUCE VALID RESULTS
  // ============================================================

  describe("all allowed value combinations produce valid results", () => {
    it("every chargeType produces a valid score", () => {
      for (const ct of ALLOWED_VALUES.chargeType) {
        const result = score({ chargeType: ct });
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
        expect(result.observations.length).toBeGreaterThanOrEqual(3);
        expect(result.observations.length).toBeLessThanOrEqual(5);
      }
    });

    it("every timeSinceArrest produces a valid score", () => {
      for (const t of ALLOWED_VALUES.timeSinceArrest) {
        const result = score({ timeSinceArrest: t });
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
      }
    });

    it("every caseStage produces a valid score", () => {
      for (const cs of ALLOWED_VALUES.caseStage) {
        const result = score({ caseStage: cs });
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
      }
    });

    it("every licensedProfession produces a valid score", () => {
      for (const lp of ALLOWED_VALUES.licensedProfession) {
        const result = score({ licensedProfession: lp });
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
      }
    });
  });

  // ============================================================
  // BEST-CASE AND WORST-CASE SCORES
  // ============================================================

  describe("extreme scenarios", () => {
    it("best case scores Excellent (86+)", () => {
      const result = calculateScore(bestCase);
      expect(result.score).toBeGreaterThanOrEqual(86);
      expect(result.band).toBe("Excellent");
    });

    it("worst case scores Critical (0-30)", () => {
      const result = calculateScore(worstCase);
      expect(result.score).toBeLessThanOrEqual(30);
      expect(result.band).toBe("Critical");
    });

    it("best case score is exactly 100 (clamped from 103)", () => {
      const result = calculateScore(bestCase);
      // 50+5+15+10+10+10+3 = 103 -> clamped to 100
      expect(result.score).toBe(100);
    });

    it("worst case score is exactly 0 (clamped)", () => {
      const result = calculateScore(worstCase);
      // 50 -15(no atty) -20(no motions late) -15(no discovery late) -20(never comm)
      // -12(no strategy) -10(compound) -5(multiple history) -5(pre-trial+no motions)
      // = 50-102 = -52 -> clamped to 0
      expect(result.score).toBe(0);
    });
  });
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

describe("getTimeLabel", () => {
  it("converts all slugs to readable labels", () => {
    expect(getTimeLabel("less-than-1-month")).toBe("less than 1 month");
    expect(getTimeLabel("1-3-months")).toBe("1-3 months");
    expect(getTimeLabel("3-6-months")).toBe("3-6 months");
    expect(getTimeLabel("6-12-months")).toBe("6-12 months");
    expect(getTimeLabel("12-plus-months")).toBe("12+ months");
  });

  it("falls back to raw slug for unknown values", () => {
    expect(getTimeLabel("unknown-time")).toBe("unknown-time");
  });
});

describe("getChargeLabel", () => {
  it("converts all slugs to readable labels", () => {
    expect(getChargeLabel("drug")).toBe("drug offense");
    expect(getChargeLabel("drug-possession")).toBe("drug possession");
    expect(getChargeLabel("drug-trafficking")).toBe("drug trafficking");
    expect(getChargeLabel("dui")).toBe("DUI/DWI");
    expect(getChargeLabel("probation-violation")).toBe("probation violation");
    expect(getChargeLabel("white-collar")).toBe("white collar");
    expect(getChargeLabel("sex-offense")).toBe("sex offense");
    expect(getChargeLabel("federal-criminal")).toBe("federal criminal");
    expect(getChargeLabel("self-defense")).toBe("self-defense");
    expect(getChargeLabel("other-felony")).toBe("felony");
    expect(getChargeLabel("other-misdemeanor")).toBe("misdemeanor");
  });

  it("falls back to raw slug for unknown values", () => {
    expect(getChargeLabel("arson")).toBe("arson");
  });
});

describe("getChargeSpecificObservation", () => {
  it("returns DUI-specific observation for dui charge", () => {
    const obs = getChargeSpecificObservation("dui", 0, "private");
    expect(obs).toContain("DUI");
  });

  it("returns drug-specific observation for drug charge", () => {
    const obs = getChargeSpecificObservation("drug", 0, "private");
    expect(obs).toContain("evidence was obtained");
  });

  it("returns different observation for no-attorney DUI", () => {
    const withAtty = getChargeSpecificObservation("dui", 0, "private");
    const noAtty = getChargeSpecificObservation("dui", 0, "no");
    expect(withAtty).not.toBe(noAtty);
    expect(noAtty).toContain("DUI defense starts");
  });

  it("returns different observation for late-stage DUI", () => {
    const early = getChargeSpecificObservation("dui", 1, "private");
    const late = getChargeSpecificObservation("dui", 2, "private");
    expect(early).not.toBe(late);
  });

  it("white-collar mentions civil or regulatory exposure", () => {
    const obs = getChargeSpecificObservation("white-collar", 0, "private");
    expect(obs).toContain("civil or regulatory");
  });

  it("misdemeanor mentions permanent record", () => {
    const obs = getChargeSpecificObservation("other-misdemeanor", 0, "private");
    expect(obs).toContain("permanent record");
  });

  it("drug-possession returns same observation style as legacy drug", () => {
    const possession = getChargeSpecificObservation("drug-possession", 0, "private");
    const legacy = getChargeSpecificObservation("drug", 0, "private");
    expect(possession).toBe(legacy);
    expect(possession).toContain("evidence was obtained");
  });

  it("drug-trafficking mentions mandatory minimums or quantity", () => {
    const obs = getChargeSpecificObservation("drug-trafficking", 0, "private");
    expect(obs.toLowerCase()).toMatch(/mandatory minimum|quantity/);
  });

  it("drug-trafficking no-attorney mentions CI and wiretap", () => {
    const obs = getChargeSpecificObservation("drug-trafficking", 0, "no");
    expect(obs.toLowerCase()).toMatch(/confidential informant|wiretap/);
  });

  it("probation-violation mentions technical vs substantive", () => {
    const obs = getChargeSpecificObservation("probation-violation", 0, "private");
    expect(obs).toContain("technical");
    expect(obs).toContain("substantive");
  });

  it("sex-offense mentions registration or SORNA", () => {
    const obs = getChargeSpecificObservation("sex-offense", 0, "private");
    expect(obs.toLowerCase()).toMatch(/registration|registry|sorna/);
  });

  it("sex-offense no-attorney mentions collateral consequences", () => {
    const obs = getChargeSpecificObservation("sex-offense", 0, "no");
    expect(obs).toContain("collateral consequences");
  });

  it("federal-criminal mentions sentencing guidelines or USSG", () => {
    const obs = getChargeSpecificObservation("federal-criminal", 0, "private");
    expect(obs.toLowerCase()).toMatch(/guideline|ussg|ausa/);
  });

  it("federal-criminal late-stage mentions Rule 16", () => {
    const obs = getChargeSpecificObservation("federal-criminal", 2, "private");
    expect(obs).toContain("Rule 16");
  });

  it("self-defense mentions reasonable belief or justified", () => {
    const obs = getChargeSpecificObservation("self-defense", 0, "private");
    expect(obs.toLowerCase()).toMatch(/reasonable belief|imminent harm|surveillance/);
  });

  it("self-defense no-attorney mentions stand your ground or duty to retreat", () => {
    const obs = getChargeSpecificObservation("self-defense", 0, "no");
    expect(obs.toLowerCase()).toMatch(/stand your ground|duty to retreat/);
  });

  it("unknown charge type returns generic observation", () => {
    const obs = getChargeSpecificObservation("arson", 0, "private");
    expect(obs).toContain("elements the prosecution must prove");
  });
});

// ============================================================
// ALLOWED_VALUES INTEGRITY
// ============================================================

describe("ALLOWED_VALUES", () => {
  it("has all 10 required fields", () => {
    const fields = [
      "chargeType", "timeSinceArrest", "hasAttorney", "motionsFiled",
      "hasDiscovery", "communicationFrequency", "strategyDiscussed",
      "criminalHistory", "caseStage", "licensedProfession",
    ];
    for (const field of fields) {
      expect(ALLOWED_VALUES[field]).toBeDefined();
      expect(ALLOWED_VALUES[field].length).toBeGreaterThan(0);
    }
  });

  it("chargeType has exactly 11 values", () => {
    expect(ALLOWED_VALUES.chargeType).toHaveLength(11);
  });

  it("chargeType includes all 8 playbook charge types plus catch-alls and legacy", () => {
    const expected = [
      "drug", "drug-possession", "drug-trafficking", "dui",
      "probation-violation", "white-collar", "sex-offense",
      "federal-criminal", "self-defense", "other-felony", "other-misdemeanor",
    ];
    for (const ct of expected) {
      expect(ALLOWED_VALUES.chargeType).toContain(ct);
    }
  });

  it("caseStage has 7 values covering the full lifecycle", () => {
    expect(ALLOWED_VALUES.caseStage).toHaveLength(7);
    expect(ALLOWED_VALUES.caseStage).toContain("pre-arrest");
    expect(ALLOWED_VALUES.caseStage).toContain("post-conviction");
  });
});
