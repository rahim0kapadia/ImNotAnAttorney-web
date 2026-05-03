/**
 * TICKET-12: parenthetical lookup tests.
 *
 * Mocks createAdminClient with a deterministic in-memory PostgREST stub.
 * Verifies bridge resolution (canonical_id -> cluster_id), batch bucketing,
 * limit clamping, and silent-degradation contract on errors.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;

let entitySourcesFixture: Row[] = [];
let parentheticalsFixture: Row[] = [];
let throwOn: string | null = null;

function makeQuery(table: string, dataFor: () => Row[]) {
  const q = {
    _filters: {} as Record<string, unknown>,
    _table: table,
    select: () => q,
    in: (col: string, vals: unknown[]) => {
      q._filters[`in:${col}`] = vals;
      return q;
    },
    eq: (col: string, val: unknown) => {
      q._filters[`eq:${col}`] = val;
      return q;
    },
    order: () => q,
    limit: () => q,
    then(cb: (v: { data: Row[] | null; error: unknown }) => unknown) {
      if (throwOn === q._table) {
        return Promise.resolve(cb({ data: null, error: new Error("boom") }));
      }
      let data = dataFor();
      // Apply filters that the helpers rely on
      for (const [key, val] of Object.entries(q._filters)) {
        const [op, col] = key.split(":");
        if (op === "eq") {
          data = data.filter((r) => r[col] === val);
        } else if (op === "in") {
          const set = new Set(val as unknown[]);
          data = data.filter((r) => set.has(r[col]));
        }
      }
      return Promise.resolve(cb({ data, error: null }));
    },
  };
  return q;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "entity_sources")
        return makeQuery(table, () => entitySourcesFixture);
      if (table === "v_parentheticals_for_case")
        return makeQuery(table, () => parentheticalsFixture);
      return makeQuery(table, () => []);
    },
  }),
}));

import {
  getParentheticalsForClusterId,
  getParentheticalsForCanonicalId,
  getParentheticalsForCanonicalIds,
} from "@/lib/parentheticals/lookup";

beforeEach(() => {
  entitySourcesFixture = [];
  parentheticalsFixture = [];
  throwOn = null;
});

describe("getParentheticalsForClusterId", () => {
  it("returns [] for empty input", async () => {
    expect(await getParentheticalsForClusterId("")).toEqual([]);
    // @ts-expect-error guard
    expect(await getParentheticalsForClusterId(null)).toEqual([]);
  });

  it("fetches and returns parentheticals for known cluster", async () => {
    parentheticalsFixture = [
      {
        parenthetical_id: "p1",
        described_cluster_id: "145875",
        describing_text: "holding X",
        describing_case_name: "Hill v. Lappin",
        describing_case_name_short: "Hill",
        describing_date_filed: "2010-12-28",
        describing_citation_count: 5039,
        source_url: "https://www.courtlistener.com/opinion/181820/",
      },
    ];
    const out = await getParentheticalsForClusterId("145875", 3);
    expect(out).toHaveLength(1);
    expect(out[0].describing_text).toBe("holding X");
  });

  it("returns [] silently on error (no throw)", async () => {
    throwOn = "v_parentheticals_for_case";
    const out = await getParentheticalsForClusterId("145875");
    expect(out).toEqual([]);
  });

  it("clamps limit defensively (NaN/<1/>10)", async () => {
    parentheticalsFixture = [
      {
        parenthetical_id: "p1",
        described_cluster_id: "x",
        describing_text: "t",
        describing_case_name: "n",
        describing_case_name_short: "n",
        describing_date_filed: null,
        describing_citation_count: null,
        source_url: "https://x/",
      },
    ];
    // None of these should throw or fail
    expect(await getParentheticalsForClusterId("x", NaN)).toHaveLength(1);
    expect(await getParentheticalsForClusterId("x", -5)).toHaveLength(1);
    expect(await getParentheticalsForClusterId("x", 9999)).toHaveLength(1);
  });
});

describe("getParentheticalsForCanonicalId", () => {
  it("returns [] when no entity_sources row exists", async () => {
    const out = await getParentheticalsForCanonicalId("uuid-no-bridge");
    expect(out).toEqual([]);
  });

  it("resolves canonical_id -> cluster_id and returns parentheticals", async () => {
    entitySourcesFixture = [
      {
        entity_id: "uuid-iqbal",
        entity_type: "case",
        source_system: "courtlistener",
        source_ref: "145875",
      },
    ];
    parentheticalsFixture = [
      {
        parenthetical_id: "p1",
        described_cluster_id: "145875",
        describing_text: "summarized as plausibility standard",
        describing_case_name: "Hill v. Lappin",
        describing_case_name_short: "Hill",
        describing_date_filed: "2010-12-28",
        describing_citation_count: 5039,
        source_url: "https://www.courtlistener.com/opinion/181820/",
      },
    ];
    const out = await getParentheticalsForCanonicalId("uuid-iqbal");
    expect(out).toHaveLength(1);
    expect(out[0].describing_text).toContain("plausibility");
  });

  it("returns [] for blank input", async () => {
    expect(await getParentheticalsForCanonicalId("")).toEqual([]);
  });
});

describe("getParentheticalsForCanonicalIds (batch)", () => {
  it("returns empty Map for empty input", async () => {
    const m = await getParentheticalsForCanonicalIds([]);
    expect(m.size).toBe(0);
  });

  it("buckets parentheticals back to canonical_ids", async () => {
    entitySourcesFixture = [
      {
        entity_id: "uuid-A",
        entity_type: "case",
        source_system: "courtlistener",
        source_ref: "100",
      },
      {
        entity_id: "uuid-B",
        entity_type: "case",
        source_system: "courtlistener",
        source_ref: "200",
      },
    ];
    parentheticalsFixture = [
      {
        parenthetical_id: "p1",
        described_cluster_id: "100",
        describing_text: "for A",
        describing_case_name: null,
        describing_case_name_short: null,
        describing_date_filed: null,
        describing_citation_count: null,
        source_url: "https://x/",
        relevance_score: 1,
      },
      {
        parenthetical_id: "p2",
        described_cluster_id: "200",
        describing_text: "for B",
        describing_case_name: null,
        describing_case_name_short: null,
        describing_date_filed: null,
        describing_citation_count: null,
        source_url: "https://y/",
        relevance_score: 1,
      },
    ];
    const m = await getParentheticalsForCanonicalIds(["uuid-A", "uuid-B"], 3);
    expect(m.get("uuid-A")?.[0].describing_text).toBe("for A");
    expect(m.get("uuid-B")?.[0].describing_text).toBe("for B");
  });

  it("dedupes input ids + skips non-strings", async () => {
    // Smoke test: shouldn't throw on dirty input
    const m = await getParentheticalsForCanonicalIds(
      // @ts-expect-error testing defensive filter
      ["a", "a", null, undefined, "", "b"],
      3
    );
    expect(m.size).toBe(0);
  });

  it("returns empty Map silently on error (no throw)", async () => {
    throwOn = "entity_sources";
    const m = await getParentheticalsForCanonicalIds(["uuid-X"]);
    expect(m.size).toBe(0);
  });

  it("respects per-case limit when bucketing", async () => {
    entitySourcesFixture = [
      {
        entity_id: "uuid-A",
        entity_type: "case",
        source_system: "courtlistener",
        source_ref: "100",
      },
    ];
    parentheticalsFixture = Array.from({ length: 10 }, (_, i) => ({
      parenthetical_id: `p${i}`,
      described_cluster_id: "100",
      describing_text: `t${i}`,
      describing_case_name: null,
      describing_case_name_short: null,
      describing_date_filed: null,
      describing_citation_count: null,
      source_url: "https://x/",
      relevance_score: 10 - i,
    }));
    const m = await getParentheticalsForCanonicalIds(["uuid-A"], 3);
    expect(m.get("uuid-A")).toHaveLength(3);
  });
});
