/**
 * Sanitize-HTML configuration for customer reports.
 *
 * Extracted from src/app/report/[token]/page.tsx so the Phase 2 invariant
 * — <cite> tags with data-entity-type / data-entity-id MUST survive sanitize
 * — can be exercised by unit tests (see __tests__/sanitize.test.ts).
 *
 * Tightened from sanitize-html defaults:
 *   REMOVED tags: <style> (CSS injection), <html>/<head>/<body>
 *     (structural), <meta>/<link> (external resource loading, redirect
 *     attacks)
 *   CSS values: strict regex patterns instead of /.*\/ wildcards. Prevents
 *     CSS expression() attacks, url() data exfiltration, and @import-based
 *     stylesheet injection.
 *   Allowed: standard formatting tags, tables, images (src/alt/width/height
 *     only), links (href/target/rel), safe inline styles, and <cite> tags
 *     (Phase 2 — data-entity-type + data-entity-id preserved).
 */
import type { IOptions } from "sanitize-html";

// Round-1 finding S4: freeze the options object (shallow) so a buggy
// caller cannot mutate the allowlist at runtime — the sanitize-html
// invariant protected by sanitize.test.ts must hold across the process
// lifetime, not just at module-load time.
export const reportSanitizeOptions: IOptions = Object.freeze({
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "a", "div", "span",
    "ul", "ol", "li",
    "strong", "em", "b", "i", "u",
    "table", "tr", "td", "th", "thead", "tbody",
    "br", "hr",
    "blockquote", "img", "title",
    // Phase 2: structured citations emitted by the generator. Tags are
    // transformed render-side into badges + doctrine pull-quotes after
    // sanitize-html runs.
    "cite",
  ],
  allowedAttributes: {
    "*": ["style", "class", "id"],
    a: ["href", "style", "class", "target", "rel"],
    img: ["src", "alt", "width", "height"],
    // Phase 2: canonical-id + entity-type pair carries the link to
    // v_entity_confidence for render-time badge resolution.
    cite: ["data-entity-type", "data-entity-id"],
  },
  allowedStyles: {
    "*": {
      color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/, /^[a-zA-Z]+$/],
      "background-color": [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/, /^[a-zA-Z]+$/],
      background: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/, /^[a-zA-Z]+$/],
      "font-size": [/^\d+(?:px|em|rem|%)$/],
      "font-weight": [/^(?:bold|normal|\d{3})$/],
      "font-family": [/^[-\w\s,']+$/],
      "text-align": [/^(?:left|center|right|justify)$/],
      "text-decoration": [/^(?:none|underline|line-through|overline)(?:\s|$)/],
      margin: [/^[-\d]+(?:px|em|rem|%)(?:\s|$)/, /^0\s+auto$/],
      "margin-top": [/^[-\d]+(?:px|em|rem|%)$/],
      "margin-bottom": [/^[-\d]+(?:px|em|rem|%)$/],
      "margin-left": [/^[-\d]+(?:px|em|rem|%)$/, /^auto$/],
      "margin-right": [/^[-\d]+(?:px|em|rem|%)$/, /^auto$/],
      padding: [/^[\d]+(?:px|em|rem|%)(?:\s|$)/],
      "padding-top": [/^[\d]+(?:px|em|rem|%)$/],
      "padding-bottom": [/^[\d]+(?:px|em|rem|%)$/],
      "padding-left": [/^[\d]+(?:px|em|rem|%)$/],
      "padding-right": [/^[\d]+(?:px|em|rem|%)$/],
      border: [/^\d+px\s/],
      "border-top": [/^\d+px\s/],
      "border-left": [/^\d+px\s/],
      "border-right": [/^\d+px\s/],
      "border-bottom": [/^\d+px\s/],
      "border-radius": [/^[\d]+(?:px|em|rem|%)$/],
      "border-collapse": [/^(?:collapse|separate)$/],
      "border-color": [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^[a-zA-Z]+$/],
      "max-width": [/^[\d]+(?:px|em|rem|%)$/],
      width: [/^[\d]+(?:px|em|rem|%)$/],
      display: [/^(?:block|inline|inline-block|flex|none|table|table-row|table-cell)$/],
      "line-height": [/^[\d.]+(?:px|em|rem|%)?$/],
      "list-style": [/^(?:none|disc|circle|square|decimal|lower-alpha|upper-alpha)$/],
    },
  },
}) as IOptions;
