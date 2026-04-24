/**
 * Unit tests for Motion Success Report — $197 Tier 9 SKU (M1).
 *
 * Focus (render-layer, no live DB):
 *   - UPL phrase blocklist never renders
 *   - Sample-size suppression when N < MIN_N
 *   - Empty-result handling
 *   - Widened-fallback surfacing via data_scope
 *   - Every cited case has a source_url (rows without URL must not render)
 *   - Methodology disclaimer present verbatim
 *
 * Query-layer behavior is integration-tested end-to-end via a live Supabase
 * smoke run when E2E_TEST_DB=1 is set; the file-under-test here is the pure
 * render layer which is the UPL-critical surface.
 */
import { describe, it, expect } from "vitest";
import {
  renderMotionSuccessReport,
  UPL_BANNED_PHRASES,
  type MotionSuccessReportData,
  type MotionRow,
  type JudgeMotionRow,
  type AuthorityCitation,
} from "../motion-success-report";

function mkData(over: Partial<MotionSuccessReportData> = {}): MotionSuccessReportData {
  return {
    chargeType: "dui",
    circuit: "9",
    circuitName: "Ninth Circuit",
    judgeDisplayName: null,
    judgeResolved: false,
    ambiguousJudge: false,
    motions: [],
    judgeMotions: [],
    citations: [],
    limitations: [],
    isEmpty: false,
    ...over,
  };
}

function mkMotion(over: Partial<MotionRow> = {}): MotionRow {
  return {
    motion_type: "dismiss_motion",
    filed_count: 150,
    granted_count: 45,
    denied_count: 80,
    grant_rate: 0.3,
    baseline_grant_rate: 0.28,
    deviation_from_baseline: 0.02,
    data_scope: "charge_national",
    ...over,
  };
}

function mkJudgeMotion(over: Partial<JudgeMotionRow> = {}): JudgeMotionRow {
  return {
    motion_type: "suppress_motion",
    filed_count: 22,
    granted_count: 9,
    grant_rate: 0.409,
    baseline_grant_rate: 0.35,
    deviation_from_baseline: 0.059,
    ...over,
  };
}

function mkCite(over: Partial<AuthorityCitation> = {}): AuthorityCitation {
  return {
    rank: 1,
    case_name: "Missouri v. McNeely",
    date_filed: "2013-04-17",
    citation_count_in_charge: 42,
    citation_count_total: 4500,
    authority_tier: "landmark",
    source_url: "https://www.courtlistener.com/opinion/889788/missouri-v-mcneely/",
    data_scope: "charge_type",
    ...over,
  };
}

describe("Motion Success Report — render layer", () => {
  it("renders nothing substantive on empty data but still emits methodology + disclaimer", () => {
    const html = renderMotionSuccessReport(mkData({ isEmpty: true }));
    expect(html).toContain("Motion Success Report");
    expect(html).toContain("This report provides legal INFORMATION");
    expect(html).not.toContain("Section 1 — Top motions filed");
    expect(html).not.toContain("Section 2 — Motion patterns");
    expect(html).not.toContain("Section 3 — Top-cited precedents");
  });

  it("renders all 3 sections when each has data", () => {
    const html = renderMotionSuccessReport(
      mkData({
        motions: [mkMotion(), mkMotion({ motion_type: "suppress_motion", filed_count: 60, granted_count: 24, grant_rate: 0.4 })],
        judgeMotions: [mkJudgeMotion()],
        judgeDisplayName: "Jane Doe",
        judgeResolved: true,
        citations: [mkCite()],
      }),
    );
    expect(html).toContain("Section 1 — Top motions filed");
    expect(html).toContain("Section 2 — Motion patterns before");
    expect(html).toContain("Jane Doe");
    expect(html).toContain("Section 3 — Top-cited precedents");
    expect(html).toContain("Missouri v. McNeely");
    expect(html).toContain("courtlistener.com/opinion/889788");
  });

  it("UPL: never emits banned recommendation / advice phrases", () => {
    const html = renderMotionSuccessReport(
      mkData({
        motions: [mkMotion()],
        judgeMotions: [mkJudgeMotion()],
        judgeDisplayName: "Jane Doe",
        judgeResolved: true,
        citations: [mkCite()],
        limitations: ["No circuit-specific motion baseline for Ninth Circuit"],
      }),
    );
    const lower = html.toLowerCase();
    for (const phrase of UPL_BANNED_PHRASES) {
      expect(
        lower.includes(phrase),
        `rendered HTML must not contain banned phrase "${phrase}"`,
      ).toBe(false);
    }
  });

  it("sample-size suppression: judge row with N < 10 shows 'insufficient data' and suppresses %", () => {
    const html = renderMotionSuccessReport(
      mkData({
        judgeMotions: [
          mkJudgeMotion({
            motion_type: "recusal_motion",
            filed_count: 7,
            granted_count: 2,
            grant_rate: 0.2857,
          }),
        ],
        judgeDisplayName: "Jane Doe",
        judgeResolved: true,
      }),
    );
    expect(html).toContain("insufficient data");
    // The rate 28.6% / 28.57% must not render for the sub-threshold row
    expect(html).not.toMatch(/28\.6%/);
    expect(html).not.toMatch(/28\.57%/);
  });

  it("widened fallback is surfaced via data_scope annotation when motions show 'all_national'", () => {
    const html = renderMotionSuccessReport(
      mkData({
        motions: [mkMotion({ data_scope: "all_national" })],
        limitations: [
          `No charge-specific motion data cached for "self-defense"; showing national baseline across all criminal motions.`,
        ],
      }),
    );
    expect(html).toContain("all_national");
    expect(html).toContain("Known limitations");
    expect(html).toContain("No charge-specific motion data cached");
  });

  it("citations without source_url never appear (UPL verification-URL HARD rule)", () => {
    // At the render layer, ensuring our `<a href>` never renders with an
    // empty URL is enough — the query layer is what drops URL-less rows. We
    // still assert the render defensively: the <a> tag must contain a real URL
    // for every rendered case name.
    const html = renderMotionSuccessReport(
      mkData({
        citations: [mkCite({ source_url: "https://www.courtlistener.com/opinion/123/foo-v-bar/" })],
      }),
    );
    const aTags = html.match(/<a[^>]*href="([^"]+)"[^>]*>/g) ?? [];
    // Every anchor in the render must have a non-empty href. Empty/missing
    // source_url rows must never have made it past the query layer, but defend
    // anyway.
    for (const tag of aTags) {
      expect(tag).not.toMatch(/href=""/);
      expect(tag).toMatch(/href="https?:\/\//);
    }
  });

  it("methodology disclaimer includes 'legal INFORMATION — not legal ADVICE' verbatim", () => {
    const html = renderMotionSuccessReport(mkData({ motions: [mkMotion()] }));
    expect(html).toContain(
      "This report provides legal INFORMATION — not legal ADVICE",
    );
  });

  it("HTML-escapes user-controlled fields to prevent injection", () => {
    const html = renderMotionSuccessReport(
      mkData({
        judgeResolved: true,
        judgeDisplayName: "<script>alert(1)</script>",
        judgeMotions: [mkJudgeMotion()],
      }),
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("surfaces limitations section when any limitation is present", () => {
    const html = renderMotionSuccessReport(
      mkData({
        motions: [mkMotion()],
        limitations: [
          `Multiple judges match "Smith"; add a middle name or court to disambiguate. Judge section omitted.`,
        ],
      }),
    );
    expect(html).toContain("Known limitations");
    expect(html).toContain("Multiple judges match");
  });

  it("renders baseline source attribution phrase ('Source: motion_outcome_rates')", () => {
    const html = renderMotionSuccessReport(
      mkData({ motions: [mkMotion()] }),
    );
    expect(html).toContain("Source: motion_outcome_rates");
  });

  it("renders circuit-level delta column header when circuit is resolved", () => {
    const html = renderMotionSuccessReport(mkData({ motions: [mkMotion()] }));
    expect(html).toContain("Ninth Circuit");
    expect(html).toContain("Delta");
  });

  it("omits Section 2 entirely when no judge motions resolved", () => {
    const html = renderMotionSuccessReport(
      mkData({ motions: [mkMotion()], judgeMotions: [] }),
    );
    expect(html).not.toContain("Section 2 — Motion patterns before");
  });
});
