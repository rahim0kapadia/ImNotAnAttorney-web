/**
 * Vera County Incarceration Context (TICKET-15)
 *
 * War Room ($4,997) weekly digest + Courthouse Intelligence Pack:
 * county-level jail-population-rate context with national percentile +
 * 3-year trend, sourced from `vera_incarceration_county`
 * (~128K county-year cells; Vera Institute "Incarceration Trends").
 *
 * UPL (HARD):
 *   - Phrasing is HISTORICAL / CONTEXTUAL only ("your county's rate
 *     IS in the Nth percentile" / "rate has trended UP/DOWN over the
 *     last 3 reported years"). NEVER predictive ("rate WILL rise" /
 *     "this MEANS your case ..."). The render layer's banned-phrase
 *     test enforces this.
 *   - Returns aggregate county-year frequencies + national baseline.
 *   - source_url stored on every successful return per
 *     no-hallucinated-legal-data rule.
 *
 * Tier monotonicity:
 *   - War Room weekly digest gets a 1-paragraph summary.
 *   - CIP gets a sidebar with the same data + sample-size note.
 *   - Higher tiers (Situation Room) MAY in future surface county trend
 *     deltas at higher cadence; this module returns the snapshot only.
 *
 * Source: https://github.com/vera-institute/incarceration-trends
 *
 * Plan: TICKET-15 (Vera War Room v1)
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// Constants
// ============================================================

/** Public canonical Vera dataset URL stored on every returned context. */
export const VERA_SOURCE_URL =
  "https://github.com/vera-institute/incarceration-trends";

/** Minimum national sample size before a percentile is considered meaningful. */
export const MIN_NATIONAL_SAMPLE_FOR_PERCENTILE = 100;

/** Minimum number of distinct annual rate observations required for a 3-year
 *  trend assessment. Below this we return trend="insufficient". */
export const MIN_OBSERVATIONS_FOR_TREND = 3;

/** Relative-change threshold for "flat" vs up/down (linear-regression slope
 *  divided by mean). 5% across the 3yr window = directional shift. */
export const FLAT_TREND_REL_THRESHOLD = 0.05;

// ============================================================
// Types
// ============================================================

export interface VeraContextInput {
  /** 5-digit county FIPS, e.g. "12103" for Pinellas County, FL. Preferred. */
  countyFips?: string | null;
  /** 2-letter state code. Used with countyName to resolve countyFips when
   *  countyFips is not directly available (intake-shape callers). */
  state?: string | null;
  /** County name (with or without trailing " County"). Case-insensitive. */
  countyName?: string | null;
}

export interface VeraTrendObservation {
  year: number;
  rate: number;
}

export interface VeraContext {
  countyFips: string;
  countyName: string;
  stateAbbr: string;
  /** Most recent year in the dataset with a non-null total_jail_pop_rate
   *  for this county. */
  latestYear: number;
  /** Jail population per 100,000 county residents in latestYear. */
  latestRate: number;
  /** National percentile (0-100, integer) of latestRate vs all counties
   *  with a non-null rate in latestYear. Higher = higher incarceration. */
  nationalPercentile: number;
  /** National baseline for latestYear: median + mean of total_jail_pop_rate
   *  across all counties with a non-null value that year. */
  nationalBaseline: { median: number; mean: number; sampleSize: number };
  /** Last up-to-3 year-by-year observations for this county, oldest-first. */
  threeYearObservations: VeraTrendObservation[];
  /** Trend direction over threeYearObservations:
   *    "up"           — slope/mean > +FLAT_TREND_REL_THRESHOLD
   *    "down"         — slope/mean < -FLAT_TREND_REL_THRESHOLD
   *    "flat"         — within +/- FLAT_TREND_REL_THRESHOLD
   *    "insufficient" — fewer than MIN_OBSERVATIONS_FOR_TREND observations
   */
  threeYearTrend: "up" | "down" | "flat" | "insufficient";
  /** Source URL — VERA_SOURCE_URL (stored per no-hallucinated-legal-data). */
  sourceUrl: string;
}

// ============================================================
// Pure compute helpers (testable without DB)
// ============================================================

/** Compute the percentile rank (0-100, integer) of `value` against `all`.
 *  Returns the percentage of observations strictly less than or equal to
 *  `value` (Excel PERCENTRANK.INC convention, simplified). */
export function computePercentile(value: number, all: number[]): number {
  if (all.length === 0) return 0;
  let leq = 0;
  for (const v of all) if (v <= value) leq++;
  return Math.round((leq / all.length) * 100);
}

/** Compute population median of an array of numbers. */
export function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];
}

/** Compute population mean of an array of numbers. */
export function computeMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Classify a 3-year trend.
 *  Uses a simple linear-regression slope divided by mean: a relative slope
 *  more extreme than FLAT_TREND_REL_THRESHOLD is "up" or "down"; otherwise
 *  "flat". Fewer than MIN_OBSERVATIONS_FOR_TREND observations -> "insufficient". */
export function classifyTrend(
  observations: VeraTrendObservation[],
): "up" | "down" | "flat" | "insufficient" {
  if (observations.length < MIN_OBSERVATIONS_FOR_TREND) return "insufficient";
  // Sort by year ascending so slope is "rate per year forward".
  const sorted = [...observations].sort((a, b) => a.year - b.year);
  const n = sorted.length;
  const meanX = sorted.reduce((s, o) => s + o.year, 0) / n;
  const meanY = sorted.reduce((s, o) => s + o.rate, 0) / n;
  let num = 0;
  let den = 0;
  for (const o of sorted) {
    num += (o.year - meanX) * (o.rate - meanY);
    den += (o.year - meanX) * (o.year - meanX);
  }
  if (den === 0 || meanY === 0) return "flat";
  const slope = num / den;
  const rel = (slope * (n - 1)) / Math.abs(meanY); // total change over window / mean
  if (rel > FLAT_TREND_REL_THRESHOLD) return "up";
  if (rel < -FLAT_TREND_REL_THRESHOLD) return "down";
  return "flat";
}

/** Normalize a county name for ILIKE matching: strip trailing
 *  " county" / " parish" / " borough" / " census area" suffixes,
 *  lowercase, collapse whitespace. */
export function normalizeCountyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+(county|parish|borough|census area|municipality)$/i, "")
    .replace(/\s+/g, " ");
}

// ============================================================
// DB query
// ============================================================

interface VeraRow {
  year: string | null;
  county_fips: string | null;
  county_name: string | null;
  state_abbr: string | null;
  total_jail_pop_rate: string | null;
}

/** Resolve a county FIPS from state + county name. Returns null if
 *  no unambiguous match. Multiple matches return null too — caller
 *  should provide countyFips directly when in doubt. */
async function resolveCountyFips(
  supabase: ReturnType<typeof createAdminClient>,
  state: string,
  countyName: string,
): Promise<{ countyFips: string; countyName: string; stateAbbr: string } | null> {
  const stateAbbr = state.toUpperCase().trim();
  const normalized = normalizeCountyName(countyName);
  if (!stateAbbr || !normalized) return null;
  const { data } = await supabase
    .from("vera_incarceration_county")
    .select("county_fips, county_name, state_abbr")
    .eq("state_abbr", stateAbbr)
    .ilike("county_name", `${normalized}%`)
    .not("county_fips", "is", null)
    .limit(50);
  if (!data || data.length === 0) return null;
  // Dedupe on county_fips — Vera has multi-year rows per county.
  const distinct = new Map<string, { name: string; abbr: string }>();
  for (const r of data) {
    const fips = (r.county_fips as string | null) ?? "";
    if (!fips) continue;
    if (!distinct.has(fips)) {
      distinct.set(fips, {
        name: (r.county_name as string | null) ?? countyName,
        abbr: (r.state_abbr as string | null) ?? stateAbbr,
      });
    }
  }
  if (distinct.size !== 1) return null;
  const [fips, meta] = distinct.entries().next().value as [
    string,
    { name: string; abbr: string },
  ];
  return { countyFips: fips, countyName: meta.name, stateAbbr: meta.abbr };
}

/**
 * Fetch Vera county incarceration context.
 *
 * Returns null when:
 *   - countyFips cannot be resolved (no state+countyName match, ambiguous)
 *   - county has zero non-null total_jail_pop_rate observations
 *   - latest-year national sample size below MIN_NATIONAL_SAMPLE_FOR_PERCENTILE
 *     (rare; recent Vera years have 1400+ counties with rate data)
 *
 * Implementation note: pulls all non-null county-year rows for the resolved
 * countyFips, picks the latest year with rate data, then pulls all national
 * rows for THAT year for percentile + baseline. Two queries total.
 */
export async function getVeraContext(
  input: VeraContextInput,
): Promise<VeraContext | null> {
  const supabase = createAdminClient();

  // Resolve countyFips: prefer direct, else state+countyName lookup.
  let countyFips = (input.countyFips ?? "").trim();
  let countyName = "";
  let stateAbbr = "";

  if (!countyFips) {
    if (!input.state || !input.countyName) return null;
    const resolved = await resolveCountyFips(
      supabase,
      input.state,
      input.countyName,
    );
    if (!resolved) return null;
    countyFips = resolved.countyFips;
    countyName = resolved.countyName;
    stateAbbr = resolved.stateAbbr;
  }

  // Pull county history (rate-bearing rows only).
  const { data: countyRows, error: countyErr } = await supabase
    .from("vera_incarceration_county")
    .select("year, county_fips, county_name, state_abbr, total_jail_pop_rate")
    .eq("county_fips", countyFips)
    .not("total_jail_pop_rate", "is", null)
    .order("year", { ascending: false })
    .limit(20);

  if (countyErr || !countyRows || countyRows.length === 0) {
    return null;
  }

  // Parse + sort county observations.
  const obs: VeraTrendObservation[] = [];
  for (const r of countyRows as VeraRow[]) {
    const yr = r.year ? parseInt(r.year, 10) : NaN;
    const rate = r.total_jail_pop_rate
      ? parseFloat(r.total_jail_pop_rate)
      : NaN;
    if (Number.isFinite(yr) && Number.isFinite(rate)) {
      obs.push({ year: yr, rate });
      // Backfill name/state from first row if not already set via resolve step.
      if (!countyName && r.county_name) countyName = r.county_name;
      if (!stateAbbr && r.state_abbr) stateAbbr = r.state_abbr;
    }
  }
  if (obs.length === 0) return null;

  obs.sort((a, b) => b.year - a.year); // latest first
  const latestYear = obs[0].year;
  const latestRate = obs[0].rate;

  // Last up-to-3 observations (oldest -> newest for chart-friendly readout).
  const recent = obs.slice(0, 3).sort((a, b) => a.year - b.year);

  // Pull national distribution for latestYear.
  // Note: pageSize=2000 covers Vera's max ~2900 counties/yr without paging
  // for percentile purposes; the national sample is the universe for that
  // year, and the percentile is computed against ALL returned rows.
  const { data: nationalRows, error: natErr } = await supabase
    .from("vera_incarceration_county")
    .select("total_jail_pop_rate")
    .eq("year", String(latestYear))
    .not("total_jail_pop_rate", "is", null)
    .limit(5000);

  if (natErr || !nationalRows) return null;

  const nationalRates: number[] = [];
  for (const r of nationalRows as Array<{ total_jail_pop_rate: string | null }>) {
    const v = r.total_jail_pop_rate ? parseFloat(r.total_jail_pop_rate) : NaN;
    if (Number.isFinite(v)) nationalRates.push(v);
  }

  if (nationalRates.length < MIN_NATIONAL_SAMPLE_FOR_PERCENTILE) {
    return null;
  }

  const percentile = computePercentile(latestRate, nationalRates);
  const median = computeMedian(nationalRates);
  const mean = computeMean(nationalRates);

  return {
    countyFips,
    countyName: countyName || "(unknown county)",
    stateAbbr: stateAbbr || (input.state ?? "??").toUpperCase(),
    latestYear,
    latestRate: Math.round(latestRate * 100) / 100,
    nationalPercentile: percentile,
    nationalBaseline: {
      median: Math.round(median * 100) / 100,
      mean: Math.round(mean * 100) / 100,
      sampleSize: nationalRates.length,
    },
    threeYearObservations: recent.map((o) => ({
      year: o.year,
      rate: Math.round(o.rate * 100) / 100,
    })),
    threeYearTrend: classifyTrend(recent),
    sourceUrl: VERA_SOURCE_URL,
  };
}

// ============================================================
// Render helpers (HTML — UPL-safe, historical/contextual phrasing only)
// ============================================================

/** Ordinal suffix for an integer (1 -> "1st", 2 -> "2nd", 23 -> "23rd"). */
function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Human-readable trend label for body copy. UPL-safe historical phrasing. */
export function describeTrend(
  trend: VeraContext["threeYearTrend"],
  observations: VeraTrendObservation[],
): string {
  if (trend === "insufficient") {
    return "with insufficient recent data to assess a multi-year trend";
  }
  if (observations.length < 2) {
    return "with insufficient recent data to assess a multi-year trend";
  }
  const oldest = observations[0];
  const newest = observations[observations.length - 1];
  const span = newest.year - oldest.year;
  const yearsLabel = span === 1 ? "1 reported year" : `${span} reported years`;
  switch (trend) {
    case "up":
      return `trending up over the last ${yearsLabel} (${oldest.rate.toFixed(0)} → ${newest.rate.toFixed(0)} per 100K)`;
    case "down":
      return `trending down over the last ${yearsLabel} (${oldest.rate.toFixed(0)} → ${newest.rate.toFixed(0)} per 100K)`;
    case "flat":
      return `roughly flat over the last ${yearsLabel} (${oldest.rate.toFixed(0)} → ${newest.rate.toFixed(0)} per 100K)`;
  }
}

/** Single-paragraph War Room digest summary line. UPL-safe.
 *  HTML-safe (no caller input is interpolated; only Vera-derived numerics
 *  + DB-stored county/state strings, which originate from Vera's CSV not
 *  user input — but we still escape county_name defensively). */
export function renderVeraDigestParagraph(ctx: VeraContext): string {
  const trendCopy = describeTrend(ctx.threeYearTrend, ctx.threeYearObservations);
  const safeCounty = escapeHtml(ctx.countyName);
  const safeState = escapeHtml(ctx.stateAbbr);
  return `<p style="margin:12px 0;color:#1f2937;font-size:14px;line-height:1.5;">
    <strong>Your county's incarceration rate</strong> — ${safeCounty}, ${safeState} —
    is in the <strong>${ordinal(ctx.nationalPercentile)} percentile</strong> nationally
    (${ctx.latestRate.toFixed(0)} jail residents per 100,000 in ${ctx.latestYear};
    national median ${ctx.nationalBaseline.median.toFixed(0)}, sample
    ${ctx.nationalBaseline.sampleSize.toLocaleString()} U.S. counties), ${trendCopy}.
    Source: <a href="${escapeHtml(ctx.sourceUrl)}" style="color:#1d4ed8;">Vera Institute Incarceration Trends</a>.
  </p>`;
}

/** Sidebar block for Courthouse Intelligence Pack. Same data + dark-theme
 *  styling matching the surrounding CIP report. */
export function renderVeraCipSidebar(ctx: VeraContext): string {
  const trendCopy = describeTrend(ctx.threeYearTrend, ctx.threeYearObservations);
  const safeCounty = escapeHtml(ctx.countyName);
  const safeState = escapeHtml(ctx.stateAbbr);
  const obsRows = ctx.threeYearObservations
    .map(
      (o) =>
        `<tr><td style="padding:4px 12px;color:#A1A1AA;">${o.year}</td><td style="padding:4px 12px;color:#FAFAF9;text-align:right;">${o.rate.toFixed(1)}</td></tr>`,
    )
    .join("");
  return `<div style="background:#1C1917;border:1px solid #422006;border-radius:8px;padding:16px;margin:24px 0;">
    <h3 style="color:#F59E0B;font-size:16px;margin:0 0 8px;">County Incarceration Context — ${safeCounty}, ${safeState}</h3>
    <p style="color:#D4D4D8;font-size:13px;margin:0 0 12px;line-height:1.5;">
      In ${ctx.latestYear}, ${safeCounty} held <strong style="color:#FAFAF9;">${ctx.latestRate.toFixed(0)}</strong>
      jail residents per 100,000 — placing it in the <strong style="color:#FAFAF9;">${ordinal(ctx.nationalPercentile)} percentile</strong> nationally.
      National median ${ctx.nationalBaseline.median.toFixed(0)} per 100K
      (sample ${ctx.nationalBaseline.sampleSize.toLocaleString()} U.S. counties).
      Rate is ${trendCopy}.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin:8px 0 4px;">
      <thead><tr><th style="padding:4px 12px;color:#F59E0B;text-align:left;">Year</th><th style="padding:4px 12px;color:#F59E0B;text-align:right;">Per 100K</th></tr></thead>
      <tbody>${obsRows}</tbody>
    </table>
    <p style="color:#71717A;font-size:11px;margin:8px 0 0;">
      Source: <a href="${escapeHtml(ctx.sourceUrl)}" style="color:#60A5FA;">Vera Institute Incarceration Trends</a>.
      Aggregate jail-population data, not a prediction of any specific case outcome.
    </p>
  </div>`;
}

/** Local minimal HTML escape — keeps this module independent of @/lib/email
 *  for unit testing purposes (email module pulls Resend SDK / runtime). */
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
