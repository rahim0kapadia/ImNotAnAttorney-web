/**
 * Playbook Circuit Addendum — E4 (Path A).
 *
 * Converts the 8 static $127/$147 Defense Playbooks into living documents
 * by attaching a post-purchase, circuit-aware addendum page showing:
 *   Section 1 — Top 5 motion grant rates for this playbook's charge in the
 *               buyer's federal circuit (sourced from motion_outcome_rates +
 *               motion_outcome_rates_by_circuit)
 *   Section 2 — Top 5 must-cite authorities for this charge (sourced from
 *               charge_type_top_authorities with citation_authority_criminal
 *               fallback; quote-enriched where cached; rank-only otherwise)
 *
 * Tier monotonicity (HARD — enforced at render + test time):
 *   - Top 5 motions MAX (M1 $197 shows 10)
 *   - NO judge-specific column (M1 territory)
 *   - Top 5 authorities MAX (M2 $97 shows 10)
 *   - Rank-only fallback when quote is missing (M2 has the full quote column
 *     with richer presentation)
 *   - Upgrade CTA explicit — never cannibalize M1/M2
 *
 * UPL (HARD):
 *   - Banned-phrase blocklist enforced at render layer
 *   - Every authority row MUST have source_url; rows without URL are SUPPRESSED
 *     (ARCHITECTURE.md invariant #13 — verification-URL HARD rule for legal data)
 *   - Every % has its N inline; N < 10 shown as "insufficient data"
 *
 * Architectural invariants honored:
 *   - #4 service-role only DB access (createAdminClient, server-side only)
 *   - #6 input allowlisting (playbookSlug routed through PLAYBOOK_SLUG_TO_CHARGE)
 *   - #13 verification-URL HARD rule (rows without source_url suppressed)
 *
 * Cited experts:
 *   - Godin (tribal identity — "your circuit" vs generic "federal system")
 *   - Hormozi (value equation lift — converts static SKU to living artifact
 *     at zero marginal COGS, raising perceived value without raising price)
 *   - Firestone (default-alive — zero marginal cost path)
 *
 * Source:
 *   docs/plans/2026-04-23-data-to-product-autonomous-execution.md E4.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  type CapitalContext,
  type CapitalEligibleChargeClass,
  getCapitalContext,
  playbookSlugSupportsCapitalSidebar,
  queryCapitalExecutionStats,
} from "@/lib/dpic/capital-context";

// ============================================================
// Types
// ============================================================

export interface PlaybookAddendumInput {
  playbookSlug: string;      // one of PLAYBOOK_SLUGS
  state?: string | null;     // 2-letter postal (used to derive circuit)
  circuit?: string | null;   // "1".."11", "DC" (explicit override)
  /**
   * Optional capital-eligible charge class extracted from the buyer's
   * actual charge slug. When supplied AND the playbook is in
   * CAPITAL_SIDEBAR_PLAYBOOK_SLUGS (sex-offense / federal-criminal), the
   * addendum attaches a capital-context sidebar (TICKET-19). When omitted
   * OR ineligible, NO sidebar renders.
   */
  capitalChargeClass?: CapitalEligibleChargeClass | null;
}

export interface AddendumMotionRow {
  motion_type: string;
  filed_count: number;
  granted_count: number;
  denied_count: number;
  grant_rate: number | null;
  baseline_grant_rate: number | null;
  deviation_from_baseline: number | null;
  data_scope: "charge_circuit" | "charge_national" | "all_national";
}

export interface AddendumAuthorityRow {
  rank: number;
  case_name: string;
  date_filed: string | null;
  citation: string | null;
  citation_count_in_charge: number | null;
  citation_count_total: number;
  authority_tier: string | null;
  quote_sentence: string | null;   // null => rank-only fallback
  velocity_tier: string | null;
  rising_flag: boolean;
  source_url: string;
  data_scope: "charge_type" | "criminal_fallback";
}

export interface PlaybookAddendumData {
  playbookSlug: string;
  playbookDisplayName: string;
  chargeType: string;
  chargeDisplayName: string;
  state: string | null;
  circuit: string | null;
  circuitName: string | null;
  motions: AddendumMotionRow[];
  authorities: AddendumAuthorityRow[];
  quoteCoverageNote: string | null;   // shown when < all authorities have quotes
  limitations: string[];
  isEmpty: boolean;
  /**
   * Capital-adjacency context (TICKET-19). null when the playbook is not
   * in CAPITAL_SIDEBAR_PLAYBOOK_SLUGS, or when capitalChargeClass was not
   * supplied, or when the charge/state combination is not capital-eligible.
   * Render layer skips the sidebar entirely on null OR ctx.eligible=false.
   */
  capitalContext: CapitalContext | null;
}

// ============================================================
// Playbook slug → charge-type routing
// ============================================================
//
// Bridges the 8 customer-facing playbook slugs (PLAYBOOK_SLUGS in tiers.ts)
// to the internal charge slugs used by motion_outcome_rates +
// charge_type_top_authorities.
//
// Aligned with CHARGE_TYPE_MOR_MAP from feat/motion-success-report-197 and
// CHARGE_TYPE_AUTHORITY_MAP from feat/charge-authority-pack-97. Duplicated
// here rather than imported to avoid coupling to unmerged branches.

export const PLAYBOOK_SLUG_TO_CHARGE: Record<string, string> = {
  "dui-first-offense": "dui",
  "drug-possession": "drug-possession",
  "probation-violation": "probation-violation",
  "white-collar": "white-collar",
  "sex-offense": "sex-offense",
  "federal-criminal": "federal",
  "drug-trafficking": "drug-trafficking",
  "self-defense": "self-defense",
};

// Internal charge slugs for motion_outcome_rates. Mirrors CHARGE_TYPE_MOR_MAP.
const CHARGE_TYPE_MOR_MAP: Record<string, string[]> = {
  "drug-possession": [
    "drug-possession",
    "drug-possession-marijuana",
    "drug-possession-cocaine",
    "drug-possession-meth",
    "drug-possession-opioids",
    "drug-possession-prescription",
    "drug-possession-with-intent",
  ],
  "drug-trafficking": ["drug-trafficking", "drug-distribution", "drug-manufacturing"],
  dui: [
    "dui",
    "dui-dwi",
    "dui-first-offense",
    "dui-repeat-offense",
    "dui-third-offense",
    "dui-drugs",
    "dui-felony-injury",
  ],
  "sex-offense": [
    "sex-offense",
    "sex-offense-contact",
    "sex-offense-digital",
    "sexual-assault",
    "sexual-battery",
    "rape",
    "statutory-rape",
    "indecent-exposure",
  ],
  "white-collar": [
    "fraud-general",
    "wire-fraud",
    "securities-fraud",
    "tax-fraud",
    "insurance-fraud",
    "credit-card-fraud",
    "prescription-fraud",
    "money-laundering",
    "embezzlement",
    "identity-theft",
    "forgery",
    "bad-checks",
  ],
  federal: [],
  "probation-violation": [
    "probation-violation-technical",
    "probation-violation-substantive",
    "parole-violation",
    "community-control-violation",
    "supervised-release-violation",
  ],
  "self-defense": [],
};

// Internal charge slugs for charge_type_top_authorities.
const CHARGE_TYPE_AUTHORITY_MAP: Record<string, string[]> = {
  "drug-possession": [
    "drug-possession-marijuana",
    "drug-possession-cocaine",
    "drug-possession-opioids",
    "drug-possession-prescription",
  ],
  "drug-trafficking": ["drug-trafficking", "drug-distribution", "drug-manufacturing"],
  dui: ["dui-dwi", "dui-drugs", "dui-felony-injury", "refusing-breath-test"],
  "sex-offense": [
    "sex-offense-contact",
    "sex-offense-digital",
    "sexual-assault",
    "indecent-exposure",
  ],
  "white-collar": ["fraud-general", "embezzlement", "forgery"],
  federal: [],
  "probation-violation": ["supervised-release-violation"],
  "self-defense": [],
};

// ============================================================
// State → circuit mapping
// ============================================================

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

const PLAYBOOK_DISPLAY_NAMES: Record<string, string> = {
  "dui-first-offense": "DUI Defense Playbook",
  "drug-possession": "Drug Possession Playbook",
  "probation-violation": "Probation Violation Playbook",
  "white-collar": "White Collar Defense Playbook",
  "sex-offense": "Sex Offense Defense Playbook",
  "federal-criminal": "Federal Criminal Playbook",
  "drug-trafficking": "Drug Trafficking Defense Playbook",
  "self-defense": "Self-Defense Playbook",
};

function resolveCircuit(input: PlaybookAddendumInput): string | null {
  const raw = (input.circuit ?? "").trim();
  if (raw && VALID_CIRCUITS.has(raw)) return raw;
  const state = (input.state ?? "").trim().toUpperCase();
  if (state && STATE_TO_CIRCUIT[state]) return STATE_TO_CIRCUIT[state];
  return null;
}

function prettyChargeType(c: string): string {
  return c.replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

// ============================================================
// Monotonicity constants (exported for tests)
// ============================================================

/** Addendum stays below M1 ($197) which shows 10 — we show at most 5. */
export const MAX_MOTIONS = 5;

/** Addendum stays below M2 ($97) which shows 10 — we show at most 5. */
export const MAX_AUTHORITIES = 5;

/** Minimum sample size for grant-rate display (mirrors M1 MIN_N). */
export const MIN_N = 10;

// ============================================================
// Query
// ============================================================

export async function queryPlaybookAddendum(
  input: PlaybookAddendumInput,
): Promise<PlaybookAddendumData> {
  const supabase = createAdminClient();
  const limitations: string[] = [];

  const playbookSlug = input.playbookSlug;
  const playbookDisplayName =
    PLAYBOOK_DISPLAY_NAMES[playbookSlug] ?? prettyChargeType(playbookSlug);

  const chargeType = PLAYBOOK_SLUG_TO_CHARGE[playbookSlug];
  if (!chargeType) {
    return {
      playbookSlug,
      playbookDisplayName,
      chargeType: "(unknown)",
      chargeDisplayName: playbookDisplayName,
      state: input.state ?? null,
      circuit: null,
      circuitName: null,
      motions: [],
      authorities: [],
      quoteCoverageNote: null,
      limitations: [`Playbook slug "${playbookSlug}" is not mapped to a charge type.`],
      isEmpty: true,
      capitalContext: null,
    };
  }

  const chargeDisplayName = prettyChargeType(chargeType);
  const state = (input.state ?? "").trim().toUpperCase() || null;
  const circuit = resolveCircuit(input);
  const circuitName = circuit ? CIRCUIT_NAMES[circuit] : null;

  if (!circuit && (input.state || input.circuit)) {
    limitations.push(
      "Could not resolve a federal circuit from the state provided; addendum uses national baseline only.",
    );
  } else if (!circuit) {
    limitations.push(
      "No state provided; addendum uses national baseline only. For circuit-specific numbers, add your state.",
    );
  }

  // ---------- Section 1: motion patterns (top-5) ----------
  const internalCharges = CHARGE_TYPE_MOR_MAP[chargeType] ?? [];
  let motions: AddendumMotionRow[] = [];
  let dataScope: AddendumMotionRow["data_scope"] = "all_national";

  if (internalCharges.length > 0) {
    const { data: chargeRows } = await supabase
      .from("motion_outcome_rates")
      .select("motion_type, filed_count, granted_count, denied_count, grant_rate")
      .in("charge_type", internalCharges)
      .order("filed_count", { ascending: false });

    const agg = new Map<string, { filed: number; granted: number; denied: number }>();
    for (const row of chargeRows ?? []) {
      const cur = agg.get(row.motion_type) ?? { filed: 0, granted: 0, denied: 0 };
      cur.filed += row.filed_count ?? 0;
      cur.granted += row.granted_count ?? 0;
      cur.denied += row.denied_count ?? 0;
      agg.set(row.motion_type, cur);
    }

    if (agg.size > 0) {
      motions = [...agg.entries()]
        .map(([motion_type, v]) => ({
          motion_type,
          filed_count: v.filed,
          granted_count: v.granted,
          denied_count: v.denied,
          grant_rate: v.filed > 0 ? v.granted / v.filed : null,
          baseline_grant_rate: null,
          deviation_from_baseline: null,
          data_scope: "charge_national" as const,
        }))
        .sort((a, b) => b.filed_count - a.filed_count)
        .slice(0, MAX_MOTIONS); // HARD: top-5 cap (monotonicity vs M1)
      dataScope = "charge_national";
    }
  }

  if (motions.length === 0) {
    const { data: allRows } = await supabase
      .from("motion_outcome_rates")
      .select("motion_type, filed_count, granted_count, denied_count, grant_rate")
      .eq("charge_type", "(all)")
      .order("filed_count", { ascending: false })
      .limit(MAX_MOTIONS);
    motions = (allRows ?? []).slice(0, MAX_MOTIONS).map((r) => ({
      motion_type: r.motion_type as string,
      filed_count: r.filed_count as number,
      granted_count: r.granted_count as number,
      denied_count: r.denied_count as number,
      grant_rate: r.grant_rate as number | null,
      baseline_grant_rate: null,
      deviation_from_baseline: null,
      data_scope: "all_national" as const,
    }));
    dataScope = "all_national";
    if (internalCharges.length === 0) {
      limitations.push(
        `No charge-specific motion data for "${chargeType}"; showing national baseline across all criminal motions.`,
      );
    }
  }

  const { data: nationalAll } = await supabase
    .from("motion_outcome_rates")
    .select("motion_type, grant_rate")
    .eq("charge_type", "(all)");
  const nationalBaseline = new Map<string, number | null>();
  for (const r of nationalAll ?? []) {
    nationalBaseline.set(r.motion_type as string, r.grant_rate as number | null);
  }

  const circuitBaseline = new Map<string, number | null>();
  if (circuit) {
    const { data: circRows } = await supabase
      .from("motion_outcome_rates_by_circuit")
      .select("motion_type, grant_rate")
      .eq("circuit", circuit)
      .eq("charge_type", "(all)");
    for (const r of circRows ?? []) {
      circuitBaseline.set(r.motion_type as string, r.grant_rate as number | null);
    }
    if (circuitBaseline.size === 0) {
      limitations.push(
        `No circuit-specific motion baseline for "${circuitName ?? circuit}"; national baseline used.`,
      );
    }
  }

  motions = motions.map((m) => {
    const circ = circuitBaseline.get(m.motion_type) ?? null;
    const nat = nationalBaseline.get(m.motion_type) ?? null;
    const baseline = circ ?? nat;
    const deviation =
      m.grant_rate !== null && baseline !== null ? m.grant_rate - baseline : null;
    return {
      ...m,
      baseline_grant_rate: baseline,
      deviation_from_baseline: deviation,
      data_scope: dataScope,
    };
  });

  // HARD: enforce cap defensively
  motions = motions.slice(0, MAX_MOTIONS);

  // ---------- Section 2: authorities (top-5) ----------
  interface AuthBase {
    rank: number;
    case_name: string;
    date_filed: string | null;
    citation_count_in_charge: number | null;
    citation_count_total: number;
    authority_tier: string | null;
    source_url: string;
    cited_opinion_id: number;
    data_scope: "charge_type" | "criminal_fallback";
  }

  const internalAuthCharges = CHARGE_TYPE_AUTHORITY_MAP[chargeType] ?? [];
  let bases: AuthBase[] = [];

  if (internalAuthCharges.length > 0) {
    const { data: ctaRows } = await supabase
      .from("charge_type_top_authorities")
      .select(
        "charge_type, rank, cited_opinion_id, case_name, date_filed, citation_count_in_charge, citation_count_total, authority_tier_overall, source_url",
      )
      .in("charge_type", internalAuthCharges)
      .order("citation_count_in_charge", { ascending: false })
      .limit(30);

    const seen = new Map<number, AuthBase>();
    for (const r of ctaRows ?? []) {
      const url = (r.source_url as string | null) ?? "";
      if (!url) continue; // UPL HARD: suppress rows without URL
      const oid = r.cited_opinion_id as number;
      const prev = seen.get(oid);
      const cur: AuthBase = {
        rank: 0,
        case_name: r.case_name as string,
        date_filed: (r.date_filed as string | null) ?? null,
        citation_count_in_charge: r.citation_count_in_charge as number | null,
        citation_count_total: r.citation_count_total as number,
        authority_tier: (r.authority_tier_overall as string | null) ?? null,
        source_url: url,
        cited_opinion_id: oid,
        data_scope: "charge_type",
      };
      if (
        !prev ||
        (cur.citation_count_in_charge ?? 0) > (prev.citation_count_in_charge ?? 0)
      ) {
        seen.set(oid, cur);
      }
    }
    bases = [...seen.values()]
      .sort(
        (a, b) => (b.citation_count_in_charge ?? 0) - (a.citation_count_in_charge ?? 0),
      )
      .slice(0, MAX_AUTHORITIES);
  }

  if (bases.length < MAX_AUTHORITIES) {
    const { data: caRows } = await supabase
      .from("citation_authority_criminal")
      .select(
        "cited_opinion_id, case_name, date_filed, citation_count_criminal, citation_count_total, authority_tier, source_url",
      )
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
        data_scope: "criminal_fallback",
      });
      seen.add(oid);
      if (bases.length >= MAX_AUTHORITIES) break;
    }
    if (internalAuthCharges.length === 0 || bases.some((b) => b.data_scope === "criminal_fallback")) {
      limitations.push(
        `No charge-specific authorities cached for "${chargeType}"; top criminal-law authorities included as fallback.`,
      );
    }
  }

  // HARD: enforce cap defensively
  bases = bases.slice(0, MAX_AUTHORITIES);

  let authorities: AddendumAuthorityRow[] = [];
  let quotesPresent = 0;
  if (bases.length > 0) {
    const opinionIds = bases.map((b) => b.cited_opinion_id);
    const [{ data: quoteRows }, { data: velRows }] = await Promise.all([
      supabase
        .from("authority_quotes_criminal")
        .select("cited_opinion_id, quote_sentence, primary_reporter, rank")
        .in("cited_opinion_id", opinionIds)
        .order("rank", { ascending: true }),
      supabase
        .from("citation_velocity_criminal")
        .select("cited_opinion_id, velocity_tier, rising_flag")
        .in("cited_opinion_id", opinionIds),
    ]);

    const quoteByOid = new Map<number, { quote: string; citation: string | null }>();
    for (const r of quoteRows ?? []) {
      const oid = r.cited_opinion_id as number;
      if (quoteByOid.has(oid)) continue;
      quoteByOid.set(oid, {
        quote: r.quote_sentence as string,
        citation: (r.primary_reporter as string | null) ?? null,
      });
    }

    const velByOid = new Map<number, { tier: string | null; rising: boolean }>();
    for (const r of velRows ?? []) {
      const oid = r.cited_opinion_id as number;
      velByOid.set(oid, {
        tier: (r.velocity_tier as string | null) ?? null,
        rising: (r.rising_flag as boolean | null) ?? false,
      });
    }

    authorities = bases.map((b, i) => {
      const q = quoteByOid.get(b.cited_opinion_id);
      const v = velByOid.get(b.cited_opinion_id);
      if (q) quotesPresent++;
      return {
        rank: i + 1,
        case_name: b.case_name,
        date_filed: b.date_filed,
        citation: q?.citation ?? null,
        citation_count_in_charge: b.citation_count_in_charge,
        citation_count_total: b.citation_count_total,
        authority_tier: b.authority_tier,
        quote_sentence: q?.quote ?? null,
        velocity_tier: v?.tier ?? null,
        rising_flag: v?.rising ?? false,
        source_url: b.source_url,
        data_scope: b.data_scope,
      };
    });
  }

  const quoteCoverageNote =
    authorities.length > 0 && quotesPresent < authorities.length
      ? `${quotesPresent} of ${authorities.length} authorities have an extracted quote on file; remaining rows show rank-only.`
      : null;

  const isEmpty = motions.length === 0 && authorities.length === 0;

  // ---------- TICKET-19: Capital-adjacency context ----------
  // Only attempted when (a) the playbook is in the capital-sidebar slug set
  // (sex-offense + federal-criminal) AND (b) the caller supplied a capital-
  // eligible charge class. We then query last-decade execution stats from
  // dpic_executions for the buyer's state.
  let capitalContext: CapitalContext | null = null;
  if (
    playbookSlugSupportsCapitalSidebar(playbookSlug) &&
    input.capitalChargeClass
  ) {
    const stats = state
      ? await queryCapitalExecutionStats([state])
      : new Map<string, { count: number; lastYear: number | null }>();
    const stateStat = state ? stats.get(state) : undefined;
    capitalContext = getCapitalContext({
      state,
      chargeClass: input.capitalChargeClass,
      surface: "playbook",
      lastDecadeExecutions: stateStat?.count ?? 0,
      lastExecutionYear: stateStat?.lastYear ?? null,
    });
    if (!capitalContext.eligible) capitalContext = null; // render gate
  }

  return {
    playbookSlug,
    playbookDisplayName,
    chargeType,
    chargeDisplayName,
    state,
    circuit,
    circuitName,
    motions,
    authorities,
    quoteCoverageNote,
    limitations,
    isEmpty,
    capitalContext,
  };
}
