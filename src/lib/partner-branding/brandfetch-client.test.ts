import { describe, it, expect } from "vitest";
import { normalizeDomain, buildLogoUrls } from "./brandfetch-client";

describe("normalizeDomain", () => {
  it("strips protocol + www + path + query", () => {
    expect(normalizeDomain("https://www.example.com/path?x=1")).toBe("example.com");
    expect(normalizeDomain("http://sub.example.co.uk/")).toBe("sub.example.co.uk");
  });
  it("lowercases + trims", () => {
    expect(normalizeDomain("  EXAMPLE.COM ")).toBe("example.com");
  });
  it("returns null on invalid input", () => {
    expect(normalizeDomain(null)).toBeNull();
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("no-dot-here")).toBeNull();
    expect(normalizeDomain("bad chars!")).toBeNull();
  });
});

describe("buildLogoUrls", () => {
  it("constructs cdn.brandfetch.io URLs", () => {
    const urls = buildLogoUrls("example.com");
    expect(urls.pngUrl).toContain("https://cdn.brandfetch.io/example.com");
    expect(urls.iconUrl).toContain("https://cdn.brandfetch.io/example.com/icon");
    expect(urls.symbolUrl).toContain("https://cdn.brandfetch.io/example.com/symbol");
    expect(urls.domain).toBe("example.com");
  });
});
