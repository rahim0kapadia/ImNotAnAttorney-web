/**
 * Integration tests for CAP × drug-scheduling wire-in (TICKET-16).
 *
 * Focus:
 *   - isDrugChargeType detects drug-possession / drug-trafficking + variants
 *   - non-drug chargeTypes do NOT detect
 *   - Scheduling block renders inside CAP HTML when drugSchedulingHistory present
 *   - No scheduling block when drugSchedulingHistory null/undefined
 *   - UPL parity preserved through composed render
 */

import { describe, it, expect } from "vitest";
import {
  renderChargeAuthorityPack,
  isDrugChargeType,
  type ChargeAuthorityPackData,
  type AuthorityPackRow,
} from "../charge-authority-pack";
import type { SchedulingHistory } from "@/lib/drug-scheduling/history";
import { SUBSTANCE_TAXONOMY } from "@/lib/drug-scheduling/substances";
import { scanForUplSchedulingPhrases } from "@/lib/drug-scheduling/render";

function mkData(over: Partial<ChargeAuthorityPackData> = {}): ChargeAuthorityPackData {
  return {
    chargeType: "drug-possession",
    state: "FL",
    circuit: "11",
    circuitName: "Eleventh Circuit",
    rows: [],
    limitations: [],
    isEmpty: false,
    drugSchedulingHistory: null,
    ...over,
  };
}

function mkRow(over: Partial<AuthorityPackRow> = {}): AuthorityPackRow {
  return {
    rank: 1,
    case_name: "United States v. Hernandez",
    date_filed: "2018-03-12",
    citation: "586 F.Supp.3d 100",
    authority_tier: "frequent",
    citation_count_in_charge: 12,
    citation_count_total: 200,
    quote_sentence: null,
    velocity: 0.4,
    velocity_tier: "stable",
    rising_flag: false,
    source_url: "https://www.courtlistener.com/opinion/example",
    data_scope: "charge_type",
    ...over,
  };
}

function mkSchedulingHistory(): SchedulingHistory {
  const sub = SUBSTANCE_TAXONOMY["fentanyl"];
  return {
    substance: sub,
    requestedSlug: "fentanyl",
    currentSchedule: sub.currentSchedule,
    currentScheduleAsOf: sub.currentScheduleAsOf,
    regulationUrl: sub.regulationUrl,
    regulationCitation: sub.regulationCitation,
    summary: sub.summary,
    history: [
      {
        publicationDate: "2018-02-06",
        effectiveDate: "2018-02-06",
        documentNumber: "2018-02319",
        title: "Schedules of Controlled Substances: Temporary Placement of Fentanyl-Related Substances in Schedule I",
        abstractSnippet: "DEA temporarily places fentanyl-related substances in Schedule I.",
        action: "Temporary scheduling",
        cfrReferences: null,
        sourceUrl: "https://www.federalregister.gov/documents/2018/02/06/2018-02319/example",
        agencies: ["justice-department", "drug-enforcement-administration"],
      },
    ],
    isEmpty: false,
    limitations: [],
  };
}

describe("isDrugChargeType", () => {
  it("recognizes core drug-charge slugs", () => {
    expect(isDrugChargeType("drug-possession")).toBe(true);
    expect(isDrugChargeType("drug-trafficking")).toBe(true);
    expect(isDrugChargeType("drug-distribution")).toBe(true);
    expect(isDrugChargeType("drug-possession-cocaine")).toBe(true);
    expect(isDrugChargeType("controlled-substance-felony")).toBe(true);
    expect(isDrugChargeType("marijuana-cultivation")).toBe(true);
    expect(isDrugChargeType("fentanyl-distribution")).toBe(true);
    expect(isDrugChargeType("trafficking-drug-firearms")).toBe(true);
  });

  it("does NOT match non-drug charge slugs", () => {
    expect(isDrugChargeType("dui")).toBe(false);
    expect(isDrugChargeType("dui-dwi")).toBe(false);
    expect(isDrugChargeType("self-defense")).toBe(false);
    expect(isDrugChargeType("white-collar")).toBe(false);
    expect(isDrugChargeType("sex-offense")).toBe(false);
    expect(isDrugChargeType("federal-criminal")).toBe(false);
    expect(isDrugChargeType("")).toBe(false);
  });
});

describe("Charge Authority Pack — drug-scheduling block render", () => {
  it("does NOT render scheduling block when drugSchedulingHistory is null", () => {
    const html = renderChargeAuthorityPack(
      mkData({ rows: [mkRow()], drugSchedulingHistory: null }),
    );
    expect(html).not.toContain("Federal Scheduling History");
  });

  it("does NOT render scheduling block when drugSchedulingHistory is undefined", () => {
    const data = mkData({ rows: [mkRow()] });
    delete data.drugSchedulingHistory;
    const html = renderChargeAuthorityPack(data);
    expect(html).not.toContain("Federal Scheduling History");
  });

  it("renders scheduling block inside CAP HTML when present", () => {
    const html = renderChargeAuthorityPack(
      mkData({
        rows: [mkRow()],
        drugSchedulingHistory: mkSchedulingHistory(),
      }),
    );
    expect(html).toContain("Charge Authority Pack");
    expect(html).toContain("Federal Scheduling History");
    expect(html).toContain("Fentanyl");
    expect(html).toContain("Schedule II");
    expect(html).toContain("federalregister.gov/documents/2018/02/06");
  });

  it("UPL parity preserved across composed render", () => {
    const html = renderChargeAuthorityPack(
      mkData({
        rows: [mkRow()],
        drugSchedulingHistory: mkSchedulingHistory(),
      }),
    );
    const hits = scanForUplSchedulingPhrases(html);
    expect(hits, `composed render produced banned phrases: ${hits.join(", ")}`).toEqual([]);
  });

  it("scheduling block renders even when CAP has zero authority rows", () => {
    const html = renderChargeAuthorityPack(
      mkData({
        rows: [],
        isEmpty: true,
        drugSchedulingHistory: mkSchedulingHistory(),
      }),
    );
    expect(html).toContain("Federal Scheduling History");
    expect(html).not.toContain("Top 10 Must-Cite Authorities");
  });
});
