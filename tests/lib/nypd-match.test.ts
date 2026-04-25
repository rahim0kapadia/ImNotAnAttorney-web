/**
 * Unit tests for the NYPD matcher pure logic.
 *
 * Exercises normalization + selection branches without touching Supabase.
 * fetchNypdCandidates / matchNypdOfficer (DB path) covered by the integration
 * fixture in scripts/verify-officer-render-nypd.mjs.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeAgencyToNypd,
  isNypdSignal,
  classifyNypdSignal,
  isExplicitNonNypdNyAgency,
  parseNypdName,
  normalizeShield,
  chooseNypdMatch,
  type NypdCandidate,
} from "@/lib/tier9-reports/nypd-match";

function candidate(overrides: Partial<NypdCandidate>): NypdCandidate {
  return {
    tax_id: 901001,
    officer_first_name: "Daniel",
    officer_last_name: "Pantaleo",
    shield_no: "07333",
    current_rank: "Police Officer",
    current_command: "120 Pct",
    active_per_last_reported_status: "Inactive",
    total_complaints: 7,
    total_substantiated_complaints: 4,
    ...overrides,
  };
}

describe("normalizeAgencyToNypd", () => {
  it("maps canonical NYPD strings to 'nypd'", () => {
    expect(normalizeAgencyToNypd("NYPD")).toBe("nypd");
    expect(normalizeAgencyToNypd("New York PD")).toBe("nypd");
    expect(normalizeAgencyToNypd("New York Police")).toBe("nypd");
    expect(normalizeAgencyToNypd("New York Police Department")).toBe("nypd");
    expect(normalizeAgencyToNypd("New York City PD")).toBe("nypd");
    expect(normalizeAgencyToNypd("NYC Police Department")).toBe("nypd");
  });

  it("absorbs case / punct / 'Dept.' variants", () => {
    expect(normalizeAgencyToNypd("nypd.")).toBe("nypd");
    expect(normalizeAgencyToNypd("New   York   Police   Dept.")).toBe("nypd");
    expect(normalizeAgencyToNypd("NYC POLICE DEPT.")).toBe("nypd");
  });

  it("rejects non-NYPD agencies", () => {
    expect(normalizeAgencyToNypd("Nassau County Police")).toBeNull();
    expect(normalizeAgencyToNypd("NY State Police")).toBeNull();
    expect(normalizeAgencyToNypd("Port Authority Police")).toBeNull();
    expect(normalizeAgencyToNypd("Police")).toBeNull();
  });

  it("handles null / empty", () => {
    expect(normalizeAgencyToNypd(null)).toBeNull();
    expect(normalizeAgencyToNypd(undefined)).toBeNull();
    expect(normalizeAgencyToNypd("")).toBeNull();
    expect(normalizeAgencyToNypd("   ")).toBeNull();
  });
});

describe("isExplicitNonNypdNyAgency", () => {
  it("identifies common NY non-NYPD agencies", () => {
    expect(isExplicitNonNypdNyAgency("Nassau County Police")).toBe(true);
    expect(isExplicitNonNypdNyAgency("Suffolk County PD")).toBe(true);
    expect(isExplicitNonNypdNyAgency("NYS Police")).toBe(true);
    expect(isExplicitNonNypdNyAgency("Port Authority Police")).toBe(true);
    expect(isExplicitNonNypdNyAgency("MTA Police")).toBe(true);
    expect(isExplicitNonNypdNyAgency("Buffalo Police")).toBe(true);
    expect(isExplicitNonNypdNyAgency("Rochester Police Department")).toBe(true);
    expect(isExplicitNonNypdNyAgency("Westchester County Sheriff")).toBe(true);
  });

  it("does NOT flag NYPD whitelist matches as non-NYPD", () => {
    expect(isExplicitNonNypdNyAgency("NYPD")).toBe(false);
    expect(isExplicitNonNypdNyAgency("New York Police Department")).toBe(false);
    expect(isExplicitNonNypdNyAgency("NYC Police Department")).toBe(false);
  });

  it("returns false for null / empty / unknown", () => {
    expect(isExplicitNonNypdNyAgency(null)).toBe(false);
    expect(isExplicitNonNypdNyAgency("")).toBe(false);
    expect(isExplicitNonNypdNyAgency("Some Random PD")).toBe(false);
  });
});

describe("classifyNypdSignal + isNypdSignal", () => {
  it("returns route='agency-whitelist' on explicit NYPD agency", () => {
    expect(classifyNypdSignal({ agency: "NYPD", state: "NJ" })).toEqual({
      route: "agency-whitelist",
    });
    expect(isNypdSignal({ agency: "NYPD", state: "NJ" })).toBe(true);
  });

  it("returns route='state-fallback' when agency missing AND state=NY", () => {
    expect(classifyNypdSignal({ state: "NY" })).toEqual({ route: "state-fallback" });
    expect(classifyNypdSignal({ agency: "", state: "ny" })).toEqual({ route: "state-fallback" });
    expect(isNypdSignal({ state: "NY" })).toBe(true);
  });

  it("SUPPRESSES probe entirely when explicit non-NYPD NY agency given even with state=NY", () => {
    // Critical wrong-officer-attribution defense: customer with Buffalo PD
    // intake should NOT route to NYPD probe just because state=NY.
    expect(classifyNypdSignal({ agency: "Buffalo Police", state: "NY" })).toBeNull();
    expect(classifyNypdSignal({ agency: "Nassau County Police", state: "NY" })).toBeNull();
    expect(classifyNypdSignal({ agency: "NYS Police", state: "NY" })).toBeNull();
    expect(classifyNypdSignal({ agency: "Port Authority Police", state: "NY" })).toBeNull();
    expect(isNypdSignal({ agency: "Buffalo Police", state: "NY" })).toBe(false);
  });

  it("SUPPRESSES probe when ANY non-empty unrecognized agency string given", () => {
    // Conservative: explicit agency that doesn't whitelist suppresses fallback.
    expect(classifyNypdSignal({ agency: "Some Other PD", state: "NY" })).toBeNull();
  });

  it("does not route on state alone when it isn't NY", () => {
    expect(classifyNypdSignal({ state: "CA" })).toBeNull();
    expect(classifyNypdSignal({})).toBeNull();
    expect(isNypdSignal({ state: "CA" })).toBe(false);
  });

  it("accepts city-of-new-york formal naming variants", () => {
    expect(classifyNypdSignal({ agency: "City of New York Police", state: "NJ" })).toEqual({
      route: "agency-whitelist",
    });
    expect(classifyNypdSignal({ agency: "City of New York Police Department", state: "NJ" })).toEqual({
      route: "agency-whitelist",
    });
  });
});

describe("parseNypdName", () => {
  it("splits multi-token names with last-token-wins", () => {
    expect(parseNypdName("Daniel Pantaleo")).toEqual({
      firstName: "Daniel",
      lastName: "Pantaleo",
    });
    expect(parseNypdName("Mary Ann Rivera")).toEqual({
      firstName: "Mary Ann",
      lastName: "Rivera",
    });
  });

  it("collapses whitespace", () => {
    expect(parseNypdName("  Daniel   Pantaleo  ")).toEqual({
      firstName: "Daniel",
      lastName: "Pantaleo",
    });
  });

  it("single-token names land on last_name for matcher fallback", () => {
    expect(parseNypdName("Pantaleo")).toEqual({
      firstName: "",
      lastName: "Pantaleo",
    });
  });

  it("empty input produces empty fields", () => {
    expect(parseNypdName("")).toEqual({ firstName: "", lastName: "" });
    expect(parseNypdName("   ")).toEqual({ firstName: "", lastName: "" });
  });

  it("compound surnames keep the prefix attached", () => {
    expect(parseNypdName("John St Pierre")).toEqual({
      firstName: "John",
      lastName: "St Pierre",
    });
    expect(parseNypdName("Maria Van Buren")).toEqual({
      firstName: "Maria",
      lastName: "Van Buren",
    });
    expect(parseNypdName("Ana De La Cruz")).toEqual({
      firstName: "Ana De",
      lastName: "La Cruz",
    });
    expect(parseNypdName("Tom McCarthy")).toEqual({
      firstName: "Tom",
      lastName: "McCarthy",
    });
    // O' apostrophe gets stripped to "O" by .replace(/[^a-z]/g, "") in
    // the prefix lookup, so "James O'Brien" parses with O as the prefix.
    expect(parseNypdName("James O Brien")).toEqual({
      firstName: "James",
      lastName: "O Brien",
    });
  });

  it("strips control characters from the input", () => {
    expect(parseNypdName("Daniel\x00Pantaleo")).toEqual({
      firstName: "Daniel",
      lastName: "Pantaleo",
    });
  });
});

describe("normalizeShield", () => {
  it("strips non-digits and zero-pads to 6 chars", () => {
    expect(normalizeShield("Shield #07333")).toBe("007333");
    expect(normalizeShield("  12345 ")).toBe("012345");
    expect(normalizeShield("S-07333")).toBe("007333");
  });

  it("compares equal across leading-zero variants (the leading-zero bug)", () => {
    // Customer types "7333", DB stores "07333" — both must compare equal.
    expect(normalizeShield("7333")).toBe(normalizeShield("07333"));
    expect(normalizeShield("123")).toBe(normalizeShield("000123"));
  });

  it("returns null when nothing digit-like", () => {
    expect(normalizeShield("no shield")).toBeNull();
    expect(normalizeShield("")).toBeNull();
    expect(normalizeShield(null)).toBeNull();
    expect(normalizeShield(undefined)).toBeNull();
  });
});

describe("chooseNypdMatch", () => {
  it("returns 'none' on empty candidates", () => {
    const r = chooseNypdMatch([], null);
    expect(r.status).toBe("none");
    expect(r.matchedTaxId).toBeNull();
  });

  it("returns 'single' when exactly one candidate AND firstName provided AND agency-whitelist route", () => {
    const r = chooseNypdMatch([candidate({ tax_id: 42 })], null, {
      firstNameProvided: true,
      route: "agency-whitelist",
    });
    expect(r.status).toBe("single");
    expect(r.matchedTaxId).toBe(42);
  });

  it("DOWNGRADES single candidate to 'ambiguous' when state-fallback route (thin confidence)", () => {
    // Wrong-officer-attribution defense: name+state-only match against
    // 96K NYPD officers is too thin without agency confirmation.
    const r = chooseNypdMatch([candidate({ tax_id: 42 })], null, {
      firstNameProvided: true,
      route: "state-fallback",
    });
    expect(r.status).toBe("ambiguous");
    expect(r.matchedTaxId).toBeNull();
  });

  it("DOWNGRADES single candidate to 'ambiguous' when firstName empty (last-name-only match)", () => {
    const r = chooseNypdMatch([candidate({ tax_id: 42 })], null, {
      firstNameProvided: false,
      route: "agency-whitelist",
    });
    expect(r.status).toBe("ambiguous");
    expect(r.matchedTaxId).toBeNull();
  });

  it("disambiguates multiple candidates via shield", () => {
    const cands = [
      candidate({ tax_id: 1, shield_no: "07333" }),
      candidate({ tax_id: 2, shield_no: "12345" }),
      candidate({ tax_id: 3, shield_no: "99999" }),
    ];
    const r = chooseNypdMatch(cands, "12345");
    expect(r.status).toBe("single");
    expect(r.matchedTaxId).toBe(2);
  });

  it("supplied shield that matches NO candidate forces ambiguous (not name-only fallback)", () => {
    // The "1 candidate by name + non-matching shield" wrong-attribution path:
    // a supplied-but-wrong shield is a strong negative signal, not a no-op.
    const r = chooseNypdMatch([candidate({ tax_id: 42 })], "99999", {
      firstNameProvided: true,
      route: "agency-whitelist",
    });
    expect(r.status).toBe("ambiguous");
    expect(r.matchedTaxId).toBeNull();
  });

  it("stays ambiguous when no shield given and multiple candidates", () => {
    const cands = [
      candidate({ tax_id: 1, shield_no: "07333" }),
      candidate({ tax_id: 2, shield_no: "12345" }),
    ];
    const r = chooseNypdMatch(cands, null, {
      firstNameProvided: true,
      route: "agency-whitelist",
    });
    expect(r.status).toBe("ambiguous");
    expect(r.matchedTaxId).toBeNull();
    expect(r.candidates).toHaveLength(2);
  });

  it("stays ambiguous when shield matches zero candidates among many", () => {
    const cands = [
      candidate({ tax_id: 1, shield_no: "07333" }),
      candidate({ tax_id: 2, shield_no: "12345" }),
    ];
    const r = chooseNypdMatch(cands, "00000");
    expect(r.status).toBe("ambiguous");
    expect(r.candidates).toHaveLength(2);
  });

  it("stays ambiguous when shield matches 2+ candidates (data glitch)", () => {
    const cands = [
      candidate({ tax_id: 1, shield_no: "07333" }),
      candidate({ tax_id: 2, shield_no: "07333" }),
    ];
    const r = chooseNypdMatch(cands, "07333");
    expect(r.status).toBe("ambiguous");
    expect(r.candidates).toHaveLength(2);
  });

  it("ignores non-digit noise in input shield", () => {
    const cands = [
      candidate({ tax_id: 1, shield_no: "07333" }),
      candidate({ tax_id: 2, shield_no: "12345" }),
    ];
    const r = chooseNypdMatch(cands, "Shield #12345");
    expect(r.matchedTaxId).toBe(2);
  });

  it("compares shields ignoring leading-zero count (07333 == 7333)", () => {
    const cands = [
      candidate({ tax_id: 1, shield_no: "07333" }),
      candidate({ tax_id: 2, shield_no: "12300" }),
    ];
    // Customer types "7333" without leading zero — must still match.
    const r = chooseNypdMatch(cands, "7333");
    expect(r.matchedTaxId).toBe(1);
  });

  it("propagates truncated flag to result", () => {
    const r = chooseNypdMatch([], null, { truncated: true });
    expect(r.truncated).toBe(true);
  });
});
