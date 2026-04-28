// test-isolation-na: pure unit test of JSON validation, zero Supabase writes
// Pattern: no-hallucinated-legal-data.md (cardinal rule: every populated field must have source_url)
/**
 * Loader tests for state-arrest-procedure JSON files.
 */

import { describe, it, expect } from "vitest";
import {
  validateStateArrestProcedure,
  StateArrestProcedureValidationError,
} from "../src/lib/state-arrest-procedure/load";

const MINIMAL_VALID = {
  state_code: "FL",
  state_name: "Florida",
  researched_at: "2026-04-28",
  first_appearance_window_hours: 24,
  pd_attach_trigger: "at first appearance",
  indigency_threshold: null,
  bail_types_allowed: ["cash", "surety", "personal_recognizance"],
  bail_default_amounts_by_charge: null,
  phone_call_rule: "Right to telephone within 3 hours",
  recording_police_consent: "one-party",
  expungement_window_years: null,
  misc_quirks: ["state-specific quirk"],
  source_urls: ["https://example.gov/fl/rules"],
  _unknown_fields: [
    "indigency_threshold",
    "bail_default_amounts_by_charge",
    "expungement_window_years",
  ],
};

describe("validateStateArrestProcedure", () => {
  it("accepts a fully-shaped minimal record", () => {
    const out = validateStateArrestProcedure(MINIMAL_VALID, "fl.json");
    expect(out.state_code).toBe("FL");
    expect(out.bail_types_allowed).toContain("cash");
  });

  it("rejects state_code that is not 2-letter uppercase", () => {
    expect(() =>
      validateStateArrestProcedure({ ...MINIMAL_VALID, state_code: "fl" }, "fl.json"),
    ).toThrow(StateArrestProcedureValidationError);
  });

  it("rejects researched_at not in ISO YYYY-MM-DD", () => {
    expect(() =>
      validateStateArrestProcedure(
        { ...MINIMAL_VALID, researched_at: "April 28, 2026" },
        "fl.json",
      ),
    ).toThrow(StateArrestProcedureValidationError);
  });

  it("rejects missing source_urls when fields are populated", () => {
    expect(() =>
      validateStateArrestProcedure(
        { ...MINIMAL_VALID, source_urls: [] },
        "fl.json",
      ),
    ).toThrow(/no-hallucinated-legal-data/);
  });

  it("allows empty source_urls when nothing is populated", () => {
    const empty = {
      state_code: "ZZ",
      state_name: "Empty",
      researched_at: "2026-04-28",
      first_appearance_window_hours: null,
      pd_attach_trigger: null,
      indigency_threshold: null,
      bail_types_allowed: [],
      bail_default_amounts_by_charge: null,
      phone_call_rule: null,
      recording_police_consent: null,
      expungement_window_years: null,
      misc_quirks: [],
      source_urls: [],
      _unknown_fields: [
        "first_appearance_window_hours",
        "pd_attach_trigger",
        "indigency_threshold",
        "bail_default_amounts_by_charge",
        "phone_call_rule",
        "recording_police_consent",
        "expungement_window_years",
      ],
    };
    expect(() => validateStateArrestProcedure(empty, "zz.json")).not.toThrow();
  });

  it("rejects http source_url that is not http(s)", () => {
    expect(() =>
      validateStateArrestProcedure(
        { ...MINIMAL_VALID, source_urls: ["ftp://example.gov/x"] },
        "fl.json",
      ),
    ).toThrow();
  });

  it("rejects invalid bail_types_allowed value", () => {
    expect(() =>
      validateStateArrestProcedure(
        { ...MINIMAL_VALID, bail_types_allowed: ["bitcoin"] },
        "fl.json",
      ),
    ).toThrow(/invalid bail_types_allowed/);
  });

  it("rejects invalid recording_police_consent enum", () => {
    expect(() =>
      validateStateArrestProcedure(
        { ...MINIMAL_VALID, recording_police_consent: "two-party" },
        "fl.json",
      ),
    ).toThrow(/recording_police_consent/);
  });

  it("rejects negative first_appearance_window_hours", () => {
    expect(() =>
      validateStateArrestProcedure(
        { ...MINIMAL_VALID, first_appearance_window_hours: -1 },
        "fl.json",
      ),
    ).toThrow(/first_appearance_window_hours/);
  });

  it("rejects _unknown_fields mislabeling a populated field", () => {
    expect(() =>
      validateStateArrestProcedure(
        { ...MINIMAL_VALID, _unknown_fields: ["pd_attach_trigger"] },
        "fl.json",
      ),
    ).toThrow(/_unknown_fields/);
  });
});
