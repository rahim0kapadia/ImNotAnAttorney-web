/**
 * Unit tests for renderOfficerBackground — lock in the NPI employment
 * history shape contract against render bugs.
 *
 * NPI ingest (scripts/ingest-npi.mjs:282-290) writes keys:
 *   { agency, rank, start_date, end_date, employment_status }
 *
 * Prior render used {start, end, separation_reason} which produced
 * "?, present" + blank separation cells for every CA/AZ customer.
 * This test fails if anyone reintroduces that shape.
 */
import { describe, it, expect } from "vitest";
import { renderOfficerBackground } from "@/lib/tier9-reports/render";
import type { OfficerBackgroundData } from "@/lib/tier9-reports/query";

const baseData: OfficerBackgroundData = {
  officers: [],
  externalIntel: [
    {
      officer_name: "Test Officer",
      officer_name_normalized: "test officer",
      state: "CA",
      agency: "Test PD",
      brady_status: null,
      brady_reason: null,
      npi_employment_history: [
        {
          agency: "Oakland PD",
          rank: "Sergeant",
          start_date: "2019-03-01",
          end_date: "2023-06-15",
          employment_status: "terminated",
        },
        {
          agency: "San Francisco PD",
          rank: "Officer",
          start_date: "2015-01-01",
          end_date: "2019-02-28",
          employment_status: "resigned",
        },
      ],
      npi_is_wandering_officer: true,
      decertified: false,
      decertification_reason: null,
      complaint_count: 0,
      use_of_force_count: 0,
      sustained_complaints: 0,
      credibility_risk_score: null,
      source_urls: ["https://example.org/npi"],
      sources: ["NPI"],
    },
  ],
  agencyIncidents: [],
  isEmpty: false,
};

describe("renderOfficerBackground — NPI employment history", () => {
  it("renders Employment History section when npi_employment_history is populated", () => {
    const html = renderOfficerBackground(baseData, { state: "CA" });
    expect(html).toContain("Employment History");
  });

  it("renders agency names from NPI shape", () => {
    const html = renderOfficerBackground(baseData, { state: "CA" });
    expect(html).toContain("Oakland PD");
    expect(html).toContain("San Francisco PD");
  });

  it("renders start_date and end_date in Period column", () => {
    const html = renderOfficerBackground(baseData, { state: "CA" });
    expect(html).toContain("2019-03-01");
    expect(html).toContain("2023-06-15");
  });

  it("does not emit the legacy literal 'undefined' for dates (shape-mismatch regression)", () => {
    const html = renderOfficerBackground(baseData, { state: "CA" });
    expect(html).not.toContain("undefined");
  });

  it("renders employment_status from NPI shape, not the legacy separation_reason key", () => {
    const html = renderOfficerBackground(baseData, { state: "CA" });
    expect(html).toContain("terminated");
    expect(html).toContain("resigned");
  });

  it("renders rank column from NPI shape", () => {
    const html = renderOfficerBackground(baseData, { state: "CA" });
    expect(html).toContain("Sergeant");
    expect(html).toContain("Officer");
  });

  it("flags terminated status in red", () => {
    const html = renderOfficerBackground(baseData, { state: "CA" });
    // Termination row should carry #EF4444 (red)
    const terminationLine = html
      .split("\n")
      .find((l) => l.includes("terminated"));
    expect(terminationLine).toBeDefined();
    expect(terminationLine).toContain("#EF4444");
  });

  it("renders wandering officer warning when flag is true", () => {
    const html = renderOfficerBackground(baseData, { state: "CA" });
    expect(html).toContain("wandering officer");
  });

  it("handles missing dates with fallback placeholders", () => {
    const data: OfficerBackgroundData = {
      ...baseData,
      externalIntel: [
        {
          ...baseData.externalIntel[0],
          npi_employment_history: [
            {
              agency: "Mystery PD",
              rank: null,
              start_date: null,
              end_date: null,
              employment_status: null,
            },
          ],
        },
      ],
    };
    const html = renderOfficerBackground(data, { state: "CA" });
    expect(html).toContain("Mystery PD");
    expect(html).toContain("?");
    expect(html).toContain("present");
    expect(html).not.toContain("undefined");
  });

  it("skips Employment History section when npi_employment_history is null", () => {
    const data: OfficerBackgroundData = {
      ...baseData,
      externalIntel: [
        {
          ...baseData.externalIntel[0],
          npi_employment_history: null,
          npi_is_wandering_officer: false,
        },
      ],
    };
    const html = renderOfficerBackground(data, { state: "CA" });
    expect(html).not.toContain("Employment History");
  });
});

describe("renderOfficerBackground — data-source header truth-in-headers", () => {
  it("does not claim Brady/Giglio when no row has brady_status", () => {
    const html = renderOfficerBackground(baseData, { state: "CA" });
    expect(html).toContain("National Police Index");
    expect(html).not.toContain("Brady/Giglio");
    expect(html).not.toContain("state POST");
  });

  it("does not claim state POST when no row has decertified=true", () => {
    const html = renderOfficerBackground(baseData, { state: "CA" });
    expect(html).not.toContain("state POST");
  });

  it("includes Brady/Giglio when at least one row has brady_status set", () => {
    const data: OfficerBackgroundData = {
      ...baseData,
      externalIntel: [
        {
          ...baseData.externalIntel[0],
          brady_status: "listed",
          brady_reason: "Sustained dishonesty finding (test fixture)",
        },
      ],
    };
    const html = renderOfficerBackground(data, { state: "CA" });
    expect(html).toContain("Brady/Giglio");
    // Header: "Data from Brady/Giglio Lists and National Police Index."
    expect(html).toMatch(/Data from .*Brady\/Giglio.*National Police Index/);
  });

  it("includes state POST when at least one row has decertified=true", () => {
    const data: OfficerBackgroundData = {
      ...baseData,
      externalIntel: [
        {
          ...baseData.externalIntel[0],
          decertified: true,
          decertification_reason: "Test fixture",
        },
      ],
    };
    const html = renderOfficerBackground(data, { state: "CA" });
    expect(html).toContain("state POST");
  });

  it("falls back to generic source line when externalIntel has no recognized source signals", () => {
    const data: OfficerBackgroundData = {
      ...baseData,
      externalIntel: [
        {
          ...baseData.externalIntel[0],
          brady_status: null,
          npi_employment_history: null,
          decertified: false,
        },
      ],
    };
    const html = renderOfficerBackground(data, { state: "CA" });
    // No specific source claimed → generic fallback
    expect(html).not.toContain("Brady/Giglio");
    expect(html).not.toContain("National Police Index");
    expect(html).not.toContain("state POST");
    expect(html).toContain("public officer-data sources");
  });

  it("never emits the legacy hard-coded triple-source string", () => {
    const data: OfficerBackgroundData = {
      ...baseData,
      externalIntel: [
        {
          ...baseData.externalIntel[0],
          brady_status: "listed",
          decertified: true,
        },
      ],
    };
    const html = renderOfficerBackground(data, { state: "CA" });
    expect(html).not.toContain(
      "Data from Brady/Giglio List, National Police Index, and state POST databases",
    );
  });

  it("does NOT claim Brady/Giglio when brady_status is set but not 'listed' (cleared / in-progress)", () => {
    const data: OfficerBackgroundData = {
      ...baseData,
      externalIntel: [
        {
          ...baseData.externalIntel[0],
          brady_status: "cleared",
          brady_reason: "Background check cleared, not on any list",
        },
      ],
    };
    const html = renderOfficerBackground(data, { state: "CA" });
    expect(html).not.toContain("Brady/Giglio");
  });

  it("emits Oxford-comma 3-source list when all three sources are populated", () => {
    const data: OfficerBackgroundData = {
      ...baseData,
      externalIntel: [
        {
          ...baseData.externalIntel[0],
          brady_status: "listed",
          decertified: true,
          // npi_employment_history already populated in baseData fixture
        },
      ],
    };
    const html = renderOfficerBackground(data, { state: "CA" });
    // Oxford comma: "A, B, and C"
    expect(html).toContain(
      "Data from Brady/Giglio Lists, National Police Index, and state POST databases.",
    );
  });
});

describe("renderOfficerBackground — NYPD CCRB section", () => {
  const emptyShell: OfficerBackgroundData = {
    officers: [],
    externalIntel: [],
    agencyIncidents: [],
    isEmpty: false,
  };

  it("renders nothing when nypd is null", () => {
    const html = renderOfficerBackground(emptyShell, { state: "CA" });
    expect(html).not.toContain("NYPD Civilian Complaint History");
  });

  it("renders 'no record' variant when nypd.status='none'", () => {
    const data: OfficerBackgroundData = {
      ...emptyShell,
      nypd: { status: "none" },
    };
    const html = renderOfficerBackground(data, { state: "CA" });
    expect(html).toContain("NYPD Civilian Complaint History");
    expect(html).toContain("No NYPD officer matched this name");
    expect(html).toContain("data.cityofnewyork.us/d/2fir-qns4");
  });

  it("renders ambiguous variant with candidate count + shield instruction", () => {
    const data: OfficerBackgroundData = {
      ...emptyShell,
      nypd: { status: "ambiguous", candidateCount: 4 },
    };
    const html = renderOfficerBackground(data, { state: "CA" });
    expect(html).toContain("Multiple officers match this name (4)");
    expect(html).toContain("shield number");
  });

  it("renders single-match variant with totals + FADO breakdown + allegation table", () => {
    const data: OfficerBackgroundData = {
      ...emptyShell,
      nypd: {
        status: "single",
        officer: {
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
        allegations: [
          {
            allegation_record_identity: 1,
            complaint_id: 200001,
            fado_type: "Force",
            allegation: "Chokehold",
            ccrb_allegation_disposition: "Substantiated (Charges)",
            nypd_allegation_disposition: "Guilty",
            officer_rank_at_incident: "Police Officer",
            officer_command_at_incident: "120 Pct",
            officer_days_on_force_at_incident: 3500,
          },
          {
            allegation_record_identity: 2,
            complaint_id: 200002,
            fado_type: "Abuse of Authority",
            allegation: "Stop",
            ccrb_allegation_disposition: "Unsubstantiated",
            nypd_allegation_disposition: null,
            officer_rank_at_incident: "Police Officer",
            officer_command_at_incident: "120 Pct",
            officer_days_on_force_at_incident: 3000,
          },
        ],
        complaints: [
          {
            complaint_id: 200001,
            incident_date: "2014-07-17",
            ccrb_received_date: "2014-07-18",
            close_date: "2015-01-01",
            borough_of_incident_occurrence: "Staten Island",
            precinct_of_incident_occurrence: "120",
            ccrb_complaint_disposition: "Substantiated",
            bwc_evidence: "No",
            reason_for_police_contact: "Other",
            outcome_of_police_encounter: "Arrest",
          },
          {
            complaint_id: 200002,
            incident_date: "2013-05-10",
            ccrb_received_date: "2013-05-12",
            close_date: "2013-12-01",
            borough_of_incident_occurrence: "Staten Island",
            precinct_of_incident_occurrence: "120",
            ccrb_complaint_disposition: "Unsubstantiated",
            bwc_evidence: "No",
            reason_for_police_contact: null,
            outcome_of_police_encounter: null,
          },
        ],
        penalties: [
          {
            complaint_id: 200001,
            ccrb_substantiated_officer_disposition: "Charges",
            board_discipline_recommendation: "Termination",
            nypd_officer_penalty: "Termination",
            apu_case_status: "Closed",
          },
        ],
        totals: {
          totalComplaints: 2,
          totalAllegations: 2,
          substantiatedAllegations: 1,
          penaltyCount: 1,
          byFado: [
            { fado_type: "Force", total: 1, substantiated: 1 },
            { fado_type: "Abuse of Authority", total: 1, substantiated: 0 },
          ],
          earliest: "2013-05-10",
          latest: "2014-07-17",
        },
      },
    };
    const html = renderOfficerBackground(data, { state: "CA" });
    expect(html).toContain("NYPD Civilian Complaint History");
    expect(html).toContain("Daniel Pantaleo");
    expect(html).toContain("Shield #07333");
    // FADO breakdown table
    expect(html).toContain("Allegations by FADO type");
    expect(html).toContain("Force");
    expect(html).toContain("Abuse of Authority");
    // Allegation detail table — substantiated row colored red, penalty visible
    expect(html).toContain("Chokehold");
    expect(html).toContain("Termination");
    // Source citations
    expect(html).toContain("data.cityofnewyork.us/d/2fir-qns4");
    expect(html).toContain("data.cityofnewyork.us/d/6xgr-kwjq");
    // No legacy literal "undefined"
    expect(html).not.toContain("undefined");
  });

  it("uses NYPD officer name as primary report title when no other officer source has a row", () => {
    const data: OfficerBackgroundData = {
      ...emptyShell,
      nypd: {
        status: "single",
        officer: {
          tax_id: 1,
          officer_first_name: "Test",
          officer_last_name: "NYPD",
          shield_no: "11111",
          current_rank: null,
          current_command: null,
          active_per_last_reported_status: null,
          total_complaints: 0,
          total_substantiated_complaints: 0,
        },
        allegations: [],
        complaints: [],
        penalties: [],
        totals: {
          totalComplaints: 0,
          totalAllegations: 0,
          substantiatedAllegations: 0,
          penaltyCount: 0,
          byFado: [],
          earliest: null,
          latest: null,
        },
      },
    };
    const html = renderOfficerBackground(data, { state: "CA" });
    expect(html).toContain("Officer Background Check, Test NYPD");
  });

  it("TRUTH-IN-HEADERS: zero-allegation single match cites only officer-roster source, NOT allegations source", () => {
    // Mirrors the P0 summarizeIntelSources contract: never claim a source we
    // have zero rows for. An officer matched on the roster with no CCRB
    // complaints filed should not cite the allegations dataset URL.
    const data: OfficerBackgroundData = {
      ...emptyShell,
      nypd: {
        status: "single",
        officer: {
          tax_id: 99,
          officer_first_name: "Clean",
          officer_last_name: "Officer",
          shield_no: "00099",
          current_rank: "Detective",
          current_command: "1 Pct",
          active_per_last_reported_status: "Active",
          total_complaints: 0,
          total_substantiated_complaints: 0,
        },
        allegations: [],
        complaints: [],
        penalties: [],
        totals: {
          totalComplaints: 0,
          totalAllegations: 0,
          substantiatedAllegations: 0,
          penaltyCount: 0,
          byFado: [],
          earliest: null,
          latest: null,
        },
      },
    };
    const html = renderOfficerBackground(data, { state: "CA" });
    // Officer roster source MUST be cited (we did match an officer).
    expect(html).toContain("data.cityofnewyork.us/d/2fir-qns4");
    // Allegations source MUST NOT be cited (we have no allegations).
    expect(html).not.toContain("data.cityofnewyork.us/d/6xgr-kwjq");
    // Footer text should explain the empty state.
    expect(html).toContain("no civilian complaints on file");
    // No "Allegation detail" header when allegations are empty.
    expect(html).not.toContain("Allegation detail");
  });

  it("renders state-fallback caveat ONLY when stateFallback=true", () => {
    const baseSingle: OfficerBackgroundData["nypd"] = {
      status: "single",
      officer: {
        tax_id: 1,
        officer_first_name: "Daniel",
        officer_last_name: "Pantaleo",
        shield_no: "07333",
        current_rank: "Police Officer",
        current_command: "120 Pct",
        active_per_last_reported_status: "Inactive",
        total_complaints: 1,
        total_substantiated_complaints: 1,
      },
      allegations: [
        {
          allegation_record_identity: 1,
          complaint_id: 1,
          fado_type: "Force",
          allegation: "X",
          ccrb_allegation_disposition: "Substantiated (Charges)",
          nypd_allegation_disposition: null,
          officer_rank_at_incident: null,
          officer_command_at_incident: null,
          officer_days_on_force_at_incident: null,
        },
      ],
      complaints: [],
      penalties: [],
      totals: {
        totalComplaints: 1,
        totalAllegations: 1,
        substantiatedAllegations: 1,
        penaltyCount: 0,
        byFado: [{ fado_type: "Force", total: 1, substantiated: 1 }],
        earliest: null,
        latest: null,
      },
    };
    const withFallback = renderOfficerBackground({
      ...emptyShell,
      nypd: { ...baseSingle, stateFallback: true },
    }, { state: "NY" });
    expect(withFallback).toContain("non-NYPD New York agency");
    expect(withFallback).toContain("Buffalo");
    const withoutFallback = renderOfficerBackground({
      ...emptyShell,
      nypd: { ...baseSingle, stateFallback: false },
    }, { state: "NY" });
    expect(withoutFallback).not.toContain("non-NYPD New York agency");
  });

  it("renders truncated candidate count as N+ when ambiguous-with-truncation", () => {
    const html = renderOfficerBackground({
      ...emptyShell,
      nypd: { status: "ambiguous", candidateCount: 20, truncated: true },
    }, { state: "CA" });
    expect(html).toContain("Multiple officers match this name (20+)");
  });
});
