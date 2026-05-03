/**
 * Playbook Circuit Addendum — HTML render layer (E4).
 *
 * Renders a single-page addendum for post-purchase delivery. Matches
 * the motion-success-report / charge-authority-pack CSS conventions so
 * the addendum reads as the same product family.
 *
 * Monotonicity enforced at render time (in addition to generate.ts cap):
 *   - Motions list sliced to MAX_MOTIONS
 *   - Authorities list sliced to MAX_AUTHORITIES
 *   - No judge-specific column (M1 territory)
 *
 * UPL blocklist exported for test-time scanning against the rendered HTML.
 */

import {
  MAX_AUTHORITIES,
  MAX_MOTIONS,
  MIN_N,
  type PlaybookAddendumData,
  type AddendumAuthorityRow,
} from "./generate";
import { renderCapitalContextHtml } from "@/lib/dpic/capital-context";

// ============================================================
// UPL blocklist — re-exported from the canonical source
// ============================================================
// Consolidated 2026-04-23 per Round 1 wave-pristine (WARNING #3). Local
// copy removed; canonical list lives in `@/lib/charge-slug-maps`. Re-export
// preserves the public API for existing test imports.
export { UPL_BANNED_PHRASES, scanForUplPhrases } from "@/lib/charge-slug-maps";

// ============================================================
// Helpers
// ============================================================

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtPct(n: number | null, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "n/a";
  return `${(n * 100).toFixed(digits)}%`;
}

function fmtSigned(n: number | null, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "n/a";
  const pct = n * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)}pp`;
}

function prettyMotionType(m: string): string {
  return m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function velocityArrow(row: AddendumAuthorityRow): string {
  if (row.rising_flag) {
    return '<span class="pa-arrow pa-up" aria-label="rising">&#9650;</span>';
  }
  if ((row.velocity_tier ?? "").toLowerCase() === "fading") {
    return '<span class="pa-arrow pa-down" aria-label="fading">&#9660;</span>';
  }
  return '<span class="pa-arrow pa-flat" aria-label="stable">&mdash;</span>';
}

// ============================================================
// Render
// ============================================================

export function renderPlaybookAddendum(data: PlaybookAddendumData): string {
  const playbookLabel = htmlEscape(data.playbookDisplayName);
  const chargeLabel = htmlEscape(data.chargeDisplayName);
  const circuitLabel = data.circuitName ? htmlEscape(data.circuitName) : null;
  const stateLabel = data.state ? htmlEscape(data.state) : null;

  // HARD: enforce monotonicity caps at render time defensively.
  const motions = data.motions.slice(0, MAX_MOTIONS);
  const authorities = data.authorities.slice(0, MAX_AUTHORITIES);

  const circuitPhrase = circuitLabel
    ? `Your circuit: <strong>${circuitLabel}</strong>${stateLabel ? ` (${stateLabel})` : ""}`
    : stateLabel
      ? `Your state: <strong>${stateLabel}</strong> (no federal circuit resolved)`
      : `National baseline (no state on file)`;

  const header = `
    <header class="pa-header">
      <h1>Circuit Addendum &mdash; ${playbookLabel}</h1>
      <p class="pa-subtitle">${circuitPhrase}</p>
      <p class="pa-gate"><strong>This is legal INFORMATION, not legal ADVICE.</strong> Numbers below come from published court records. They describe what has happened, not what will happen in any specific case.</p>
    </header>
  `;

  // ---------- Section 1: motions ----------
  const s1 =
    motions.length > 0
      ? `
    <section class="pa-section">
      <h2>Top ${motions.length} motions filed in ${chargeLabel}${circuitLabel ? ` &mdash; ${circuitLabel}` : ""}</h2>
      <p class="pa-intro">
        The most frequently filed motion types in ${chargeLabel} opinions in our federal criminal corpus, with grant rates and a comparison to ${circuitLabel ? `the ${circuitLabel} baseline` : "the national baseline"}. Small samples (N &lt; ${MIN_N}) are flagged.
      </p>
      <table class="pa-table">
        <thead>
          <tr>
            <th>Motion type</th>
            <th>N filed</th>
            <th>Granted</th>
            <th>Grant rate</th>
            <th>Baseline</th>
            <th>Delta</th>
          </tr>
        </thead>
        <tbody>
          ${motions
            .map(
              (m) => `
            <tr>
              <td>${htmlEscape(prettyMotionType(m.motion_type))}</td>
              <td>${m.filed_count}</td>
              <td>${m.granted_count}</td>
              <td>${m.filed_count < MIN_N ? `<span class="pa-small">insufficient data</span>` : fmtPct(m.grant_rate)}</td>
              <td>${fmtPct(m.baseline_grant_rate)}</td>
              <td>${fmtSigned(m.deviation_from_baseline)}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
      <p class="pa-scope">Source: motion_outcome_rates${circuitLabel ? ` + motion_outcome_rates_by_circuit (${circuitLabel} baseline)` : ""}. Top ${MAX_MOTIONS} by volume.</p>
    </section>`
      : `
    <section class="pa-section">
      <h2>Top motions filed in ${chargeLabel}</h2>
      <p class="pa-intro pa-empty">No motion-outcome data cached for this charge and circuit combination. See the Motion Success Report upgrade below for broader coverage.</p>
    </section>`;

  // ---------- Section 2: authorities ----------
  const s2 =
    authorities.length > 0
      ? `
    <section class="pa-section">
      <h2>Top ${authorities.length} must-cite authorities for ${chargeLabel}</h2>
      <p class="pa-intro">
        Ranked by citation frequency in ${chargeLabel} opinions. Each row links to the primary opinion on CourtListener for independent verification &mdash; no row appears without a verification URL on file.
      </p>
      ${data.quoteCoverageNote ? `<p class="pa-note">${htmlEscape(data.quoteCoverageNote)}</p>` : ""}
      <table class="pa-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Case</th>
            <th>Citation</th>
            <th>Cites (charge / total)</th>
            <th>Velocity</th>
            <th>Context</th>
          </tr>
        </thead>
        <tbody>
          ${authorities
            .map(
              (r) => `
            <tr>
              <td>${r.rank}</td>
              <td>
                <a href="${htmlEscape(r.source_url)}" target="_blank" rel="noopener">${htmlEscape(r.case_name)}</a>
                ${r.date_filed ? `<span class="pa-date">(${htmlEscape(String(r.date_filed).slice(0, 4))})</span>` : ""}
              </td>
              <td>${r.citation ? htmlEscape(r.citation) : ""}</td>
              <td>${r.citation_count_in_charge ?? ""} / ${r.citation_count_total}</td>
              <td>${velocityArrow(r)}</td>
              <td class="pa-context">${
                r.quote_sentence
                  ? htmlEscape(r.quote_sentence)
                  : `<span class="pa-small">rank-only &mdash; no canonical quote cached</span>`
              }</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
      <p class="pa-scope">Source: charge_type_top_authorities${authorities.some((r) => r.data_scope === "criminal_fallback") ? " + citation_authority_criminal fallback" : ""}; enriched with authority_quotes_criminal + citation_velocity_criminal. Rows without verification URLs are suppressed. Top ${MAX_AUTHORITIES} by charge-specific citation count.</p>
    </section>`
      : `
    <section class="pa-section">
      <h2>Top must-cite authorities for ${chargeLabel}</h2>
      <p class="pa-intro pa-empty">No charge-specific authorities cached. See the Charge Authority Pack upgrade below for a broader, richer treatment.</p>
    </section>`;

  // ---------- Upgrade CTA (monotonicity: make gap explicit) ----------
  const cta = `
    <section class="pa-upsell">
      <h2>Want more depth?</h2>
      <p>
        This addendum shows the top ${MAX_MOTIONS} motions and top ${MAX_AUTHORITIES} authorities as a companion to your playbook. For deeper tooling:
      </p>
      <ul class="pa-upsell-list">
        <li>
          <strong>Motion Success Report &mdash; $197.</strong>
          Top 10 motions (double this addendum), motion grant rates in front of your specific judge when available, top 10 granted-motion citations.
          <a href="/checkout?tier=motion-success-report" class="pa-upsell-link">Get the Motion Success Report &rarr;</a>
        </li>
        <li>
          <strong>Charge Authority Pack &mdash; $97.</strong>
          Top 10 authorities with richer quote presentation, velocity arrows on every row, citation-frequency context.
          <a href="/checkout?tier=charge-authority-pack" class="pa-upsell-link">Get the Authority Pack &rarr;</a>
        </li>
      </ul>
    </section>
  `;

  const limitations = data.limitations.length
    ? `<aside class="pa-limits"><h3>Known limitations</h3><ul>${data.limitations.map((l) => `<li>${htmlEscape(l)}</li>`).join("")}</ul></aside>`
    : "";

  const disclaimer = `
    <footer class="pa-footer">
      <h3>Methodology</h3>
      <p>This report provides legal INFORMATION &mdash; not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied specifically to your case details. Your attorney remains the final authority on strategy decisions.</p>
      <p>Frequencies and citation counts are tallied from published opinions in our federal criminal corpus. A grant rate of X% means: of N motions of that type filed in the scope shown, X% were granted in the opinions we could classify. Small samples (N &lt; ${MIN_N}) are flagged. Citations link to the primary source on CourtListener for independent verification.</p>
      <p>No part of this report constitutes a prediction. It is a map of what is already in the record.</p>
    </footer>
  `;

  const styles = `
    <style>
      .playbook-addendum { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 1020px; margin: 2em auto; padding: 1em; color: #111; }
      .playbook-addendum h1 { font-size: 1.6em; margin: 0 0 0.25em; }
      .playbook-addendum .pa-subtitle { color: #555; margin: 0 0 1em; }
      .playbook-addendum .pa-gate { background: #fff8e1; border-left: 4px solid #f9a825; padding: 0.75em 1em; margin: 0 0 1.5em; }
      .playbook-addendum .pa-section { margin: 2em 0; }
      .playbook-addendum .pa-section h2 { font-size: 1.2em; margin: 0 0 0.5em; border-bottom: 1px solid #e0e0e0; padding-bottom: 0.25em; }
      .playbook-addendum .pa-intro { color: #555; margin: 0.25em 0 0.75em; }
      .playbook-addendum .pa-empty { color: #888; font-style: italic; }
      .playbook-addendum .pa-note { color: #4a6fa5; font-size: 0.92em; margin: 0 0 0.75em; }
      .playbook-addendum .pa-table { width: 100%; border-collapse: collapse; margin: 0.5em 0; font-size: 0.9em; }
      .playbook-addendum .pa-table th, .playbook-addendum .pa-table td { text-align: left; padding: 0.45em 0.7em; border-bottom: 1px solid #e8e8e8; vertical-align: top; }
      .playbook-addendum .pa-table th { background: #f5f5f5; font-weight: 600; }
      .playbook-addendum .pa-date { color: #777; font-size: 0.85em; margin-left: 4px; }
      .playbook-addendum .pa-context { font-style: italic; color: #333; max-width: 28em; }
      .playbook-addendum .pa-small { color: #999; font-style: italic; font-size: 0.9em; }
      .playbook-addendum .pa-arrow { font-weight: bold; font-size: 1.1em; }
      .playbook-addendum .pa-up { color: #1b5e20; }
      .playbook-addendum .pa-down { color: #b71c1c; }
      .playbook-addendum .pa-flat { color: #777; }
      .playbook-addendum .pa-scope { color: #777; font-size: 0.82em; margin-top: 0.5em; }
      .playbook-addendum .pa-limits { margin-top: 1.5em; padding: 0.75em 1em; background: #f0f4f8; border-left: 3px solid #4a6fa5; font-size: 0.9em; }
      .playbook-addendum .pa-upsell { margin: 2em 0; padding: 1em 1.25em; border: 1px solid #F59E0B; background: #fffaf0; border-radius: 6px; }
      .playbook-addendum .pa-upsell h2 { margin-top: 0; }
      .playbook-addendum .pa-upsell-list { list-style: none; padding-left: 0; }
      .playbook-addendum .pa-upsell-list li { margin: 0.75em 0; }
      .playbook-addendum .pa-upsell-link { display: inline-block; margin-top: 0.25em; color: #B45309; text-decoration: underline; font-weight: 600; }
      .playbook-addendum .pa-footer { margin-top: 2em; padding-top: 1em; border-top: 2px solid #333; color: #555; font-size: 0.9em; }
    </style>
  `;

  // ---------- TICKET-19: Capital-adjacency sidebar ----------
  // Render gate: renderCapitalContextHtml returns "" when ineligible.
  // The aside lives ABOVE the upgrade CTA so the buyer reads the eligibility
  // calculation before the upsell.
  const capitalSidebar = data.capitalContext
    ? renderCapitalContextHtml(data.capitalContext)
    : "";

  const capitalStyles = `
    <style>
      .playbook-addendum .capital-context {
        margin: 2em 0;
        padding: 1em 1.25em;
        border-left: 4px solid #b71c1c;
        background: #fff5f5;
        border-radius: 4px;
      }
      .playbook-addendum .capital-context .cap-context-title {
        font-size: 1.05em;
        margin: 0 0 0.5em;
        color: #7f1010;
        font-weight: 600;
      }
      .playbook-addendum .capital-context .cap-context-lead {
        margin: 0 0 0.75em;
        font-weight: 500;
      }
      .playbook-addendum .capital-context .cap-context-stats {
        margin: 0 0 0.75em;
        padding-left: 1.25em;
      }
      .playbook-addendum .capital-context .cap-context-stats li {
        margin: 0.25em 0;
      }
      .playbook-addendum .capital-context .cap-context-fed {
        margin: 0.75em 0;
        padding: 0.5em 0.75em;
        background: #fff8f0;
        border-left: 3px solid #b45309;
        font-size: 0.95em;
      }
      .playbook-addendum .capital-context .cap-context-handoff {
        margin: 0.75em 0 0.5em;
        font-style: italic;
        color: #444;
      }
      .playbook-addendum .capital-context .cap-context-sources {
        margin: 0.75em 0 0;
        font-size: 0.82em;
        color: #777;
      }
    </style>
  `;

  return `
    ${styles}
    ${capitalStyles}
    <section class="playbook-addendum">
      ${header}
      ${s1}
      ${s2}
      ${capitalSidebar}
      ${cta}
      ${limitations}
      ${disclaimer}
    </section>
  `;
}

/** Post-purchase email helper — returns the addendum URL for a given order token. */
export function playbookAddendumPath(
  playbookSlug: string,
  state: string | null,
): string {
  const s = (state ?? "").trim().toUpperCase() || "US";
  return `/playbook-addendum/${encodeURIComponent(playbookSlug)}/${encodeURIComponent(s)}`;
}
