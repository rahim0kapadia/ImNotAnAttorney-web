// src/lib/cross-corpus/bench-fingerprint.ts
import { createAdminClient } from "@/lib/supabase/admin";

export interface BenchFingerprintInput {
  districtCode: number;
  offenseType: string;
  minSampleSize?: number;
}

export interface DepartureReasonRow {
  departure_direction: string;
  departure_reason: string;
  sample_size: number;
  avg_sentence_months: number;
  median_sentence_months: number;
  p25_sentence_months: number;
  p75_sentence_months: number;
}

export interface BookerInflection {
  pre_booker_count: number;
  post_booker_count: number;
  pre_booker_avg_sentence: number | null;
  post_booker_avg_sentence: number | null;
  inflection_delta_months: number | null;
}

export interface BenchFingerprintResult {
  meta: { generatedAt: string; matview: "mv_judge_bench_fingerprint" };
  district_code: number;
  offense_type: string;
  departureReasons: DepartureReasonRow[];
  bookerInflection: BookerInflection;
  totalCases: number;
  mandatoryMinPercentage: number;
}

/**
 * BR-J1 — Bench Fingerprint by Departure Reason.
 *
 * Powers BR's primary product surface AND INAA Federal Sentencing Distribution
 * Report ($297) bench-fingerprint enhancement.
 *
 * Query path: mv_judge_bench_fingerprint indexed by (district_code, offense_type).
 * Booker inflection (pre/post-2005) computed at matview time, not query time.
 *
 * Cited expert: Lukas Fittl — pre-aggregated matview avoids re-scanning 819K rows
 * per query. idx_mv_jbf_district covers the hot path.
 */
export async function queryBenchFingerprint(
  input: BenchFingerprintInput
): Promise<BenchFingerprintResult> {
  const supabase = createAdminClient();
  const minSample = input.minSampleSize ?? 3;
  const generatedAt = new Date().toISOString();

  const { data } = await supabase
    .from("mv_judge_bench_fingerprint")
    .select(
      "departure_direction, departure_reason, sample_size, avg_sentence_months, median_sentence_months, p25_sentence_months, p75_sentence_months, pre_booker_count, post_booker_count, pre_booker_avg_sentence, post_booker_avg_sentence, mandatory_min_count"
    )
    .eq("district_code", input.districtCode)
    .eq("offense_type", input.offenseType)
    .gte("sample_size", minSample)
    .order("sample_size", { ascending: false });

  type RawRow = {
    departure_direction: string;
    departure_reason: string;
    sample_size: number;
    avg_sentence_months: string | number | null;
    median_sentence_months: string | number | null;
    p25_sentence_months: string | number | null;
    p75_sentence_months: string | number | null;
    pre_booker_count: number | null;
    post_booker_count: number | null;
    pre_booker_avg_sentence: string | number | null;
    post_booker_avg_sentence: string | number | null;
    mandatory_min_count: number | null;
  };

  const rows: RawRow[] = data ?? [];
  const totalCases = rows.reduce((s, r) => s + r.sample_size, 0);
  const mandatoryMinTotal = rows.reduce((s, r) => s + (r.mandatory_min_count ?? 0), 0);

  // Roll up Booker inflection across all departure reasons
  const preBookerCount = rows.reduce((s, r) => s + (r.pre_booker_count ?? 0), 0);
  const postBookerCount = rows.reduce((s, r) => s + (r.post_booker_count ?? 0), 0);
  const preWeighted = rows.reduce(
    (s, r) => s + (r.pre_booker_count ?? 0) * parseFloat(String(r.pre_booker_avg_sentence ?? 0)),
    0
  );
  const postWeighted = rows.reduce(
    (s, r) => s + (r.post_booker_count ?? 0) * parseFloat(String(r.post_booker_avg_sentence ?? 0)),
    0
  );
  const preBookerAvg = preBookerCount > 0 ? preWeighted / preBookerCount : null;
  const postBookerAvg = postBookerCount > 0 ? postWeighted / postBookerCount : null;
  const inflectionDelta =
    preBookerAvg !== null && postBookerAvg !== null
      ? Math.round((postBookerAvg - preBookerAvg) * 100) / 100
      : null;

  return {
    meta: { generatedAt, matview: "mv_judge_bench_fingerprint" },
    district_code: input.districtCode,
    offense_type: input.offenseType,
    departureReasons: rows.map(r => ({
      departure_direction: r.departure_direction,
      departure_reason: r.departure_reason,
      sample_size: r.sample_size,
      avg_sentence_months: parseFloat(String(r.avg_sentence_months ?? "0")),
      median_sentence_months: parseFloat(String(r.median_sentence_months ?? "0")),
      p25_sentence_months: parseFloat(String(r.p25_sentence_months ?? "0")),
      p75_sentence_months: parseFloat(String(r.p75_sentence_months ?? "0")),
    })),
    bookerInflection: {
      pre_booker_count: preBookerCount,
      post_booker_count: postBookerCount,
      pre_booker_avg_sentence: preBookerAvg ? Math.round(preBookerAvg * 100) / 100 : null,
      post_booker_avg_sentence: postBookerAvg ? Math.round(postBookerAvg * 100) / 100 : null,
      inflection_delta_months: inflectionDelta,
    },
    totalCases,
    mandatoryMinPercentage:
      totalCases > 0 ? Math.round((mandatoryMinTotal / totalCases) * 1000) / 10 : 0,
  };
}
