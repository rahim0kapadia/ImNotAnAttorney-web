/**
 * @fileoverview Shared sentencing-distribution helper used across all four
 * report tiers: Case Decoder ($197), Intelligence Brief ($997), X-Ray
 * ($2,497), and Judge Report Card ($197 standalone).
 *
 * Wraps `queryDistribution` from `@/lib/fsd-distribution` (the FSDR engine)
 * with two policy gates the bare query lacks:
 *
 *   1. **Freshness gate** — reads `public.ussc_matview_meta` via
 *      `checkUsscFreshness` (shared with `ussc-similar-cases`) and short-
 *      circuits to a degraded shape when the matview is older than the 30-
 *      day floor. This honors the same commitment exposed by
 *      `/api/data-status` LIVE on imnotanattorney.com.
 *
 *   2. **Tier-aware coverage gate** — each tier requires a different
 *      minimum district sample-size before rendering a district-specific
 *      number. CD shows district numbers at >=20 cases; IB at >=50; X-Ray
 *      at >=100; JRC (judge-specific overlay) at >=150. Below the floor
 *      the helper returns `district_agg: null` so each tier's renderer can
 *      gracefully fall back to "national for this offense" instead of
 *      lying about a 3-case district outlier.
 *
 * The helper deduplicates the FSDR-tier wiring that previously lived inline
 * in `src/app/api/tools/federal-sentencing-distribution/route.ts` (the $297
 * standalone product). FSDR continues to call `queryDistribution` directly
 * because it needs the full Monte Carlo + per-year + 4-tier widening note;
 * the four report tiers wired here only need the summary triple
 * (p25/median/p75) plus sample sizes plus freshness disclosure.
 *
 * UPL-safe: returns statistical distribution only. No advice. No
 * recommendations. No "you should". Tier renderers hand the numbers to
 * the defendant + their attorney; the decision stays with them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { queryDistribution, type FsdAggregate } from "@/lib/fsd-distribution";
import { chargeTypeToFsdOffguide, priorsToChCategory } from "@/lib/fsd-offguide";
import { checkUsscFreshness } from "@/lib/ussc-similar-cases";

/** Tier slug — drives the coverage threshold the helper enforces. */
export type SentencingDistributionTier =
  | "case-decoder"
  | "intelligence-brief"
  | "xray"
  | "judge-report-card";

/**
 * Per-tier minimum district-bucket sample size before the helper will
 * surface district-specific numbers. Below the floor we drop the
 * district aggregate and let the renderer fall back to national.
 *
 * Calibration:
 *   - CD (20)  : cheapest tier, defendant just needs orientation; small
 *                sample acceptable so long as we caveat sample_n.
 *   - IB (50)  : court-prep tier; numbers are quoted to attorneys, need
 *                more spine.
 *   - X-Ray (100): full distribution chart; below 100 the percentile
 *                  triangle is too jittery to render honestly.
 *   - JRC (150): judge-specific overlay; tightest floor because we're
 *                making per-judge claims, not per-district.
 *
 * If a future tier emerges with different needs, add it to the map +
 * the type union above. The threshold is policy, not statistics, so
 * keep the map readable rather than computing it from a base rate.
 */
// Policy: floors are intentionally different per tier — see JSDoc above for
// calibration rationale. Do not tighten without updating the test fixtures in
// tests/lib/ussc/distribution.test.ts (each tier's "below floor" scenario).
const TIER_DISTRICT_FLOOR: Record<SentencingDistributionTier, number> = {
  "case-decoder": 20,
  "intelligence-brief": 50,
  "xray": 100,
  "judge-report-card": 150,
};

export interface GetSentencingDistributionInput {
  /** INAA charge slug (e.g. "drug-trafficking", "wire-fraud"). Resolves
   *  to a USSC offguide_code via `chargeTypeToFsdOffguide`. */
  charge: string;
  /** Federal district USSC code ("0"-"96"). Null/missing widens to
   *  national-only output (district_agg always null). */
  district?: string | null;
  /** Tier slug — drives coverage threshold. Required so renderers can't
   *  silently inherit a permissive default. */
  tier: SentencingDistributionTier;
  /** Optional USSC criminal history category "1"-"6". Null/missing means
   *  query widens to all-CH for the district (mirrors FSDR widening
   *  semantics). */
  criminalHistoryCategory?: string | null;
  /** Optional dropdown answer ("none" / "misdemeanor-only" / "felony" /
   *  "multiple-felonies"). Resolves to a CH category via
   *  `priorsToChCategory` if `criminalHistoryCategory` not supplied. */
  priorConvictions?: string | null;
  /** Inclusive fiscal-year lower bound, default 14. */
  fyFrom?: number;
  /** Inclusive fiscal-year upper bound, default 24. */
  fyTo?: number;
}

/**
 * Compact summary triple shipped to every tier renderer. Distinct from
 * `FsdAggregate` (which carries 10+ fields the upstream FSDR product
 * needs) — keeps each tier's render-side surface small.
 */
export interface SentencingTriple {
  /** 25th percentile sentence in months. Null when source row had null. */
  p25: number | null;
  /** Median (p50) sentence in months. Null when source row had null. */
  median: number | null;
  /** 75th percentile sentence in months. Null when source row had null. */
  p75: number | null;
  /** Total cases summed across the bucket. */
  sample_n: number;
  /** Earliest FY in the aggregate (e.g. 14 for FY2014). */
  earliest_fy: number;
  /** Latest FY in the aggregate (e.g. 24 for FY2024). */
  latest_fy: number;
}

/**
 * What every tier renderer receives. `district_agg` may be null when:
 *   - The caller supplied no district, OR
 *   - The district bucket was empty entirely, OR
 *   - The district bucket had data but fell below the tier's coverage
 *     floor (see TIER_DISTRICT_FLOOR).
 *
 * `national_agg` is null only when there is genuinely no data for the
 * offense across the entire FY range.
 *
 * `coverage_status` discloses *why* district_agg is null so the renderer
 * can phrase the fallback honestly ("not enough cases in your district
 * to summarize" vs "no district supplied").
 */
export interface SentencingDistributionResult {
  charge: string;
  district: string | null;
  tier: SentencingDistributionTier;
  district_agg: SentencingTriple | null;
  national_agg: SentencingTriple | null;
  coverage_status:
    | "district-rendered"
    | "district-below-floor"
    | "district-empty"
    | "no-district-supplied"
    | "no-data-anywhere";
  district_sample_n: number;
  national_sample_n: number;
  /** Last `ussc_matview_meta.refreshed_at`. Null when the freshness gate
   *  read returned `no-meta` / `meta-missing`. */
  last_refreshed: string | null;
  /** True when the freshness gate classified the matview as stale
   *  (>30d). Renderers should append a disclosure when true; they are
   *  NOT obligated to suppress the numbers. */
  is_stale: boolean;
  /** When the helper returns null/empty for an avoidable reason
   *  (unmappable charge, freshness short-circuit, etc.) this carries
   *  the diagnostic label. Renderers may show or hide. */
  fallback_reason: string | null;
}

/** Empty result builder. Used in every short-circuit path so the shape
 *  stays consistent and renderers never have to test `result === null`. */
function emptyResult(
  charge: string,
  district: string | null,
  tier: SentencingDistributionTier,
  fallback_reason: string | null,
  last_refreshed: string | null = null,
  is_stale = false,
): SentencingDistributionResult {
  return {
    charge,
    district,
    tier,
    district_agg: null,
    national_agg: null,
    coverage_status: "no-data-anywhere",
    district_sample_n: 0,
    national_sample_n: 0,
    last_refreshed,
    is_stale,
    fallback_reason,
  };
}

function reshape(agg: FsdAggregate | null): SentencingTriple | null {
  if (!agg) return null;
  return {
    p25: agg.p25_months,
    median: agg.median_months,
    p75: agg.p75_months,
    sample_n: agg.total_n,
    earliest_fy: agg.earliest_fy,
    latest_fy: agg.latest_fy,
  };
}

/**
 * Tier-aware sentencing-distribution lookup.
 *
 * Honors freshness gate + coverage floor. Returns a stable shape for
 * every code path so renderers can iterate over `result` without
 * null-juggling.
 */
export async function getSentencingDistribution(
  sb: SupabaseClient,
  input: GetSentencingDistributionInput,
): Promise<SentencingDistributionResult> {
  const charge = input.charge;
  const district = input.district ?? null;
  const tier = input.tier;

  // Step 1 — resolve charge slug to a USSC offguide code. Unmappable
  // charges (state-only DUI, rare federal etc.) short-circuit to an
  // empty result with an honest fallback_reason. The renderer will
  // suppress the section rather than fabricate a number.
  const offguide_code = chargeTypeToFsdOffguide(charge);
  if (offguide_code === null) {
    return emptyResult(
      charge,
      district,
      tier,
      "Charge isn't mapped to a federal sentencing guideline.",
    );
  }

  // Step 2 — freshness gate. Read latest meta row. Stale or missing meta
  // does NOT block the query (same policy as `ussc-similar-cases`'s
  // queryBucket — degrade open) but DOES annotate the result so the
  // renderer can disclose.
  const freshness = await checkUsscFreshness(sb);
  const last_refreshed = freshness.refreshed_at;
  const is_stale = freshness.is_stale && freshness.reason === "stale-data";

  // Step 3 — resolve criminal history (explicit > derived from priors >
  // null). Mirrors the FSDR route's resolution order.
  const ch =
    typeof input.criminalHistoryCategory === "string" &&
    input.criminalHistoryCategory.length > 0
      ? input.criminalHistoryCategory
      : priorsToChCategory(input.priorConvictions ?? null);

  // Step 4 — fire the underlying queryDistribution. It already handles
  // 4-tier progressive widening (exact -> widened_ch_missing ->
  // widened_criminal_history -> widened_district -> insufficient_data)
  // so we don't reimplement.
  const fsd = await queryDistribution(sb, {
    district,
    offguide_code,
    criminal_history_category: ch ?? null,
    fy_from: input.fyFrom ?? 14,
    fy_to: input.fyTo ?? 24,
  });

  const district_triple = reshape(fsd.district_agg);
  const national_triple = reshape(fsd.national_agg);
  const district_sample_n = district_triple?.sample_n ?? 0;
  const national_sample_n = national_triple?.sample_n ?? 0;

  // Step 5 — apply coverage gate. Each tier has its own minimum.
  const floor = TIER_DISTRICT_FLOOR[tier];
  let coverage_status: SentencingDistributionResult["coverage_status"];
  let kept_district_triple: SentencingTriple | null = district_triple;

  if (!district) {
    coverage_status = "no-district-supplied";
    kept_district_triple = null;
  } else if (!district_triple || district_sample_n === 0) {
    coverage_status = "district-empty";
    kept_district_triple = null;
  } else if (district_sample_n < floor) {
    coverage_status = "district-below-floor";
    kept_district_triple = null;
  } else {
    coverage_status = "district-rendered";
  }

  // Step 6 — when both district AND national are empty, surface
  // `no-data-anywhere` so the renderer suppresses the section entirely.
  if (!kept_district_triple && !national_triple) {
    return {
      ...emptyResult(charge, district, tier, "No data for this charge across FY14-FY24.", last_refreshed, is_stale),
      district_sample_n,
      national_sample_n,
    };
  }

  return {
    charge,
    district,
    tier,
    district_agg: kept_district_triple,
    national_agg: national_triple,
    coverage_status,
    district_sample_n,
    national_sample_n,
    last_refreshed,
    is_stale,
    fallback_reason:
      coverage_status === "district-below-floor"
        ? `District sample of ${district_sample_n} cases below ${tier} threshold of ${floor}.`
        : coverage_status === "district-empty"
          ? "No cases for this charge in this district across FY14-FY24."
          : null,
  };
}

/**
 * Tier-specific renderer — produces the prose/chart appropriate to each
 * report tier. CD = one sentence. IB = one paragraph + ascii bar. X-Ray
 * = full ascii chart. JRC = judge-specific overlay disclaimer.
 *
 * Returns plain-text (HTML-escaping is the caller's job) so the same
 * renderer can be embedded in HTML reports OR plain-text emails.
 *
 * **UPL compliance:** every output path surfaces statistical facts only.
 * No banned phrases ("you should", "we recommend", "your best option",
 * "this proves", "you are likely"). The numbers belong to the defendant
 * and their attorney — this function never interprets them.
 *
 * Returns `""` when there is no usable data for the charge; callers
 * should suppress the section entirely rather than render an empty block.
 */
export function renderSentencingDistribution(
  result: SentencingDistributionResult,
): string {
  // No data anywhere — emit nothing the caller can drop in.
  if (!result.district_agg && !result.national_agg) {
    return "";
  }

  const stale = result.is_stale
    ? ` (matview last refreshed ${result.last_refreshed?.slice(0, 10) ?? "unknown"} — older than 30-day freshness floor)`
    : "";
  const district = result.district_agg;
  const national = result.national_agg;

  switch (result.tier) {
    case "case-decoder":
      // One sentence. Uses district when available, falls back to
      // national. Keeps it minimal — CD's job is orientation.
      if (district && district.median != null) {
        return `Federal sentences for this charge in your district cluster around ${district.median} months (p25 ${district.p25 ?? "—"}, p75 ${district.p75 ?? "—"}; ${district.sample_n} cases FY${district.earliest_fy}–FY${district.latest_fy})${stale}.`;
      }
      if (national && national.median != null) {
        return `Federal sentences for this charge nationally cluster around ${national.median} months (p25 ${national.p25 ?? "—"}, p75 ${national.p75 ?? "—"}; ${national.sample_n} cases FY${national.earliest_fy}–FY${national.latest_fy})${stale}.`;
      }
      return "";

    case "intelligence-brief": {
      // Paragraph + tiny ascii spread. Numbers presented but not
      // interpreted — no "you should expect" / "the likely outcome is".
      const lines: string[] = [];
      if (district && district.median != null) {
        lines.push(
          `In your district, federal sentences for this charge across FY${district.earliest_fy}–FY${district.latest_fy} (${district.sample_n} cases): median ${district.median} months, with the middle 50% landing between ${district.p25 ?? "—"} and ${district.p75 ?? "—"} months.`,
        );
      } else if (result.coverage_status === "district-below-floor") {
        lines.push(
          `Your district has too few cases to summarize alone (${result.district_sample_n} cases). Falling back to national distribution for this charge.`,
        );
      } else if (result.coverage_status === "no-district-supplied") {
        lines.push(
          `No district supplied — showing national distribution for this charge.`,
        );
      }
      if (national && national.median != null) {
        lines.push(
          `Nationally for the same FY range (${national.sample_n} cases): median ${national.median} months, p25 ${national.p25 ?? "—"}, p75 ${national.p75 ?? "—"}.`,
        );
      }
      if (district?.median != null) {
        // ascii spread bar (fixed width 40)
        lines.push(asciiSpread(district));
      } else if (national?.median != null) {
        lines.push(asciiSpread(national));
      }
      if (stale) lines.push(`Source freshness${stale}.`);
      return lines.join("\n\n");
    }

    case "xray": {
      // Full ascii chart with both district + national overlays plus
      // explicit percentile callouts.
      const lines: string[] = ["Federal sentencing distribution"];
      if (district && district.median != null) {
        lines.push(`District (${result.district ?? "?"}): n=${district.sample_n} FY${district.earliest_fy}–FY${district.latest_fy}`);
        lines.push(`  p25 ${district.p25 ?? "—"} | median ${district.median} | p75 ${district.p75 ?? "—"}  (months)`);
        lines.push(asciiSpread(district));
      }
      if (national && national.median != null) {
        lines.push(`National: n=${national.sample_n} FY${national.earliest_fy}–FY${national.latest_fy}`);
        lines.push(`  p25 ${national.p25 ?? "—"} | median ${national.median} | p75 ${national.p75 ?? "—"}  (months)`);
        lines.push(asciiSpread(national));
      }
      if (result.fallback_reason) lines.push(`Note: ${result.fallback_reason}`);
      if (stale) lines.push(`Source freshness${stale}.`);
      return lines.join("\n");
    }

    case "judge-report-card": {
      // Judge-specific overlay disclaimer — the helper's district_agg
      // is district-wide, NOT per-judge. JRC's role is to call out that
      // the district baseline is what we have when judge-specific
      // sample is too thin (most judges).
      const lines: string[] = ["District-wide sentencing baseline (judge-specific overlay pending sample)"];
      if (district && district.median != null) {
        lines.push(`District (${result.district ?? "?"}) baseline across ${district.sample_n} cases FY${district.earliest_fy}–FY${district.latest_fy}: median ${district.median} months (p25 ${district.p25 ?? "—"}, p75 ${district.p75 ?? "—"}).`);
        lines.push("Use this as the district floor; judge-specific deviation requires a separate per-judge sample threshold.");
      } else if (result.coverage_status === "district-below-floor") {
        lines.push(
          `District has too few cases (${result.district_sample_n}) to anchor a judge-specific overlay; widening to national.`,
        );
      } else {
        lines.push("No usable district sample; widening to national.");
      }
      if (national && national.median != null) {
        lines.push(`National baseline (${national.sample_n} cases): median ${national.median} months, p25 ${national.p25 ?? "—"}, p75 ${national.p75 ?? "—"}.`);
      }
      if (stale) lines.push(`Source freshness${stale}.`);
      return lines.join("\n");
    }
  }
}

/**
 * Tiny ascii bar showing p25 → p75 spread anchored on a 40-wide axis.
 * Rendered as plain text so it lives in HTML (`<pre>`), email, or JSON.
 *
 *   p25    median    p75
 *   |─────────●─────────|    (40 chars)
 */
function asciiSpread(t: SentencingTriple): string {
  if (t.p25 == null || t.p75 == null || t.median == null) return "";
  const lo = t.p25;
  const hi = t.p75;
  const med = t.median;
  if (hi <= lo) return `[${med} mo flat]`;
  const width = 40;
  const medPos = Math.max(0, Math.min(width - 1, Math.round(((med - lo) / (hi - lo)) * (width - 1))));
  const bar: string[] = ["|"];
  for (let i = 1; i < width - 1; i++) {
    bar.push(i === medPos ? "●" : "─");
  }
  bar.push("|");
  return `${lo}mo ${bar.join("")} ${hi}mo`;
}
