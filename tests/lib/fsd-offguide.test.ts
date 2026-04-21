/**
 * Unit tests for src/lib/fsd-offguide.ts — chargeType → USSC offguide_code
 * mapping for FSD. Source of truth is USSC's offguide_label column in the
 * federal_sentencing_distributions table.
 */
import { describe, it, expect } from "vitest";
import {
  chargeTypeToFsdOffguide,
  priorsToChCategory,
} from "@/lib/fsd-offguide";

describe("chargeTypeToFsdOffguide", () => {
  it("maps drug offenses to the correct FSD codes (not the stale matview ones)", () => {
    // Source of truth: offguide_code=10 is Drug Trafficking, 9 is Drug Possession.
    expect(chargeTypeToFsdOffguide("drug-trafficking")).toBe(10);
    expect(chargeTypeToFsdOffguide("drug-possession")).toBe(9);
    expect(chargeTypeToFsdOffguide("drug")).toBe(10);
  });

  it("maps white-collar / fraud to code 16 (Fraud/Theft/Embezzlement)", () => {
    expect(chargeTypeToFsdOffguide("white-collar")).toBe(16);
    expect(chargeTypeToFsdOffguide("fraud")).toBe(16);
    expect(chargeTypeToFsdOffguide("theft")).toBe(16);
  });

  it("maps firearms/weapons to code 13 (Firearms) — NOT 16", () => {
    expect(chargeTypeToFsdOffguide("weapons")).toBe(13);
    expect(chargeTypeToFsdOffguide("firearms")).toBe(13);
  });

  it("maps sex-offense to code 27 (Sex Abuse) — not 26 (which is Robbery)", () => {
    expect(chargeTypeToFsdOffguide("sex-offense")).toBe(27);
    expect(chargeTypeToFsdOffguide("sex-offense-contact")).toBe(27);
    expect(chargeTypeToFsdOffguide("sex-offense-digital")).toBe(7); // Child Porn
    expect(chargeTypeToFsdOffguide("child-abuse")).toBe(27);
  });

  it("maps violence-adjacent slugs", () => {
    expect(chargeTypeToFsdOffguide("assault")).toBe(4);
    expect(chargeTypeToFsdOffguide("domestic-violence")).toBe(4);
    expect(chargeTypeToFsdOffguide("robbery")).toBe(26);
    expect(chargeTypeToFsdOffguide("manslaughter")).toBe(20);
  });

  it("returns null for slugs without a confident federal mapping", () => {
    expect(chargeTypeToFsdOffguide("murder")).toBeNull();
    expect(chargeTypeToFsdOffguide("kidnapping")).toBeNull();
    expect(chargeTypeToFsdOffguide("arson")).toBeNull();
    expect(chargeTypeToFsdOffguide("burglary")).toBeNull();
    expect(chargeTypeToFsdOffguide("dui")).toBeNull();
    expect(chargeTypeToFsdOffguide("dui-first")).toBeNull();
    expect(chargeTypeToFsdOffguide("other")).toBeNull();
    expect(chargeTypeToFsdOffguide("federal")).toBeNull();
  });

  it("returns null for null / undefined / empty / unknown slugs", () => {
    expect(chargeTypeToFsdOffguide(null)).toBeNull();
    expect(chargeTypeToFsdOffguide(undefined)).toBeNull();
    expect(chargeTypeToFsdOffguide("")).toBeNull();
    expect(chargeTypeToFsdOffguide("entirely-made-up-slug")).toBeNull();
  });
});

describe("priorsToChCategory", () => {
  it("maps known priors values to USSC categories", () => {
    expect(priorsToChCategory("none")).toBe("1");
    expect(priorsToChCategory("misdemeanor")).toBe("1");
    expect(priorsToChCategory("felony")).toBe("3");
    expect(priorsToChCategory("multiple")).toBe("5");
  });

  it("returns null for 'dont-know' (widen in matview)", () => {
    expect(priorsToChCategory("dont-know")).toBeNull();
  });

  it("returns null for unknown / empty inputs", () => {
    expect(priorsToChCategory(null)).toBeNull();
    expect(priorsToChCategory(undefined)).toBeNull();
    expect(priorsToChCategory("")).toBeNull();
    expect(priorsToChCategory("invalid-slug")).toBeNull();
  });
});
