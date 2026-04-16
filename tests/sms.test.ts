// tests/sms.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock Supabase admin client so sendSMS doesn't route fetch through Supabase
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }),
}));

// Mock suspension check so it doesn't query the DB
vi.mock("@/lib/sms-suspensions", () => ({
  isSmsSuspended: async () => false,
}));

describe("sendSMS", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  });

  it("returns not configured when RESEND_API_KEY missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const { sendSMS } = await import("@/lib/sms");
    const result = await sendSMS("+15551234567", "test");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not configured");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends to correct text.email gateway address", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: "email-1" }) });
    const { sendSMS } = await import("@/lib/sms");
    const result = await sendSMS("+15551234567", "Hello world");
    expect(result.success).toBe(true);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(opts.headers["Authorization"]).toBe("Bearer re_test_key");
    const body = JSON.parse(opts.body);
    expect(body.to).toEqual(["5551234567@text.email"]);
    expect(body.text).toBe("Hello world");
  });

  it("strips +1 prefix for gateway address", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: "email-2" }) });
    const { sendSMS } = await import("@/lib/sms");
    await sendSMS("+16504846374", "test");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.to).toEqual(["6504846374@text.email"]);
  });

  it("returns error on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ message: "Invalid recipient" }) });
    const { sendSMS } = await import("@/lib/sms");
    const result = await sendSMS("+15551234567", "test");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid recipient");
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
