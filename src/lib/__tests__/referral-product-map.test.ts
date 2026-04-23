import { describe, it, expect } from "vitest";
import { resolveReferralProduct, REFERRAL_PRODUCT_MAP } from "../referral-product-map";

describe("resolveReferralProduct", () => {
  it("resolves every REFERRAL_PRODUCT_MAP key to its mapped slug", () => {
    for (const [slug, expected] of Object.entries(REFERRAL_PRODUCT_MAP)) {
      expect(resolveReferralProduct(slug)).toBe(expected);
    }
  });

  it("is case-insensitive on input", () => {
    expect(resolveReferralProduct("X-RAY")).toBe("x-ray");
    expect(resolveReferralProduct("Case-Decoder")).toBe("case-decoder");
    expect(resolveReferralProduct("DUI")).toBe("dui-first-offense");
  });

  it("returns null for unmapped slug", () => {
    expect(resolveReferralProduct("unknown-product")).toBeNull();
    expect(resolveReferralProduct("")).toBeNull();
  });
});
