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
    const html = renderOfficerBackground(baseData);
    expect(html).toContain("Employment History");
  });

  it("renders agency names from NPI shape", () => {
    const html = renderOfficerBackground(baseData);
    expect(html).toContain("Oakland PD");
    expect(html).toContain("San Francisco PD");
  });

  it("renders start_date and end_date in Period column", () => {
    const html = renderOfficerBackground(baseData);
    expect(html).toContain("2019-03-01");
    expect(html).toContain("2023-06-15");
  });

  it("does not emit the legacy literal 'undefined' for dates (shape-mismatch regression)", () => {
    const html = renderOfficerBackground(baseData);
    expect(html).not.toContain("undefined");
  });

  it("renders employment_status from NPI shape, not the legacy separation_reason key", () => {
    const html = renderOfficerBackground(baseData);
    expect(html).toContain("terminated");
    expect(html).toContain("resigned");
  });

  it("renders rank column from NPI shape", () => {
    const html = renderOfficerBackground(baseData);
    expect(html).toContain("Sergeant");
    expect(html).toContain("Officer");
  });

  it("flags terminated status in red", () => {
    const html = renderOfficerBackground(baseData);
    // Termination row should carry #EF4444 (red)
    const terminationLine = html
      .split("\n")
      .find((l) => l.includes("terminated"));
    expect(terminationLine).toBeDefined();
    expect(terminationLine).toContain("#EF4444");
  });

  it("renders wandering officer warning when flag is true", () => {
    const html = renderOfficerBackground(baseData);
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
    const html = renderOfficerBackground(data);
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
    const html = renderOfficerBackground(data);
    expect(html).not.toContain("Employment History");
  });
});
