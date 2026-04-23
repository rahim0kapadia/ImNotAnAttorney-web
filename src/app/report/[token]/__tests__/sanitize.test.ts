/**
 * Phase 2 — sanitize-html allowlist invariant.
 *
 * The report viewer at /report/[token] stores authored HTML in Supabase and
 * renders it via dangerouslySetInnerHTML after passing through sanitize-html.
 * Phase 2 introduced structured citations emitted as:
 *
 *   <cite data-entity-type="case" data-entity-id="<uuid>">Name</cite>
 *
 * These tags MUST survive sanitize-html intact — the render-time
 * badge-transform (src/lib/report/badge-transform.ts) walks the sanitized
 * HTML looking for <cite data-entity-id> to replace with confidence badges.
 * If sanitize-html strips the tag, the attribute, or the entity id, every
 * badge silently disappears on real reports.
 *
 * This suite asserts the invariant across 6 shape variants the generator is
 * known to emit (plain, blockquote-nested, li-nested, multiple same-type,
 * multiple different-types, adjacent to other allowed tags) + negative
 * controls (disallowed tags still stripped, disallowed attrs still stripped).
 *
 * Source: plan 2026-04-22-worry-phase2-residual-concerns.md, Task T4.
 */
import { describe, it, expect } from "vitest";
import sanitizeHtml from "sanitize-html";
import { reportSanitizeOptions } from "@/lib/report/sanitize-config";

function clean(html: string): string {
  return sanitizeHtml(html, reportSanitizeOptions);
}

// Anchor assertions reused across variants: the cite tag, the entity-type
// attr, and the entity-id attr must all survive.
function expectCiteSurvives(
  output: string,
  entityType: string,
  entityId: string,
  innerText: string
) {
  expect(output).toContain(`data-entity-type="${entityType}"`);
  expect(output).toContain(`data-entity-id="${entityId}"`);
  expect(output).toMatch(/<cite[^>]*>/);
  expect(output).toContain(innerText);
}

describe("report sanitize — Phase 2 <cite> invariant", () => {
  it("variant 1: plain cite inside a paragraph", () => {
    const html =
      '<p>Under <cite data-entity-type="case" data-entity-id="u1">Miranda v. Arizona</cite> the rule is clear.</p>';
    const out = clean(html);
    expectCiteSurvives(out, "case", "u1", "Miranda v. Arizona");
  });

  it("variant 2: cite nested inside a blockquote", () => {
    const html =
      '<blockquote>The holding in <cite data-entity-type="case" data-entity-id="u2">Terry v. Ohio</cite> controls.</blockquote>';
    const out = clean(html);
    expectCiteSurvives(out, "case", "u2", "Terry v. Ohio");
    expect(out).toContain("<blockquote");
  });

  it("variant 3: cite nested inside an <li>", () => {
    const html =
      '<ul><li>See <cite data-entity-type="statute" data-entity-id="s-1">Fla. Stat. § 316.193</cite> for the statute.</li></ul>';
    const out = clean(html);
    expectCiteSurvives(out, "statute", "s-1", "Fla. Stat. § 316.193");
    expect(out).toContain("<li");
  });

  it("variant 4: multiple cite tags with the SAME entity-type in one paragraph", () => {
    const html =
      '<p>Compare <cite data-entity-type="case" data-entity-id="c-a">Case A</cite> with ' +
      '<cite data-entity-type="case" data-entity-id="c-b">Case B</cite> and ' +
      '<cite data-entity-type="case" data-entity-id="c-c">Case C</cite>.</p>';
    const out = clean(html);
    expect((out.match(/<cite[^>]*>/g) ?? []).length).toBe(3);
    for (const id of ["c-a", "c-b", "c-c"]) {
      expect(out).toContain(`data-entity-id="${id}"`);
    }
  });

  it("variant 5: multiple cite tags with DIFFERENT entity-types in one paragraph", () => {
    const html =
      '<p>The <cite data-entity-type="doctrine" data-entity-id="d-1">exclusionary rule</cite> applied in ' +
      '<cite data-entity-type="case" data-entity-id="c-1">Mapp v. Ohio</cite> was later enforced by the ' +
      '<cite data-entity-type="agency" data-entity-id="a-1">FBI</cite> under ' +
      '<cite data-entity-type="statute" data-entity-id="s-1">18 U.S.C. § 2510</cite>.</p>';
    const out = clean(html);
    expect((out.match(/<cite[^>]*>/g) ?? []).length).toBe(4);
    expect(out).toContain('data-entity-type="doctrine"');
    expect(out).toContain('data-entity-type="case"');
    expect(out).toContain('data-entity-type="agency"');
    expect(out).toContain('data-entity-type="statute"');
    expect(out).toContain("exclusionary rule");
    expect(out).toContain("Mapp v. Ohio");
    expect(out).toContain("FBI");
    expect(out).toContain("18 U.S.C. § 2510");
  });

  it("variant 6: cite adjacent to other allowed tags (strong/em/a)", () => {
    const html =
      '<p><strong>Key ruling:</strong> <em>see</em> <cite data-entity-type="case" data-entity-id="c-x">Brady v. Maryland</cite> ' +
      'and <a href="https://example.com">this link</a>.</p>';
    const out = clean(html);
    expectCiteSurvives(out, "case", "c-x", "Brady v. Maryland");
    expect(out).toContain("<strong>");
    expect(out).toContain("<em>");
    expect(out).toContain('href="https://example.com"');
  });

  // Negative controls: confirm the allowlist hasn't been loosened.

  it("negative control: <script> tags are still stripped", () => {
    const html =
      '<p><cite data-entity-type="case" data-entity-id="n1">Case</cite><script>alert(1)</script></p>';
    const out = clean(html);
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
    // The legitimate cite still survives
    expect(out).toContain('data-entity-id="n1"');
  });

  it("negative control: <style> tags are still stripped (CSS injection)", () => {
    const html =
      '<style>body{display:none}</style><p><cite data-entity-type="case" data-entity-id="n2">Case</cite></p>';
    const out = clean(html);
    expect(out).not.toContain("<style");
    expect(out).not.toContain("display:none");
    expect(out).toContain('data-entity-id="n2"');
  });

  it("negative control: unrecognized attrs on <cite> are still stripped", () => {
    const html =
      '<cite data-entity-type="case" data-entity-id="n3" onclick="alert(1)" data-evil="x">Case</cite>';
    const out = clean(html);
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("data-evil");
    expect(out).toContain('data-entity-type="case"');
    expect(out).toContain('data-entity-id="n3"');
  });

  it("negative control: <cite> WITHOUT data-entity-id is preserved as plain element", () => {
    // sanitize-html keeps allowed tags even when no attrs remain. The
    // badge-transform layer then leaves them untouched since there is no
    // entity id to resolve — so this is the safe no-op path.
    const html = "<p><cite>Random citation</cite></p>";
    const out = clean(html);
    expect(out).toContain("<cite");
    expect(out).toContain("Random citation");
  });
});
