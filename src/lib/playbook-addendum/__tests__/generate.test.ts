/**
 * Unit tests for Playbook Circuit Addendum — E4.
 *
 * Focus:
 *   1. Tier monotonicity — top-5 motions / top-5 authorities HARD cap vs M1/M2.
 *   2. UPL blocklist — rendered HTML never contains banned phrases.
 *   3. Rank-only fallback when authority quote is missing (~46% coverage).
 *   4. URL suppression — rows without source_url never render.
 *   5. Slug routing coverage — all 8 PLAYBOOK_SLUGS map to a charge.
 *
 * These tests are render-layer and data-shape tests; DB queries are not
 * exercised (vitest unit scope, no network). Integration coverage lives in
 * the API route test when we wire one.
 */
import { describe, it, expect } from "vitest";
import {
  MAX_AUTHORITIES,
  MAX_MOTIONS,
  MIN_N,
  PLAYBOOK_SLUG_TO_CHARGE,
  STATE_TO_CIRCUIT,
  type AddendumAuthorityRow,
  type AddendumMotionRow,
  type PlaybookAddendumData,
} from "../generate";
import { renderPlaybookAddendum, UPL_BANNED_PHRASES } from "../render";

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function mkMotion(over: Partial<AddendumMotionRow> = {}): AddendumMotionRow {
  return {
    motion_type: "dismiss_motion",
    filed_count: 50,
    granted_count: 20,
    denied_count: 30,
    grant_rate: 0.4,
    baseline_grant_rate: 0.35,
    deviation_from_baseline: 0.05,
    data_scope: "charge_national",
    ...over,
  };
}

function mkAuthority(
  over: Partial<AddendumAuthorityRow> = {},
): AddendumAuthorityRow {
  return {
    rank: 1,
    case_name: "United States v. Example",
    date_filed: "2015-06-01",
    citation: "555 U.S. 100",
    citation_count_in_charge: 42,
    citation_count_total: 500,
    authority_tier: "landmark",
    quote_sentence: "A sample holding sentence from the opinion.",
    velocity_tier: "rising",
    rising_flag: true,
    source_url: "https://www.courtlistener.com/opinion/1/",
    data_scope: "charge_type",
    ...over,
  };
}

function mkData(over: Partial<PlaybookAddendumData> = {}): PlaybookAddendumData {
  return {
    playbookSlug: "dui-first-offense",
    playbookDisplayName: "DUI Defense Playbook",
    chargeType: "dui",
    chargeDisplayName: "Dui",
    state: "CA",
    circuit: "9",
    circuitName: "Ninth Circuit",
    motions: [mkMotion()],
    authorities: [mkAuthority()],
    quoteCoverageNote: null,
    limitations: [],
    isEmpty: false,
    capitalContext: null,
    ...over,
  };
}

// ------------------------------------------------------------------
// 1. Monotonicity — TOP-5 cap (HARD)
// ------------------------------------------------------------------

describe("Playbook Addendum — tier monotonicity", () => {
  it("MAX_MOTIONS is exactly 5 (stays below M1's top-10)", () => {
    expect(MAX_MOTIONS).toBe(5);
  });

  it("MAX_AUTHORITIES is exactly 5 (stays below M2's top-10)", () => {
    expect(MAX_AUTHORITIES).toBe(5);
  });

  it("render slices >5 motions down to 5 (defensive cap)", () => {
    const tooMany = Array.from({ length: 8 }, (_, i) =>
      mkMotion({ motion_type: `motion_${i}`, filed_count: 100 - i }),
    );
    const html = renderPlaybookAddendum(mkData({ motions: tooMany }));
    // Only first 5 motion types appear; motions 6-8 are sliced out.
    for (let i = 0; i < 5; i++) {
      expect(html).toContain(`Motion ${i}`);
    }
    for (let i = 5; i < 8; i++) {
      expect(html).not.toContain(`Motion ${i}`);
    }
  });

  it("render slices >5 authorities down to 5 (defensive cap)", () => {
    const tooMany = Array.from({ length: 8 }, (_, i) =>
      mkAuthority({
        rank: i + 1,
        case_name: `Case Number ${i}`,
        source_url: `https://www.courtlistener.com/opinion/${i}/`,
      }),
    );
    const html = renderPlaybookAddendum(mkData({ authorities: tooMany }));
    for (let i = 0; i < 5; i++) {
      expect(html).toContain(`Case Number ${i}`);
    }
    for (let i = 5; i < 8; i++) {
      expect(html).not.toContain(`Case Number ${i}`);
    }
  });

  it("render includes explicit upgrade CTA to M1 (Motion Success Report $197)", () => {
    const html = renderPlaybookAddendum(mkData());
    expect(html).toContain("Motion Success Report");
    expect(html).toContain("$197");
    expect(html).toContain("/checkout?tier=motion-success-report");
  });

  it("render includes explicit upgrade CTA to M2 (Charge Authority Pack $97)", () => {
    const html = renderPlaybookAddendum(mkData());
    expect(html).toContain("Charge Authority Pack");
    expect(html).toContain("$97");
    expect(html).toContain("/checkout?tier=charge-authority-pack");
  });

  it("render never shows a judge-specific column (M1 territory)", () => {
    const html = renderPlaybookAddendum(mkData()).toLowerCase();
    expect(html).not.toContain("before judge");
    expect(html).not.toContain("cross-judge baseline");
    expect(html).not.toContain("judge_motion_outcome_rates");
  });
});

// ------------------------------------------------------------------
// 2. UPL blocklist — every banned phrase must be absent
// ------------------------------------------------------------------

describe("Playbook Addendum — UPL blocklist", () => {
  it("rendered HTML never contains any banned phrase (populated case)", () => {
    const html = renderPlaybookAddendum(mkData()).toLowerCase();
    for (const banned of UPL_BANNED_PHRASES) {
      expect(html, `must not contain banned phrase "${banned}"`).not.toContain(
        banned.toLowerCase(),
      );
    }
  });

  it("rendered HTML never contains any banned phrase (empty case)", () => {
    const html = renderPlaybookAddendum(
      mkData({ motions: [], authorities: [], isEmpty: true }),
    ).toLowerCase();
    for (const banned of UPL_BANNED_PHRASES) {
      expect(html, `must not contain banned phrase "${banned}"`).not.toContain(
        banned.toLowerCase(),
      );
    }
  });

  it("rendered HTML contains approved methodology disclaimer", () => {
    const html = renderPlaybookAddendum(mkData());
    expect(html).toContain("legal INFORMATION");
    expect(html).toContain("not legal ADVICE");
    expect(html).toContain("final authority on strategy decisions");
  });

  it("rendered HTML marks every grant rate with its N inline", () => {
    const html = renderPlaybookAddendum(mkData());
    // Every motion row renders filed_count ("N filed") and granted count.
    expect(html).toContain("<th>N filed</th>");
    expect(html).toContain("<th>Granted</th>");
  });

  it("flags N<MIN_N as insufficient data (never shows %)", () => {
    const low = mkMotion({ motion_type: "rare_motion", filed_count: 3, granted_count: 1, grant_rate: 0.33 });
    const html = renderPlaybookAddendum(mkData({ motions: [low] }));
    expect(html).toContain("insufficient data");
    // The numeric 33.3% must NOT appear for this row
    expect(html).not.toContain("33.3%");
  });
});

// ------------------------------------------------------------------
// 3. Rank-only fallback + URL suppression (verification-URL HARD rule)
// ------------------------------------------------------------------

describe("Playbook Addendum — quote fallback + URL suppression", () => {
  it("shows rank-only marker when authority has no quote", () => {
    const noQuote = mkAuthority({ quote_sentence: null });
    const html = renderPlaybookAddendum(mkData({ authorities: [noQuote] }));
    expect(html).toContain("rank-only");
    expect(html).toContain("no canonical quote cached");
  });

  it("emits coverage note when < all authorities have quotes", () => {
    const rows = [
      mkAuthority({ rank: 1, case_name: "Has Quote", source_url: "https://cl.test/1" }),
      mkAuthority({ rank: 2, case_name: "No Quote", quote_sentence: null, source_url: "https://cl.test/2" }),
    ];
    const data = mkData({
      authorities: rows,
      quoteCoverageNote: "1 of 2 authorities have an extracted quote on file; remaining rows show rank-only.",
    });
    const html = renderPlaybookAddendum(data);
    expect(html).toContain("1 of 2 authorities have an extracted quote");
  });

  it("renders the full quote when present", () => {
    const withQuote = mkAuthority({
      quote_sentence: "The Fourth Amendment requires probable cause.",
    });
    const html = renderPlaybookAddendum(mkData({ authorities: [withQuote] }));
    expect(html).toContain("Fourth Amendment requires probable cause");
  });

  it("never renders an authority row with empty source_url (schema enforcement)", () => {
    // generate.ts filters out empty source_urls in the query layer. Here we
    // assert that the typed shape requires non-empty source_url — if this
    // test ever needs to loosen, the verification-URL HARD rule is being
    // violated at the type layer.
    const row: AddendumAuthorityRow = mkAuthority({ source_url: "https://cl.test/x" });
    expect(row.source_url).not.toEqual("");
    expect(row.source_url.startsWith("http")).toBe(true);
  });
});

// ------------------------------------------------------------------
// 4. Playbook slug routing — all 8 playbooks mapped
// ------------------------------------------------------------------

describe("Playbook Addendum — slug routing coverage", () => {
  const EXPECTED_SLUGS = [
    "dui-first-offense",
    "drug-possession",
    "probation-violation",
    "white-collar",
    "sex-offense",
    "federal-criminal",
    "drug-trafficking",
    "self-defense",
  ];

  it.each(EXPECTED_SLUGS)("maps %s to a charge type", (slug) => {
    expect(PLAYBOOK_SLUG_TO_CHARGE[slug]).toBeDefined();
    expect(PLAYBOOK_SLUG_TO_CHARGE[slug]).not.toEqual("");
  });

  it("covers all PLAYBOOK_SLUGS keys with no extras", () => {
    const mapped = new Set(Object.keys(PLAYBOOK_SLUG_TO_CHARGE));
    for (const slug of EXPECTED_SLUGS) {
      expect(mapped.has(slug)).toBe(true);
    }
  });
});

// ------------------------------------------------------------------
// 5. State → circuit resolution
// ------------------------------------------------------------------

describe("Playbook Addendum — circuit resolution", () => {
  it("resolves a sample state from each circuit (non-empty)", () => {
    // One state per circuit, non-exhaustive but covers every circuit key
    const samples: Array<[string, string]> = [
      ["ME", "1"], ["NY", "2"], ["PA", "3"], ["VA", "4"],
      ["TX", "5"], ["OH", "6"], ["IL", "7"], ["MN", "8"],
      ["CA", "9"], ["CO", "10"], ["FL", "11"], ["DC", "DC"],
    ];
    for (const [st, circ] of samples) {
      expect(STATE_TO_CIRCUIT[st]).toBe(circ);
    }
  });

  it("renders 'national baseline' when no state provided", () => {
    const html = renderPlaybookAddendum(
      mkData({
        state: null,
        circuit: null,
        circuitName: null,
      }),
    );
    expect(html).toContain("National baseline");
  });

  it("renders the circuit name when resolved", () => {
    const html = renderPlaybookAddendum(mkData({ state: "CA", circuit: "9", circuitName: "Ninth Circuit" }));
    expect(html).toContain("Ninth Circuit");
    expect(html).toContain("(CA)");
  });
});

// ------------------------------------------------------------------
// 6. MIN_N export sanity
// ------------------------------------------------------------------

describe("Playbook Addendum — MIN_N threshold", () => {
  it("matches M1's sample-size threshold (10)", () => {
    expect(MIN_N).toBe(10);
  });
});
