/**
 * Unit tests for queryArrestSurvivalKit error-path handling.
 *
 * Covers the three agency_incidents status cases:
 *   - table missing (PGRST200) → data_unavailable
 *   - table exists, no rows   → no_incidents
 *   - table exists, rows      → ok + incidents populated
 *
 * Uses a minimal mock supabase client to avoid real DB connections.
 * test-isolation-na: read-only mock, no Supabase writes
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Minimal mock builder ──────────────────────────────────────────────────────

type MockQueryResult = {
  data: unknown[] | null;
  error: { code: string; message: string } | null;
};

function buildMockSupabase(
  agencyResult: MockQueryResult,
  officerResult: MockQueryResult
) {
  // Each .from() call returns a chainable builder that resolves to a result.
  // We track which table is being queried so we can return the right fixture.
  const makeChain = (result: MockQueryResult) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => Promise.resolve(result),
    };
    return chain;
  };

  return {
    from: (table: string) => {
      if (table === "agency_incidents") return makeChain(agencyResult);
      if (table === "officer_external_intel") return makeChain(officerResult);
      return makeChain({ data: [], error: null });
    },
  };
}

// ── Module mock ───────────────────────────────────────────────────────────────

// We need to intercept createAdminClient so the function under test uses our
// mock rather than a real Supabase connection.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { queryArrestSurvivalKit } from "../query";

const mockCreateAdminClient = createAdminClient as ReturnType<typeof vi.fn>;

const emptyOfficerResult: MockQueryResult = { data: [], error: null };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("queryArrestSurvivalKit — agencyIncidentsStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns data_unavailable when agency_incidents table is missing (PGRST200)", async () => {
    const agencyResult: MockQueryResult = {
      data: null,
      error: { code: "PGRST200", message: "Could not find the table agency_incidents" },
    };
    mockCreateAdminClient.mockReturnValue(
      buildMockSupabase(agencyResult, emptyOfficerResult)
    );

    const result = await queryArrestSurvivalKit("FL");

    expect(result.agencyIncidentsStatus).toBe("data_unavailable");
    expect(result.agencyIncidents).toEqual([]);
    // Report should still be delivered (rights checklist is universal)
    expect(result.isEmpty).toBe(false);
    expect(result.stateCode).toBe("FL");
  });

  it("returns data_unavailable for any unexpected query error", async () => {
    const agencyResult: MockQueryResult = {
      data: null,
      error: { code: "500", message: "Internal server error" },
    };
    mockCreateAdminClient.mockReturnValue(
      buildMockSupabase(agencyResult, emptyOfficerResult)
    );

    const result = await queryArrestSurvivalKit("TX");

    expect(result.agencyIncidentsStatus).toBe("data_unavailable");
    expect(result.agencyIncidents).toEqual([]);
  });

  it("returns no_incidents when table exists but no rows for this state", async () => {
    const agencyResult: MockQueryResult = { data: [], error: null };
    mockCreateAdminClient.mockReturnValue(
      buildMockSupabase(agencyResult, emptyOfficerResult)
    );

    const result = await queryArrestSurvivalKit("WY");

    expect(result.agencyIncidentsStatus).toBe("no_incidents");
    expect(result.agencyIncidents).toEqual([]);
    expect(result.isEmpty).toBe(false);
  });

  it("returns ok with incidents when rows are present", async () => {
    const agencyResult: MockQueryResult = {
      data: [
        { agency: "Miami-Dade PD", use_of_force_count: 12, source_urls: ["https://fatalencounters.org/1"] },
        { agency: "FDLE", use_of_force_count: 3, source_urls: [] },
      ],
      error: null,
    };
    mockCreateAdminClient.mockReturnValue(
      buildMockSupabase(agencyResult, emptyOfficerResult)
    );

    const result = await queryArrestSurvivalKit("FL");

    expect(result.agencyIncidentsStatus).toBe("ok");
    expect(result.agencyIncidents).toHaveLength(2);
    expect(result.agencyIncidents[0].agency).toBe("Miami-Dade PD");
    expect(result.agencyIncidents[0].use_of_force_count).toBe(12);
  });

  it("falls back to uppercased stateCode when not in STATE_NAMES map", async () => {
    // D9 from docs/handoff/2026-04-26-product-audit-deferred.md — covers the
    // STATE_NAMES[stateCode.toUpperCase()] ?? stateCode fallback path. An
    // unknown two-letter code (e.g. typo "XX") should not crash the report;
    // stateName mirrors the input (uppercased) and the report still renders.
    const agencyResult: MockQueryResult = { data: [], error: null };
    mockCreateAdminClient.mockReturnValue(
      buildMockSupabase(agencyResult, emptyOfficerResult)
    );

    const result = await queryArrestSurvivalKit("XX");

    expect(result.stateCode).toBe("XX");
    expect(result.stateName).toBe("XX");
    // Falls through to the table-exists/no-rows branch — not data_unavailable.
    expect(result.agencyIncidentsStatus).toBe("no_incidents");
    expect(result.isEmpty).toBe(false);
  });

  it("populates officerStats from officer_external_intel regardless of agencyIncidents status", async () => {
    const agencyResult: MockQueryResult = {
      data: null,
      error: { code: "PGRST200", message: "Could not find the table" },
    };
    const officerResult: MockQueryResult = {
      data: [
        { agency: "Miami-Dade PD", npi_is_wandering_officer: false },
        { agency: "Miami-Dade PD", npi_is_wandering_officer: true },
        { agency: "FDLE", npi_is_wandering_officer: false },
      ],
      error: null,
    };
    mockCreateAdminClient.mockReturnValue(
      buildMockSupabase(agencyResult, officerResult)
    );

    const result = await queryArrestSurvivalKit("FL");

    expect(result.agencyIncidentsStatus).toBe("data_unavailable");
    expect(result.officerStats.totalOfficers).toBe(3);
    expect(result.officerStats.totalAgencies).toBe(2);
    expect(result.officerStats.wanderingOfficerCount).toBe(1);
  });
});

// ── officerStatsStatus tests (PR #164 sibling pattern, D6) ────────────────────

describe("queryArrestSurvivalKit — officerStatsStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const emptyAgencyResult: MockQueryResult = { data: [], error: null };

  it("returns data_unavailable when officer_external_intel table is missing (PGRST200)", async () => {
    const officerResult: MockQueryResult = {
      data: null,
      error: { code: "PGRST200", message: "Could not find the table officer_external_intel" },
    };
    mockCreateAdminClient.mockReturnValue(
      buildMockSupabase(emptyAgencyResult, officerResult)
    );

    const result = await queryArrestSurvivalKit("FL");

    expect(result.officerStats.status).toBe("data_unavailable");
    expect(result.officerStats.totalOfficers).toBe(0);
    expect(result.officerStats.totalAgencies).toBe(0);
    expect(result.officerStats.wanderingOfficerCount).toBe(0);
    // Report should still be delivered (rights checklist is universal)
    expect(result.isEmpty).toBe(false);
  });

  it("returns data_unavailable for any unexpected officer query error", async () => {
    const officerResult: MockQueryResult = {
      data: null,
      error: { code: "PGRST500", message: "Internal server error" },
    };
    mockCreateAdminClient.mockReturnValue(
      buildMockSupabase(emptyAgencyResult, officerResult)
    );

    const result = await queryArrestSurvivalKit("TX");

    expect(result.officerStats.status).toBe("data_unavailable");
    expect(result.officerStats.totalOfficers).toBe(0);
  });

  it("returns no_officers when officer table exists but no rows for this state", async () => {
    const officerResult: MockQueryResult = { data: [], error: null };
    mockCreateAdminClient.mockReturnValue(
      buildMockSupabase(emptyAgencyResult, officerResult)
    );

    const result = await queryArrestSurvivalKit("WY");

    expect(result.officerStats.status).toBe("no_officers");
    expect(result.officerStats.totalOfficers).toBe(0);
    expect(result.officerStats.totalAgencies).toBe(0);
  });

  it("returns ok with populated officerStats when rows are present", async () => {
    const officerResult: MockQueryResult = {
      data: [
        { agency: "LAPD", npi_is_wandering_officer: false },
        { agency: "LAPD", npi_is_wandering_officer: true },
        { agency: "Long Beach PD", npi_is_wandering_officer: false },
      ],
      error: null,
    };
    mockCreateAdminClient.mockReturnValue(
      buildMockSupabase(emptyAgencyResult, officerResult)
    );

    const result = await queryArrestSurvivalKit("CA");

    expect(result.officerStats.status).toBe("ok");
    expect(result.officerStats.totalOfficers).toBe(3);
    expect(result.officerStats.totalAgencies).toBe(2);
    expect(result.officerStats.wanderingOfficerCount).toBe(1);
  });

  it("agency error does not affect officer status (independence)", async () => {
    const agencyResult: MockQueryResult = {
      data: null,
      error: { code: "PGRST200", message: "Could not find the table agency_incidents" },
    };
    const officerResult: MockQueryResult = {
      data: [
        { agency: "NYPD", npi_is_wandering_officer: false },
      ],
      error: null,
    };
    mockCreateAdminClient.mockReturnValue(
      buildMockSupabase(agencyResult, officerResult)
    );

    const result = await queryArrestSurvivalKit("NY");

    // Agency table missing
    expect(result.agencyIncidentsStatus).toBe("data_unavailable");
    // Officer table fine — both statuses are independent
    expect(result.officerStats.status).toBe("ok");
    expect(result.officerStats.totalOfficers).toBe(1);
  });
});
