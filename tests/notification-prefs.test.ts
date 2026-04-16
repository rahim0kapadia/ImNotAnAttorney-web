// tests/notification-prefs.test.ts
import { describe, it, expect } from "vitest";
import {
  getClientPrefs,
  getPartnerPrefs,
  autoUpgradeOnPhone,
  shouldSendEmail,
  shouldSendSMS,
  validateClientPrefs,
  canSendClientSMS,
  CLIENT_DEFAULTS,
  PARTNER_DEFAULTS,
  COURT_REMINDER_SAFE_CHANNELS,
} from "@/lib/notification-prefs";

describe("getClientPrefs", () => {
  it("returns all defaults when overrides is null", () => {
    const prefs = getClientPrefs(null);
    expect(prefs).toEqual(CLIENT_DEFAULTS);
  });

  it("merges partial overrides with defaults", () => {
    const prefs = getClientPrefs({ court_reminders: "both" });
    expect(prefs.court_reminders).toBe("both");
    expect(prefs.magic_link).toBe("email");
    expect(prefs.check_in).toBe("email");
    expect(prefs.post_court).toBe("email");
  });

  it("handles empty object as overrides", () => {
    const prefs = getClientPrefs({});
    expect(prefs).toEqual(CLIENT_DEFAULTS);
  });
});

describe("getPartnerPrefs", () => {
  it("returns all defaults when overrides is null", () => {
    const prefs = getPartnerPrefs(null);
    expect(prefs).toEqual(PARTNER_DEFAULTS);
  });

  it("merges partial overrides with defaults", () => {
    const prefs = getPartnerPrefs({ payout: "sms", client_reminded: "both" });
    expect(prefs.payout).toBe("sms");
    expect(prefs.client_reminded).toBe("both");
    expect(prefs.magic_link).toBe("email");
    expect(prefs.drip).toBe("email");
  });
});

describe("autoUpgradeOnPhone", () => {
  it("upgrades court_reminders to both when currently null", () => {
    const result = autoUpgradeOnPhone(null);
    expect(result.court_reminders).toBe("both");
  });

  it("upgrades court_reminders from email to both", () => {
    const result = autoUpgradeOnPhone({ court_reminders: "email" });
    expect(result.court_reminders).toBe("both");
  });

  it("does not downgrade court_reminders if already both", () => {
    const result = autoUpgradeOnPhone({ court_reminders: "both" });
    expect(result.court_reminders).toBe("both");
  });

  it("preserves other overrides", () => {
    const result = autoUpgradeOnPhone({ magic_link: "sms" });
    expect(result.court_reminders).toBe("both");
    expect(result.magic_link).toBe("sms");
  });
});

describe("shouldSendEmail / shouldSendSMS", () => {
  it("email: true for email and both", () => {
    expect(shouldSendEmail("email")).toBe(true);
    expect(shouldSendEmail("both")).toBe(true);
    expect(shouldSendEmail("sms")).toBe(false);
  });

  it("sms: true for sms and both", () => {
    expect(shouldSendSMS("sms")).toBe(true);
    expect(shouldSendSMS("both")).toBe(true);
    expect(shouldSendSMS("email")).toBe(false);
  });
});

describe("COURT_REMINDER_SAFE_CHANNELS", () => {
  it("only allows email or both, never sms alone", () => {
    expect(COURT_REMINDER_SAFE_CHANNELS).toEqual(new Set(["email", "both"]));
  });
});

describe("validateClientPrefs", () => {
  it("rejects sms-only for court_reminders", () => {
    expect(validateClientPrefs({ court_reminders: "sms" })).toBe(false);
  });

  it("allows email or both for court_reminders", () => {
    expect(validateClientPrefs({ court_reminders: "email" })).toBe(true);
    expect(validateClientPrefs({ court_reminders: "both" })).toBe(true);
  });

  it("allows sms-only for non-court notification types", () => {
    expect(validateClientPrefs({ magic_link: "sms" })).toBe(true);
  });
});

describe("canSendClientSMS", () => {
  it("returns false without sms_consent_at", () => {
    expect(canSendClientSMS("+15551234567", null)).toBe(false);
  });

  it("returns false without phone", () => {
    expect(canSendClientSMS(null, "2026-04-14T00:00:00Z")).toBe(false);
  });

  it("returns true with both phone and consent", () => {
    expect(canSendClientSMS("+15551234567", "2026-04-14T00:00:00Z")).toBe(true);
  });
});
