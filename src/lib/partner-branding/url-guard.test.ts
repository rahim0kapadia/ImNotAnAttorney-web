import { describe, it, expect } from "vitest";
import { validateWebsiteUrl, validateLogoUrl } from "./url-guard";

describe("validateWebsiteUrl", () => {
  it("accepts public http(s) URLs", () => {
    expect(validateWebsiteUrl("https://example.com").ok).toBe(true);
    expect(validateWebsiteUrl("http://example.com").ok).toBe(true);
  });
  it("rejects private IPv4 ranges (dotted decimal)", () => {
    expect(validateWebsiteUrl("http://10.0.0.1/").ok).toBe(false);
    expect(validateWebsiteUrl("http://127.0.0.1/").ok).toBe(false);
    expect(validateWebsiteUrl("http://169.254.169.254/latest/meta-data/").ok).toBe(false);
    expect(validateWebsiteUrl("http://192.168.1.1/").ok).toBe(false);
    expect(validateWebsiteUrl("http://172.16.5.3/").ok).toBe(false);
    expect(validateWebsiteUrl("http://100.64.0.1/").ok).toBe(false);
    expect(validateWebsiteUrl("http://0.0.0.0/").ok).toBe(false);
  });
  it("rejects reserved / multicast / TEST-NET", () => {
    expect(validateWebsiteUrl("http://224.0.0.1/").ok).toBe(false);
    expect(validateWebsiteUrl("http://240.0.0.1/").ok).toBe(false);
    expect(validateWebsiteUrl("http://192.0.2.1/").ok).toBe(false);
    expect(validateWebsiteUrl("http://198.51.100.1/").ok).toBe(false);
    expect(validateWebsiteUrl("http://203.0.113.1/").ok).toBe(false);
    expect(validateWebsiteUrl("http://198.18.0.1/").ok).toBe(false);
  });
  it("rejects alternate IPv4 literal forms (hex / octal / decimal / short)", () => {
    // Decimal form of 127.0.0.1
    expect(validateWebsiteUrl("http://2130706433/").ok).toBe(false);
    // Hex form of 127.0.0.1
    expect(validateWebsiteUrl("http://0x7f000001/").ok).toBe(false);
    // Octal-prefixed dotted form
    expect(validateWebsiteUrl("http://0177.0.0.1/").ok).toBe(false);
    // Short dotted form 127.1 (= 127.0.0.1)
    expect(validateWebsiteUrl("http://127.1/").ok).toBe(false);
  });
  it("rejects IPv6 loopback + ULA + link-local (including bracketed)", () => {
    expect(validateWebsiteUrl("http://[::1]/").ok).toBe(false);
    expect(validateWebsiteUrl("http://[fd00::1]/").ok).toBe(false);
    expect(validateWebsiteUrl("http://[fe80::1]/").ok).toBe(false);
    expect(validateWebsiteUrl("http://[fc00::1]/").ok).toBe(false);
  });
  it("rejects IPv4-mapped IPv6 (::ffff:127.0.0.1 variants)", () => {
    expect(validateWebsiteUrl("http://[::ffff:127.0.0.1]/").ok).toBe(false);
    expect(validateWebsiteUrl("http://[::127.0.0.1]/").ok).toBe(false);
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
  it("rejects numeric IPv4 bypass forms", () => {
    expect(validateLogoUrl("https://2130706433/logo.png").ok).toBe(false);
    expect(validateLogoUrl("https://0x7f000001/logo.png").ok).toBe(false);
  });
  it("rejects bracketed IPv6 loopback + ULA", () => {
    expect(validateLogoUrl("https://[::1]/logo.png").ok).toBe(false);
    expect(validateLogoUrl("https://[fd00::1]/logo.png").ok).toBe(false);
  });
});
