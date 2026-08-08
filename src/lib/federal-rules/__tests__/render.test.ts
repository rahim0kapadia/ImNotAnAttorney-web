/**
 * Unit tests for transformRuleCitations (TICKET-20).
 *
 * Mocks createAdminClient so the DB calls return deterministic fixtures.
 * Verifies:
 *   - inline rule text is spliced under FRE/FRCP/FRCrP/FRAP citations
 *   - subsection-level granularity narrows the body
 *   - existing <cite> tags + hyperlinks are NOT touched (sanitizer compliance)
 *   - the transform is idempotent (second pass = no-op)
 *   - cite-tag sanitizer policy is respected (only allowlisted tags emitted)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface RuleRow {
  rule_set: string;
  rule_number: string;
  title: string;
  body: string;
  effective_date: string;
  source_url: string;
}

let ruleFixture: RuleRow[] = [];

function makeQuery(data: unknown) {
  const q = {
    _data: data,
    select: () => q,
    eq: () => q,
    in: () => q,
    maybeSingle() {
      const arr = q._data as unknown[];
      const row = Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
      return Promise.resolve({ data: row, error: null });
    },
    then(cb: (v: { data: unknown; error: null }) => unknown) {
      return Promise.resolve(cb({ data: q._data, error: null }));
    },
  };
  return q;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "federal_rules") return makeQuery(ruleFixture);
      return makeQuery([]);
    },
  }),
}));

import { transformRuleCitations } from "@/lib/federal-rules/render";

const FRE_404: RuleRow = {
  rule_set: "evidence",
  rule_number: "404",
  title: "Character Evidence; Other Crimes, Wrongs, or Acts",
  body:
    "(a) CHARACTER EVIDENCE. (1) Prohibited Uses. Evidence of a person's character... " +
    "(b) OTHER CRIMES, WRONGS, OR ACTS. (1) Prohibited Uses. Evidence of any other " +
    "crime, wrong, or act is not admissible to prove a person's character... " +
    "(c) NOTICE IN A CRIMINAL CASE. In a criminal case, the prosecutor must...",
  effective_date: "2024-12-01",
  source_url: "https://www.uscourts.gov/sites/default/files/fre.pdf",
};

const FRCP_16: RuleRow = {
  rule_set: "civil_procedure",
  rule_number: "16",
  title: "Pretrial Conferences; Scheduling; Management",
  body: "(a) PURPOSES OF A PRETRIAL CONFERENCE. In any action, the court may order...",
  effective_date: "2024-12-01",
  source_url: "https://www.uscourts.gov/sites/default/files/frcp.pdf",
};

beforeEach(() => {
  ruleFixture = [];
});

describe("transformRuleCitations", () => {
  it("returns input unchanged when no rule citations are present", async () => {
    const html = "<p>Pure prose, zero rules cited.</p>";
    const out = await transformRuleCitations(html);
    expect(out).toBe(html);
  });

  it("returns input unchanged when prefix appears but no real citation matches", async () => {
    const html = "<p>The word FREEDOM does not refer to a rule.</p>";
    const out = await transformRuleCitations(html);
    expect(out).toBe(html);
  });

  it("inlines FRE 404(b) text under the citation", async () => {
    ruleFixture = [FRE_404];
    const html = '<p>Under FRE 404(b), prior bad acts are limited.</p>';
    const out = await transformRuleCitations(html);
    expect(out).toContain('class="rule-inline');
    expect(out).toContain("FRE 404(b)");
    expect(out).toContain("OTHER CRIMES, WRONGS, OR ACTS");
    // Subsection narrowing: should NOT include other subsections.
    expect(out).not.toContain("CHARACTER EVIDENCE");
    expect(out).not.toContain("NOTICE IN A CRIMINAL CASE");
  });

  it("renders title + last_amendment + source link", async () => {
    ruleFixture = [FRE_404];
    const html = "<p>FRE 404(b) governs.</p>";
    const out = await transformRuleCitations(html);
    expect(out).toContain("Character Evidence; Other Crimes, Wrongs, or Acts");
    expect(out).toContain("Effective 2024-12-01");
    expect(out).toContain('href="https://www.uscourts.gov/sites/default/files/fre.pdf"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });

  it("inlines FRCP 16 (no subsection) with full body", async () => {
    ruleFixture = [FRCP_16];
    const html = "<p>FRCP 16 schedules things.</p>";
    const out = await transformRuleCitations(html);
    expect(out).toContain("FRCP 16");
    expect(out).toContain("PURPOSES OF A PRETRIAL CONFERENCE");
  });

  it("does NOT touch text inside <cite> tags (entity-cite sanitizer owns those)", async () => {
    ruleFixture = [FRE_404];
    const html =
      '<p>See <cite data-entity-type="case" data-entity-id="abc">FRE 404(b) discussed in Smith</cite> in detail.</p>';
    const out = await transformRuleCitations(html);
    // Cite tag survives untouched
    expect(out).toContain('<cite data-entity-type="case" data-entity-id="abc">');
    // No rule-inline span injected inside the cite
    expect(out).not.toContain('class="rule-inline');
  });

  it("does NOT touch text inside <a> tags (author hyperlinks preserved)", async () => {
    ruleFixture = [FRE_404];
    const html =
      '<p>Visit <a href="https://example.com">FRE 404(b) primer</a> for context.</p>';
    const out = await transformRuleCitations(html);
    expect(out).toContain('<a href="https://example.com">');
    expect(out).not.toContain('class="rule-inline');
  });

  it("leaves unknown rule cites as plain text (no fabrication)", async () => {
    ruleFixture = []; // DB miss for FRE 999
    const html = "<p>FRE 999 does not exist in seed data.</p>";
    const out = await transformRuleCitations(html);
    expect(out).toContain("FRE 999");
    expect(out).not.toContain("rule-inline-text");
  });

  it("is idempotent — second pass does not double-wrap", async () => {
    ruleFixture = [FRE_404];
    const html = "<p>Under FRE 404(b), prior bad acts are limited.</p>";
    const first = await transformRuleCitations(html);
    const second = await transformRuleCitations(first);
    // Match counts should be identical between pass 1 and pass 2.
    const count = (s: string) => (s.match(/class="rule-inline /g) || []).length;
    expect(count(first)).toBe(1);
    expect(count(second)).toBe(1);
  });

  it("emits ONLY tags inside the report sanitize allowlist", async () => {
    ruleFixture = [FRE_404];
    const html = "<p>FRE 404(b) test.</p>";
    const out = await transformRuleCitations(html);
    // Extract any custom tag the renderer might emit and compare against
    // the sanitize allowlist. We test the negative — none of the
    // disallowed-but-conceivable tags should appear.
    const banned = ["script", "iframe", "object", "embed", "details", "summary", "video"];
    for (const t of banned) {
      expect(out).not.toContain(`<${t}`);
    }
    // Positive: emits expected tags
    expect(out).toMatch(/<span class="rule-inline/);
    expect(out).toContain("<strong>FRE 404(b)</strong>");
    expect(out).toContain("<blockquote class=\"rule-inline-text\">");
  });

  it("escapes HTML in surrounding text (no XSS injection from outer prose)", async () => {
    ruleFixture = [FRE_404];
    // Author prose contains a literal "<" that would be HTML if unescaped.
    // The transform splits the text node around the citation and re-emits
    // the surrounding pieces — those re-emissions must be HTML-escaped.
    const html = "<p>foo &lt;script&gt; FRE 404(b) bar</p>";
    const out = await transformRuleCitations(html);
    // The injected raw < / > should remain escaped after re-emission.
    expect(out).not.toContain("<script>");
  });

  it("handles multiple distinct citations in one report", async () => {
    ruleFixture = [FRE_404, FRCP_16];
    const html =
      "<p>Combine FRE 404(b) with FRCP 16 to set up the motion timeline.</p>";
    const out = await transformRuleCitations(html);
    expect(out).toContain("FRE 404(b)");
    expect(out).toContain("FRCP 16");
    expect(out).toContain("OTHER CRIMES");
    expect(out).toContain("PURPOSES OF A PRETRIAL CONFERENCE");
  });
});
