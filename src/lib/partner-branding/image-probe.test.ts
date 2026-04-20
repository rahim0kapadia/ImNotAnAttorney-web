import { describe, it, expect, vi, afterEach } from "vitest";
import { probeImageUrl } from "./image-probe";

const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function makeResponse(init: {
  status?: number;
  headers?: Record<string, string>;
  body?: Uint8Array | string | null;
}): Response {
  const { status = 200, headers = {}, body } = init;
  const h = new Headers(headers);
  const bytes = body == null
    ? null
    : body instanceof Uint8Array
      ? body
      : new TextEncoder().encode(body);
  const bodyInit: BodyInit | null = bytes === null
    ? null
    : (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return new Response(bodyInit, { status, headers: h });
}

function stubFetch(responses: Response[] | ((url: string) => Response)) {
  if (Array.isArray(responses)) {
    let i = 0;
    return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const r = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return r;
    });
  }
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (req) => responses(String(req)));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("probeImageUrl", () => {
  it("rejects http (https-only)", async () => {
    const r = await probeImageUrl("http://cdn.brandfetch.io/foo.png");
    expect(r.ok).toBe(false);
  });

  it("accepts a valid PNG with image/png Content-Type", async () => {
    stubFetch([
      makeResponse({
        status: 200,
        headers: { "content-type": "image/png" },
        body: PNG_HEADER,
      }),
    ]);
    const r = await probeImageUrl("https://cdn.brandfetch.io/good.png");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sniffed).toBe("png");
  });

  it("rejects 302 to HTML (Brandfetch missing CLIENT_ID scenario)", async () => {
    stubFetch([
      makeResponse({
        status: 302,
        headers: { location: "https://docs.brandfetch.com/docs/logo-link/guidelines" },
      }),
      makeResponse({
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
        body: "<html>hotlinking guidelines</html>",
      }),
    ]);
    const r = await probeImageUrl("https://cdn.brandfetch.io/stripe.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/text\/html/i);
  });

  it("rejects spoofed Content-Type (text bytes served as image/png)", async () => {
    stubFetch([
      makeResponse({
        status: 200,
        headers: { "content-type": "image/png" },
        body: "<html>not a png</html>",
      }),
    ]);
    const r = await probeImageUrl("https://cdn.brandfetch.io/spoof.png");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/magic bytes/i);
  });

  it("rejects 404", async () => {
    stubFetch([makeResponse({ status: 404, body: "nope" })]);
    const r = await probeImageUrl("https://cdn.brandfetch.io/missing.png");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/HTTP 404/);
  });

  it("rejects empty body", async () => {
    stubFetch([
      makeResponse({
        status: 200,
        headers: { "content-type": "image/png" },
        body: null,
      }),
    ]);
    const r = await probeImageUrl("https://cdn.brandfetch.io/empty.png");
    expect(r.ok).toBe(false);
  });

  it("rejects redirect chain that never resolves to image", async () => {
    const redir = makeResponse({
      status: 302,
      headers: { location: "https://cdn.brandfetch.io/next" },
    });
    stubFetch([redir, redir, redir, redir, redir]);
    const r = await probeImageUrl("https://cdn.brandfetch.io/loop");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/redirects|Location/i);
  });

  it("rejects userinfo smuggled in redirect target", async () => {
    stubFetch([
      makeResponse({
        status: 302,
        headers: { location: "https://user:pass@cdn.brandfetch.io/x" },
      }),
    ]);
    const r = await probeImageUrl("https://cdn.brandfetch.io/auth-bounce");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/userinfo/i);
  });

  it("rejects non-image content-type (text/plain, application/json, etc.)", async () => {
    stubFetch([
      makeResponse({
        status: 200,
        headers: { "content-type": "application/json" },
        body: '{"error":"nope"}',
      }),
    ]);
    const r = await probeImageUrl("https://cdn.brandfetch.io/api.png");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/application\/json/i);
  });
});
