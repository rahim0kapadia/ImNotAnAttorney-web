// src/lib/cross-corpus/intelligence-brief-subset.ts
//
// Intelligence Brief ($997) cross-corpus judge intelligence subset.
//
// Deliberately EXCLUDES:
//   - mv_judge_officer_motion_rates (officer-judge rates) — X-Ray differentiator
//   - case_feature_vectors similar-cases full map — X-Ray differentiator
//   - arrestingOfficer profile slice — X-Ray differentiator
//
// Includes:
//   - mv_judge_bench_fingerprint (sentencing fingerprint)
//   - mv_judge_docket_caseload (caseload + criminal fraction)
//   - judge_civil_party_conflicts (financial disclosures, up to 5)
//
// Cited expert: Lukas Fittl — parallel SELECTs over indexed matviews vs single
// mega-JOIN; each slice fails independently so a missing matview row yields null,
// not a thrown error.

import { createAdminClient } from "@/lib/supabase/admin";
import type { JudgeDocketCaseload, JudgeConflictSignal } from "./types";

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export interface IBJudgeIntelligenceInput {
  judgeFullName?: string | null;
  state: string;
  caseId: string;
}

export interface IBBenchSlice {
  cl_person_id: number;
  profile_name: string;
  district: string | null;
  total_cases: number;
  median_sentence_months: number | null;
  mean_sentence_months: number | null;
  p25_sentence_months: number | null;
  p75_sentence_months: number | null;
  downward_departure_rate: number | null;
  upward_departure_rate: number | null;
  substantial_assistance_rate: number | null;
}

export interface IBJudgeIntelligenceResult {
  meta: {
    generatedAt: string;
    case_id: string;
    judgeResolved: boolean;
  };
  judge: {
    id: string | null;
    cl_person_id: number | null;
    full_name: string;
    court: string | null;
  } | null;
  bench: IBBenchSlice | null;
  caseload: JudgeDocketCaseload | null;
  conflicts: JudgeConflictSignal[];
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function pf(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

function escapeILike(s: string): string {
  return s.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// ────────────────────────────────────────────────────────────────
// Query
// ────────────────────────────────────────────────────────────────

/**
 * IB-J — Intelligence Brief judge intelligence subset.
 *
 * Pulls bench fingerprint + docket caseload + financial conflicts for
 * the named judge. Excludes officer-judge rates and similar-cases full
 * map (those are X-Ray-only to maintain tier differentiation).
 *
 * Returns null slices (not thrown errors) when a judge cannot be resolved
 * or when a matview has no matching row — callers render graceful "no data"
 * rather than crashing.
 */
export async function queryIBJudgeIntelligence(
  input: IBJudgeIntelligenceInput
): Promise<IBJudgeIntelligenceResult> {
  const supabase = createAdminClient();
  const generatedAt = new Date().toISOString();

  const empty = (): IBJudgeIntelligenceResult => ({
    meta: { generatedAt, case_id: input.caseId, judgeResolved: false },
    judge: null,
    bench: null,
    caseload: null,
    conflicts: [],
  });

  if (!input.judgeFullName?.trim()) return empty();

  // ── Slice 0: resolve judge_profiles row ─────────────────────
  const { data: profileData } = await supabase
    .from("judge_profiles")
    .select("id, cl_person_id, full_name, court")
    .ilike("full_name", `%${escapeILike(input.judgeFullName.trim())}%`)
    .limit(1)
    .maybeSingle();

  if (!profileData) return empty();

  const judgeId: string = profileData.id;
  const clPersonId: number | null = profileData.cl_person_id
    ? parseInt(String(profileData.cl_person_id), 10)
    : null;

  const judgeSlice = {
    id: judgeId,
    cl_person_id: clPersonId,
    full_name: profileData.full_name as string,
    court: (profileData.court as string | null) ?? null,
  };

  // ── Slice 1: bench fingerprint from mv_judge_bench_fingerprint ─
  let bench: IBBenchSlice | null = null;
  if (clPersonId !== null) {
    const { data: bfData } = await supabase
      .from("mv_judge_bench_fingerprint")
      .select(
        "judge_cl_person_id, profile_name, district, " +
          "ussc_total_cases, median_sentence_months, mean_sentence_months, " +
          "p25_sentence_months, p75_sentence_months, " +
          "downward_departure_rate, upward_departure_rate, substantial_assistance_rate"
      )
      .eq("judge_cl_person_id", clPersonId)
      .maybeSingle();

    if (bfData) {
      type BFRow = typeof bfData & {
        judge_cl_person_id: number;
        profile_name: string;
        district: string | null;
        ussc_total_cases: number | null;
        median_sentence_months: string | number | null;
        mean_sentence_months: string | number | null;
        p25_sentence_months: string | number | null;
        p75_sentence_months: string | number | null;
        downward_departure_rate: string | number | null;
        upward_departure_rate: string | number | null;
        substantial_assistance_rate: string | number | null;
      };
      const r = bfData as BFRow;
      bench = {
        cl_person_id: r.judge_cl_person_id,
        profile_name: r.profile_name ?? "(unknown)",
        district: r.district ?? null,
        total_cases: r.ussc_total_cases ?? 0,
        median_sentence_months: pf(r.median_sentence_months),
        mean_sentence_months: pf(r.mean_sentence_months),
        p25_sentence_months: pf(r.p25_sentence_months),
        p75_sentence_months: pf(r.p75_sentence_months),
        downward_departure_rate: pf(r.downward_departure_rate),
        upward_departure_rate: pf(r.upward_departure_rate),
        substantial_assistance_rate: pf(r.substantial_assistance_rate),
      };
    }
  }

  // ── Slice 2: docket caseload from mv_judge_docket_caseload ──
  let caseload: JudgeDocketCaseload | null = null;
  if (clPersonId !== null) {
    const { data: dcData } = await supabase
      .from("mv_judge_docket_caseload")
      .select(
        "total_dockets, criminal_dockets, civil_dockets, criminal_fraction, " +
          "primary_court_id, years_on_bench"
      )
      .eq("judge_cl_person_id", String(clPersonId))
      .maybeSingle();

    if (dcData) {
      const dc = dcData as unknown as {
        total_dockets: number | null;
        criminal_dockets: number | null;
        civil_dockets: number | null;
        criminal_fraction: string | number | null;
        primary_court_id: string | null;
        years_on_bench: number | null;
      };
      caseload = {
        total_dockets: dc.total_dockets ?? 0,
        criminal_dockets: dc.criminal_dockets ?? 0,
        civil_dockets: dc.civil_dockets ?? 0,
        criminal_fraction:
          dc.criminal_fraction != null
            ? parseFloat(String(dc.criminal_fraction))
            : null,
        primary_court_id: dc.primary_court_id ?? null,
        years_on_bench: dc.years_on_bench ?? null,
      };
    }
  }

  // ── Slice 3: financial conflicts from judge_civil_party_conflicts ─
  // Cap at 5 rows for IB tier (X-Ray renders up to 20)
  let conflicts: JudgeConflictSignal[] = [];
  {
    const { data: civilData } = await supabase
      .from("judge_civil_party_conflicts")
      .select(
        "match_type, company_holding, disclosure_year, match_confidence, disclosure_url"
      )
      .eq("judge_canonical_id", judgeId)
      .order("disclosure_year", { ascending: false })
      .limit(5);

    conflicts = (civilData ?? []).map(
      (r: {
        match_type: string | null;
        company_holding: string | null;
        disclosure_year: number | null;
        match_confidence: string | null;
        disclosure_url: string | null;
      }) => ({
        match_type: r.match_type ?? "civil_party",
        company_or_party: r.company_holding ?? "(unknown)",
        disclosure_year: r.disclosure_year,
        match_confidence: r.match_confidence,
        source_url: r.disclosure_url,
      })
    );
  }

  return {
    meta: { generatedAt, case_id: input.caseId, judgeResolved: true },
    judge: judgeSlice,
    bench,
    caseload,
    conflicts,
  };
}
