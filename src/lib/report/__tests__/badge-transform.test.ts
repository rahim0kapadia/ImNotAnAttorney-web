/**
 * Unit tests for the Phase 2 render-time cite-tag transformer.
 *
 * Uses vi.mock to stub createAdminClient; the Supabase queries are replaced
 * with deterministic in-memory fixtures so the tests exercise the HTML
 * walking, entity-resolution, and doctrine-quote injection logic without
 * hitting the network or the DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Fixtures fed to the mocked Supabase client
type Conf = {
  entity_type: string;
  entity_id: string;
  confidence_level: string;
  source_count: number;
  source_systems: string[];
};
type Quote = {
  doctrine_id: string;
  speaker: string;
  quote_text: string;
  ts_rank: number;
};

let confFixture: Conf[] = [];
let quoteFixture: Quote[] = [];

function makeQuery(data: unknown) {
  const q = {
    _data: data,
    select: () => q,
    in: () => q,
    eq: () => q,
    order: () => q,
    then(cb: (v: { data: unknown }) => unknown) {
      return Promise.resolve(cb({ data: q._data }));
    },
  };
  return q;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "v_entity_confidence") return makeQuery(confFixture);
      if (table === "doctrine_quotes") return makeQuery(quoteFixture);
      return makeQuery([]);
    },
  }),
}));

// Import after mock so the module picks up the stubbed client
import { transformCiteTags } from "@/lib/report/badge-transform";

beforeEach(() => {
  confFixture = [];
  quoteFixture = [];
});

describe("transformCiteTags", () => {
  it("returns input unchanged when there are no cite tags", async () => {
    const html = "<p>Plain text, no citations here.</p>";
    const out = await transformCiteTags(html);
    expect(out).toBe(html);
  });

  it("renders a badge for a known entity with the correct tier class", async () => {
    confFixture = [
      {
        entity_type: "case",
        entity_id: "abc",
        confidence_level: "gold",
        source_count: 5,
        source_systems: ["courtlistener", "fjc", "oyez", "wikidata", "ballotpedia"],
      },
    ];
    const html =
      '<p>Under <cite data-entity-type="case" data-entity-id="abc">Miranda v. Arizona</cite> the rule is clear.</p>';
    const out = await transformCiteTags(html);
    expect(out).toContain('data-confidence="gold"');
    expect(out).toContain("Miranda v. Arizona");
    expect(out).toContain("bg-yellow-900/50");
    // Tooltip reflects source count + systems
    expect(out).toContain("5 sources");
    expect(out).toContain("courtlistener, fjc, oyez, wikidata, ballotpedia");
  });

  it("strips the cite tag for unknown entities leaving only inner text", async () => {
    confFixture = []; // entity not in matview
    const html =
      '<p>Some <cite data-entity-type="case" data-entity-id="unknown-id">Made Up v. Nobody</cite> reference.</p>';
    const out = await transformCiteTags(html);
    expect(out).toContain("Made Up v. Nobody");
    expect(out).not.toContain("<cite");
    expect(out).not.toContain("data-confidence");
  });

  it("renders pull-quotes only once per doctrine even when cited multiple times", async () => {
    confFixture = [
      {
        entity_type: "doctrine",
        entity_id: "d-1",
        confidence_level: "verified",
        source_count: 4,
        source_systems: ["walkerdb", "oyez", "wikidata", "wikipedia"],
      },
    ];
    quoteFixture = [
      {
        doctrine_id: "d-1",
        speaker: "Justice Sotomayor",
        quote_text: "Reasonable suspicion requires particularized facts.",
        ts_rank: 0.9,
      },
      {
        doctrine_id: "d-1",
        speaker: "Justice Kagan",
        quote_text: "Particularity is the lodestar.",
        ts_rank: 0.7,
      },
    ];
    const html =
      '<p><cite data-entity-type="doctrine" data-entity-id="d-1">reasonable suspicion</cite> applies, and <cite data-entity-type="doctrine" data-entity-id="d-1">reasonable suspicion</cite> again, and once more: <cite data-entity-type="doctrine" data-entity-id="d-1">reasonable suspicion</cite>.</p>';
    const out = await transformCiteTags(html);
    const asideCount = (out.match(/<aside/g) ?? []).length;
    expect(asideCount).toBe(1);
    // All three badges render
    const badgeCount = (out.match(/data-confidence="verified"/g) ?? []).length;
    expect(badgeCount).toBe(3);
    // Pull-quote text present
    expect(out).toContain("Reasonable suspicion requires particularized facts");
  });

  it("renders a doctrine badge without an aside when there are no quotes", async () => {
    confFixture = [
      {
        entity_type: "doctrine",
        entity_id: "d-2",
        confidence_level: "high",
        source_count: 3,
        source_systems: ["walkerdb", "oyez", "wikipedia"],
      },
    ];
    quoteFixture = []; // no quotes for d-2
    const html =
      '<p>The <cite data-entity-type="doctrine" data-entity-id="d-2">exclusionary rule</cite> applies.</p>';
    const out = await transformCiteTags(html);
    expect(out).toContain('data-confidence="high"');
    expect(out).not.toContain("<aside");
  });

  it("escapes XSS payloads in quote_text and speaker", async () => {
    confFixture = [
      {
        entity_type: "doctrine",
        entity_id: "d-3",
        confidence_level: "platinum",
        source_count: 6,
        source_systems: ["a", "b", "c", "d", "e", "f"],
      },
    ];
    quoteFixture = [
      {
        doctrine_id: "d-3",
        speaker: 'Justice "Hacker" <script>',
        quote_text: '<script>alert(1)</script> inner text',
        ts_rank: 1.0,
      },
    ];
    const html =
      '<p><cite data-entity-type="doctrine" data-entity-id="d-3">some doctrine</cite></p>';
    const out = await transformCiteTags(html);
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    // Angle brackets in speaker field must be escaped (prevents HTML injection).
    // Double quotes in text content are safe to leave raw per HTML spec; the
    // test verifies the injection vector is neutralized.
    expect(out).toContain("Justice &quot;Hacker&quot; &lt;script&gt;");
  });
});
