/**
 * Unit tests for the shared sentencing-distribution helper.
 *
 * Covers:
 *   - Tier-aware coverage gates (CD floor 20, IB 50, X-Ray 100, JRC 150)
 *   - Freshness gate disclosure (fresh / stale / no-meta)
 *   - Unmappable charge short-circuit
 *   - Each tier's renderer output shape
 *   - District-empty + no-data-anywhere paths
 */
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSentencingDistribution,
  renderSentencingDistribution,
  type SentencingDistributionResult,
} from "@/lib/ussc/distribution";

interface FsdFixtureRow {
  fy: number;
  district: string;
  circdist: string;
  offguide_code: number;
  offguide_label: string;
  offense_category: string;
  criminal_history_category: string;
  n: number;
  mean_months: number | null;
  median_months: number | null;
  p10_months: number | null;
  p25_months: number | null;
  p75_months: number | null;
  p90_months: number | null;
  downward_departure_rate: number | null;
  upward_departure_rate: number | null;
  probation_rate: number | null;
}

function buildRow(overrides: Partial<FsdFixtureRow> = {}): FsdFixtureRow {
  return {
    fy: 22,
    district: "42",
    circdist: "36",
    offguide_code: 10,
    offguide_label: "Drug Trafficking",
    offense_category: "drug",
    criminal_history_category: "3",
    n: 60,
    mean_months: 48,
    median_months: 36,
    p10_months: 12,
    p25_months: 24,
    p75_months: 72,
    p90_months: 120,
    downward_departure_rate: 0.15,
    upward_departure_rate: 0.02,
    probation_rate: 0.05,
    ...overrides,
  };
}

interface MockOpts {
  /** Rows returned from the federal_sentencing_distributions table when
   *  `district` is constrained. */
  districtRows?: FsdFixtureRow[];
  /** Rows returned when `district` is NOT constrained (national fallback). */
  nationalRows?: FsdFixtureRow[];
  /** Meta row payload — null = empty meta, omit = no meta call mocked. */
  metaRow?: { refreshed_at: string } | null;
  /** When true, simulate the meta table missing entirely. */
  metaTableMissing?: boolean;
}

function mockSupabase(opts: MockOpts): SupabaseClient {
  const districtRows = opts.districtRows ?? [];
  const nationalRows = opts.nationalRows ?? [];
  return {
    from(table: string) {
      let hasDistrictFilter = false;
      const builder: Record<string, unknown> = {
        select() {
          return builder;
        },
        eq(col: string) {
          if (col === "district") hasDistrictFilter = true;
          return builder;
        },
        gte() {
          return builder;
        },
        lte() {
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        maybeSingle() {
          if (table !== "ussc_matview_meta") {
            return Promise.resolve({ data: null, error: null });
          }
          if (opts.metaTableMissing) {
            return Promise.resolve({
              data: null,
              error: { code: "42P01", message: "relation does not exist" },
            });
          }
          return Promise.resolve({ data: opts.metaRow ?? null, error: null });
        },
        then(resolve: (r: { data: FsdFixtureRow[]; error: null }) => void) {
          if (table === "federal_sentencing_distributions") {
            resolve({
              data: hasDistrictFilter ? districtRows : nationalRows,
              error: null,
            });
            return;
          }
          resolve({ data: [], error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("getSentencingDistribution", () => {
  it("returns district_agg when sample size meets CD floor (>=20)", async () => {
    const sb = mockSupabase({
      districtRows: [buildRow({ n: 25 })],
      nationalRows: [buildRow({ district: "0", n: 5000 })],
      metaRow: { refreshed_at: new Date().toISOString() },
    });
    const r = await getSentencingDistribution(sb, {
      charge: "drug-trafficking",
      district: "42",
      tier: "case-decoder",
      criminalHistoryCategory: "3",
    });
    expect(r.coverage_status).toBe("district-rendered");
    expect(r.district_agg?.median).toBe(36);
    expect(r.district_sample_n).toBe(25);
    expect(r.fallback_reason).toBeNull();
  });

  it("drops district_agg when below CD floor (<20)", async () => {
    const sb = mockSupabase({
      districtRows: [buildRow({ n: 5 })],
      nationalRows: [buildRow({ district: "0", n: 5000 })],
      metaRow: { refreshed_at: new Date().toISOString() },
    });
    const r = await getSentencingDistribution(sb, {
      charge: "drug-trafficking",
      district: "42",
      tier: "case-decoder",
      criminalHistoryCategory: "3",
    });
    expect(r.coverage_status).toBe("district-below-floor");
    expect(r.district_agg).toBeNull();
    expect(r.national_agg).not.toBeNull();
    expect(r.fallback_reason).toMatch(/below case-decoder threshold/i);
  });

  it("requires a higher floor at IB tier (50) than CD (20)", async () => {
    const sb = mockSupabase({
      districtRows: [buildRow({ n: 30 })],
      nationalRows: [buildRow({ district: "0", n: 5000 })],
      metaRow: { refreshed_at: new Date().toISOString() },
    });
    const r = await getSentencingDistribution(sb, {
      charge: "drug-trafficking",
      district: "42",
      tier: "intelligence-brief",
      criminalHistoryCategory: "3",
    });
    expect(r.coverage_status).toBe("district-below-floor");
  });

  it("requires the highest floor at JRC tier (150)", async () => {
    const sb = mockSupabase({
      districtRows: [buildRow({ n: 120 })],
      nationalRows: [buildRow({ district: "0", n: 5000 })],
      metaRow: { refreshed_at: new Date().toISOString() },
    });
    const r = await getSentencingDistribution(sb, {
      charge: "drug-trafficking",
      district: "42",
      tier: "judge-report-card",
      criminalHistoryCategory: "3",
    });
    // 120 < 150 floor
    expect(r.coverage_status).toBe("district-below-floor");
  });

  it("X-Ray floor (100) accepts 100 cases", async () => {
    const sb = mockSupabase({
      districtRows: [buildRow({ n: 100 })],
      nationalRows: [buildRow({ district: "0", n: 5000 })],
      metaRow: { refreshed_at: new Date().toISOString() },
    });
    const r = await getSentencingDistribution(sb, {
      charge: "drug-trafficking",
      district: "42",
      tier: "xray",
      criminalHistoryCategory: "3",
    });
    expect(r.coverage_status).toBe("district-rendered");
    expect(r.district_sample_n).toBe(100);
  });

  it("returns no-district-supplied when district is null", async () => {
    const sb = mockSupabase({
      nationalRows: [buildRow({ district: "0", n: 5000 })],
      metaRow: { refreshed_at: new Date().toISOString() },
    });
    const r = await getSentencingDistribution(sb, {
      charge: "drug-trafficking",
      district: null,
      tier: "case-decoder",
    });
    expect(r.coverage_status).toBe("no-district-supplied");
    expect(r.district_agg).toBeNull();
    expect(r.national_agg).not.toBeNull();
  });

  it("returns no-data-anywhere when both district + national are empty", async () => {
    const sb = mockSupabase({
      districtRows: [],
      nationalRows: [],
      metaRow: { refreshed_at: new Date().toISOString() },
    });
    const r = await getSentencingDistribution(sb, {
      charge: "drug-trafficking",
      district: "42",
      tier: "case-decoder",
    });
    expect(r.coverage_status).toBe("no-data-anywhere");
    expect(r.district_agg).toBeNull();
    expect(r.national_agg).toBeNull();
  });

  it("short-circuits with fallback_reason when charge is unmappable", async () => {
    // 'dui' is state-only — no federal offguide.
    const sb = mockSupabase({});
    const r = await getSentencingDistribution(sb, {
      charge: "dui",
      district: "42",
      tier: "case-decoder",
    });
    expect(r.coverage_status).toBe("no-data-anywhere");
    expect(r.fallback_reason).toMatch(/n.t mapped/i);
    expect(r.district_agg).toBeNull();
  });

  it("flags is_stale when matview is older than 30 days", async () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const sb = mockSupabase({
      districtRows: [buildRow({ n: 50 })],
      nationalRows: [buildRow({ district: "0", n: 5000 })],
      metaRow: { refreshed_at: fortyDaysAgo },
    });
    const r = await getSentencingDistribution(sb, {
      charge: "drug-trafficking",
      district: "42",
      tier: "case-decoder",
      criminalHistoryCategory: "3",
    });
    expect(r.is_stale).toBe(true);
    expect(r.last_refreshed).toBe(fortyDaysAgo);
    // Stale freshness does NOT block — district_agg still rendered.
    expect(r.district_agg).not.toBeNull();
  });

  it("degrades open when matview meta table is missing entirely", async () => {
    const sb = mockSupabase({
      districtRows: [buildRow({ n: 50 })],
      nationalRows: [buildRow({ district: "0", n: 5000 })],
      metaTableMissing: true,
    });
    const r = await getSentencingDistribution(sb, {
      charge: "drug-trafficking",
      district: "42",
      tier: "case-decoder",
      criminalHistoryCategory: "3",
    });
    // No meta -> last_refreshed null but query still runs.
    expect(r.last_refreshed).toBeNull();
    expect(r.is_stale).toBe(false);
    expect(r.district_agg).not.toBeNull();
  });
});

describe("renderSentencingDistribution", () => {
  function buildResult(
    overrides: Partial<SentencingDistributionResult> = {},
  ): SentencingDistributionResult {
    return {
      charge: "drug-trafficking",
      district: "42",
      tier: "case-decoder",
      district_agg: {
        p25: 24,
        median: 36,
        p75: 72,
        sample_n: 60,
        earliest_fy: 14,
        latest_fy: 24,
      },
      national_agg: {
        p25: 18,
        median: 30,
        p75: 60,
        sample_n: 5000,
        earliest_fy: 14,
        latest_fy: 24,
      },
      coverage_status: "district-rendered",
      district_sample_n: 60,
      national_sample_n: 5000,
      last_refreshed: new Date().toISOString(),
      is_stale: false,
      fallback_reason: null,
      ...overrides,
    };
  }

  it("CD renders one sentence with district numbers", () => {
    const out = renderSentencingDistribution(buildResult({ tier: "case-decoder" }));
    expect(out).toMatch(/cluster around 36 months/);
    expect(out).toMatch(/p25 24/);
    expect(out).toMatch(/60 cases/);
    // UPL-safe: no banned phrases
    expect(out).not.toMatch(/\byou should\b/i);
    expect(out).not.toMatch(/\bwe recommend\b/i);
  });

  it("IB renders paragraph + ascii spread", () => {
    const out = renderSentencingDistribution(buildResult({ tier: "intelligence-brief" }));
    expect(out).toMatch(/In your district/);
    expect(out).toMatch(/median 36 months/);
    expect(out).toMatch(/Nationally/);
    // ascii spread anchors
    expect(out).toMatch(/24mo/);
    expect(out).toMatch(/72mo/);
  });

  it("X-Ray renders both district + national charts", () => {
    const out = renderSentencingDistribution(buildResult({ tier: "xray" }));
    expect(out).toMatch(/District \(42\)/);
    expect(out).toMatch(/National:/);
    expect(out).toMatch(/p25 24 \| median 36 \| p75 72/);
    expect(out).toMatch(/p25 18 \| median 30 \| p75 60/);
  });

  it("JRC renders district baseline + judge-overlay disclaimer", () => {
    const out = renderSentencingDistribution(buildResult({ tier: "judge-report-card" }));
    expect(out).toMatch(/District-wide sentencing baseline/);
    expect(out).toMatch(/judge-specific overlay/);
    expect(out).toMatch(/median 36 months/);
  });

  it("emits empty string when there's no data anywhere", () => {
    const out = renderSentencingDistribution(
      buildResult({
        tier: "case-decoder",
        district_agg: null,
        national_agg: null,
        coverage_status: "no-data-anywhere",
      }),
    );
    expect(out).toBe("");
  });

  it("appends stale freshness disclosure when is_stale=true", () => {
    const stale = new Date("2026-01-01T00:00:00Z").toISOString();
    const out = renderSentencingDistribution(
      buildResult({ tier: "case-decoder", is_stale: true, last_refreshed: stale }),
    );
    expect(out).toMatch(/2026-01-01/);
    expect(out).toMatch(/older than 30-day freshness floor/);
  });

  it("IB falls back gracefully when district below floor", () => {
    const out = renderSentencingDistribution(
      buildResult({
        tier: "intelligence-brief",
        district_agg: null,
        coverage_status: "district-below-floor",
        district_sample_n: 12,
        fallback_reason: "District sample of 12 cases below intelligence-brief threshold of 50.",
      }),
    );
    expect(out).toMatch(/too few cases to summarize/);
    expect(out).toMatch(/12 cases/);
    expect(out).toMatch(/Nationally/);
  });
});
