/**
 * Unit tests for src/lib/ussc-similar-cases.ts.
 *
 * Covers:
 *   - normalizeAgeBucket — numeric age → matview bucket label
 *   - queryBucket — exact match, progressive widening, insufficient_data
 *   - extractPleaTrialSplit — picks largest-sample row per outcome
 *   - computeTrialTaxMonths — null-safe subtraction
 *
 * No live DB — uses a thenable mock that captures .eq filters and
 * returns rows keyed by the sorted filter string.
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  queryBucket,
  normalizeAgeBucket,
  extractPleaTrialSplit,
  computeTrialTaxMonths,
  type SimilarCasesRow,
} from "@/lib/ussc-similar-cases";

function filterKey(filters: Record<string, string>): string {
  return Object.entries(filters)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
}

/**
 * Build a Supabase mock whose `from().select().eq(...).eq(...)` chain is
 * thenable and resolves to rows keyed by the sorted filter string.
 */
function mockSupabase(rowsByFilter: Record<string, unknown[]>): SupabaseClient {
  return {
    from: () => {
      const filters: Record<string, string> = {};
      const chain = {
        select: () => chain,
        eq(col: string, val: string) {
          filters[col] = val;
          return chain;
        },
        then(resolve: (r: { data: unknown[]; error: null }) => void) {
          resolve({ data: rowsByFilter[filterKey(filters)] ?? [], error: null });
        },
      };
      return chain as unknown as ReturnType<SupabaseClient["from"]>;
    },
  } as unknown as SupabaseClient;
}

const row42: SimilarCasesRow = {
  district: "42",
  offguide: "17",
  xcrhissr: "1",
  citizen: "3",
  age_bucket: "25-34",
  plea_or_trial: "0",
  n_cases: 7033,
  p10_senttot: 0.03,
  p25_senttot: 1.82,
  median_senttot: 3.13,
  p75_senttot: 5.76,
  p90_senttot: 9,
  mean_senttot: 4.66,
  pct_got_prison: 15.3,
  pct_downward_departure: 0,
  earliest_fy: 18,
  latest_fy: 24,
};

const row42Trial: SimilarCasesRow = {
  ...row42,
  plea_or_trial: "1",
  n_cases: 6,
  median_senttot: 25.5,
  pct_got_prison: 83.3,
  pct_downward_departure: null,
  earliest_fy: 19,
  latest_fy: 23,
};

describe("normalizeAgeBucket", () => {
  it("maps raw ages to matview bucket labels", () => {
    expect(normalizeAgeBucket(23)).toBe("<25");
    expect(normalizeAgeBucket(24)).toBe("<25");
    expect(normalizeAgeBucket(25)).toBe("25-34");
    expect(normalizeAgeBucket(34)).toBe("25-34");
    expect(normalizeAgeBucket(35)).toBe("35-44");
    expect(normalizeAgeBucket(44)).toBe("35-44");
    expect(normalizeAgeBucket(45)).toBe("45-54");
    expect(normalizeAgeBucket(54)).toBe("45-54");
    expect(normalizeAgeBucket(55)).toBe("55+");
    expect(normalizeAgeBucket(99)).toBe("55+");
  });

  it("returns null (not UNK) for invalid/missing ages so widening can skip age tier", () => {
    expect(normalizeAgeBucket(null)).toBeNull();
    expect(normalizeAgeBucket(undefined)).toBeNull();
    expect(normalizeAgeBucket(Number.NaN)).toBeNull();
  });
});

describe("queryBucket — progressive widening", () => {
  it("returns match_depth='exact' when the full bucket hits", async () => {
    const sb = mockSupabase({
      [filterKey({
        age_bucket: "25-34",
        citizen: "3",
        district: "42",
        offguide: "17",
        xcrhissr: "1",
      })]: [row42, row42Trial],
    });
    const result = await queryBucket(sb, {
      district: "42",
      offguide: "17",
      xcrhissr: "1",
      citizen: "3",
      age_bucket: "25-34",
    });
    expect(result.match_depth).toBe("exact");
    expect(result.rows).toHaveLength(2);
    expect(result.total_cases).toBe(7039);
    expect(result.sample_size_caveat).toContain("Based on 7039 cases FY18-FY24");
    expect(result.widening_note).toBeNull();
  });

  it("widens by dropping age_bucket when exact returns empty", async () => {
    const sb = mockSupabase({
      [filterKey({
        citizen: "3",
        district: "42",
        offguide: "17",
        xcrhissr: "1",
      })]: [row42],
    });
    const result = await queryBucket(sb, {
      district: "42",
      offguide: "17",
      xcrhissr: "1",
      citizen: "3",
      age_bucket: "55+",
    });
    expect(result.match_depth).toBe("widened_age");
    expect(result.widening_note).toMatch(/age/i);
    expect(result.rows).toHaveLength(1);
  });

  it("widens by dropping citizen after age also empty", async () => {
    const sb = mockSupabase({
      [filterKey({
        district: "42",
        offguide: "17",
        xcrhissr: "1",
      })]: [row42],
    });
    const result = await queryBucket(sb, {
      district: "42",
      offguide: "17",
      xcrhissr: "1",
      citizen: "9",
      age_bucket: "25-34",
    });
    expect(result.match_depth).toBe("widened_citizen");
    expect(result.widening_note).toMatch(/citizenship/i);
  });

  it("widens to national when district also empty", async () => {
    const sb = mockSupabase({
      [filterKey({
        offguide: "17",
        xcrhissr: "1",
      })]: [row42],
    });
    const result = await queryBucket(sb, {
      district: "99",
      offguide: "17",
      xcrhissr: "1",
      citizen: "3",
      age_bucket: "25-34",
    });
    expect(result.match_depth).toBe("widened_district");
    expect(result.widening_note).toMatch(/national/i);
  });

  it("returns insufficient_data when all widening levels empty", async () => {
    const sb = mockSupabase({});
    const result = await queryBucket(sb, {
      district: "42",
      offguide: "ZZ",
      xcrhissr: "9",
      citizen: "9",
      age_bucket: "25-34",
    });
    expect(result.match_depth).toBe("insufficient_data");
    expect(result.rows).toHaveLength(0);
    expect(result.total_cases).toBe(0);
    expect(result.sample_size_caveat).toBe("");
  });
});

describe("extractPleaTrialSplit", () => {
  it("picks the largest-sample row per outcome", () => {
    const rowSmall = { ...row42, n_cases: 10, age_bucket: "<25" };
    const rowBig = { ...row42, n_cases: 7033 };
    const trialSmall = { ...row42Trial, n_cases: 3, age_bucket: "<25" };
    const trialBig = { ...row42Trial, n_cases: 6 };
    const { plea, trial } = extractPleaTrialSplit([rowSmall, rowBig, trialSmall, trialBig]);
    expect(plea?.n_cases).toBe(7033);
    expect(trial?.n_cases).toBe(6);
  });

  it("returns nulls when an outcome is missing", () => {
    const { plea, trial } = extractPleaTrialSplit([row42]);
    expect(plea?.n_cases).toBe(7033);
    expect(trial).toBeNull();
  });

  it("handles empty rows", () => {
    const { plea, trial } = extractPleaTrialSplit([]);
    expect(plea).toBeNull();
    expect(trial).toBeNull();
  });
});

describe("computeTrialTaxMonths", () => {
  it("returns the rounded delta when both medians present", () => {
    const delta = computeTrialTaxMonths(row42, row42Trial);
    expect(delta).toBeCloseTo(22.37, 2);
  });

  it("returns null when plea missing", () => {
    expect(computeTrialTaxMonths(null, row42Trial)).toBeNull();
  });

  it("returns null when trial missing", () => {
    expect(computeTrialTaxMonths(row42, null)).toBeNull();
  });

  it("returns null when either median is null", () => {
    const pleaNoMedian = { ...row42, median_senttot: null };
    expect(computeTrialTaxMonths(pleaNoMedian, row42Trial)).toBeNull();
    const trialNoMedian = { ...row42Trial, median_senttot: null };
    expect(computeTrialTaxMonths(row42, trialNoMedian)).toBeNull();
  });
});
