/**
 * Unit tests for FARS county DUI helpers (TICKET-11).
 *
 * Covers:
 *   - FIPS normalization edge cases (null / negative / 5-digit GEOID)
 *   - Percentile bucketing boundaries
 *   - Mercer-voice prose render shape
 *   - UPL banned-phrase parity (every rendered surface scanned)
 *   - Null-row graceful degradation
 *
 * Does NOT exercise the live Supabase fetch — that's covered by the
 * post-apply matview verification (see commit message). This file is
 * pure-render tests so it runs offline.
 */
import { describe, it, expect } from "vitest";
import {
  describePercentileBucket,
  FARS_COUNTY_DENOMINATOR_LABEL,
  FARS_COUNTY_RECENT_WINDOW_YEARS,
  normalizeCountyFips,
  normalizeStateFips,
  renderCdCountyParagraph,
  renderDuiPlaybookCountySidebar,
  splitCountyGeoid,
  type CountyDuiContext,
} from "../county-dui";
import { UPL_BANNED_PHRASES } from "@/lib/charge-slug-maps";

// ------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------

function mkContext(over: Partial<CountyDuiContext> = {}): CountyDuiContext {
  // Pinellas FL — values mirror real matview rows captured at apply time.
  const recentYears = [
    { year: 2020, duiCrashes: 27, duiFatalities: 32, fatalitiesPer100kAdults: 4.15, stateYearPercentile: 23.3 },
    { year: 2019, duiCrashes: 20, duiFatalities: 20, fatalitiesPer100kAdults: 2.59, stateYearPercentile: 9.8 },
    { year: 2018, duiCrashes: 26, duiFatalities: 28, fatalitiesPer100kAdults: 3.63, stateYearPercentile: 23.0 },
    { year: 2017, duiCrashes: 27, duiFatalities: 28, fatalitiesPer100kAdults: 3.63, stateYearPercentile: 17.7 },
    { year: 2016, duiCrashes: 28, duiFatalities: 34, fatalitiesPer100kAdults: 4.41, stateYearPercentile: 30.6 },
  ];
  return {
    stateFips: "12",
    countyFips: "103",
    countyName: "Pinellas County",
    stateName: "Florida",
    latestYear: 2020,
    recentYears,
    recentYearsFatalities: recentYears.reduce((a, r) => a + r.duiFatalities, 0),
    recentYearsCount: recentYears.length,
    ...over,
  };
}

// ------------------------------------------------------------
// FIPS normalization
// ------------------------------------------------------------

describe("normalizeStateFips", () => {
  it("zero-pads single digit", () => {
    expect(normalizeStateFips(1)).toBe("01");
    expect(normalizeStateFips("1")).toBe("01");
  });
  it("preserves valid 2-digit", () => {
    expect(normalizeStateFips("12")).toBe("12");
    expect(normalizeStateFips(99)).toBe("99");
  });
  it("rejects null/undefined/0/negative/3-digit/non-numeric", () => {
    expect(normalizeStateFips(null)).toBeNull();
    expect(normalizeStateFips(undefined)).toBeNull();
    expect(normalizeStateFips(0)).toBeNull();
    expect(normalizeStateFips(-1)).toBeNull();
    expect(normalizeStateFips(100)).toBeNull();
    expect(normalizeStateFips("ab")).toBeNull();
    expect(normalizeStateFips("12 ")).toBe("12"); // trim
  });
});

describe("normalizeCountyFips", () => {
  it("zero-pads to 3", () => {
    expect(normalizeCountyFips(1)).toBe("001");
    expect(normalizeCountyFips(81)).toBe("081");
    expect(normalizeCountyFips(103)).toBe("103");
  });
  it("rejects 0/4-digit/non-numeric", () => {
    expect(normalizeCountyFips(0)).toBeNull();
    expect(normalizeCountyFips(1000)).toBeNull();
    expect(normalizeCountyFips("xyz")).toBeNull();
  });
});

describe("splitCountyGeoid", () => {
  it("splits 5-digit GEOID", () => {
    expect(splitCountyGeoid("12103")).toEqual({ stateFips: "12", countyFips: "103" });
    expect(splitCountyGeoid("01001")).toEqual({ stateFips: "01", countyFips: "001" });
  });
  it("rejects non-5-digit", () => {
    expect(splitCountyGeoid("1234")).toBeNull();
    expect(splitCountyGeoid("123456")).toBeNull();
    expect(splitCountyGeoid(null)).toBeNull();
  });
});

// ------------------------------------------------------------
// Bucketing
// ------------------------------------------------------------

describe("describePercentileBucket", () => {
  it("buckets each quartile", () => {
    expect(describePercentileBucket(0)).toMatch(/lowest quartile/);
    expect(describePercentileBucket(24.9)).toMatch(/lowest quartile/);
    expect(describePercentileBucket(25)).toMatch(/second quartile/);
    expect(describePercentileBucket(49.9)).toMatch(/second quartile/);
    expect(describePercentileBucket(50)).toMatch(/third quartile/);
    expect(describePercentileBucket(74.9)).toMatch(/third quartile/);
    expect(describePercentileBucket(75)).toMatch(/top quartile/);
    expect(describePercentileBucket(100)).toMatch(/top quartile/);
  });
  it("returns null for null/out-of-range", () => {
    expect(describePercentileBucket(null)).toBeNull();
    expect(describePercentileBucket(-1)).toBeNull();
    expect(describePercentileBucket(101)).toBeNull();
  });
});

// ------------------------------------------------------------
// CD paragraph
// ------------------------------------------------------------

describe("renderCdCountyParagraph", () => {
  it("renders the Pinellas fixture", () => {
    const para = renderCdCountyParagraph(mkContext());
    expect(para).not.toBeNull();
    expect(para).toContain("Pinellas County");
    expect(para).toContain("Florida");
    expect(para).toContain("FARS");
    expect(para).toContain("driving-age adults");
    expect(para).toContain("142"); // 32+20+28+28+34 = 142 fatalities
    expect(para).toContain("2016-2020");
    expect(para).toContain("4.15");
    expect(para).toContain("lowest quartile");
  });
  it("returns null for null context or empty rows", () => {
    expect(renderCdCountyParagraph(null)).toBeNull();
    expect(renderCdCountyParagraph(mkContext({ recentYears: [], recentYearsCount: 0, recentYearsFatalities: 0 }))).toBeNull();
  });
  it("falls back when per-100K rate is null", () => {
    const ctx = mkContext({
      recentYears: [{ year: 2020, duiCrashes: 5, duiFatalities: 7, fatalitiesPer100kAdults: null, stateYearPercentile: null }],
      recentYearsCount: 1,
      recentYearsFatalities: 7,
    });
    const para = renderCdCountyParagraph(ctx);
    expect(para).toContain("per-capita rate unavailable");
    expect(para).not.toContain("per 100K");
  });
  it("uses fallback names when ACS row missing", () => {
    const para = renderCdCountyParagraph(mkContext({ countyName: null, stateName: null }));
    expect(para).toContain("this county");
    expect(para).toContain("this state");
  });
  it("never emits any UPL banned phrase", () => {
    const para = renderCdCountyParagraph(mkContext()) ?? "";
    const lower = para.toLowerCase();
    for (const phrase of UPL_BANNED_PHRASES) {
      expect(lower.includes(phrase), `CD paragraph must not contain banned phrase "${phrase}"`).toBe(false);
    }
  });
  it("never claims licensed-driver denominator", () => {
    const para = (renderCdCountyParagraph(mkContext()) ?? "").toLowerCase();
    expect(para).not.toContain("licensed driver");
    expect(para).not.toContain("licensed drivers");
  });
});

// ------------------------------------------------------------
// DUI Playbook sidebar
// ------------------------------------------------------------

describe("renderDuiPlaybookCountySidebar", () => {
  it("returns 5 lines for fully-populated context", () => {
    const lines = renderDuiPlaybookCountySidebar(mkContext());
    expect(lines).not.toBeNull();
    expect(lines!.length).toBe(5);
    expect(lines![0]).toContain("Pinellas County");
    expect(lines![1]).toContain("142");
    expect(lines![2]).toContain("4.15");
    expect(lines![2]).toContain("driving-age adults");
    expect(lines![3]).toContain("lowest quartile");
    expect(lines![4]).toContain("NHTSA FARS");
  });
  it("returns null when no context", () => {
    expect(renderDuiPlaybookCountySidebar(null)).toBeNull();
  });
  it("never emits banned UPL phrases", () => {
    const text = (renderDuiPlaybookCountySidebar(mkContext()) ?? []).join("\n").toLowerCase();
    for (const phrase of UPL_BANNED_PHRASES) {
      expect(text.includes(phrase), `sidebar must not contain banned phrase "${phrase}"`).toBe(false);
    }
  });
  it("never claims licensed-driver denominator", () => {
    const text = (renderDuiPlaybookCountySidebar(mkContext()) ?? []).join("\n").toLowerCase();
    expect(text).not.toContain("licensed driver");
  });
});

// ------------------------------------------------------------
// Constants sanity
// ------------------------------------------------------------

describe("constants", () => {
  it("recent-window default is 5 years", () => {
    expect(FARS_COUNTY_RECENT_WINDOW_YEARS).toBe(5);
  });
  it("denominator label is locked to driving-age adults", () => {
    expect(FARS_COUNTY_DENOMINATOR_LABEL).toBe("driving-age adults");
  });
});
