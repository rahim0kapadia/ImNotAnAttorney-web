import { describe, it, expect } from "vitest";
import {
  calculateGoodTime,
  validateGoodTimeInput,
  parseServePercent,
  type GoodTimeInput,
} from "../calculator";

describe("Good Time Credit Calculator", () => {
  describe("validateGoodTimeInput", () => {
    it("accepts valid input", () => {
      const input: GoodTimeInput = {
        state: "FL",
        chargeType: "drug-possession",
        sentenceMonths: 60,
        custodyCredits: 30,
        prisonType: "state",
        offenseDate: "2024-01-15",
      };
      expect(validateGoodTimeInput(input)).toEqual({
        valid: true,
        errors: [],
      });
    });

    it("rejects missing state", () => {
      const input = {
        chargeType: "dui",
        sentenceMonths: 12,
        custodyCredits: 0,
        prisonType: "state",
        offenseDate: "2024-01-15",
      } as GoodTimeInput;
      const result = validateGoodTimeInput(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("State is required");
    });

    it("rejects unsupported state", () => {
      const input: GoodTimeInput = {
        state: "ZZ",
        chargeType: "dui",
        sentenceMonths: 12,
        custodyCredits: 0,
        prisonType: "state",
        offenseDate: "2024-01-15",
      };
      const result = validateGoodTimeInput(input);
      expect(result.valid).toBe(false);
    });

    it("rejects wrong-length state code", () => {
      const input: GoodTimeInput = {
        state: "FLA",
        chargeType: "dui",
        sentenceMonths: 12,
        custodyCredits: 0,
        prisonType: "state",
        offenseDate: "2024-01-15",
      };
      const result = validateGoodTimeInput(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("State must be a 2-letter code");
    });

    it("rejects negative sentence", () => {
      const input: GoodTimeInput = {
        state: "FL",
        chargeType: "dui",
        sentenceMonths: -5,
        custodyCredits: 0,
        prisonType: "state",
        offenseDate: "2024-01-15",
      };
      const result = validateGoodTimeInput(input);
      expect(result.valid).toBe(false);
    });

    it("rejects zero sentence", () => {
      const input: GoodTimeInput = {
        state: "FL",
        chargeType: "dui",
        sentenceMonths: 0,
        custodyCredits: 0,
        prisonType: "state",
        offenseDate: "2024-01-15",
      };
      const result = validateGoodTimeInput(input);
      expect(result.valid).toBe(false);
    });

    it("rejects negative custody credits", () => {
      const input: GoodTimeInput = {
        state: "FL",
        chargeType: "dui",
        sentenceMonths: 12,
        custodyCredits: -10,
        prisonType: "state",
        offenseDate: "2024-01-15",
      };
      const result = validateGoodTimeInput(input);
      expect(result.valid).toBe(false);
    });

    it("rejects missing offense date", () => {
      const input = {
        state: "FL",
        chargeType: "dui",
        sentenceMonths: 12,
        custodyCredits: 0,
        prisonType: "state",
        offenseDate: "",
      } as GoodTimeInput;
      const result = validateGoodTimeInput(input);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Offense date is required");
    });
  });

  describe("calculateGoodTime", () => {
    it("calculates FL 85% rule correctly", () => {
      const input: GoodTimeInput = {
        state: "FL",
        chargeType: "drug-possession",
        sentenceMonths: 60, // 5 years
        custodyCredits: 30, // 30 days already served
        prisonType: "state",
        offenseDate: "2024-01-15",
      };
      const result = calculateGoodTime(input);
      expect(result.supported).toBe(true);
      expect(result.minimumServePercent).toBe(85);
      expect(result.estimatedServeMonths).toBe(51); // ceil(60 * 0.85) = 51
      expect(result.estimatedCreditMonths).toBe(9); // 60 - 51 = 9
      expect(result.custodyCreditDays).toBe(30);
      expect(result.statuteCitation).toContain("944.275");
      expect(result.stateName).toBe("Florida");
    });

    it("parses CA credit_rate to 85% (serve), not 15% (cap)", () => {
      // Regression guard: the CA rule string mentions both 85% (serve) and
      // 15% (credit cap). The data is ordered so 85% is the first percentage
      // and the regex captures it. This test protects against re-introducing
      // the original authoring bug.
      const input: GoodTimeInput = {
        state: "CA",
        chargeType: "other-felony",
        sentenceMonths: 120,
        custodyCredits: 0,
        prisonType: "state",
        offenseDate: "2024-01-15",
      };
      const result = calculateGoodTime(input);
      expect(result.supported).toBe(true);
      expect(result.minimumServePercent).toBe(85);
    });

    it("returns unsupported for unknown state", () => {
      const input: GoodTimeInput = {
        state: "ZZ",
        chargeType: "dui",
        sentenceMonths: 12,
        custodyCredits: 0,
        prisonType: "state",
        offenseDate: "2024-01-15",
      };
      const result = calculateGoodTime(input);
      expect(result.supported).toBe(false);
      expect(result.fallbackMessage).toBeTruthy();
      expect(result.fallbackMessage).toContain("not yet in our database");
    });

    it("subtracts custody credits from serve time", () => {
      const input: GoodTimeInput = {
        state: "FL",
        chargeType: "drug-possession",
        sentenceMonths: 24,
        custodyCredits: 60, // 60 days = 2 months
        prisonType: "state",
        offenseDate: "2024-01-15",
      };
      const result = calculateGoodTime(input);
      expect(result.custodyCreditDays).toBe(60);
      // ceil(24 * 0.85) = ceil(20.4) = 21 months, minus 2 custody months = 19 net
      expect(result.estimatedServeMonths).toBe(21);
      expect(result.estimatedNetServeMonths).toBe(19);
      expect(result.estimatedNetServeMonths).toBeLessThan(
        result.estimatedServeMonths!,
      );
    });

    it("clamps net serve at 0 when custody exceeds serve time", () => {
      const input: GoodTimeInput = {
        state: "FL",
        chargeType: "drug-possession",
        sentenceMonths: 3,
        custodyCredits: 365, // way more than the sentence
        prisonType: "state",
        offenseDate: "2024-01-15",
      };
      const result = calculateGoodTime(input);
      expect(result.estimatedNetServeMonths).toBe(0);
    });

    it("includes observations for every calculation", () => {
      const input: GoodTimeInput = {
        state: "TX",
        chargeType: "other-felony",
        sentenceMonths: 120,
        custodyCredits: 0,
        prisonType: "state",
        offenseDate: "2024-01-15",
      };
      const result = calculateGoodTime(input);
      expect(result.observations.length).toBeGreaterThanOrEqual(3);
      // Must contain the legal INFORMATION (not ADVICE) disclaimer
      expect(
        result.observations.some((o) => /INFORMATION/i.test(o)),
      ).toBe(true);
    });

    it("supports all 10 states in the data file", () => {
      const states = ["FL", "CA", "TX", "NY", "PA", "IL", "OH", "GA", "NC", "MI"];
      for (const state of states) {
        const input: GoodTimeInput = {
          state,
          chargeType: "other-felony",
          sentenceMonths: 60,
          custodyCredits: 0,
          prisonType: "state",
          offenseDate: "2024-01-15",
        };
        const result = calculateGoodTime(input);
        expect(result.supported, `${state} should be supported`).toBe(true);
        expect(
          result.minimumServePercent,
          `${state} should have a serve percent`,
        ).toBeGreaterThan(0);
        expect(result.statuteCitation, `${state} should cite a statute`).toBeTruthy();
      }
    });
  });

  describe("parseServePercent", () => {
    it("extracts the first percentage from a sentence", () => {
      expect(parseServePercent("must serve at least 85%")).toBe(85);
    });

    it("returns the first percentage when multiple appear", () => {
      expect(
        parseServePercent(
          "must serve at least 85% (credit capped at 15% under the rule)",
        ),
      ).toBe(85);
    });

    it("returns null for empty string", () => {
      expect(parseServePercent("")).toBeNull();
    });

    it("returns null when no percentage present", () => {
      expect(parseServePercent("day for day credit")).toBeNull();
    });

    it("returns null for out-of-range values", () => {
      expect(parseServePercent("200%")).toBeNull();
      expect(parseServePercent("0%")).toBeNull();
    });
  });
});
