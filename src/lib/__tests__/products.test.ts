import { describe, it, expect } from "vitest";
import {
  STANDALONE_PRODUCTS,
  isValidProduct,
  getProduct,
  productsByCategory,
  type ProductSlug,
} from "../products";

describe("Standalone Product Catalog", () => {
  it("validates known product slugs", () => {
    expect(isValidProduct("good-time")).toBe(true);
    expect(isValidProduct("employment-impact")).toBe(true);
    expect(isValidProduct("nonexistent")).toBe(false);
  });

  it("returns product by slug", () => {
    const product = getProduct("good-time");
    expect(product).toBeDefined();
    expect(product!.name).toBe("Good Time Credit Calculator");
    expect(product!.category).toBe("calculator");
    expect(product!.price).toBe(0);
  });

  it("returns undefined for unknown slug", () => {
    expect(getProduct("nonexistent" as ProductSlug)).toBeUndefined();
  });

  it("filters by category", () => {
    const calculators = productsByCategory("calculator");
    expect(calculators.length).toBeGreaterThan(0);
    calculators.forEach((p) => expect(p.category).toBe("calculator"));
  });

  it("every product has required fields", () => {
    for (const [slug, product] of Object.entries(STANDALONE_PRODUCTS)) {
      expect(product.name, `${slug} missing name`).toBeTruthy();
      expect(product.category, `${slug} missing category`).toBeTruthy();
      expect(typeof product.price, `${slug} price not number`).toBe("number");
      expect(product.delivery, `${slug} missing delivery`).toBeTruthy();
      expect(product.description, `${slug} missing description`).toBeTruthy();
    }
  });

  it("paid products have stripe price ID placeholder", () => {
    for (const [slug, product] of Object.entries(STANDALONE_PRODUCTS)) {
      if (product.price > 0) {
        expect(product.stripePriceId, `${slug} missing stripePriceId`).toBeTruthy();
      }
    }
  });
});
