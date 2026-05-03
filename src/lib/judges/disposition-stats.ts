/**
 * @file Judge Disposition-Time Benchmarks helper.
 *
 * Reads from the `judge_disposition_stats` + `district_disposition_stats`
 * matviews built by `supabase/migrations/20260503a_judge_disposition_stats.sql`.
 *
 * Used by:
 *   - Judge Question Brief ($197) — Sentencing Fingerprint section, signal 5
 *   - Intelligence Brief ($997) — Court Prep appendix, "How long this judge takes" line
 *   - X-Ray ($2,497) — Judge intel pre-pop block
 *
 * Coverage gate: returns null unless judge sample_n >= 30 AND a district baseline
 * exists. The 30-row floor is a Mercer-voice rule, NOT a matview constraint —
 * the matview keeps everything >= 5 (k-anonymity floor) so future product
 * surfaces (e.g. district-aggregate views) can read smaller samples without
 * re-shipping the matview.
 *
 * TICKET-2 (2026-05-03).
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// TYPES
// ============================================================

export type CaseClass = "criminal" | "civil";

/**
 * Coverage floor for client-facing render. Below this, the helper returns
 * null and the surface should fall back to district-only stats or omit the
 * "your judge takes N days" claim entirely.
 */
export const JUDGE_COVERAGE_FLOOR = 30;

export interface JudgeDispositionStats {
  /** entities_judges.cl_person_id (matches cl_dockets.assigned_to_id) */
  authorId: number;
  caseClass: CaseClass;
  sampleN: number;
  p25Days: number;
  medianDays: number;
  p75Days: number;
  /** court_id from cl_dockets (most common district for this judge) */
  primaryCourtId: string | null;
  /** Matview refresh timestamp; surface-by-product disclosure */
  dataAsOf: string;
}

export interface DistrictDispositionStats {
  courtId: string;
  caseClass: CaseClass;
  sampleN: number;
  p10Days: number;
  p25Days: number;
  medianDays: number;
  p75Days: number;
  p90Days: number;
  dataAsOf: string;
}

export interface JudgeDispositionResult {
  judge: JudgeDispositionStats;
  district: DistrictDispositionStats | null;
  /**
   * Where this judge falls in the district distribution as a percentile (0-100).
   *   - 50 = exactly at district median
   *   - 73 = takes longer than 73% of bench peers
   *   - 25 = faster than 75% of bench peers
   * null when no district baseline exists for the case_class.
   */
  judgePercentileInDistrict: number | null;
  /**
   * Multiplicative ratio: judge median / district median.
   *   - 1.0 = same as district
   *   - 1.4 = 40% slower than district
   *   - 0.7 = 30% faster than district
   * null when no district baseline exists.
   */
  judgeMedianRatio: number | null;
}

// ============================================================
// QUERIES
// ============================================================

/**
 * Returns disposition-time stats for a judge in a case class, plus the
 * district baseline + percentile rank. Returns null when the judge does not
 * meet the JUDGE_COVERAGE_FLOOR (30 cases).
 */
export async function getJudgeDispositionStats(
  authorId: number,
  caseClass: CaseClass,
): Promise<JudgeDispositionResult | null> {
  const supabase = createAdminClient();

  const { data: judgeRows, error: judgeErr } = await supabase
    .from("judge_disposition_stats")
    .select("author_id, case_class, sample_n, p25_days, median_days, p75_days, primary_court_id, data_as_of")
    .eq("author_id", authorId)
    .eq("case_class", caseClass)
    .limit(1);

  if (judgeErr) {
    // Treat DB error as "no data" rather than throwing — the caller should
    // omit the disposition-time line, not surface an error to the buyer.
    return null;
  }

  const judgeRow = judgeRows?.[0];
  if (!judgeRow) return null;
  if ((judgeRow.sample_n as number) < JUDGE_COVERAGE_FLOOR) return null;

  const judge: JudgeDispositionStats = {
    authorId: judgeRow.author_id as number,
    caseClass: judgeRow.case_class as CaseClass,
    sampleN: judgeRow.sample_n as number,
    p25Days: judgeRow.p25_days as number,
    medianDays: judgeRow.median_days as number,
    p75Days: judgeRow.p75_days as number,
    primaryCourtId: (judgeRow.primary_court_id as string | null) ?? null,
    dataAsOf: judgeRow.data_as_of as string,
  };

  let district: DistrictDispositionStats | null = null;
  let percentile: number | null = null;
  let ratio: number | null = null;

  if (judge.primaryCourtId) {
    const { data: distRows } = await supabase
      .from("district_disposition_stats")
      .select("court_id, case_class, sample_n, p10_days, p25_days, median_days, p75_days, p90_days, data_as_of")
      .eq("court_id", judge.primaryCourtId)
      .eq("case_class", caseClass)
      .limit(1);

    const distRow = distRows?.[0];
    if (distRow) {
      district = {
        courtId: distRow.court_id as string,
        caseClass: distRow.case_class as CaseClass,
        sampleN: distRow.sample_n as number,
        p10Days: distRow.p10_days as number,
        p25Days: distRow.p25_days as number,
        medianDays: distRow.median_days as number,
        p75Days: distRow.p75_days as number,
        p90Days: distRow.p90_days as number,
        dataAsOf: distRow.data_as_of as string,
      };
      percentile = computePercentileInDistribution(judge.medianDays, district);
      ratio = district.medianDays > 0
        ? Number((judge.medianDays / district.medianDays).toFixed(2))
        : null;
    }
  }

  return {
    judge,
    district,
    judgePercentileInDistrict: percentile,
    judgeMedianRatio: ratio,
  };
}

/**
 * Returns district-level baseline only (no judge required). Used for fallback
 * when the helper has no judge_id (operator did not enter judge name) or when
 * the judge is below coverage floor.
 */
export async function getDistrictDispositionStats(
  courtId: string,
  caseClass: CaseClass,
): Promise<DistrictDispositionStats | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("district_disposition_stats")
    .select("court_id, case_class, sample_n, p10_days, p25_days, median_days, p75_days, p90_days, data_as_of")
    .eq("court_id", courtId)
    .eq("case_class", caseClass)
    .limit(1);

  if (error || !data?.[0]) return null;

  const r = data[0];
  return {
    courtId: r.court_id as string,
    caseClass: r.case_class as CaseClass,
    sampleN: r.sample_n as number,
    p10Days: r.p10_days as number,
    p25Days: r.p25_days as number,
    medianDays: r.median_days as number,
    p75Days: r.p75_days as number,
    p90Days: r.p90_days as number,
    dataAsOf: r.data_as_of as string,
  };
}

// ============================================================
// PURE HELPERS (testable without DB)
// ============================================================

/**
 * Estimates where `value` falls in the district distribution as a percentile
 * (0-100), using piecewise-linear interpolation between the 5 anchor points
 * (p10, p25, p50, p75, p90).
 *
 * This is NOT exact — we don't have the raw distribution, only quintile
 * anchors — but it's good enough for "your judge takes longer than ~73% of
 * the bench" framing where the buyer doesn't need 0.5pt precision.
 */
export function computePercentileInDistribution(
  value: number,
  district: Pick<DistrictDispositionStats, "p10Days" | "p25Days" | "medianDays" | "p75Days" | "p90Days">,
): number {
  const anchors: Array<[number, number]> = [
    [district.p10Days, 10],
    [district.p25Days, 25],
    [district.medianDays, 50],
    [district.p75Days, 75],
    [district.p90Days, 90],
  ];

  // Strictly below p10 — clamp to 5 (we don't know exactly how far below)
  if (value < anchors[0][0]) return 5;
  // Strictly above p90 — clamp to 95
  if (value > anchors[anchors.length - 1][0]) return 95;

  // Find the bracketing anchors and linearly interpolate
  for (let i = 0; i < anchors.length - 1; i++) {
    const [lowDays, lowPct] = anchors[i];
    const [highDays, highPct] = anchors[i + 1];
    if (value >= lowDays && value <= highDays) {
      if (highDays === lowDays) return lowPct;
      const t = (value - lowDays) / (highDays - lowDays);
      return Math.round(lowPct + t * (highPct - lowPct));
    }
  }

  // Should be unreachable given the above guards
  return 50;
}

/**
 * Builds a `<judge_disposition_data>` addendum block to append to the
 * `judgeResearch` string passed to the IB pipeline. The IB Court Prep prompt
 * (and any downstream prompt that reads `judge_research_data`) sees this as
 * structured context Mercer can quote without inventing.
 *
 * Why a text block (not a typed field): keeps the IBVariables contract stable
 * + Deno-mirrored. The Edge Function builds judgeResearch by string-joining;
 * this helper provides the canonical TICKET-2 segment.
 *
 * Returns empty string when result is null so callers can unconditionally
 * concat without null-checks.
 */
export function buildJudgeDispositionResearchBlock(
  result: JudgeDispositionResult | null,
): string {
  if (!result) return "";
  const { judge, district, judgePercentileInDistrict, judgeMedianRatio } = result;
  const lines: string[] = [];
  lines.push("<judge_disposition_data>");
  lines.push(`source: cl_dockets matview judge_disposition_stats (TICKET-2, refreshed weekly)`);
  lines.push(`case_class: ${judge.caseClass}`);
  lines.push(`judge_sample_n: ${judge.sampleN}`);
  lines.push(`judge_median_days: ${judge.medianDays}`);
  lines.push(`judge_p25_days: ${judge.p25Days}`);
  lines.push(`judge_p75_days: ${judge.p75Days}`);
  if (judge.primaryCourtId) lines.push(`judge_primary_court: ${judge.primaryCourtId}`);
  if (district) {
    lines.push(`district_sample_n: ${district.sampleN}`);
    lines.push(`district_median_days: ${district.medianDays}`);
    lines.push(`district_p10_p25_p75_p90_days: ${district.p10Days}/${district.p25Days}/${district.p75Days}/${district.p90Days}`);
  }
  if (judgePercentileInDistrict !== null) lines.push(`judge_percentile_in_district: ${judgePercentileInDistrict}`);
  if (judgeMedianRatio !== null) lines.push(`judge_median_ratio_vs_district: ${judgeMedianRatio}`);
  lines.push(`headline_line: ${renderDispositionLine(result) ?? ""}`);
  lines.push("</judge_disposition_data>");
  return lines.join("\n");
}

/**
 * Returns a Mercer-voice phrase suitable for direct embed in IB / JRC copy.
 * Falls through to district-only phrasing when judge data unavailable.
 *
 * Voice rule: information-side, no advice. UPL-safe.
 */
export function renderDispositionLine(result: JudgeDispositionResult | null): string | null {
  if (!result) return null;
  const { judge, district, judgePercentileInDistrict, judgeMedianRatio } = result;

  const months = Math.round(judge.medianDays / 30);
  const jLabel = months >= 12
    ? `${(judge.medianDays / 365).toFixed(1)} years`
    : `~${months} months`;

  if (district && judgePercentileInDistrict !== null && judgeMedianRatio !== null) {
    const districtMonths = Math.round(district.medianDays / 30);
    const dLabel = districtMonths >= 12
      ? `${(district.medianDays / 365).toFixed(1)} years`
      : `~${districtMonths} months`;

    if (judgePercentileInDistrict >= 60) {
      return `Your judge closes ${judge.caseClass} cases in ${jLabel} — longer than ${judgePercentileInDistrict}% of the bench in this district (district median ${dLabel}). Plan for the longer runway.`;
    }
    if (judgePercentileInDistrict <= 40) {
      return `Your judge closes ${judge.caseClass} cases in ${jLabel} — faster than ${100 - judgePercentileInDistrict}% of the bench in this district (district median ${dLabel}). Filings move quickly here.`;
    }
    return `Your judge closes ${judge.caseClass} cases in ${jLabel}, near the district median (${dLabel}). Pace is typical.`;
  }

  // No district baseline — judge-only
  return `Your judge closes ${judge.caseClass} cases in ${jLabel} (median over ${judge.sampleN} cases).`;
}
