/**
 * War Room — Judge × Prosecutor Pairing Matrix.
 *
 * Plan: docs/plans/2026-04-29-worry-data-orphans-product-gaps.md (T1).
 * Tier-distinct artifact promised at product-tiers.md:17 ("War Room
 * adds: judge×prosecutor pairing matrix"). Existing reads of
 * `judge_prosecutor_pairings` surface either a single judge's row set
 * (Judge Report Card $197) or aggregated prosecution patterns
 * (district intel) — neither produces the matrix shape this module
 * defines.
 *
 * Cited rule: ~/.claude/rules/no-hallucinated-legal-data.md — every
 * row rendered must have non-empty source_urls. Filter at query time +
 * row-level guard at render time. HTTPS-only on rendered URLs.
 *
 * UPL note: data shape is informational only (rates + sample sizes).
 * Render layer must keep callouts on the information side of the line.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeIlike } from "@/lib/util/escape-postgrest-filter";

/**
 * Hard floor mirroring defense-intelligence/query.ts:145
 * (MINIMUM_SAMPLE_SIZE = 5). No statistic with N < 5 surfaces.
 */
export const MATRIX_MINIMUM_SAMPLE_SIZE = 5;

/** Cap rows to keep the matrix readable on a portal page. */
export const MATRIX_MAX_ROWS = 200;

/** ASCII unit separator — collision-safe key joiner for cellMap. */
const CELL_KEY_SEP = "\x1f";

export interface PairingRow {
  judge_id: string;
  judge_name: string | null;
  prosecutor_name: string;
  motion_type: string;
  grant_rate: number;
  sample_size: number;
  source_urls: string[];
}

export interface PairingMatrixCell {
  prosecutor_name: string;
  motion_type: string;
  grant_rate: number;
  sample_size: number;
  source_urls: string[];
}

export interface PairingMatrixResult {
  /** Resolved judge ids touched by this case. */
  judgeIds: string[];
  /** All raw rows that passed source_urls + sample_size guards. */
  rows: PairingRow[];
  /** Matrix grouped by prosecutor x motion_type. */
  cells: PairingMatrixCell[];
  /** Distinct prosecutor names (matrix row labels). */
  prosecutors: string[];
  /** Distinct motion_types (matrix column labels). */
  motionTypes: string[];
  /** True when no rows passed the guards. */
  isEmpty: boolean;
  /** Reason for empty result — used by render-layer fallback copy. */
  emptyReason: "no-judge-resolved" | "no-rows-passed-guards" | null;
}

/**
 * Resolve `phase2_data.judge_name` (single string, verified at
 * intelligence-brief/variables.ts:57) to `judge_profiles.id` UUIDs.
 *
 * Mirrors queryJudgeReportCard's lookup at tier9-reports/query.ts:725 —
 * jurisdiction-filtered first, name-only fallback.
 *
 * Returns at most 5 candidate ids. Empty array on no match (caller
 * falls back to skip-render).
 */
export async function resolveCaseJudgeIds(args: {
  judgeName: string | null | undefined;
  state: string | null | undefined;
}): Promise<string[]> {
  const judgeName = (args.judgeName ?? "").trim();
  if (!judgeName) return [];
  const safeName = escapeIlike(judgeName);
  const supabase = createAdminClient();

  // Jurisdiction-filtered lookup first.
  let { data } = args.state
    ? await supabase
        .from("judge_profiles")
        .select("id")
        .ilike("full_name", `%${safeName}%`)
        .eq("jurisdiction", args.state)
        .limit(5)
    : { data: null };

  if (!data || data.length === 0) {
    const fb = await supabase
      .from("judge_profiles")
      .select("id")
      .ilike("full_name", `%${safeName}%`)
      .limit(5);
    data = fb.data ?? [];
  }

  return (data ?? []).map((r) => r.id as string);
}

/**
 * Pull pairings for the resolved judge ids. Filters in DB:
 *   - judge_id IN (caseJudgeIds)
 *   - source_urls IS NOT NULL AND source_urls != '{}'
 *   - sample_size >= MATRIX_MINIMUM_SAMPLE_SIZE
 * Order: sample_size DESC. Cap: MATRIX_MAX_ROWS.
 *
 * Row-level render guard still re-verifies source_urls.length > 0 + https://.
 */
export async function queryPairingMatrix(args: {
  caseJudgeIds: string[];
  judgeNameFallback?: string | null;
}): Promise<PairingMatrixResult> {
  const judgeIds = args.caseJudgeIds.filter(Boolean);
  if (judgeIds.length === 0) {
    return {
      judgeIds: [],
      rows: [],
      cells: [],
      prosecutors: [],
      motionTypes: [],
      isEmpty: true,
      emptyReason: "no-judge-resolved",
    };
  }

  const supabase = createAdminClient();

  // Pull pairings + the judges' names in parallel.
  const [pairingsRes, judgesRes] = await Promise.all([
    supabase
      .from("judge_prosecutor_pairings")
      .select("judge_id, prosecutor_name, motion_type, grant_rate, sample_size, source_urls")
      .in("judge_id", judgeIds)
      .not("source_urls", "is", null)
      .not("source_urls", "eq", "{}")
      .gte("sample_size", MATRIX_MINIMUM_SAMPLE_SIZE)
      .order("sample_size", { ascending: false })
      .limit(MATRIX_MAX_ROWS),
    supabase
      .from("judge_profiles")
      .select("id, full_name")
      .in("id", judgeIds),
  ]);

  const judgeNameById = new Map<string, string | null>();
  for (const j of judgesRes.data ?? []) {
    judgeNameById.set(j.id as string, (j.full_name as string | null) ?? null);
  }

  const rows: PairingRow[] = (pairingsRes.data ?? [])
    .filter((r) => Array.isArray(r.source_urls) && (r.source_urls as string[]).length > 0)
    .filter((r) => typeof r.prosecutor_name === "string" && r.prosecutor_name.length > 0)
    .map((r) => ({
      judge_id: r.judge_id as string,
      judge_name: judgeNameById.get(r.judge_id as string) ?? null,
      prosecutor_name: r.prosecutor_name as string,
      motion_type: (r.motion_type as string) ?? "(uncategorized)",
      grant_rate: Number(r.grant_rate ?? 0),
      sample_size: Number(r.sample_size ?? 0),
      source_urls: r.source_urls as string[],
    }));

  if (rows.length === 0) {
    return {
      judgeIds,
      rows: [],
      cells: [],
      prosecutors: [],
      motionTypes: [],
      isEmpty: true,
      emptyReason: "no-rows-passed-guards",
    };
  }

  // Build matrix shape: one cell per (prosecutor x motion_type) pair.
  // Multiple judges feeding the same pair averages by sample_size weight.
  // Key uses CELL_KEY_SEP (ASCII unit separator) — collision-safe between
  // names like "AB"+"CD" vs "A"+"BCD".
  const cellMap = new Map<string, { sumWeighted: number; sumSamples: number; urls: Set<string>; prosecutor: string; motion: string }>();
  for (const r of rows) {
    const key = r.prosecutor_name + CELL_KEY_SEP + r.motion_type;
    const slot = cellMap.get(key) ?? { sumWeighted: 0, sumSamples: 0, urls: new Set<string>(), prosecutor: r.prosecutor_name, motion: r.motion_type };
    slot.sumWeighted += r.grant_rate * r.sample_size;
    slot.sumSamples += r.sample_size;
    // HTTPS-only filter (defense-in-depth XSS + no-hallucinated-legal-data).
    for (const u of r.source_urls) {
      if (typeof u === "string" && /^https:\/\//i.test(u)) slot.urls.add(u);
    }
    cellMap.set(key, slot);
  }

  const cells: PairingMatrixCell[] = Array.from(cellMap.values()).map((slot) => ({
    prosecutor_name: slot.prosecutor,
    motion_type: slot.motion,
    grant_rate: slot.sumSamples > 0 ? slot.sumWeighted / slot.sumSamples : 0,
    sample_size: slot.sumSamples,
    source_urls: Array.from(slot.urls),
  }));

  const prosecutors = Array.from(new Set(cells.map((c) => c.prosecutor_name))).sort();
  const motionTypes = Array.from(new Set(cells.map((c) => c.motion_type))).sort();

  return {
    judgeIds,
    rows,
    cells,
    prosecutors,
    motionTypes,
    isEmpty: false,
    emptyReason: null,
  };
}

/**
 * Build defendant-facing callouts (≤ 27 words each, 3 AM crisis-buyer
 * test, UPL-safe — informational only, never directive).
 *
 * UPL constraint (april-dunford W1 finding): callouts surface the rate
 * and the comparison only. NEVER a motion-type → action mapping.
 * "Your judge grants suppression motions at 34%" = OK.
 * "consider challenging the stop" = NOT OK.
 *
 * Picks the up-to-3 LOWEST grant_rate cells with sample_size >= floor.
 * If district average is unknown, the callout phrasing avoids comparison.
 */
export function buildPairingCallouts(matrix: PairingMatrixResult, options?: { maxCallouts?: number }): string[] {
  if (matrix.isEmpty || matrix.cells.length === 0) return [];
  const max = options?.maxCallouts ?? 3;

  // Average across all cells = the case's "district floor" approximation.
  const totalSamples = matrix.cells.reduce((acc, c) => acc + c.sample_size, 0);
  const districtAvg =
    totalSamples > 0
      ? matrix.cells.reduce((acc, c) => acc + c.grant_rate * c.sample_size, 0) / totalSamples
      : null;

  const sorted = [...matrix.cells].sort((a, b) => a.grant_rate - b.grant_rate);
  const lowest = sorted.slice(0, max);

  return lowest.map((c) => {
    const ratePct = Math.round(c.grant_rate * 100);
    const motion = c.motion_type.toLowerCase();
    if (districtAvg !== null && Math.abs(districtAvg - c.grant_rate) > 0.05) {
      const avgPct = Math.round(districtAvg * 100);
      return `Your judge grants ${motion} motions at ${ratePct}% — below the ${avgPct}% rate seen across other prosecutors in your data.`;
    }
    return `Your judge grants ${motion} motions at ${ratePct}% in cases with this prosecutor (n=${c.sample_size}).`;
  });
}
