/**
 * Unit tests for the federal-jury-instruction-brief circuit-coverage
 * gating (D5 plan, 2026-04-26). Mirrors the officer-coverage test pattern.
 *
 * Focus:
 *   - checkFJIBCoverage exposes pjiTotal + pjiInCircuit
 *   - Supported circuit (e.g., 9): pjiInCircuit > 0, banner does NOT fire
 *   - Unsupported circuit (e.g., 4): pjiInCircuit === 0, banner WOULD fire
 *   - State cascade: blank circuit cascades through STATE_TO_CIRCUIT
 *   - DC: valid in CIRCUIT_NAMES but not in PJI_COVERED_CIRCUITS, so
 *     pjiInCircuit === 0 (banner fires)
 *   - PJI_COVERED_CIRCUITS reflects the live 7-circuit set (sanity check)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

interface QueryRecord {
  table: string;
  filters: Array<{ col: string; val: unknown }>;
  isCount: boolean;
}

let queryLog: QueryRecord[] = [];
/** Map keyed by `${table}|${circuit}` (or just `${table}` for unfiltered total). */
let scriptedCounts: Map<string, number> = new Map();

function key(table: string, circuit?: number | string): string {
  return circuit === undefined ? table : `${table}|${circuit}`;
}

function mockBuilder(table: string, isCount: boolean) {
  const filters: Array<{ col: string; val: unknown }> = [];
  const record: QueryRecord = { table, filters, isCount };
  queryLog.push(record);

  const builder: Record<string, unknown> = {};
  builder.eq = (col: string, val: unknown) => {
    filters.push({ col, val });
    return builder;
  };
  builder.then = (resolve: (val: unknown) => unknown) => {
    const circuitFilter = filters.find((f) => f.col === "circuit")?.val as
      | number
      | string
      | undefined;
    const explicitCount =
      scriptedCounts.get(key(table, circuitFilter)) ??
      scriptedCounts.get(key(table));
    if (isCount) {
      const count = explicitCount ?? 0;
      return Promise.resolve({ count, data: null, error: null }).then(resolve);
    }
    return Promise.resolve({ data: [], error: null }).then(resolve);
  };
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        const isCount = !!(opts && opts.count === "exact");
        return mockBuilder(table, isCount);
      },
    }),
  }),
}));

import { checkFJIBCoverage } from "../coverage";
import { PJI_COVERED_CIRCUITS } from "../federal-jury-instruction-brief";

beforeEach(() => {
  queryLog = [];
  scriptedCounts = new Map();
});

describe("PJI_COVERED_CIRCUITS — live data shape", () => {
  it("matches the 7 circuits with rows in v_pji_public (verified 2026-04-26)", () => {
    const supported = [...PJI_COVERED_CIRCUITS].sort((a, b) => a - b);
    expect(supported).toEqual([1, 3, 5, 6, 7, 8, 9]);
  });

  it("does NOT include circuit 10 (zero rows in prod)", () => {
    expect(PJI_COVERED_CIRCUITS.has(10)).toBe(false);
  });

  it("does NOT include circuits 2, 4, 11", () => {
    expect(PJI_COVERED_CIRCUITS.has(2)).toBe(false);
    expect(PJI_COVERED_CIRCUITS.has(4)).toBe(false);
    expect(PJI_COVERED_CIRCUITS.has(11)).toBe(false);
  });
});

describe("checkFJIBCoverage — supported circuits", () => {
  it("returns positive pjiInCircuit when user's circuit has rows", async () => {
    // Live shape: 1,772 total, circuit 9 has 44 rows.
    scriptedCounts.set(key("v_pji_public"), 1772);
    scriptedCounts.set(key("v_pji_public", 9), 44);

    const result = await checkFJIBCoverage("9", "CA");

    expect(result.coverage.pjiTotal).toBe(1772);
    expect(result.coverage.pjiInCircuit).toBe(44);
    expect(result.coverage.supported).toBe(1);
    expect(result.available).toBe(true);
    expect(result.matchedName).toBe("Ninth Circuit");
  });

  it("cascades from state when circuit is blank (CA -> 9th Circuit)", async () => {
    scriptedCounts.set(key("v_pji_public"), 1772);
    scriptedCounts.set(key("v_pji_public", 9), 44);

    const result = await checkFJIBCoverage(null, "CA");

    expect(result.coverage.pjiInCircuit).toBe(44);
    expect(result.coverage.supported).toBe(1);
    expect(result.matchedName).toBe("Ninth Circuit");
  });

  it("cascades from state when circuit is empty string", async () => {
    scriptedCounts.set(key("v_pji_public"), 1772);
    scriptedCounts.set(key("v_pji_public", 5), 251);

    const result = await checkFJIBCoverage("", "TX");

    expect(result.coverage.pjiInCircuit).toBe(251);
    expect(result.matchedName).toBe("Fifth Circuit");
  });
});

describe("checkFJIBCoverage — unsupported circuits (banner trips)", () => {
  it("user picks 4th Circuit explicitly: pjiInCircuit === 0 (banner fires)", async () => {
    scriptedCounts.set(key("v_pji_public"), 1772);
    // No entry for circuit 4 — defaults to 0 via mockBuilder.

    const result = await checkFJIBCoverage("4", "VA");

    expect(result.coverage.pjiTotal).toBe(1772);
    expect(result.coverage.pjiInCircuit).toBe(0);
    expect(result.coverage.supported).toBe(0);
    expect(result.available).toBe(true); // graceful fallback always available

    // Banner-trip condition (mirrors AvailabilityChecker logic):
    const bannerWouldFire =
      (result.coverage.pjiTotal ?? 0) > 0 &&
      (result.coverage.pjiInCircuit ?? 0) === 0;
    expect(bannerWouldFire).toBe(true);
  });

  it("VA cascade hits 4th Circuit (no rows): banner fires", async () => {
    scriptedCounts.set(key("v_pji_public"), 1772);

    const result = await checkFJIBCoverage(null, "VA");

    expect(result.coverage.pjiInCircuit).toBe(0);
    expect(result.coverage.supported).toBe(0);
    expect(result.matchedName).toBe("Fourth Circuit");
  });

  it("DC cascade: valid label but zero rows (banner fires)", async () => {
    scriptedCounts.set(key("v_pji_public"), 1772);

    const result = await checkFJIBCoverage("DC", "DC");

    expect(result.coverage.pjiTotal).toBe(1772);
    expect(result.coverage.pjiInCircuit).toBe(0);
    expect(result.coverage.supported).toBe(0);
    expect(result.matchedName).toBe("D.C. Circuit");
  });

  it("circuit 10 is NOT supported (was the audit-found bug): banner fires", async () => {
    scriptedCounts.set(key("v_pji_public"), 1772);

    const result = await checkFJIBCoverage("10", "CO");

    expect(result.coverage.pjiInCircuit).toBe(0);
    expect(result.coverage.supported).toBe(0);
  });

  it("11th Circuit (FL): banner fires when rows are zero", async () => {
    scriptedCounts.set(key("v_pji_public"), 1772);

    const result = await checkFJIBCoverage("11", "FL");

    expect(result.coverage.pjiInCircuit).toBe(0);
    expect(result.coverage.supported).toBe(0);
  });
});

describe("checkFJIBCoverage — edge inputs", () => {
  it("unknown circuit string: matchedName falls back to null", async () => {
    scriptedCounts.set(key("v_pji_public"), 1772);

    const result = await checkFJIBCoverage("99", "ZZ");

    expect(result.coverage.pjiInCircuit).toBe(0);
    expect(result.coverage.supported).toBe(0);
    expect(result.matchedName).toBeNull();
  });

  it("blank circuit + blank state: no resolution, banner triggers, available stays true", async () => {
    scriptedCounts.set(key("v_pji_public"), 1772);

    const result = await checkFJIBCoverage(null, "");

    expect(result.coverage.pjiInCircuit).toBe(0);
    expect(result.coverage.supported).toBe(0);
    expect(result.available).toBe(true);
  });
});
