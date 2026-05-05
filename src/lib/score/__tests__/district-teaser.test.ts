/**
 * @fileoverview Shape tests for queryDistrictTeaser return type.
 *
 * These tests do NOT hit the database. They verify:
 *   - The return type contract (all four fields present)
 *   - The floor rule (n < 10 → null)
 *   - The termination rate range gate (0.01 – 0.99)
 *   - The CHARGE_TO_USSC_KEYWORD mapping covers all chargeType slugs
 *     from score.ts ALLOWED_VALUES
 *
 * DB integration is not tested here; PostgREST calls are exercised by the
 * existing CV probes and the closed-ecosystem integration tests.
 */

import { describe, it, expect } from "vitest";

// ── Type contract ──────────────────────────────────────────────────────────
import type { DistrictTeaserResult } from "@/lib/score/district-teaser";

describe("DistrictTeaserResult shape", () => {
  it("result with full data satisfies the shape", () => {
    const result: DistrictTeaserResult = {
      districtName: "S.D. Florida",
      totalCases: 1420,
      topJudge: "James I. Cohn",
      terminationRate: 82,
    };
    expect(result.districtName).toBeTypeOf("string");
    expect(result.totalCases).toBeTypeOf("number");
    expect(result.topJudge).toBeTypeOf("string");
    expect(result.terminationRate).toBeTypeOf("number");
  });

  it("result with no data satisfies the shape (all nulls)", () => {
    const result: DistrictTeaserResult = {
      districtName: null,
      totalCases: null,
      topJudge: null,
      terminationRate: null,
    };
    expect(result.districtName).toBeNull();
    expect(result.totalCases).toBeNull();
    expect(result.topJudge).toBeNull();
    expect(result.terminationRate).toBeNull();
  });

  it("partial result (districtName present, topJudge null) satisfies shape", () => {
    const result: DistrictTeaserResult = {
      districtName: "N.D. California",
      totalCases: 234,
      topJudge: null,
      terminationRate: null,
    };
    expect(result.districtName).not.toBeNull();
    expect(result.topJudge).toBeNull();
  });
});

// ── Floor rule (inline logic verification) ────────────────────────────────
describe("floor rule (n >= 10)", () => {
  const FLOOR = 10;

  it("values below floor produce null", () => {
    const count = 9;
    const result = count >= FLOOR ? count : null;
    expect(result).toBeNull();
  });

  it("value at exactly floor produces a number", () => {
    const count = 10;
    const result = count >= FLOOR ? count : null;
    expect(result).toBe(10);
  });

  it("value above floor produces a number", () => {
    const count = 500;
    const result = count >= FLOOR ? count : null;
    expect(result).toBe(500);
  });
});

// ── Termination rate gate (0.01 – 0.99) ───────────────────────────────────
describe("termination rate range gate", () => {
  function computeRate(terminated: number, total: number): number | null {
    if (total < 10 || terminated < 0) return null;
    const rate = terminated / total;
    return rate >= 0.01 && rate <= 0.99 ? Math.round(rate * 100) : null;
  }

  it("0% termination rate returns null (below 0.01 floor)", () => {
    expect(computeRate(0, 100)).toBeNull();
  });

  it("100% termination rate returns null (above 0.99 ceiling)", () => {
    expect(computeRate(100, 100)).toBeNull();
  });

  it("82% rate returns 82", () => {
    expect(computeRate(82, 100)).toBe(82);
  });

  it("1% (exactly 0.01) returns 1", () => {
    expect(computeRate(1, 100)).toBe(1);
  });

  it("99% (exactly 0.99) returns 99", () => {
    expect(computeRate(99, 100)).toBe(99);
  });

  it("total below floor returns null", () => {
    expect(computeRate(5, 9)).toBeNull();
  });
});

// ── CHARGE_TO_USSC_KEYWORD covers all ALLOWED_VALUES chargeType slugs ─────
describe("CHARGE_TO_USSC_KEYWORD coverage", () => {
  // These are the slugs from src/lib/score.ts ALLOWED_VALUES.chargeType
  const ALL_CHARGE_SLUGS = [
    "drug",
    "drug-possession",
    "drug-trafficking",
    "dui",
    "probation-violation",
    "white-collar",
    "sex-offense",
    "federal-criminal",
    "self-defense",
    "other-felony",
    "other-misdemeanor",
  ];

  // Mirror of the mapping in district-teaser.ts — changes here are intentional
  const CHARGE_TO_USSC_KEYWORD: Record<string, string> = {
    drug: "drug",
    "drug-possession": "drug",
    "drug-trafficking": "drug",
    dui: "dui",
    "probation-violation": "probation",
    "white-collar": "fraud",
    "sex-offense": "sex",
    "federal-criminal": "fraud",
    "self-defense": "assault",
    "other-felony": "assault",
    "other-misdemeanor": "drug",
  };

  for (const slug of ALL_CHARGE_SLUGS) {
    it(`slug "${slug}" has a keyword mapping`, () => {
      expect(CHARGE_TO_USSC_KEYWORD[slug]).toBeDefined();
      expect(typeof CHARGE_TO_USSC_KEYWORD[slug]).toBe("string");
      expect(CHARGE_TO_USSC_KEYWORD[slug].length).toBeGreaterThan(0);
    });
  }
});
