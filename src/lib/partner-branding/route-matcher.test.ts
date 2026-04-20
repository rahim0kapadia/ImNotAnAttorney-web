import { describe, it, expect } from "vitest";
import { isPartnerBrandedRoute } from "./route-matcher";

describe("isPartnerBrandedRoute", () => {
  it("matches /r/[code] and /r/[code]/reminders", () => {
    expect(isPartnerBrandedRoute("/r/TESTCODE")).toBe(true);
    expect(isPartnerBrandedRoute("/r/TESTCODE/reminders")).toBe(true);
  });
  it("matches 2-char promo codes (canonical shape)", () => {
    expect(isPartnerBrandedRoute("/r/FL")).toBe(true);
    expect(isPartnerBrandedRoute("/r/AA/reminders")).toBe(true);
  });
  it("accepts lowercase codes (PROMO_CODE_REGEX is case-insensitive)", () => {
    expect(isPartnerBrandedRoute("/r/testcode")).toBe(true);
  });
  it("does NOT match quiz or product subpaths", () => {
    expect(isPartnerBrandedRoute("/r/TESTCODE/quiz")).toBe(false);
    expect(isPartnerBrandedRoute("/r/TESTCODE/dui-first-offense")).toBe(false);
  });
  it("does NOT match the /r/q redirect", () => {
    expect(isPartnerBrandedRoute("/r/q/abc123")).toBe(false);
  });
  it("does NOT match 1-char codes or 21+-char codes", () => {
    expect(isPartnerBrandedRoute("/r/A")).toBe(false);
    expect(isPartnerBrandedRoute("/r/AAAAAAAAAAAAAAAAAAAAA")).toBe(false);
  });
  it("does NOT match codes with hyphens or underscores", () => {
    expect(isPartnerBrandedRoute("/r/TEST-CODE")).toBe(false);
    expect(isPartnerBrandedRoute("/r/TEST_CODE")).toBe(false);
  });
  it("does NOT match unrelated paths", () => {
    expect(isPartnerBrandedRoute("/")).toBe(false);
    expect(isPartnerBrandedRoute("/score")).toBe(false);
    expect(isPartnerBrandedRoute("/checkout")).toBe(false);
    expect(isPartnerBrandedRoute("/partner/dashboard")).toBe(false);
  });
  it("handles null/undefined pathname", () => {
    expect(isPartnerBrandedRoute(null)).toBe(false);
    expect(isPartnerBrandedRoute(undefined)).toBe(false);
    expect(isPartnerBrandedRoute("")).toBe(false);
  });
});
