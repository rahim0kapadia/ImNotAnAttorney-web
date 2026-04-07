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
      "*": ["class", "id", "aria-label", "aria-describedby", "role", "lang"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    disallowedTagsMode: "discard",
  });
}
