import { describe, it, expect } from "vitest";
import { isPartnerBrandedRoute } from "./route-matcher";

describe("isPartnerBrandedRoute", () => {
  it("matches /r/[code] and /r/[code]/reminders", () => {
    expect(isPartnerBrandedRoute("/r/TESTCODE")).toBe(true);
    expect(isPartnerBrandedRoute("/r/TESTCODE/reminders")).toBe(true);
  });
  it("does NOT match quiz or product subpaths", () => {
    expect(isPartnerBrandedRoute("/r/TESTCODE/quiz")).toBe(false);
    expect(isPartnerBrandedRoute("/r/TESTCODE/dui-first-offense")).toBe(false);
  });
  it("does NOT match the /r/q redirect", () => {
    expect(isPartnerBrandedRoute("/r/q/abc123")).toBe(false);
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
