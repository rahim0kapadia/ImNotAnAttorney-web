/**
 * Charge Authority Pack — $97 Tier 9 SKU (M2).
 *
 * Activates dormant authority data:
 *   - charge_type_top_authorities (548 rows)     — pre-ranked top precedents per charge
 *   - authority_quotes_criminal   (254 rows)     — pre-extracted canonical quotes
 *   - citation_velocity_criminal  (1.13M rows)   — rising/falling velocity indicator
 *   - citation_authority_criminal (620k rows)    — national fallback for authority tier
 *
 * For a defendant's (chargeType, optional state, optional circuit) the report
 * renders a top-10 "must-cite defense authorities" table with columns:
 *   Rank | Case Name | Citation | Authority Tier | Pre-Extracted Quote | Velocity Arrow | CourtListener URL
 *
 * Tier monotonicity (HARD):
 *   - NO case-specific cross-reference (IB $997 E1 territory)
 *   - NO per-case motion-grant correlation (X-Ray $2,497 territory)
 *   - Playbook $127/$147 addendum E4 will later show top-5; M2 top-10 stays above.
 *
 * UPL (HARD):
 *   - Every row has case name + citation + URL + (optional) quote
 *   - Rows without source_url are SUPPRESSED (no-hallucinated-legal-data.md)
 *   - Banned phrases: "you should", "we recommend", "we advise", "your best option",
 *     "ask your attorney", "publicly available"
 *
 * Cited experts:
 *   - Hormozi (Grand Slam, low-friction entry tier, ladders $97 → $197 → $997)
 *   - Dreyer (AI Overview Defense — authority-engine positioning)
 *
 * Sources:
 *   docs/advisor/2026-04-23-data-to-product-audit.md product #2
 *   docs/plans/2026-04-23-data-to-product-autonomous-execution.md M2
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { CHARGE_TYPE_AUTHORITY_MAP } from "@/lib/charge-slug-maps";
import {
  getDrugSchedulingHistoryWithClient,
  type SchedulingHistory,
} from "@/lib/drug-scheduling/history";
import { renderDrugSchedulingHistory } from "@/lib/drug-scheduling/render";

// ============================================================
// Types
// ============================================================

export interface ChargeAuthorityPackInput {
  chargeType: string;          // ALLOWED_CHARGE_TYPES user-facing slug
  state?: string | null;       // 2-letter postal (optional — display only)
  circuit?: string | null;     // "1".."11", "DC" (optional — derived from state)
  substanceSlug?: string | null; // TICKET-16: when chargeType is drug-related,
                                 // surface Federal Register scheduling history
                                 // for the named substance (taxonomy slug from
                                 // src/lib/drug-scheduling/substances.ts).
                                 // Block is suppressed when null/missing/unknown.
}

export interface AuthorityPackRow {
  rank: number;
  case_name: string;
  date_filed: string | null;
  citation: string | null;             // primary_reporter when available (e.g. "556 U.S. 662")
  authority_tier: string | null;       // "landmark" | "frequent" | "emerging" | …
  citation_count_in_charge: number | null;
  citation_count_total: number;
  quote_sentence: string | null;       // null when no quote cached
  velocity: number | null;             // citations per year
  velocity_tier: string | null;        // "fading" | "rising" | etc
  rising_flag: boolean;                // true = arrow up, false & velocity_tier=fading = arrow down
  source_url: string;
  data_scope: "charge_type" | "criminal_fallback";
}

export interface ChargeAuthorityPackData {
  chargeType: string;
  state: string | null;
  circuit: string | null;
  circuitName: string | null;
  rows: AuthorityPackRow[];
  limitations: string[];
  isEmpty: boolean;
  /**
   * TICKET-16: optional Federal Register drug-scheduling history for the
   * defendant's substance. Populated only when chargeType is drug-related
   * (substance lookup in CHARGE_TYPE_DRUG_FAMILY) AND substanceSlug input
   * resolves in the substance taxonomy. null/undefined = block suppressed.
   */
  drugSchedulingHistory?: SchedulingHistory | null;
}

// ============================================================
// Charge-type slug mapping
// ============================================================
//
// charge_type_top_authorities uses the SAME internal slugs as
// motion_outcome_rates (verified live 2026-04-23 — 54 distinct values such as
// "dui-dwi", "drug-possession-cocaine", "sexual-assault"). User-facing
// ALLOWED_CHARGE_TYPES slugs ("dui", "drug-possession") do NOT match, so we
// route them through a map identical in shape to CHARGE_TYPE_MOR_MAP.
//
// Deliberately narrow — only maps slugs verified present in
// charge_type_top_authorities (2026-04-23). Unmapped charges fall through to
// citation_authority_criminal national fallback with a limitation note.

// CHARGE_TYPE_AUTHORITY_MAP imported from @/lib/charge-slug-maps (top of file).
// Canonical source lives there; previous inline copy removed 2026-04-23
// per Round 1 wave-pristine (WARNING #4). Re-exported for backwards
// compatibility with any external caller importing from this module.
export { CHARGE_TYPE_AUTHORITY_MAP };

// ============================================================
// Circuit/state mapping (display context only — authorities are national)
// ============================================================
//
// citation_authority_by_jurisdiction.jurisdiction is a single-char code
// (F=federal, S=state) — NOT a federal circuit. So we can't narrow citations
// by circuit via that table. Circuit is retained ONLY for the display header
// ("Ninth Circuit defendant — authorities are national precedent") to avoid
// misleading UX.

export const STATE_TO_CIRCUIT: Record<string, string> = {
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

export const CIRCUIT_NAMES: Record<string, string> = {
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

const VALID_CIRCUITS = new Set(Object.keys(CIRCUIT_NAMES));

function resolveCircuit(input: ChargeAuthorityPackInput): string | null {
  const raw = (input.circuit ?? "").trim();
  if (raw && VALID_CIRCUITS.has(raw)) return raw;
  const state = (input.state ?? "").trim().toUpperCase();
  if (state && STATE_TO_CIRCUIT[state]) return STATE_TO_CIRCUIT[state];
  return null;
}

// ============================================================
// Query
// ============================================================

export async function queryChargeAuthorityPack(
  input: ChargeAuthorityPackInput,
): Promise<ChargeAuthorityPackData> {
  const supabase = createAdminClient();
  const limitations: string[] = [];
  const chargeType = input.chargeType;
  const state = (input.state ?? "").trim().toUpperCase() || null;
  const circuit = resolveCircuit(input);
  const circuitName = circuit ? CIRCUIT_NAMES[circuit] : null;

  // --------- Step 1: fetch top authorities for this charge ---------
  const internalCharges = CHARGE_TYPE_AUTHORITY_MAP[chargeType] ?? [];

  interface AuthorityBase {
    rank: number;
    case_name: string;
    date_filed: string | null;
    citation_count_in_charge: number | null;
    citation_count_total: number;
    authority_tier: string | null;
    source_url: string;
    cited_opinion_id: number;
    cluster_id: number;
    data_scope: "charge_type" | "criminal_fallback";
  }

  let bases: AuthorityBase[] = [];

  if (internalCharges.length > 0) {
    const { data: ctaRows } = await supabase
      .from("charge_type_top_authorities")
      .select(
        "charge_type, rank, cited_opinion_id, cluster_id, case_name, date_filed, citation_count_in_charge, citation_count_total, authority_tier_overall, source_url",
      )
      .in("charge_type", internalCharges)
      .order("citation_count_in_charge", { ascending: false })
      .limit(50);

    // Dedupe by cited_opinion_id (same precedent can appear under multiple
    // internal slugs, e.g. Smith v. United States under both drug-trafficking
    // and drug-distribution — keep the highest in-charge count).
    const seen = new Map<number, AuthorityBase>();
    for (const r of ctaRows ?? []) {
      const url = (r.source_url as string | null) ?? "";
      if (!url) continue;
      const oid = r.cited_opinion_id as number;
      const prev = seen.get(oid);
      const cur: AuthorityBase = {
        rank: 0,
        case_name: r.case_name as string,
        date_filed: (r.date_filed as string | null) ?? null,
        citation_count_in_charge: r.citation_count_in_charge as number | null,
        citation_count_total: r.citation_count_total as number,
        authority_tier: (r.authority_tier_overall as string | null) ?? null,
        source_url: url,
        cited_opinion_id: oid,
        cluster_id: r.cluster_id as number,
        data_scope: "charge_type",
      };
      if (!prev || (cur.citation_count_in_charge ?? 0) > (prev.citation_count_in_charge ?? 0)) {
        seen.set(oid, cur);
      }
    }
    bases = [...seen.values()]
      .sort((a, b) => (b.citation_count_in_charge ?? 0) - (a.citation_count_in_charge ?? 0))
      .slice(0, 10);
  }

  // --------- Step 2: fall back to citation_authority_criminal if needed ---------
  if (bases.length < 10) {
    const { data: caRows } = await supabase
      .from("citation_authority_criminal")
      .select("cited_opinion_id, cluster_id, case_name, date_filed, citation_count_criminal, citation_count_total, authority_tier, source_url")
      .order("citation_count_criminal", { ascending: false })
      .limit(30);
    const seen = new Set(bases.map((b) => b.cited_opinion_id));
    for (const r of caRows ?? []) {
      const url = (r.source_url as string | null) ?? "";
      if (!url) continue;
      const oid = r.cited_opinion_id as number;
      if (seen.has(oid)) continue;
      bases.push({
        rank: 0,
        case_name: r.case_name as string,
        date_filed: (r.date_filed as string | null) ?? null,
        citation_count_in_charge: r.citation_count_criminal as number | null,
        citation_count_total: r.citation_count_total as number,
        authority_tier: (r.authority_tier as string | null) ?? null,
        source_url: url,
        cited_opinion_id: oid,
        cluster_id: r.cluster_id as number,
        data_scope: "criminal_fallback",
      });
      seen.add(oid);
      if (bases.length >= 10) break;
    }
    if (internalCharges.length === 0 || bases.some((b) => b.data_scope === "criminal_fallback")) {
      limitations.push(
        `No charge-specific authorities cached for "${chargeType}"; showing top criminal-law authorities by citation frequency.`,
      );
    }
  }

  if (bases.length === 0) {
    return {
      chargeType,
      state,
      circuit,
      circuitName,
      rows: [],
      limitations,
      isEmpty: true,
    };
  }

  // --------- Step 3: enrich with quotes ---------
  const opinionIds = bases.map((b) => b.cited_opinion_id);
  const { data: quoteRows } = await supabase
    .from("authority_quotes_criminal")
    .select("cited_opinion_id, quote_sentence, primary_reporter, rank, quote_frequency")
    .in("cited_opinion_id", opinionIds)
    .order("rank", { ascending: true });
  const quoteByOid = new Map<number, { quote: string; citation: string | null }>();
  for (const r of quoteRows ?? []) {
    const oid = r.cited_opinion_id as number;
    if (quoteByOid.has(oid)) continue; // keep first (lowest rank)
    quoteByOid.set(oid, {
      quote: r.quote_sentence as string,
      citation: (r.primary_reporter as string | null) ?? null,
    });
  }

  // --------- Step 4: enrich with velocity ---------
  const { data: velRows } = await supabase
    .from("citation_velocity_criminal")
    .select("cited_opinion_id, velocity, velocity_tier, rising_flag")
    .in("cited_opinion_id", opinionIds);
  const velByOid = new Map<number, { velocity: number | null; tier: string | null; rising: boolean }>();
  for (const r of velRows ?? []) {
    const oid = r.cited_opinion_id as number;
    velByOid.set(oid, {
      velocity: r.velocity as number | null,
      tier: (r.velocity_tier as string | null) ?? null,
      rising: (r.rising_flag as boolean | null) ?? false,
    });
  }

  // --------- Step 5: assemble final rows ---------
  const rows: AuthorityPackRow[] = bases.map((b, i) => {
    const q = quoteByOid.get(b.cited_opinion_id);
    const v = velByOid.get(b.cited_opinion_id);
    return {
      rank: i + 1,
      case_name: b.case_name,
      date_filed: b.date_filed,
      citation: q?.citation ?? null,
      authority_tier: b.authority_tier,
      citation_count_in_charge: b.citation_count_in_charge,
      citation_count_total: b.citation_count_total,
      quote_sentence: q?.quote ?? null,
      velocity: v?.velocity ?? null,
      velocity_tier: v?.tier ?? null,
      rising_flag: v?.rising ?? false,
      source_url: b.source_url,
      data_scope: b.data_scope,
    };
  });

  // --------- Step N: TICKET-16 — surface drug-scheduling history ---------
  // Only fetched when the chargeType belongs to the drug family AND the caller
  // supplied a substanceSlug. Errors are swallowed into `limitations` so a
  // scheduling-fetch failure can never break the rest of the report.
  let drugSchedulingHistory: SchedulingHistory | null = null;
  if (isDrugChargeType(chargeType) && input.substanceSlug) {
    try {
      drugSchedulingHistory = await getDrugSchedulingHistoryWithClient(
        supabase as unknown as Parameters<typeof getDrugSchedulingHistoryWithClient>[0],
        input.substanceSlug,
      );
      if (drugSchedulingHistory.isEmpty && !drugSchedulingHistory.substance) {
        // Unknown substance — drop the block entirely (don't pollute report
        // with a stub) but record a non-blocking limitation for transparency.
        limitations.push(
          `Drug-scheduling history requested for unknown substance "${input.substanceSlug}" — block suppressed. Add it to the substance taxonomy to surface.`,
        );
        drugSchedulingHistory = null;
      }
    } catch (e) {
      limitations.push(
        `Drug-scheduling history fetch failed: ${(e as Error).message}`,
      );
      drugSchedulingHistory = null;
    }
  }

  return {
    chargeType,
    state,
    circuit,
    circuitName,
    rows,
    limitations,
    isEmpty: rows.length === 0,
    drugSchedulingHistory,
  };
}

/**
 * TICKET-16: chargeType slugs whose CAP report should include the drug-
 * scheduling history block when a substanceSlug is supplied.
 *
 * Conservative match — string prefix only, no fuzzy logic. New drug-related
 * charge types should be added explicitly.
 */
const DRUG_CHARGE_PREFIXES = [
  "drug-",
  "controlled-substance",
  "narcotic",
  "marijuana-",
  "cocaine-",
  "fentanyl-",
  "trafficking-drug",
];

function isDrugChargeType(chargeType: string): boolean {
  const t = chargeType.toLowerCase();
  return (
    t === "drug-possession" ||
    t === "drug-trafficking" ||
    t === "drug-distribution" ||
    DRUG_CHARGE_PREFIXES.some((p) => t.startsWith(p))
  );
}

export { isDrugChargeType };

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

function prettyChargeType(c: string): string {
  return c.replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function velocityArrow(row: AuthorityPackRow): string {
  // Rising flag wins (explicit upward signal from data pipeline).
  if (row.rising_flag) return '<span class="cap-arrow cap-up" aria-label="rising">&#9650;</span>';
  // Fading tier = clear downward trend.
  if ((row.velocity_tier ?? "").toLowerCase() === "fading") {
    return '<span class="cap-arrow cap-down" aria-label="fading">&#9660;</span>';
  }
  // Everything else (stable, emerging without rising_flag, null) = dash.
  return '<span class="cap-arrow cap-flat" aria-label="stable">&mdash;</span>';
}

export function renderChargeAuthorityPack(data: ChargeAuthorityPackData): string {
  const chargeLabel = htmlEscape(prettyChargeType(data.chargeType));
  const jurisdictionSuffix = data.circuitName
    ? ` · ${htmlEscape(data.circuitName)}${data.state ? ` (${htmlEscape(data.state)})` : ""}`
    : data.state
      ? ` · ${htmlEscape(data.state)}`
      : "";

  const header = `
    <header class="cap-header">
      <h1>Charge Authority Pack &mdash; ${chargeLabel}</h1>
      <p class="cap-subtitle">Top defense authorities cited in federal criminal opinions${jurisdictionSuffix}</p>
      <p class="cap-gate"><strong>This is legal INFORMATION, not legal ADVICE.</strong> Each row links to the primary opinion on CourtListener for independent verification. No row appears without a verification URL on file.</p>
    </header>
  `;

  const table =
    data.rows.length > 0
      ? `
    <section class="cap-section">
      <h2>Top 10 Must-Cite Authorities for ${chargeLabel}</h2>
      <p class="cap-intro">
        Ranked by citation frequency in ${chargeLabel} opinions${data.rows.some((r) => r.data_scope === "criminal_fallback") ? " (with national criminal fallback when charge-specific data is sparse)" : ""}.
        Arrows reflect 3-year citation velocity in our federal criminal corpus.
      </p>
      <table class="cap-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Case</th>
            <th>Citation</th>
            <th>Tier</th>
            <th>Cites (charge / total)</th>
            <th>Velocity</th>
            <th>Quote</th>
          </tr>
        </thead>
        <tbody>
          ${data.rows
            .map(
              (r) => `
            <tr>
              <td>${r.rank}</td>
              <td>
                <a href="${htmlEscape(r.source_url)}" target="_blank" rel="noopener">${htmlEscape(r.case_name)}</a>
                ${r.date_filed ? `<span class="cap-date">(${htmlEscape(String(r.date_filed).slice(0, 4))})</span>` : ""}
              </td>
              <td>${r.citation ? htmlEscape(r.citation) : ""}</td>
              <td>${htmlEscape(r.authority_tier ?? "")}</td>
              <td>${r.citation_count_in_charge ?? ""} / ${r.citation_count_total}</td>
              <td>${velocityArrow(r)}</td>
              <td class="cap-quote">${r.quote_sentence ? htmlEscape(r.quote_sentence) : '<span class="cap-small">no canonical quote cached</span>'}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
      <p class="cap-scope">Source: charge_type_top_authorities${data.rows.some((r) => r.data_scope === "criminal_fallback") ? " + citation_authority_criminal fallback" : ""}; enriched with authority_quotes_criminal + citation_velocity_criminal. Every row has a CourtListener verification URL on file; rows without URLs are suppressed.</p>
    </section>`
      : "";

  const limitations = data.limitations.length
    ? `<aside class="cap-limits"><h3>Known limitations</h3><ul>${data.limitations.map((l) => `<li>${htmlEscape(l)}</li>`).join("")}</ul></aside>`
    : "";

  const disclaimer = `
    <footer class="cap-footer">
      <h3>Methodology</h3>
      <p>This report provides legal INFORMATION &mdash; not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied specifically to your case details. Your attorney remains the final authority on strategy decisions.</p>
      <p>Authorities are ranked by citation frequency in our federal criminal corpus as of 2026-04-22. Canonical quotes are extracted from how citing courts actually reference the case &mdash; not from the opinion itself &mdash; so they reflect the proposition the case is cited for. Velocity arrows compare the last 3 years against the prior 10. Every row links to the primary opinion on CourtListener for independent verification.</p>
      <p>No part of this report is a prediction. It is a map of what is already in the record.</p>
    </footer>
  `;

  const styles = `
    <style>
      .charge-authority-pack { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 1020px; margin: 2em auto; padding: 1em; color: #111; }
      .charge-authority-pack h1 { font-size: 1.6em; margin: 0 0 0.25em; }
      .charge-authority-pack .cap-subtitle { color: #555; margin: 0 0 1em; font-style: italic; }
      .charge-authority-pack .cap-gate { background: #fff8e1; border-left: 4px solid #f9a825; padding: 0.75em 1em; margin: 0 0 1.5em; }
      .charge-authority-pack .cap-section { margin: 2em 0; }
      .charge-authority-pack .cap-section h2 { font-size: 1.2em; margin: 0 0 0.5em; border-bottom: 1px solid #e0e0e0; padding-bottom: 0.25em; }
      .charge-authority-pack .cap-intro { color: #555; margin: 0.25em 0 0.75em; }
      .charge-authority-pack .cap-table { width: 100%; border-collapse: collapse; margin: 0.5em 0; font-size: 0.9em; }
      .charge-authority-pack .cap-table th, .charge-authority-pack .cap-table td { text-align: left; padding: 0.45em 0.7em; border-bottom: 1px solid #e8e8e8; vertical-align: top; }
      .charge-authority-pack .cap-table th { background: #f5f5f5; font-weight: 600; }
      .charge-authority-pack .cap-date { color: #777; font-size: 0.85em; margin-left: 4px; }
      .charge-authority-pack .cap-quote { font-style: italic; color: #333; max-width: 32em; }
      .charge-authority-pack .cap-small { color: #999; font-style: italic; font-size: 0.9em; }
      .charge-authority-pack .cap-arrow { font-weight: bold; font-size: 1.1em; }
      .charge-authority-pack .cap-up { color: #1b5e20; }
      .charge-authority-pack .cap-down { color: #b71c1c; }
      .charge-authority-pack .cap-flat { color: #777; }
      .charge-authority-pack .cap-scope { color: #777; font-size: 0.82em; margin-top: 0.5em; }
      .charge-authority-pack .cap-limits { margin-top: 1.5em; padding: 0.75em 1em; background: #f0f4f8; border-left: 3px solid #4a6fa5; font-size: 0.9em; }
      .charge-authority-pack .cap-footer { margin-top: 2em; padding-top: 1em; border-top: 2px solid #333; color: #555; font-size: 0.9em; }
    </style>
  `;

  // TICKET-16: render drug-scheduling history block when present.
  // Slotted between the authorities table and the limitations aside so the
  // most surprising facts (recent rule changes) sit in mid-report attention.
  const schedulingBlock = data.drugSchedulingHistory
    ? renderDrugSchedulingHistory(data.drugSchedulingHistory)
    : "";

  return `
    ${styles}
    <section class="charge-authority-pack">
      ${header}
      ${table}
      ${schedulingBlock}
      ${limitations}
      ${disclaimer}
    </section>
  `;
}

// ============================================================
// UPL phrase blocklist — re-exported from the canonical source
// ============================================================
// Consolidated 2026-04-23 per Round 1 wave-pristine (WARNING #3). Local
// copy removed; canonical list lives in `@/lib/charge-slug-maps`. Re-export
// preserves the public API for existing test imports.
export { UPL_BANNED_PHRASES, scanForUplPhrases } from "@/lib/charge-slug-maps";
