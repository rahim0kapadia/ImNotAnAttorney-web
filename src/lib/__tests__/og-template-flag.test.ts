/**
 * og-template flag test — verifies that `renderOgImage` short-circuits to a
 * 1x1 transparent PNG when `GENERATE_OG_IMAGES !== "1"`. Keeps `next build`
 * from triggering the heavy vips rasterization path on resource-tight pre-push
 * hooks / CI contexts. See issue #49.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderOgImage, OG_CONTENT_TYPE } from "../og-template";

const FLAG = "GENERATE_OG_IMAGES";

describe("renderOgImage — GENERATE_OG_IMAGES gate", () => {
  const original = process.env[FLAG];

  beforeEach(() => {
    delete process.env[FLAG];
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = original;
    }
  });

  it("returns a tiny PNG Response when the flag is unset", async () => {
    const res = await renderOgImage({ title: "ignored" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(OG_CONTENT_TYPE);
    const body = await res.arrayBuffer();
    // 1x1 transparent PNG is ~67 bytes. Full OG image is >= 40 KB. Anything
    // under 1 KB proves the heavy render path was NOT taken.
    expect(body.byteLength).toBeLessThan(1024);
    // PNG magic: 89 50 4E 47 0D 0A 1A 0A
    const bytes = new Uint8Array(body);
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x4e);
    expect(bytes[3]).toBe(0x47);
  });

  it("returns a tiny PNG when the flag is set to anything other than '1'", async () => {
    process.env[FLAG] = "0";
    const res1 = await renderOgImage({ title: "ignored" });
    expect((await res1.arrayBuffer()).byteLength).toBeLessThan(1024);

    process.env[FLAG] = "true";
    const res2 = await renderOgImage({ title: "ignored" });
    expect((await res2.arrayBuffer()).byteLength).toBeLessThan(1024);

    process.env[FLAG] = "yes";
    const res3 = await renderOgImage({ title: "ignored" });
    expect((await res3.arrayBuffer()).byteLength).toBeLessThan(1024);
  });

  it("sets a short cache-control so prod rebuild replaces the placeholder quickly", async () => {
    const res = await renderOgImage({ title: "ignored" });
    const cc = res.headers.get("cache-control") || "";
    expect(cc).toContain("max-age=60");
  });

  // Note: no positive-case test for flag=1 because that path invokes vips
  // via `next/og` -> satori -> @resvg/resvg-js, which is exactly what we
  // want to avoid triggering in the test runner. The production Vercel
  // build covers that path end-to-end.
});
