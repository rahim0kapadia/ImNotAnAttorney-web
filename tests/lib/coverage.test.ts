/**
 * Unit tests for the pre-purchase coverage probe shape contract.
 *
 * The probe shares the matcher's chooseNypdMatch contract so pre-purchase
 * counts cannot promise allegations the post-purchase report won't deliver.
 * These tests validate the pure-logic mirror of that contract; the live-DB
 * path is exercised end-to-end by scripts/verify-officer-render-nypd.mjs.
 */
import { describe, it, expect } from "vitest";
import {
  chooseNypdMatch,
  classifyNypdSignal,
  type NypdCandidate,
} from "@/lib/tier9-reports/nypd-match";

function candidate(overrides: Partial<NypdCandidate>): NypdCandidate {
  return {
    tax_id: 1,
    officer_first_name: "Daniel",
    officer_last_name: "Pantaleo",
    shield_no: "07333",
    current_rank: null,
    current_command: null,
    active_per_last_reported_status: null,
    total_complaints: 7,
    total_substantiated_complaints: 4,
    ...overrides,
  };
}

describe("coverage probe parity with queryNypdProfile contract", () => {
  it("PARITY: state=NY-only intake → state-fallback route → multiple-name-matches → ambiguous (no allegation sum)", () => {
    // The exact pattern that produced the 'pre says 60, post says ambiguous'
    // mismatch the worry called out.
    const signal = classifyNypdSignal({ state: "NY", agency: null });
    expect(signal).toEqual({ route: "state-fallback" });
    const cands = [candidate({ tax_id: 1 }), candidate({ tax_id: 2 })];
    const m = chooseNypdMatch(cands, null, {
      firstNameProvided: true,
      route: "state-fallback",
    });
    // Coverage layer reads m.status — ambiguous means do NOT sum allegations.
    expect(m.status).toBe("ambiguous");
    expect(m.matchedTaxId).toBeNull();
  });

  it("PARITY: state=NY-only + single-name-match + no shield → ambiguous (state-fallback thin confidence)", () => {
    const signal = classifyNypdSignal({ state: "NY", agency: null });
    expect(signal).toEqual({ route: "state-fallback" });
    const cands = [candidate({ tax_id: 42 })];
    const m = chooseNypdMatch(cands, null, {
      firstNameProvided: true,
      route: "state-fallback",
    });
    // 1 candidate alone is NOT enough under state-fallback. Coverage layer
    // surfaces nypdOfficers=1, nypdAllegations=0; report renders ambiguous.
    expect(m.status).toBe("ambiguous");
  });

  it("PARITY: state=NY-only + single-name-match + matching shield → single (allegation sum is safe)", () => {
    const cands = [candidate({ tax_id: 42, shield_no: "07333" })];
    const m = chooseNypdMatch(cands, "07333", {
      firstNameProvided: true,
      route: "state-fallback",
    });
    // Shield disambiguator overrides thin-confidence — coverage can safely
    // count this one officer's allegations.
    expect(m.status).toBe("single");
    expect(m.matchedTaxId).toBe(42);
  });

  it("PARITY: explicit NYPD agency + single-name-match → single (agency-whitelist route is high confidence)", () => {
    const signal = classifyNypdSignal({ agency: "NYPD", state: "NY" });
    expect(signal).toEqual({ route: "agency-whitelist" });
    const cands = [candidate({ tax_id: 42 })];
    const m = chooseNypdMatch(cands, null, {
      firstNameProvided: true,
      route: "agency-whitelist",
    });
    expect(m.status).toBe("single");
  });

  it("PARITY: explicit non-NYPD NY agency suppresses probe entirely (no NYPD section)", () => {
    expect(classifyNypdSignal({ agency: "Buffalo Police", state: "NY" })).toBeNull();
    expect(classifyNypdSignal({ agency: "Nassau County Police", state: "NY" })).toBeNull();
    // Coverage layer: nypdOfficers / nypdAllegations stay absent from the
    // result map. Report layer: queryNypdProfile returns null.
  });

  it("PARITY: zero-allegation roster match → single status, but allegation count from coverage = 0", () => {
    // An officer matched on the roster with zero CCRB complaints is a valid
    // "single" status. Coverage's `nypdAllegations` count must reflect zero
    // (which it will, via the .eq(tax_id, X) count being 0). The render
    // layer omits the allegations source citation in this case.
    const cands = [candidate({ tax_id: 99, total_complaints: 0 })];
    const m = chooseNypdMatch(cands, null, {
      firstNameProvided: true,
      route: "agency-whitelist",
    });
    expect(m.status).toBe("single");
    expect(m.matchedTaxId).toBe(99);
  });

  it("PARITY: 21 candidates → truncated=true → ambiguous count rendered as N+", () => {
    const cands = Array.from({ length: 20 }, (_, i) => candidate({ tax_id: i + 1 }));
    const m = chooseNypdMatch(cands, null, {
      firstNameProvided: true,
      route: "agency-whitelist",
      truncated: true,
    });
    expect(m.status).toBe("ambiguous");
    expect(m.truncated).toBe(true);
    // Render reads candidates.length = 20 + truncated → "20+".
  });
});
