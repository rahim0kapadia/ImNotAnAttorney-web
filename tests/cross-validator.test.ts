import { describe, it, expect } from "vitest";

const { crossValidate } = await import("../scripts/lib/cross-validator.mjs");

describe("crossValidate", () => {
  it("returns verified when charge_types have 2+ independent signals", () => {
    const extracted = {
      charge_types: ["dui"],
      motion_types: ["suppress_motion"],
      defense_theories: ["improper_stop"],
      motion_outcomes: [{ motion_type: "suppress_motion", outcome: "granted" }],
    };
    const clMetadata = {
      nature_of_suit: "criminal",
      court: "fladc1",
      jurisdiction: "FL",
      docketCharges: [],
    };
    const result = crossValidate(extracted, clMetadata);
    expect(result.confidence).toBe("verified");
    expect(result.signals.charge_types.independent).toBeGreaterThanOrEqual(2);
  });

  it("returns low_confidence when charge_types have <2 independent signals", () => {
    const extracted = {
      charge_types: ["dui"],
      motion_types: [],
      defense_theories: [],
      motion_outcomes: [],
    };
    const clMetadata = {
      nature_of_suit: null,
      court: "fladc1",
      jurisdiction: "FL",
      docketCharges: [],
    };
    const result = crossValidate(extracted, clMetadata);
    expect(result.confidence).toBe("low_confidence");
  });

  it("counts CL docket charges as independent signal", () => {
    const extracted = {
      charge_types: ["dui"],
      motion_types: [],
      defense_theories: [],
      motion_outcomes: [],
    };
    const clMetadata = {
      nature_of_suit: null,
      court: "fladc1",
      jurisdiction: "FL",
      docketCharges: ["dui"],
    };
    const result = crossValidate(extracted, clMetadata);
    expect(result.signals.charge_types.independent).toBeGreaterThanOrEqual(2);
    expect(result.confidence).toBe("verified");
  });
});
