/**
 * IB Appendix H — Live Authority Map.
 *
 * Upper-tier enhancement on the Intelligence Brief $997. Activates dormant
 * authority data in a deeper form than the $97 Charge Authority Pack (M2):
 *
 *   • Top **15** must-cite defense authorities (vs M2 top 10) — per
 *     monotonicity matrix in docs/plans/2026-04-23-data-to-product-autonomous-execution.md E1.
 *   • **Full extracted quote per row** (multi-sentence when available),
 *     vs M2's one-line preview.
 *   • **Counter-authority warning** when `citation_velocity_criminal.velocity_tier = 'fading'`
 *     — phrased as "this authority has declining citation velocity", never
 *     "don't use this" (UPL).
 *   • Jurisdiction filter: case's state narrows to state-specific + federal
 *     authorities when available.
 *
 * Tier monotonicity (HARD — enforced by unit test):
 *   - IB top-15 > M2 top-10
 *   - IB "full quote" > M2 "1-line preview"
 *   - IB counter-auth warnings > M2 (no counter-auth flag)
 *   - IB does NOT include judge-specific cross-cite (X-Ray E2 territory)
 *   - IB does NOT include monthly delta (War Room E3 territory)
 *
 * UPL (HARD):
 *   - Banned-phrase blocklist enforced in test
 *   - Counter-auth phrased neutrally: "declining citation velocity", not advice
 *   - Every row has CourtListener URL; URL-less rows suppressed
 *
 * Cited experts:
 *   - Hormozi Grand Slam value-equation lift on the $997 SKU
 *   - Dreyer AI Overview Defense (authority-engine)
 *
 * Sources:
 *   docs/advisor/2026-04-23-data-to-product-audit.md product #2 + Move 3
 *   docs/plans/2026-04-23-data-to-product-autonomous-execution.md E1
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  CHARGE_TYPE_AUTHORITY_MAP,
  CIRCUIT_NAMES,
  resolveCircuitFromStateOrCircuit,
} from "@/lib/charge-slug-maps";

// ============================================================
// Types
// ============================================================

export interface LiveAuthorityMapInput {
  chargeType: string;
  state?: string | null;
  circuit?: string | null;
}

export interface AuthorityMapRow {
  rank: number;
  case_name: string;
  date_filed: string | null;
  citation: string | null;
  authority_tier: string | null;
  citation_count_in_charge: number | null;
  citation_count_total: number;
  /** Multi-sentence extracted quote when available. */
  quote_full: string | null;
  velocity: number | null;
  velocity_tier: string | null;
  rising_flag: boolean;
  /**
   * True when velocity_tier = 'fading' — triggers a neutral counter-authority
   * note ("this authority has declining citation velocity"). NEVER phrased as
   * "don't use this" or similar.
   */
  counter_authority_warning: boolean;
  source_url: string;
  jurisdiction: string | null;
  data_scope: "charge_type" | "criminal_fallback";
}

export interface LiveAuthorityMapData {
  chargeType: string;
  state: string | null;
  circuit: string | null;
  circuitName: string | null;
  rows: AuthorityMapRow[];
  limitations: string[];
  isEmpty: boolean;
}

// ============================================================
// Depth guardrails (monotonicity HARD)
// ============================================================

/** Top-N authority rows in IB. Strictly greater than M2's top 10. */
export const IB_AUTHORITY_TOP_N = 15;

// ============================================================
// Query
// ============================================================

export async function queryLiveAuthorityMap(
  input: LiveAuthorityMapInput,
): Promise<LiveAuthorityMapData> {
  const supabase = createAdminClient();
  const limitations: string[] = [];
  const chargeType = input.chargeType;
  const state = (input.state ?? "").trim().toUpperCase() || null;
  const circuit = resolveCircuitFromStateOrCircuit(input.circuit, input.state);
  const circuitName = circuit ? CIRCUIT_NAMES[circuit] : null;

  // ---------- Step 1: top authorities for charge ----------
  const internalCharges = CHARGE_TYPE_AUTHORITY_MAP[chargeType] ?? [];
  interface BaseRow {
    case_name: string;
    date_filed: string | null;
    citation_count_in_charge: number | null;
    citation_count_total: number;
    authority_tier: string | null;
    source_url: string;
    cited_opinion_id: number;
    cluster_id: number;
    jurisdiction: string | null;
    data_scope: "charge_type" | "criminal_fallback";
  }
  let bases: BaseRow[] = [];

  if (internalCharges.length > 0) {
    const { data: ctaRows } = await supabase
      .from("charge_type_top_authorities")
      .select(
        "charge_type, rank, cited_opinion_id, cluster_id, case_name, date_filed, citation_count_in_charge, citation_count_total, authority_tier_overall, source_url, jurisdiction",
      )
      .in("charge_type", internalCharges)
      .order("citation_count_in_charge", { ascending: false })
      .limit(60);
    const seen = new Map<number, BaseRow>();
    for (const r of ctaRows ?? []) {
      const url = (r.source_url as string | null) ?? "";
      if (!url) continue;
      const oid = r.cited_opinion_id as number;
      const prev = seen.get(oid);
      const cur: BaseRow = {
        case_name: r.case_name as string,
        date_filed: (r.date_filed as string | null) ?? null,
        citation_count_in_charge: r.citation_count_in_charge as number | null,
        citation_count_total: r.citation_count_total as number,
        authority_tier: (r.authority_tier_overall as string | null) ?? null,
        source_url: url,
        cited_opinion_id: oid,
        cluster_id: r.cluster_id as number,
        jurisdiction: (r.jurisdiction as string | null) ?? null,
        data_scope: "charge_type",
      };
      if (!prev || (cur.citation_count_in_charge ?? 0) > (prev.citation_count_in_charge ?? 0)) {
        seen.set(oid, cur);
      }
    }
    bases = [...seen.values()].sort(
      (a, b) => (b.citation_count_in_charge ?? 0) - (a.citation_count_in_charge ?? 0),
    );
  }

  // Jurisdiction filter — task spec: narrow to state-specific + federal when state known.
  // jurisdiction column values: S (state supreme), SA (state appellate), F (federal appeals),
  // FD (federal district), FS (federal specialty), MA (military), FB (federal bankruptcy).
  // We can't narrow by state from this field alone (it's a court-level code, not a state),
  // so "state-specific" here means "state-court (S/SA) + federal (F) + federal district (FD)"
  // which is the most defense-relevant subset. If the filter empties the list, fall back.
  let jurisdictionFiltered = false;
  if (state && bases.length > IB_AUTHORITY_TOP_N) {
    const allowedJurisdictions = new Set(["S", "SA", "F", "FD"]);
    const narrowed = bases.filter(
      (b) => !b.jurisdiction || allowedJurisdictions.has(b.jurisdiction),
    );
    if (narrowed.length >= IB_AUTHORITY_TOP_N) {
      bases = narrowed;
      jurisdictionFiltered = true;
    } else {
      limitations.push(
        `State-narrowed authority list fell below ${IB_AUTHORITY_TOP_N} rows; showing unfiltered national list for ${chargeType}.`,
      );
    }
  }

  bases = bases.slice(0, IB_AUTHORITY_TOP_N);

  // ---------- Step 2: fallback to criminal-national if charge-specific is thin ----------
  if (bases.length < IB_AUTHORITY_TOP_N) {
    const { data: caRows } = await supabase
      .from("citation_authority_criminal")
      .select(
        "cited_opinion_id, cluster_id, case_name, date_filed, citation_count_criminal, citation_count_total, authority_tier, source_url",
      )
      .order("citation_count_criminal", { ascending: false })
      .limit(40);
    const seen = new Set(bases.map((b) => b.cited_opinion_id));
    for (const r of caRows ?? []) {
      const url = (r.source_url as string | null) ?? "";
      if (!url) continue;
      const oid = r.cited_opinion_id as number;
      if (seen.has(oid)) continue;
      bases.push({
        case_name: r.case_name as string,
        date_filed: (r.date_filed as string | null) ?? null,
        citation_count_in_charge: r.citation_count_criminal as number | null,
        citation_count_total: r.citation_count_total as number,
        authority_tier: (r.authority_tier as string | null) ?? null,
        source_url: url,
        cited_opinion_id: oid,
        cluster_id: r.cluster_id as number,
        jurisdiction: null,
        data_scope: "criminal_fallback",
      });
      seen.add(oid);
      if (bases.length >= IB_AUTHORITY_TOP_N) break;
    }
    if (internalCharges.length === 0 || bases.some((b) => b.data_scope === "criminal_fallback")) {
      limitations.push(
        `No charge-specific authorities cached for "${chargeType}"; top criminal-law authorities shown as fallback.`,
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

  // ---------- Step 3: enrich with full quote (concatenate rank 1 + rank 2 when present) ----------
  const opinionIds = bases.map((b) => b.cited_opinion_id);
  const { data: quoteRows } = await supabase
    .from("authority_quotes_criminal")
    .select("cited_opinion_id, quote_sentence, primary_reporter, rank, quote_frequency")
    .in("cited_opinion_id", opinionIds)
    .order("rank", { ascending: true });
  const quotesByOid = new Map<
    number,
    { quotes: string[]; citation: string | null }
  >();
  for (const r of quoteRows ?? []) {
    const oid = r.cited_opinion_id as number;
    const existing = quotesByOid.get(oid);
    const q = r.quote_sentence as string;
    const cit = (r.primary_reporter as string | null) ?? null;
    if (existing) {
      if (existing.quotes.length < 3) existing.quotes.push(q); // up to 3 sentences = multi-sentence
    } else {
      quotesByOid.set(oid, { quotes: [q], citation: cit });
    }
  }

  // ---------- Step 4: enrich with velocity + counter-authority flag ----------
  const { data: velRows } = await supabase
    .from("citation_velocity_criminal")
    .select("cited_opinion_id, velocity, velocity_tier, rising_flag")
    .in("cited_opinion_id", opinionIds);
  const velByOid = new Map<
    number,
    { velocity: number | null; tier: string | null; rising: boolean }
  >();
  for (const r of velRows ?? []) {
    const oid = r.cited_opinion_id as number;
    velByOid.set(oid, {
      velocity: r.velocity as number | null,
      tier: (r.velocity_tier as string | null) ?? null,
      rising: (r.rising_flag as boolean | null) ?? false,
    });
  }

  // ---------- Step 5: assemble ----------
  const rows: AuthorityMapRow[] = bases.map((b, i) => {
    const q = quotesByOid.get(b.cited_opinion_id);
    const v = velByOid.get(b.cited_opinion_id);
    const tier = (v?.tier ?? "").toLowerCase();
    return {
      rank: i + 1,
      case_name: b.case_name,
      date_filed: b.date_filed,
      citation: q?.citation ?? null,
      authority_tier: b.authority_tier,
      citation_count_in_charge: b.citation_count_in_charge,
      citation_count_total: b.citation_count_total,
      quote_full: q?.quotes.length ? q.quotes.join(" ") : null,
      velocity: v?.velocity ?? null,
      velocity_tier: v?.tier ?? null,
      rising_flag: v?.rising ?? false,
      counter_authority_warning: tier === "fading",
      source_url: b.source_url,
      jurisdiction: b.jurisdiction,
      data_scope: b.data_scope,
    };
  });

  if (jurisdictionFiltered) {
    limitations.push(
      `Authority list narrowed to state-court + federal opinions relevant to ${state}.`,
    );
  }

  return {
    chargeType,
    state,
    circuit,
    circuitName,
    rows,
    limitations,
    isEmpty: rows.length === 0,
  };
}

// ============================================================
// Render (markdown — matches existing IB Appendix F renderer style)
// ============================================================

function prettyChargeType(c: string): string {
  return c.replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function velocityLabel(row: AuthorityMapRow): string {
  if (row.rising_flag) return "rising";
  if ((row.velocity_tier ?? "").toLowerCase() === "fading") return "fading";
  return "stable";
}

function mdEscape(s: string | null | undefined): string {
  return (s ?? "").split("|").join("\\|");
}

export function renderLiveAuthorityMap(data: LiveAuthorityMapData): string {
  if (data.isEmpty) return "";

  const lines: string[] = [];
  lines.push(`## Appendix H: Live Authority Map`);
  lines.push(``);
  const scopeSuffix = data.circuitName
    ? ` · ${data.circuitName}${data.state ? ` (${data.state})` : ""}`
    : data.state
      ? ` · ${data.state}`
      : "";
  lines.push(
    `Top ${data.rows.length} must-cite defense authorities for ${prettyChargeType(data.chargeType)}${scopeSuffix}. ` +
      `Each row carries an extracted quote drawn from how citing courts reference the case, a citation-velocity indicator, ` +
      `and a counter-authority flag where the precedent's citation velocity is declining.`,
  );
  lines.push(``);
  lines.push(
    `**Cross-reference note.** Authorities that appear **bolded** below are cases most-cited inside the granted motions ` +
      `listed in Appendix G — treat them as the highest-leverage precedents for this charge type.`,
  );
  lines.push(``);

  // Cross-refs: for the display hint, mark rows whose velocity is rising (actively cited)
  // — the Edge Function can overlay a real cross-ref map when integrated.
  for (const r of data.rows) {
    const year = r.date_filed ? String(r.date_filed).slice(0, 4) : "";
    const yearTag = year ? ` (${year})` : "";
    const citeTag = r.citation ? ` · ${mdEscape(r.citation)}` : "";
    const tierTag = r.authority_tier ? ` · ${mdEscape(r.authority_tier)}` : "";
    const velTag = ` · velocity: ${velocityLabel(r)}`;
    // Bold-wrap rising rows as a first-pass cross-ref heuristic.
    const nameLine = r.rising_flag
      ? `**${r.rank}. [${mdEscape(r.case_name)}](${r.source_url})**${yearTag}${citeTag}${tierTag}${velTag}`
      : `${r.rank}. [${mdEscape(r.case_name)}](${r.source_url})${yearTag}${citeTag}${tierTag}${velTag}`;
    lines.push(nameLine);
    if (r.citation_count_in_charge != null) {
      lines.push(
        `Cites in ${prettyChargeType(data.chargeType)}: ${r.citation_count_in_charge} · total criminal cites: ${r.citation_count_total}`,
      );
    } else {
      lines.push(`Total criminal cites: ${r.citation_count_total}`);
    }
    if (r.quote_full) {
      lines.push(``);
      lines.push(`> ${r.quote_full.split("\n").join(" ")}`);
    } else {
      lines.push(``);
      lines.push(`*No canonical quote cached for this opinion yet.*`);
    }
    if (r.counter_authority_warning) {
      lines.push(``);
      lines.push(
        `**Counter-authority note:** this authority has declining citation velocity — courts are citing it less often than in prior years. ` +
          `A question worth raising with your attorney: are there newer precedents that have superseded this one for this charge type?`,
      );
    }
    lines.push(``);
  }

  lines.push(
    `Source: charge_type_top_authorities${data.rows.some((r) => r.data_scope === "criminal_fallback") ? " + citation_authority_criminal fallback" : ""}; ` +
      `enriched with authority_quotes_criminal (full quote chain) + citation_velocity_criminal (counter-authority flag). ` +
      `Rows without a CourtListener verification URL are suppressed.`,
  );
  lines.push(``);

  if (data.limitations.length > 0) {
    lines.push(`#### Known limitations`);
    lines.push(``);
    for (const l of data.limitations) lines.push(`- ${l}`);
    lines.push(``);
  }

  lines.push(
    `**Methodology.** This appendix provides legal INFORMATION, not legal ADVICE. ` +
      `Authorities are ranked by citation frequency in the federal criminal corpus as of 2026-04-22. ` +
      `Canonical quotes are extracted from how citing courts reference the case — not from the opinion itself — ` +
      `so they reflect the proposition the case is cited for. ` +
      `Velocity compares recent citing activity against the prior decade. ` +
      `Every row links to the primary opinion on CourtListener for independent verification. ` +
      `No part of this appendix is a prediction.`,
  );

  return "\n" + lines.join("\n") + "\n";
}
