import { describe, it, expect } from "vitest";
import { AddClientSchema } from "../partner-schemas";

const VALID_BODY = {
  first_name: "John",
  email: "john@example.com",
  charge_type: "dui-first-offense",
  county_state: "Pinellas County, FL",
  court_date: "2030-06-09",
};

describe("AddClientSchema", () => {
  it("accepts valid minimal body", () => {
    const r = AddClientSchema.safeParse(VALID_BODY);
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
  });

  it("accepts optional fields", () => {
    const r = AddClientSchema.safeParse({
      ...VALID_BODY,
      last_name: "Smith",
      indemnitor_name: "Jane",
      indemnitor_email: "jane@example.com",
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing first_name", () => {
    const r = AddClientSchema.safeParse({ ...VALID_BODY, first_name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const r = AddClientSchema.safeParse({ ...VALID_BODY, email: "not-an-email" });
    expect(r.success).toBe(false);
  });

  it("rejects unknown charge_type", () => {
    const r = AddClientSchema.safeParse({ ...VALID_BODY, charge_type: "not-a-real-charge" });
    expect(r.success).toBe(false);
  });

  it("rejects non-ISO court_date", () => {
    const r = AddClientSchema.safeParse({ ...VALID_BODY, court_date: "06/09/2030" });
    expect(r.success).toBe(false);
  });

  it("rejects unknown body fields (strict mode)", () => {
    const r = AddClientSchema.safeParse({ ...VALID_BODY, partner_id: "leak-attempt" });
    expect(r.success).toBe(false);
  });

  it("rejects 10KB name (length cap guards garbage injection)", () => {
    const r = AddClientSchema.safeParse({ ...VALID_BODY, first_name: "A".repeat(10_000) });
    expect(r.success).toBe(false);
  });

  it("accepts empty-string indemnitor_email (form-common pattern)", () => {
    const r = AddClientSchema.safeParse({ ...VALID_BODY, indemnitor_email: "" });
    expect(r.success).toBe(true);
  });

  it("lowercases email on parse", () => {
    const r = AddClientSchema.safeParse({ ...VALID_BODY, email: "John@Example.COM" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("john@example.com");
  });
});
