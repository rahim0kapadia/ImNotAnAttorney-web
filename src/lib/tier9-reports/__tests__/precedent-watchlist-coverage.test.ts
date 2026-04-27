/**
 * Unit tests for the precedent-watchlist coverage gate (2026-04-27,
 * closes C2 of worry-tier9-flipped-live audit).
 *
 * Focus:
 *   - checkPrecedentWatchlistCoverage exposes risingPrecedents + fadingPrecedents
 *   - Bridged charge slugs (CHARGE_TYPE_AUTHORITY_MAP) hit citation_velocity_criminal
 *   - Empty bridge ("federal", "self-defense") returns 0 rising AND 0 fading
 *   - `available: true` always (resolver has national fallback in renderer)
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

function makeKey(
  table: string,
  inJoined: string | null,
  filters: Array<{ col: string; val: unknown }>,
): string {
  const f = filters
    .map((x) => `${x.col}=${String(x.val)}`)
    .sort()
    .join(";");
  if (inJoined === null) return `${table}|${f}`;
  return `${table}|in:${inJoined}|${f}`;
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
    const inJoined = inFilter
      ? (inFilter.val as string[]).slice().sort().join(",")
      : null;
    const lookupKey = makeKey(table, inJoined, filters);
    const explicit =
      scriptedCounts.get(lookupKey) ?? scriptedCounts.get(table) ?? 0;
    if (isCount) {
      return Promise.resolve({ count: explicit, data: null, error: null }).then(
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

import { checkPrecedentWatchlistCoverage } from "../coverage";
import { CHARGE_TYPE_AUTHORITY_MAP } from "@/lib/charge-slug-maps";

beforeEach(() => {
  queryLog = [];
  scriptedCounts = new Map();
});

describe("checkPrecedentWatchlistCoverage — rising + fading exposure", () => {
  it("dense charge (DUI): risingPrecedents > 0 and fadingPrecedents >= 0", async () => {
    const duiBridge = CHARGE_TYPE_AUTHORITY_MAP["dui"]!.slice().sort().join(",");
    scriptedCounts.set(
      `citation_velocity_criminal|in:${duiBridge}|rising_flag=true`,
      127,
    );
    scriptedCounts.set(
      `citation_velocity_criminal|in:${duiBridge}|velocity_tier=fading`,
      24,
    );

    const result = await checkPrecedentWatchlistCoverage("dui", "FL");

    expect(result.coverage.risingPrecedents).toBe(127);
    expect(result.coverage.fadingPrecedents).toBe(24);
    expect(result.available).toBe(true);
  });

  it("empty-bridge charge (federal): both counters zero, available stays true", async () => {
    expect(CHARGE_TYPE_AUTHORITY_MAP["federal"]).toEqual([]);

    const result = await checkPrecedentWatchlistCoverage("federal", "TX");

    expect(result.coverage.risingPrecedents).toBe(0);
    expect(result.coverage.fadingPrecedents).toBe(0);
    // Resolver always has national fallback for the watchlist — banner
    // discloses, buy stays.
    expect(result.available).toBe(true);
  });

  it("unmapped charge slug: skips IN query against citation_velocity_criminal", async () => {
    const result = await checkPrecedentWatchlistCoverage(
      "made-up-not-in-map",
      "CA",
    );

    expect(result.coverage.risingPrecedents).toBe(0);
    expect(result.coverage.fadingPrecedents).toBe(0);
    expect(result.available).toBe(true);
    const cvcInQueries = queryLog.filter(
      (q) => q.table === "citation_velocity_criminal" && q.inFilter !== null,
    );
    expect(cvcInQueries.length).toBe(0);
  });

  it("queries citation_velocity_criminal with rising_flag=true AND velocity_tier=fading separately", async () => {
    const robberyBridge = CHARGE_TYPE_AUTHORITY_MAP["robbery"]!;
    scriptedCounts.set(
      `citation_velocity_criminal|in:${robberyBridge.slice().sort().join(",")}|rising_flag=true`,
      42,
    );
    scriptedCounts.set(
      `citation_velocity_criminal|in:${robberyBridge.slice().sort().join(",")}|velocity_tier=fading`,
      11,
    );

    await checkPrecedentWatchlistCoverage("robbery", "NY");

    const cvcQueries = queryLog.filter(
      (q) => q.table === "citation_velocity_criminal" && q.isCount,
    );
    // Two parallel queries — one rising, one fading.
    expect(cvcQueries).toHaveLength(2);
    const risingQ = cvcQueries.find((q) =>
      q.filters.some((f) => f.col === "rising_flag" && f.val === true),
    );
    const fadingQ = cvcQueries.find((q) =>
      q.filters.some(
        (f) => f.col === "velocity_tier" && f.val === "fading",
      ),
    );
    expect(risingQ).toBeDefined();
    expect(fadingQ).toBeDefined();
    expect(risingQ!.inFilter?.col).toBe("charge_type");
    expect(fadingQ!.inFilter?.col).toBe("charge_type");
  });
});
