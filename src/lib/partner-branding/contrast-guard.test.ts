import { describe, it, expect } from "vitest";
import {
  parseHex,
  isHexColor,
  toHex,
  contrastRatio,
  relativeLuminance,
  assertWcagAA,
  assertWcagAAA,
  bestTextColor,
  brandPassesSiteContrast,
} from "./contrast-guard";

describe("parseHex", () => {
  it("parses #RRGGBB", () => {
    expect(parseHex("#FF0000")).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseHex("#00ff00")).toEqual({ r: 0, g: 255, b: 0 });
  });
  it("rejects malformed input", () => {
    expect(parseHex("")).toBeNull();
    expect(parseHex("#F00")).toBeNull();
    expect(parseHex("FF0000")).toBeNull();
    expect(parseHex("#GGGGGG")).toBeNull();
  });
});

describe("isHexColor", () => {
  it("accepts 6-digit hex", () => {
    expect(isHexColor("#000000")).toBe(true);
    expect(isHexColor("#FfFfFf")).toBe(true);
  });
  it("rejects non-hex", () => {
    expect(isHexColor("#fff")).toBe(false);
    expect(isHexColor("red")).toBe(false);
  });
});

describe("toHex", () => {
  it("clamps and pads channels", () => {
    expect(toHex(0, 0, 0)).toBe("#000000");
    expect(toHex(255, 255, 255)).toBe("#FFFFFF");
    expect(toHex(256, -1, 128)).toBe("#FF0080");
  });
});

describe("relativeLuminance", () => {
  it("black = 0, white = 1", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 3);
  });
});

describe("contrastRatio", () => {
  it("computes WCAG ratios for known pairs", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#808080", "#808080")).toBeCloseTo(1, 2);
  });
});

describe("assertWcagAA / AAA", () => {
  it("AA threshold 4.5:1", () => {
    expect(assertWcagAA("#000000", "#FFFFFF").passes).toBe(true);
    expect(assertWcagAA("#FFFFFF", "#F0F0F0").passes).toBe(false);
  });
  it("AAA threshold 7:1", () => {
    expect(assertWcagAAA("#000000", "#FFFFFF").passes).toBe(true);
    expect(assertWcagAAA("#767676", "#FFFFFF").passes).toBe(false);
  });
});

describe("bestTextColor", () => {
  it("returns white on dark backgrounds", () => {
    expect(bestTextColor("#000000")).toBe("white");
    expect(bestTextColor("#1E3A8A")).toBe("white");
  });
  it("returns black on light backgrounds", () => {
    expect(bestTextColor("#FFFFFF")).toBe("black");
    expect(bestTextColor("#F5F5F5")).toBe("black");
  });
});

describe("brandPassesSiteContrast (AA vs #000 only)", () => {
  it("accepts INAA amber (#F59E0B on black)", () => {
    expect(brandPassesSiteContrast("#F59E0B")).toBe(true);
  });
  it("accepts pure white on black", () => {
    expect(brandPassesSiteContrast("#FFFFFF")).toBe(true);
  });
  it("rejects very dark primary on our black canvas", () => {
    expect(brandPassesSiteContrast("#1a1a1a")).toBe(false);
    expect(brandPassesSiteContrast("#333333")).toBe(false);
  });
  it("rejects pure black", () => {
    expect(brandPassesSiteContrast("#000000")).toBe(false);
  });
  it("rejects malformed hex", () => {
    expect(brandPassesSiteContrast("not-a-hex")).toBe(false);
    expect(brandPassesSiteContrast("#F00")).toBe(false);
  });
});
