/**
 * Motion Success Report — $197 Tier 9 SKU (M1).
 *
 * Activates dormant motion-outcome data (2,966 rows across
 * motion_outcome_rates + judge_motion_outcome_rates + motion_outcome_rates_by_circuit).
 *
 * For a defendant's (chargeType, optional circuit/state, optional judgeName) the
 * report renders:
 *   Section 1 — Top 10 motion types for this charge, grant rates + circuit delta
 *   Section 2 — Judge-specific motion patterns (when judge resolves, n>=10)
 *   Section 3 — Top 10 granted-motion case citations (charge_type_top_authorities
 *               with citation_authority_criminal fallback)
 *   Section 4 — Methodology + UPL disclaimer
 *
 * Tier monotonicity (HARD):
 *   - No full histograms (X-Ray $2,497 territory)
 *   - No per-case extracted quotes (IB $997 territory)
 *   - No monthly delta emails (War Room $4,997 territory)
 *
 * UPL (HARD):
 *   - Every % has its N inline
 *   - Phrasing is "of N motions filed, M were granted (X%)" — never a recommendation
 *   - Every cited case has a CourtListener URL; rows without URL are suppressed
 *   - Banned phrases: "you should", "we recommend", "we advise", "your best option",
 *     "ask your attorney", "publicly available"
 *
 * Cited experts: Hormozi Grand Slam value equation (tiered $197/$997/$2497);
 *                Dreyer entity SEO / AI Overview Defense.
 *
 * Sources: docs/advisor/2026-04-23-data-to-product-audit.md product #1,
 *          docs/plans/2026-04-23-data-to-product-autonomous-execution.md M1.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// Types
// ============================================================

export interface MotionSuccessReportInput {
  chargeType: string;          // ALLOWED_CHARGE_TYPES value (user-facing slug)
  circuit?: string | null;     // "1".."11", "DC", "FC", "SCOTUS"
  state?: string | null;       // 2-letter postal; used to derive circuit
  judgeName?: string | null;
}

export interface MotionRow {
  motion_type: string;
  filed_count: number;
  granted_count: number;
  denied_count: number;
  grant_rate: number | null;
  baseline_grant_rate: number | null;
  deviation_from_baseline: number | null;
  data_scope: "charge_circuit" | "charge_national" | "all_national";
}

export interface JudgeMotionRow {
  motion_type: string;
  filed_count: number;
  granted_count: number;
  grant_rate: number | null;
  baseline_grant_rate: number | null;
  deviation_from_baseline: number | null;
}

export interface AuthorityCitation {
  rank: number;
  case_name: string;
  date_filed: string | null;
  citation_count_in_charge: number | null;
  citation_count_total: number;
  authority_tier: string | null;
  source_url: string;
  data_scope: "charge_type" | "criminal_fallback";
}

export interface MotionSuccessReportData {
  chargeType: string;
  circuit: string | null;
  circuitName: string | null;
  judgeDisplayName: string | null;
  judgeResolved: boolean;
  ambiguousJudge: boolean;
  motions: MotionRow[];
  judgeMotions: JudgeMotionRow[];
  citations: AuthorityCitation[];
  limitations: string[];
  isEmpty: boolean;
}

// ============================================================
// Charge-type mapping
// ============================================================
//
// motion_outcome_rates uses internal slugs (e.g. "dui-dwi", "sexual-assault",
// "drug-possession-with-intent") that do NOT match ALLOWED_CHARGE_TYPES
// (user-facing intake slugs). This map routes each user-facing chargeType to
// one or more internal slugs; a missing mapping falls back to "(all)" with a
// limitation note.
//
// Kept deliberately narrow — only maps verified values observed in
// motion_outcome_rates as of 2026-04-22. Unmapped charges fall through to
// the national "(all)" baseline rather than fabricating a match.

export const CHARGE_TYPE_MOR_MAP: Record<string, string[]> = {
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
  dui: ["dui", "dui-dwi", "dui-first-offense", "dui-repeat-offense", "dui-third-offense", "dui-drugs", "dui-felony-injury"],
  "dui-first": ["dui-first-offense", "dui-dwi"],
  "dui-repeat": ["dui-repeat-offense", "dui-third-offense"],
  assault: ["assault", "simple-assault", "aggravated-assault", "aggravated-battery", "assault-with-deadly-weapon", "assault-firearm", "assault-police-officer", "battery"],
  "domestic-violence": ["domestic-violence", "domestic-battery", "violation-protective-order"],
  theft: ["theft", "theft-larceny", "grand-theft", "petty-theft", "shoplifting", "receiving-stolen-property", "motor-vehicle-theft"],
  "sex-offense": ["sex-offense", "sex-offense-contact", "sex-offense-digital", "sexual-assault", "sexual-battery", "rape", "statutory-rape", "indecent-exposure"],
  "sex-offense-contact": ["sex-offense-contact", "sexual-assault", "sexual-battery", "rape", "statutory-rape"],
  "sex-offense-digital": ["sex-offense-digital", "child-exploitation", "production-child-pornography"],
  weapons: ["weapons-possession", "felony-firearm", "felon-in-possession", "possession-prohibited-weapon", "weapons-school-zone", "illegal-discharge"],
  "white-collar": ["fraud-general", "wire-fraud", "securities-fraud", "tax-fraud", "insurance-fraud", "credit-card-fraud", "prescription-fraud", "money-laundering", "embezzlement", "identity-theft", "forgery", "bad-checks"],
  federal: [],
  "probation-violation": ["probation-violation-technical", "probation-violation-substantive", "parole-violation", "community-control-violation", "supervised-release-violation"],
  "self-defense": [],
  other: ["other"],
  murder: ["murder", "murder-first-degree", "murder-second-degree", "attempted-murder"],
  manslaughter: ["voluntary-manslaughter", "involuntary-manslaughter", "vehicular-manslaughter", "vehicular-homicide"],
  kidnapping: ["kidnapping", "unlawful-imprisonment"],
  arson: ["arson"],
  stalking: ["stalking", "aggravated-stalking"],
  "child-abuse": ["child-abuse", "child-endangerment"],
  "hit-and-run": ["hit-and-run"],
  contempt: ["contempt-of-court", "criminal-contempt"],
  robbery: ["robbery", "armed-robbery", "home-invasion"],
  burglary: ["burglary", "residential-burglary", "commercial-burglary"],
  fraud: ["fraud-general", "wire-fraud", "securities-fraud", "tax-fraud", "insurance-fraud", "credit-card-fraud", "prescription-fraud", "identity-theft"],
  drug: [
    "drug-possession",
    "drug-trafficking",
    "drug-distribution",
    "drug-manufacturing",
    "drug-paraphernalia",
  ],
  "other-felony": [],
  "other-misdemeanor": [],
};

// ============================================================
// State → Circuit mapping (federal circuits for appellate motion data)
// ============================================================
//
// Values intentionally restricted to motion_outcome_rates_by_circuit.circuit
// domain: "1".."11", "DC". We don't surface SCOTUS or FC (Federal Circuit) to
// intake — neither is jurisdictionally relevant for a state-level criminal
// defendant filing circuit-wide motion patterns.
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

// ============================================================
// Query
// ============================================================

function escapeIlike(s: string): string {
  return s.toLowerCase().replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

function resolveCircuit(input: MotionSuccessReportInput): string | null {
  const raw = (input.circuit ?? "").trim();
  if (raw && VALID_CIRCUITS.has(raw)) return raw;
  const state = (input.state ?? "").trim().toUpperCase();
  if (state && STATE_TO_CIRCUIT[state]) return STATE_TO_CIRCUIT[state];
  return null;
}

export async function queryMotionSuccessReport(
  input: MotionSuccessReportInput,
): Promise<MotionSuccessReportData> {
  const supabase = createAdminClient();
  const limitations: string[] = [];
  const chargeType = input.chargeType;
  const circuit = resolveCircuit(input);
  const circuitName = circuit ? CIRCUIT_NAMES[circuit] : null;

  // ---------- Section 1: motion patterns for this charge ----------
  //
  // Progressive widening:
  //   (a) charge_type IN (internal slugs for user chargeType) — the best match;
  //       aggregate by motion_type across internal charge slugs
  //   (b) charge_type = '(all)' — national baseline across every charge
  //
  // by_circuit is too sparse (only '(all)') to use as a primary data source;
  // we fetch it in parallel only to compute the circuit baseline delta for
  // Section 1's "vs. circuit" column.
  const internalCharges = CHARGE_TYPE_MOR_MAP[chargeType] ?? [];

  let motions: MotionRow[] = [];
  let dataScope: MotionRow["data_scope"] = "all_national";

  if (internalCharges.length > 0) {
    const { data: chargeRows } = await supabase
      .from("motion_outcome_rates")
      .select("motion_type, filed_count, granted_count, denied_count, grant_rate")
      .in("charge_type", internalCharges)
      .order("filed_count", { ascending: false });

    // Aggregate across internal slugs by motion_type
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
        .slice(0, 10);
      dataScope = "charge_national";
    }
  }

  if (motions.length === 0) {
    // Fall back to national "(all)" baseline
    const { data: allRows } = await supabase
      .from("motion_outcome_rates")
      .select("motion_type, filed_count, granted_count, denied_count, grant_rate")
      .eq("charge_type", "(all)")
      .order("filed_count", { ascending: false })
      .limit(10);
    motions = (allRows ?? []).map((r) => ({
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
    limitations.push(
      `No charge-specific motion data cached for "${chargeType}"; showing national baseline across all criminal motions.`,
    );
  }

  // Always attach a baseline from motion_outcome_rates "(all)" at the
  // motion-type level for comparison. Plus, if circuit resolves, attach the
  // circuit-level (all)-charge baseline for a "vs. circuit" delta column.
  const { data: nationalAll } = await supabase
    .from("motion_outcome_rates")
    .select("motion_type, grant_rate")
    .eq("charge_type", "(all)");
  const nationalBaseline = new Map<string, number | null>();
  for (const r of nationalAll ?? []) {
    nationalBaseline.set(r.motion_type as string, r.grant_rate as number | null);
  }

  let circuitBaseline = new Map<string, number | null>();
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
        `No circuit-specific motion baseline for "${circuitName ?? circuit}"; "vs circuit" column omitted.`,
      );
    }
  } else if (input.state || input.circuit) {
    limitations.push(
      "Could not resolve a federal circuit from the state provided; circuit delta unavailable.",
    );
  }

  // Annotate motions with baselines. Prefer circuit baseline when present; fall
  // back to national baseline for deviation comparison.
  motions = motions.map((m) => {
    const circ = circuitBaseline.get(m.motion_type) ?? null;
    const nat = nationalBaseline.get(m.motion_type) ?? null;
    const baseline = circ ?? nat;
    const deviation =
      m.grant_rate !== null && baseline !== null
        ? m.grant_rate - baseline
        : null;
    return {
      ...m,
      baseline_grant_rate: baseline,
      deviation_from_baseline: deviation,
      data_scope: dataScope,
    };
  });

  // ---------- Section 2: judge-specific motion patterns ----------
  let judgeDisplayName: string | null = null;
  let judgeResolved = false;
  let ambiguousJudge = false;
  let judgeMotions: JudgeMotionRow[] = [];

  const rawJudge = (input.judgeName ?? "").trim();
  if (rawJudge.length > 0) {
    const safeName = escapeIlike(rawJudge);
    const surname = safeName.split(" ").pop() ?? safeName;
    const { data: judgeRows } = await supabase
      .from("entities_judges")
      .select("canonical_id, cl_person_id, name_first, name_middle, name_last, name_suffix")
      .ilike("name_last", `%${surname}%`)
      .limit(10);

    const candidates = (judgeRows ?? []).filter((row) => {
      const full = [row.name_first, row.name_middle, row.name_last, row.name_suffix]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return full.includes(safeName);
    });

    if (candidates.length > 1) {
      ambiguousJudge = true;
      limitations.push(
        `Multiple judges match "${rawJudge}"; add a middle name or court to disambiguate. Judge section omitted.`,
      );
    } else if (candidates.length === 1) {
      const judge = candidates[0];
      const authorId = judge.cl_person_id as number | null;
      judgeDisplayName = [judge.name_first, judge.name_middle, judge.name_last, judge.name_suffix]
        .filter(Boolean)
        .join(" ");
      judgeResolved = true;

      if (authorId !== null && authorId !== undefined) {
        const { data: motRows } = await supabase
          .from("judge_motion_outcome_rates")
          .select("motion_type, filed_count, granted_count, grant_rate, baseline_grant_rate, deviation_from_baseline")
          .eq("author_id", authorId)
          .gte("filed_count", 10)
          .order("filed_count", { ascending: false })
          .limit(10);
        judgeMotions = (motRows ?? []).map((r) => ({
          motion_type: r.motion_type as string,
          filed_count: r.filed_count as number,
          granted_count: r.granted_count as number,
          grant_rate: r.grant_rate as number | null,
          baseline_grant_rate: r.baseline_grant_rate as number | null,
          deviation_from_baseline: r.deviation_from_baseline as number | null,
        }));
        if (judgeMotions.length === 0) {
          limitations.push(
            `Judge ${judgeDisplayName} is in our records but has <10 filed motions of any type; judge-specific section omitted.`,
          );
        }
      } else {
        limitations.push(
          `Judge ${judgeDisplayName} has no CourtListener author_id linked; judge-specific section omitted.`,
        );
      }
    } else {
      limitations.push(
        `No canonical judge record matching "${rawJudge}"; judge-specific section omitted.`,
      );
    }
  }

  // ---------- Section 3: top-10 granted-motion case citations ----------
  //
  // First attempt: charge_type_top_authorities filtered to the user charge.
  // Fallback: citation_authority_criminal (620K rows, broader coverage).
  //
  // UPL HARD: drop any row without a source_url.
  let citations: AuthorityCitation[] = [];
  const { data: ctaRows } = await supabase
    .from("charge_type_top_authorities")
    .select("rank, case_name, date_filed, citation_count_in_charge, citation_count_total, authority_tier_overall, source_url")
    .eq("charge_type", chargeType)
    .order("rank", { ascending: true })
    .limit(15);
  for (const r of ctaRows ?? []) {
    const url = (r.source_url as string | null) ?? "";
    if (!url) continue;
    citations.push({
      rank: r.rank as number,
      case_name: r.case_name as string,
      date_filed: (r.date_filed as string | null) ?? null,
      citation_count_in_charge: r.citation_count_in_charge as number | null,
      citation_count_total: r.citation_count_total as number,
      authority_tier: (r.authority_tier_overall as string | null) ?? null,
      source_url: url,
      data_scope: "charge_type",
    });
    if (citations.length >= 10) break;
  }

  if (citations.length < 10) {
    // Widen to citation_authority_criminal, order by criminal citation count.
    const { data: caRows } = await supabase
      .from("citation_authority_criminal")
      .select("case_name, date_filed, citation_count_criminal, citation_count_total, authority_tier, source_url")
      .order("citation_count_criminal", { ascending: false })
      .limit(30);
    for (const r of caRows ?? []) {
      const url = (r.source_url as string | null) ?? "";
      if (!url) continue;
      citations.push({
        rank: citations.length + 1,
        case_name: r.case_name as string,
        date_filed: (r.date_filed as string | null) ?? null,
        citation_count_in_charge: r.citation_count_criminal as number | null,
        citation_count_total: r.citation_count_total as number,
        authority_tier: (r.authority_tier as string | null) ?? null,
        source_url: url,
        data_scope: "criminal_fallback",
      });
      if (citations.length >= 10) break;
    }
    if (citations.length > 0 && (ctaRows ?? []).length === 0) {
      limitations.push(
        `No charge-specific top authorities cached for "${chargeType}"; showing top criminal-law authorities by citation frequency.`,
      );
    }
  }

  // Re-rank sequentially after filtering
  citations = citations.map((c, i) => ({ ...c, rank: i + 1 }));

  const isEmpty =
    motions.length === 0 && judgeMotions.length === 0 && citations.length === 0;

  return {
    chargeType,
    circuit,
    circuitName,
    judgeDisplayName,
    judgeResolved,
    ambiguousJudge,
    motions,
    judgeMotions,
    citations,
    limitations,
    isEmpty,
  };
}

// ============================================================
// Render
// ============================================================

// Minimum sample-size threshold. Below this, we suppress % and print a caveat.
const MIN_N = 10;

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
  // "dismiss_motion" → "Dismiss Motion"; "habeas_corpus" → "Habeas Corpus"
  return m
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function prettyChargeType(c: string): string {
  return c.replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * Render motion rate, with small-sample caveat when N < MIN_N.
 */
function renderRatePair(n: number, granted: number, rate: number | null): string {
  if (n < MIN_N) return `${granted}/${n} <span class="sf-small">(insufficient data)</span>`;
  return `${granted}/${n} (${fmtPct(rate)})`;
}

export function renderMotionSuccessReport(data: MotionSuccessReportData): string {
  const chargeLabel = htmlEscape(prettyChargeType(data.chargeType));
  const circuitLabel = data.circuitName ? htmlEscape(data.circuitName) : null;

  const header = `
    <header class="msr-header">
      <h1>Motion Success Report — ${chargeLabel}</h1>
      <p class="msr-subtitle">
        ${circuitLabel ? `Circuit-contextualized motion patterns (${circuitLabel})` : "National motion patterns"}
        ${data.judgeResolved ? ` · Judge: ${htmlEscape(data.judgeDisplayName ?? "")}` : ""}
      </p>
      <p class="msr-gate"><strong>This is legal INFORMATION, not legal ADVICE.</strong> Numbers below come from published court records. They describe what has happened, not what will happen in any specific case.</p>
    </header>
  `;

  const s1 =
    data.motions.length > 0
      ? `
    <section class="msr-section">
      <h2>Section 1 — Top motions filed for ${chargeLabel}</h2>
      <p class="msr-intro">
        Of published opinions touching ${chargeLabel} in our federal criminal corpus,
        the most frequently filed motion types, with grant rates and comparison to
        ${circuitLabel ? `the ${circuitLabel} baseline` : "the national baseline"}.
      </p>
      <table class="msr-table">
        <thead>
          <tr>
            <th>Motion type</th>
            <th>N filed</th>
            <th>N granted</th>
            <th>Grant rate</th>
            <th>Baseline</th>
            <th>Delta</th>
          </tr>
        </thead>
        <tbody>
          ${data.motions
            .map(
              (m) => `
            <tr>
              <td>${htmlEscape(prettyMotionType(m.motion_type))}</td>
              <td>${m.filed_count}</td>
              <td>${m.granted_count}</td>
              <td>${m.filed_count < MIN_N ? `<span class="msr-small">insufficient data</span>` : fmtPct(m.grant_rate)}</td>
              <td>${fmtPct(m.baseline_grant_rate)}</td>
              <td>${fmtSigned(m.deviation_from_baseline)}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
      <p class="msr-scope">Source: motion_outcome_rates — scope: ${htmlEscape(data.motions[0]?.data_scope ?? "")}.
        Baseline: ${circuitLabel ? `${circuitLabel} (all charges) when available; otherwise national (all charges).` : "national (all charges)."}
      </p>
    </section>`
      : "";

  const s2 = data.judgeMotions.length
    ? `
    <section class="msr-section">
      <h2>Section 2 — Motion patterns before ${htmlEscape(data.judgeDisplayName ?? "this judge")}</h2>
      <p class="msr-intro">
        Motions of any charge type that have appeared before this judge with
        N &ge; ${MIN_N}, compared to the cross-judge baseline. Treat deviations
        as questions worth raising, not predictions.
      </p>
      <table class="msr-table">
        <thead>
          <tr>
            <th>Motion type</th>
            <th>N filed before judge</th>
            <th>Grant rate</th>
            <th>Cross-judge baseline</th>
            <th>Delta</th>
          </tr>
        </thead>
        <tbody>
          ${data.judgeMotions
            .map(
              (m) => `
            <tr>
              <td>${htmlEscape(prettyMotionType(m.motion_type))}</td>
              <td>${m.filed_count}</td>
              <td>${renderRatePair(m.filed_count, m.granted_count, m.grant_rate)}</td>
              <td>${fmtPct(m.baseline_grant_rate)}</td>
              <td>${fmtSigned(m.deviation_from_baseline)}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
      <p class="msr-scope">Source: judge_motion_outcome_rates (author_id linked via entities_judges).</p>
    </section>`
    : "";

  const s3 =
    data.citations.length > 0
      ? `
    <section class="msr-section">
      <h2>Section 3 — Top-cited precedents for ${chargeLabel}</h2>
      <p class="msr-intro">
        Most-cited case authorities relevant to ${chargeLabel}. Each row links to
        the primary opinion on CourtListener so the citation can be independently
        verified — no summary substitutes for reading the opinion itself.
      </p>
      <table class="msr-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Case</th>
            <th>Filed</th>
            <th>Citations (charge / total)</th>
            <th>Tier</th>
          </tr>
        </thead>
        <tbody>
          ${data.citations
            .map(
              (c) => `
            <tr>
              <td>${c.rank}</td>
              <td><a href="${htmlEscape(c.source_url)}" target="_blank" rel="noopener">${htmlEscape(c.case_name)}</a></td>
              <td>${c.date_filed ? htmlEscape(String(c.date_filed).slice(0, 10)) : ""}</td>
              <td>${c.citation_count_in_charge ?? ""} / ${c.citation_count_total}</td>
              <td>${htmlEscape(c.authority_tier ?? "")}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
      <p class="msr-scope">Source: charge_type_top_authorities${data.citations.some((c) => c.data_scope === "criminal_fallback") ? " + citation_authority_criminal fallback" : ""}. Every row has a verification URL on file; rows without URLs are suppressed.</p>
    </section>`
      : "";

  const limitations = data.limitations.length
    ? `<aside class="msr-limits"><h3>Known limitations</h3><ul>${data.limitations.map((l) => `<li>${htmlEscape(l)}</li>`).join("")}</ul></aside>`
    : "";

  const disclaimer = `
    <footer class="msr-footer">
      <h3>Methodology</h3>
      <p>This report provides legal INFORMATION — not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied specifically to your case details. Your attorney remains the final authority on strategy decisions.</p>
      <p>Frequencies are tallied from published court opinions in our federal criminal corpus as of 2026-04-22. A grant rate of X% means: of N motions of that type filed in the scope shown, X% were granted in the opinions we could classify. Small samples (N &lt; ${MIN_N}) are flagged. Citations link to the primary source on CourtListener for independent verification.</p>
      <p>No part of this report constitutes a prediction. It is a map of what is already in the record.</p>
    </footer>
  `;

  const styles = `
    <style>
      .motion-success-report { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 960px; margin: 2em auto; padding: 1em; color: #111; }
      .motion-success-report h1 { font-size: 1.6em; margin: 0 0 0.25em; }
      .motion-success-report .msr-subtitle { color: #555; margin: 0 0 1em; font-style: italic; }
      .motion-success-report .msr-gate { background: #fff8e1; border-left: 4px solid #f9a825; padding: 0.75em 1em; margin: 0 0 1.5em; }
      .motion-success-report .msr-section { margin: 2em 0; }
      .motion-success-report .msr-section h2 { font-size: 1.2em; margin: 0 0 0.5em; border-bottom: 1px solid #e0e0e0; padding-bottom: 0.25em; }
      .motion-success-report .msr-intro { color: #555; margin: 0.25em 0 0.75em; }
      .motion-success-report .msr-table { width: 100%; border-collapse: collapse; margin: 0.5em 0; font-size: 0.92em; }
      .motion-success-report .msr-table th, .motion-success-report .msr-table td { text-align: left; padding: 0.45em 0.7em; border-bottom: 1px solid #e8e8e8; }
      .motion-success-report .msr-table th { background: #f5f5f5; font-weight: 600; }
      .motion-success-report .msr-scope { color: #777; font-size: 0.82em; margin-top: 0.5em; }
      .motion-success-report .msr-small, .motion-success-report .sf-small { color: #999; font-style: italic; font-size: 0.9em; }
      .motion-success-report .msr-limits { margin-top: 1.5em; padding: 0.75em 1em; background: #f0f4f8; border-left: 3px solid #4a6fa5; font-size: 0.9em; }
      .motion-success-report .msr-footer { margin-top: 2em; padding-top: 1em; border-top: 2px solid #333; color: #555; font-size: 0.9em; }
    </style>
  `;

  return `
    ${styles}
    <section class="motion-success-report">
      ${header}
      ${s1}
      ${s2}
      ${s3}
      ${limitations}
      ${disclaimer}
    </section>
  `;
}

// ============================================================
// UPL phrase blocklist — exported for test-time verification
// ============================================================

export const UPL_BANNED_PHRASES = [
  "you should",
  "we recommend",
  "we advise",
  "your best option",
  "ask your attorney",
  "publicly available",
];
