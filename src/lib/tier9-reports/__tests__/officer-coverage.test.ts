/**
 * Unit tests for the officer-background-check state-coverage gating
 * (D3 plan, 2026-04-26). Mirrors the similar-cases-fallback test pattern.
 *
 * Focus:
 *   - checkOfficerCoverage exposes externalIntelState count
 *   - CPD enrichment suppresses the thin-state signal (IL)
 *   - NYPD enrichment suppresses the thin-state signal (NY)
 *   - Banner-trip condition: externalIntelState < 50 AND no CPD AND no NYPD
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mutable mock state shared by helpers below ──────────────────────
interface QueryRecord {
  table: string;
  filters: Array<{ col: string; val: unknown }>;
  isCount: boolean;
}

let queryLog: QueryRecord[] = [];
/** Map keyed by `${table}|${stateFilter}` (or just `${table}` for unfiltered). */
let scriptedRows: Map<string, unknown[]> = new Map();
/** Map keyed by `${table}|${stateFilter}` returning a count override. */
let scriptedCounts: Map<string, number> = new Map();

function rowsKey(table: string, stateOrJurisdiction?: string): string {
  return stateOrJurisdiction === undefined
    ? table
    : `${table}|${stateOrJurisdiction}`;
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
  builder.ilike = (col: string, val: unknown) => {
    filters.push({ col, val });
    return builder;
  };
  builder.filter = (col: string, _op: string, val: unknown) => {
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
    // Pick the most informative filter for keying — state, jurisdiction,
    // or none. officer_external_intel uses 'state'; officer_reliability
    // uses 'jurisdiction'.
    const stateFilter = filters.find((f) => f.col === "state")?.val as
      | string
      | undefined;
    const jurisFilter = filters.find((f) => f.col === "jurisdiction")?.val as
      | string
      | undefined;
    const keyVal = stateFilter ?? jurisFilter;

    const countKey = rowsKey(table, keyVal);
    const explicitCount =
      scriptedCounts.get(countKey) ?? scriptedCounts.get(rowsKey(table));
    const rows =
      scriptedRows.get(countKey) ?? scriptedRows.get(rowsKey(table)) ?? [];
    if (isCount) {
      const count = explicitCount ?? rows.length;
      return Promise.resolve({ count, data: null, error: null }).then(resolve);
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

// Default: every flag off. Per-test overrides via vi.mocked below.
vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: vi.fn(async () => false),
}));

// CPD path — by default returns no name parse so probe is skipped.
vi.mock("../cpd-match", () => ({
  parseOfficerName: vi.fn(() => ({ lastName: "", firstName: "" })),
}));

// NYPD path — by default classifies signal as null (no NYPD probe).
vi.mock("../nypd-match", () => ({
  parseNypdName: vi.fn(() => ({ lastName: "", firstName: "" })),
  classifyNypdSignal: vi.fn(() => null),
  fetchNypdCandidates: vi.fn(async () => ({ candidates: [], truncated: false })),
  chooseNypdMatch: vi.fn(() => ({ status: "none", matchedTaxId: null })),
}));

import { checkOfficerCoverage } from "../coverage";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { parseOfficerName } from "../cpd-match";
import {
  classifyNypdSignal,
  fetchNypdCandidates,
  chooseNypdMatch,
  parseNypdName,
} from "../nypd-match";

beforeEach(() => {
  queryLog = [];
  scriptedRows = new Map();
  scriptedCounts = new Map();
  vi.mocked(isFeatureEnabled).mockImplementation(async () => false);
  vi.mocked(parseOfficerName).mockImplementation(() => ({
    lastName: "",
    firstName: "",
  }));
  vi.mocked(parseNypdName).mockImplementation(() => ({
    lastName: "",
    firstName: "",
  }));
  vi.mocked(classifyNypdSignal).mockImplementation(() => null);
  vi.mocked(fetchNypdCandidates).mockImplementation(async () => ({
    candidates: [],
    truncated: false,
  }));
  vi.mocked(chooseNypdMatch).mockImplementation(() => ({
    status: "none",
    candidates: [],
    matchedTaxId: null,
  }));
});

describe("checkOfficerCoverage — externalIntelState exposure", () => {
  it("rich coverage: GA returns externalIntelState well above threshold", async () => {
    // Seed officer_external_intel|GA with a count >= 50.
    scriptedCounts.set(rowsKey("officer_external_intel", "GA"), 239624);
    // Name-match in officer_reliability for GA returns 1 row so available=true.
    scriptedCounts.set(rowsKey("officer_reliability", "GA"), 1);

    const result = await checkOfficerCoverage("Smith", "GA");

    expect(result.coverage.externalIntelState).toBe(239624);
    expect(result.coverage.externalIntelState).toBeGreaterThanOrEqual(50);
    expect(result.available).toBe(true);
  });

  it("thin coverage: HI returns externalIntelState=8 (banner-trip met)", async () => {
    scriptedCounts.set(rowsKey("officer_external_intel", "HI"), 8);
    // No HI-jurisdiction reliability row — falls back to nationwide.
    scriptedCounts.set(rowsKey("officer_reliability", "HI"), 0);
    scriptedCounts.set(rowsKey("officer_reliability"), 1);

    const result = await checkOfficerCoverage("Smith", "HI");

    expect(result.coverage.externalIntelState).toBe(8);
    expect(result.coverage.officers).toBe(1);
    expect(result.coverage.cpdComplaints ?? 0).toBe(0);
    expect(result.coverage.nypdOfficers ?? 0).toBe(0);
    // Banner-trip: <50 AND no CPD AND no NYPD
    const bannerWouldFire =
      (result.coverage.externalIntelState ?? 0) < 50 &&
      (result.coverage.cpdComplaints ?? 0) === 0 &&
      (result.coverage.nypdOfficers ?? 0) === 0;
    expect(bannerWouldFire).toBe(true);
    // available=true via nationwide name match
    expect(result.available).toBe(true);
  });

  it("thin external_intel + CPD match: IL with feature flag suppresses banner", async () => {
    // 25 IL ext-intel rows (under 50 — would normally be thin).
    scriptedCounts.set(rowsKey("officer_external_intel", "IL"), 25);
    // Reliability nationwide fallback returns 1 so available holds.
    scriptedCounts.set(rowsKey("officer_reliability", "IL"), 0);
    scriptedCounts.set(rowsKey("officer_reliability"), 1);
    // Feature flag on for CPD only.
    vi.mocked(isFeatureEnabled).mockImplementation(async (flag: string) => {
      return flag === "officer_bg_check_cpd_enhanced";
    });
    vi.mocked(parseOfficerName).mockImplementation(() => ({
      lastName: "rivera",
      firstName: "michael",
    }));
    // CPD officer probe returns 1 matching uid, complaints returns 12.
    scriptedCounts.set(rowsKey("cpd_officers"), 1);
    scriptedRows.set(rowsKey("cpd_officers"), [{ uid: 12345 }]);
    scriptedCounts.set(rowsKey("cpd_complaints"), 12);

    const result = await checkOfficerCoverage("Michael Rivera", "IL");

    expect(result.coverage.externalIntelState).toBe(25);
    expect(result.coverage.cpdComplaints).toBe(12);
    expect(result.coverage.cpdOfficers).toBe(1);
    // Banner-trip suppressed because CPD enrichment present
    const bannerWouldFire =
      (result.coverage.externalIntelState ?? 0) < 50 &&
      (result.coverage.cpdComplaints ?? 0) === 0 &&
      (result.coverage.nypdOfficers ?? 0) === 0;
    expect(bannerWouldFire).toBe(false);
  });

  it("thin external_intel + NYPD match: NY with feature flag suppresses banner", async () => {
    // 0 NY ext-intel rows (NY data flows via NYPD path).
    scriptedCounts.set(rowsKey("officer_external_intel", "NY"), 0);
    scriptedCounts.set(rowsKey("officer_reliability", "NY"), 0);
    scriptedCounts.set(rowsKey("officer_reliability"), 1);
    // NYPD signal classifies + flag on.
    vi.mocked(classifyNypdSignal).mockImplementation(() => ({
      route: "state-fallback",
    }));
    vi.mocked(isFeatureEnabled).mockImplementation(async (flag: string) => {
      return flag === "officer_bg_check_nypd_enhanced";
    });
    vi.mocked(parseNypdName).mockImplementation(() => ({
      lastName: "pantaleo",
      firstName: "daniel",
    }));
    // NYPD candidate fetch returns one match.
    vi.mocked(fetchNypdCandidates).mockImplementation(async () => ({
      candidates: [
        {
          tax_id: 901001,
          officer_first_name: "Daniel",
          officer_last_name: "Pantaleo",
          shield_no: "07333",
          current_rank: "Police Officer",
          current_command: "120 Pct",
          active_per_last_reported_status: "Inactive",
          total_complaints: 7,
          total_substantiated_complaints: 4,
        },
      ],
      truncated: false,
    }));
    vi.mocked(chooseNypdMatch).mockImplementation(() => ({
      status: "single",
      candidates: [],
      matchedTaxId: 901001,
    }));
    // Allegations count for the matched tax_id.
    scriptedCounts.set(rowsKey("nypd_allegations"), 7);

    const result = await checkOfficerCoverage("Daniel Pantaleo", "NY");

    expect(result.coverage.externalIntelState).toBe(0);
    expect(result.coverage.nypdOfficers).toBeGreaterThanOrEqual(1);
    expect(result.coverage.nypdAllegations).toBe(7);
    // Banner-trip suppressed because NYPD enrichment present
    const bannerWouldFire =
      (result.coverage.externalIntelState ?? 0) < 50 &&
      (result.coverage.cpdComplaints ?? 0) === 0 &&
      (result.coverage.nypdOfficers ?? 0) === 0;
    expect(bannerWouldFire).toBe(false);
  });

  it("zero coverage, no enrichment: HI without CPD/NYPD trips banner", async () => {
    scriptedCounts.set(rowsKey("officer_external_intel", "HI"), 0);
    scriptedCounts.set(rowsKey("officer_reliability", "HI"), 0);
    scriptedCounts.set(rowsKey("officer_reliability"), 0);

    const result = await checkOfficerCoverage("Nobody", "HI");

    expect(result.coverage.externalIntelState).toBe(0);
    expect(result.coverage.officers).toBe(0);
    expect(result.coverage.cpdComplaints ?? 0).toBe(0);
    expect(result.coverage.nypdOfficers ?? 0).toBe(0);
    // Banner-trip: <50 AND no CPD AND no NYPD
    const bannerWouldFire =
      (result.coverage.externalIntelState ?? 0) < 50 &&
      (result.coverage.cpdComplaints ?? 0) === 0 &&
      (result.coverage.nypdOfficers ?? 0) === 0;
    expect(bannerWouldFire).toBe(true);
    // available=false (nationwide fallback also empty) — separate "unavailable" flow
    expect(result.available).toBe(false);
  });
});

describe("checkOfficerCoverage — W1: state vs nationwide split", () => {
  it("exposes officersState and officersNationwide as distinct keys", async () => {
    // GA: 50 state rows + 200 nationwide rows. Banner copy must use
    // nationwide for the "records nationwide" label, not the state count.
    scriptedCounts.set(rowsKey("officer_external_intel", "GA"), 100);
    scriptedCounts.set(rowsKey("officer_reliability", "GA"), 50);
    scriptedCounts.set(rowsKey("officer_reliability"), 200);

    const result = await checkOfficerCoverage("Smith", "GA");

    expect(result.coverage.officersState).toBe(50);
    expect(result.coverage.officersNationwide).toBe(200);
    // Legacy `officers` key preserved as state-first with fallback.
    expect(result.coverage.officers).toBe(50);
  });

  it("falls back to nationwide when state count is zero", async () => {
    scriptedCounts.set(rowsKey("officer_external_intel", "HI"), 0);
    scriptedCounts.set(rowsKey("officer_reliability", "HI"), 0);
    scriptedCounts.set(rowsKey("officer_reliability"), 5);

    const result = await checkOfficerCoverage("Smith", "HI");

    expect(result.coverage.officersState).toBe(0);
    expect(result.coverage.officersNationwide).toBe(5);
    expect(result.coverage.officers).toBe(5); // fallback
  });
});

describe("checkOfficerCoverage — C2 ambiguous NYPD parity", () => {
  it("ambiguous NYPD match: banner suppresses on roster presence (any candidate count)", async () => {
    // 4 candidates, ambiguous status. Banner gate is nypdOfficers > 0,
    // not status === single. Caption (in render.ts) MUST mirror this:
    // any NYPD presence suppresses the thin-state caption.
    scriptedCounts.set(rowsKey("officer_external_intel", "NY"), 0);
    scriptedCounts.set(rowsKey("officer_reliability", "NY"), 0);
    scriptedCounts.set(rowsKey("officer_reliability"), 0);
    vi.mocked(classifyNypdSignal).mockImplementation(() => ({
      route: "state-fallback",
    }));
    vi.mocked(isFeatureEnabled).mockImplementation(async (flag: string) => {
      return flag === "officer_bg_check_nypd_enhanced";
    });
    vi.mocked(parseNypdName).mockImplementation(() => ({
      lastName: "smith",
      firstName: "",
    }));
    vi.mocked(fetchNypdCandidates).mockImplementation(async () => ({
      candidates: new Array(4).fill(null).map((_, i) => ({
        tax_id: 100 + i,
        officer_first_name: "John",
        officer_last_name: "Smith",
        shield_no: `0000${i}`,
        current_rank: "Police Officer",
        current_command: null,
        active_per_last_reported_status: "Active",
        total_complaints: 0,
        total_substantiated_complaints: 0,
      })),
      truncated: false,
    }));
    vi.mocked(chooseNypdMatch).mockImplementation(() => ({
      status: "ambiguous",
      candidates: [],
      matchedTaxId: null,
    }));

    const result = await checkOfficerCoverage("Smith", "NY");

    // Roster count exposed (banner reads this).
    expect(result.coverage.nypdOfficers).toBe(4);
    // Allegations stay 0 because matcher is ambiguous.
    expect(result.coverage.nypdAllegations).toBe(0);
    // Banner suppresses on roster presence alone.
    const bannerWouldFire =
      (result.coverage.externalIntelState ?? 0) < 50 &&
      (result.coverage.cpdComplaints ?? 0) === 0 &&
      (result.coverage.nypdOfficers ?? 0) === 0;
    expect(bannerWouldFire).toBe(false);
  });
});
