/**
 * Unit tests for Appendix H — Live Authority Map (IB $997 E1).
 *
 * Focus areas:
 *   1. UPL banned-phrase blocklist (counter-auth phrased neutrally)
 *   2. Tier monotonicity (IB top-15 strictly > M2 top 10; full quote vs 1-line)
 *   3. Counter-authority warning only when velocity_tier = 'fading'
 *   4. Every row has CourtListener URL in the rendered markdown
 *   5. Bold cross-reference heuristic on rising rows
 */
import { describe, it, expect } from "vitest";
import {
  renderLiveAuthorityMap,
  IB_AUTHORITY_TOP_N,
  type LiveAuthorityMapData,
  type AuthorityMapRow,
} from "../live-authority-map";
import { UPL_BANNED_PHRASES } from "@/lib/charge-slug-maps";

function mkRow(over: Partial<AuthorityMapRow> = {}): AuthorityMapRow {
  return {
    rank: 1,
    case_name: "Miranda v. Arizona",
    date_filed: "1966-06-13",
    citation: "384 U.S. 436",
    authority_tier: "landmark",
    citation_count_in_charge: 420,
    citation_count_total: 4800,
    quote_full:
      "Prior to any questioning, the person must be warned that he has a right to remain silent, that any statement he does make may be used as evidence against him. The right to have counsel present at the interrogation is indispensable to the protection of the Fifth Amendment privilege under the system we delineate today.",
    velocity: 180.4,
    velocity_tier: "stable",
    rising_flag: false,
    counter_authority_warning: false,
    source_url: "https://www.courtlistener.com/opinion/107252/miranda-v-arizona/",
    jurisdiction: "F",
    data_scope: "charge_type",
    ...over,
  };
}

function mkData(over: Partial<LiveAuthorityMapData> = {}): LiveAuthorityMapData {
  return {
    chargeType: "drug-possession",
    state: "CA",
    circuit: "9",
    circuitName: "Ninth Circuit",
    rows: [mkRow()],
    limitations: [],
    isEmpty: false,
    ...over,
  };
}

// ------------------------------------------------------------
// UPL banned phrases
// ------------------------------------------------------------

describe("Appendix H — Live Authority Map · UPL blocklist", () => {
  it("never emits banned UPL phrases even with counter-auth warnings, full quote, and 15 rows", () => {
    const data = mkData({
      rows: Array.from({ length: IB_AUTHORITY_TOP_N }, (_, i) =>
        mkRow({
          rank: i + 1,
          case_name: `Case ${i + 1}`,
          counter_authority_warning: i % 3 === 0,
          velocity_tier: i % 3 === 0 ? "fading" : "stable",
          rising_flag: i % 5 === 0,
        }),
      ),
    });
    const md = renderLiveAuthorityMap(data);
    const lower = md.toLowerCase();
    for (const phrase of UPL_BANNED_PHRASES) {
      expect(
        lower.includes(phrase),
        `rendered markdown must not contain banned phrase "${phrase}"`,
      ).toBe(false);
    }
  });

  it("counter-auth note uses neutral 'declining citation velocity' language, never 'don't use'", () => {
    const data = mkData({
      rows: [
        mkRow({
          counter_authority_warning: true,
          velocity_tier: "fading",
        }),
      ],
    });
    const md = renderLiveAuthorityMap(data);
    expect(md).toContain("declining citation velocity");
    expect(md).not.toMatch(/don't use|do not use|avoid citing/i);
  });

  it("emits methodology legal-INFORMATION gate", () => {
    const md = renderLiveAuthorityMap(mkData());
    expect(md).toContain("legal INFORMATION");
    expect(md).toContain("not legal ADVICE");
    // Methodology must disclaim prediction (any equivalent phrasing)
    expect(md).toMatch(/not a prediction|is a prediction\./i);
  });
});

// ------------------------------------------------------------
// Tier monotonicity (HARD)
// ------------------------------------------------------------

describe("Appendix H — Live Authority Map · tier monotonicity guardrails", () => {
  it("IB top-N strictly exceeds M2 top 10", () => {
    expect(IB_AUTHORITY_TOP_N).toBeGreaterThan(10);
    expect(IB_AUTHORITY_TOP_N).toBe(15);
  });

  it("renders a full multi-sentence quote when cached (monotonicity depth over M2 1-line)", () => {
    const longQuote =
      "Prior to any questioning, the person must be warned. " +
      "The warning must include the right to counsel. " +
      "Anything said can be used against them.";
    const md = renderLiveAuthorityMap(
      mkData({ rows: [mkRow({ quote_full: longQuote })] }),
    );
    // All three sentences present in output (multi-sentence depth test)
    expect(md).toContain("Prior to any questioning");
    expect(md).toContain("right to counsel");
    expect(md).toContain("used against them");
  });
});

// ------------------------------------------------------------
// Counter-authority warning
// ------------------------------------------------------------

describe("Appendix H — Live Authority Map · counter-authority flag", () => {
  it("renders counter-auth note ONLY when counter_authority_warning=true", () => {
    const withWarn = renderLiveAuthorityMap(
      mkData({
        rows: [mkRow({ counter_authority_warning: true, velocity_tier: "fading" })],
      }),
    );
    expect(withWarn).toContain("Counter-authority note");

    const noWarn = renderLiveAuthorityMap(
      mkData({
        rows: [mkRow({ counter_authority_warning: false, velocity_tier: "stable" })],
      }),
    );
    expect(noWarn).not.toContain("Counter-authority note");
  });

  it("velocity label appears on every row (rising / fading / stable)", () => {
    const md = renderLiveAuthorityMap(
      mkData({
        rows: [
          mkRow({ rank: 1, rising_flag: true, velocity_tier: "rising" }),
          mkRow({ rank: 2, case_name: "Case B", rising_flag: false, velocity_tier: "fading", counter_authority_warning: true }),
          mkRow({ rank: 3, case_name: "Case C", rising_flag: false, velocity_tier: "stable" }),
        ],
      }),
    );
    expect(md).toContain("velocity: rising");
    expect(md).toContain("velocity: fading");
    expect(md).toContain("velocity: stable");
  });
});

// ------------------------------------------------------------
// URL + cross-ref
// ------------------------------------------------------------

describe("Appendix H — Live Authority Map · URLs + cross-ref heuristic", () => {
  it("every row includes its CourtListener URL in markdown output", () => {
    const md = renderLiveAuthorityMap(
      mkData({
        rows: [
          mkRow({ rank: 1, source_url: "https://www.courtlistener.com/opinion/1/a/" }),
          mkRow({ rank: 2, case_name: "Case B", source_url: "https://www.courtlistener.com/opinion/2/b/" }),
        ],
      }),
    );
    expect(md).toContain("https://www.courtlistener.com/opinion/1/a/");
    expect(md).toContain("https://www.courtlistener.com/opinion/2/b/");
  });

  it("bolds rising rows as a cross-ref heuristic to Appendix G granted-motion cases", () => {
    const md = renderLiveAuthorityMap(
      mkData({
        rows: [
          mkRow({ rank: 1, rising_flag: true, case_name: "Rising Case" }),
          mkRow({ rank: 2, rising_flag: false, case_name: "Stable Case" }),
        ],
      }),
    );
    // Bold marker around the rank for rising row
    expect(md).toContain("**1. [Rising Case]");
    // Unbold for non-rising (just numeric prefix, no leading **)
    expect(md).toContain("2. [Stable Case]");
    expect(md).not.toContain("**2. [Stable Case]");
  });

  it("appendix heading is Appendix H (not F or G)", () => {
    const md = renderLiveAuthorityMap(mkData());
    expect(md).toContain("## Appendix H: Live Authority Map");
    expect(md).not.toContain("## Appendix F");
    expect(md).not.toContain("## Appendix G");
  });
});

// ------------------------------------------------------------
// Empty + limitation paths
// ------------------------------------------------------------

describe("Appendix H — Live Authority Map · empty + limitation paths", () => {
  it("empty data renders empty string", () => {
    const empty: LiveAuthorityMapData = {
      chargeType: "other",
      state: null,
      circuit: null,
      circuitName: null,
      rows: [],
      limitations: [],
      isEmpty: true,
    };
    expect(renderLiveAuthorityMap(empty)).toBe("");
  });

  it("surfaces limitations when jurisdiction filter narrowed the list", () => {
    const md = renderLiveAuthorityMap(
      mkData({
        limitations: ["Authority list narrowed to state-court + federal opinions relevant to CA."],
      }),
    );
    expect(md).toContain("Known limitations");
    expect(md).toContain("narrowed to state-court");
  });

  it("falls back gracefully when a row has no cached quote", () => {
    const md = renderLiveAuthorityMap(
      mkData({ rows: [mkRow({ quote_full: null })] }),
    );
    expect(md).toContain("No canonical quote cached");
  });
});
