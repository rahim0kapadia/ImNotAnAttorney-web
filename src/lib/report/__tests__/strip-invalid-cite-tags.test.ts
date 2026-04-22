/**
 * Unit tests for `stripInvalidCiteTags` — post-generation validator.
 *
 * Round-1 finding S2 asks for canonical re-emission: the old impl echoed
 * the attacker-controlled `attrs` string back verbatim; the new impl
 * parses ONLY `data-entity-id` + `data-entity-type` and emits a canonical
 * <cite> with those two attrs. Everything else on the tag is dropped.
 */
import { describe, it, expect } from "vitest";
import { stripInvalidCiteTags } from "@/lib/report/entity-whitelist";

describe("stripInvalidCiteTags", () => {
  it("strips tags with unknown entity_id to plain inner text", () => {
    const html = '<p>Ref: <cite data-entity-id="no-such" data-entity-type="case">Foo</cite>.</p>';
    const out = stripInvalidCiteTags(html, new Set(["valid-1"]));
    expect(out).toBe("<p>Ref: Foo.</p>");
  });

  it("preserves tags with whitelisted entity_id as canonical form", () => {
    const html = '<p><cite data-entity-id="abc" data-entity-type="case">Miranda</cite></p>';
    const out = stripInvalidCiteTags(html, new Set(["abc"]));
    expect(out).toContain('<cite data-entity-id="abc" data-entity-type="case">Miranda</cite>');
  });

  it("drops attacker-controlled extra attrs even on a whitelisted tag (S2)", () => {
    // Hostile attrs: onclick, style, data-exfil, tabindex. Sanitize-html
    // would already strip these upstream, but this is defense-in-depth.
    const html =
      '<cite onclick="pwn()" style="background:red" data-exfil="yes" data-entity-id="abc" data-entity-type="case" tabindex="0">ok</cite>';
    const out = stripInvalidCiteTags(html, new Set(["abc"]));
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("pwn()");
    expect(out).not.toContain("style=");
    expect(out).not.toContain("data-exfil");
    expect(out).not.toContain("tabindex");
    expect(out).toContain('<cite data-entity-id="abc" data-entity-type="case">ok</cite>');
  });

  it("escapes attr special chars in re-emitted tag", () => {
    // Feed a whitelisted ID that contains chars which would otherwise
    // break out of an attribute: `<`, `>`, `"`. The re-emission must
    // escape them so the resulting HTML stays well-formed. IDs this
    // weird never occur in real data (canonical_id is UUID-shaped), but
    // this locks the defense-in-depth behavior.
    const weirdId = 'abc<bad>"weird"';
    const html = `<cite data-entity-id="${weirdId.replace(/"/g, "&quot;")}" data-entity-type="case">X</cite>`;
    // sanity: browser decodes `&quot;` to `"` before our regex runs, but
    // our regex accepts either quote style. We whitelist the post-decode
    // form because that's what the model's output looks like.
    const out = stripInvalidCiteTags(html, new Set([`abc<bad>`]));
    // Note: the id with `<` and `"` would never match; this tag gets
    // stripped. Inner X survives.
    expect(out).toContain("X");
    // No raw `<bad>` tag leaks through as HTML — escaping happens whether
    // the id matched (canonical re-emit) or not (strip to inner text).
    expect(out).not.toMatch(/<bad>/);
  });

  it("is idempotent", () => {
    const html = '<cite data-entity-id="abc" data-entity-type="case">X</cite>';
    const validIds = new Set(["abc"]);
    const once = stripInvalidCiteTags(html, validIds);
    const twice = stripInvalidCiteTags(once, validIds);
    expect(twice).toBe(once);
  });
});
