/**
 * Unit tests for X-Ray Section X3 — "What the Jury Will Hear" (TICKET-8).
 *
 * Focus areas:
 *   1. Per-charge render — multiple federal charges produce one PJI block each
 *   2. Coverage gate — defendant in PJI_COVERED_CIRCUITS sees primary instruction
 *   3. Sibling-fallback transparency — out-of-scope circuit produces a
 *      visible "Note on circuit coverage" line naming BOTH circuits
 *   4. Element-level burden bullets — verbatim sentences from the PJI body
 *      surface as bulleted "What the prosecution has to prove"
 *   5. UPL parity — outside the pji-framing/pji-body carve-outs, no
 *      UPL_BANNED_PHRASES appear; methodology gate present
 *   6. Empty paths — no charges, all non-federal, all empty all return ""
 */

import { describe, it, expect } from "vitest";
import {
  renderJuryInstructionSection,
  type JuryInstructionSectionData,
  type PerChargeJuryInstruction,
} from "../jury-instruction-section";
import { UPL_BANNED_PHRASES } from "@/lib/charge-slug-maps";

// ------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------

function mkPerCharge(
  over: Partial<PerChargeJuryInstruction> = {},
): PerChargeJuryInstruction {
  return {
    chargeSlug: "wire-fraud",
    chargeLabel: "Wire Fraud (18 U.S.C. § 1343)",
    federalOnly: false,
    isEmpty: false,
    requestedCircuit: "9",
    requestedCircuitName: "Ninth Circuit",
    renderedCircuit: 9,
    renderedCircuitName: "Ninth Circuit",
    usedSiblingFallback: false,
    inCoverageScope: true,
    pjiBody:
      "The government must prove each of the following elements beyond a reasonable doubt: " +
      "First, that there was a scheme to defraud. Second, that the defendant used interstate " +
      "wire communications. Third, that the defendant acted with intent to defraud.",
    pjiInstructionNumber: "8.124",
    pjiTitle: "Wire Fraud — Elements",
    pjiSourceUrl:
      "https://www.ce9.uscourts.gov/jury-instructions/node/239",
    elementBullets: [
      "The government must prove each of the following elements beyond a reasonable doubt.",
    ],
    limitations: [],
    ...over,
  };
}

function mkData(
  over: Partial<JuryInstructionSectionData> = {},
): JuryInstructionSectionData {
  return {
    perCharge: [mkPerCharge()],
    isEmpty: false,
    ...over,
  };
}

// Strip PJI carve-out regions before UPL scanning. Same convention used by
// X1 + M4 tests: pji-framing / pji-body wrappers are intentionally
// verbatim public-record court text and may legitimately contain
// jury-voice phrases.
function stripPjiRegions(md: string): string {
  return md
    .replace(/<div class="pji-framing">[\s\S]*?<\/div>/g, "")
    .replace(/<div class="pji-body">[\s\S]*?<\/div>/g, "");
}

// ------------------------------------------------------------
// Per-charge render
// ------------------------------------------------------------

describe("Section X3 — Jury Instruction Section · per-charge render", () => {
  it("renders one block per charge for a multi-charge defendant", () => {
    const data = mkData({
      perCharge: [
        mkPerCharge({
          chargeSlug: "wire-fraud",
          chargeLabel: "Wire Fraud (18 U.S.C. § 1343)",
        }),
        mkPerCharge({
          chargeSlug: "money-laundering",
          chargeLabel: "Money Laundering (18 U.S.C. §§ 1956, 1957)",
          pjiInstructionNumber: "8.121",
          pjiTitle: "Money Laundering — Elements",
        }),
      ],
    });
    const md = renderJuryInstructionSection(data);
    expect(md).toContain("Wire Fraud (18 U.S.C. § 1343)");
    expect(md).toContain("Money Laundering (18 U.S.C. §§ 1956, 1957)");
    expect(md).toContain("Instruction 8.124");
    expect(md).toContain("Instruction 8.121");
  });

  it("renders the canonical X3 section heading and Mercer-voice intro", () => {
    const md = renderJuryInstructionSection(mkData());
    expect(md).toContain("## Section X3: What the Jury Will Hear");
    // Mercer voice — information framing, not directive.
    expect(md).toContain("These are the exact words a jury will hear");
    expect(md).toContain("each one is a separate fight");
  });

  it("includes the verbatim PJI body inside a pji-body carve-out", () => {
    const md = renderJuryInstructionSection(mkData());
    expect(md).toContain('<div class="pji-body">');
    expect(md).toContain('<div class="pji-framing">');
    // Body content is preserved verbatim
    expect(md).toContain(
      "The government must prove each of the following elements beyond a reasonable doubt",
    );
  });

  it("drops empty per-charge entries from render but keeps populated ones", () => {
    const data = mkData({
      perCharge: [
        mkPerCharge({ chargeSlug: "wire-fraud" }),
        mkPerCharge({
          chargeSlug: "tax-evasion",
          chargeLabel: "Tax Evasion (26 U.S.C. § 7201)",
          isEmpty: true,
          pjiBody: null,
          pjiInstructionNumber: null,
          pjiTitle: null,
          pjiSourceUrl: null,
          elementBullets: [],
        }),
      ],
    });
    const md = renderJuryInstructionSection(data);
    expect(md).toContain("Wire Fraud");
    expect(md).not.toContain("Tax Evasion");
  });
});

// ------------------------------------------------------------
// Coverage gate + sibling fallback
// ------------------------------------------------------------

describe("Section X3 — Jury Instruction Section · coverage + fallback", () => {
  it("renders without a fallback note when defendant's circuit is in scope", () => {
    const md = renderJuryInstructionSection(mkData());
    expect(md).not.toContain("Note on circuit coverage");
  });

  it("renders a transparent fallback note naming BOTH circuits when out of scope", () => {
    // Defendant is in the Second Circuit (NY) — out of PJI_COVERED_CIRCUITS.
    // FJIB falls back to a covered sibling (e.g. Ninth Circuit).
    const data = mkData({
      perCharge: [
        mkPerCharge({
          requestedCircuit: "2",
          requestedCircuitName: "Second Circuit",
          renderedCircuit: 9,
          renderedCircuitName: "Ninth Circuit",
          usedSiblingFallback: true,
          inCoverageScope: false,
          limitations: [
            "No pattern instruction cached for the Second Circuit; showing the Ninth Circuit instruction as the closest available reference.",
          ],
        }),
      ],
    });
    const md = renderJuryInstructionSection(data);
    expect(md).toContain("Note on circuit coverage");
    expect(md).toContain("Second Circuit");
    expect(md).toContain("Ninth Circuit");
    // The defendant must see the substitution disclosed — not buried.
    expect(md).toMatch(/closest available reference/);
  });

  it("falls back gracefully when requested circuit is unknown but a render circuit exists", () => {
    const data = mkData({
      perCharge: [
        mkPerCharge({
          requestedCircuit: null,
          requestedCircuitName: null,
          renderedCircuit: 9,
          renderedCircuitName: "Ninth Circuit",
          usedSiblingFallback: true,
        }),
      ],
    });
    const md = renderJuryInstructionSection(data);
    expect(md).toContain("Note on circuit coverage");
    expect(md).toContain("Ninth Circuit");
  });
});

// ------------------------------------------------------------
// Element-level burden bullets
// ------------------------------------------------------------

describe("Section X3 — Jury Instruction Section · element bullets", () => {
  it("emits 'What the prosecution has to prove' bullets verbatim from PJI", () => {
    const data = mkData({
      perCharge: [
        mkPerCharge({
          elementBullets: [
            "The government must prove the defendant knowingly devised a scheme.",
            "The government must prove the defendant used interstate wire communications.",
          ],
        }),
      ],
    });
    const md = renderJuryInstructionSection(data);
    expect(md).toContain("What the prosecution has to prove");
    expect(md).toContain(
      "The government must prove the defendant knowingly devised a scheme",
    );
    expect(md).toContain(
      "The government must prove the defendant used interstate wire communications",
    );
  });

  it("falls back gracefully when no burden sentences extracted", () => {
    const data = mkData({
      perCharge: [mkPerCharge({ elementBullets: [] })],
    });
    const md = renderJuryInstructionSection(data);
    expect(md).toContain("No standalone burden-of-proof sentences");
    // The full PJI body is still rendered, so the defendant still sees
    // the elements — they're just inline in the verbatim text.
    expect(md).toContain('<div class="pji-body">');
  });
});

// ------------------------------------------------------------
// UPL parity
// ------------------------------------------------------------

describe("Section X3 — Jury Instruction Section · UPL parity", () => {
  it("never emits banned UPL phrases outside the PJI carve-out region", () => {
    const data = mkData({
      perCharge: [
        mkPerCharge({
          chargeSlug: "wire-fraud",
          chargeLabel: "Wire Fraud (18 U.S.C. § 1343)",
        }),
        mkPerCharge({
          chargeSlug: "money-laundering",
          chargeLabel: "Money Laundering (18 U.S.C. §§ 1956, 1957)",
          requestedCircuit: "2",
          requestedCircuitName: "Second Circuit",
          renderedCircuit: 9,
          renderedCircuitName: "Ninth Circuit",
          usedSiblingFallback: true,
          limitations: [
            "No pattern instruction cached for the Second Circuit; showing the Ninth Circuit instruction as the closest available reference.",
          ],
        }),
      ],
    });
    const md = stripPjiRegions(renderJuryInstructionSection(data)).toLowerCase();
    for (const phrase of UPL_BANNED_PHRASES) {
      expect(
        md.includes(phrase),
        `rendered markdown must not contain banned phrase "${phrase}" outside PJI carve-out`,
      ).toBe(false);
    }
  });

  it("emits the legal-INFORMATION methodology gate on every non-empty render", () => {
    const md = renderJuryInstructionSection(mkData());
    expect(md).toContain("legal INFORMATION");
    expect(md).toContain("not legal ADVICE");
    // Methodology gate ends with the same "not a prediction" framing X1 uses.
    expect(md).toMatch(/is\s+(a\s+map|not\s+a\s+prediction)/i);
  });

  it("preserves PJI verbatim text containing jury-voice phrases inside the carve-out", () => {
    const data = mkData({
      perCharge: [
        mkPerCharge({
          pjiBody:
            "You should weigh all the evidence carefully. The jury should " +
            "deliberate with an open mind. The presumption of innocence applies.",
          elementBullets: [],
        }),
      ],
    });
    const md = renderJuryInstructionSection(data);
    // PJI body preserved verbatim including jury-voice phrases.
    expect(md).toContain("You should weigh all the evidence carefully");
    expect(md).toContain("The jury should deliberate with an open mind");
    // Carve-out wrappers present + framing disambiguates source.
    expect(md).toContain('<div class="pji-framing">');
    expect(md).toContain('<div class="pji-body">');
    expect(md).toContain("NOT legal advice from us to you");
    // Outside the carve-out, the jury-voice phrases must not leak.
    const outside = stripPjiRegions(md).toLowerCase();
    expect(outside).not.toContain("you should");
    expect(outside).not.toContain("the jury should");
  });
});

// ------------------------------------------------------------
// Verification URL invariant
// ------------------------------------------------------------

describe("Section X3 — Jury Instruction Section · verification URLs", () => {
  it("renders pjiSourceUrl as a primary-source link (verification URL invariant)", () => {
    const md = renderJuryInstructionSection(mkData());
    // Every non-empty per-charge block must surface the verification URL so
    // the defendant can independently confirm the source on uscourts.gov.
    expect(md).toContain("[Primary source]");
    expect(md).toContain("https://www.ce9.uscourts.gov/jury-instructions/node/239");
  });

  it("omits the primary-source link when pjiSourceUrl is null", () => {
    const data = mkData({
      perCharge: [mkPerCharge({ pjiSourceUrl: null })],
    });
    const md = renderJuryInstructionSection(data);
    // Section still renders (body is present); just no dangling link.
    expect(md).toContain("Wire Fraud");
    expect(md).not.toContain("[Primary source]");
  });
});

// ------------------------------------------------------------
// Empty / skip paths
// ------------------------------------------------------------

describe("Section X3 — Jury Instruction Section · empty paths", () => {
  it("returns empty string when section data has no charges", () => {
    const empty: JuryInstructionSectionData = {
      perCharge: [],
      isEmpty: true,
    };
    expect(renderJuryInstructionSection(empty)).toBe("");
  });

  it("returns empty string when all per-charge entries are empty", () => {
    const empty: JuryInstructionSectionData = {
      perCharge: [
        mkPerCharge({
          isEmpty: true,
          pjiBody: null,
          pjiInstructionNumber: null,
          pjiTitle: null,
          pjiSourceUrl: null,
          elementBullets: [],
        }),
      ],
      // Note: top-level isEmpty derived from "every per-charge is empty"
      // by the resolver; we set it true here to mirror that contract.
      isEmpty: true,
    };
    expect(renderJuryInstructionSection(empty)).toBe("");
  });

  it("does not render charges where federalOnly=true was returned by FJIB", () => {
    const data = mkData({
      perCharge: [
        mkPerCharge({ chargeSlug: "wire-fraud" }),
        mkPerCharge({
          chargeSlug: "state-charge-foo",
          chargeLabel: "state-charge-foo",
          federalOnly: true,
          isEmpty: true,
          pjiBody: null,
          pjiInstructionNumber: null,
          pjiTitle: null,
          pjiSourceUrl: null,
          elementBullets: [],
        }),
      ],
    });
    const md = renderJuryInstructionSection(data);
    expect(md).toContain("Wire Fraud");
    expect(md).not.toContain("state-charge-foo");
  });
});
