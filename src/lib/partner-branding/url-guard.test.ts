import { describe, it, expect } from "vitest";
import { validateWebsiteUrl, validateLogoUrl } from "./url-guard";

describe("validateWebsiteUrl", () => {
  it("accepts public http(s) URLs", () => {
    expect(validateWebsiteUrl("https://example.com").ok).toBe(true);
    expect(validateWebsiteUrl("http://example.com").ok).toBe(true);
  });
  it("rejects private IPv4 ranges", () => {
    expect(validateWebsiteUrl("http://10.0.0.1/").ok).toBe(false);
    expect(validateWebsiteUrl("http://127.0.0.1/").ok).toBe(false);
    expect(validateWebsiteUrl("http://169.254.169.254/latest/meta-data/").ok).toBe(false);
    expect(validateWebsiteUrl("http://192.168.1.1/").ok).toBe(false);
    expect(validateWebsiteUrl("http://172.16.5.3/").ok).toBe(false);
  });
  it("rejects localhost + metadata hosts", () => {
    expect(validateWebsiteUrl("http://localhost/").ok).toBe(false);
    expect(validateWebsiteUrl("http://metadata.google.internal/").ok).toBe(false);
  });
  it("rejects userinfo tricks", () => {
    expect(validateWebsiteUrl("http://user@evil.com").ok).toBe(false);
    expect(validateWebsiteUrl("http://user:pass@example.com").ok).toBe(false);
  });
  it("rejects non-http schemes", () => {
    expect(validateWebsiteUrl("javascript:alert(1)").ok).toBe(false);
    expect(validateWebsiteUrl("file:///etc/passwd").ok).toBe(false);
    expect(validateWebsiteUrl("ftp://example.com").ok).toBe(false);
  });
  it("rejects malformed URLs", () => {
    expect(validateWebsiteUrl("not-a-url").ok).toBe(false);
    expect(validateWebsiteUrl("").ok).toBe(false);
  });
});

describe("validateLogoUrl", () => {
  it("rejects http (https-only)", () => {
    expect(validateLogoUrl("http://cdn.brandfetch.io/example.com").ok).toBe(false);
  });
  it("accepts cdn.brandfetch.io over https", () => {
    expect(validateLogoUrl("https://cdn.brandfetch.io/example.com").ok).toBe(true);
  });
  it("rejects arbitrary public hosts", () => {
    expect(validateLogoUrl("https://random-cdn.example.com/logo.png").ok).toBe(false);
  });
  it("rejects private IPs even on https", () => {
    expect(validateLogoUrl("https://127.0.0.1/logo.png").ok).toBe(false);
    expect(validateLogoUrl("https://169.254.169.254/logo.png").ok).toBe(false);
  });
});
