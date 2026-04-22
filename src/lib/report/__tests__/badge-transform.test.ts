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
    // Raw 6-tier level preserved on data-confidence (analytics / flywheel)
    expect(out).toContain('data-confidence="gold"');
    // Gold collapses to "top-tier" UI tier per round-2 L7+W1 rename
    expect(out).toContain('data-ui-tier="top-tier"');
    expect(out).toContain("Miranda v. Arizona");
    // Top-tier UI uses the amber-to-yellow gradient class
    expect(out).toContain("from-amber-800/40");
    expect(out).toContain("to-yellow-700/40");
    // Tooltip reflects source count + systems
    expect(out).toContain("5 sources");
    expect(out).toContain("courtlistener, fjc, oyez, wikidata, ballotpedia");
    // L2: no uppercase inline label anymore — only color tier + tooltip
    expect(out).not.toMatch(/uppercase[^"]*">(?:GOLD|PLATINUM|VERIFIED|BASIC|PREMIUM)/i);
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
    // Round-2 W6: duplicate HTML ids would be an A11y + W3C violation.
    // Every aria-describedby target id must be unique.
    const ids = Array.from(out.matchAll(/id="cite-summary-[^"]+"/g)).map(
      (m) => m[0]
    );
    expect(ids.length).toBe(3);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
    // First occurrence gets unsuffixed id; subsequent get -2, -3
    expect(ids).toContain('id="cite-summary-d-1"');
    expect(ids).toContain('id="cite-summary-d-1-2"');
    expect(ids).toContain('id="cite-summary-d-1-3"');
    // aria-describedby targets match the per-occurrence ids (order-preserving)
    const ariaRefs = Array.from(
      out.matchAll(/aria-describedby="(cite-summary-[^"]+)"/g)
    ).map((m) => m[1]);
    expect(ariaRefs).toEqual([
      "cite-summary-d-1",
      "cite-summary-d-1-2",
      "cite-summary-d-1-3",
    ]);
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

  it("collapses 6-tier levels to 3 UI tiers (round-1 L1, round-2 L7+W1 rename)", async () => {
    // Map pairs: (raw -> ui). Round-2 renames:
    //   basic          ← standard | medium
    //   cross-verified ← high | verified    (was `verified`, collided with DB literal)
    //   top-tier       ← gold | platinum    (was `premium`, collided with "Premium Playbooks")
    const cases: Array<[string, string]> = [
      ["standard", "basic"],
      ["medium", "basic"],
      ["high", "cross-verified"],
      ["verified", "cross-verified"],
      ["gold", "top-tier"],
      ["platinum", "top-tier"],
    ];
    for (const [raw, ui] of cases) {
      confFixture = [
        {
          entity_type: "case",
          entity_id: `ec-${raw}`,
          confidence_level: raw,
          source_count: 2,
          source_systems: ["courtlistener", "fjc"],
        },
      ];
      const html =
        `<p><cite data-entity-type="case" data-entity-id="ec-${raw}">X v. Y</cite></p>`;
      const out = await transformCiteTags(html);
      expect(out, `raw=${raw}`).toContain(`data-confidence="${raw}"`);
      expect(out, `raw=${raw}`).toContain(`data-ui-tier="${ui}"`);
    }
  });

  it("emits a tappable source-count disclosure for screen-reader + print (L5)", async () => {
    confFixture = [
      {
        entity_type: "case",
        entity_id: "l5-abc",
        confidence_level: "verified",
        source_count: 4,
        source_systems: ["courtlistener", "fjc", "oyez", "wikidata"],
      },
    ];
    const html = '<p><cite data-entity-type="case" data-entity-id="l5-abc">A v. B</cite></p>';
    const out = await transformCiteTags(html);
    // Inline (4) count, tappable on mobile, visible in print.
    expect(out).toContain("(4)");
    // aria-describedby wires the badge to the inline summary for screen readers.
    expect(out).toContain('aria-describedby="cite-summary-l5-abc"');
    expect(out).toContain('id="cite-summary-l5-abc"');
  });

  it("drops nested markup inside cite (W5 invariant, docs in SYSTEM_PROMPT)", async () => {
    // Round-2 W5: we intentionally use `node.text` (plain text, decoded) not
    // `node.innerHTML` for the badge inner text. This means nested <em> /
    // <strong> / any other markup inside <cite> IS DROPPED. The SYSTEM_PROMPT
    // in supabase/functions/generate-report/index.ts forbids inner markup
    // inside cite tags so the model never emits it in the first place — this
    // test locks the fallback behavior if it ever leaks through.
    confFixture = [
      {
        entity_type: "case",
        entity_id: "ww5",
        confidence_level: "gold",
        source_count: 5,
        source_systems: ["courtlistener", "fjc", "oyez", "wikidata", "ballotpedia"],
      },
    ];
    const html =
      '<p><cite data-entity-type="case" data-entity-id="ww5"><em>Miranda</em> v. Arizona</cite></p>';
    const out = await transformCiteTags(html);
    // The <em> tag is stripped — only plain text survives.
    expect(out).toContain("Miranda v. Arizona");
    expect(out).not.toContain("<em>Miranda</em>");
    // Badge still renders with correct tier.
    expect(out).toContain('data-ui-tier="top-tier"');
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
