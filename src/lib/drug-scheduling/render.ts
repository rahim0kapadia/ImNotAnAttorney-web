/**
 * HTML render layer for Federal Register drug-scheduling history (TICKET-16).
 *
 * UPL parity invariant:
 *   Every customer-facing phrase must FRAME a question, not assert an outcome.
 *   The block surfaces dates and citations; the defendant's attorney decides
 *   what to do with them.
 *
 * Banned framings (enforced via UPL_SCHEDULING_BANNED_PHRASES + scanner):
 *   - "you should ask"           → "your attorney can ask"
 *   - "this means your case…"    → "this creates a question for your attorney"
 *   - "you have a strong defense" → "the dates create a documented window"
 *   - "this proves…"             → "the record shows…"
 *
 * Mercer voice (per docs/brand/persona/voice-direction.md):
 *   - Confident, neutral, dry. No exclamation points, no urgency.
 *   - Question-framed: "That's a question for your attorney to put on the record."
 *   - Cool to the system, warm to the defendant.
 */

import type { SchedulingHistory, SchedulingHistoryEntry } from "./history";

// ============================================================
// UPL phrase blocklist (parity with charge-authority-pack.ts patterns)
// ============================================================

export const UPL_SCHEDULING_BANNED_PHRASES = [
  "you should",
  "we recommend",
  "we advise",
  "your best option",
  "your strongest defense",
  "this means you",
  "this proves",
  "you will win",
  "you are likely",
  "this guarantees",
  "you have a defense",
  "publicly available",
] as const;

export function scanForUplSchedulingPhrases(html: string): string[] {
  const lower = html.toLowerCase();
  const hits: string[] = [];
  for (const phrase of UPL_SCHEDULING_BANNED_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) hits.push(phrase);
  }
  return hits;
}

// ============================================================
// HTML escape
// ============================================================

function htmlEscape(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtSchedule(s: SchedulingHistory["currentSchedule"]): string {
  if (!s) return "Unknown";
  if (s === "uncontrolled") return "Federally uncontrolled";
  if (s === "state-only") return "Federally uncontrolled (state-scheduled)";
  return `Schedule ${s}`;
}

function fmtDate(d: string | null): string {
  if (!d) return "";
  return d.slice(0, 10);
}

function fmtAgencies(a: string[]): string {
  if (!Array.isArray(a) || a.length === 0) return "";
  return a
    .map((x) =>
      String(x)
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
    )
    .join(", ");
}

// ============================================================
// Render entries
// ============================================================

function renderEntry(e: SchedulingHistoryEntry): string {
  const dateLabel = e.effectiveDate && e.effectiveDate !== e.publicationDate
    ? `Published ${fmtDate(e.publicationDate)} · Effective ${fmtDate(e.effectiveDate)}`
    : `Published ${fmtDate(e.publicationDate)}`;
  const agencies = e.agencies.length ? fmtAgencies(e.agencies) : "";
  return `
    <li class="dsh-entry">
      <div class="dsh-entry-head">
        <span class="dsh-date">${htmlEscape(dateLabel)}</span>
        ${e.action ? `<span class="dsh-action">${htmlEscape(e.action)}</span>` : ""}
      </div>
      <h4 class="dsh-title">
        <a href="${htmlEscape(e.sourceUrl)}" target="_blank" rel="noopener">${htmlEscape(e.title)}</a>
      </h4>
      ${agencies ? `<p class="dsh-agencies">Agency: ${htmlEscape(agencies)}</p>` : ""}
      ${e.abstractSnippet ? `<p class="dsh-abstract">${htmlEscape(e.abstractSnippet)}</p>` : ""}
      <p class="dsh-source">Federal Register document #${htmlEscape(e.documentNumber)} &middot; <a href="${htmlEscape(e.sourceUrl)}" target="_blank" rel="noopener">verify on federalregister.gov</a></p>
    </li>
  `;
}

// ============================================================
// Public render function
// ============================================================

/**
 * Render a SchedulingHistory as an HTML block for embedding in CAP /
 * playbook reports.
 *
 * Returns empty string when isEmpty AND no taxonomy entry — the caller
 * should suppress the section entirely in that case rather than render
 * a stub.
 *
 * When taxonomy entry exists but no Federal Register history found,
 * renders the current-schedule citation block alone (still useful to
 * the defendant's attorney as a baseline).
 */
export function renderDrugSchedulingHistory(
  data: SchedulingHistory,
): string {
  if (data.isEmpty && !data.substance) return "";

  const substanceLabel = htmlEscape(
    data.substance?.canonicalName ?? data.requestedSlug,
  );

  const header = `
    <header class="dsh-header">
      <h2>Federal Scheduling History &mdash; ${substanceLabel}</h2>
      <p class="dsh-gate">
        <strong>This is legal INFORMATION, not legal ADVICE.</strong>
        Each row links to the primary Federal Register publication for independent verification. The dates below are facts on the federal record &mdash; what they mean for the conduct alleged in your case is a question for your attorney.
      </p>
    </header>
  `;

  const currentBlock = data.substance
    ? `
    <section class="dsh-current">
      <h3>Current federal status</h3>
      <table class="dsh-current-table">
        <tbody>
          <tr><th>Schedule</th><td>${htmlEscape(fmtSchedule(data.currentSchedule))}</td></tr>
          <tr><th>As of</th><td>${htmlEscape(fmtDate(data.currentScheduleAsOf))}</td></tr>
          <tr><th>Citation</th><td>${htmlEscape(data.regulationCitation ?? "")}</td></tr>
          <tr><th>Verify</th><td>${
            data.regulationUrl
              ? `<a href="${htmlEscape(data.regulationUrl)}" target="_blank" rel="noopener">${htmlEscape(data.regulationUrl)}</a>`
              : ""
          }</td></tr>
        </tbody>
      </table>
      ${data.summary ? `<p class="dsh-summary">${htmlEscape(data.summary)}</p>` : ""}
    </section>
  `
    : "";

  const historyBlock =
    data.history.length > 0
      ? `
    <section class="dsh-history">
      <h3>Federal Register actions referencing this substance</h3>
      <p class="dsh-history-intro">
        Time-ordered (newest first). When the conduct alleged in your case sits between two of these dates, the substance's federal status during that window is a documented question your attorney can put on the record.
      </p>
      <ul class="dsh-list">
        ${data.history.map(renderEntry).join("")}
      </ul>
    </section>
  `
      : data.substance
        ? `
    <section class="dsh-history dsh-empty">
      <p>No recent Federal Register actions in our index reference this substance directly. Your attorney can verify the current-schedule citation above and pull the full Federal Register history independently.</p>
    </section>
  `
        : "";

  const limitations = data.limitations.length
    ? `<aside class="dsh-limits"><h3>Known limitations</h3><ul>${data.limitations
        .map((l) => `<li>${htmlEscape(l)}</li>`)
        .join("")}</ul></aside>`
    : "";

  const upl = `
    <footer class="dsh-footer">
      <h3>How to use this section</h3>
      <p>
        This section provides legal INFORMATION &mdash; not legal ADVICE. The dates here are matters of federal record. Whether the conduct alleged in your case sat in a documented gray window, and whether that window matters to your defense, is a question for your attorney.
      </p>
      <p>
        No row in this section is a prediction. Every row links to the primary Federal Register publication for independent verification. Rows without a verification URL on file are suppressed.
      </p>
    </footer>
  `;

  const styles = `
    <style>
      .drug-scheduling-history { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 1020px; margin: 2em auto; padding: 1em; color: #111; }
      .drug-scheduling-history h2 { font-size: 1.5em; margin: 0 0 0.25em; }
      .drug-scheduling-history h3 { font-size: 1.1em; margin: 1em 0 0.5em; border-bottom: 1px solid #e0e0e0; padding-bottom: 0.25em; }
      .drug-scheduling-history h4 { font-size: 1em; margin: 0.25em 0; }
      .drug-scheduling-history .dsh-gate { background: #fff8e1; border-left: 4px solid #f9a825; padding: 0.75em 1em; margin: 0 0 1.5em; }
      .drug-scheduling-history .dsh-current-table { width: 100%; border-collapse: collapse; margin: 0.5em 0; font-size: 0.92em; }
      .drug-scheduling-history .dsh-current-table th, .drug-scheduling-history .dsh-current-table td { text-align: left; padding: 0.4em 0.7em; border-bottom: 1px solid #e8e8e8; vertical-align: top; }
      .drug-scheduling-history .dsh-current-table th { background: #f5f5f5; font-weight: 600; width: 8em; }
      .drug-scheduling-history .dsh-summary { color: #444; font-style: italic; margin: 0.5em 0; }
      .drug-scheduling-history .dsh-list { list-style: none; padding: 0; margin: 0; }
      .drug-scheduling-history .dsh-entry { padding: 0.75em 0; border-bottom: 1px solid #eaeaea; }
      .drug-scheduling-history .dsh-entry-head { display: flex; gap: 0.75em; flex-wrap: wrap; align-items: baseline; font-size: 0.85em; color: #555; }
      .drug-scheduling-history .dsh-date { font-weight: 600; color: #333; }
      .drug-scheduling-history .dsh-action { background: #eef3f8; padding: 0.1em 0.5em; border-radius: 3px; }
      .drug-scheduling-history .dsh-agencies { color: #666; font-size: 0.85em; margin: 0.25em 0; }
      .drug-scheduling-history .dsh-abstract { color: #333; font-size: 0.92em; margin: 0.4em 0; }
      .drug-scheduling-history .dsh-source { color: #777; font-size: 0.82em; margin: 0.25em 0 0; }
      .drug-scheduling-history .dsh-empty p { color: #555; font-style: italic; }
      .drug-scheduling-history .dsh-limits { margin-top: 1.5em; padding: 0.75em 1em; background: #f0f4f8; border-left: 3px solid #4a6fa5; font-size: 0.9em; }
      .drug-scheduling-history .dsh-footer { margin-top: 2em; padding-top: 1em; border-top: 2px solid #333; color: #555; font-size: 0.9em; }
    </style>
  `;

  return `
    ${styles}
    <section class="drug-scheduling-history">
      ${header}
      ${currentBlock}
      ${historyBlock}
      ${limitations}
      ${upl}
    </section>
  `;
}
