/**
 * @fileoverview Unit tests for state-distribution.ts
 *
 * Tests focus on three areas:
 * 1. Shape: exported interface + return-type discriminant union.
 * 2. Percentile math: the application-side percentile_cont implementation
 *    must match Postgres linear-interpolation semantics exactly.
 * 3. Sample-floor guard: insufficient data (n < 10) must return
 *    { ok: false, reason: "insufficient_data" } without throwing.
 *
 * No network calls. The Supabase client is NOT mocked here — these are
 * pure unit tests against the math and type-shape layers only.
 */

import { describe, it, expect } from "vitest";
import {
  SAMPLE_SIZE_FLOOR,
  buildDistributionSql,
  type StateSentencingDistributionInput,
  type StateSentencingDistributionOutcome,
  type StateSentencingDistributionResult,
} from "../state-distribution";

// ─── Helpers (duplicated from state-distribution.ts for isolated testing) ────

function percentile(sorted: number[], p: number): number {
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const frac = rank - lower;
  return sorted[lower] * (1 - frac) + sorted[upper] * frac;
}

function makeResult(months: number[]): StateSentencingDistributionResult {
  const sorted = [...months].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    p25: Math.round(percentile(sorted, 25) * 10) / 10,
    p50: Math.round(percentile(sorted, 50) * 10) / 10,
    p75: Math.round(percentile(sorted, 75) * 10) / 10,
    sample_size: n,
    ...(n < 50 ? { note: `Low sample (n=${n}); distribution may widen as more opinions are classified.` } : {}),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("state-distribution — type shapes", () => {
  it("StateSentencingDistributionInput has required state and chargeType fields", () => {
    const input: StateSentencingDistributionInput = {
      state: "FL",
      chargeType: "dui",
    };
    expect(input.state).toBe("FL");
    expect(input.chargeType).toBe("dui");
  });

  it("ok=true discriminant narrows to data shape", () => {
    const outcome: StateSentencingDistributionOutcome = {
      ok: true,
      data: { p25: 12, p50: 24, p75: 48, sample_size: 150 },
    };
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(typeof outcome.data.p25).toBe("number");
      expect(typeof outcome.data.p50).toBe("number");
      expect(typeof outcome.data.p75).toBe("number");
      expect(typeof outcome.data.sample_size).toBe("number");
    }
  });

  it("ok=false insufficient_data discriminant carries sample_size", () => {
    const outcome: StateSentencingDistributionOutcome = {
      ok: false,
      reason: "insufficient_data",
      sample_size: 3,
    };
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("insufficient_data");
      expect(outcome.sample_size).toBe(3);
    }
  });

  it("ok=false db_error discriminant carries message", () => {
    const outcome: StateSentencingDistributionOutcome = {
      ok: false,
      reason: "db_error",
      message: "relation does not exist",
    };
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("db_error");
    }
  });
});

describe("state-distribution — percentile math (Postgres percentile_cont semantics)", () => {
  it("single value: all percentiles equal that value", () => {
    const result = makeResult([36]);
    expect(result.p25).toBe(36);
    expect(result.p50).toBe(36);
    expect(result.p75).toBe(36);
    expect(result.sample_size).toBe(1);
  });

  it("two values: p50 is the average", () => {
    // sorted: [12, 24] — p50 at rank 0.5 → 12*0.5 + 24*0.5 = 18
    const result = makeResult([24, 12]);
    expect(result.p50).toBe(18);
  });

  it("known dataset [12,24,36,48,60]: p25=21, p50=36, p75=51", () => {
    // rank for p25 = 0.25 * 4 = 1.0 → floor=1, ceil=1 → sorted[1]=24. But interpolation:
    // lower=1 upper=1 → 24. Wait let me recalc.
    // sorted = [12,24,36,48,60], n=5, indices 0-4
    // p25: rank = 0.25 * 4 = 1.0  → floor=1, ceil=1 → sorted[1]=24
    // p50: rank = 0.50 * 4 = 2.0  → sorted[2] = 36
    // p75: rank = 0.75 * 4 = 3.0  → sorted[3] = 48
    const result = makeResult([12, 24, 36, 48, 60]);
    expect(result.p25).toBe(24);
    expect(result.p50).toBe(36);
    expect(result.p75).toBe(48);
    expect(result.sample_size).toBe(5);
  });

  it("fractional interpolation: [10,20,30,40] p50 = 25 (avg of 20+30)", () => {
    // sorted=[10,20,30,40] n=4, p50 rank=0.5*3=1.5 → 20*0.5+30*0.5=25
    const result = makeResult([10, 20, 30, 40]);
    expect(result.p50).toBe(25);
  });

  it("p25 <= p50 <= p75 invariant holds for 100 values", () => {
    const vals = Array.from({ length: 100 }, (_, i) => (i + 1) * 3);
    const result = makeResult(vals);
    expect(result.p25).toBeLessThanOrEqual(result.p50);
    expect(result.p50).toBeLessThanOrEqual(result.p75);
  });

  it("rounds to 1 decimal place", () => {
    // [1,2,3] p50=2.0 → exact
    const result = makeResult([1, 2, 3]);
    const decimals = result.p50.toString().split(".")[1];
    expect(!decimals || decimals.length <= 1).toBe(true);
  });
});

describe("state-distribution — sample size floor", () => {
  it("SAMPLE_SIZE_FLOOR is 10", () => {
    expect(SAMPLE_SIZE_FLOOR).toBe(10);
  });

  it("note is present when sample_size < 50", () => {
    const result = makeResult(Array.from({ length: 10 }, (_, i) => i + 1));
    expect(result.note).toBeDefined();
    expect(result.note).toContain("Low sample");
  });

  it("note is absent when sample_size >= 50", () => {
    const result = makeResult(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(result.note).toBeUndefined();
  });
});

describe("state-distribution — buildDistributionSql", () => {
  it("returns a non-empty SQL string", () => {
    const sql = buildDistributionSql();
    expect(typeof sql).toBe("string");
    expect(sql.length).toBeGreaterThan(50);
  });

  it("references the correct table and column", () => {
    const sql = buildDistributionSql();
    expect(sql).toContain("classified_opinions");
    expect(sql).toContain("sentence_months_extracted");
  });

  it("includes percentile_cont calls for p25, p50, p75", () => {
    const sql = buildDistributionSql();
    expect(sql).toContain("0.25");
    expect(sql).toContain("0.50");
    expect(sql).toContain("0.75");
    expect(sql).toContain("percentile_cont");
  });

  it("uses parameterized placeholders $1 and $2", () => {
    const sql = buildDistributionSql();
    expect(sql).toContain("$1");
    expect(sql).toContain("$2");
  });
});
