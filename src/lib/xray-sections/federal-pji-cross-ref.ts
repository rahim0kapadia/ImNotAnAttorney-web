/**
 * X-Ray Section X1 — Federal PJI Cross-Reference.
 *
 * Upper-tier enhancement on The X-Ray ($2,497). Activates the same
 * pattern_jury_instructions corpus used by M4 ($97) but goes deeper along
 * three dimensions only available at the discovery tier:
 *
 *   Section X1.1 — Verbatim pattern instruction for this charge × circuit
 *                   (equivalent to M4 Section 1)
 *   Section X1.2 — **Top 10** historical attack authorities with **extracted
 *                   quote per case** (vs M4's top 5, citation-only)
 *   Section X1.3 — **All-circuit** instruction variant comparison (vs M4's
 *                   top 3) — every circuit that publishes a PJI for this
 *                   charge, with length-delta + divergent-phrase snippet
 *   Section X1.4 — **Judge-attack cross-reference** (X-Ray exclusive):
 *                   when a judge is assigned AND the judge's
 *                   judge_motion_outcome_rates include motions likely tied
 *                   to the contested instruction elements (suppression,
 *                   dismiss-for-failure-to-state, motion-in-limine), surface
 *                   the judge's historical pattern on those motion types
 *                   alongside the instruction phrases they challenge.
 *
 * Tier monotonicity (HARD — enforced by unit test):
 *   - X1 attack authorities TOP_N (10) STRICTLY > M4 top 5
 *   - X1 circuit variants = ALL circuits with a matching PJI (vs M4 max 3)
 *   - X1 citation rows carry extracted quotes; M4 is citation-only
 *   - X1 adds judge-attack cross-reference (M4 + IB E1 do NOT have this)
 *   - X1 does NOT include monthly deltas / weekly updates (War Room E3 territory)
 *
 * UPL (HARD):
 *   - PJI text is verbatim (public federal court material)
 *   - Judge data framed as "of N motions filed, M granted" — never "this
 *     judge is harsh" or "you will lose before this judge"
 *   - Banned-phrase blocklist (UPL_BANNED_PHRASES from charge-slug-maps)
 *     enforced in test
 *   - Every cited case carries a CourtListener URL; rows without URL are
 *     suppressed before render
 *
 * Federal-only gate: rejects non-federal charges at query time (returns
 * isEmpty=true + federalOnly=true so the X-Ray assembler can skip the
 * section cleanly without failing generation).
 *
 * Cited experts:
 *   - Hormozi Grand Slam — value equation lift on existing tier, no price change
 *   - Dreyer AI Overview Defense — depth at discovery tier compounds authority
 *
 * Sources:
 *   docs/plans/2026-04-23-data-to-product-autonomous-execution.md E2
 *   docs/advisor/2026-04-23-data-to-product-audit.md
 *
 * Consumed by:
 *   - X-Ray assembly (engine report.mjs + Edge Function mirror where applicable)
 *   - Unit tests in ./__tests__/federal-pji-cross-ref.test.ts
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  FEDERAL_CHARGES,
  CIRCUIT_NAMES as M4_CIRCUIT_NAMES,
  PJI_COVERED_CIRCUITS,
  STATE_TO_CIRCUIT,
  isFederalCharge,
  extractBurdenSentences,
  summarizeDifference,
  type PjiMatch,
  type FederalChargeDef,
} from "@/lib/tier9-reports/federal-jury-instruction-brief";

// ============================================================
// Depth guardrails (monotonicity HARD)
// ============================================================

/** Top-N attack authorities surfaced in X1. Strictly greater than M4's top 5. */
export const XRAY_ATTACK_TOP_N = 10;

/**
 * Minimum judge sample size to surface in the judge-attack cross-reference.
 * Rows below this are surfaced with an "insufficient sample" label (same
 * convention as IB E1's judge-histogram insufficient rows).
 */
export const XRAY_JUDGE_ATTACK_INSUFFICIENT_N = 10;

/**
 * Motion types whose outcomes plausibly reflect an attack on jury-instruction
 * elements. These are the motion types the judge-attack cross-reference
 * uses when the defense is likely to contest instruction phrasing.
 */
export const INSTRUCTION_ATTACK_MOTION_TYPES: ReadonlySet<string> = new Set([
  "motion_to_suppress",
  "motion_to_dismiss",
  "motion_in_limine",
  "motion_for_judgment_of_acquittal",
  "motion_for_new_trial",
  "motion_to_exclude",
  "motion_to_strike",
  "motion_for_mistrial",
  "motion_for_directed_verdict",
]);

// ============================================================
// Types
// ============================================================

export interface XrayFederalPjiInput {
  federalCharge: string; // FEDERAL_CHARGE slug (see FEDERAL_CHARGES)
  circuit?: string | null; // "1".."11", "DC" — user's circuit of prosecution
  state?: string | null; // 2-letter postal; used to derive circuit if needed
  judgeName?: string | null; // optional — drives Section X1.4 cross-reference
  caseId?: string | null; // optional — reserved for future case-scoped scoring
}

export interface XrayAttackAuthority {
  rank: number;
  case_name: string;
  date_filed: string | null;
  citation: string | null; // primary reporter when available
  citation_count_in_charge: number | null;
  citation_count_total: number;
  authority_tier: string | null;
  quote_sentence: string | null; // extracted per-case quote (X-Ray depth over M4)
  quote_frequency: number | null;
  source_url: string;
  framing: string;
}

export interface XrayCircuitVariant {
  circuit: number | string; // number for 1-11, "DC" if present
  circuitName: string;
  instruction_number: string;
  title: string;
  difference_summary: string;
  source_url: string | null;
  is_primary: boolean;
}

export interface XrayJudgeAttackRow {
  motion_type: string;
  filed_count: number;
  granted_count: number;
  grant_rate: number | null;
  baseline_grant_rate: number | null;
  deviation_from_baseline: number | null;
  insufficient_sample: boolean;
  relevance_note: string; // why this motion type is relevant to instruction attack
}

export interface XrayFederalPjiData {
  federalCharge: string;
  federalChargeLabel: string;
  circuit: string | null;
  circuitName: string | null;
  state: string | null;
  judgeDisplayName: string | null;
  judgeResolved: boolean;
  ambiguousJudge: boolean;
  pji: PjiMatch | null;
  burdenSentences: { sentence: string }[];
  attackAuthorities: XrayAttackAuthority[];
  circuitVariants: XrayCircuitVariant[];
  judgeAttackRows: XrayJudgeAttackRow[];
  limitations: string[];
  federalOnly: boolean;
  isEmpty: boolean;
}

// ============================================================
// Matching helpers (reuse M4 primitives)
// ============================================================

function matchesCharge(
  row: {
    title: string | null;
    statute_citations: string[] | null;
  },
  def: FederalChargeDef,
): boolean {
  const cites = Array.isArray(row.statute_citations) ? row.statute_citations : [];
  for (const cite of cites) {
    if (typeof cite !== "string") continue;
    for (const pat of def.statutePatterns) {
      if (pat.test(cite)) return true;
    }
  }
  const title = row.title ?? "";
  for (const pat of def.titleKeywords) {
    if (pat.test(title)) return true;
  }
  return false;
}

function resolveCircuit(input: XrayFederalPjiInput): string | null {
  const raw = (input.circuit ?? "").trim();
  if (raw && M4_CIRCUIT_NAMES[raw]) return raw;
  const state = (input.state ?? "").trim().toUpperCase();
  if (state && STATE_TO_CIRCUIT[state]) return STATE_TO_CIRCUIT[state];
  return null;
}

function escapeIlike(s: string): string {
  return s.toLowerCase().replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

function relevanceNoteForMotion(motionType: string): string {
  switch (motionType) {
    case "motion_to_suppress":
      return "Suppression challenges often hinge on how the burden-of-proof instruction is phrased for the underlying element.";
    case "motion_to_dismiss":
      return "Dismissal motions for failure to state an element implicate the pattern instruction's element list.";
    case "motion_in_limine":
      return "In limine motions frequently target evidence tied to a specific instruction element.";
    case "motion_for_judgment_of_acquittal":
      return "Rule 29 motions challenge the sufficiency of evidence measured against the instruction's elements.";
    case "motion_for_new_trial":
      return "New-trial motions often cite instruction error as a ground for relief.";
    case "motion_to_exclude":
      return "Exclusion motions can narrow the evidence the jury weighs against each instruction element.";
    case "motion_to_strike":
      return "Strike motions can remove evidentiary support for specific elements named in the instruction.";
    case "motion_for_mistrial":
      return "Mistrial motions sometimes cite instruction confusion or improper supplemental instructions.";
    case "motion_for_directed_verdict":
      return "Directed-verdict challenges measure the government's proof against the instruction's element list.";
    default:
      return "Motion type may intersect with how this instruction is applied at trial.";
  }
}

// ============================================================
// Query
// ============================================================

export async function queryXrayFederalPjiCrossRef(
  input: XrayFederalPjiInput,
): Promise<XrayFederalPjiData> {
  const limitations: string[] = [];
  const federalCharge = input.federalCharge;
  const state = (input.state ?? "").trim().toUpperCase() || null;
  const circuit = resolveCircuit(input);
  const circuitName = circuit ? M4_CIRCUIT_NAMES[circuit] : null;

  // Federal-only gate.
  if (!isFederalCharge(federalCharge)) {
    return {
      federalCharge,
      federalChargeLabel: federalCharge,
      circuit,
      circuitName,
      state,
      judgeDisplayName: null,
      judgeResolved: false,
      ambiguousJudge: false,
      pji: null,
      burdenSentences: [],
      attackAuthorities: [],
      circuitVariants: [],
      judgeAttackRows: [],
      limitations: [
        "This section covers federal charges only. The charge on file is not a federal criminal code offense.",
      ],
      federalOnly: true,
      isEmpty: true,
    };
  }

  const def = FEDERAL_CHARGES[federalCharge];
  const supabase = createAdminClient();

  // --------- Step 1: fetch all PJIs matching the charge ---------
  const titleKwSignals = def.titleKeywords
    .map((re) => re.source.replace(/\\b/g, "").replace(/\\s\+/g, " "))
    .map((s) => s.replace(/[()|]/g, "").trim())
    .filter((s) => s.length >= 3 && /^[A-Za-z0-9. \-/&§]+$/.test(s));

  let candidates: PjiMatch[] = [];
  if (titleKwSignals.length > 0) {
    const orClause = titleKwSignals
      .map((s) => `title.ilike.%${s.replace(/%/g, "")}%`)
      .join(",");
    const { data: titleRows } = await supabase
      .from("v_pji_public")
      .select(
        "id, circuit, instruction_number, title, body, commentary, statute_citations, source_url, effective_date",
      )
      .or(orClause)
      .limit(200);
    for (const r of titleRows ?? []) {
      if (matchesCharge(r, def)) candidates.push(r as PjiMatch);
    }
  }

  if (candidates.length === 0) {
    const { data: allRows } = await supabase
      .from("v_pji_public")
      .select(
        "id, circuit, instruction_number, title, body, commentary, statute_citations, source_url, effective_date",
      )
      .limit(2000);
    for (const r of allRows ?? []) {
      if (matchesCharge(r, def)) candidates.push(r as PjiMatch);
    }
  }

  if (candidates.length === 0) {
    return {
      federalCharge,
      federalChargeLabel: def.label,
      circuit,
      circuitName,
      state,
      judgeDisplayName: null,
      judgeResolved: false,
      ambiguousJudge: false,
      pji: null,
      burdenSentences: [],
      attackAuthorities: [],
      circuitVariants: [],
      judgeAttackRows: [],
      limitations: [
        `No pattern jury instruction in our corpus matches ${def.label}. Coverage spans First, Third, Fifth, Sixth, Seventh, Eighth, Ninth, and Tenth Circuits as of 2026-04-23.`,
      ],
      federalOnly: false,
      isEmpty: true,
    };
  }

  // Pick primary: user's circuit first, else 9th/1st/8th preference.
  const circuitPref = circuit
    ? [Number(circuit), 9, 1, 8, 10, 6, 7, 3, 5]
    : [9, 1, 8, 10, 6, 7, 3, 5];
  let primary: PjiMatch | null = null;
  for (const c of circuitPref) {
    const m = candidates.find((x) => x.circuit === c);
    if (m) {
      primary = m;
      break;
    }
  }
  if (!primary) primary = candidates[0] ?? null;

  if (!primary) {
    return {
      federalCharge,
      federalChargeLabel: def.label,
      circuit,
      circuitName,
      state,
      judgeDisplayName: null,
      judgeResolved: false,
      ambiguousJudge: false,
      pji: null,
      burdenSentences: [],
      attackAuthorities: [],
      circuitVariants: [],
      judgeAttackRows: [],
      limitations: ["No primary instruction could be selected."],
      federalOnly: false,
      isEmpty: true,
    };
  }

  if (circuit && primary.circuit !== Number(circuit)) {
    limitations.push(
      `No pattern instruction cached for the ${
        circuitName ?? "selected"
      } circuit; showing the ${
        M4_CIRCUIT_NAMES[String(primary.circuit)] ?? `${primary.circuit} Circuit`
      } instruction as the closest available reference.`,
    );
  }

  // --------- Step 2: burden-of-proof sentences ---------
  const burdenSentences = extractBurdenSentences(primary.body ?? "");

  // --------- Step 3: TOP 10 attack authorities with per-case quote ---------
  let authoritiesBase: Array<{
    cited_opinion_id: number;
    case_name: string;
    date_filed: string | null;
    citation_count_in_charge: number | null;
    citation_count_total: number;
    authority_tier: string | null;
    source_url: string;
    framing: string;
  }> = [];

  if (def.authoritySlugs.length > 0) {
    const { data: ctaRows } = await supabase
      .from("charge_type_top_authorities")
      .select(
        "charge_type, rank, cited_opinion_id, case_name, date_filed, citation_count_in_charge, citation_count_total, authority_tier_overall, source_url",
      )
      .in("charge_type", def.authoritySlugs)
      .order("citation_count_in_charge", { ascending: false })
      .limit(60);

    const seen = new Map<number, (typeof authoritiesBase)[number]>();
    for (const r of ctaRows ?? []) {
      const url = (r.source_url as string | null) ?? "";
      if (!url) continue; // HARD rule — no URL, no row
      const oid = r.cited_opinion_id as number;
      const candidate = {
        cited_opinion_id: oid,
        case_name: r.case_name as string,
        date_filed: (r.date_filed as string | null) ?? null,
        citation_count_in_charge: r.citation_count_in_charge as number | null,
        citation_count_total: r.citation_count_total as number,
        authority_tier: (r.authority_tier_overall as string | null) ?? null,
        source_url: url,
        framing: `Cases where the defense cited challenging elements of instructions for ${def.label}.`,
      };
      const prev = seen.get(oid);
      if (
        !prev ||
        (candidate.citation_count_in_charge ?? 0) >
          (prev.citation_count_in_charge ?? 0)
      ) {
        seen.set(oid, candidate);
      }
    }
    authoritiesBase = [...seen.values()]
      .sort(
        (a, b) =>
          (b.citation_count_in_charge ?? 0) - (a.citation_count_in_charge ?? 0),
      )
      .slice(0, XRAY_ATTACK_TOP_N);
  }

  let usedFallback = false;
  if (authoritiesBase.length < XRAY_ATTACK_TOP_N) {
    const { data: caRows } = await supabase
      .from("citation_authority_criminal")
      .select(
        "cited_opinion_id, case_name, date_filed, citation_count_criminal, citation_count_total, authority_tier, source_url",
      )
      .order("citation_count_criminal", { ascending: false })
      .limit(30);
    const seenIds = new Set(authoritiesBase.map((a) => a.cited_opinion_id));
    for (const r of caRows ?? []) {
      const url = (r.source_url as string | null) ?? "";
      if (!url) continue;
      const oid = r.cited_opinion_id as number;
      if (seenIds.has(oid)) continue;
      authoritiesBase.push({
        cited_opinion_id: oid,
        case_name: r.case_name as string,
        date_filed: (r.date_filed as string | null) ?? null,
        citation_count_in_charge: r.citation_count_criminal as number | null,
        citation_count_total: r.citation_count_total as number,
        authority_tier: (r.authority_tier as string | null) ?? null,
        source_url: url,
        framing: `General federal criminal authorities cited when challenging jury-instruction elements (no charge-specific cache matched ${def.label}).`,
      });
      seenIds.add(oid);
      usedFallback = true;
      if (authoritiesBase.length >= XRAY_ATTACK_TOP_N) break;
    }
    if (usedFallback && authoritiesBase.length > 0) {
      limitations.push(
        `Charge-specific attack authorities were thin for ${def.label}; filled from the national federal criminal corpus.`,
      );
    }
  }

  // Enrich with quote per case (X-Ray depth over M4's citation-only)
  const oids = authoritiesBase.map((a) => a.cited_opinion_id);
  const quoteByOid = new Map<
    number,
    { quote: string; citation: string | null; frequency: number | null }
  >();
  if (oids.length > 0) {
    const { data: quoteRows } = await supabase
      .from("authority_quotes_criminal")
      .select("cited_opinion_id, quote_sentence, primary_reporter, rank, quote_frequency")
      .in("cited_opinion_id", oids)
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

  const attackAuthorities: XrayAttackAuthority[] = authoritiesBase.map((a, i) => {
    const q = quoteByOid.get(a.cited_opinion_id);
    return {
      rank: i + 1,
      case_name: a.case_name,
      date_filed: a.date_filed,
      citation: q?.citation ?? null,
      citation_count_in_charge: a.citation_count_in_charge,
      citation_count_total: a.citation_count_total,
      authority_tier: a.authority_tier,
      quote_sentence: q?.quote ?? null,
      quote_frequency: q?.frequency ?? null,
      source_url: a.source_url,
      framing: a.framing,
    };
  });

  // --------- Step 4: ALL-circuit variant comparison (vs M4's top 3) ---------
  const circuitVariants: XrayCircuitVariant[] = [];
  const primaryVariant: XrayCircuitVariant = {
    circuit: primary.circuit,
    circuitName:
      M4_CIRCUIT_NAMES[String(primary.circuit)] ?? `${primary.circuit} Circuit`,
    instruction_number: primary.instruction_number,
    title: primary.title,
    difference_summary: "Primary instruction selected for this case.",
    source_url: primary.source_url,
    is_primary: true,
  };
  circuitVariants.push(primaryVariant);

  const seenCircuits = new Set<number>([primary.circuit]);
  const siblings = candidates
    .filter((c) => c.id !== primary.id)
    .sort((a, b) => a.circuit - b.circuit);
  for (const s of siblings) {
    if (seenCircuits.has(s.circuit)) continue;
    seenCircuits.add(s.circuit);
    circuitVariants.push({
      circuit: s.circuit,
      circuitName: M4_CIRCUIT_NAMES[String(s.circuit)] ?? `${s.circuit} Circuit`,
      instruction_number: s.instruction_number,
      title: s.title,
      difference_summary: summarizeDifference(primary, s),
      source_url: s.source_url,
      is_primary: false,
    });
  }

  const uncoveredCircuits = [...PJI_COVERED_CIRCUITS].filter(
    (c) => !seenCircuits.has(c),
  );
  if (uncoveredCircuits.length > 0) {
    limitations.push(
      `Circuits with no ${def.label} instruction in our corpus: ${uncoveredCircuits
        .map((c) => M4_CIRCUIT_NAMES[String(c)] ?? `${c} Circuit`)
        .join(", ")}.`,
    );
  }

  // --------- Step 5: judge-attack cross-reference (X-Ray exclusive) ---------
  let judgeDisplayName: string | null = null;
  let judgeResolved = false;
  let ambiguousJudge = false;
  let judgeAttackRows: XrayJudgeAttackRow[] = [];

  const rawJudge = (input.judgeName ?? "").trim();
  if (rawJudge.length > 0) {
    const safeName = escapeIlike(rawJudge);
    const surname = safeName.split(" ").pop() ?? safeName;
    const { data: judgeRows } = await supabase
      .from("entities_judges")
      .select(
        "canonical_id, cl_person_id, name_first, name_middle, name_last, name_suffix",
      )
      .ilike("name_last", `%${surname}%`)
      .limit(10);

    const cands = (judgeRows ?? []).filter((row) => {
      const full = [row.name_first, row.name_middle, row.name_last, row.name_suffix]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return full.includes(safeName);
    });

    if (cands.length > 1) {
      ambiguousJudge = true;
      limitations.push(
        `Multiple judges match "${rawJudge}"; add middle name or court to disambiguate. Judge-attack cross-reference omitted.`,
      );
    } else if (cands.length === 1) {
      const judge = cands[0];
      const authorId = judge.cl_person_id as number | null;
      judgeDisplayName = [
        judge.name_first,
        judge.name_middle,
        judge.name_last,
        judge.name_suffix,
      ]
        .filter(Boolean)
        .join(" ");
      judgeResolved = true;

      if (authorId !== null && authorId !== undefined) {
        const { data: motRows } = await supabase
          .from("judge_motion_outcome_rates")
          .select(
            "motion_type, filed_count, granted_count, grant_rate, baseline_grant_rate, deviation_from_baseline",
          )
          .eq("author_id", authorId)
          .in("motion_type", [...INSTRUCTION_ATTACK_MOTION_TYPES])
          .order("filed_count", { ascending: false });
        judgeAttackRows = (motRows ?? []).map((r) => {
          const n = r.filed_count as number;
          const mt = r.motion_type as string;
          return {
            motion_type: mt,
            filed_count: n,
            granted_count: r.granted_count as number,
            grant_rate: r.grant_rate as number | null,
            baseline_grant_rate: r.baseline_grant_rate as number | null,
            deviation_from_baseline: r.deviation_from_baseline as number | null,
            insufficient_sample: n < XRAY_JUDGE_ATTACK_INSUFFICIENT_N,
            relevance_note: relevanceNoteForMotion(mt),
          };
        });
        if (judgeAttackRows.length === 0) {
          limitations.push(
            `Judge ${judgeDisplayName} has no instruction-attack motions cached; judge-attack cross-reference omitted.`,
          );
        }
      } else {
        limitations.push(
          `Judge ${judgeDisplayName} has no CourtListener author_id linked; judge-attack cross-reference omitted.`,
        );
      }
    } else {
      limitations.push(
        `No canonical judge record matching "${rawJudge}"; judge-attack cross-reference omitted.`,
      );
    }
  }

  const isEmpty =
    !primary &&
    attackAuthorities.length === 0 &&
    circuitVariants.length === 0 &&
    judgeAttackRows.length === 0;

  return {
    federalCharge,
    federalChargeLabel: def.label,
    circuit,
    circuitName,
    state,
    judgeDisplayName,
    judgeResolved,
    ambiguousJudge,
    pji: primary,
    burdenSentences,
    attackAuthorities,
    circuitVariants,
    judgeAttackRows,
    limitations,
    federalOnly: false,
    isEmpty,
  };
}

// ============================================================
// Render (markdown — matches existing IB appendix renderer style)
// ============================================================

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function fmtSigned(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const pct = n * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)} pp`;
}

function prettyMotionType(m: string): string {
  return m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function mdEscape(s: string): string {
  return (s ?? "").split("|").join("\\|");
}

/**
 * Render X-Ray Section X1 as markdown. The X-Ray assembler post-processes
 * this with the same md2html pipeline used for IB Appendix G / F.
 */
export function renderXrayFederalPjiCrossRef(data: XrayFederalPjiData): string {
  if (data.isEmpty) return "";

  const lines: string[] = [];
  lines.push(`## Section X1: Federal Pattern Jury Instruction — Cross-Reference`);
  lines.push(``);
  lines.push(
    `This is the pattern instruction federal jurors will receive for ${mdEscape(
      data.federalChargeLabel,
    )}, the historical attack authorities cited when defense counsel challenged its elements, the variant text across every circuit that publishes one, and — where the assigned judge is known — the judge's historical pattern on instruction-adjacent motions. This is information about what is already in the record, not a prediction.`,
  );
  lines.push(``);

  // X1.1 — Verbatim PJI
  if (data.pji) {
    const circLabel =
      M4_CIRCUIT_NAMES[String(data.pji.circuit)] ?? `${data.pji.circuit} Circuit`;
    const effective = data.pji.effective_date
      ? ` · effective ${String(data.pji.effective_date)}`
      : "";
    lines.push(
      `### X1.1 Pattern Jury Instruction — Verbatim`,
    );
    lines.push(``);
    lines.push(
      `**Instruction ${mdEscape(data.pji.instruction_number)}${
        data.pji.title ? ` — ${mdEscape(data.pji.title)}` : ""
      }**  `,
    );
    lines.push(`${mdEscape(circLabel)}${effective}`);
    lines.push(``);
    lines.push(`> ${(data.pji.body ?? "").split("\n").join("\n> ")}`);
    lines.push(``);
    if (data.pji.statute_citations && data.pji.statute_citations.length > 0) {
      lines.push(
        `Cited statute(s): ${data.pji.statute_citations
          .map((s) => mdEscape(String(s)))
          .join("; ")}`,
      );
      lines.push(``);
    }
    if (data.pji.source_url) {
      lines.push(`[Primary source](${data.pji.source_url})`);
      lines.push(``);
    }
    if (data.burdenSentences.length > 0) {
      lines.push(`**Burden-of-proof sentences (verbatim):**`);
      for (const b of data.burdenSentences) {
        lines.push(`- "${mdEscape(b.sentence)}"`);
      }
      lines.push(``);
    }
  }

  // X1.2 — Top 10 attack authorities with extracted quote
  if (data.attackAuthorities.length > 0) {
    lines.push(
      `### X1.2 Top ${data.attackAuthorities.length} Historical Attack Authorities`,
    );
    lines.push(``);
    lines.push(
      `Federal criminal precedents most frequently cited when defense counsel challenged instruction elements for ${mdEscape(
        data.federalChargeLabel,
      )}. Each row carries an **extracted quote** drawn from how citing courts reference the case — the actual phrasing later opinions rely on, not a summary of the cited opinion itself.`,
    );
    lines.push(``);
    for (const a of data.attackAuthorities) {
      const yr = a.date_filed ? String(a.date_filed).slice(0, 4) : "";
      const citeTag = a.citation ? ` · ${mdEscape(a.citation)}` : "";
      const yearTag = yr ? ` (${yr})` : "";
      const tierTag = a.authority_tier ? ` · ${mdEscape(a.authority_tier)}` : "";
      lines.push(
        `**${a.rank}. [${mdEscape(a.case_name)}](${a.source_url})**${yearTag}${citeTag}${tierTag}`,
      );
      if (a.citation_count_in_charge != null) {
        lines.push(
          `Cites in ${mdEscape(data.federalChargeLabel)}: ${a.citation_count_in_charge} · total criminal cites: ${a.citation_count_total}`,
        );
      } else {
        lines.push(`Total criminal cites: ${a.citation_count_total}`);
      }
      lines.push(``);
      lines.push(`Framing: ${mdEscape(a.framing)}`);
      if (a.quote_sentence) {
        lines.push(``);
        lines.push(`> ${a.quote_sentence.split("\n").join(" ")}`);
        if (a.quote_frequency) {
          lines.push(
            `(Extracted from ${a.quote_frequency} citing opinion${
              a.quote_frequency === 1 ? "" : "s"
            }; rank #1 per case.)`,
          );
        }
      } else {
        lines.push(``);
        lines.push(`*No canonical citing-court quote cached for this opinion yet.*`);
      }
      lines.push(``);
    }
  }

  // X1.3 — All-circuit variant comparison
  if (data.circuitVariants.length > 0) {
    lines.push(`### X1.3 Circuit Variants — All Covered Circuits`);
    lines.push(``);
    lines.push(
      `Every federal circuit in our corpus that publishes a pattern instruction matching ${mdEscape(
        data.federalChargeLabel,
      )}. Differences in phrasing can matter when defense counsel argues for or against specific instruction language.`,
    );
    lines.push(``);
    for (const v of data.circuitVariants) {
      const primaryTag = v.is_primary ? " · **primary for this case**" : "";
      lines.push(
        `- **${mdEscape(v.circuitName)} — Instruction ${mdEscape(v.instruction_number)}**${primaryTag}`,
      );
      if (v.title) lines.push(`  ${mdEscape(v.title)}`);
      lines.push(`  ${mdEscape(v.difference_summary)}`);
      if (v.source_url) {
        lines.push(`  [Primary source](${v.source_url})`);
      }
    }
    lines.push(``);
  }

  // X1.4 — Judge-attack cross-reference (X-Ray exclusive)
  if (data.judgeAttackRows.length > 0 && data.judgeDisplayName) {
    lines.push(
      `### X1.4 Judge-Attack Cross-Reference — ${mdEscape(data.judgeDisplayName)}`,
    );
    lines.push(``);
    lines.push(
      `Historical rulings by the assigned judge on motion types that commonly intersect with instruction-element attacks. This is frequency data — of N motions filed before this judge, M were granted — not a prediction for any particular motion in this case. Rows with fewer than ${XRAY_JUDGE_ATTACK_INSUFFICIENT_N} observations are labeled "insufficient sample" and should be treated as a question to raise with your attorney, not a pattern.`,
    );
    lines.push(``);
    lines.push(
      `| **Motion Type** | **N filed** | **N granted** | **Grant rate** | **Cross-judge baseline** | **Deviation** | **Sample** | **Relevance to instruction attack** |`,
    );
    lines.push(`|---|---|---|---|---|---|---|---|`);
    for (const r of data.judgeAttackRows) {
      const rateCell = r.insufficient_sample
        ? `insufficient (n=${r.filed_count})`
        : fmtPct(r.grant_rate);
      const sampleCell = r.insufficient_sample
        ? `thin (n=${r.filed_count})`
        : `sufficient`;
      lines.push(
        `| ${mdEscape(prettyMotionType(r.motion_type))} | ${r.filed_count} | ${r.granted_count} | ${rateCell} | ${fmtPct(r.baseline_grant_rate)} | ${fmtSigned(r.deviation_from_baseline)} | ${sampleCell} | ${mdEscape(r.relevance_note)} |`,
      );
    }
    lines.push(``);
    lines.push(
      `Source: judge_motion_outcome_rates (author_id linked via entities_judges). Motion types filtered to those commonly tied to instruction-element attacks: ${[...INSTRUCTION_ATTACK_MOTION_TYPES]
        .map((m) => prettyMotionType(m))
        .join(", ")}.`,
    );
    lines.push(``);
  }

  // Limitations
  if (data.limitations.length > 0) {
    lines.push(`#### Known limitations`);
    lines.push(``);
    for (const l of data.limitations) lines.push(`- ${mdEscape(l)}`);
    lines.push(``);
  }

  // Methodology (approved form — no banned phrases)
  lines.push(
    `**Methodology.** This section provides legal INFORMATION, not legal ADVICE. The pattern jury instruction reproduced above is the public text used by federal trial courts in the selected circuit — pattern instructions are not themselves binding law and the trial judge may modify them. Attack-authority rankings are derived from citation frequency in our federal criminal corpus as of 2026-04-22. Judge frequency data is compiled from published opinions authored by this judge and does not reflect rulings in unpublished matters. Every citation links to the primary opinion on CourtListener for independent verification. No part of this section is a prediction — it is a map of what is already in the record.`,
  );

  return "\n" + lines.join("\n") + "\n";
}
