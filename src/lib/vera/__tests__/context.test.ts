/**
 * Unit tests for Vera county incarceration context (TICKET-15).
 *
 * Coverage targets:
 *   - computePercentile: empty, single, ordering, ties, boundary
 *   - computeMedian / computeMean: even/odd, single, empty
 *   - classifyTrend: insufficient, flat, up, down
 *   - normalizeCountyName: " County", " Parish", " Borough", whitespace
 *   - describeTrend: insufficient + each direction copy
 *   - renderVeraDigestParagraph: contains percentile + rate + UPL-safe phrasing
 *   - renderVeraCipSidebar: contains observations table + UPL-safe phrasing
 *   - banned-phrase parity: outputs never contain predictive language
 */
import { describe, it, expect } from "vitest";
import {
  computePercentile,
  computeMedian,
  computeMean,
  classifyTrend,
  normalizeCountyName,
  describeTrend,
  renderVeraDigestParagraph,
  renderVeraCipSidebar,
  VERA_SOURCE_URL,
  type VeraContext,
  type VeraTrendObservation,
} from "../context";

// ============================================================
// Pure compute
// ============================================================

describe("computePercentile", () => {
  it("returns 0 on empty distribution", () => {
    expect(computePercentile(100, [])).toBe(0);
  });
  it("returns 100 when value is the max in a single-element distribution", () => {
    expect(computePercentile(50, [50])).toBe(100);
  });
  it("places the value correctly mid-distribution", () => {
    // 1-10 sorted — 5 -> 50th
    const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(computePercentile(5, all)).toBe(50);
  });
  it("places the max at 100", () => {
    expect(computePercentile(10, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(100);
  });
  it("handles ties by counting <= value", () => {
    // 4 of 5 <= 3 (counts the 3 itself + the three 1s) -> 80th
    expect(computePercentile(3, [1, 1, 1, 3, 100])).toBe(80);
  });
});

describe("computeMedian / computeMean", () => {
  it("median odd-length", () => {
    expect(computeMedian([3, 1, 2])).toBe(2);
  });
  it("median even-length averages middle two", () => {
    expect(computeMedian([1, 2, 3, 4])).toBe(2.5);
  });
  it("median empty -> 0", () => {
    expect(computeMedian([])).toBe(0);
  });
  it("mean basic", () => {
    expect(computeMean([2, 4, 6])).toBe(4);
  });
  it("mean empty -> 0", () => {
    expect(computeMean([])).toBe(0);
  });
});

describe("classifyTrend", () => {
  function obs(...years: Array<[number, number]>): VeraTrendObservation[] {
    return years.map(([year, rate]) => ({ year, rate }));
  }
  it("insufficient when fewer than 3 observations", () => {
    expect(classifyTrend(obs([2022, 100], [2023, 200]))).toBe("insufficient");
  });
  it("flat when within +/- 5% relative change across window", () => {
    // 100 -> 100 -> 100 — slope 0
    expect(classifyTrend(obs([2022, 100], [2023, 100], [2024, 100]))).toBe("flat");
  });
  it("up when rate climbs >5% across window", () => {
    // 100 -> 110 -> 120 — clearly up
    expect(classifyTrend(obs([2022, 100], [2023, 110], [2024, 120]))).toBe("up");
  });
  it("down when rate drops >5% across window", () => {
    expect(classifyTrend(obs([2022, 200], [2023, 180], [2024, 160]))).toBe("down");
  });
  it("handles unsorted input by sorting internally", () => {
    expect(classifyTrend(obs([2024, 120], [2022, 100], [2023, 110]))).toBe("up");
  });
});

describe("normalizeCountyName", () => {
  it("strips trailing County", () => {
    expect(normalizeCountyName("Pinellas County")).toBe("pinellas");
  });
  it("strips trailing Parish", () => {
    expect(normalizeCountyName("Orleans Parish")).toBe("orleans");
  });
  it("strips trailing Borough", () => {
    expect(normalizeCountyName("Bronx Borough")).toBe("bronx");
  });
  it("strips Census Area", () => {
    expect(normalizeCountyName("Yukon-Koyukuk Census Area")).toBe("yukon-koyukuk");
  });
  it("preserves bare names + collapses whitespace", () => {
    expect(normalizeCountyName("  St.   Lucie  ")).toBe("st. lucie");
  });
});

// ============================================================
// describeTrend
// ============================================================

describe("describeTrend", () => {
  it("returns insufficient copy when trend is insufficient", () => {
    expect(describeTrend("insufficient", [])).toContain("insufficient recent data");
  });
  it("returns up copy with year span and rate transition", () => {
    const out = describeTrend("up", [
      { year: 2022, rate: 100 },
      { year: 2024, rate: 130 },
    ]);
    expect(out).toContain("trending up");
    expect(out).toContain("100");
    expect(out).toContain("130");
  });
  it("returns down copy", () => {
    const out = describeTrend("down", [
      { year: 2022, rate: 200 },
      { year: 2024, rate: 150 },
    ]);
    expect(out).toContain("trending down");
  });
  it("returns flat copy", () => {
    const out = describeTrend("flat", [
      { year: 2022, rate: 100 },
      { year: 2024, rate: 102 },
    ]);
    expect(out).toContain("flat");
  });
});

// ============================================================
// Render — UPL-safe parity
// ============================================================

const SAMPLE_CTX: VeraContext = {
  countyFips: "12103",
  countyName: "Pinellas County",
  stateAbbr: "FL",
  latestYear: 2024,
  latestRate: 521.33,
  nationalPercentile: 67,
  nationalBaseline: { median: 438.6, mean: 568.77, sampleSize: 1440 },
  threeYearObservations: [
    { year: 2022, rate: 493.13 },
    { year: 2023, rate: 495.14 },
    { year: 2024, rate: 521.33 },
  ],
  threeYearTrend: "up",
  sourceUrl: VERA_SOURCE_URL,
};

/** Predictive / advisory language banned in EVERY Vera-derived render.
 *  Each entry is a regex with word boundaries so legitimate disclaimers like
 *  "not a prediction" (verbatim CIP gate-line pattern) don't trip the
 *  "predict" substring. */
const VERA_BANNED_PHRASES: RegExp[] = [
  // Predictive verbs (allowed: "prediction" only inside "not a prediction")
  /\bwill be\b/,
  /\bwill likely\b/,
  /\bpredicts\b/,
  /\bpredict\b(?! of)/,
  /\bpredicted\b/,
  /\bforecast(s|ed)?\b/,
  /\bexpect to receive\b/,
  /\bexpected outcome\b/,
  // Directive (UPL)
  /\byou should\b/,
  /\bwe recommend\b/,
  /\bwe suggest\b/,
  /\byou must\b/,
  /\bmust file\b/,
  /\byou need to\b/,
  // Result-claim
  /\bguarantees\b/,
  /\bguarantee that\b/,
  /\belevated risk\b/,
  /\bunderperforms\b/,
  // Score-language (Apex banned set)
  /\breport card\b/,
  /\bgrade your\b/,
];

/** Whitelist regex: phrases that must be allowed even when their substrings
 *  match a banned pattern. Currently: the verbatim "not a prediction"
 *  disclaimer (matches CIP COURTHOUSE_GATE_LINE convention). */
function stripWhitelisted(s: string): string {
  return s.replace(/not a prediction/gi, "");
}

describe("renderVeraDigestParagraph", () => {
  const html = renderVeraDigestParagraph(SAMPLE_CTX);

  it("contains the county name + state", () => {
    expect(html).toContain("Pinellas County");
    expect(html).toContain("FL");
  });

  it("contains the ordinal percentile", () => {
    expect(html).toContain("67th percentile");
  });

  it("contains the latest year + rate", () => {
    expect(html).toContain("2024");
    expect(html).toContain("521"); // rounded for display
  });

  it("contains the national median + sample size", () => {
    expect(html).toContain("median 439"); // 438.6 rounded for display
    expect(html).toContain("1,440"); // toLocaleString
  });

  it("contains the Vera source URL anchor", () => {
    expect(html).toContain(VERA_SOURCE_URL);
    expect(html).toContain("Vera Institute Incarceration Trends");
  });

  it("contains no banned phrases (UPL parity)", () => {
    const lower = stripWhitelisted(html.toLowerCase());
    for (const phrase of VERA_BANNED_PHRASES) {
      expect(
        phrase.test(lower),
        `Found banned phrase ${phrase} in digest paragraph`,
      ).toBe(false);
    }
  });

  it("phrases the trend historically, not predictively", () => {
    expect(html).toContain("trending up");
    // Ensure the wording is "trending up over the last X reported years"
    expect(html).toContain("over the last");
    expect(html).toContain("reported year");
  });
});

describe("renderVeraCipSidebar", () => {
  const html = renderVeraCipSidebar(SAMPLE_CTX);

  it("contains the sidebar title with county", () => {
    expect(html).toContain("County Incarceration Context");
    expect(html).toContain("Pinellas County");
  });

  it("renders the year-by-year observations table", () => {
    expect(html).toContain("2022");
    expect(html).toContain("2023");
    expect(html).toContain("2024");
    expect(html).toContain("521.3"); // 521.33 -> .toFixed(1)
  });

  it("contains the ordinal percentile in body copy", () => {
    expect(html).toContain("67th percentile");
  });

  it("contains the Vera source URL anchor", () => {
    expect(html).toContain(VERA_SOURCE_URL);
  });

  it("includes the 'not a prediction' disclaimer line", () => {
    expect(html.toLowerCase()).toContain("not a prediction");
  });

  it("contains no banned phrases (UPL parity)", () => {
    const lower = stripWhitelisted(html.toLowerCase());
    for (const phrase of VERA_BANNED_PHRASES) {
      expect(
        phrase.test(lower),
        `Found banned phrase ${phrase} in CIP sidebar`,
      ).toBe(false);
    }
  });
});

describe("renders for insufficient-trend ctx", () => {
  it("digest paragraph still passes UPL banned-phrase parity", () => {
    const ctx: VeraContext = {
      ...SAMPLE_CTX,
      threeYearObservations: [{ year: 2024, rate: 521.33 }],
      threeYearTrend: "insufficient",
    };
    const html = renderVeraDigestParagraph(ctx);
    expect(html).toContain("insufficient recent data");
    const lower = stripWhitelisted(html.toLowerCase());
    for (const phrase of VERA_BANNED_PHRASES) {
      expect(phrase.test(lower)).toBe(false);
    }
  });
});
