/**
 * @fileoverview Shared query library for the public.ussc_similar_cases_summary matview.
 *
 * Powers the $297 Similar Cases Analyzer + augments /api/plea-analyzer +
 * /api/tools/sentencing-calculator with federal sentencing distribution from
 * actual outcomes (USSC Individual Offender Datafiles FY14-FY24, 11 years,
 * 690,491 federal cases across 23,210 buckets).
 *
 * Progressive widening — when the exact (district+offguide+xcrhissr+citizen+age_bucket)
 * bucket returns zero rows, widen in this order:
 *   1. drop age_bucket → all ages in district+offense+history+citizen
 *   2. drop citizen   → all citizenship in district+offense+history
 *   3. drop district  → national averages for offense+history
 *
 * The matview stores plea_or_trial as the raw USSC `newcnvtn` code: '0' = plea,
 * '1' = trial. Match depth is disclosed in the response so the UI can label
 * accordingly.
 *
 * UPL-safe — returns distribution data, never recommendations or advice.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type AgeBucket = "<25" | "25-34" | "35-44" | "45-54" | "55+" | "UNK";

export interface BucketInput {
  district: string;
  offguide: string;
  xcrhissr: string;
  citizen: string;
  age_bucket: AgeBucket | string;
}

export interface SimilarCasesRow {
  district: string;
  offguide: string;
  xcrhissr: string;
  citizen: string;
  age_bucket: string;
  /** '0' = plea (newcnvtn=0), '1' = trial (newcnvtn=1). Matview stores raw USSC code as text. */
  plea_or_trial: string;
  n_cases: number;
  p10_senttot: number | null;
  p25_senttot: number | null;
  median_senttot: number | null;
  p75_senttot: number | null;
  p90_senttot: number | null;
  mean_senttot: number | null;
  pct_got_prison: number | null;
  pct_downward_departure: number | null;
  earliest_fy: number;
  latest_fy: number;
}

export type MatchDepth =
  | "exact"
  | "widened_age"
  | "widened_citizen"
  | "widened_district"
  | "insufficient_data";

export interface SimilarCasesResponse {
  match_depth: MatchDepth;
  widening_note: string | null;
  rows: SimilarCasesRow[];
  /** Summed n_cases across returned rows. */
  total_cases: number;
  /** "Based on N cases FY<earliest>-FY<latest>." Empty when insufficient_data. */
  sample_size_caveat: string;
}

/** Convert a numeric age to the matview's age_bucket label. */
export function normalizeAgeBucket(age: number | null | undefined): AgeBucket {
  if (age == null || typeof age !== "number" || !Number.isFinite(age)) return "UNK";
  if (age < 25) return "<25";
  if (age < 35) return "25-34";
  if (age < 45) return "35-44";
  if (age < 55) return "45-54";
  return "55+";
}

/** FY codes are 2-digit (18, 19, ..., 24). Format as "FY18-FY24" or "FY24". */
function formatFyRange(earliest: number, latest: number): string {
  return earliest === latest ? `FY${earliest}` : `FY${earliest}-FY${latest}`;
}

function buildCaveat(rows: SimilarCasesRow[]): { total: number; caveat: string } {
  if (rows.length === 0) return { total: 0, caveat: "" };
  const total = rows.reduce((s, r) => s + (r.n_cases ?? 0), 0);
  const earliest = Math.min(...rows.map((r) => r.earliest_fy));
  const latest = Math.max(...rows.map((r) => r.latest_fy));
  return { total, caveat: `Based on ${total} cases ${formatFyRange(earliest, latest)}.` };
}

const MATVIEW = "ussc_similar_cases_summary";
const SELECT_COLS =
  "district, offguide, xcrhissr, citizen, age_bucket, plea_or_trial, n_cases, p10_senttot, p25_senttot, median_senttot, p75_senttot, p90_senttot, mean_senttot, pct_got_prison, pct_downward_departure, earliest_fy, latest_fy";

async function runQuery(
  sb: SupabaseClient,
  filters: Partial<Record<keyof BucketInput, string>>,
): Promise<SimilarCasesRow[]> {
  let q = sb.from(MATVIEW).select(SELECT_COLS);
  for (const [k, v] of Object.entries(filters)) {
    q = q.eq(k, v);
  }
  const { data, error } = await q;
  if (error) {
    console.error("[ussc-similar-cases] query error:", error);
    return [];
  }
  return (data ?? []) as SimilarCasesRow[];
}

/**
 * Fetch one bucket with progressive widening. Returns a structured response
 * with match depth so callers can disclose the widening to the UI.
 */
export async function queryBucket(
  sb: SupabaseClient,
  input: BucketInput,
): Promise<SimilarCasesResponse> {
  const exact = await runQuery(sb, {
    district: input.district,
    offguide: input.offguide,
    xcrhissr: input.xcrhissr,
    citizen: input.citizen,
    age_bucket: input.age_bucket,
  });
  if (exact.length > 0) {
    const { total, caveat } = buildCaveat(exact);
    return {
      match_depth: "exact",
      widening_note: null,
      rows: exact,
      total_cases: total,
      sample_size_caveat: caveat,
    };
  }

  const dropAge = await runQuery(sb, {
    district: input.district,
    offguide: input.offguide,
    xcrhissr: input.xcrhissr,
    citizen: input.citizen,
  });
  if (dropAge.length > 0) {
    const { total, caveat } = buildCaveat(dropAge);
    return {
      match_depth: "widened_age",
      widening_note:
        "No exact match for this age bracket — widened to all ages in this district, offense, criminal history, and citizenship.",
      rows: dropAge,
      total_cases: total,
      sample_size_caveat: caveat,
    };
  }

  const dropCitizen = await runQuery(sb, {
    district: input.district,
    offguide: input.offguide,
    xcrhissr: input.xcrhissr,
  });
  if (dropCitizen.length > 0) {
    const { total, caveat } = buildCaveat(dropCitizen);
    return {
      match_depth: "widened_citizen",
      widening_note:
        "No match at the citizenship level — widened to all citizenship categories in this district, offense, and criminal history.",
      rows: dropCitizen,
      total_cases: total,
      sample_size_caveat: caveat,
    };
  }

  const dropDistrict = await runQuery(sb, {
    offguide: input.offguide,
    xcrhissr: input.xcrhissr,
  });
  if (dropDistrict.length > 0) {
    const { total, caveat } = buildCaveat(dropDistrict);
    return {
      match_depth: "widened_district",
      widening_note:
        "No match at the district level — widened to national averages for this offense guideline and criminal history category.",
      rows: dropDistrict,
      total_cases: total,
      sample_size_caveat: caveat,
    };
  }

  return {
    match_depth: "insufficient_data",
    widening_note:
      "Not enough federal sentencing data in USSC FY14-FY24 to produce a distribution for this combination.",
    rows: [],
    total_cases: 0,
    sample_size_caveat: "",
  };
}

/**
 * Extract the single plea row (plea_or_trial='0') and single trial row
 * (plea_or_trial='1') from a bucket response. When widening returned multiple
 * age buckets or citizen categories, pick the row with the largest sample
 * so the surfaced number is the most statistically meaningful.
 */
export function extractPleaTrialSplit(rows: SimilarCasesRow[]): {
  plea: SimilarCasesRow | null;
  trial: SimilarCasesRow | null;
} {
  const byOutcome: Record<string, SimilarCasesRow> = {};
  for (const r of rows) {
    const key = r.plea_or_trial;
    if (!byOutcome[key] || (r.n_cases ?? 0) > (byOutcome[key].n_cases ?? 0)) {
      byOutcome[key] = r;
    }
  }
  return { plea: byOutcome["0"] ?? null, trial: byOutcome["1"] ?? null };
}

/**
 * Compute the observed trial tax in months (median trial minus median plea).
 * Returns null when either side is missing or its median is null.
 */
export function computeTrialTaxMonths(
  plea: SimilarCasesRow | null,
  trial: SimilarCasesRow | null,
): number | null {
  if (!plea || !trial) return null;
  if (plea.median_senttot == null || trial.median_senttot == null) return null;
  return Number((Number(trial.median_senttot) - Number(plea.median_senttot)).toFixed(2));
}
