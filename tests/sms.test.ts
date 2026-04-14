// tests/sms.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("sendSMS", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "test-token");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+15551230000");
  });

  it("returns not configured when env vars missing", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "");
    const { sendSMS } = await import("@/lib/sms");
    const result = await sendSMS("+15551234567", "test");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not configured");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends correct request to Twilio API", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ sid: "SM123" }) });
    const { sendSMS } = await import("@/lib/sms");
    const result = await sendSMS("+15551234567", "Hello world");
    expect(result.success).toBe(true);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACtest123/Messages.json");
    expect(opts.headers["Authorization"]).toMatch(/^Basic /);
    expect(opts.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(opts.body).toContain("To=%2B15551234567");
    expect(opts.body).toContain("From=%2B15551230000");
    expect(opts.body).toContain("Body=Hello+world");
  });

  it("returns error on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ message: "Invalid phone" }) });
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
