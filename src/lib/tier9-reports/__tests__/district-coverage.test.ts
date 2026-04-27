/**
 * Unit tests for the rewritten District-Court coverage gate
 * (C4 stop-the-bleed, 2026-04-26).
 *
 * Old behavior queried `judge_demographics.district ilike %stateName%` and
 * `outcome_benchmarks.jurisdiction_name ilike %stateName%` — both wrong:
 *   - judge_demographics.district stores numeric district codes ("30",
 *     "40", "73", "90"), not state names. ILIKE returned zero rows.
 *   - outcome_benchmarks.jurisdiction_name is national-only — no state rows.
 * Net effect: every state returned `available: false`.
 *
 * New behavior mirrors the post-purchase resolver in
 * `src/lib/tier9-reports/courthouse-intelligence.ts`:
 *   1. ussc_districts → matched federal districts (cl_court_id, circuit).
 *   2. judge_disposition_profile rows where district_id IN those cl_court_ids.
 *   3. motion_outcome_rates_by_circuit rows for the normalized circuit
 *      with charge_type='(all)'.
 *
 * test-isolation-na: read-only mock, no Supabase writes
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

interface QueryRecord {
  table: string;
  columns: string;
  isCount: boolean;
  filters: Array<{ kind: "eq" | "in"; col: string; val: unknown }>;
}

let queryLog: QueryRecord[] = [];

interface ScriptedDistrict {
  cl_court_id: string;
  district_name: string;
  circuit: string;
}

interface Scenario {
  districts: ScriptedDistrict[];
  judgeCount: number;
  motionCount: number;
}

let scenarios: Map<string, Scenario> = new Map();

function mockBuilder(table: string, columns: string, isCount: boolean) {
  const filters: QueryRecord["filters"] = [];
  const record: QueryRecord = { table, columns, isCount, filters };
  queryLog.push(record);

  const builder: Record<string, unknown> = {};
  builder.eq = (col: string, val: unknown) => {
    filters.push({ kind: "eq", col, val });
    return builder;
  };
  builder.in = (col: string, val: unknown) => {
    filters.push({ kind: "in", col, val });
    return builder;
  };
  builder.then = (resolve: (val: unknown) => unknown) => {
    if (table === "ussc_districts") {
      const stateFilter = filters.find(
        (f) => f.kind === "eq" && f.col === "state_code",
      );
      const state = stateFilter?.val as string | undefined;
      const scenario = state ? scenarios.get(state) : undefined;
      const data = scenario ? scenario.districts : [];
      return Promise.resolve({ data, error: null }).then(resolve);
    }
    if (table === "judge_disposition_profile" && isCount) {
      const inFilter = filters.find((f) => f.kind === "in");
      const ids = (inFilter?.val as string[]) ?? [];
      const matched = Array.from(scenarios.values()).find((s) =>
        s.districts.some((d) => ids.includes(d.cl_court_id)),
      );
      return Promise.resolve({
        count: matched?.judgeCount ?? 0,
        data: null,
        error: null,
      }).then(resolve);
    }
    if (table === "motion_outcome_rates_by_circuit" && isCount) {
      const circuit = filters.find(
        (f) => f.kind === "eq" && f.col === "circuit",
      )?.val as string | undefined;
      const matched = Array.from(scenarios.values()).find(
        (s) =>
          s.districts.length > 0 &&
          normalizeCircuit(s.districts[0].circuit) === circuit,
      );
      return Promise.resolve({
        count: matched?.motionCount ?? 0,
        data: null,
        error: null,
      }).then(resolve);
    }
    return Promise.resolve({ count: 0, data: null, error: null }).then(resolve);
  };
  return builder;
}

function normalizeCircuit(c: string): string {
  const m = c.match(/^(\d+)(st|nd|rd|th)$/i);
  return m ? m[1] : c;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: (columns: string, opts?: { count?: string; head?: boolean }) => {
        const isCount = !!(opts && opts.count === "exact");
        return mockBuilder(table, columns, isCount);
      },
    }),
  }),
}));

import { checkDistrictCoverage } from "../coverage";

beforeEach(() => {
  queryLog = [];
  scenarios = new Map();
  scenarios.set("FL", {
    districts: [
      { cl_court_id: "flnd", district_name: "Northern District of Florida", circuit: "11th" },
      { cl_court_id: "flmd", district_name: "Middle District of Florida", circuit: "11th" },
      { cl_court_id: "flsd", district_name: "Southern District of Florida", circuit: "11th" },
    ],
    judgeCount: 56,
    motionCount: 17,
  });
  scenarios.set("TX", {
    districts: [
      { cl_court_id: "txnd", district_name: "Northern District of Texas", circuit: "5th" },
      { cl_court_id: "txed", district_name: "Eastern District of Texas", circuit: "5th" },
      { cl_court_id: "txsd", district_name: "Southern District of Texas", circuit: "5th" },
      { cl_court_id: "txwd", district_name: "Western District of Texas", circuit: "5th" },
    ],
    judgeCount: 79,
    motionCount: 18,
  });
  scenarios.set("CA", {
    districts: [
      { cl_court_id: "cand", district_name: "Northern District of California", circuit: "9th" },
      { cl_court_id: "caed", district_name: "Eastern District of California", circuit: "9th" },
      { cl_court_id: "cacd", district_name: "Central District of California", circuit: "9th" },
      { cl_court_id: "casd", district_name: "Southern District of California", circuit: "9th" },
    ],
    judgeCount: 85,
    motionCount: 19,
  });
  scenarios.set("NY", {
    districts: [
      { cl_court_id: "nynd", district_name: "Northern District of New York", circuit: "2nd" },
      { cl_court_id: "nyed", district_name: "Eastern District of New York", circuit: "2nd" },
      { cl_court_id: "nysd", district_name: "Southern District of New York", circuit: "2nd" },
      { cl_court_id: "nywd", district_name: "Western District of New York", circuit: "2nd" },
    ],
    judgeCount: 92,
    motionCount: 19,
  });
});

describe("checkDistrictCoverage — rewritten C4 stop-the-bleed gate", () => {
  it("FL: matches 3 federal districts, gate flips truthy", async () => {
    const result = await checkDistrictCoverage("FL");
    expect(result.coverage.districts).toBe(3);
    expect(result.coverage.districts).toBeGreaterThanOrEqual(1);
    expect(result.coverage.judges).toBe(56);
    expect(result.coverage.circuitMotions).toBe(17);
    expect(result.available).toBe(true);
    expect(result.matchedName).toBe("Florida");
  });

  it("TX: matches 4 federal districts, gate flips truthy", async () => {
    const result = await checkDistrictCoverage("TX");
    expect(result.coverage.districts).toBe(4);
    expect(result.coverage.districts).toBeGreaterThanOrEqual(1);
    expect(result.coverage.judges).toBe(79);
    expect(result.coverage.circuitMotions).toBe(18);
    expect(result.available).toBe(true);
    expect(result.matchedName).toBe("Texas");
  });

  it("CA: matches 4 federal districts, gate flips truthy", async () => {
    const result = await checkDistrictCoverage("CA");
    expect(result.coverage.districts).toBe(4);
    expect(result.coverage.districts).toBeGreaterThanOrEqual(1);
    expect(result.coverage.judges).toBe(85);
    expect(result.coverage.circuitMotions).toBe(19);
    expect(result.available).toBe(true);
    expect(result.matchedName).toBe("California");
  });

  it("NY: matches 4 federal districts, gate flips truthy", async () => {
    const result = await checkDistrictCoverage("NY");
    expect(result.coverage.districts).toBe(4);
    expect(result.coverage.districts).toBeGreaterThanOrEqual(1);
    expect(result.coverage.judges).toBe(92);
    expect(result.coverage.circuitMotions).toBe(19);
    expect(result.available).toBe(true);
    expect(result.matchedName).toBe("New York");
  });

  it("uppercases lowercase state codes before query", async () => {
    const result = await checkDistrictCoverage("fl");
    expect(result.coverage.districts).toBe(3);
    const usscQuery = queryLog.find((q) => q.table === "ussc_districts");
    const stateFilter = usscQuery?.filters.find(
      (f) => f.kind === "eq" && f.col === "state_code",
    );
    expect(stateFilter?.val).toBe("FL");
  });

  it("queries judge_disposition_profile via IN(cl_court_ids), not ilike(stateName)", async () => {
    await checkDistrictCoverage("TX");
    const judgeQuery = queryLog.find(
      (q) => q.table === "judge_disposition_profile" && q.isCount,
    );
    expect(judgeQuery).toBeTruthy();
    const inFilter = judgeQuery?.filters.find((f) => f.kind === "in");
    expect(inFilter?.col).toBe("district_id");
    expect(inFilter?.val).toEqual(["txnd", "txed", "txsd", "txwd"]);
    // Negative: must NOT use the broken ilike-on-state-name pattern.
    const ilikeFilters = judgeQuery?.filters.filter(
      (f) => f.kind === "eq" && f.col === "district",
    );
    expect(ilikeFilters?.length ?? 0).toBe(0);
  });

  it("queries motion_outcome_rates_by_circuit with normalized circuit + charge_type='(all)'", async () => {
    await checkDistrictCoverage("CA");
    const motionQuery = queryLog.find(
      (q) => q.table === "motion_outcome_rates_by_circuit" && q.isCount,
    );
    expect(motionQuery).toBeTruthy();
    const circuitFilter = motionQuery?.filters.find(
      (f) => f.kind === "eq" && f.col === "circuit",
    );
    const chargeFilter = motionQuery?.filters.find(
      (f) => f.kind === "eq" && f.col === "charge_type",
    );
    expect(circuitFilter?.val).toBe("9");
    expect(chargeFilter?.val).toBe("(all)");
  });

  it("does NOT query the broken outcome_benchmarks.jurisdiction_name path", async () => {
    await checkDistrictCoverage("FL");
    const benchQueries = queryLog.filter(
      (q) => q.table === "outcome_benchmarks",
    );
    expect(benchQueries).toHaveLength(0);
  });

  it("zero-coverage state: no scenario seeded → districts=0, available:false", async () => {
    const result = await checkDistrictCoverage("ZZ");
    expect(result.coverage.districts).toBe(0);
    expect(result.available).toBe(false);
  });
});
