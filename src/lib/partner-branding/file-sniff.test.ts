import { describe, it, expect } from "vitest";
import { sniffImageType, mimeForSniffed, extForSniffed } from "./file-sniff";

describe("sniffImageType", () => {
  it("detects PNG magic bytes", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(sniffImageType(png)).toBe("png");
  });
  it("detects JPEG magic bytes", () => {
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(sniffImageType(jpg)).toBe("jpeg");
  });
  it("detects WEBP magic bytes", () => {
    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x00,
    ]);
    expect(sniffImageType(webp)).toBe("webp");
  });
  it("rejects SVG (text content)", () => {
    const svg = new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
    expect(sniffImageType(svg)).toBeNull();
  });
  it("rejects HTML masquerading as image", () => {
    const html = new Uint8Array(Buffer.from("<!DOCTYPE html><html>"));
    expect(sniffImageType(html)).toBeNull();
  });
  it("rejects empty input", () => {
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
  });
});

describe("mimeForSniffed / extForSniffed", () => {
  it("maps sniffed kinds back to MIME + extension", () => {
    expect(mimeForSniffed("png")).toBe("image/png");
    expect(mimeForSniffed("jpeg")).toBe("image/jpeg");
    expect(mimeForSniffed("webp")).toBe("image/webp");
    expect(mimeForSniffed(null)).toBeNull();
    expect(extForSniffed("png")).toBe("png");
    expect(extForSniffed("jpeg")).toBe("jpg");
    expect(extForSniffed("webp")).toBe("webp");
    expect(extForSniffed(null)).toBeNull();
  });
});
