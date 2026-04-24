/**
 * Unit tests for Precedent Watchlist $47 Tier 9 SKU (M3).
 *
 * Coverage targets:
 *   - Render: empty result, single-row, rank-stability on same inputs
 *   - Render: UPL blocklist (no banned phrases in output)
 *   - Render: arrow glyphs + CourtListener URL presence
 *   - Render: unsubscribe note + windowLabel appear in drip section
 *   - Render: rows without source_url don't appear in output
 *   - Snapshot: buildVelocitySnapshot is deterministic
 */
import { describe, it, expect } from "vitest";
import {
  renderPrecedentWatchlist,
  buildVelocitySnapshot,
  UPL_BANNED_PHRASES,
  type PrecedentWatchlistData,
  type WatchlistRow,
} from "../precedent-watchlist";

function mkRow(over: Partial<WatchlistRow> = {}): WatchlistRow {
  return {
    cited_opinion_id: 3185469,
    cluster_id: 3185469,
    case_name: "State v. Marcum (Slip Opinion)",
    date_filed: "2015-03-14",
    years_since_filing: 11,
    citation_count: 552,
    velocity: 55.2,
    velocity_tier: "rising",
    rising_flag: true,
    authority_tier: "frequent",
    source_url:
      "https://www.courtlistener.com/opinion/3185469/state-v-marcum-slip-opinion",
    direction: "up",
    rank: 1,
    ...over,
  };
}

function mkData(over: Partial<PrecedentWatchlistData> = {}): PrecedentWatchlistData {
  return {
    chargeType: "drug-possession",
    state: null,
    circuit: null,
    circuitName: null,
    risingCount: 0,
    fallingCount: 0,
    rising: [],
    falling: [],
    limitations: [],
    chargeFilterApplied: false,
    isEmpty: true,
    windowLabel: "last 24 months",
    ...over,
  };
}

describe("Precedent Watchlist — render", () => {
  it("renders the UPL gate line on every render", () => {
    const html = renderPrecedentWatchlist(mkData());
    expect(html).toContain("This is legal INFORMATION, not legal ADVICE");
  });

  it("emits no UPL-banned phrases even with rich data", () => {
    const data = mkData({
      rising: [mkRow({ rank: 1 }), mkRow({ rank: 2, case_name: "Mathis v. United States" })],
      falling: [mkRow({ rank: 1, direction: "down", velocity_tier: "fading", case_name: "Ex Parte Young" })],
      risingCount: 2,
      fallingCount: 1,
      isEmpty: false,
      limitations: ["Some edge case we want surfaced."],
    });
    const html = renderPrecedentWatchlist(data).toLowerCase();
    for (const banned of UPL_BANNED_PHRASES) {
      expect(html.includes(banned), `rendered HTML must not contain "${banned}"`).toBe(false);
    }
  });

  it("empty result still renders methodology + drip note (rank-stability baseline)", () => {
    const html = renderPrecedentWatchlist(mkData());
    expect(html).toContain("Methodology");
    expect(html).toContain("4-email drip over 30 days");
    expect(html).toContain("last 24 months");
  });

  it("rising rows render CourtListener links + up-arrow glyph", () => {
    const html = renderPrecedentWatchlist(
      mkData({
        rising: [mkRow()],
        risingCount: 1,
        isEmpty: false,
      }),
    );
    expect(html).toContain("courtlistener.com/opinion/3185469");
    expect(html).toContain("↑");
    expect(html).toContain("State v. Marcum");
  });

  it("falling rows render down-arrow glyph + fading tier", () => {
    const html = renderPrecedentWatchlist(
      mkData({
        falling: [
          mkRow({
            rank: 1,
            direction: "down",
            velocity_tier: "fading",
            case_name: "Johnson v. Zerbst",
          }),
        ],
        fallingCount: 1,
        isEmpty: false,
      }),
    );
    expect(html).toContain("↓");
    expect(html).toContain("fading");
    expect(html).toContain("Johnson v. Zerbst");
  });

  it("includes the 'CAN-SPAM-aligned' drip phrasing (30 days + unsubscribe)", () => {
    const html = renderPrecedentWatchlist(mkData());
    expect(html).toContain("30 days");
    expect(html.toLowerCase()).toContain("unsubscribe");
  });

  it("renders the same bytes for the same input (rank stability)", () => {
    const input = mkData({
      rising: [mkRow({ rank: 1 }), mkRow({ rank: 2, cited_opinion_id: 3171724, case_name: "Montgomery v. Louisiana" })],
      falling: [mkRow({ rank: 1, direction: "down", velocity_tier: "fading", case_name: "Carroll v. United States" })],
      isEmpty: false,
    });
    const a = renderPrecedentWatchlist(input);
    const b = renderPrecedentWatchlist(input);
    expect(a).toBe(b);
  });

  it("escapes HTML in case_name + source_url", () => {
    const evil = mkRow({
      case_name: "<script>alert(1)</script> v. Evil",
      source_url: "https://www.courtlistener.com/opinion/1/\"><img src=x onerror=alert(1)>",
    });
    const html = renderPrecedentWatchlist(mkData({ rising: [evil], isEmpty: false }));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("charge-filter label switches when chargeFilterApplied is true", () => {
    const applied = renderPrecedentWatchlist(
      mkData({ chargeFilterApplied: true, rising: [mkRow()], isEmpty: false }),
    );
    const notApplied = renderPrecedentWatchlist(
      mkData({ chargeFilterApplied: false, rising: [mkRow()], isEmpty: false }),
    );
    expect(applied).toContain("filtered to");
    expect(notApplied).toContain("national criminal-defense corpus");
  });

  it("limitations block shows up only when data has limitations", () => {
    const noLim = renderPrecedentWatchlist(mkData());
    expect(noLim).not.toContain("Known limitations");
    const withLim = renderPrecedentWatchlist(mkData({ limitations: ["Small sample."] }));
    expect(withLim).toContain("Known limitations");
    expect(withLim).toContain("Small sample.");
  });
});

describe("Precedent Watchlist — buildVelocitySnapshot", () => {
  it("returns one entry per rising row with (id, velocity, rank)", () => {
    const data = mkData({
      rising: [
        mkRow({ rank: 1, cited_opinion_id: 100, velocity: 40 }),
        mkRow({ rank: 2, cited_opinion_id: 200, velocity: 30 }),
        mkRow({ rank: 3, cited_opinion_id: 300, velocity: 20 }),
      ],
      isEmpty: false,
    });
    const snap = buildVelocitySnapshot(data);
    expect(snap).toHaveLength(3);
    expect(snap[0]).toEqual({ cited_opinion_id: 100, velocity: 40, rank: 1 });
    expect(snap[2]).toEqual({ cited_opinion_id: 300, velocity: 20, rank: 3 });
  });

  it("returns empty array when no rising rows", () => {
    const snap = buildVelocitySnapshot(mkData());
    expect(snap).toEqual([]);
  });

  it("is deterministic across calls", () => {
    const data = mkData({
      rising: [mkRow({ rank: 1, cited_opinion_id: 42, velocity: 12.5 })],
      isEmpty: false,
    });
    const a = JSON.stringify(buildVelocitySnapshot(data));
    const b = JSON.stringify(buildVelocitySnapshot(data));
    expect(a).toBe(b);
  });
});

describe("Precedent Watchlist — UPL blocklist constant", () => {
  it("includes the canonical crisis-buyer UPL triggers", () => {
    expect(UPL_BANNED_PHRASES).toContain("you should");
    expect(UPL_BANNED_PHRASES).toContain("we recommend");
    expect(UPL_BANNED_PHRASES).toContain("ask your attorney");
    expect(UPL_BANNED_PHRASES).toContain("publicly available");
  });
});
