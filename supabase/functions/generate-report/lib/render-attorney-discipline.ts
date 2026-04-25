// supabase/functions/generate-report/lib/render-attorney-discipline.ts
//
// T2.2 + T2.3 + T2.3a + T2.4 (worry-attorney-discipline-wire v2.4) — mechanical
// markdown renderer for the IB attorney bar-discipline section.
//
// Hard rules baked in:
//   - Output is MARKDOWN, not raw HTML. Renderer flows through `md2html` in
//     index.ts which wraps headings, paragraphs, and tables. Pre-built `<tr>`
//     blocks would be shredded by md2html's table-row split regex.
//   - Every interpolated value passes `cell()` = pipe-escape THEN HTML-escape.
//     Pipe-escape FIRST keeps "Suspension | 90-day stayed" inside one cell.
//     HTML-escape SECOND defangs `<` `>` `&` `"` `'`.
//   - URLs flow through `safeHttpUrl` → '#' on non-http(s) (defangs
//     `javascript:` and other protocols).
//   - `safeMdLink` returns plain "(link unavailable)" when URL is null/empty
//     to avoid clickable `#` anchors.
//   - No interpretive language. The deterministic UPL panel
//     (attorney-discipline-upl.test.ts T3.3) fails the build on adjective
//     leakage like "unreliable", "incompetent", etc.
//   - Years-of-practice arithmetic is INTENTIONALLY DROPPED (Dreyer v4 CRIT —
//     "N years" reads as INAA vouching for the credential = UPL surface).

import {
  getAttorneyDiscipline,
  type AttorneyRow,
  type DisciplineEvent,
  type DisciplineLookupResult,
} from "./attorney-discipline.ts";

// ─────────────────────────────────────────────────────────────────────────
// Public anchors / constants — re-imported by tests via fixtures.ts.
// ─────────────────────────────────────────────────────────────────────────

/** Lead-in for the no-match copy — tests grep for this prefix. */
export const NO_MATCH_MESSAGE = "We couldn't match";
export const NO_MATCH_MESSAGE_PREFIX = NO_MATCH_MESSAGE;
// Footer-disclaimer assembled at render time per
// "Public {stateBarName} record. Same data, faster than the .gov form: {url}."
// Tests assert presence of this prefix + the bar URL.
export const DISCLAIMER_VERBATIM =
  "Public California State Bar record. Same data, faster than the .gov form.";

export const SECTION_HEADING = "Your Attorney's Public Bar Record";
export const NICHE_DOMINATION_LINE =
  "*We check this on every IB — before you do.*";

export const JURISDICTION_BAR_NAMES: Record<string, string> = Object.freeze({
  CA: "California State Bar",
  // Multi-state expansion — each entry blocked on a per-state fair-report memo
  // (T0b extension). Render path enforces CA-only via getAttorneyDiscipline()'s
  // jurisdiction guard; these labels are pre-pinned for v3 readiness.
  NJ: "NJ Office of Attorney Ethics",
  VA: "Virginia State Bar",
  FL: "The Florida Bar",
  TX: "State Bar of Texas",
  NY: "New York State Bar",
  PA: "Pennsylvania Disciplinary Board",
  OH: "Ohio Office of Disciplinary Counsel",
  GA: "State Bar of Georgia",
  IL: "Illinois ARDC",
  MI: "Michigan Attorney Grievance Commission",
});

const CA_BAR_LOOKUP_BASE =
  "https://apps.calbar.ca.gov/attorney/Licensee/Detail/";

// Linked from the section footnote. Production deploy URL — when the memo
// directory is mounted on the marketing site, swap in the canonical URL.
const FAIR_REPORT_MEMO_URL =
  "https://github.com/rahim0kapadia/ImNotAnAttorney-web/blob/master/docs/legal/2026-04-25-attorney-discipline-fair-report-privilege.md";

// ─────────────────────────────────────────────────────────────────────────
// Helpers — inline because Deno cannot import from src/lib/email.ts (which
// transitively imports Next.js modules).
// ─────────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeMarkdownPipe(s: string): string {
  // Backslash FIRST — otherwise the pipe-escape's own backslash gets
  // double-escaped on the second pass.
  return s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

/**
 * Cell helper: escape pipe THEN HTML, in that order.
 * Pipe-escape first keeps the literal `\|` visible to the markdown parser
 * (md2html's table split is `(?<!\\)\|`). HTML-escape second defangs angle
 * brackets, ampersands, quotes.
 */
export function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return escapeHtml(escapeMarkdownPipe(String(value)));
}

function safeHttpUrl(u: string | null | undefined): string {
  if (typeof u !== "string") return "#";
  if (!/^https?:\/\//i.test(u)) return "#";
  // Strip control chars to defend against "https://example.com/<script>".
  if (/[\r\n\x00<>"]/.test(u)) return "#";
  return u;
}

export function safeMdLink(label: string, url: string | null | undefined): string {
  const safeLabel = cell(label);
  if (typeof url !== "string" || url.trim() === "") {
    return `${safeLabel} (link unavailable)`;
  }
  const safe = safeHttpUrl(url);
  if (safe === "#") return `${safeLabel} (link unavailable)`;
  // Inside markdown link target, parens / brackets / spaces would corrupt the
  // link. We'll rely on safeHttpUrl having pre-validated http(s):// already.
  return `[${safeLabel}](${safe})`;
}

/**
 * `formatShortDate("2026-04-25T00:00:00Z")` → "2026-04-25".
 * Returns "unknown" on null/undefined/NaN — never a raw timestamptz.
 */
export function formatShortDate(d: string | null | undefined): string {
  if (typeof d !== "string" || d.trim() === "") return "unknown";
  const t = new Date(d);
  if (isNaN(t.getTime())) return "unknown";
  return t.toISOString().slice(0, 10);
}

function admissionYear(d: string | null | undefined): string {
  if (typeof d !== "string" || d.trim() === "") return "unknown";
  const t = new Date(d);
  if (isNaN(t.getTime())) return "unknown";
  return String(t.getUTCFullYear());
}

function lookupBaseFor(jurisdiction: string): string {
  // CA-only in v2; other states fall back to no-link (rendered without CTA).
  if (jurisdiction === "CA") return CA_BAR_LOOKUP_BASE;
  return "";
}

// ─────────────────────────────────────────────────────────────────────────
// Renderers
// ─────────────────────────────────────────────────────────────────────────

export type RenderInput = {
  result: DisciplineLookupResult;
  /** USPS state code; controls the displayed bar name + lookup link. */
  jurisdiction: string;
  /** Original sanitized intake name — only rendered on no-match. */
  attorneyName?: string;
};

/**
 * Render the section as MARKDOWN. Internal renderer — exposed for in-memory
 * hostile-input tests (T2.4 + Success Criterion 10) that bypass the DB.
 */
export function renderAttorneyDisciplineSection(
  input: RenderInput,
): string {
  const stateBarName =
    JURISDICTION_BAR_NAMES[input.jurisdiction] ?? "the state bar";
  const lookupBase = lookupBaseFor(input.jurisdiction);

  const heading = `## ${SECTION_HEADING}`;
  const niche = NICHE_DOMINATION_LINE;
  const memoFootnote = `[Public record — here's why we can show it](${FAIR_REPORT_MEMO_URL})`;

  if (input.result.status === "no-match") {
    const namePart = input.attorneyName
      ? `"${cell(input.attorneyName)}"`
      : "your attorney";
    const verifyLine = lookupBase
      ? `Try the official lookup yourself: ${lookupBase}`
      : `Try the official ${stateBarName} lookup yourself.`;
    return [
      heading,
      "",
      niche,
      "",
      `We couldn't match ${namePart} to a ${stateBarName} record. Most often this is a spelling difference, or your attorney is barred in another state. It does NOT mean they're unlicensed. ${verifyLine}`,
      "",
      memoFootnote,
    ].join("\n");
  }

  const { attorney, events } = input.result;

  const status = cell(attorney.current_status ?? "unknown");
  const statusLine = `Status (per ${stateBarName} as of ${formatShortDate(attorney.last_seen_at)}): ${status}`;
  const admissionLine = `Licensed in ${cell(input.jurisdiction)} since ${admissionYear(attorney.admission_date)} (per ${stateBarName}).`;
  const lookupCta = lookupBase
    ? `Verify yourself: ${lookupBase}${cell(attorney.bar_number)}`
    : "";

  if (events.length === 0) {
    return [
      heading,
      "",
      niche,
      "",
      `**Clean public record per the ${stateBarName} — no discipline events on file.**`,
      "",
      statusLine,
      admissionLine,
      ...(lookupCta ? [lookupCta] : []),
      "",
      `Public ${stateBarName} record. Same data, faster than the .gov form.${lookupBase ? ` ${lookupBase}` : ""}`,
      "",
      memoFootnote,
    ].join("\n");
  }

  const eventCountLabel =
    events.length === 1 ? "1 event" : `${events.length} events`;

  const tableLines: string[] = [
    "| Date | Type | Summary | Source |",
    "|------|------|---------|--------|",
  ];
  for (const ev of events) {
    const dateCell = cell(formatShortDate(ev.order_date));
    const typeCell = cell(ev.discipline_type ?? "");
    const summaryCell = cell(ev.violation_summary || ev.discipline_raw || "");
    const linkCell = safeMdLink("CA Bar order", ev.order_url || ev.source_url);
    tableLines.push(
      `| ${dateCell} | ${typeCell} | ${summaryCell} | ${linkCell} |`,
    );
  }

  return [
    heading,
    "",
    niche,
    "",
    `**Public discipline record on file with the ${stateBarName} (${eventCountLabel}).**`,
    "",
    statusLine,
    admissionLine,
    ...(lookupCta ? [lookupCta] : []),
    "",
    ...tableLines,
    "",
    `Public ${stateBarName} record. Same data, faster than the .gov form.${lookupBase ? ` ${lookupBase}` : ""}`,
    "",
    memoFootnote,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────
// Production wiring — single SOLE public entry point used by index.ts.
// ─────────────────────────────────────────────────────────────────────────

export type BuildAttorneyDisciplineSectionInput = {
  attorneyName: unknown;
  jurisdiction: unknown;
  supabaseUrl: string;
  serviceRoleKey: string;
  /** Optional fetch override for tests. */
  fetchImpl?: typeof fetch;
};

/**
 * Wire-in helper — fetch + render in one call. Returns markdown string ready
 * to be slotted into the IB sectionOutputs map at key "attorney-discipline".
 *
 * Returns "" (empty string) if the section should be suppressed entirely
 * (kill switch via missing supabaseUrl, non-CA jurisdiction, etc.). The
 * caller's `.filter((s) => s.trim())` drops empty entries from the final HTML.
 */
export async function buildAttorneyDisciplineSection(
  input: BuildAttorneyDisciplineSectionInput,
): Promise<string> {
  if (typeof input.attorneyName !== "string" || !input.attorneyName.trim()) {
    return "";
  }
  if (typeof input.jurisdiction !== "string" || !input.jurisdiction.trim()) {
    return "";
  }
  if (!input.supabaseUrl || !input.serviceRoleKey) return "";

  const result = await getAttorneyDiscipline(
    input.attorneyName,
    input.jurisdiction,
    {
      supabaseUrl: input.supabaseUrl,
      serviceRoleKey: input.serviceRoleKey,
      fetchImpl: input.fetchImpl,
    },
  );

  return renderAttorneyDisciplineSection({
    result,
    jurisdiction: input.jurisdiction,
    attorneyName: input.attorneyName.trim(),
  });
}

// Re-exports for convenient single-import in tests.
export type { AttorneyRow, DisciplineEvent, DisciplineLookupResult };
