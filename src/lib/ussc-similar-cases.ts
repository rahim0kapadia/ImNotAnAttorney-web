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
  /** Federal district USSC code. Optional — when omitted, queryBucket skips
   *  exact + widened_age + widened_citizen paths and goes directly to the
   *  district-agnostic (offguide + xcrhissr) widening so the $297 product
   *  still returns data when the defendant's district is unknown. */
  district?: string | null;
  offguide: string;
  xcrhissr: string;
  /** Optional — when omitted, widening skips the citizen-filtered level. */
  citizen?: string | null;
  /** Optional — when omitted, widening skips the age_bucket-filtered level. */
  age_bucket?: AgeBucket | string | null;
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

/**
 * Convert a numeric age to the matview's age_bucket label.
 *
 * Returns null (not "UNK") for invalid / missing ages so callers can pass
 * the result directly to queryBucket — a null age_bucket skips the age
 * filter tier entirely. The matview "UNK" sentinel is only used when the
 * underlying data genuinely has unknown age; we don't synthesize it from
 * form-level missing values.
 */
export function normalizeAgeBucket(age: number | null | undefined): AgeBucket | null {
  if (age == null || !Number.isFinite(age as number)) return null;
  const n = age as number;
  if (n < 25) return "<25";
  if (n < 35) return "25-34";
  if (n < 45) return "35-44";
  if (n < 55) return "45-54";
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

/** Shared "is non-empty string" check — keeps queryBucket's hasDistrict /
 *  hasCitizen / hasAgeBucket guards and queryDistrictDisplay's null-safety in
 *  lock-step. If the "valid input" definition ever tightens (e.g. trim
 *  whitespace) the change lands in one place. */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

async function runQuery(
  sb: SupabaseClient,
  filters: Partial<Record<keyof BucketInput, string>>,
): Promise<SimilarCasesRow[]> {
  let q = sb.from(MATVIEW).select(SELECT_COLS);
  for (const [k, v] of Object.entries(filters)) {
    // Skip empty-string filters — they'd match no matview rows and silently
    // zero out results. Only filter on truthy string values.
    if (typeof v !== "string" || v.length === 0) continue;
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
 *
 * Widening tiers (each skipped when inputs lack the needed filter):
 *   1. exact          — district + offguide + xcrhissr + citizen + age_bucket
 *   2. widened_age    — district + offguide + xcrhissr + citizen
 *   3. widened_citizen— district + offguide + xcrhissr
 *   4. widened_district — offguide + xcrhissr (always reachable)
 *   5. insufficient_data — no matching rows at any tier
 */
export async function queryBucket(
  sb: SupabaseClient,
  input: BucketInput,
): Promise<SimilarCasesResponse> {
  const hasDistrict = isNonEmptyString(input.district);
  const hasCitizen = isNonEmptyString(input.citizen);
  const hasAgeBucket = isNonEmptyString(input.age_bucket);

  if (hasDistrict && hasCitizen && hasAgeBucket) {
    const exact = await runQuery(sb, {
      district: input.district as string,
      offguide: input.offguide,
      xcrhissr: input.xcrhissr,
      citizen: input.citizen as string,
      age_bucket: input.age_bucket as string,
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
  }

  if (hasDistrict && hasCitizen) {
    const dropAge = await runQuery(sb, {
      district: input.district as string,
      offguide: input.offguide,
      xcrhissr: input.xcrhissr,
      citizen: input.citizen as string,
    });
    if (dropAge.length > 0) {
      const { total, caveat } = buildCaveat(dropAge);
      return {
        match_depth: "widened_age",
        widening_note:
          "Not enough cases matching this age bracket — widened to all ages in this district, offense, criminal history, and citizenship.",
        rows: dropAge,
        total_cases: total,
        sample_size_caveat: caveat,
      };
    }
  }

  if (hasDistrict) {
    const dropCitizen = await runQuery(sb, {
      district: input.district as string,
      offguide: input.offguide,
      xcrhissr: input.xcrhissr,
    });
    if (dropCitizen.length > 0) {
      const { total, caveat } = buildCaveat(dropCitizen);
      return {
        match_depth: "widened_citizen",
        widening_note:
          "Widened to all citizenship categories in this district, offense, and criminal history.",
        rows: dropCitizen,
        total_cases: total,
        sample_size_caveat: caveat,
      };
    }
  }

  const dropDistrict = await runQuery(sb, {
    offguide: input.offguide,
    xcrhissr: input.xcrhissr,
  });
  if (dropDistrict.length > 0) {
    const { total, caveat } = buildCaveat(dropDistrict);
    const noteSuffix = hasDistrict
      ? ""
      : " Federal district was not supplied, so this covers all districts.";
    return {
      match_depth: "widened_district",
      widening_note:
        "Widened to national averages for this offense guideline and criminal history category (district, citizenship, and age bracket were all dropped to reach a meaningful sample)." +
        noteSuffix,
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

/**
 * Human-readable metadata for a USSC district code, sourced from `ussc_districts`
 * (94-row lookup, USSC Codebook Appendix A FY99-FY24). Attached to bucket
 * responses so renderers can display "W.D. Texas" instead of the raw "42" code.
 */
export interface DistrictDisplay {
  /** Raw USSC DISTRICT code, e.g. "42". */
  district_code: string;
  /** Short form, e.g. "W.D. Texas". */
  short_name: string;
  /** Full form, e.g. "Western District of Texas". */
  district_name: string;
  /** 2-letter state code, e.g. "TX". Null for non-state districts (DC, PR, VI). */
  state_code: string | null;
  /** Circuit label, e.g. "5th", "DC". */
  circuit: string;
}

/**
 * Fetch display metadata for a USSC district code. Returns null when the code
 * isn't in the lookup table — callers fall back to the raw code so downstream
 * rendering never breaks when a new / unknown code surfaces.
 */
export async function queryDistrictDisplay(
  sb: SupabaseClient,
  districtCode: string | null | undefined,
): Promise<DistrictDisplay | null> {
  if (!isNonEmptyString(districtCode)) return null;
  const { data, error } = await sb
    .from("ussc_districts")
    .select("district_code, short_name, district_name, state_code, circuit")
    .eq("district_code", districtCode)
    .maybeSingle();
  if (error) {
    console.error("[ussc-districts] lookup error:", error);
    return null;
  }
  if (!data) return null;
  return {
    district_code: data.district_code as string,
    short_name: data.short_name as string,
    district_name: data.district_name as string,
    state_code: (data.state_code as string | null) ?? null,
    circuit: data.circuit as string,
  };
}
