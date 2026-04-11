/**
 * @file HTML sanitization for user-facing report content.
 *
 * Used by the standalone report viewer (and future report viewers)
 * to sanitize Claude-generated HTML before rendering via dangerouslySetInnerHTML.
 * Allows semantic HTML tags (headings, lists, tables, emphasis) while stripping
 * scripts, iframes, event handlers, and other XSS vectors.
 */
import sanitize from "sanitize-html";

/**
 * Sanitizes report HTML for safe rendering.
 *
 * Allows: semantic tags (h1-h6, p, ul, ol, li, table, strong, em, a, etc.)
 * Strips: script, iframe, form, input, object, embed, event handlers, javascript: URIs
 */
/**
 * CSS properties safe for report rendering.
 * Blocks position/z-index/fixed overlay attacks while allowing
 * visual styling needed by Tier 9 data-driven reports (inline styles)
 * and Claude-generated reports (semantic tags).
 */
const SAFE_CSS_PROPERTIES = [
  "color", "background", "background-color",
  "font-size", "font-weight", "font-style", "font-family",
  "text-align", "text-decoration", "text-transform",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border", "border-top", "border-right", "border-bottom", "border-left",
  "border-color", "border-style", "border-width",
  "border-collapse", "border-radius", "border-spacing",
  "line-height", "letter-spacing", "max-width", "width",
  "display", "overflow", "overflow-x", "white-space",
  "vertical-align", "list-style", "list-style-type", "table-layout",
];

export function sanitizeReportHtml(html: string): string {
  return sanitize(html, {
    allowedTags: [
      // Block
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "div", "section", "article", "header", "footer", "main",
      "blockquote", "pre", "code", "hr", "br",
      // Lists
      "ul", "ol", "li", "dl", "dt", "dd",
      // Tables
      "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
      // Inline
      "a", "strong", "b", "em", "i", "u", "s", "small", "sub", "sup",
      "span", "mark", "abbr", "cite", "q", "time",
      // Details
      "details", "summary",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      th: ["scope", "colspan", "rowspan"],
      td: ["colspan", "rowspan"],
      ol: ["start", "type"],
      time: ["datetime"],
      abbr: ["title"],
      "*": ["class", "id", "style", "aria-label", "aria-describedby", "role", "lang"],
    },
    allowedStyles: {
      // Reject values containing url(), expression(), javascript:, import, -moz-binding
      // to prevent CSS-based data exfiltration and legacy IE XSS vectors.
      "*": Object.fromEntries(
        SAFE_CSS_PROPERTIES.map((prop) => [prop, [/^(?!.*(?:url\s*\(|expression\s*\(|javascript:|import|@import|-moz-binding)).*$/i]])
      ),
    },
    allowedSchemes: ["http", "https", "mailto"],
    disallowedTagsMode: "discard",
  });
}
