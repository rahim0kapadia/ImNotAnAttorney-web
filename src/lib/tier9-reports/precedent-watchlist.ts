/**
 * Precedent Watchlist — $47 Tier 9 SKU (M3).
 *
 * Activates `citation_velocity_criminal` (1.13M rows) at paid-consumer
 * scale. Instant-delivery report showing:
 *   Section 1 — Top 10 fastest-rising precedents for this chargeType over
 *               a 12-24 month window (velocity_tier=rising + rising_flag)
 *   Section 2 — Top 5 fastest-falling precedents (velocity_tier=fading)
 *   Section 3 — Methodology + UPL disclaimer
 *
 * Accompanied by a 4-email drip over 30 days, driven by
 * `/api/cron/precedent-watchlist-emails`. State tracked in
 * `orders.watchlist_email_state` (migration 20260423e).
 *
 * Tier monotonicity (HARD):
 *   - Charge-level (NOT case-specific). IB $997 E1 Appendix F is case-specific.
 *   - No per-case velocity deltas (War Room $4,997 E3 territory).
 *   - No attorney recommendations (UPL).
 *
 * UPL (HARD):
 *   - Phrasing: "citation-velocity delta over 24 months" / "N cases citing"
 *   - Every cited case has a CourtListener URL; rows without URL are suppressed
 *   - Banned phrases: "you should", "we recommend", "we advise",
 *     "your best option", "ask your attorney", "publicly available"
 *
 * Cited experts: Hormozi (entry-tier wedge / crisis-buyer $47 floor);
 *                Chaperon (email-sequence trust-engine, 30-day drip).
 *
 * Sources: docs/advisor/2026-04-23-data-to-product-audit.md product #3,
 *          docs/plans/2026-04-23-data-to-product-autonomous-execution.md M3.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { RISING_JURISDICTION_FILTER } from "@/lib/derivations/constants";

// State → Circuit mapping (federal circuits). Duplicated locally rather than
// imported from ./motion-success-report because that module is still on a
// separate feature branch (feat/motion-success-report-197, PR #88) — kept in
// sync when that PR lands. Circuit is label-only here; citation_velocity is
// not circuit-partitioned in the derivation pipeline.
const STATE_TO_CIRCUIT: Record<string, string> = {
  ME: "1", MA: "1", NH: "1", RI: "1",
  NY: "2", CT: "2", VT: "2",
  PA: "3", NJ: "3", DE: "3",
  MD: "4", VA: "4", WV: "4", NC: "4", SC: "4",
  TX: "5", LA: "5", MS: "5",
  OH: "6", MI: "6", KY: "6", TN: "6",
  IL: "7", IN: "7", WI: "7",
  MN: "8", IA: "8", MO: "8", AR: "8", ND: "8", SD: "8", NE: "8",
  CA: "9", OR: "9", WA: "9", AZ: "9", NV: "9", ID: "9", MT: "9", AK: "9", HI: "9",
  CO: "10", KS: "10", NM: "10", OK: "10", UT: "10", WY: "10",
  FL: "11", GA: "11", AL: "11",
  DC: "DC",
};

const CIRCUIT_NAMES: Record<string, string> = {
  "1": "First Circuit",
  "2": "Second Circuit",
  "3": "Third Circuit",
  "4": "Fourth Circuit",
  "5": "Fifth Circuit",
  "6": "Sixth Circuit",
  "7": "Seventh Circuit",
  "8": "Eighth Circuit",
  "9": "Ninth Circuit",
  "10": "Tenth Circuit",
  "11": "Eleventh Circuit",
  DC: "D.C. Circuit",
};

// ============================================================
// Types
// ============================================================

export interface PrecedentWatchlistInput {
  chargeType: string;          // user-facing ALLOWED_CHARGE_TYPES slug
  state?: string | null;       // 2-letter postal (optional)
}

export interface WatchlistRow {
  cited_opinion_id: number;
  cluster_id: number | null;
  case_name: string;
  date_filed: string | null;
  years_since_filing: number | null;
  citation_count: number;
  velocity: number;
  velocity_tier: "rising" | "fading" | string;
  rising_flag: boolean;
  authority_tier: string | null;
  source_url: string;
  direction: "up" | "down";
  rank: number;
}

export interface PrecedentWatchlistData {
  chargeType: string;
  state: string | null;
  circuit: string | null;
  circuitName: string | null;
  risingCount: number;
  fallingCount: number;
  rising: WatchlistRow[];
  falling: WatchlistRow[];
  limitations: string[];
  chargeFilterApplied: boolean;
  isEmpty: boolean;
  windowLabel: string;         // human-readable window ("last 24 months")
}

// ============================================================
// Constants
// ============================================================

// Window (in months) used in copy — citation_velocity is computed by the
// derivation pipeline over its own fixed window; we label it "24 months"
// since velocity values in the table reflect the quarterly REPLACE-mode
// rolling 24-month average.
const VELOCITY_WINDOW_MONTHS = 24;

// Minimum cluster_id hits per charge-type filter before we prefer the
// charge-filtered list over the national top-N fallback.
const CHARGE_FILTER_MIN_ROWS = 3;

const RISING_COUNT = 10;
const FALLING_COUNT = 5;

// Candidate pool size pulled from citation_velocity_criminal before charge-
// filtering via charge_type_top_authorities. Matches rising-precedent-alerts
// pattern (limit 25 then diff).
const RISING_CANDIDATE_POOL = 30;
const FALLING_CANDIDATE_POOL = 20;

// ============================================================
// UPL phrase blocklist — re-exported from the canonical source
// ============================================================
// Consolidated 2026-04-23 per Round 1 wave-pristine (WARNING #3). Local
// copy removed; canonical list lives in `@/lib/charge-slug-maps`. Re-export
// preserves the public API for existing test imports.
export { UPL_BANNED_PHRASES, scanForUplPhrases } from "@/lib/charge-slug-maps";

// ============================================================
// Charge-type resolution
// ============================================================

function escapeIlike(s: string): string {
  return s.toLowerCase().replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

function prettyChargeType(c: string): string {
  return c.replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function resolveCircuit(input: PrecedentWatchlistInput): string | null {
  const state = (input.state ?? "").trim().toUpperCase();
  if (state && STATE_TO_CIRCUIT[state]) return STATE_TO_CIRCUIT[state];
  return null;
}

/**
 * Pull cluster_ids in charge_type_top_authorities matching a user-facing
 * chargeType. Returns a Set for O(1) membership.
 */
async function getChargeClusterSet(
  supabase: ReturnType<typeof createAdminClient>,
  chargeType: string,
): Promise<Set<string>> {
  const chargeSlug = escapeIlike(chargeType);
  const { data } = await supabase
    .from("charge_type_top_authorities")
    .select("cluster_id")
    .ilike("charge_type", `${chargeSlug}%`)
    .limit(200);
  return new Set((data ?? []).map((r) => String(r.cluster_id)));
}

// ============================================================
// Query
// ============================================================

export async function queryPrecedentWatchlist(
  input: PrecedentWatchlistInput,
): Promise<PrecedentWatchlistData> {
  const supabase = createAdminClient();
  const limitations: string[] = [];
  const chargeType = input.chargeType;
  const state = (input.state ?? "").trim().toUpperCase() || null;
  const circuit = resolveCircuit(input);
  const circuitName = circuit ? CIRCUIT_NAMES[circuit] : null;

  // ---------- Rising: velocity DESC, filter to appellate jurisdictions ----------
  const { data: risingAll, error: risingErr } = await supabase
    .from("citation_velocity_criminal")
    .select(
      "cited_opinion_id, cluster_id, case_name, date_filed, years_since_filing, citation_count, velocity, velocity_tier, rising_flag, authority_tier, source_url",
    )
    .eq("rising_flag", true)
    .in("jurisdiction", [...RISING_JURISDICTION_FILTER])
    .order("velocity", { ascending: false })
    .limit(RISING_CANDIDATE_POOL);
  if (risingErr) {
    limitations.push(`Rising-precedent query failed; results unavailable.`);
  }

  // ---------- Falling: velocity_tier=fading, citation_count DESC (most-cited fading cases) ----------
  const { data: fallingAll, error: fallingErr } = await supabase
    .from("citation_velocity_criminal")
    .select(
      "cited_opinion_id, cluster_id, case_name, date_filed, years_since_filing, citation_count, velocity, velocity_tier, rising_flag, authority_tier, source_url",
    )
    .eq("velocity_tier", "fading")
    .in("jurisdiction", [...RISING_JURISDICTION_FILTER])
    .order("citation_count", { ascending: false })
    .limit(FALLING_CANDIDATE_POOL);
  if (fallingErr) {
    limitations.push(`Falling-precedent query failed; results unavailable.`);
  }

  // ---------- Charge-filter via charge_type_top_authorities ----------
  const chargeClusterSet = await getChargeClusterSet(supabase, chargeType);
  const hasChargeFilter = chargeClusterSet.size >= CHARGE_FILTER_MIN_ROWS;

  const mapRow = (
    r: Record<string, unknown>,
    direction: "up" | "down",
    rank: number,
  ): WatchlistRow | null => {
    const src = (r.source_url as string | null) ?? "";
    if (!src) return null;
    return {
      cited_opinion_id: Number(r.cited_opinion_id),
      cluster_id: r.cluster_id != null ? Number(r.cluster_id) : null,
      case_name: String(r.case_name ?? ""),
      date_filed: (r.date_filed as string | null) ?? null,
      years_since_filing: (r.years_since_filing as number | null) ?? null,
      citation_count: Number(r.citation_count ?? 0),
      velocity: Number(r.velocity ?? 0),
      velocity_tier: String(r.velocity_tier ?? ""),
      rising_flag: Boolean(r.rising_flag),
      authority_tier: (r.authority_tier as string | null) ?? null,
      source_url: src,
      direction,
      rank,
    };
  };

  function pickTopN(
    pool: Array<Record<string, unknown>>,
    count: number,
    direction: "up" | "down",
  ): { rows: WatchlistRow[]; chargeFilterApplied: boolean } {
    // Drop rows without source_url upfront (UPL HARD).
    const filtered: Array<Record<string, unknown>> = [];
    for (const r of pool) {
      if ((r.source_url as string | null) && (r.source_url as string).length > 0) {
        filtered.push(r);
      }
    }
    if (hasChargeFilter) {
      const byCharge = filtered.filter(
        (r) => r.cluster_id != null && chargeClusterSet.has(String(r.cluster_id)),
      );
      if (byCharge.length >= CHARGE_FILTER_MIN_ROWS) {
        const rows: WatchlistRow[] = [];
        for (const r of byCharge.slice(0, count)) {
          const row = mapRow(r, direction, rows.length + 1);
          if (row) rows.push(row);
        }
        return { rows, chargeFilterApplied: true };
      }
    }
    const rows: WatchlistRow[] = [];
    for (const r of filtered.slice(0, count)) {
      const row = mapRow(r, direction, rows.length + 1);
      if (row) rows.push(row);
    }
    return { rows, chargeFilterApplied: false };
  }

  const risingResult = pickTopN(risingAll ?? [], RISING_COUNT, "up");
  const fallingResult = pickTopN(fallingAll ?? [], FALLING_COUNT, "down");

  const chargeFilterApplied =
    risingResult.chargeFilterApplied || fallingResult.chargeFilterApplied;

  if (!chargeFilterApplied && chargeClusterSet.size > 0) {
    limitations.push(
      `Fewer than ${CHARGE_FILTER_MIN_ROWS} charge-specific precedents matched for "${chargeType}"; showing national top ${RISING_COUNT} rising + top ${FALLING_COUNT} fading across all criminal-defense opinions.`,
    );
  } else if (chargeClusterSet.size === 0) {
    limitations.push(
      `No charge-specific authority cluster cached for "${chargeType}"; showing national criminal-defense top ${RISING_COUNT} rising + top ${FALLING_COUNT} fading.`,
    );
  }

  if (state && !circuit) {
    limitations.push(
      `State "${state}" provided but no federal circuit mapping found; results are national, not circuit-filtered.`,
    );
  }

  const isEmpty = risingResult.rows.length === 0 && fallingResult.rows.length === 0;

  return {
    chargeType,
    state,
    circuit,
    circuitName,
    risingCount: risingResult.rows.length,
    fallingCount: fallingResult.rows.length,
    rising: risingResult.rows,
    falling: fallingResult.rows,
    limitations,
    chargeFilterApplied,
    isEmpty,
    windowLabel: `last ${VELOCITY_WINDOW_MONTHS} months`,
  };
}

// ============================================================
// Render
// ============================================================

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtVelocity(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

function arrowGlyph(direction: "up" | "down"): string {
  return direction === "up" ? "↑" : "↓";
}

function renderRow(r: WatchlistRow): string {
  const year = r.date_filed ? htmlEscape(String(r.date_filed).slice(0, 4)) : "—";
  const tier = htmlEscape(r.authority_tier ?? "—");
  const arrow = arrowGlyph(r.direction);
  const arrowColor = r.direction === "up" ? "#16a34a" : "#dc2626";
  return `
    <tr>
      <td>${r.rank}</td>
      <td><a href="${htmlEscape(r.source_url)}" target="_blank" rel="noopener">${htmlEscape(r.case_name)}</a></td>
      <td>${year}</td>
      <td>${r.citation_count}</td>
      <td>${fmtVelocity(r.velocity)}</td>
      <td style="color: ${arrowColor}; font-weight: 600;">${arrow} ${htmlEscape(r.velocity_tier)}</td>
      <td>${tier}</td>
    </tr>`;
}

export function renderPrecedentWatchlist(data: PrecedentWatchlistData): string {
  const chargeLabel = htmlEscape(prettyChargeType(data.chargeType));
  const scopeLabel = data.chargeFilterApplied
    ? `filtered to ${chargeLabel}`
    : "national criminal-defense corpus";

  const stateNote = data.state
    ? `State supplied: ${htmlEscape(data.state)}${data.circuitName ? ` (${htmlEscape(data.circuitName)})` : ""}. Citation-velocity data is not circuit-partitioned in the derivation pipeline; results are national.`
    : "";

  const header = `
    <header class="pw-header">
      <h1>Precedent Watchlist — ${chargeLabel}</h1>
      <p class="pw-subtitle">Citation-velocity delta over the ${htmlEscape(data.windowLabel)} — ${htmlEscape(scopeLabel)}.</p>
      ${stateNote ? `<p class="pw-note">${stateNote}</p>` : ""}
      <p class="pw-gate"><strong>This is legal INFORMATION, not legal ADVICE.</strong> Every row reflects citation-activity data measured from published court opinions. This is not a prediction about any specific case.</p>
    </header>
  `;

  const risingSection =
    data.rising.length > 0
      ? `
    <section class="pw-section">
      <h2>Section 1 &mdash; Top ${RISING_COUNT} fastest-rising precedents ${arrowGlyph("up")}</h2>
      <p class="pw-intro">
        Opinions in the criminal-defense corpus whose citation velocity is
        accelerating ${htmlEscape(scopeLabel)}. "Velocity" is citations per year
        since the opinion was filed; higher means the case is being cited more
        often now than in earlier years.
      </p>
      <table class="pw-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Case</th>
            <th>Filed</th>
            <th>Total citations</th>
            <th>Velocity (cites/yr)</th>
            <th>Trend</th>
            <th>Authority tier</th>
          </tr>
        </thead>
        <tbody>
          ${data.rising.map(renderRow).join("")}
        </tbody>
      </table>
      <p class="pw-scope">Source: citation_velocity_criminal (rising_flag=true; jurisdiction in S/SA/F appellate+supreme).</p>
    </section>`
      : "";

  const fallingSection =
    data.falling.length > 0
      ? `
    <section class="pw-section">
      <h2>Section 2 &mdash; Top ${FALLING_COUNT} fastest-fading precedents ${arrowGlyph("down")}</h2>
      <p class="pw-intro">
        Historically most-cited opinions whose recent citation velocity has
        dropped into the "fading" tier ${htmlEscape(scopeLabel)}. These are
        cases that used to be cited heavily but are being cited less often in
        recent years. A question worth raising with your attorney: are any
        authorities in your case on this list?
      </p>
      <table class="pw-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Case</th>
            <th>Filed</th>
            <th>Total citations</th>
            <th>Velocity (cites/yr)</th>
            <th>Trend</th>
            <th>Authority tier</th>
          </tr>
        </thead>
        <tbody>
          ${data.falling.map(renderRow).join("")}
        </tbody>
      </table>
      <p class="pw-scope">Source: citation_velocity_criminal (velocity_tier=fading; ordered by historic total-citation volume).</p>
    </section>`
      : "";

  const limitations = data.limitations.length
    ? `<aside class="pw-limits"><h3>Known limitations</h3><ul>${data.limitations.map((l) => `<li>${htmlEscape(l)}</li>`).join("")}</ul></aside>`
    : "";

  const dripNote = `
    <section class="pw-section">
      <h2>What happens next &mdash; 4-email drip over 30 days</h2>
      <p>
        For the next 30 days you will receive up to 4 weekly updates when the
        rising-precedent set for ${chargeLabel} shifts rank order. Each email
        is a citation-activity snapshot only, not a recommendation. The drip
        ends automatically on day 30 (or after 4 updates, whichever comes
        first). Every email includes a one-click unsubscribe link.
      </p>
    </section>
  `;

  const disclaimer = `
    <footer class="pw-footer">
      <h3>Methodology</h3>
      <p>This report provides legal INFORMATION — not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied specifically to your case details. Your attorney remains the final authority on strategy decisions.</p>
      <p>Velocity is computed from published court opinions as of the last derivation refresh (quarterly REPLACE-mode rolling ${VELOCITY_WINDOW_MONTHS}-month window). "Rising" = citation_velocity_criminal.rising_flag=true. "Fading" = velocity_tier='fading'. Results are filtered to appellate + supreme court jurisdictions (federal appeals, state appellate, state supreme) so that civil-procedure citations do not dominate criminal-substantive precedents.</p>
      <p>Every row links to the primary opinion on CourtListener for independent verification. Rows without a verification URL are suppressed from the report entirely.</p>
      <p>No part of this report is a prediction about any specific case. It is a map of citation activity in the public record.</p>
    </footer>
  `;

  const styles = `
    <style>
      .precedent-watchlist { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 960px; margin: 2em auto; padding: 1em; color: #111; }
      .precedent-watchlist h1 { font-size: 1.6em; margin: 0 0 0.25em; }
      .precedent-watchlist .pw-subtitle { color: #555; margin: 0 0 0.5em; font-style: italic; }
      .precedent-watchlist .pw-note { color: #666; font-size: 0.88em; margin: 0.25em 0 1em; }
      .precedent-watchlist .pw-gate { background: #fff8e1; border-left: 4px solid #f9a825; padding: 0.75em 1em; margin: 0 0 1.5em; }
      .precedent-watchlist .pw-section { margin: 2em 0; }
      .precedent-watchlist .pw-section h2 { font-size: 1.2em; margin: 0 0 0.5em; border-bottom: 1px solid #e0e0e0; padding-bottom: 0.25em; }
      .precedent-watchlist .pw-intro { color: #555; margin: 0.25em 0 0.75em; }
      .precedent-watchlist .pw-table { width: 100%; border-collapse: collapse; margin: 0.5em 0; font-size: 0.92em; }
      .precedent-watchlist .pw-table th, .precedent-watchlist .pw-table td { text-align: left; padding: 0.45em 0.7em; border-bottom: 1px solid #e8e8e8; }
      .precedent-watchlist .pw-table th { background: #f5f5f5; font-weight: 600; }
      .precedent-watchlist .pw-scope { color: #777; font-size: 0.82em; margin-top: 0.5em; }
      .precedent-watchlist .pw-limits { margin-top: 1.5em; padding: 0.75em 1em; background: #f0f4f8; border-left: 3px solid #4a6fa5; font-size: 0.9em; }
      .precedent-watchlist .pw-footer { margin-top: 2em; padding-top: 1em; border-top: 2px solid #333; color: #555; font-size: 0.9em; }
    </style>
  `;

  return `
    ${styles}
    <section class="precedent-watchlist">
      ${header}
      ${risingSection}
      ${fallingSection}
      ${dripNote}
      ${limitations}
      ${disclaimer}
    </section>
  `;
}

// ============================================================
// Drip snapshot helper (consumed by cron)
// ============================================================

/**
 * Reduce a query result into a compact snapshot for storage in
 * orders.watchlist_email_state.last_velocity_snapshot. Cron computes rank
 * deltas against this on subsequent runs.
 */
export function buildVelocitySnapshot(data: PrecedentWatchlistData): Array<{
  cited_opinion_id: number;
  velocity: number;
  rank: number;
}> {
  return data.rising.map((r) => ({
    cited_opinion_id: r.cited_opinion_id,
    velocity: r.velocity,
    rank: r.rank,
  }));
}

