/**
 * Unit tests for the charge-authority-pack coverage gate (2026-04-27,
 * closes C1 of worry-tier9-flipped-live audit).
 *
 * Focus:
 *   - checkChargeAuthorityPackCoverage exposes authoritiesCharge + authoritiesNational
 *   - Bridged charge slugs (CHARGE_TYPE_AUTHORITY_MAP) hit charge_type_top_authorities
 *   - Empty bridge ("federal", "self-defense") returns 0 charge-specific
 *     but always-positive national fallback
 *   - `available: true` regardless (resolver always has national fallback)
 *
 * test-isolation-na: read-only mock, no Supabase writes
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

interface QueryRecord {
  table: string;
  filters: Array<{ col: string; val: unknown }>;
  inFilter: { col: string; val: unknown[] } | null;
  isCount: boolean;
}

let queryLog: QueryRecord[] = [];
let scriptedCounts: Map<string, number> = new Map();

function key(table: string, inJoined?: string): string {
  return inJoined === undefined ? table : `${table}|in:${inJoined}`;
}

function mockBuilder(table: string, isCount: boolean) {
  const filters: Array<{ col: string; val: unknown }> = [];
  let inFilter: { col: string; val: unknown[] } | null = null;
  const record: QueryRecord = { table, filters, inFilter, isCount };
  queryLog.push(record);

  const builder: Record<string, unknown> = {};
  builder.eq = (col: string, val: unknown) => {
    filters.push({ col, val });
    return builder;
  };
  builder.in = (col: string, vals: unknown[]) => {
    inFilter = { col, val: vals };
    record.inFilter = inFilter;
    return builder;
  };
  builder.then = (resolve: (val: unknown) => unknown) => {
    let lookupKey: string;
    if (inFilter) {
      const joined = (inFilter.val as string[]).slice().sort().join(",");
      lookupKey = key(table, joined);
    } else {
      lookupKey = key(table);
    }
    const explicit = scriptedCounts.get(lookupKey) ?? scriptedCounts.get(key(table));
    if (isCount) {
      return Promise.resolve({ count: explicit ?? 0, data: null, error: null }).then(
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

import { checkChargeAuthorityPackCoverage } from "../coverage";
import { CHARGE_TYPE_AUTHORITY_MAP } from "@/lib/charge-slug-maps";

beforeEach(() => {
  queryLog = [];
  scriptedCounts = new Map();
});

describe("checkChargeAuthorityPackCoverage — charge + national exposure", () => {
  it("dense charge (DUI): authoritiesCharge > 0 and authoritiesNational > 0", async () => {
    // CHARGE_TYPE_AUTHORITY_MAP['dui'] = ['dui-dwi', 'dui-drugs',
    // 'dui-felony-injury', 'refusing-breath-test']
    const duiBridge = CHARGE_TYPE_AUTHORITY_MAP["dui"]!.slice().sort().join(",");
    scriptedCounts.set(`charge_type_top_authorities|in:${duiBridge}`, 84);
    scriptedCounts.set("citation_authority_criminal", 620000);

    const result = await checkChargeAuthorityPackCoverage("dui", "FL");

    expect(result.coverage.authoritiesCharge).toBe(84);
    expect(result.coverage.authoritiesNational).toBe(620000);
    expect(result.available).toBe(true);
  });

  it("empty-bridge charge (federal): authoritiesCharge=0 but authoritiesNational > 0", async () => {
    // CHARGE_TYPE_AUTHORITY_MAP['federal'] = []
    expect(CHARGE_TYPE_AUTHORITY_MAP["federal"]).toEqual([]);
    scriptedCounts.set("citation_authority_criminal", 620000);

    const result = await checkChargeAuthorityPackCoverage("federal", "TX");

    expect(result.coverage.authoritiesCharge).toBe(0);
    expect(result.coverage.authoritiesNational).toBe(620000);
    // Resolver always has national fallback — banner discloses, buy stays.
    expect(result.available).toBe(true);
  });

  it("unmapped charge slug: authoritiesCharge=0 still safe (no .in([])) and national still surfaces", async () => {
    scriptedCounts.set("citation_authority_criminal", 620000);

    const result = await checkChargeAuthorityPackCoverage(
      "made-up-not-in-map",
      "CA",
    );

    expect(result.coverage.authoritiesCharge).toBe(0);
    expect(result.coverage.authoritiesNational).toBe(620000);
    expect(result.available).toBe(true);
    // Verify no IN query was issued against the empty bridge.
    const inQueries = queryLog.filter(
      (q) => q.table === "charge_type_top_authorities" && q.inFilter !== null,
    );
    expect(inQueries.length).toBe(0);
  });

  it("queries charge_type_top_authorities with the bridged internal slugs", async () => {
    const trafficBridge = CHARGE_TYPE_AUTHORITY_MAP["drug-trafficking"]!;
    scriptedCounts.set(
      `charge_type_top_authorities|in:${trafficBridge.slice().sort().join(",")}`,
      37,
    );
    scriptedCounts.set("citation_authority_criminal", 620000);

    await checkChargeAuthorityPackCoverage("drug-trafficking", "NV");

    const ctaQueries = queryLog.filter(
      (q) => q.table === "charge_type_top_authorities" && q.isCount,
    );
    expect(ctaQueries).toHaveLength(1);
    expect(ctaQueries[0].inFilter?.col).toBe("charge_type");
    expect(ctaQueries[0].inFilter?.val).toEqual(trafficBridge);
  });
});
