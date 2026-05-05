/**
 * src/lib/district-court/query.ts
 *
 * District-level aggregate queries for the per-district court intelligence pages.
 *
 * Query path:
 *   - mv_judge_docket_caseload  — total/criminal/civil dockets per judge
 *   - judge_profiles             — name + cl_person_id
 *   - mv_judge_bench_fingerprint — Booker inflection (downward_departure_rate)
 *
 * Cited expert: Lukas Fittl — parallel SELECTs over indexed matviews vs
 * single mega-JOIN: predictable plan + isolated failure mode per slice.
 * Pattern matches cross-corpus/closed-ecosystem.ts and cross-corpus/bench-fingerprint.ts.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ─── Result types ──────────────────────────────────────────────────────────────

export interface DistrictJudgeRow {
  cl_person_id: string;
  full_name: string;
  total_dockets: number;
  criminal_dockets: number;
  criminal_fraction: number | null;
}

export interface DistrictAggregates {
  /** CourtListener court_id filter used. */
  districtCode: string;
  /** ISO timestamp of the query. */
  generatedAt: string;
  /** Top judges by total docket count, max 10. */
  topJudges: DistrictJudgeRow[];
  /** Mean criminal_fraction across all judges with data for this district. */
  avgCriminalFraction: number | null;
  /** Sum of all total_dockets for this district. */
  totalDockets: number;
  /** Count of judges with data found. */
  judgeCount: number;
  /**
   * District-level Booker inflection proxy: mean downward_departure_rate
   * across judges in mv_judge_bench_fingerprint who are associated with
   * this district code.
   */
  bookerInflection: number | null;
}

// ─── Query ────────────────────────────────────────────────────────────────────

/**
 * Returns district-level aggregates for a given CourtListener court_id code.
 *
 * Graceful degradation: if a matview has no rows for the district, the
 * relevant fields are null rather than throwing. Pages disclose thin coverage.
 */
export async function queryDistrictAggregates(
  districtCode: string
): Promise<DistrictAggregates> {
  const supabase = createAdminClient();
  const generatedAt = new Date().toISOString();
  const code = districtCode.toLowerCase();

  // ── Slice 1: judge docket caseload for this district ──────────────────────
  //
  // mv_judge_docket_caseload has primary_court_id = CourtListener court_id.
  // We also pull judge_cl_person_id to join to judge_profiles for names.
  // PostgREST returns max 1000 rows per page; federal districts rarely exceed
  // 150 active judges — single page is sufficient.
  const { data: caseloadRows } = await supabase
    .from("mv_judge_docket_caseload")
    .select(
      "judge_cl_person_id, total_dockets, criminal_dockets, civil_dockets, criminal_fraction"
    )
    .eq("primary_court_id", code)
    .order("total_dockets", { ascending: false })
    .limit(200);

  const rows = (caseloadRows ?? []) as Array<{
    judge_cl_person_id: string | number;
    total_dockets: number | null;
    criminal_dockets: number | null;
    civil_dockets: number | null;
    criminal_fraction: string | number | null;
  }>;

  if (rows.length === 0) {
    // No caseload data for this district — return empty aggregates.
    return {
      districtCode: code,
      generatedAt,
      topJudges: [],
      avgCriminalFraction: null,
      totalDockets: 0,
      judgeCount: 0,
      bookerInflection: null,
    };
  }

  // ── Slice 2: judge names from judge_profiles ───────────────────────────────
  //
  // Batch fetch all cl_person_ids for this district in one query.
  const personIds = rows
    .map((r) => String(r.judge_cl_person_id))
    .filter(Boolean);

  const { data: profileRows } = await supabase
    .from("judge_profiles")
    .select("cl_person_id, full_name")
    .in("cl_person_id", personIds);

  const nameMap = new Map<string, string>();
  for (const p of profileRows ?? []) {
    const pid = p as { cl_person_id: string | null; full_name: string | null };
    if (pid.cl_person_id) nameMap.set(String(pid.cl_person_id), pid.full_name ?? "(unknown)");
  }

  // ── Slice 3: Booker inflection from mv_judge_bench_fingerprint ────────────
  //
  // mv_judge_bench_fingerprint has a `district` column (CourtListener court_id).
  // Mean downward_departure_rate across the district's judges = Booker proxy.
  const { data: fingerprintRows } = await supabase
    .from("mv_judge_bench_fingerprint")
    .select("downward_departure_rate")
    .eq("district", code)
    .limit(200);

  const fpRows = (fingerprintRows ?? []) as Array<{
    downward_departure_rate: string | number | null;
  }>;

  let bookerInflection: number | null = null;
  const validRates = fpRows
    .map((r) => (r.downward_departure_rate != null ? parseFloat(String(r.downward_departure_rate)) : null))
    .filter((v): v is number => v !== null && !isNaN(v));
  if (validRates.length > 0) {
    bookerInflection = validRates.reduce((a, b) => a + b, 0) / validRates.length;
  }

  // ── Aggregate across all district judges ──────────────────────────────────

  let totalDockets = 0;
  const crimFractions: number[] = [];

  const judgeRows: DistrictJudgeRow[] = rows.map((r) => {
    const total = r.total_dockets ?? 0;
    const criminal = r.criminal_dockets ?? 0;
    const cf = r.criminal_fraction != null
      ? parseFloat(String(r.criminal_fraction))
      : null;
    totalDockets += total;
    if (cf !== null && !isNaN(cf)) crimFractions.push(cf);
    return {
      cl_person_id: String(r.judge_cl_person_id),
      full_name: nameMap.get(String(r.judge_cl_person_id)) ?? "(unknown)",
      total_dockets: total,
      criminal_dockets: criminal,
      criminal_fraction: cf,
    };
  });

  const avgCriminalFraction =
    crimFractions.length > 0
      ? crimFractions.reduce((a, b) => a + b, 0) / crimFractions.length
      : null;

  // Top 10 by total_dockets (already sorted by the DB query)
  const topJudges = judgeRows.slice(0, 10);

  return {
    districtCode: code,
    generatedAt,
    topJudges,
    avgCriminalFraction,
    totalDockets,
    judgeCount: rows.length,
    bookerInflection,
  };
}
