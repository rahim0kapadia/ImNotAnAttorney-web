/**
 * Unit tests for src/lib/fsd-distribution.ts — the shared query library
 * for the $297 Federal Sentencing Distribution Report.
 *
 * Covers:
 *   - queryDistribution progressive widening (exact → widened_years →
 *     widened_criminal_history → widened_district → insufficient_data)
 *   - monteCarloSample draws 1000 samples within the p10/p90 envelope
 *   - histogram bins samples correctly (min/max clamped, bin widths
 *     equal except possibly last)
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  queryDistribution,
  monteCarloSample,
  histogram,
  type FsdRow,
  type FsdAggregate,
} from "@/lib/fsd-distribution";

const sampleRow = (overrides: Partial<FsdRow> = {}): FsdRow => ({
  fy: 22,
  district: "42",
  circdist: "36",
  offguide_code: 10,
  offguide_label: "Drug Trafficking",
  offense_category: "drug",
  criminal_history_category: "3",
  n: 50,
  mean_months: 48.5,
  median_months: 36,
  p10_months: 12,
  p25_months: 24,
  p75_months: 72,
  p90_months: 120,
  downward_departure_rate: 0.15,
  upward_departure_rate: 0.02,
  probation_rate: 0.05,
  ...overrides,
});

type QueryFilters = {
  offguide_code: number;
  criminal_history_category?: string;
  district?: string;
  fy_from: number;
  fy_to: number;
};

function filterKey(f: QueryFilters): string {
  // Sorted key so test fixtures are stable.
  const parts: string[] = [];
  parts.push(`offguide=${f.offguide_code}`);
  if (f.district) parts.push(`district=${f.district}`);
  if (f.criminal_history_category) parts.push(`ch=${f.criminal_history_category}`);
  parts.push(`fy=${f.fy_from}-${f.fy_to}`);
  return parts.sort().join("|");
}

function mockSupabase(rowsByKey: Record<string, FsdRow[]>): SupabaseClient {
  return {
    from: () => {
      const state: QueryFilters = { offguide_code: 0, fy_from: 14, fy_to: 24 };
      const chain = {
        select: () => chain,
        eq(col: string, val: string | number) {
          if (col === "offguide_code") state.offguide_code = Number(val);
          else if (col === "district") state.district = String(val);
          else if (col === "criminal_history_category") state.criminal_history_category = String(val);
          return chain;
        },
        gte(col: string, val: number) {
          if (col === "fy") state.fy_from = Number(val);
          return chain;
        },
        lte(col: string, val: number) {
          if (col === "fy") state.fy_to = Number(val);
          return chain;
        },
        then(resolve: (r: { data: FsdRow[]; error: null }) => void) {
          resolve({ data: rowsByKey[filterKey(state)] ?? [], error: null });
        },
      };
      return chain as unknown as ReturnType<SupabaseClient["from"]>;
    },
  } as unknown as SupabaseClient;
}

describe("queryDistribution — progressive widening", () => {
  it("returns exact match when district + CH bucket has data", async () => {
    const row = sampleRow();
    const sb = mockSupabase({
      [filterKey({ offguide_code: 10, district: "42", criminal_history_category: "3", fy_from: 14, fy_to: 24 })]: [row],
    });
    const r = await queryDistribution(sb, {
      district: "42",
      offguide_code: 10,
      criminal_history_category: "3",
    });
    expect(r.match_depth).toBe("exact");
    expect(r.district_agg?.total_n).toBe(50);
    expect(r.district_agg?.median_months).toBe(36);
    expect(r.widening_note).toBeNull();
    expect(r.sample_size_caveat).toMatch(/Based on 50 cases FY22-FY22/);
  });

  it("widens to widened_criminal_history when district has data but CH misses", async () => {
    const row = sampleRow();
    const sb = mockSupabase({
      // exact + widened_years both miss — only district-wide hits.
      [filterKey({ offguide_code: 10, district: "42", fy_from: 14, fy_to: 24 })]: [row],
    });
    const r = await queryDistribution(sb, {
      district: "42",
      offguide_code: 10,
      criminal_history_category: "6",
    });
    expect(r.match_depth).toBe("widened_criminal_history");
    expect(r.widening_note).toMatch(/criminal history/i);
  });

  it("widens to widened_district when everything else misses", async () => {
    const row = sampleRow({ district: "0" });
    // National fallback carries criminal_history_category when supplied, so
    // the fixture key includes ch=3 to match the queryDistribution call.
    const sb = mockSupabase({
      [filterKey({ offguide_code: 10, criminal_history_category: "3", fy_from: 14, fy_to: 24 })]: [row],
    });
    const r = await queryDistribution(sb, {
      district: "99",
      offguide_code: 10,
      criminal_history_category: "3",
    });
    expect(r.match_depth).toBe("widened_district");
    expect(r.widening_note).toMatch(/national/i);
  });

  it("returns insufficient_data when nothing matches at any tier", async () => {
    const sb = mockSupabase({});
    const r = await queryDistribution(sb, {
      district: "42",
      offguide_code: 99,
      criminal_history_category: "3",
    });
    expect(r.match_depth).toBe("insufficient_data");
    expect(r.district_agg).toBeNull();
    expect(r.monte_carlo).toEqual([]);
  });

  it("aggregates multiple rows (different FYs) via weighted mean", async () => {
    const rows = [
      sampleRow({ fy: 22, n: 100, median_months: 30 }),
      sampleRow({ fy: 23, n: 200, median_months: 60 }),
    ];
    const sb = mockSupabase({
      [filterKey({ offguide_code: 10, district: "42", criminal_history_category: "3", fy_from: 14, fy_to: 24 })]: rows,
    });
    const r = await queryDistribution(sb, {
      district: "42",
      offguide_code: 10,
      criminal_history_category: "3",
    });
    expect(r.district_agg?.total_n).toBe(300);
    // Weighted mean of 30*100 + 60*200 = 15000 / 300 = 50.
    expect(r.district_agg?.median_months).toBeCloseTo(50, 1);
    expect(r.per_year).toHaveLength(2);
    expect(r.per_year[0].fy).toBe(22);
    expect(r.per_year[1].fy).toBe(23);
  });
});

describe("monteCarloSample", () => {
  const agg: FsdAggregate = {
    total_n: 100,
    mean_months: 50,
    median_months: 40,
    p10_months: 10,
    p25_months: 20,
    p75_months: 80,
    p90_months: 120,
    downward_departure_rate: 0.2,
    upward_departure_rate: 0.05,
    probation_rate: 0.1,
    earliest_fy: 20,
    latest_fy: 24,
    offguide_label: "Drug Trafficking",
    offense_category: "drug",
  };

  it("draws exactly n samples", () => {
    const out = monteCarloSample(agg, 1000);
    expect(out).toHaveLength(1000);
  });

  it("all samples are within p10..p90 envelope (CDF is clamped)", () => {
    const out = monteCarloSample(agg, 1000);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(120);
    }
  });

  it("empirical median is near the theoretical median (statistical smoke test)", () => {
    const out = monteCarloSample(agg, 2000);
    const sorted = out.slice().sort((a, b) => a - b);
    const empMedian = sorted[Math.floor(sorted.length / 2)];
    // Piecewise linear CDF at q=0.5 returns the configured median (40).
    expect(empMedian).toBeGreaterThan(30);
    expect(empMedian).toBeLessThan(55);
  });

  it("returns empty when any percentile is null (can't interpolate)", () => {
    const bad = { ...agg, p10_months: null };
    expect(monteCarloSample(bad, 100)).toEqual([]);
  });
});

describe("histogram", () => {
  it("returns empty for empty samples", () => {
    expect(histogram([])).toEqual([]);
  });

  it("groups samples into 20 bins by default (counts sum to input size)", () => {
    const samples = Array.from({ length: 1000 }, () => Math.random() * 100);
    const bins = histogram(samples);
    expect(bins).toHaveLength(20);
    const total = bins.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(1000);
  });

  it("handles single-value input as one bin", () => {
    const bins = histogram([7, 7, 7, 7]);
    expect(bins).toHaveLength(1);
    expect(bins[0].count).toBe(4);
  });

  it("respects the bins argument", () => {
    const samples = Array.from({ length: 100 }, (_, i) => i);
    const bins = histogram(samples, 10);
    expect(bins).toHaveLength(10);
  });
});
