import { describe, it, expect } from "vitest";
import { extractWebsiteColors, rankAndFilter } from "./color-extractor";

describe("rankAndFilter", () => {
  it("ranks by frequency", async () => {
    const r = rankAndFilter([
      "#F59E0B", "#F59E0B", "#F59E0B",
      "#3B82F6", "#3B82F6",
      "#FF0000",
    ]);
    expect(r[0]).toBe("#F59E0B");
    expect(r[1]).toBe("#3B82F6");
    expect(r[2]).toBe("#FF0000");
  });

  it("filters out near-grayscale (low saturation)", async () => {
    const r = rankAndFilter(["#777777", "#FFFFFF", "#C0C0C0"]);
    expect(r).toHaveLength(0);
  });

  it("filters out too-dark colors (fail AA vs black)", async () => {
    const r = rankAndFilter(["#1a1a1a", "#0a0a0a", "#333333"]);
    expect(r).toHaveLength(0);
  });

  it("filters out near-white (luminance > 0.95)", async () => {
    const r = rankAndFilter(["#FFFFFF", "#FEFEFE"]);
    expect(r).toHaveLength(0);
  });

  it("caps output at 8 colors", async () => {
    const bucket = [
      "#F59E0B", "#E87A1C", "#3B82F6", "#10B981", "#8B5CF6",
      "#EC4899", "#F43F5E", "#14B8A6", "#6366F1", "#F97316",
    ];
    const r = rankAndFilter(bucket);
    expect(r.length).toBeLessThanOrEqual(8);
  });
});

describe("extractWebsiteColors (HTML only — no stylesheet fetch)", () => {
  const BASE = "https://acmebailbonds.com";

  it("extracts theme-color meta", async () => {
    const html = `<html><head>
      <meta name="theme-color" content="#F59E0B">
    </head><body></body></html>`;
    const r = await extractWebsiteColors(html, BASE);
    expect(r).toContain("#F59E0B");
  });

  it("extracts hex colors from inline <style>", async () => {
    const html = `<html><head>
      <style>
        .hero { background: #F59E0B; color: #3B82F6; }
        .cta { border-color: #3B82F6; }
      </style>
    </head><body></body></html>`;
    const r = await extractWebsiteColors(html, BASE);
    expect(r).toEqual(expect.arrayContaining(["#F59E0B", "#3B82F6", "#3B82F6"]));
  });

  it("expands 3-digit hex to 6-digit", async () => {
    const html = `<style>a{color:#f00}</style>`;
    const r = await extractWebsiteColors(html, BASE);
    expect(r).toContain("#FF0000");
  });

  it("extracts hexes from inline style='' attributes", async () => {
    const html = `<div style="background-color: #F59E0B; color: #3B82F6"></div>`;
    const r = await extractWebsiteColors(html, BASE);
    expect(r).toEqual(expect.arrayContaining(["#F59E0B", "#3B82F6"]));
  });

  it("extracts hexes from data-color attrs", async () => {
    const html = `<div data-brand-color="#F59E0B"></div>`;
    const r = await extractWebsiteColors(html, BASE);
    expect(r).toContain("#F59E0B");
  });

  it("de-duplicates colors across sources", async () => {
    const html = `
      <meta name="theme-color" content="#F59E0B">
      <style>.hero { background: #F59E0B; }</style>
      <div style="color:#F59E0B"></div>`;
    const r = await extractWebsiteColors(html, BASE);
    const count = r.filter((c) => c === "#F59E0B").length;
    expect(count).toBe(1);
  });

  it("returns empty array on HTML with no brand colors", async () => {
    const html = `<html><head></head><body><p>hello</p></body></html>`;
    const r = await extractWebsiteColors(html, BASE);
    expect(r).toEqual([]);
  });

  it("ignores color-like strings inside URLs / ids", async () => {
    // Hex-like strings NOT preceded by # should not match.
    const html = `<style>a[href*="FF0000"]{color:red}</style>`;
    const r = await extractWebsiteColors(html, BASE);
    expect(r).not.toContain("#FF0000");
  });

  it("is case-insensitive on hex input, returns uppercase", async () => {
    const html = `<style>a{color:#f59e0b;background:#EC4899}</style>`;
    const r = await extractWebsiteColors(html, BASE);
    expect(r).toContain("#F59E0B");
    expect(r).toContain("#EC4899");
  });
});
