import { describe, it, expect } from "vitest";
import { isValidPromoCode, PROMO_CODE_REGEX } from "../promo-code";

describe("isValidPromoCode", () => {
  it("accepts alphanumeric 2-20 chars (case-insensitive)", () => {
    expect(isValidPromoCode("ab")).toBe(true);
    expect(isValidPromoCode("BAIL123")).toBe(true);
    expect(isValidPromoCode("ABCDEFGHIJ1234567890")).toBe(true); // 20
  });

  it("rejects too short / too long / punctuation", () => {
    expect(isValidPromoCode("a")).toBe(false);
    expect(isValidPromoCode("ABCDEFGHIJ12345678901")).toBe(false); // 21
    expect(isValidPromoCode("BAIL-123")).toBe(false);
    expect(isValidPromoCode("BAIL 123")).toBe(false);
  });

  it("is a type guard — rejects non-string input without throwing", () => {
    expect(isValidPromoCode(null as unknown)).toBe(false);
    expect(isValidPromoCode(undefined as unknown)).toBe(false);
    expect(isValidPromoCode(123 as unknown)).toBe(false);
    expect(isValidPromoCode({} as unknown)).toBe(false);
  });

  it("PROMO_CODE_REGEX matches the same shape the guard asserts", () => {
    expect(PROMO_CODE_REGEX.test("AB")).toBe(true);
    expect(PROMO_CODE_REGEX.test("a")).toBe(false);
  });
});
