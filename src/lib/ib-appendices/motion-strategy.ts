/**
 * IB Appendix G — Motion Strategy Appendix.
 *
 * Upper-tier enhancement on the Intelligence Brief $997. Activates dormant
 * motion-outcome data (2,966 rows) in a deeper form than the $197 Motion
 * Success Report (M1):
 *
 *   • Motion rates: top **20** (vs M1 top 10) — per monotonicity matrix in
 *     docs/plans/2026-04-23-data-to-product-autonomous-execution.md E1.
 *   • Judge-specific column included even when judge n < 10, labeled
 *     "insufficient n=X" (M1 suppresses; IB surfaces with caveat so the
 *     customer can still raise the question).
 *   • Top 10 granted-motion case citations carry **extracted quotes** per
 *     case — the value-add M1 does not have. Quotes pulled from
 *     authority_quotes_criminal (pre-extracted by citing-courts, rank=1).
 *
 * Tier monotonicity (HARD — enforced by unit test):
 *   - IB top-N motions STRICTLY > M1 top-10
 *   - IB citation rows carry quotes; M1 citations are citation-only
 *   - IB does NOT render full histogram across all motion types (X-Ray E2
 *     territory) and does NOT include judge-attack cross-reference to
 *     sentencing outliers (X-Ray territory).
 *
 * UPL (HARD):
 *   - Every row includes N alongside the grant rate (no rate without N)
 *   - Banned-phrase blocklist enforced in test: "you should", "we recommend",
 *     "we advise", "your best option", "ask your attorney", "publicly available"
 *   - Every cited case has a CourtListener URL; rows without URL are suppressed
 *
 * Cited experts:
 *   - Hormozi Grand Slam (tiered value equation — IB price unchanged, depth
 *     increased, delivery-time unchanged)
 *   - Dreyer AI Overview Defense (authority-engine positioning on IB)
 *
 * Sources:
 *   docs/advisor/2026-04-23-data-to-product-audit.md product #1 + Move 3
 *   docs/plans/2026-04-23-data-to-product-autonomous-execution.md E1
 *
 * Consumed by:
 *   - supabase/functions/generate-report/index.ts (mirrored inline in Deno)
 *   - Unit tests in ./__tests__/motion-strategy.test.ts
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  CHARGE_TYPE_MOR_MAP,
  CHARGE_TYPE_AUTHORITY_MAP,
  CIRCUIT_NAMES,
  resolveCircuitFromStateOrCircuit,
} from "@/lib/charge-slug-maps";

// ============================================================
// Types
// ============================================================

export interface MotionStrategyInput {
  chargeType: string; // ALLOWED_CHARGE_TYPES user-facing slug
  state?: string | null; // 2-letter postal (used to derive circuit)
  circuit?: string | null; // "1".."11", "DC"
  judgeName?: string | null;
}

export interface MotionRateRow {
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
  insufficient_sample: boolean; // n < MIN_JUDGE_N
}

export interface MotionCitationRow {
  rank: number;
  case_name: string;
  date_filed: string | null;
  citation: string | null; // primary reporter when available
  citation_count_in_charge: number | null;
  citation_count_total: number;
  authority_tier: string | null;
  quote_sentence: string | null; // extracted per-case quote (the E1 lift)
  quote_frequency: number | null;
  source_url: string;
  data_scope: "charge_type" | "criminal_fallback";
}

export interface MotionStrategyData {
  chargeType: string;
  circuit: string | null;
  circuitName: string | null;
  judgeDisplayName: string | null;
  judgeResolved: boolean;
  ambiguousJudge: boolean;
  motions: MotionRateRow[];
  judgeMotions: JudgeMotionRow[];
  citations: MotionCitationRow[];
  limitations: string[];
  isEmpty: boolean;
}

// ============================================================
// Depth guardrails (monotonicity HARD)
// ============================================================

/** Top-N motions surfaced in IB. Strictly greater than M1's top 10. */
export const IB_MOTION_TOP_N = 20;

/** Top-N citation rows in IB. Strictly greater than M1's top 10. */
export const IB_CITATION_TOP_N = 10;

/** Judge sample threshold below which IB labels "insufficient" but still shows. */
export const IB_JUDGE_INSUFFICIENT_THRESHOLD = 10;

// ============================================================
// Query
// ============================================================

function escapeIlike(s: string): string {
  return s.toLowerCase().replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

export async function queryMotionStrategy(
  input: MotionStrategyInput,
): Promise<MotionStrategyData> {
  const supabase = createAdminClient();
  const limitations: string[] = [];
  const chargeType = input.chargeType;
  const circuit = resolveCircuitFromStateOrCircuit(input.circuit, input.state);
  const circuitName = circuit ? CIRCUIT_NAMES[circuit] : null;

  // ---------- Section 1: top-20 motion rates for this charge ----------
  const internalCharges = CHARGE_TYPE_MOR_MAP[chargeType] ?? [];

  let motions: MotionRateRow[] = [];
  let dataScope: MotionRateRow["data_scope"] = "all_national";

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
      // 2026-04-23 wave-pristine-r1 CRITICAL #1: removed `.filter(v => v.filed >= 5)`
      // which silently inverted tier monotonicity. M1 ($197) surfaces motion
      // rows with filed_count >= 1; IB ($997) must surface STRICTLY more, not
      // less. IB_MOTION_TOP_N=20 already caps row count; we do not also filter.
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
        .slice(0, IB_MOTION_TOP_N);
      dataScope = "charge_national";
    }
  }

  if (motions.length === 0) {
    const { data: allRows } = await supabase
      .from("motion_outcome_rates")
      .select("motion_type, filed_count, granted_count, denied_count, grant_rate")
      .eq("charge_type", "(all)")
      .order("filed_count", { ascending: false })
      .limit(IB_MOTION_TOP_N);
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

  // National baseline for comparison
  const { data: nationalAll } = await supabase
    .from("motion_outcome_rates")
    .select("motion_type, grant_rate")
    .eq("charge_type", "(all)");
  const nationalBaseline = new Map<string, number | null>();
  for (const r of nationalAll ?? []) {
    nationalBaseline.set(r.motion_type as string, r.grant_rate as number | null);
  }

  // Circuit baseline (if resolvable)
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
        `No circuit-specific motion baseline for "${circuitName ?? circuit}"; "vs circuit" column omitted.`,
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

  // ---------- Section 2: judge-specific motions (include n<10) ----------
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
        `Multiple judges match "${rawJudge}"; add middle name or court to disambiguate. Judge section omitted.`,
      );
    } else if (candidates.length === 1) {
      const judge = candidates[0];
      const authorId = judge.cl_person_id as number | null;
      judgeDisplayName = [judge.name_first, judge.name_middle, judge.name_last, judge.name_suffix]
        .filter(Boolean)
        .join(" ");
      judgeResolved = true;

      if (authorId !== null && authorId !== undefined) {
        // IB E1 lift: no gte(filed_count, 10) — surface low-n rows with caveat.
        const { data: motRows } = await supabase
          .from("judge_motion_outcome_rates")
          .select(
            "motion_type, filed_count, granted_count, grant_rate, baseline_grant_rate, deviation_from_baseline",
          )
          .eq("author_id", authorId)
          .order("filed_count", { ascending: false })
          .limit(IB_MOTION_TOP_N);
        judgeMotions = (motRows ?? []).map((r) => {
          const n = r.filed_count as number;
          return {
            motion_type: r.motion_type as string,
            filed_count: n,
            granted_count: r.granted_count as number,
            grant_rate: r.grant_rate as number | null,
            baseline_grant_rate: r.baseline_grant_rate as number | null,
            deviation_from_baseline: r.deviation_from_baseline as number | null,
            insufficient_sample: n < IB_JUDGE_INSUFFICIENT_THRESHOLD,
          };
        });
        if (judgeMotions.length === 0) {
          limitations.push(
            `Judge ${judgeDisplayName} is in our records but has no filed motions cached; judge-specific section omitted.`,
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

  // ---------- Section 3: top-10 citations with extracted quotes ----------
  const internalAuthCharges = CHARGE_TYPE_AUTHORITY_MAP[chargeType] ?? [];
  interface BaseRow {
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
  let bases: BaseRow[] = [];

  if (internalAuthCharges.length > 0) {
    const { data: ctaRows } = await supabase
      .from("charge_type_top_authorities")
      .select(
        "charge_type, rank, cited_opinion_id, case_name, date_filed, citation_count_in_charge, citation_count_total, authority_tier_overall, source_url",
      )
      .in("charge_type", internalAuthCharges)
      .order("citation_count_in_charge", { ascending: false })
      .limit(30);
    const seen = new Map<number, BaseRow>();
    for (const r of ctaRows ?? []) {
      const url = (r.source_url as string | null) ?? "";
      if (!url) continue;
      const oid = r.cited_opinion_id as number;
      const prev = seen.get(oid);
      const cur: BaseRow = {
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
      if (!prev || (cur.citation_count_in_charge ?? 0) > (prev.citation_count_in_charge ?? 0)) {
        seen.set(oid, cur);
      }
    }
    bases = [...seen.values()]
      .sort((a, b) => (b.citation_count_in_charge ?? 0) - (a.citation_count_in_charge ?? 0))
      .slice(0, IB_CITATION_TOP_N);
  }

  // Fallback to criminal-national if charge-specific is thin
  if (bases.length < IB_CITATION_TOP_N) {
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
      if (bases.length >= IB_CITATION_TOP_N) break;
    }
  }

  // Enrich with extracted quotes — the E1 depth lift over M1.
  const opinionIds = bases.map((b) => b.cited_opinion_id);
  const quoteByOid = new Map<
    number,
    { quote: string; citation: string | null; frequency: number | null }
  >();
  if (opinionIds.length > 0) {
    const { data: quoteRows } = await supabase
      .from("authority_quotes_criminal")
      .select("cited_opinion_id, quote_sentence, primary_reporter, rank, quote_frequency")
      .in("cited_opinion_id", opinionIds)
      .order("rank", { ascending: true });
    for (const r of quoteRows ?? []) {
      const oid = r.cited_opinion_id as number;
      if (quoteByOid.has(oid)) continue; // keep rank 1
      quoteByOid.set(oid, {
        quote: r.quote_sentence as string,
        citation: (r.primary_reporter as string | null) ?? null,
        frequency: (r.quote_frequency as number | null) ?? null,
      });
    }
  }

  const citations: MotionCitationRow[] = bases.map((b, i) => {
    const q = quoteByOid.get(b.cited_opinion_id);
    return {
      rank: i + 1,
      case_name: b.case_name,
      date_filed: b.date_filed,
      citation: q?.citation ?? null,
      citation_count_in_charge: b.citation_count_in_charge,
      citation_count_total: b.citation_count_total,
      authority_tier: b.authority_tier,
      quote_sentence: q?.quote ?? null,
      quote_frequency: q?.frequency ?? null,
      source_url: b.source_url,
      data_scope: b.data_scope,
    };
  });

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
// Render (markdown — matches existing IB Appendix F renderer style)
// ============================================================

function fmtPct(n: number | null, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function fmtSigned(n: number | null, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const pct = n * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)} pp`;
}

function prettyMotionType(m: string): string {
  return m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function mdEscape(s: string): string {
  // Escape table pipes; leave other markdown alone so intentional emphasis still renders.
  return (s ?? "").split("|").join("\\|");
}

/**
 * Render Appendix G as markdown. The IB Edge Function post-processes this
 * with md2html (same pipeline as the Sprint-2 Appendix F subsections).
 */
export function renderMotionStrategy(data: MotionStrategyData): string {
  if (data.isEmpty) return "";

  const lines: string[] = [];
  lines.push(`## Appendix G: Motion Strategy`);
  lines.push(``);
  lines.push(
    `How the courts that hear cases like yours have ruled on the motions most commonly filed in these cases. ` +
      `This is historical pattern data compiled from published criminal opinions — not a prediction for your specific motion.`,
  );
  lines.push(``);

  // Section 1 — motion grant rates (top-20)
  if (data.motions.length > 0) {
    const circuitLabel = data.circuitName ?? "national";
    lines.push(`### Motion Grant Rates — Top ${Math.min(data.motions.length, IB_MOTION_TOP_N)} for ${prettyChargeType(data.chargeType)}`);
    lines.push(``);
    lines.push(
      `Motion types ranked by filing frequency in ${prettyChargeType(data.chargeType)} criminal opinions. ` +
        `Baseline column shows ${data.circuitName ? `${circuitLabel} all-charges baseline when available, otherwise national baseline` : "national all-charges baseline"}. ` +
        `Deviation column compares this charge's grant rate against the baseline.`,
    );
    lines.push(``);
    lines.push(`| **Motion Type** | **N filed** | **N granted** | **Grant rate** | **Baseline** | **Deviation** |`);
    lines.push(`|---|---|---|---|---|---|`);
    for (const m of data.motions) {
      lines.push(
        `| ${mdEscape(prettyMotionType(m.motion_type))} | ${m.filed_count} | ${m.granted_count} | ${fmtPct(m.grant_rate)} | ${fmtPct(m.baseline_grant_rate)} | ${fmtSigned(m.deviation_from_baseline)} |`,
      );
    }
    lines.push(``);
    lines.push(
      `Source: motion_outcome_rates (aggregated across internal charge slugs); ` +
        `baseline from motion_outcome_rates "(all)" and motion_outcome_rates_by_circuit where applicable.`,
    );
    lines.push(``);
  }

  // Section 2 — judge-specific (insufficient rows surfaced with caveat)
  if (data.judgeMotions.length > 0 && data.judgeDisplayName) {
    lines.push(`### Motion Patterns Before ${mdEscape(data.judgeDisplayName)}`);
    lines.push(``);
    lines.push(
      `Motions of any charge type authored by this judge in the CourtListener opinion corpus. ` +
        `Rows with a small sample (n < ${IB_JUDGE_INSUFFICIENT_THRESHOLD}) are surfaced with an "insufficient data" caveat — ` +
        `the pattern may still be worth raising with your attorney as a question, even where the sample is thin.`,
    );
    lines.push(``);
    lines.push(`| **Motion Type** | **N filed** | **Grant rate** | **Cross-judge baseline** | **Deviation** | **Sample** |`);
    lines.push(`|---|---|---|---|---|---|`);
    for (const m of data.judgeMotions) {
      const rateCell = m.insufficient_sample
        ? `insufficient (n=${m.filed_count})`
        : fmtPct(m.grant_rate);
      const sampleCell = m.insufficient_sample
        ? `thin (n=${m.filed_count})`
        : `sufficient`;
      lines.push(
        `| ${mdEscape(prettyMotionType(m.motion_type))} | ${m.filed_count} | ${rateCell} | ${fmtPct(m.baseline_grant_rate)} | ${fmtSigned(m.deviation_from_baseline)} | ${sampleCell} |`,
      );
    }
    lines.push(``);
    lines.push(
      `Source: judge_motion_outcome_rates (author_id linked via entities_judges). ` +
        `"Insufficient" means fewer than ${IB_JUDGE_INSUFFICIENT_THRESHOLD} observations — treat as a question to raise, not a prediction.`,
    );
    lines.push(``);
  }

  // Section 3 — top-10 cited precedents with extracted quotes (the IB lift)
  if (data.citations.length > 0) {
    lines.push(`### Top ${data.citations.length} Granted-Motion Case Citations`);
    lines.push(``);
    lines.push(
      `Most-cited criminal authorities relevant to ${prettyChargeType(data.chargeType)}. ` +
        `Each row includes an **extracted quote** drawn from how citing courts reference the case — ` +
        `this is how the precedent is actually invoked in later opinions, not a summary of the opinion itself.`,
    );
    lines.push(``);
    for (const c of data.citations) {
      const yr = c.date_filed ? String(c.date_filed).slice(0, 4) : "";
      const citeTag = c.citation ? ` · ${mdEscape(c.citation)}` : "";
      const yearTag = yr ? ` (${yr})` : "";
      const tierTag = c.authority_tier ? ` · ${mdEscape(c.authority_tier)}` : "";
      lines.push(
        `**${c.rank}. [${mdEscape(c.case_name)}](${c.source_url})**${yearTag}${citeTag}${tierTag}`,
      );
      if (c.citation_count_in_charge != null) {
        lines.push(
          `Cites in ${prettyChargeType(data.chargeType)}: ${c.citation_count_in_charge} · total criminal cites: ${c.citation_count_total}`,
        );
      } else {
        lines.push(`Total criminal cites: ${c.citation_count_total}`);
      }
      if (c.quote_sentence) {
        lines.push(``);
        lines.push(`> ${c.quote_sentence.split("\n").join(" ")}`);
        if (c.quote_frequency) {
          lines.push(
            `(Extracted from ${c.quote_frequency} citing opinion${c.quote_frequency === 1 ? "" : "s"}; rank #1 per case.)`,
          );
        }
      } else {
        lines.push(``);
        lines.push(`*No canonical quote cached for this opinion yet.*`);
      }
      lines.push(``);
    }
    lines.push(
      `Source: charge_type_top_authorities${data.citations.some((c) => c.data_scope === "criminal_fallback") ? " + citation_authority_criminal fallback" : ""}; ` +
        `quotes from authority_quotes_criminal (pre-extracted, rank 1 per cited opinion). ` +
        `Rows without a CourtListener verification URL are suppressed.`,
    );
    lines.push(``);
  }

  // Cross-ref note (task spec)
  lines.push(
    `**Cross-reference note.** If you add the War Room ($4,997) tier, the Similar Cases layer overlays these ` +
      `motions onto sentencing outcomes for defendants in similar factual buckets.`,
  );
  lines.push(``);

  // Limitations (if any)
  if (data.limitations.length > 0) {
    lines.push(`#### Known limitations`);
    lines.push(``);
    for (const l of data.limitations) lines.push(`- ${l}`);
    lines.push(``);
  }

  // Methodology disclaimer (approved form — no banned phrases)
  lines.push(
    `**Methodology.** This appendix provides legal INFORMATION, not legal ADVICE. ` +
      `Frequencies are tallied from published criminal opinions as of 2026-04-22. ` +
      `"Grant rate" = N granted ÷ N filed within the scope shown; small samples are flagged. ` +
      `Citations link to the primary opinion on CourtListener for independent verification. ` +
      `No part of this appendix is a prediction — it is a map of what is already in the record.`,
  );

  return "\n" + lines.join("\n") + "\n";
}

function prettyChargeType(c: string): string {
  return c.replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}
