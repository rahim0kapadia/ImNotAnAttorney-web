/**
 * Unit tests for src/lib/ussc-mappings.ts.
 *
 * Covers every mapper + combined helper. Each mapping is verified against the
 * actual distinct values in the matview (per 2026-04-21 discovery query).
 */
import { describe, it, expect } from "vitest";
import {
  chargeTypeToOffguide,
  priorConvictionsToXcrhissr,
  immigrationStatusToCitizen,
  ageBucketFromIntake,
  mapIntakeToBucket,
  AGE_BUCKET_OPTIONS,
} from "@/lib/ussc-mappings";

describe("chargeTypeToOffguide", () => {
  // Source of truth: USSC offguide_label column in federal_sentencing_distributions.
  // Pre-2026-04-21 values here were transposed (drug-trafficking→17/Immigration
  // instead of 10/Drug Trafficking, etc.) — the fix replaced the hand-coded
  // occurrence-count labels with codebook-verified mappings.

  it("maps drug offenses to codebook-correct offguide codes", () => {
    expect(chargeTypeToOffguide("drug-trafficking")).toBe("10");
    expect(chargeTypeToOffguide("drug-possession")).toBe("9");
    expect(chargeTypeToOffguide("drug")).toBe("10");
  });

  it("maps violence offenses", () => {
    // Murder has no direct code (federal murder is a capital/separately-coded
    // offense); callers widen.
    expect(chargeTypeToOffguide("murder")).toBeNull();
    expect(chargeTypeToOffguide("manslaughter")).toBe("20");
    expect(chargeTypeToOffguide("assault")).toBe("4");
    expect(chargeTypeToOffguide("domestic-violence")).toBe("4");
    expect(chargeTypeToOffguide("robbery")).toBe("26");
    // Kidnapping has no direct code in the current taxonomy — widen.
    expect(chargeTypeToOffguide("kidnapping")).toBeNull();
  });

  it("maps white-collar / fraud to code 16 (Fraud/Theft/Embez)", () => {
    expect(chargeTypeToOffguide("white-collar")).toBe("16");
    expect(chargeTypeToOffguide("fraud")).toBe("16");
    expect(chargeTypeToOffguide("theft")).toBe("16");
  });

  it("maps firearms to code 13 + sex offenses to codebook-correct codes", () => {
    expect(chargeTypeToOffguide("weapons")).toBe("13");
    expect(chargeTypeToOffguide("firearms")).toBe("13");
    // Sex Abuse = code 27 (not 26 which is Robbery).
    expect(chargeTypeToOffguide("sex-offense-contact")).toBe("27");
    expect(chargeTypeToOffguide("sex-offense")).toBe("27");
    // Digital sex offense → code 7 (Child Pornography).
    expect(chargeTypeToOffguide("sex-offense-digital")).toBe("7");
  });

  it("returns null for DUI (state offense, no federal mapping)", () => {
    expect(chargeTypeToOffguide("dui")).toBeNull();
    expect(chargeTypeToOffguide("dui-first")).toBeNull();
    expect(chargeTypeToOffguide("dui-repeat")).toBeNull();
  });

  it("returns null for unmapped / ambiguous slugs", () => {
    // No confident federal mapping for these — widen rather than guess.
    expect(chargeTypeToOffguide("arson")).toBeNull();
    expect(chargeTypeToOffguide("burglary")).toBeNull();
    expect(chargeTypeToOffguide("hit-and-run")).toBeNull();
    expect(chargeTypeToOffguide("other")).toBeNull();
    expect(chargeTypeToOffguide("federal")).toBeNull();
    expect(chargeTypeToOffguide("unknown-slug")).toBeNull();
    expect(chargeTypeToOffguide(null)).toBeNull();
    expect(chargeTypeToOffguide(undefined)).toBeNull();
    expect(chargeTypeToOffguide("")).toBeNull();
  });
});

describe("priorConvictionsToXcrhissr", () => {
  it("maps known values to xcrhissr codes", () => {
    expect(priorConvictionsToXcrhissr("none")).toBe("1");
    expect(priorConvictionsToXcrhissr("misdemeanor")).toBe("1");
    expect(priorConvictionsToXcrhissr("felony")).toBe("3");
    expect(priorConvictionsToXcrhissr("multiple")).toBe("5");
  });

  it("returns null for 'dont-know' (widen)", () => {
    expect(priorConvictionsToXcrhissr("dont-know")).toBeNull();
  });

  it("returns null for null/undefined/unknown", () => {
    expect(priorConvictionsToXcrhissr(null)).toBeNull();
    expect(priorConvictionsToXcrhissr(undefined)).toBeNull();
    expect(priorConvictionsToXcrhissr("invalid")).toBeNull();
    expect(priorConvictionsToXcrhissr("")).toBeNull();
  });
});

describe("immigrationStatusToCitizen", () => {
  it("maps IMMIGRATION_STATUS values to matview citizen codes", () => {
    expect(immigrationStatusToCitizen("citizen")).toBe("1");
    expect(immigrationStatusToCitizen("green-card")).toBe("2");
    expect(immigrationStatusToCitizen("visa")).toBe("2");
    expect(immigrationStatusToCitizen("daca")).toBe("4");
    expect(immigrationStatusToCitizen("tps")).toBe("4");
    expect(immigrationStatusToCitizen("pending-petition")).toBe("4");
    expect(immigrationStatusToCitizen("undocumented")).toBe("3");
  });

  it("returns null for 'other' + unknowns", () => {
    expect(immigrationStatusToCitizen("other")).toBeNull();
    expect(immigrationStatusToCitizen("invalid")).toBeNull();
    expect(immigrationStatusToCitizen(null)).toBeNull();
    expect(immigrationStatusToCitizen(undefined)).toBeNull();
  });
});

describe("ageBucketFromIntake", () => {
  it("passes through valid age bucket labels", () => {
    expect(ageBucketFromIntake("<25")).toBe("<25");
    expect(ageBucketFromIntake("25-34")).toBe("25-34");
    expect(ageBucketFromIntake("35-44")).toBe("35-44");
    expect(ageBucketFromIntake("45-54")).toBe("45-54");
    expect(ageBucketFromIntake("55+")).toBe("55+");
  });

  it("returns null for prefer-not-to-say + unknowns", () => {
    expect(ageBucketFromIntake("prefer-not-to-say")).toBeNull();
    expect(ageBucketFromIntake(null)).toBeNull();
    expect(ageBucketFromIntake(undefined)).toBeNull();
    expect(ageBucketFromIntake("")).toBeNull();
    expect(ageBucketFromIntake("invalid-label")).toBeNull();
  });
});

describe("AGE_BUCKET_OPTIONS", () => {
  it("matches matview labels 1:1 + prefer-not-to-say", () => {
    expect(AGE_BUCKET_OPTIONS.map((o) => o.value)).toEqual([
      "<25", "25-34", "35-44", "45-54", "55+", "prefer-not-to-say",
    ]);
  });
});

describe("mapIntakeToBucket", () => {
  it("produces full bucket when all fields supplied and mapped", () => {
    const result = mapIntakeToBucket({
      chargeType: "drug-trafficking",
      priorConvictions: "none",
      citizenship: "citizen",
      ageBucket: "25-34",
      district: "42",
    });
    expect(result.offguide).toBe("10");
    expect(result.xcrhissr).toBe("1");
    expect(result.citizen).toBe("1");
    expect(result.age_bucket).toBe("25-34");
    expect(result.district).toBe("42");
    expect(result.has_minimum_signal).toBe(true);
  });

  it("has_minimum_signal=false when offguide cannot map", () => {
    const result = mapIntakeToBucket({
      chargeType: "dui",
      priorConvictions: "none",
      citizenship: "citizen",
      ageBucket: "25-34",
    });
    expect(result.offguide).toBeNull();
    expect(result.has_minimum_signal).toBe(false);
  });

  it("has_minimum_signal=false when xcrhissr cannot map", () => {
    const result = mapIntakeToBucket({
      chargeType: "drug-trafficking",
      priorConvictions: "dont-know",
      citizenship: "citizen",
    });
    expect(result.xcrhissr).toBeNull();
    expect(result.has_minimum_signal).toBe(false);
  });

  it("has_minimum_signal=true when offguide+xcrhissr mapped, others null", () => {
    const result = mapIntakeToBucket({
      chargeType: "drug-trafficking",
      priorConvictions: "felony",
    });
    expect(result.offguide).toBe("10");
    expect(result.xcrhissr).toBe("3");
    expect(result.citizen).toBeNull();
    expect(result.age_bucket).toBeNull();
    expect(result.district).toBeNull();
    expect(result.has_minimum_signal).toBe(true);
  });

  it("handles completely empty intake", () => {
    const result = mapIntakeToBucket({});
    expect(result.offguide).toBeNull();
    expect(result.xcrhissr).toBeNull();
    expect(result.citizen).toBeNull();
    expect(result.age_bucket).toBeNull();
    expect(result.district).toBeNull();
    expect(result.has_minimum_signal).toBe(false);
  });

  it("ignores empty-string district", () => {
    const result = mapIntakeToBucket({
      chargeType: "drug-trafficking",
      priorConvictions: "none",
      district: "",
    });
    expect(result.district).toBeNull();
  });
});
