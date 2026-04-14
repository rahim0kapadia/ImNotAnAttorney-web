// tests/sms.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("sendSMS", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    vi.stubEnv("TELNYX_API_KEY", "test-key");
    vi.stubEnv("TELNYX_FROM_NUMBER", "+15551230000");
  });

  it("returns not configured when env vars missing", async () => {
    vi.stubEnv("TELNYX_API_KEY", "");
    vi.stubEnv("TELNYX_FROM_NUMBER", "");
    const { sendSMS } = await import("@/lib/sms");
    const result = await sendSMS("+15551234567", "test");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not configured");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends correct request to Telnyx API", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: { id: "msg-1" } }) });
    const { sendSMS } = await import("@/lib/sms");
    const result = await sendSMS("+15551234567", "Hello world");
    expect(result.success).toBe(true);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.telnyx.com/v2/messages");
    expect(opts.headers["Authorization"]).toBe("Bearer test-key");
    const body = JSON.parse(opts.body);
    expect(body.to).toBe("+15551234567");
    expect(body.from).toBe("+15551230000");
    expect(body.text).toBe("Hello world");
  });

  it("returns error on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ errors: [{ detail: "Invalid phone" }] }) });
    const { sendSMS } = await import("@/lib/sms");
    const result = await sendSMS("+1bad", "test");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid phone");
  });

  it("returns error on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network timeout"));
    const { sendSMS } = await import("@/lib/sms");
    const result = await sendSMS("+15551234567", "test");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Network timeout");
  });
});

describe("capSMS", () => {
  it("returns text unchanged if under limit", async () => {
    const { capSMS } = await import("@/lib/sms");
    expect(capSMS("short")).toBe("short");
  });

  it("truncates and appends ... at 160 chars", async () => {
    const { capSMS } = await import("@/lib/sms");
    const long = "x".repeat(200);
    const result = capSMS(long);
    expect(result.length).toBe(160);
    expect(result.endsWith("...")).toBe(true);
  });
});
