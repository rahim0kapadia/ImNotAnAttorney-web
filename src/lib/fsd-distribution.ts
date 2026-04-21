/**
 * @fileoverview Shared query library for `federal_sentencing_distributions`.
 *
 * Powers the $297 Federal Sentencing Distribution Report — returns sentence
 * distributions (p10/p25/p50/p75/p90 + mean) by (district, offguide_code,
 * criminal_history_category) across a fiscal-year range. 13,131 rows covering
 * FY14-FY24 aggregated from USSC Individual Offender Datafiles.
 *
 * Progressive widening mirrors the Similar Cases lib — when the exact bucket
 * returns zero rows (rare intersection), widen by: (a) drop FY range bound,
 * (b) drop criminal history, (c) drop district (fall back to national). UPL-safe:
 * returns statistical distribution, never recommendations.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Offguide code allowlist — 23 USSC Primary Sentencing Guideline codes. */
export const OFFGUIDE_CODES = new Set([
  1, 2, 4, 5, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 20, 21, 23, 24, 25, 26, 27, 29, 30,
]);

/** USSC Criminal History Category (1-6; "1" = no priors, "6" = career offender). */
export const VALID_CH_CATEGORIES = new Set(["1", "2", "3", "4", "5", "6"]);

export interface FsdInput {
  /** Federal district USSC code ("0"-"96"). Null widens to national. */
  district?: string | null;
  /** USSC offguide code (numeric, per OFFGUIDE_CODES). */
  offguide_code: number;
  /** USSC criminal history category "1"-"6". Null = user didn't supply —
   *  queryDistribution skips the exact tier and lands in
   *  widened_ch_missing with an honest widening note. */
  criminal_history_category?: string | null;
  /** Inclusive fiscal-year lower bound (2-digit, e.g. 18). Defaults to 14. */
  fy_from?: number;
  /** Inclusive fiscal-year upper bound (2-digit, e.g. 24). Defaults to 24. */
  fy_to?: number;
}

export interface FsdRow {
  fy: number;
  district: string;
  circdist: string;
  offguide_code: number;
  offguide_label: string;
  offense_category: string;
  criminal_history_category: string;
  n: number;
  mean_months: number | null;
  median_months: number | null;
  p10_months: number | null;
  p25_months: number | null;
  p75_months: number | null;
  p90_months: number | null;
  downward_departure_rate: number | null;
  upward_departure_rate: number | null;
  probation_rate: number | null;
}

/**
 * Widening tiers — in strict priority order:
 *   - `exact`            : district + criminal_history supplied AND both hit
 *   - `widened_ch_missing`: user didn't supply CH — queried district across
 *                           all CH categories (no narrower tier was possible
 *                           without the CH filter)
 *   - `widened_criminal_history`: user supplied CH but that bucket was empty
 *                                  — widened to all CH for the district
 *   - `widened_district`: district bucket empty — fell back to national
 *   - `insufficient_data`: nothing at any tier
 *
 * NOTE: the `widened_years` tier was removed 2026-04-21 — production callers
 * don't narrow the FY range, so the tier could never fire. If a future
 * caller exposes trailing-N-year windows, re-introduce the tier explicitly.
 */
export type FsdMatchDepth =
  | "exact"
  | "widened_ch_missing"
  | "widened_criminal_history"
  | "widened_district"
  | "insufficient_data";

export interface FsdAggregate {
  total_n: number;
  mean_months: number | null;
  median_months: number | null;
  p10_months: number | null;
  p25_months: number | null;
  p75_months: number | null;
  p90_months: number | null;
  downward_departure_rate: number | null;
  upward_departure_rate: number | null;
  probation_rate: number | null;
  earliest_fy: number;
  latest_fy: number;
  offguide_label: string;
  offense_category: string;
}

export interface FsdResponse {
  match_depth: FsdMatchDepth;
  widening_note: string | null;
  /** District-specific aggregate across the FY range. Null on insufficient_data. */
  district_agg: FsdAggregate | null;
  /** National aggregate for same offense + criminal history, independent of district. */
  national_agg: FsdAggregate | null;
  /** Raw rows (one per FY) in the district bucket, for per-year trend rendering. */
  per_year: FsdRow[];
  /** Bootstrap Monte Carlo samples (1000) drawn from the district distribution. */
  monte_carlo: number[];
  /** "Based on N cases FY14-FY24." Empty on insufficient_data. */
  sample_size_caveat: string;
}

const TABLE = "federal_sentencing_distributions";
const SELECT =
  "fy, district, circdist, offguide_code, offguide_label, offense_category, criminal_history_category, n, mean_months, median_months, p10_months, p25_months, p75_months, p90_months, downward_departure_rate, upward_departure_rate, probation_rate";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/** Weighted mean of per-year metrics across rows. Weights = row.n. Returns
 *  null if total weight is zero or all row values are null. */
function weightedAvg(rows: FsdRow[], key: keyof FsdRow): number | null {
  let wTotal = 0;
  let sum = 0;
  for (const r of rows) {
    const v = r[key];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const w = r.n || 0;
    if (w <= 0) continue;
    wTotal += w;
    sum += v * w;
  }
  if (wTotal === 0) return null;
  return Number((sum / wTotal).toFixed(4));
}

/**
 * Aggregate multiple FsdRow rows (typically one per fiscal year) into a
 * single summary.
 *
 * STATISTICAL CAVEAT: This computes a WEIGHTED MEAN of percentiles across
 * rows. That's NOT the same as the percentile of the pooled sample — if
 * per-year distributions have meaningful variance, aggregate p10 will be
 * tighter than the true pooled p10. Downstream consumers should treat
 * multi-row aggregates as "average p10 across years," not as a formally
 * correct p10. The alternative (storing raw cases + computing pooled
 * percentiles at query time) would require a ~million-row table instead
 * of the 13,131 pre-aggregated buckets; rejected for now.
 *
 * The per_year breakdown in the response preserves per-row percentiles so
 * sophisticated consumers can see the year-by-year spread.
 */
function aggregate(rows: FsdRow[]): FsdAggregate | null {
  if (rows.length === 0) return null;
  const totalN = rows.reduce((s, r) => s + (r.n || 0), 0);
  // Defensive filter — rare but possible for fy to be null from a future
  // schema change or a partial row. Treat null-fy rows as fy=0 for the
  // min/max calculation so aggregation still produces a usable range
  // rather than NaN.
  const fys = rows.map((r) => (typeof r.fy === "number" ? r.fy : 0));
  return {
    total_n: totalN,
    mean_months: weightedAvg(rows, "mean_months"),
    median_months: weightedAvg(rows, "median_months"),
    p10_months: weightedAvg(rows, "p10_months"),
    p25_months: weightedAvg(rows, "p25_months"),
    p75_months: weightedAvg(rows, "p75_months"),
    p90_months: weightedAvg(rows, "p90_months"),
    downward_departure_rate: weightedAvg(rows, "downward_departure_rate"),
    upward_departure_rate: weightedAvg(rows, "upward_departure_rate"),
    probation_rate: weightedAvg(rows, "probation_rate"),
    earliest_fy: Math.min(...fys),
    latest_fy: Math.max(...fys),
    offguide_label: rows[0].offguide_label,
    offense_category: rows[0].offense_category,
  };
}

async function runQuery(
  sb: SupabaseClient,
  filters: {
    district?: string;
    offguide_code: number;
    criminal_history_category?: string;
    fy_from: number;
    fy_to: number;
  },
): Promise<FsdRow[]> {
  let q = sb
    .from(TABLE)
    .select(SELECT)
    .eq("offguide_code", filters.offguide_code)
    .gte("fy", filters.fy_from)
    .lte("fy", filters.fy_to);
  if (isNonEmptyString(filters.district)) {
    q = q.eq("district", filters.district);
  }
  if (isNonEmptyString(filters.criminal_history_category)) {
    q = q.eq("criminal_history_category", filters.criminal_history_category);
  }
  const { data, error } = await q;
  if (error) {
    console.error("[fsd-distribution] query error:", error);
    return [];
  }
  return (data ?? []) as FsdRow[];
}

/**
 * Bootstrap Monte Carlo sample drawn from a distribution's percentile CDF.
 * Linear interpolation between p10/p25/p50/p75/p90. Tail below p10 clamped to
 * p10; tail above p90 clamped to p90 (conservative — don't fabricate extreme
 * outliers from sparse percentile data).
 */
export function monteCarloSample(agg: FsdAggregate, n = 1000): number[] {
  const { p10_months, p25_months, median_months, p75_months, p90_months } = agg;
  if (
    p10_months == null ||
    p25_months == null ||
    median_months == null ||
    p75_months == null ||
    p90_months == null
  ) {
    return [];
  }
  // Build piecewise linear CDF: (quantile, value) pairs.
  const points: Array<{ q: number; v: number }> = [
    { q: 0.1, v: p10_months },
    { q: 0.25, v: p25_months },
    { q: 0.5, v: median_months },
    { q: 0.75, v: p75_months },
    { q: 0.9, v: p90_months },
  ];

  // Extrapolate the lower tail (u ∈ [0, 0.1]) linearly from the p10→p25
  // slope down toward zero at u=0. This avoids the ~10% pileup at exactly
  // p10 that the earlier clamped implementation produced. The tail is
  // clamped at zero (sentences can't be negative).
  const lowerSlope = (points[1].v - points[0].v) / (points[1].q - points[0].q);
  const lowerFloor = Math.max(0, points[0].v - lowerSlope * points[0].q);

  // Extrapolate the upper tail (u ∈ [0.9, 1.0]) linearly from the p75→p90
  // slope. Cap at (p90 + 1.5×(p90−p75)) as a conservative "extreme" proxy
  // rather than a formally-estimated p99, which the percentile data can't
  // justify.
  const upperSlope = (points[4].v - points[3].v) / (points[4].q - points[3].q);
  const upperCap = points[4].v + 1.5 * (points[4].v - points[3].v);

  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = Math.random();
    if (u <= points[0].q) {
      // Lower tail: interpolate between the extrapolated floor and p10.
      const frac = points[0].q === 0 ? 0 : u / points[0].q;
      const v = lowerFloor + frac * (points[0].v - lowerFloor);
      samples.push(Number(v.toFixed(2)));
      continue;
    }
    if (u >= points[points.length - 1].q) {
      // Upper tail: linearly project beyond p90, clamped at upperCap.
      const extra = u - points[points.length - 1].q;
      const v = Math.min(upperCap, points[4].v + upperSlope * extra);
      samples.push(Number(v.toFixed(2)));
      continue;
    }
    // Interior — find bracketing points + linear interp.
    for (let j = 0; j < points.length - 1; j++) {
      if (u >= points[j].q && u <= points[j + 1].q) {
        const span = points[j + 1].q - points[j].q;
        const frac = span === 0 ? 0 : (u - points[j].q) / span;
        const v = points[j].v + frac * (points[j + 1].v - points[j].v);
        samples.push(Number(v.toFixed(2)));
        break;
      }
    }
  }
  return samples;
}

/**
 * Query the FSD table with progressive widening. Returns district bucket +
 * national baseline + per-year breakdown + Monte Carlo sample.
 */
export async function queryDistribution(
  sb: SupabaseClient,
  input: FsdInput,
): Promise<FsdResponse> {
  const fy_from = input.fy_from ?? 14;
  const fy_to = input.fy_to ?? 24;
  const hasDistrict = isNonEmptyString(input.district);
  const hasCH = isNonEmptyString(input.criminal_history_category);

  // Tier 1 — exact match: district + CH (requires both).
  if (hasDistrict && hasCH) {
    const rows = await runQuery(sb, {
      district: input.district as string,
      offguide_code: input.offguide_code,
      criminal_history_category: input.criminal_history_category as string,
      fy_from,
      fy_to,
    });
    if (rows.length > 0) {
      return buildResponse(sb, rows, "exact", null, input);
    }
  }

  // Tier 2 — widen by criminal history. Two sub-cases:
  //   a) user supplied CH but that bucket was empty → match_depth=widened_criminal_history
  //   b) user omitted CH entirely → match_depth=widened_ch_missing (note makes
  //      this explicit so the report doesn't claim we "couldn't find enough
  //      CH-specific data" when the user never supplied CH).
  if (hasDistrict) {
    const rows = await runQuery(sb, {
      district: input.district as string,
      offguide_code: input.offguide_code,
      fy_from,
      fy_to,
    });
    if (rows.length > 0) {
      const depth: FsdMatchDepth = hasCH
        ? "widened_criminal_history"
        : "widened_ch_missing";
      const note = hasCH
        ? "Not enough data for this criminal history category in this district — widened to all categories."
        : "You didn't supply a criminal history category — returning district-wide averages across all CH levels.";
      return buildResponse(sb, rows, depth, note, input);
    }
  }

  // Tier 3 — widen by district, fall back to national for this offense.
  const rowsNational = await runQuery(sb, {
    offguide_code: input.offguide_code,
    criminal_history_category: hasCH
      ? (input.criminal_history_category as string)
      : undefined,
    fy_from,
    fy_to,
  });
  if (rowsNational.length > 0) {
    // Pass the already-fetched rows through so buildResponse doesn't
    // re-query the same national data.
    return buildResponse(
      sb,
      rowsNational,
      "widened_district",
      "Widened to national averages for this offense guideline and criminal history category.",
      input,
      { precomputedNationalRows: rowsNational },
    );
  }

  return {
    match_depth: "insufficient_data",
    widening_note: "Not enough federal sentencing data for this combination across FY14-FY24.",
    district_agg: null,
    national_agg: null,
    per_year: [],
    monte_carlo: [],
    sample_size_caveat: "",
  };
}

async function buildResponse(
  sb: SupabaseClient,
  districtRows: FsdRow[],
  match_depth: FsdMatchDepth,
  widening_note: string | null,
  input: FsdInput,
  opts: { precomputedNationalRows?: FsdRow[] } = {},
): Promise<FsdResponse> {
  const district_agg = aggregate(districtRows);

  // National baseline — skip the re-query when the caller is tier 3 and the
  // national rows were already fetched (avoids ~50% DB load on widened_district).
  let nationalRows: FsdRow[];
  if (opts.precomputedNationalRows) {
    nationalRows = opts.precomputedNationalRows;
  } else {
    nationalRows = await runQuery(sb, {
      offguide_code: input.offguide_code,
      criminal_history_category: isNonEmptyString(input.criminal_history_category)
        ? (input.criminal_history_category as string)
        : undefined,
      fy_from: 14,
      fy_to: 24,
    });
  }
  const national_agg = aggregate(nationalRows);

  const per_year = districtRows.slice().sort((a, b) => a.fy - b.fy);
  const monte_carlo = district_agg ? monteCarloSample(district_agg, 1000) : [];
  const caveat = district_agg
    ? `Based on ${district_agg.total_n} cases FY${district_agg.earliest_fy}-FY${district_agg.latest_fy}.`
    : "";

  return {
    match_depth,
    widening_note,
    district_agg,
    national_agg,
    per_year,
    monte_carlo,
    sample_size_caveat: caveat,
  };
}

/**
 * Build histogram bins from a Monte Carlo sample. Returns sorted array of
 * {range_start, range_end, count} tuples. Bin width auto-sizes to Scott's
 * rule approximated.
 */
export function histogram(
  samples: number[],
  bins = 20,
): Array<{ range_start: number; range_end: number; count: number }> {
  if (samples.length === 0) return [];
  const sorted = samples.slice().sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (max === min) {
    return [{ range_start: min, range_end: max, count: samples.length }];
  }
  const width = (max - min) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({
    range_start: Number((min + i * width).toFixed(2)),
    range_end: Number((min + (i + 1) * width).toFixed(2)),
    count: 0,
  }));
  for (const s of samples) {
    // Clamp to last bin on max.
    const idx = Math.min(bins - 1, Math.floor((s - min) / width));
    out[idx].count++;
  }
  return out;
}
