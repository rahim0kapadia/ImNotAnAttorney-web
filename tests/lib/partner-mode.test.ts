/**
 * Unit tests for the pure partner-mode helpers.
 * Task 3 / v2-diffs spec — helper is env-flag-free; callers gate at call site.
 */
import { describe, it, expect } from "vitest";
import {
  computePartnerUrl,
  isCheckInMode,
  DISCOUNT_DOLLAR_ANCHOR,
  DISCOUNT_PERCENT,
} from "@/lib/partner-mode";

const SITE = "https://imnotanattorney.com";

describe("computePartnerUrl", () => {
  it("returns /checkin/{code} when check_in_enabled is true", () => {
    expect(
      computePartnerUrl({ promo_code: "BAIL123", check_in_enabled: true }, SITE),
    ).toBe("https://imnotanattorney.com/checkin/BAIL123");
  });

  it("returns /court-date/{code} when check_in_enabled is false", () => {
    expect(
      computePartnerUrl({ promo_code: "BAIL123", check_in_enabled: false }, SITE),
    ).toBe("https://imnotanattorney.com/court-date/BAIL123");
  });

  it("returns empty string when promo_code is null", () => {
    expect(
      computePartnerUrl({ promo_code: null, check_in_enabled: true }, SITE),
    ).toBe("");
  });

  it("returns empty string when promo_code is empty string", () => {
    expect(
      computePartnerUrl({ promo_code: "", check_in_enabled: false }, SITE),
    ).toBe("");
  });

  it("does not read the NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED env var", () => {
    // Helper must not branch on env flag — callers gate at call site.
    const prev = process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED;
    process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED = "false";
    try {
      expect(
        computePartnerUrl({ promo_code: "BAIL123", check_in_enabled: true }, SITE),
      ).toBe("https://imnotanattorney.com/checkin/BAIL123");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED;
      else process.env.NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED = prev;
    }
  });
});

describe("isCheckInMode", () => {
  it("returns true only for strict true", () => {
    expect(isCheckInMode({ check_in_enabled: true })).toBe(true);
  });

  it("returns false for false", () => {
    expect(isCheckInMode({ check_in_enabled: false })).toBe(false);
  });

  it("returns false for truthy-but-not-true values", () => {
    // Runtime defensive check — DB can occasionally return non-boolean truthy values.
    expect(isCheckInMode({ check_in_enabled: 1 as unknown as boolean })).toBe(false);
    expect(isCheckInMode({ check_in_enabled: "true" as unknown as boolean })).toBe(false);
  });
});

describe("discount constants", () => {
  it("exposes the 10% / $100 anchors used by partner copy", () => {
    expect(DISCOUNT_PERCENT).toBe(10);
    expect(DISCOUNT_DOLLAR_ANCHOR).toBe(100);
  });
});
