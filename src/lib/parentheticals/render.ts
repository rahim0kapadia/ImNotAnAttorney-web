/**
 * TICKET-12: parenthetical render helper.
 *
 * Produces a Mercer-voiced "what other judges have called this case's holding"
 * block of pull-quotes. Used by:
 *   - X-Ray cite-tag transformer (badge-transform.ts) — appended after each
 *     case badge in the rendered report HTML.
 *   - JRC Relevant Court Opinions section (tier9-reports/render.ts) — appended
 *     under each opinion card.
 *
 * Anti-hallucination invariant (Architecture #13): text is rendered verbatim
 * from cl_parentheticals (HTML-escaped). No paraphrase. Source URL = CL deep
 * link to the describing opinion.
 *
 * Structure mirrors the existing doctrine pull-quote pattern in
 * badge-transform.ts so the visual language stays consistent.
 */
import type { Parenthetical } from "./lookup";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function formatYear(dateFiled: string | null): string {
  if (!dateFiled) return "";
  // Accept Postgres date or ISO timestamp — both match /^\d{4}/.
  const m = dateFiled.match(/^(\d{4})/);
  return m ? m[1] : "";
}

const MAX_QUOTE_CHARS = 400;

/**
 * Render a tight pull-quote aside containing N parentheticals. Returns the
 * empty string when there is nothing to show — callers can `+=` unconditionally.
 *
 * The aria-label varies by surface so screen readers + a11y trees can
 * distinguish the X-Ray surface ("Cited in later opinions") from the JRC
 * surface ("How later judges summarized this case").
 */
export function renderParentheticalsAside(
  parentheticals: Parenthetical[],
  surface: "xray" | "jrc" = "xray"
): string {
  if (!Array.isArray(parentheticals) || parentheticals.length === 0) return "";
  const heading =
    surface === "jrc"
      ? "What later judges have called this case's holding"
      : "How later judges summarized this case";
  const ariaLabel =
    surface === "jrc"
      ? "Subsequent judicial summaries of this case"
      : "Parenthetical summaries from later opinions citing this case";
  const items = parentheticals
    .map((p) => {
      const body = (p.describing_text ?? "").slice(0, MAX_QUOTE_CHARS);
      const ellipsis =
        (p.describing_text ?? "").length > MAX_QUOTE_CHARS ? "&hellip;" : "";
      const caseName =
        p.describing_case_name_short || p.describing_case_name || "Citing opinion";
      const year = formatYear(p.describing_date_filed);
      const link = `<a href="${escapeAttr(
        p.source_url
      )}" rel="noopener noreferrer" target="_blank" class="underline decoration-dotted hover:text-amber-300">${escapeHtml(
        caseName
      )}${year ? ` (${year})` : ""}</a>`;
      return (
        `<blockquote class="mt-2 border-l-2 border-amber-600/50 pl-3 text-sm italic text-zinc-300">` +
        `<p>&ldquo;${escapeHtml(body)}${ellipsis}&rdquo;</p>` +
        `<footer class="mt-1 text-xs not-italic text-zinc-500">&mdash; ${link}</footer>` +
        `</blockquote>`
      );
    })
    .join("");
  return (
    `<aside class="mt-2 rounded bg-zinc-950/30 p-3" aria-label="${escapeAttr(
      ariaLabel
    )}">` +
    `<p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-500">${escapeHtml(
      heading
    )}</p>` +
    items +
    `</aside>`
  );
}
