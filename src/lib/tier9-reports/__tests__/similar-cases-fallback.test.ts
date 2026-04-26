/**
 * Unit tests for the similar-cases-analyzer state-coverage gating + federal
 * fallback (D2 plan, 2026-04-26).
 *
 * Focus:
 *   - querySimilarCases pleaSource discriminator (state | federal | none)
 *   - querySimilarCases sentencingSource discriminator (state | federal | none)
 *   - checkSimilarCasesCoverage exposes the four new counts
 *   - Federal fallback only fires when state-level returns 0 rows
 *
 * The Supabase admin client is mocked at module level. Each `from(...)` call
 * is replayed against a per-test scripted query log so the federal-fallback
 * second-query path can be observed.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Supabase mock ────────────────────────────────────────────────────
// Each test seeds a script keyed by `${table}|${jurisdictionFilter}`.
// The mock client returns canned rows for matching scripts and `[]` otherwise.
// `count` queries return { count: rows.length }.

interface QueryRecord {
  table: string;
  filters: Array<{ col: string; val: unknown }>;
  isCount: boolean;
}

let queryLog: QueryRecord[] = [];
let scriptedRows: Map<string, unknown[]> = new Map();

function rowsKey(table: string, jurisdiction?: string): string {
  return jurisdiction === undefined ? table : `${table}|${jurisdiction}`;
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
  builder.in = (col: string, val: unknown) => {
    filters.push({ col, val });
    return builder;
  };
  builder.order = () => builder;
  builder.limit = () => builder;
  builder.then = (resolve: (val: unknown) => unknown) => {
    const jurisdictionFilter = filters.find((f) => f.col === "jurisdiction")?.val as
      | string
      | undefined;
    const rows =
      scriptedRows.get(rowsKey(table, jurisdictionFilter)) ??
      scriptedRows.get(rowsKey(table)) ??
      [];
    if (isCount) {
      return Promise.resolve({ count: rows.length, data: null }).then(resolve);
    }
    return Promise.resolve({ data: rows, error: null }).then(resolve);
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

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: async () => false,
}));

vi.mock("../cpd-match", () => ({
  parseOfficerName: () => ({ lastName: "", firstName: "" }),
}));

vi.mock("../nypd-match", () => ({
  parseNypdName: () => ({ lastName: "", firstName: "" }),
  classifyNypdSignal: () => null,
  fetchNypdCandidates: async () => ({ candidates: [], truncated: false }),
  chooseNypdMatch: () => ({ status: "none", matchedTaxId: null }),
}));

import { querySimilarCases } from "../query";
import { checkSimilarCasesCoverage } from "../coverage";

const PLEA_STATE_ROW = {
  charge_slug: "drug-possession",
  base_sentence: 36,
  plea_sentence: 18,
  cooperation_bonus: 6,
  sample_size: 120,
  source_urls: ["https://example.com/state-source"],
};

const PLEA_FEDERAL_ROW = {
  charge_slug: "drug-possession",
  base_sentence: 60,
  plea_sentence: 30,
  cooperation_bonus: 12,
  sample_size: 800,
  source_urls: ["https://example.com/federal-source"],
};

const SENT_STATE_ROW = {
  judge_id: null,
  charge_slug: "drug-possession",
  median_months: 12,
  p25: 6,
  p75: 18,
  sample_size: 90,
  source_urls: ["https://example.com/state-sent"],
};

const SENT_FEDERAL_ROW = {
  judge_id: null,
  charge_slug: "drug-possession",
  median_months: 24,
  p25: 12,
  p75: 36,
  sample_size: 500,
  source_urls: ["https://example.com/fed-sent"],
};

beforeEach(() => {
  queryLog = [];
  scriptedRows = new Map();
});

describe("querySimilarCases — pleaSource fallback", () => {
  it("pleaSource === 'state' when state-level rows exist", async () => {
    scriptedRows.set(rowsKey("plea_discount_curves", "FL"), [PLEA_STATE_ROW]);
    scriptedRows.set(rowsKey("sentencing_distributions", "FL"), [SENT_STATE_ROW]);

    const data = await querySimilarCases({
      chargeType: "drug-possession",
      state: "FL",
    });

    expect(data.pleaSource).toBe("state");
    expect(data.pleaDiscountCurves.length).toBe(1);
    expect(data.pleaDiscountCurves[0].plea_sentence).toBe(18);
  });

  it("pleaSource === 'federal' when state empty but federal has rows", async () => {
    scriptedRows.set(
      rowsKey("plea_discount_curves", "federal"),
      [PLEA_FEDERAL_ROW],
    );
    // Provide federal sentencing too so the fallback path also exercises it
    scriptedRows.set(
      rowsKey("sentencing_distributions", "federal"),
      [SENT_FEDERAL_ROW],
    );

    const data = await querySimilarCases({
      chargeType: "drug-possession",
      state: "WY",
    });

    expect(data.pleaSource).toBe("federal");
    expect(data.pleaDiscountCurves.length).toBe(1);
    expect(data.pleaDiscountCurves[0].plea_sentence).toBe(30);

    // Confirm the second query targeted jurisdiction='federal'
    const pleaQueries = queryLog.filter((q) => q.table === "plea_discount_curves");
    expect(pleaQueries.length).toBe(2);
    const federalQuery = pleaQueries[1];
    expect(
      federalQuery.filters.find((f) => f.col === "jurisdiction")?.val,
    ).toBe("federal");
  });

  it("pleaSource === 'none' when neither state nor federal has rows", async () => {
    // No scripted rows for plea_discount_curves at all.
    const data = await querySimilarCases({
      chargeType: "drug-possession",
      state: "WY",
    });

    expect(data.pleaSource).toBe("none");
    expect(data.pleaDiscountCurves).toEqual([]);
  });
});

describe("querySimilarCases — sentencingSource fallback", () => {
  it("sentencingSource === 'state' when state-level rows exist", async () => {
    scriptedRows.set(rowsKey("sentencing_distributions", "IL"), [SENT_STATE_ROW]);

    const data = await querySimilarCases({
      chargeType: "drug-possession",
      state: "IL",
    });

    expect(data.sentencingSource).toBe("state");
    expect(data.sentencingDistributions.length).toBe(1);
    expect(data.sentencingDistributions[0].median_months).toBe(12);
  });

  it("sentencingSource === 'federal' when state empty but federal has rows", async () => {
    scriptedRows.set(
      rowsKey("sentencing_distributions", "federal"),
      [SENT_FEDERAL_ROW],
    );

    const data = await querySimilarCases({
      chargeType: "drug-possession",
      state: "WY",
    });

    expect(data.sentencingSource).toBe("federal");
    expect(data.sentencingDistributions.length).toBe(1);
    expect(data.sentencingDistributions[0].median_months).toBe(24);
  });

  it("sentencingSource === 'none' when neither state nor federal has rows", async () => {
    const data = await querySimilarCases({
      chargeType: "drug-possession",
      state: "WY",
    });

    expect(data.sentencingSource).toBe("none");
    expect(data.sentencingDistributions).toEqual([]);
  });
});

describe("checkSimilarCasesCoverage — new counts", () => {
  it("returns six distinct counts including the four new keys", async () => {
    // Seed feature_vectors so the gate-relevant similarCases is non-zero
    scriptedRows.set(rowsKey("case_feature_vectors", "FL"), [
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ]);
    scriptedRows.set(rowsKey("appellate_trends", "FL"), [{ id: "x" }]);
    scriptedRows.set(rowsKey("plea_discount_curves", "FL"), [PLEA_STATE_ROW]);
    scriptedRows.set(rowsKey("plea_discount_curves", "federal"), [
      PLEA_FEDERAL_ROW,
    ]);
    scriptedRows.set(rowsKey("sentencing_distributions", "FL"), [SENT_STATE_ROW]);
    scriptedRows.set(rowsKey("outcome_benchmarks"), [{ id: "n" }]);

    const result = await checkSimilarCasesCoverage("drug-possession", "FL");

    expect(result.coverage).toMatchObject({
      similarCases: 3,
      appellate: 1,
      pleaState: 1,
      pleaFederal: 1,
      sentencingState: 1,
      outcomeNational: 1,
    });
    expect(result.available).toBe(true);
  });

  it("flags federal-only coverage (state plea = 0, federal plea > 0)", async () => {
    scriptedRows.set(rowsKey("case_feature_vectors", "WY"), [
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ]);
    scriptedRows.set(rowsKey("plea_discount_curves", "federal"), [
      PLEA_FEDERAL_ROW,
    ]);
    // No WY state plea row, no WY sentencing.

    const result = await checkSimilarCasesCoverage("drug-possession", "WY");

    expect(result.coverage.pleaState).toBe(0);
    expect(result.coverage.pleaFederal).toBeGreaterThan(0);
    expect(result.coverage.sentencingState).toBe(0);
    expect(result.available).toBe(true); // similarCases >= 3 is the gate
  });
});
