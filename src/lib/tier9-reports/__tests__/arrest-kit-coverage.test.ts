/**
 * Unit tests for the arrest-survival-kit state-coverage gating
 * (D-T4 plan, 2026-04-26). Mirrors the officer-coverage test pattern.
 *
 * Focus:
 *   - checkArrestKitCoverage exposes agencyIncidentsState (mirrors `agencies`)
 *   - `available: true` regardless of state coverage (rights checklist universal)
 *   - Banner-trip condition: agencyIncidentsState < 50
 *
 * test-isolation-na: read-only mock, no Supabase writes
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

interface QueryRecord {
  table: string;
  filters: Array<{ col: string; val: unknown }>;
  isCount: boolean;
}

let queryLog: QueryRecord[] = [];
let scriptedCounts: Map<string, number> = new Map();

function rowsKey(table: string, stateFilter?: string): string {
  return stateFilter === undefined ? table : `${table}|${stateFilter}`;
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
    const stateFilter = filters.find((f) => f.col === "state")?.val as
      | string
      | undefined;
    const countKey = rowsKey(table, stateFilter);
    const explicitCount =
      scriptedCounts.get(countKey) ?? scriptedCounts.get(rowsKey(table)) ?? 0;
    if (isCount) {
      return Promise.resolve({ count: explicitCount, data: null, error: null }).then(
        resolve,
      );
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

import { checkArrestKitCoverage } from "../coverage";

beforeEach(() => {
  queryLog = [];
  scriptedCounts = new Map();
});

describe("checkArrestKitCoverage — agencyIncidentsState exposure", () => {
  it("rich state (CA): agencyIncidentsState above thin-state threshold", async () => {
    // Seed agency_incidents|CA with 370 (real-prod approximate).
    scriptedCounts.set(rowsKey("agency_incidents", "CA"), 370);
    scriptedCounts.set(rowsKey("officer_external_intel", "CA"), 50000);

    const result = await checkArrestKitCoverage("CA");

    expect(result.coverage.agencyIncidentsState).toBe(370);
    expect(result.coverage.agencies).toBe(370);
    expect(result.coverage.officers).toBe(50000);
    expect(result.coverage.agencyIncidentsState).toBeGreaterThanOrEqual(50);
    expect(result.available).toBe(true);
  });

  it("thin state (HI): agencyIncidentsState below threshold but available stays true", async () => {
    scriptedCounts.set(rowsKey("agency_incidents", "HI"), 8);
    scriptedCounts.set(rowsKey("officer_external_intel", "HI"), 200);

    const result = await checkArrestKitCoverage("HI");

    expect(result.coverage.agencyIncidentsState).toBe(8);
    expect(result.coverage.agencies).toBe(8);
    expect(result.coverage.agencyIncidentsState).toBeLessThan(50);
    // Rights checklist is universal — always available.
    expect(result.available).toBe(true);
  });

  it("zero-coverage state (PR): agencyIncidentsState 0, available still true", async () => {
    scriptedCounts.set(rowsKey("agency_incidents", "PR"), 0);
    scriptedCounts.set(rowsKey("officer_external_intel", "PR"), 0);

    const result = await checkArrestKitCoverage("PR");

    expect(result.coverage.agencyIncidentsState).toBe(0);
    expect(result.coverage.agencies).toBe(0);
    expect(result.available).toBe(true);
  });

  it("uppercases state code before query", async () => {
    scriptedCounts.set(rowsKey("agency_incidents", "TX"), 445);
    scriptedCounts.set(rowsKey("officer_external_intel", "TX"), 60000);

    const result = await checkArrestKitCoverage("tx");

    expect(result.coverage.agencyIncidentsState).toBe(445);
    // Verify the state filter sent to agency_incidents was uppercased.
    const agencyQuery = queryLog.find((q) => q.table === "agency_incidents");
    const stateFilter = agencyQuery?.filters.find((f) => f.col === "state");
    expect(stateFilter?.val).toBe("TX");
  });

  it("agencyIncidentsState mirrors agencies count (banner derivation)", async () => {
    // The AvailabilityChecker uses agencyIncidentsState ?? agencies; both
    // must be the same number for the banner threshold logic to be coherent.
    scriptedCounts.set(rowsKey("agency_incidents", "NY"), 103);
    scriptedCounts.set(rowsKey("officer_external_intel", "NY"), 30000);

    const result = await checkArrestKitCoverage("NY");

    expect(result.coverage.agencyIncidentsState).toBe(result.coverage.agencies);
  });

  // PR #180 review S2 (2026-04-26): lock the data flow direction. The
  // arrest-kit state-coverage gate must read its agency count from the
  // `agency_incidents` view (the authoritative rollup), not directly from
  // `officer_external_intel`. If the resolver is ever rewired to bypass the
  // view, this test fails before silent semantic drift can ship.
  it("queries agency_incidents (not officer_external_intel) for the agency-state count", async () => {
    scriptedCounts.set(rowsKey("agency_incidents", "AZ"), 84);
    scriptedCounts.set(rowsKey("officer_external_intel", "AZ"), 12000);

    await checkArrestKitCoverage("AZ");

    // Exactly one count query against agency_incidents.
    const agencyCountQueries = queryLog.filter(
      (q) => q.table === "agency_incidents" && q.isCount,
    );
    expect(agencyCountQueries).toHaveLength(1);
    // The state filter on that count query must match.
    const stateFilter = agencyCountQueries[0].filters.find(
      (f) => f.col === "state",
    );
    expect(stateFilter?.val).toBe("AZ");

    // officer_external_intel is queried only for the officer count (separate
    // dimension). We do NOT want a second count against officer_external_intel
    // standing in for the agency count.
    const officerAgencyQueries = queryLog.filter(
      (q) =>
        q.table === "officer_external_intel" &&
        q.isCount &&
        q.filters.some((f) => f.col === "state" && f.val === "AZ"),
    );
    // Allowed: officer_external_intel state count for `officers` dimension.
    expect(officerAgencyQueries.length).toBeLessThanOrEqual(1);
  });
});
