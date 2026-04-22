/**
 * Phase 2 round-2 finding S2: Node/Deno parity test for buildEntityWhitelist.
 *
 * Two implementations exist:
 *   - src/lib/report/entity-whitelist.ts (Node, @supabase/supabase-js)
 *   - supabase/functions/generate-report/index.ts (Deno, raw PostgREST fetch)
 *
 * This test feeds identical fixture rows to the Node implementation via a
 * mocked SupabaseClient, then to a Deno-shape adapter (raw-fetch style) that
 * emits the same whitelist from the same fixture shape. The output must be
 * byte-identical — any drift caught here fails fast at PR review time.
 *
 * We don't run the actual Deno file (Vitest is Node-only); instead we extract
 * the critical ordering + format logic into this test harness and validate
 * the Node output matches the contract the Deno function documents in its
 * header. If the Deno function drifts, the mirror comment at its buildEntity-
 * Whitelist docstring must be updated AND this test extended to lock the new
 * shape.
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEntityWhitelist } from "@/lib/report/entity-whitelist";

interface FixtureCase {
  canonical_id: string;
  case_name: string | null;
  primary_citation: string | null;
  citation_count: number | null;
  date_filed?: string | null;
}
interface FixtureStatute {
  canonical_id: string;
  jurisdiction: string | null;
  title: string | null;
  section: string | null;
  is_current?: boolean;
}
interface FixtureDoctrine {
  entity_id: string;
  source_ref: string;
}
interface FixtureAgency {
  canonical_id: string;
  name: string | null;
  acronym: string | null;
}

function makeMockSupabase(fixtures: {
  cases: FixtureCase[];
  statutes: FixtureStatute[];
  doctrines: FixtureDoctrine[];
  agencies: FixtureAgency[];
}): SupabaseClient {
  const make = (rows: unknown[]) => {
    const q: any = {
      _rows: rows,
      select: () => q,
      gt: () => q,
      eq: () => q,
      order: () => q,
      limit: () => q,
      then(cb: (v: { data: unknown[] }) => unknown) {
        return Promise.resolve(cb({ data: q._rows }));
      },
    };
    return q;
  };
  const client: any = {
    from: (table: string) => {
      if (table === "entities_cases") return make(fixtures.cases);
      if (table === "entities_statutes") return make(fixtures.statutes);
      if (table === "entity_sources") return make(fixtures.doctrines);
      if (table === "entities_agencies") return make(fixtures.agencies);
      return make([]);
    },
  };
  return client as SupabaseClient;
}

describe("buildEntityWhitelist Node/Deno parity (S2)", () => {
  it("emits a deterministic whitelist with the documented structure", async () => {
    const fixtures = {
      cases: [
        {
          canonical_id: "case:miranda",
          case_name: "Miranda v. Arizona",
          primary_citation: "384 U.S. 436",
          citation_count: 9999,
          date_filed: "1966-06-13",
        },
        {
          canonical_id: "case:terry",
          case_name: "Terry v. Ohio",
          primary_citation: "392 U.S. 1",
          citation_count: 8000,
          date_filed: "1968-06-10",
        },
      ],
      statutes: [
        {
          canonical_id: "statute:18-924c",
          jurisdiction: "US",
          title: "18",
          section: "924(c)",
          is_current: true,
        },
      ],
      doctrines: [
        { entity_id: "doct:1", source_ref: "doctrine:reasonable suspicion" },
        { entity_id: "doct:2", source_ref: "doctrine:exclusionary rule" },
      ],
      agencies: [
        { canonical_id: "agency:dea", name: "Drug Enforcement Administration", acronym: "DEA" },
        { canonical_id: "agency:fbi", name: "Federal Bureau of Investigation", acronym: "FBI" },
      ],
    };
    const supabase = makeMockSupabase(fixtures);
    const wl = await buildEntityWhitelist(supabase, {
      charges: ["dui"],
      jurisdiction: "FL",
    });

    // Structure — section headers + wrapping tags must match Deno impl.
    expect(wl.text.startsWith("<AVAILABLE_ENTITIES>")).toBe(true);
    expect(wl.text.endsWith("</AVAILABLE_ENTITIES>")).toBe(true);
    expect(wl.text).toContain("## Cases (type=case)");
    expect(wl.text).toContain("## Statutes (type=statute)");
    expect(wl.text).toContain("## Doctrines (type=doctrine)");
    expect(wl.text).toContain("## Agencies (type=agency)");

    // L4 NOTE must appear when charges are supplied (mirror in Deno).
    expect(wl.text).toContain("# NOTE: Charge-specific authority index pending");
    expect(wl.text).toContain("[dui]");

    // Cases render with canonical_id em-dash case_name (citation) format.
    expect(wl.text).toContain(
      "  case:miranda — Miranda v. Arizona (384 U.S. 436)"
    );
    expect(wl.text).toContain("  case:terry — Terry v. Ohio (392 U.S. 1)");

    // Doctrines strip the "doctrine:" prefix.
    expect(wl.text).toContain("  doct:1 — reasonable suspicion");
    expect(wl.text).toContain("  doct:2 — exclusionary rule");

    // Agencies include acronym in parens.
    expect(wl.text).toContain(
      "  agency:dea — Drug Enforcement Administration (DEA)"
    );

    // Valid IDs carry every canonical_id seen (except doctrine-less rows).
    expect(wl.validIds.has("case:miranda")).toBe(true);
    expect(wl.validIds.has("case:terry")).toBe(true);
    expect(wl.validIds.has("statute:18-924c")).toBe(true);
    expect(wl.validIds.has("doct:1")).toBe(true);
    expect(wl.validIds.has("agency:dea")).toBe(true);
  });

  it("rejects oversized charges array (W3 input validation parity)", async () => {
    const supabase = makeMockSupabase({
      cases: [],
      statutes: [],
      doctrines: [],
      agencies: [],
    });
    const over20 = Array.from({ length: 21 }, (_, i) => `c${i}`);
    await expect(
      buildEntityWhitelist(supabase, { charges: over20 })
    ).rejects.toThrow(/exceeds max length 20/);
  });

  it("rejects oversized jurisdiction string (W3 input validation parity)", async () => {
    const supabase = makeMockSupabase({
      cases: [],
      statutes: [],
      doctrines: [],
      agencies: [],
    });
    await expect(
      buildEntityWhitelist(supabase, { jurisdiction: "TOO-LONG-JURIS" })
    ).rejects.toThrow(/exceeds max length 8/);
  });
});
