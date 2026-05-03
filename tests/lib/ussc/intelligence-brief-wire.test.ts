/**
 * Unit tests for buildIbSentencingOverlay (TICKET-17 IB wire).
 *
 * Covers:
 *   - IB tier coverage gate (50 floor) is enforced via the wrapper
 *   - Returns null (not "") on empty result so callers can guard
 *     with truthiness
 *   - Returns IB-tier markdown shape when data is present
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildIbSentencingOverlay } from "@/lib/ussc/intelligence-brief-wire";

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

function mockSb(districtRows: FsdFixtureRow[], nationalRows: FsdFixtureRow[]): SupabaseClient {
  return {
    from(table: string) {
      let hasDistrictFilter = false;
      const builder: Record<string, unknown> = {
        select() { return builder; },
        eq(col: string) {
          if (col === "district") hasDistrictFilter = true;
          return builder;
        },
        gte() { return builder; },
        lte() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        maybeSingle() {
          if (table === "ussc_matview_meta") {
            return Promise.resolve({
              data: { refreshed_at: new Date().toISOString() },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve: (r: { data: FsdFixtureRow[]; error: null }) => void) {
          if (table === "federal_sentencing_distributions") {
            resolve({ data: hasDistrictFilter ? districtRows : nationalRows, error: null });
            return;
          }
          resolve({ data: [], error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("buildIbSentencingOverlay", () => {
  it("returns IB-shaped markdown when district sample meets IB floor", async () => {
    const sb = mockSb([buildRow({ n: 60 })], [buildRow({ district: "0", n: 5000 })]);
    const out = await buildIbSentencingOverlay(sb, {
      charge: "drug-trafficking",
      district: "42",
      criminalHistoryCategory: "3",
    });
    expect(out).not.toBeNull();
    expect(out).toMatch(/In your district/);
    expect(out).toMatch(/median 36 months/);
  });

  it("returns null when no usable data anywhere", async () => {
    const sb = mockSb([], []);
    const out = await buildIbSentencingOverlay(sb, {
      charge: "drug-trafficking",
      district: "42",
    });
    expect(out).toBeNull();
  });

  it("falls back to national when district below IB floor (50)", async () => {
    // 30 cases — below IB floor of 50, above CD floor of 20.
    const sb = mockSb([buildRow({ n: 30 })], [buildRow({ district: "0", n: 5000 })]);
    const out = await buildIbSentencingOverlay(sb, {
      charge: "drug-trafficking",
      district: "42",
      criminalHistoryCategory: "3",
    });
    expect(out).not.toBeNull();
    expect(out).toMatch(/too few cases to summarize/);
    expect(out).toMatch(/Nationally/);
  });
});
