/**
 * Unit tests for drug-scheduling history helper (TICKET-16).
 *
 * Focus (helper-shape, no live DB):
 *   - Unknown substance returns isEmpty=true with a curated limitation
 *   - Known substance with empty mock data returns substance + isEmpty=true
 *   - Known substance with mock rows returns ordered, source-URL-bearing entries
 *   - Rows lacking ANY source URL (html_url + pdf_url + document_number all null)
 *     are suppressed (no-hallucinated-legal-data.md)
 *   - Rows with empty publication_date are suppressed
 *   - Helper never throws on Supabase error, surfaces it via limitations[]
 *   - 50-row cap surfaces a limitation
 */

import { describe, it, expect } from "vitest";
import { getDrugSchedulingHistoryWithClient } from "../history";

interface MockRow {
  document_number?: string | null;
  title?: string | null;
  abstract?: string | null;
  agencies?: string[] | null;
  publication_date?: string | null;
  effective_date?: string | null;
  action?: string | null;
  cfr_references?: unknown;
  html_url?: string | null;
  pdf_url?: string | null;
}

function mkClient(opts: {
  rows?: MockRow[];
  error?: { message: string } | null;
  throwIt?: Error;
}) {
  return {
    from: (_t: string) => ({
      select: (_c: string) => ({
        or: (_q: string) => ({
          order: (_col: string, _o: { ascending: boolean; nullsFirst?: boolean }) => ({
            limit: async (_n: number) => {
              if (opts.throwIt) throw opts.throwIt;
              return {
                data: (opts.rows ?? []) as unknown[],
                error: opts.error ?? null,
              };
            },
          }),
        }),
      }),
    }),
  };
}

describe("getDrugSchedulingHistory", () => {
  it("unknown substance returns isEmpty=true + curated limitation", async () => {
    const client = mkClient({ rows: [] });
    const r = await getDrugSchedulingHistoryWithClient(client, "table-salt");
    expect(r.isEmpty).toBe(true);
    expect(r.substance).toBeNull();
    expect(r.history).toEqual([]);
    expect(r.limitations.length).toBeGreaterThanOrEqual(1);
    expect(r.limitations[0]).toMatch(/scheduling taxonomy/);
  });

  it("known substance with no Federal Register hits returns substance + isEmpty=true", async () => {
    const client = mkClient({ rows: [] });
    const r = await getDrugSchedulingHistoryWithClient(client, "fentanyl");
    expect(r.substance).not.toBeNull();
    expect(r.substance?.slug).toBe("fentanyl");
    expect(r.currentSchedule).toBe("II");
    expect(r.history).toEqual([]);
    expect(r.isEmpty).toBe(true);
    expect(r.limitations.some((l) => l.includes("No Federal Register"))).toBe(true);
  });

  it("known substance with mock rows returns ordered entries", async () => {
    const client = mkClient({
      rows: [
        {
          document_number: "2026-08595",
          title: "Specific Listing for Hexahydrocannabinol",
          abstract: "DEA establishes specific listing.",
          agencies: ["justice-department", "drug-enforcement-administration"],
          publication_date: "2026-05-04",
          effective_date: "2026-05-04",
          action: "Final rule",
          cfr_references: null,
          html_url: "https://www.federalregister.gov/documents/2026/05/04/2026-08595/specific-listing-for-hexahydrocannabinol-a-currently-controlled-schedule-i-substance",
          pdf_url: null,
        },
      ],
    });
    const r = await getDrugSchedulingHistoryWithClient(client, "hexahydrocannabinol");
    expect(r.substance?.slug).toBe("hexahydrocannabinol");
    expect(r.history).toHaveLength(1);
    expect(r.history[0].sourceUrl).toMatch(/^https:\/\/www\.federalregister\.gov/);
    expect(r.history[0].title).toMatch(/Hexahydrocannabinol/);
    expect(r.history[0].publicationDate).toBe("2026-05-04");
    expect(r.isEmpty).toBe(false);
  });

  it("rows lacking ALL source URLs are suppressed (no fabrication)", async () => {
    const client = mkClient({
      rows: [
        {
          document_number: "",
          title: "Some action",
          abstract: "abc",
          agencies: [],
          publication_date: "2026-04-01",
          effective_date: null,
          action: null,
          cfr_references: null,
          html_url: null,
          pdf_url: null,
        },
        {
          document_number: "2026-08595",
          title: "Has html_url",
          abstract: "ok",
          agencies: [],
          publication_date: "2026-05-04",
          effective_date: null,
          action: null,
          cfr_references: null,
          html_url: "https://www.federalregister.gov/documents/2026/05/04/2026-08595/x",
          pdf_url: null,
        },
      ],
    });
    const r = await getDrugSchedulingHistoryWithClient(client, "fentanyl");
    expect(r.history).toHaveLength(1); // first row suppressed (no source url)
    expect(r.history[0].documentNumber).toBe("2026-08595");
  });

  it("rows lacking publication_date or title are suppressed", async () => {
    const client = mkClient({
      rows: [
        {
          document_number: "2026-1",
          title: null,
          abstract: null,
          agencies: [],
          publication_date: "2026-04-01",
          effective_date: null,
          action: null,
          cfr_references: null,
          html_url: "https://www.federalregister.gov/documents/2026/04/01/2026-1/x",
          pdf_url: null,
        },
        {
          document_number: "2026-2",
          title: "valid",
          abstract: null,
          agencies: [],
          publication_date: null,
          effective_date: null,
          action: null,
          cfr_references: null,
          html_url: "https://www.federalregister.gov/documents/2026/04/01/2026-2/x",
          pdf_url: null,
        },
        {
          document_number: "2026-3",
          title: "valid",
          abstract: null,
          agencies: [],
          publication_date: "2026-04-01",
          effective_date: null,
          action: null,
          cfr_references: null,
          html_url: "https://www.federalregister.gov/documents/2026/04/01/2026-3/x",
          pdf_url: null,
        },
      ],
    });
    const r = await getDrugSchedulingHistoryWithClient(client, "fentanyl");
    expect(r.history).toHaveLength(1);
    expect(r.history[0].documentNumber).toBe("2026-3");
  });

  it("falls back to pdf_url when html_url missing", async () => {
    const client = mkClient({
      rows: [
        {
          document_number: "2026-x",
          title: "PDF-only",
          abstract: "ok",
          agencies: [],
          publication_date: "2026-04-01",
          effective_date: null,
          action: null,
          cfr_references: null,
          html_url: null,
          pdf_url: "https://www.federalregister.gov/documents/2026/04/01/2026-x/x.pdf",
        },
      ],
    });
    const r = await getDrugSchedulingHistoryWithClient(client, "fentanyl");
    expect(r.history).toHaveLength(1);
    expect(r.history[0].sourceUrl).toMatch(/\.pdf$/);
  });

  it("Supabase error surfaces in limitations[] but does not throw", async () => {
    const client = mkClient({
      rows: [],
      error: { message: "permission denied for table federal_register_actions" },
    });
    const r = await getDrugSchedulingHistoryWithClient(client, "fentanyl");
    expect(r.history).toEqual([]);
    expect(r.limitations.some((l) => l.includes("permission denied"))).toBe(true);
  });

  it("Supabase throw surfaces in limitations[] but does not throw", async () => {
    const client = mkClient({ throwIt: new Error("network down") });
    const r = await getDrugSchedulingHistoryWithClient(client, "fentanyl");
    expect(r.history).toEqual([]);
    expect(r.limitations.some((l) => l.includes("network down"))).toBe(true);
  });

  it("50-row cap surfaces a limitation about pagination", async () => {
    const rows: MockRow[] = [];
    for (let i = 0; i < 50; i++) {
      rows.push({
        document_number: `2026-${i}`,
        title: `Action ${i}`,
        abstract: "ok",
        agencies: [],
        publication_date: `2026-04-${String((i % 28) + 1).padStart(2, "0")}`,
        effective_date: null,
        action: null,
        cfr_references: null,
        html_url: `https://www.federalregister.gov/documents/2026/04/01/2026-${i}/x`,
        pdf_url: null,
      });
    }
    const client = mkClient({ rows });
    const r = await getDrugSchedulingHistoryWithClient(client, "fentanyl");
    expect(r.history).toHaveLength(50);
    expect(r.limitations.some((l) => l.includes("Result limit"))).toBe(true);
  });
});
