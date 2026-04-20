import { describe, it, expect } from "vitest";
import { extractCandidates, extractThemeColor } from "./website-scraper";

describe("extractCandidates", () => {
  const BASE = "https://acmebailbonds.com";

  it("picks up JSON-LD Organization logo (string form)", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {"@context":"https://schema.org","@type":"Organization","logo":"/brand/logo.png"}
        </script>
      </head></html>`;
    const c = extractCandidates(html, BASE);
    expect(c.some((x) => x.url === `${BASE}/brand/logo.png` && x.source === "jsonld")).toBe(true);
  });

  it("picks up JSON-LD Organization logo (object form with url)", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {"@type":"LocalBusiness","logo":{"@type":"ImageObject","url":"https://cdn.example.com/lb.png"}}
        </script>
      </head></html>`;
    const c = extractCandidates(html, BASE);
    expect(c.some((x) => x.url === "https://cdn.example.com/lb.png" && x.source === "jsonld")).toBe(true);
  });

  it("picks up og:image", () => {
    const html = `<html><head>
      <meta property="og:image" content="/share.png"/>
    </head></html>`;
    const c = extractCandidates(html, BASE);
    expect(c.some((x) => x.url === `${BASE}/share.png` && x.source === "og:image")).toBe(true);
  });

  it("picks up apple-touch-icon", () => {
    const html = `<html><head>
      <link rel="apple-touch-icon" href="/apple-icon-180.png"/>
    </head></html>`;
    const c = extractCandidates(html, BASE);
    expect(c.some((x) => x.url === `${BASE}/apple-icon-180.png` && x.source === "apple-touch-icon")).toBe(true);
  });

  it("picks up rel=icon favicon", () => {
    const html = `<html><head>
      <link rel="icon" href="/favicon.ico"/>
      <link rel="shortcut icon" href="/favicon.png"/>
    </head></html>`;
    const c = extractCandidates(html, BASE);
    expect(c.some((x) => x.url === `${BASE}/favicon.ico` && x.source === "icon")).toBe(true);
    expect(c.some((x) => x.url === `${BASE}/favicon.png` && x.source === "icon")).toBe(true);
  });

  it("resolves relative URLs against base", () => {
    const html = `<html><head>
      <meta property="og:image" content="brand/social.jpg"/>
    </head></html>`;
    const c = extractCandidates(html, BASE);
    expect(c[0]?.url).toBe(`${BASE}/brand/social.jpg`);
  });

  it("ignores malformed JSON-LD instead of throwing", () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"Organization","logo":...bad</script>
      <meta property="og:image" content="/ok.png"/>
    </head></html>`;
    const c = extractCandidates(html, BASE);
    expect(c.some((x) => x.source === "og:image")).toBe(true);
  });

  it("handles completely empty head", () => {
    const c = extractCandidates("<html><head></head><body></body></html>", BASE);
    expect(c).toHaveLength(0);
  });
});

describe("extractThemeColor", () => {
  it("accepts a valid #RRGGBB theme-color", () => {
    const c = extractThemeColor(`<html><head><meta name="theme-color" content="#1a73e8"/></head></html>`);
    expect(c).toBe("#1A73E8");
  });
  it("accepts msapplication-TileColor as fallback", () => {
    const c = extractThemeColor(`<html><head><meta name="msapplication-TileColor" content="#0F766E"/></head></html>`);
    expect(c).toBe("#0F766E");
  });
  it("rejects 3-digit hex (not our supported form)", () => {
    const c = extractThemeColor(`<html><head><meta name="theme-color" content="#f00"/></head></html>`);
    expect(c).toBeNull();
  });
  it("rejects named colors", () => {
    const c = extractThemeColor(`<html><head><meta name="theme-color" content="red"/></head></html>`);
    expect(c).toBeNull();
  });
  it("returns null when meta absent", () => {
    const c = extractThemeColor(`<html><head></head></html>`);
    expect(c).toBeNull();
  });
});
