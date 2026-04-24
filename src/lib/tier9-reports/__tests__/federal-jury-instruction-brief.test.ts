/**
 * Unit tests for Federal Jury Instruction Brief — $97 Tier 9 SKU (M4).
 *
 * Focus (render + helpers, no live DB):
 *   - Federal-only rejection (isFederalCharge)
 *   - Burden-of-proof extraction (verbatim sentence capture)
 *   - UPL blocklist never renders
 *   - URL HARD rule (rows without URL are suppressed at query-time; render
 *     asserts every rendered attack-authority anchor has an href)
 *   - HTML injection in case_name / PJI body is escaped
 *   - Methodology disclaimer present verbatim
 *   - Circuit-variant difference summary produces a bounded one-liner
 *   - Missing-PJI fallback (federalOnly + isEmpty wiring)
 *   - FEDERAL_CHARGES map shape sanity (every entry has patterns + label)
 *
 * Query-layer is integration-tested via a live Supabase smoke run; this
 * file covers the UPL-critical render layer and pure helpers.
 */
import { describe, it, expect } from "vitest";
import {
  renderFederalJuryInstructionBrief,
  extractBurdenSentences,
  summarizeDifference,
  isFederalCharge,
  listFederalCharges,
  FEDERAL_CHARGES,
  UPL_BANNED_PHRASES,
  type FederalJuryBriefData,
  type PjiMatch,
  type AttackAuthority,
} from "../federal-jury-instruction-brief";

function mkData(over: Partial<FederalJuryBriefData> = {}): FederalJuryBriefData {
  return {
    federalCharge: "wire-fraud",
    federalChargeLabel: "Wire Fraud (18 U.S.C. § 1343)",
    circuit: "9",
    circuitName: "Ninth Circuit",
    state: "CA",
    pji: mkPji(),
    burdenSentences: [],
    attackAuthorities: [],
    circuitVariants: [],
    limitations: [],
    federalOnly: false,
    isEmpty: false,
    ...over,
  };
}

function mkPji(over: Partial<PjiMatch> = {}): PjiMatch {
  return {
    id: 42,
    circuit: 9,
    instruction_number: "15.35",
    title: "Wire Fraud (18 U.S.C. § 1343)",
    body: "To convict the defendant of wire fraud, the government must prove each of the following elements beyond a reasonable doubt. First, the defendant knowingly devised a scheme to defraud. Second, the defendant used interstate wire communications in furtherance of that scheme. The presumption of innocence applies throughout the trial.",
    commentary: null,
    statute_citations: ["18 U.S.C. § 1343"],
    source_url: "https://www.ce9.uscourts.gov/jury-instructions/node/268",
    effective_date: "2022-01-01",
    ...over,
  };
}

function mkAuthority(over: Partial<AttackAuthority> = {}): AttackAuthority {
  return {
    rank: 1,
    case_name: "Skilling v. United States",
    date_filed: "2010-06-24",
    citation_count_in_charge: 40,
    citation_count_total: 3200,
    authority_tier: "landmark",
    source_url: "https://www.courtlistener.com/opinion/149871/skilling-v-united-states/",
    framing: "Cases where the defense cited challenging elements of instructions for Wire Fraud.",
    ...over,
  };
}

describe("Federal Jury Instruction Brief — federal-only gate", () => {
  it("isFederalCharge returns true for curated federal slugs", () => {
    expect(isFederalCharge("wire-fraud")).toBe(true);
    expect(isFederalCharge("mail-fraud")).toBe(true);
    expect(isFederalCharge("felon-in-possession")).toBe(true);
    expect(isFederalCharge("drug-conspiracy")).toBe(true);
    expect(isFederalCharge("hobbs-act")).toBe(true);
  });

  it("isFederalCharge returns false for state/non-federal charges", () => {
    expect(isFederalCharge("dui-dwi")).toBe(false);
    expect(isFederalCharge("dui")).toBe(false);
    expect(isFederalCharge("simple-assault")).toBe(false);
    expect(isFederalCharge("shoplifting")).toBe(false);
    expect(isFederalCharge("")).toBe(false);
    expect(isFederalCharge("__proto__")).toBe(false);
  });

  it("listFederalCharges returns every catalog entry with non-empty label + >=1 pattern", () => {
    const list = listFederalCharges();
    expect(list.length).toBeGreaterThanOrEqual(20);
    for (const entry of list) {
      expect(entry.slug).toMatch(/^[a-z0-9-]+$/);
      expect(entry.label.length).toBeGreaterThan(0);
      expect(
        entry.statutePatterns.length + entry.titleKeywords.length,
      ).toBeGreaterThan(0);
      // Every statutePattern references a federal code title (U.S.C. ref
      // somewhere in the pattern source — regex escaping of dots makes a
      // direct substring match noisy, so check for U + S + C char presence
      // plus a numeric section number).
      for (const p of entry.statutePatterns) {
        expect(/U.{0,4}S.{0,4}C/i.test(p.source)).toBe(true);
        expect(/\d{2,4}/.test(p.source)).toBe(true);
      }
    }
  });
});

describe("Federal Jury Instruction Brief — burden extraction", () => {
  it("extracts sentences containing burden-of-proof phrases verbatim", () => {
    const body =
      "Ladies and gentlemen, welcome. You now are the jury. The government must prove each element beyond a reasonable doubt. Anything else is just context. The presumption of innocence attaches until the verdict.";
    const out = extractBurdenSentences(body);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.some((s) => /government must prove/i.test(s.sentence))).toBe(true);
    expect(
      out.some((s) => /presumption of innocence/i.test(s.sentence)),
    ).toBe(true);
    // Verbatim — no paraphrase, text present as-is in source
    for (const s of out) {
      expect(body.includes(s.sentence)).toBe(true);
    }
  });

  it("returns empty for body with no burden phrases", () => {
    const body = "This instruction governs the admissibility of expert testimony under Fed. R. Evid. 702.";
    expect(extractBurdenSentences(body)).toEqual([]);
  });

  it("handles empty / invalid body", () => {
    expect(extractBurdenSentences("")).toEqual([]);
    expect(extractBurdenSentences(undefined as unknown as string)).toEqual([]);
  });

  it("de-duplicates identical sentences and caps at 5", () => {
    const repeat = "The government must prove it beyond a reasonable doubt. ";
    const body = repeat.repeat(10);
    const out = extractBurdenSentences(body);
    expect(out.length).toBeLessThanOrEqual(5);
    // Set-based dedup
    const unique = new Set(out.map((x) => x.sentence.toLowerCase()));
    expect(unique.size).toBe(out.length);
  });
});

describe("Federal Jury Instruction Brief — summarizeDifference", () => {
  it("returns a bounded one-line summary with delta and divergent snippet", () => {
    const a = mkPji({ body: "The government must prove element one and element two." });
    const b = mkPji({ body: "The prosecution must prove element one and element two and a further third element bearing on intent." });
    const s = summarizeDifference(a, b);
    expect(s.length).toBeLessThan(400);
    expect(/Length delta/i.test(s)).toBe(true);
    expect(/divergent|identical/i.test(s)).toBe(true);
  });

  it("handles identical bodies gracefully", () => {
    const a = mkPji({ body: "Identical body text here for both circuit variants." });
    const b = mkPji({ body: "Identical body text here for both circuit variants." });
    const s = summarizeDifference(a, b);
    expect(/identical/i.test(s)).toBe(true);
  });
});

describe("Federal Jury Instruction Brief — render layer", () => {
  it("empty data still renders methodology + disclaimer, no section body", () => {
    const html = renderFederalJuryInstructionBrief(
      mkData({ pji: null, burdenSentences: [], attackAuthorities: [], circuitVariants: [], isEmpty: true }),
    );
    expect(html).toContain("Methodology");
    expect(html).toContain("legal INFORMATION");
    expect(html).not.toContain("Pattern Jury Instruction &mdash; Verbatim");
    expect(html).not.toContain("Top 5 Historical Attack Authorities");
  });

  // Helper — strip the PJI framing + body wrappers before UPL scanning.
  // The PJI body is verbatim public federal court text and CAN legitimately
  // contain jury-voice phrases ("you should", "the jury should"). The
  // framing disclaimer itself quotes those phrases to disambiguate their
  // source. Both are carved out of UPL scanning (wave-pristine-r1 WARNING
  // #3 special-case). All other rendered content — headings, our prose,
  // attack-table rows, methodology — must still be clean.
  function stripPjiRegions(html: string): string {
    return html
      .replace(/<div class="pji-framing">[\s\S]*?<\/div>/g, "")
      .replace(/<div class="pji-body">[\s\S]*?<\/div>/g, "");
  }

  it("no UPL-banned phrase renders in assembled output (outside PJI carve-out)", () => {
    const html = renderFederalJuryInstructionBrief(
      mkData({
        burdenSentences: [
          { sentence: "The government must prove each element beyond a reasonable doubt." },
        ],
        attackAuthorities: [mkAuthority()],
        circuitVariants: [
          {
            circuit: 1,
            circuitName: "First Circuit",
            instruction_number: "4.13",
            title: "Wire Fraud, 18 U.S.C. § 1343",
            difference_summary: "Length delta +3% vs primary; first divergent phrasing: \"To convict the defendant of wire fraud…\"",
            source_url: "https://www.ca1.uscourts.gov/jury-instructions/4-13",
          },
        ],
      }),
    );
    const lower = stripPjiRegions(html).toLowerCase();
    for (const banned of UPL_BANNED_PHRASES) {
      expect(lower).not.toContain(banned);
    }
  });

  it("PJI framing block + body wrapper render, and framing disambiguates jury voice (CRITICAL #2)", () => {
    // PJI body is verbatim court text; this one contains a jury-voice
    // "you should" phrase, which is the exact scenario CRITICAL #2 targets.
    const html = renderFederalJuryInstructionBrief(
      mkData({
        pji: mkPji({
          body:
            "You should consider all the evidence. The jury should deliberate together. " +
            "The presumption of innocence applies throughout.",
        }),
      }),
    );
    // Framing block present
    expect(html).toContain('<div class="pji-framing">');
    // Framing disambiguation message present
    expect(html).toContain("jury&rsquo;s deliberation duty");
    expect(html).toContain("NOT legal advice from us to you");
    // Body wrapper present
    expect(html).toContain('<div class="pji-body">');
    // Body text (escaped) preserved verbatim
    expect(html).toContain("You should consider all the evidence");
    expect(html).toContain("The jury should deliberate together");
    // Outside PJI regions — no "you should" leaks
    const outside = stripPjiRegions(html).toLowerCase();
    expect(outside).not.toContain("you should");
    expect(outside).not.toContain("the jury should");
  });

  it("every rendered attack-authority row has a valid href (URL HARD rule)", () => {
    const html = renderFederalJuryInstructionBrief(
      mkData({
        attackAuthorities: [
          mkAuthority(),
          mkAuthority({ rank: 2, case_name: "United States v. Santos", source_url: "https://www.courtlistener.com/opinion/145877/united-states-v-santos/" }),
        ],
      }),
    );
    // Count <a> anchors in the attack table — each row must produce one
    const rowMatches = html.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
    const bodyRows = rowMatches.filter((r) => r.includes("courtlistener.com"));
    expect(bodyRows.length).toBe(2);
    for (const row of bodyRows) {
      expect(row).toMatch(/href="https:\/\/[^"]+"/);
    }
  });

  it("HTML injection in case_name + pji.body is escaped", () => {
    const html = renderFederalJuryInstructionBrief(
      mkData({
        pji: mkPji({
          body: 'Normal text <script>alert("pji")</script> more text.',
          title: 'Wire Fraud <img src=x onerror=alert(1)>',
        }),
        attackAuthorities: [
          mkAuthority({ case_name: 'Evil v. <script>alert("xss")</script>' }),
        ],
      }),
    );
    expect(html).not.toContain("<script>alert");
    // onerror= appears inside escaped text but it's inert because the < /
    // > around <img> are escaped. Assert the containing tag IS escaped.
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x");
  });

  it("renders PJI body verbatim inside a blockquote when primary present", () => {
    const body = "To convict the defendant, the government must prove each element beyond a reasonable doubt.";
    const html = renderFederalJuryInstructionBrief(mkData({ pji: mkPji({ body }) }));
    expect(html).toContain("Pattern Jury Instruction");
    expect(html).toContain("fjb-verbatim");
    // Verbatim body is present after HTML escape (no < or > in sample so equal)
    expect(html).toContain(body);
  });

  it("renders burden sentences as italicized list when provided", () => {
    const html = renderFederalJuryInstructionBrief(
      mkData({
        burdenSentences: [
          { sentence: "The government must prove guilt beyond a reasonable doubt." },
          { sentence: "The presumption of innocence applies throughout the trial." },
        ],
      }),
    );
    expect(html).toContain("Burden of Proof");
    expect(html).toContain("fjb-burden-list");
    expect(html).toContain("government must prove guilt beyond a reasonable doubt");
    expect(html).toContain("presumption of innocence applies");
  });

  it("surfaces limitations in a side-aside block", () => {
    const html = renderFederalJuryInstructionBrief(
      mkData({
        limitations: [
          "No pattern instruction cached for the Eleventh Circuit; showing Ninth Circuit as the closest reference.",
        ],
      }),
    );
    expect(html).toContain("Known limitations");
    expect(html).toContain("Eleventh Circuit");
  });

  it("renders circuit variants with difference summary", () => {
    const html = renderFederalJuryInstructionBrief(
      mkData({
        circuitVariants: [
          {
            circuit: 8,
            circuitName: "Eighth Circuit",
            instruction_number: "6.18.1343",
            title: "Wire Fraud",
            difference_summary: "Length delta +12% vs primary; first divergent phrasing: \"It is a federal crime…\"",
            source_url: "https://juryinstructions.ca8.uscourts.gov/6.18",
          },
        ],
      }),
    );
    expect(html).toContain("Alternative Circuit Variants");
    expect(html).toContain("Eighth Circuit");
    expect(html).toContain("Length delta +12%");
  });
});

describe("Federal Jury Instruction Brief — FEDERAL_CHARGES catalog shape", () => {
  it("every slug is unique, lowercase, dash-separated", () => {
    const keys = Object.keys(FEDERAL_CHARGES);
    for (const k of keys) {
      expect(k).toMatch(/^[a-z0-9-]+$/);
      expect(FEDERAL_CHARGES[k].slug).toBe(k);
    }
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("authoritySlugs reference real charge_type_top_authorities slugs", () => {
    // Subset of the live distinct list as of 2026-04-23 inspection
    const known = new Set([
      "aggravated-assault", "aggravated-battery", "aiding-abetting",
      "assault-firearm", "battery", "burglary", "child-endangerment",
      "child-exploitation", "contempt-of-court", "drug-distribution",
      "drug-manufacturing", "drug-possession-cocaine",
      "drug-possession-opioids", "drug-possession-prescription",
      "drug-trafficking", "dui-dwi", "dui-drugs", "embezzlement",
      "felon-in-possession", "fraud-general", "forgery", "kidnapping",
      "obstruction-justice", "robbery", "sex-offense-contact",
      "sex-offense-digital", "sexual-assault", "weapons-possession",
      "illegal-discharge",
    ]);
    for (const entry of listFederalCharges()) {
      for (const a of entry.authoritySlugs) {
        expect(known.has(a)).toBe(true);
      }
    }
  });
});
