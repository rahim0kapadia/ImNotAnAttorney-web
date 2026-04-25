/**
 * Unit tests for the CPD matcher pure logic.
 *
 * Exercises normalization + selection branches without touching Supabase.
 * fetchCpdCandidates / matchCpdOfficer (DB path) covered by the integration
 * fixture in scripts/verify-officer-render-chicago.mjs.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeAgencyToCpd,
  isChicagoSignal,
  parseOfficerName,
  normalizeBadge,
  chooseMatch,
  type CpdCandidate,
} from "@/lib/tier9-reports/cpd-match";

function candidate(overrides: Partial<CpdCandidate>): CpdCandidate {
  return {
    uid: 1,
    first_name: "Jerome",
    last_name: "Finnigan",
    current_star: "2012",
    current_rank: "PO",
    current_status: "resigned",
    appointed_date: "1988-01-01",
    ...overrides,
  };
}

describe("normalizeAgencyToCpd", () => {
  it("maps canonical CPD strings to 'cpd'", () => {
    expect(normalizeAgencyToCpd("CPD")).toBe("cpd");
    expect(normalizeAgencyToCpd("Chicago PD")).toBe("cpd");
    expect(normalizeAgencyToCpd("Chicago Police")).toBe("cpd");
    expect(normalizeAgencyToCpd("Chicago Police Department")).toBe("cpd");
    expect(normalizeAgencyToCpd("City of Chicago Police")).toBe("cpd");
    expect(normalizeAgencyToCpd("City of Chicago Police Department")).toBe("cpd");
  });

  it("absorbs case / punct / 'Dept.' variants", () => {
    expect(normalizeAgencyToCpd("chicago pd.")).toBe("cpd");
    expect(normalizeAgencyToCpd("Chicago   Police   Dept.")).toBe("cpd");
    expect(normalizeAgencyToCpd("CITY OF CHICAGO POLICE DEPT.")).toBe("cpd");
  });

  it("rejects non-CPD agencies", () => {
    expect(normalizeAgencyToCpd("Cook County Sheriff")).toBeNull();
    expect(normalizeAgencyToCpd("Illinois State Police")).toBeNull();
    expect(normalizeAgencyToCpd("Evanston Police")).toBeNull();
    expect(normalizeAgencyToCpd("Police")).toBeNull();
  });

  it("handles null / empty", () => {
    expect(normalizeAgencyToCpd(null)).toBeNull();
    expect(normalizeAgencyToCpd(undefined)).toBeNull();
    expect(normalizeAgencyToCpd("")).toBeNull();
    expect(normalizeAgencyToCpd("   ")).toBeNull();
  });
});

describe("isChicagoSignal", () => {
  it("routes on explicit CPD agency even when state differs", () => {
    expect(isChicagoSignal({ agency: "Chicago PD", state: "WI" })).toBe(true);
  });

  it("routes on state=IL when no agency given", () => {
    expect(isChicagoSignal({ state: "IL" })).toBe(true);
    expect(isChicagoSignal({ state: "il" })).toBe(true);
  });

  it("does not route on state alone when it isn't IL", () => {
    expect(isChicagoSignal({ state: "CA" })).toBe(false);
    expect(isChicagoSignal({})).toBe(false);
  });

  it("does not route on non-CPD agency even when state=IL is absent", () => {
    expect(isChicagoSignal({ agency: "Cook County Sheriff" })).toBe(false);
  });
});

describe("parseOfficerName", () => {
  it("splits multi-token names with last-token-wins", () => {
    expect(parseOfficerName("Jerome Finnigan")).toEqual({
      firstName: "Jerome",
      lastName: "Finnigan",
    });
    expect(parseOfficerName("Mary Ann Smith")).toEqual({
      firstName: "Mary Ann",
      lastName: "Smith",
    });
  });

  it("collapses whitespace", () => {
    expect(parseOfficerName("  Glenn   Evans  ")).toEqual({
      firstName: "Glenn",
      lastName: "Evans",
    });
  });

  it("single-token names land on last_name for matcher fallback", () => {
    expect(parseOfficerName("Finnigan")).toEqual({
      firstName: "",
      lastName: "Finnigan",
    });
  });

  it("empty input produces empty fields", () => {
    expect(parseOfficerName("")).toEqual({ firstName: "", lastName: "" });
    expect(parseOfficerName("   ")).toEqual({ firstName: "", lastName: "" });
  });
});

describe("normalizeBadge", () => {
  it("strips non-digits", () => {
    expect(normalizeBadge("Star #2012")).toBe("2012");
    expect(normalizeBadge("  8051 ")).toBe("8051");
    expect(normalizeBadge("B-2012")).toBe("2012");
  });

  it("returns null when nothing digit-like", () => {
    expect(normalizeBadge("no badge")).toBeNull();
    expect(normalizeBadge("")).toBeNull();
    expect(normalizeBadge(null)).toBeNull();
    expect(normalizeBadge(undefined)).toBeNull();
  });
});

describe("chooseMatch", () => {
  it("returns 'none' on empty candidates", () => {
    const r = chooseMatch([], null);
    expect(r.status).toBe("none");
    expect(r.matchedUid).toBeNull();
  });

  it("returns 'single' when exactly one candidate", () => {
    const r = chooseMatch([candidate({ uid: 42 })], null);
    expect(r.status).toBe("single");
    expect(r.matchedUid).toBe(42);
  });

  it("disambiguates multiple candidates via badge", () => {
    const cands = [
      candidate({ uid: 1, current_star: "2012" }),
      candidate({ uid: 2, current_star: "8051" }),
      candidate({ uid: 3, current_star: "9999" }),
    ];
    const r = chooseMatch(cands, "8051");
    expect(r.status).toBe("single");
    expect(r.matchedUid).toBe(2);
  });

  it("stays ambiguous when no badge given and multiple candidates", () => {
    const cands = [
      candidate({ uid: 1, current_star: "2012" }),
      candidate({ uid: 2, current_star: "8051" }),
    ];
    const r = chooseMatch(cands, null);
    expect(r.status).toBe("ambiguous");
    expect(r.matchedUid).toBeNull();
    expect(r.candidates).toHaveLength(2);
  });

  it("stays ambiguous when badge matches zero candidates", () => {
    const cands = [
      candidate({ uid: 1, current_star: "2012" }),
      candidate({ uid: 2, current_star: "8051" }),
    ];
    const r = chooseMatch(cands, "0000");
    expect(r.status).toBe("ambiguous");
    expect(r.candidates).toHaveLength(2);
  });

  it("stays ambiguous when badge matches 2+ candidates (data glitch)", () => {
    const cands = [
      candidate({ uid: 1, current_star: "2012" }),
      candidate({ uid: 2, current_star: "2012" }),
    ];
    const r = chooseMatch(cands, "2012");
    expect(r.status).toBe("ambiguous");
    expect(r.candidates).toHaveLength(2);
  });

  it("ignores non-digit noise in input badge", () => {
    const cands = [
      candidate({ uid: 1, current_star: "2012" }),
      candidate({ uid: 2, current_star: "8051" }),
    ];
    const r = chooseMatch(cands, "Star #8051");
    expect(r.matchedUid).toBe(2);
  });
});
