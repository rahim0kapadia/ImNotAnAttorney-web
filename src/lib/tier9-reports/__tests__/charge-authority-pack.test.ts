/**
 * Unit tests for Charge Authority Pack — $97 Tier 9 SKU (M2).
 *
 * Focus (render-layer, no live DB):
 *   - UPL phrase blocklist never renders
 *   - Empty-result handling
 *   - Every row must render source_url (HARD rule)
 *   - Pre-extracted quote fallback (no-quote-cached notice)
 *   - Velocity arrow rendering (up / down / flat)
 *   - Criminal-fallback surfacing via data_scope
 *   - Methodology disclaimer present verbatim
 *   - HTML injection in case_name / quote is escaped
 *
 * Query-layer is integration-tested via a live Supabase smoke run (see
 * scripts/smoke-charge-authority-pack.mjs when added); the file-under-test
 * here is the UPL-critical render layer.
 */
import { describe, it, expect } from "vitest";
import {
  renderChargeAuthorityPack,
  UPL_BANNED_PHRASES,
  CHARGE_TYPE_AUTHORITY_MAP,
  type ChargeAuthorityPackData,
  type AuthorityPackRow,
} from "../charge-authority-pack";

function mkData(over: Partial<ChargeAuthorityPackData> = {}): ChargeAuthorityPackData {
  return {
    chargeType: "dui",
    state: "CA",
    circuit: "9",
    circuitName: "Ninth Circuit",
    rows: [],
    limitations: [],
    isEmpty: false,
    ...over,
  };
}

function mkRow(over: Partial<AuthorityPackRow> = {}): AuthorityPackRow {
  return {
    rank: 1,
    case_name: "Missouri v. McNeely",
    date_filed: "2013-04-17",
    citation: "569 U.S. 141",
    authority_tier: "landmark",
    citation_count_in_charge: 42,
    citation_count_total: 4500,
    quote_sentence: "McNeely, 569 U.S. 141, 165 (2013) (holding that natural dissipation of alcohol in the bloodstream does not constitute per se exigent circumstance).",
    velocity: 0.82,
    velocity_tier: "rising",
    rising_flag: true,
    source_url: "https://www.courtlistener.com/opinion/889788/missouri-v-mcneely/",
    data_scope: "charge_type",
    ...over,
  };
}

describe("Charge Authority Pack — render layer", () => {
  it("empty data still renders methodology + disclaimer, no section body", () => {
    const html = renderChargeAuthorityPack(mkData({ isEmpty: true, rows: [] }));
    expect(html).toContain("Charge Authority Pack");
    expect(html).toContain("This report provides legal INFORMATION");
    expect(html).not.toContain("Top 10 Must-Cite Authorities");
  });

  it("renders full table when rows present, includes case + citation + URL", () => {
    const html = renderChargeAuthorityPack(
      mkData({
        rows: [
          mkRow(),
          mkRow({
            rank: 2,
            case_name: "Schmerber v. California",
            date_filed: "1966-06-20",
            citation: "384 U.S. 757",
            rising_flag: false,
            velocity_tier: "fading",
          }),
        ],
      }),
    );
    expect(html).toContain("Top 10 Must-Cite Authorities");
    expect(html).toContain("Missouri v. McNeely");
    expect(html).toContain("569 U.S. 141");
    expect(html).toContain("courtlistener.com/opinion/889788");
    expect(html).toContain("Schmerber v. California");
    expect(html).toContain("384 U.S. 757");
  });

  it("UPL HARD: never emits banned advice phrases across any row shape", () => {
    const html = renderChargeAuthorityPack(
      mkData({
        rows: [
          mkRow(),
          mkRow({ rank: 2, quote_sentence: null, citation: null, authority_tier: null }),
        ],
        limitations: [
          "No charge-specific authorities cached for \"self-defense\"; showing top criminal-law authorities by citation frequency.",
        ],
      }),
    );
    const lower = html.toLowerCase();
    for (const phrase of UPL_BANNED_PHRASES) {
      expect(lower).not.toContain(phrase);
    }
  });

  it("suppresses rows without source_url at the data layer — render requires URL on every rendered row", () => {
    // queryChargeAuthorityPack is responsible for filtering; the contract the
    // renderer relies on is: every row has a source_url. We assert the render
    // never omits the anchor for a row we give it.
    const html = renderChargeAuthorityPack(
      mkData({ rows: [mkRow()] }),
    );
    // anchor tag must be present for the one row we passed in
    expect(html).toMatch(/<a href="https:\/\/www\.courtlistener\.com\/opinion\/889788/);
  });

  it("shows 'no canonical quote cached' when quote_sentence is null", () => {
    const html = renderChargeAuthorityPack(
      mkData({ rows: [mkRow({ quote_sentence: null })] }),
    );
    expect(html).toContain("no canonical quote cached");
  });

  it("renders up arrow when rising_flag true", () => {
    const html = renderChargeAuthorityPack(
      mkData({ rows: [mkRow({ rising_flag: true })] }),
    );
    expect(html).toContain('aria-label="rising"');
    expect(html).toContain("cap-up");
  });

  it("renders down arrow when velocity_tier='fading' and not rising", () => {
    const html = renderChargeAuthorityPack(
      mkData({ rows: [mkRow({ rising_flag: false, velocity_tier: "fading" })] }),
    );
    expect(html).toContain('aria-label="fading"');
    expect(html).toContain("cap-down");
  });

  it("renders flat dash when neither rising nor fading", () => {
    const html = renderChargeAuthorityPack(
      mkData({ rows: [mkRow({ rising_flag: false, velocity_tier: "stable", velocity: 0.1 })] }),
    );
    expect(html).toContain('aria-label="stable"');
    expect(html).toContain("cap-flat");
  });

  it("surfaces the criminal-fallback note when any row uses citation_authority_criminal", () => {
    const html = renderChargeAuthorityPack(
      mkData({
        rows: [mkRow({ data_scope: "criminal_fallback" })],
        limitations: [
          "No charge-specific authorities cached for \"arson\"; showing top criminal-law authorities by citation frequency.",
        ],
      }),
    );
    expect(html).toContain("national criminal fallback");
    expect(html).toContain("citation_authority_criminal fallback");
    expect(html).toContain("Known limitations");
  });

  it("escapes HTML injection attempts in case_name and quote", () => {
    const html = renderChargeAuthorityPack(
      mkData({
        rows: [
          mkRow({
            case_name: "<script>alert('xss')</script>",
            quote_sentence: "<img src=x onerror='alert(1)'>",
          }),
        ],
      }),
    );
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("onerror='alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("surfaces state + circuit context in header without claiming circuit narrows authorities", () => {
    const html = renderChargeAuthorityPack(
      mkData({
        circuit: "9",
        circuitName: "Ninth Circuit",
        state: "CA",
        rows: [mkRow()],
      }),
    );
    expect(html).toContain("Ninth Circuit");
    expect(html).toContain("(CA)");
    // Must not claim the authority list is circuit-specific — authorities are national precedent
    expect(html).not.toMatch(/authorit(?:y|ies) (?:specific to|filtered to) (?:the )?Ninth Circuit/i);
  });

  it("header falls back gracefully when neither circuit nor state supplied", () => {
    const html = renderChargeAuthorityPack(
      mkData({ circuit: null, circuitName: null, state: null, rows: [mkRow()] }),
    );
    expect(html).toContain("Top defense authorities cited in federal criminal opinions");
  });
});

describe("CHARGE_TYPE_AUTHORITY_MAP", () => {
  it("only maps to values present in the live charge_type_top_authorities set (2026-04-23 snapshot)", () => {
    // Live-verified distinct charge_type values in the table.
    const LIVE_KNOWN = new Set([
      "aggravated-assault","aggravated-battery","aiding-abetting","assault-firearm",
      "assault-police-officer","battery","burglary","child-endangerment",
      "child-exploitation","contempt-of-court","disorderly-conduct","driving-on-suspended",
      "drug-distribution","drug-manufacturing","drug-possession-cocaine","drug-possession-marijuana",
      "drug-possession-opioids","drug-possession-prescription","drug-trafficking","dui-drugs",
      "dui-dwi","dui-felony-injury","embezzlement","felon-in-possession","fleeing-eluding",
      "forgery","fraud-general","hit-and-run","home-invasion","illegal-discharge",
      "indecent-exposure","jury-tampering","kidnapping","loitering","murder-second-degree",
      "obstruction-justice","other","prostitution","refusing-breath-test","resisting-arrest",
      "robbery","sex-offense-contact","sex-offense-digital","sexual-assault","simple-assault",
      "solicitation-prostitution","stalking","supervised-release-violation","theft-larceny",
      "unlawful-imprisonment","vandalism","vehicular-homicide","voluntary-manslaughter",
      "weapons-possession",
    ]);
    for (const [userSlug, internalSlugs] of Object.entries(CHARGE_TYPE_AUTHORITY_MAP)) {
      for (const slug of internalSlugs) {
        expect(LIVE_KNOWN.has(slug), `${userSlug} → ${slug} not in live set`).toBe(true);
      }
    }
  });
});
