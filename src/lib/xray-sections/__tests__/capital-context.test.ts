/**
 * Unit tests for X-Ray Section X3 — Capital-Adjacency Context (TICKET-19).
 *
 * Coverage gates:
 *   1. Render gate — empty output when shouldRender=false (HARD)
 *   2. UPL parity — rendered HTML never contains banned phrases
 *   3. X-Ray heading parity — wrapper labels section as X-Ray-tier
 *   4. shouldRender false when chargeClass null OR ineligible
 */
import { describe, it, expect } from "vitest";
import { UPL_BANNED_PHRASES } from "@/lib/charge-slug-maps";
import {
  type XrayCapitalContextData,
  renderXrayCapitalContext,
} from "../capital-context";
import { getCapitalContext } from "@/lib/dpic/capital-context";

function mkXrayData(over: Partial<XrayCapitalContextData> = {}): XrayCapitalContextData {
  return {
    context: getCapitalContext({
      state: "TX",
      chargeClass: "murder-capital",
      surface: "xray",
      lastDecadeExecutions: 73,
      lastExecutionYear: 2025,
    }),
    shouldRender: true,
    limitations: [],
    ...over,
  };
}

describe("renderXrayCapitalContext — render gate", () => {
  it("returns empty string when shouldRender=false (HARD)", () => {
    const html = renderXrayCapitalContext({
      context: null,
      shouldRender: false,
      limitations: [],
    });
    expect(html).toBe("");
  });

  it("returns empty string when context is null even if shouldRender=true (defense in depth)", () => {
    const html = renderXrayCapitalContext({
      context: null,
      shouldRender: true,
      limitations: [],
    });
    expect(html).toBe("");
  });

  it("returns full HTML when eligible context supplied", () => {
    const html = renderXrayCapitalContext(mkXrayData());
    expect(html).toContain("X-Ray");
    expect(html).toContain("Capital-Eligibility Check");
    expect(html).toContain("can theoretically reach");
    expect(html).toContain("TX");
  });
});

describe("renderXrayCapitalContext — UPL parity", () => {
  it("never emits banned UPL phrases", () => {
    const html = renderXrayCapitalContext(mkXrayData());
    const lower = html.toLowerCase();
    const hits = UPL_BANNED_PHRASES.filter((p) => lower.includes(p));
    expect(hits, `Banned UPL phrases found: ${hits.join(", ")}`).toEqual([]);
  });

  it("never emits predictive language", () => {
    const html = renderXrayCapitalContext(mkXrayData());
    const lower = html.toLowerCase();
    expect(lower).not.toMatch(/will be charged|you will face|expect to be sentenced|death is likely/);
  });

  it("retains DPIC source citations on X-Ray surface", () => {
    const html = renderXrayCapitalContext(mkXrayData());
    expect(html).toContain("deathpenaltyinfo.org");
    expect(html).toContain("executions.csv");
  });
});

describe("renderXrayCapitalContext — X-Ray-typed heading", () => {
  it("includes X-Ray tier label so buyer reads in tier context", () => {
    const html = renderXrayCapitalContext(mkXrayData());
    expect(html).toContain("Capital-Eligibility Check (X-Ray)");
  });
});
