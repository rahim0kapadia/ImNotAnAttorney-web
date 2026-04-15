import { describe, expect, it } from "vitest";
import {
  extractPhoneFromGateway,
  normalizePhoneForGateway,
} from "../sms-suspensions";

describe("normalizePhoneForGateway", () => {
  it("strips +1 prefix from E.164", () => {
    expect(normalizePhoneForGateway("+16504846374")).toBe("6504846374");
  });
  it("keeps bare 10-digit unchanged", () => {
    expect(normalizePhoneForGateway("6504846374")).toBe("6504846374");
  });
  it("strips formatting characters", () => {
    expect(normalizePhoneForGateway("(650) 484-6374")).toBe("6504846374");
  });
  it("strips leading 1 on 11-digit input", () => {
    expect(normalizePhoneForGateway("16504846374")).toBe("6504846374");
  });
});

describe("extractPhoneFromGateway", () => {
  it("extracts 10-digit phone from gateway address", () => {
    expect(extractPhoneFromGateway("6504846374@text.email")).toBe("6504846374");
  });
  it("is case-insensitive", () => {
    expect(extractPhoneFromGateway("6504846374@Text.Email")).toBe("6504846374");
  });
  it("trims whitespace", () => {
    expect(extractPhoneFromGateway("  6504846374@text.email  ")).toBe("6504846374");
  });
  it("returns null for non-gateway domain", () => {
    expect(extractPhoneFromGateway("6504846374@example.com")).toBeNull();
  });
  it("returns null for non-10-digit local part", () => {
    expect(extractPhoneFromGateway("abc@text.email")).toBeNull();
    expect(extractPhoneFromGateway("123456789@text.email")).toBeNull();
    expect(extractPhoneFromGateway("+16504846374@text.email")).toBeNull();
  });
});
