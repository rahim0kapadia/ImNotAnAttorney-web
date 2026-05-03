/**
 * Unit tests for drug-scheduling render layer (TICKET-16).
 *
 * Focus (UPL parity + injection safety):
 *   - UPL banned phrases never appear in rendered HTML for any input
 *   - Empty + unknown substance returns ""
 *   - Empty + known substance still renders current-schedule citation block
 *   - Every rendered entry has its source_url present in the HTML
 *   - HTML in title/abstract/canonicalName is escaped
 *   - Methodology footer present verbatim
 */

import { describe, it, expect } from "vitest";
import {
  renderDrugSchedulingHistory,
  scanForUplSchedulingPhrases,
  UPL_SCHEDULING_BANNED_PHRASES,
} from "../render";
import type { SchedulingHistory, SchedulingHistoryEntry } from "../history";
import { SUBSTANCE_TAXONOMY } from "../substances";

function mkEntry(over: Partial<SchedulingHistoryEntry> = {}): SchedulingHistoryEntry {
  return {
    publicationDate: "2026-05-04",
    effectiveDate: "2026-05-04",
    documentNumber: "2026-08595",
    title: "Specific Listing for Hexahydrocannabinol",
    abstractSnippet: "DEA establishes a specific listing for HHC.",
    action: "Final rule",
    cfrReferences: null,
    sourceUrl: "https://www.federalregister.gov/documents/2026/05/04/2026-08595/specific-listing-for-hexahydrocannabinol-a-currently-controlled-schedule-i-substance",
    agencies: ["justice-department", "drug-enforcement-administration"],
    ...over,
  };
}

function mkData(over: Partial<SchedulingHistory> = {}): SchedulingHistory {
  const sub = SUBSTANCE_TAXONOMY["hexahydrocannabinol"];
  return {
    substance: sub,
    requestedSlug: "hexahydrocannabinol",
    currentSchedule: sub.currentSchedule,
    currentScheduleAsOf: sub.currentScheduleAsOf,
    regulationUrl: sub.regulationUrl,
    regulationCitation: sub.regulationCitation,
    summary: sub.summary,
    history: [mkEntry()],
    isEmpty: false,
    limitations: [],
    ...over,
  };
}

describe("renderDrugSchedulingHistory", () => {
  it("returns empty string when isEmpty AND no taxonomy entry", () => {
    const html = renderDrugSchedulingHistory({
      substance: null,
      requestedSlug: "table-salt",
      currentSchedule: null,
      currentScheduleAsOf: null,
      regulationUrl: null,
      regulationCitation: null,
      summary: null,
      history: [],
      isEmpty: true,
      limitations: ["unknown"],
    });
    expect(html).toBe("");
  });

  it("renders current-schedule block + methodology when known substance has no FR history", () => {
    const html = renderDrugSchedulingHistory(
      mkData({ history: [], isEmpty: true, limitations: ["No FR rows"] }),
    );
    expect(html).toContain("Federal Scheduling History");
    expect(html).toContain("Current federal status");
    expect(html).toContain("How to use this section");
    expect(html).not.toContain("Federal Register actions referencing this substance");
  });

  it("renders entry with verification URL present in the HTML", () => {
    const html = renderDrugSchedulingHistory(mkData());
    expect(html).toContain("Federal Register actions referencing this substance");
    expect(html).toContain("federalregister.gov/documents/2026/05/04/2026-08595");
    expect(html).toContain("Final rule");
  });

  it("HTML in fields is escaped (XSS guard)", () => {
    const html = renderDrugSchedulingHistory(
      mkData({
        history: [
          mkEntry({
            title: '<script>alert("xss")</script>',
            abstractSnippet: 'evil "&" </p>',
          }),
        ],
      }),
    );
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  it("renders all current-schedule fields including 'As of' and citation", () => {
    const html = renderDrugSchedulingHistory(mkData());
    expect(html).toContain("As of");
    expect(html).toContain("21 CFR");
  });

  it("methodology footer reaffirms information-not-advice", () => {
    const html = renderDrugSchedulingHistory(mkData());
    expect(html).toContain("legal INFORMATION");
    expect(html).toContain("not legal ADVICE");
    expect(html).toContain("question for your attorney");
  });

  it("never renders banned UPL phrases for any taxonomy entry", () => {
    for (const slug of Object.keys(SUBSTANCE_TAXONOMY)) {
      const sub = SUBSTANCE_TAXONOMY[slug];
      const html = renderDrugSchedulingHistory({
        substance: sub,
        requestedSlug: slug,
        currentSchedule: sub.currentSchedule,
        currentScheduleAsOf: sub.currentScheduleAsOf,
        regulationUrl: sub.regulationUrl,
        regulationCitation: sub.regulationCitation,
        summary: sub.summary,
        history: [mkEntry()],
        isEmpty: false,
        limitations: [],
      });
      const hits = scanForUplSchedulingPhrases(html);
      expect(hits, `${slug} produced banned phrases: ${hits.join(", ")}`).toEqual([]);
    }
  });

  it("UPL_SCHEDULING_BANNED_PHRASES is non-empty and includes core 'you should'", () => {
    expect(UPL_SCHEDULING_BANNED_PHRASES.length).toBeGreaterThanOrEqual(8);
    expect(UPL_SCHEDULING_BANNED_PHRASES).toContain("you should");
  });

  it("emits a limitations aside when limitations[] non-empty", () => {
    const html = renderDrugSchedulingHistory(
      mkData({ limitations: ["sample limitation note"] }),
    );
    expect(html).toContain("Known limitations");
    expect(html).toContain("sample limitation note");
  });
});
