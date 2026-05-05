// src/lib/cross-corpus/bench-fingerprint.ts
import { createAdminClient } from "@/lib/supabase/admin";

export interface BenchFingerprintInput {
  judgeClPersonId?: number;
  judgeFullName?: string;
}

export interface BenchFingerprintResult {
  meta: { generatedAt: string; matview: "mv_judge_bench_fingerprint" };
  judge: { cl_person_id: number; profile_name: string; district: string | null };
  ussc: {
    total_cases: number;
    median_sentence_months: number | null;
    mean_sentence_months: number | null;
    p25_sentence_months: number | null;
    p75_sentence_months: number | null;
    downward_departure_rate: number | null;
    upward_departure_rate: number | null;
    substantial_assistance_rate: number | null;
    government_sponsored_below_range_rate: number | null;
  };
  caseload: {
    federal_docket_count: number | null;
    earliest_docket: string | null;
    latest_docket: string | null;
  };
  breakdowns: {
    offense: Record<string, number> | null;
    criminal_history: Record<string, number> | null;
  };
  name_similarity: number | null;
}

/**
 * BR-J1 — Federal Sentencing Bench Fingerprint by judge.
 *
 * Powers INAA Federal Sentencing Distribution Report ($297)
 * bench-fingerprint enhancement + BenchRecon primary product surface.
 *
 * Query path: mv_judge_bench_fingerprint filtered by judge_cl_person_id.
 * If only judgeFullName provided, lookup judge_profiles first.
 *
 * Cited expert: Lukas Fittl — pre-aggregated matview avoids re-scanning
 * 819K USSC rows per query.
 */
export async function queryBenchFingerprint(
  input: BenchFingerprintInput
): Promise<BenchFingerprintResult> {
  const supabase = createAdminClient();
  const generatedAt = new Date().toISOString();

  // Resolve judge_cl_person_id if only name was provided
  let clPersonId = input.judgeClPersonId;
  if (!clPersonId && input.judgeFullName) {
    const { data: profile } = await supabase
      .from("judge_profiles")
      .select("cl_person_id")
      .ilike("full_name", `%${input.judgeFullName}%`)
      .limit(1)
      .maybeSingle();
    if (profile?.cl_person_id) {
      clPersonId = parseInt(profile.cl_person_id, 10);
    }
  }

  // Short-circuit: no judge resolved
  if (!clPersonId) {
    return {
      meta: { generatedAt, matview: "mv_judge_bench_fingerprint" },
      judge: { cl_person_id: 0, profile_name: "(unknown)", district: null },
      ussc: {
        total_cases: 0,
        median_sentence_months: null,
        mean_sentence_months: null,
        p25_sentence_months: null,
        p75_sentence_months: null,
        downward_departure_rate: null,
        upward_departure_rate: null,
        substantial_assistance_rate: null,
        government_sponsored_below_range_rate: null,
      },
      caseload: { federal_docket_count: null, earliest_docket: null, latest_docket: null },
      breakdowns: { offense: null, criminal_history: null },
      name_similarity: null,
    };
  }

  const { data } = await supabase
    .from("mv_judge_bench_fingerprint")
    .select(
      "judge_cl_person_id, profile_name, judge_name_normalized, district, " +
      "ussc_total_cases, median_sentence_months, mean_sentence_months, " +
      "p25_sentence_months, p75_sentence_months, " +
      "downward_departure_rate, upward_departure_rate, " +
      "substantial_assistance_rate, government_sponsored_below_range_rate, " +
      "offense_breakdown, criminal_history_breakdown, " +
      "name_similarity, federal_docket_count, earliest_docket, latest_docket"
    )
    .eq("judge_cl_person_id", clPersonId)
    .maybeSingle();

  if (!data) {
    return {
      meta: { generatedAt, matview: "mv_judge_bench_fingerprint" },
      judge: { cl_person_id: clPersonId, profile_name: "(no USSC data)", district: null },
      ussc: {
        total_cases: 0,
        median_sentence_months: null,
        mean_sentence_months: null,
        p25_sentence_months: null,
        p75_sentence_months: null,
        downward_departure_rate: null,
        upward_departure_rate: null,
        substantial_assistance_rate: null,
        government_sponsored_below_range_rate: null,
      },
      caseload: { federal_docket_count: null, earliest_docket: null, latest_docket: null },
      breakdowns: { offense: null, criminal_history: null },
      name_similarity: null,
    };
  }

  type RawRow = typeof data & {
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
    government_sponsored_below_range_rate: string | number | null;
    offense_breakdown: Record<string, number> | null;
    criminal_history_breakdown: Record<string, number> | null;
    name_similarity: number | null;
    federal_docket_count: number | null;
    earliest_docket: string | null;
    latest_docket: string | null;
  };

  const r = data as RawRow;
  const pf = (v: string | number | null) => (v != null ? parseFloat(String(v)) : null);

  return {
    meta: { generatedAt, matview: "mv_judge_bench_fingerprint" },
    judge: {
      cl_person_id: r.judge_cl_person_id,
      profile_name: r.profile_name ?? "(unknown)",
      district: r.district ?? null,
    },
    ussc: {
      total_cases: r.ussc_total_cases ?? 0,
      median_sentence_months: pf(r.median_sentence_months),
      mean_sentence_months: pf(r.mean_sentence_months),
      p25_sentence_months: pf(r.p25_sentence_months),
      p75_sentence_months: pf(r.p75_sentence_months),
      downward_departure_rate: pf(r.downward_departure_rate),
      upward_departure_rate: pf(r.upward_departure_rate),
      substantial_assistance_rate: pf(r.substantial_assistance_rate),
      government_sponsored_below_range_rate: pf(r.government_sponsored_below_range_rate),
    },
    caseload: {
      federal_docket_count: r.federal_docket_count ?? null,
      earliest_docket: r.earliest_docket ?? null,
      latest_docket: r.latest_docket ?? null,
    },
    breakdowns: {
      offense: r.offense_breakdown ?? null,
      criminal_history: r.criminal_history_breakdown ?? null,
    },
    name_similarity: r.name_similarity ?? null,
  };
}
