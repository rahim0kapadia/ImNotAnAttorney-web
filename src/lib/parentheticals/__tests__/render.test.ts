/**
 * TICKET-12: parenthetical render tests.
 *
 * Pure function tests — no DB, no mocks. Verifies HTML escaping, surface
 * variation (xray vs jrc), and the empty-input degradation contract that
 * lets callers `+=` the output unconditionally.
 */
import { describe, it, expect } from "vitest";
import { renderParentheticalsAside } from "@/lib/parentheticals/render";
import type { Parenthetical } from "@/lib/parentheticals/lookup";

function makeParenthetical(over: Partial<Parenthetical> = {}): Parenthetical {
  return {
    parenthetical_id: "p-1",
    described_cluster_id: "145875",
    describing_text:
      "holding that a complaint survives a motion to dismiss where the factual allegations state a plausible claim for relief",
    describing_case_name: "Hill v. Lappin",
    describing_case_name_short: "Hill",
    describing_date_filed: "2010-12-28",
    describing_citation_count: 5039,
    source_url: "https://www.courtlistener.com/opinion/181820/",
    ...over,
  };
}

describe("renderParentheticalsAside", () => {
  it("returns empty string for empty input (caller-safe concat)", () => {
    expect(renderParentheticalsAside([])).toBe("");
    // @ts-expect-error guard against bad caller
    expect(renderParentheticalsAside(null)).toBe("");
    // @ts-expect-error guard against bad caller
    expect(renderParentheticalsAside(undefined)).toBe("");
  });

  it("renders xray surface heading + aria label", () => {
    const out = renderParentheticalsAside([makeParenthetical()], "xray");
    expect(out).toContain("How later judges summarized this case");
    expect(out).toContain(
      "Parenthetical summaries from later opinions citing this case"
    );
  });

  it("renders jrc surface heading + aria label", () => {
    const out = renderParentheticalsAside([makeParenthetical()], "jrc");
    expect(out).toContain("What later judges have called this case&#39;s holding");
    expect(out).toContain("Subsequent judicial summaries of this case");
  });

  it("links the case name + year to the source URL with safe rel/target", () => {
    const out = renderParentheticalsAside([makeParenthetical()]);
    expect(out).toContain('href="https://www.courtlistener.com/opinion/181820/"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain("Hill (2010)");
  });

  it("escapes HTML in describing_text", () => {
    const out = renderParentheticalsAside([
      makeParenthetical({
        describing_text: "<script>alert('xss')</script> & more",
      }),
    ]);
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("&amp; more");
  });

  it("escapes HTML in case names", () => {
    const out = renderParentheticalsAside([
      makeParenthetical({
        describing_case_name_short: "<img onerror='x'>",
        describing_case_name: null,
      }),
    ]);
    expect(out).not.toContain("<img onerror");
    expect(out).toContain("&lt;img onerror=&#39;x&#39;&gt;");
  });

  it("truncates long quotes with ellipsis", () => {
    const long = "a".repeat(500);
    const out = renderParentheticalsAside([
      makeParenthetical({ describing_text: long }),
    ]);
    expect(out).toContain("&hellip;");
    // Body should be capped at 400 chars before the ellipsis
    expect(out).toContain("a".repeat(400));
    expect(out).not.toContain("a".repeat(401));
  });

  it("falls back from short -> full case name -> 'Citing opinion'", () => {
    const out1 = renderParentheticalsAside([
      makeParenthetical({
        describing_case_name_short: null,
        describing_case_name: "Full Case Name",
      }),
    ]);
    expect(out1).toContain("Full Case Name");
    const out2 = renderParentheticalsAside([
      makeParenthetical({
        describing_case_name_short: null,
        describing_case_name: null,
      }),
    ]);
    expect(out2).toContain("Citing opinion");
  });

  it("renders all N parentheticals as separate blockquotes", () => {
    const out = renderParentheticalsAside([
      makeParenthetical({ parenthetical_id: "1", describing_text: "first text" }),
      makeParenthetical({
        parenthetical_id: "2",
        describing_text: "second text",
      }),
      makeParenthetical({ parenthetical_id: "3", describing_text: "third text" }),
    ]);
    expect((out.match(/<blockquote/g) ?? []).length).toBe(3);
    expect(out).toContain("first text");
    expect(out).toContain("second text");
    expect(out).toContain("third text");
  });

  it("handles missing date_filed gracefully (no '(year)' suffix)", () => {
    const out = renderParentheticalsAside([
      makeParenthetical({ describing_date_filed: null }),
    ]);
    expect(out).toContain("Hill</a>");
    expect(out).not.toMatch(/Hill \(\)/);
  });
});
