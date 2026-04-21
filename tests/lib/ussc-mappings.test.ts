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
  it("maps drug offenses to matview codes", () => {
    expect(chargeTypeToOffguide("drug-trafficking")).toBe("17");
    expect(chargeTypeToOffguide("drug-possession")).toBe("22");
    expect(chargeTypeToOffguide("drug")).toBe("22");
  });

  it("maps violence offenses", () => {
    expect(chargeTypeToOffguide("murder")).toBe("1");
    expect(chargeTypeToOffguide("assault")).toBe("4");
    expect(chargeTypeToOffguide("domestic-violence")).toBe("4");
    expect(chargeTypeToOffguide("kidnapping")).toBe("3");
  });

  it("maps white-collar to fraud code", () => {
    expect(chargeTypeToOffguide("white-collar")).toBe("13");
    expect(chargeTypeToOffguide("fraud")).toBe("13");
  });

  it("maps firearms + sex offenses", () => {
    expect(chargeTypeToOffguide("weapons")).toBe("16");
    expect(chargeTypeToOffguide("sex-offense-contact")).toBe("26");
    expect(chargeTypeToOffguide("sex-offense-digital")).toBe("27");
  });

  it("returns null for DUI (state offense, no federal mapping)", () => {
    expect(chargeTypeToOffguide("dui")).toBeNull();
    expect(chargeTypeToOffguide("dui-first")).toBeNull();
    expect(chargeTypeToOffguide("dui-repeat")).toBeNull();
  });

  it("returns null for unmapped / generic slugs", () => {
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
    expect(result.offguide).toBe("17");
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
    expect(result.offguide).toBe("17");
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
