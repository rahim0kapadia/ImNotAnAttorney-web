/**
 * FARS County DUI Stats — Mercer voice helpers.
 *
 * Reads from the `public.fars_county_dui_stats` materialized view
 * (migration 20260503a_fars_county_dui_stats.sql) to render historical
 * DUI fatality context for a given county. Powers:
 *
 *   - Case Decoder ($197) county-context paragraph (DUI charge only)
 *   - DUI Playbook county sidebar (sales-page section)
 *
 * UPL (HARD):
 *   - Output is strictly historical / informational. No outcome
 *     prediction. No advice. No "you should". No "your case will".
 *   - Denominator label is "driving-age adults", NEVER
 *     "licensed drivers" — county-level licensed-driver counts are
 *     not in our schema; the matview uses ACS pop_18_plus.
 *   - Rendered prose is reviewed against UPL_BANNED_PHRASES in tests.
 *
 * Voice:
 *   - Mercer mode CHARM (defendant-facing, second-person "you / your").
 *   - Composed measured cadence; no urgency; no hype.
 *
 * Source row shape (from matview):
 *   state_fips char(2), county_fips char(3), year smallint,
 *   county_name text, state_name text,
 *   dui_crashes int, dui_fatalities int, pop_18_plus int,
 *   fatalities_per_100k_adults numeric(10,2),  -- nullable
 *   state_year_percentile numeric(4,1)         -- nullable
 *
 * Source: TICKET-11.
 */
import { createAdminClient } from "@/lib/supabase/admin";

// ------------------------------------------------------------
// Public types
// ------------------------------------------------------------

export type CountyDuiYearRow = {
  year: number;
  duiCrashes: number;
  duiFatalities: number;
  fatalitiesPer100kAdults: number | null;
  stateYearPercentile: number | null;
};

export type CountyDuiContext = {
  /** Two-char zero-padded state FIPS, e.g. "12". */
  stateFips: string;
  /** Three-char zero-padded county FIPS, e.g. "103". */
  countyFips: string;
  /** Display name from ACS, e.g. "Pinellas County". May be null when ACS row missing. */
  countyName: string | null;
  /** Display state name, e.g. "Florida". */
  stateName: string | null;
  /** Most recent year present in the matview for this county. */
  latestYear: number | null;
  /** Up-to-5 most-recent year rows, newest first. */
  recentYears: CountyDuiYearRow[];
  /**
   * Sum of DUI fatalities across `recentYears`.
   * Calculated client-side so callers can render either the bare
   * sum (if all 5 are present) or the partial sum (if FARS coverage
   * is thin) without re-walking the rows.
   */
  recentYearsFatalities: number;
  /**
   * Number of years actually summed into `recentYearsFatalities`
   * (matview presence, NOT calendar gap).
   */
  recentYearsCount: number;
};

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

/** How many recent years to include in the customer-facing window. */
export const FARS_COUNTY_RECENT_WINDOW_YEARS = 5;

/** Denominator label — locked to ACS pop_18_plus, NOT licensed drivers. */
export const FARS_COUNTY_DENOMINATOR_LABEL = "driving-age adults" as const;

// ------------------------------------------------------------
// FIPS normalization
// ------------------------------------------------------------

/**
 * Normalize a state FIPS code into the matview's char(2) zero-padded
 * form. Accepts numbers, integer strings, or already-padded strings.
 * Returns null on invalid input.
 */
export function normalizeStateFips(input: string | number | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim();
  if (!/^\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  if (n < 1 || n > 99) return null;
  return s.padStart(2, "0");
}

/**
 * Normalize a county FIPS code into the matview's char(3) zero-padded
 * form. Accepts the 3-digit county portion ONLY (NOT the 5-digit GEOID).
 * Use `splitCountyGeoid` if you have a 5-digit GEOID.
 */
export function normalizeCountyFips(input: string | number | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  if (n < 1 || n > 999) return null;
  return s.padStart(3, "0");
}

/**
 * Split a 5-digit GEOID (state(2) + county(3)) into its two parts.
 * Returns null on invalid input.
 */
export function splitCountyGeoid(geoid: string | null | undefined): { stateFips: string; countyFips: string } | null {
  if (geoid === null || geoid === undefined) return null;
  const s = String(geoid).trim();
  if (!/^\d{5}$/.test(s)) return null;
  return { stateFips: s.slice(0, 2), countyFips: s.slice(2, 5) };
}

/**
 * State name + abbrev → FIPS lookup.
 * Intake `state` field is messy in the wild ("Florida", "FL", garbage),
 * so the helper accepts either form. Returns null when input doesn't
 * match a known US state.
 */
const STATE_NAME_TO_FIPS: Readonly<Record<string, string>> = Object.freeze({
  alabama: "01", alaska: "02", arizona: "04", arkansas: "05", california: "06",
  colorado: "08", connecticut: "09", delaware: "10", "district of columbia": "11",
  florida: "12", georgia: "13", hawaii: "15", idaho: "16", illinois: "17",
  indiana: "18", iowa: "19", kansas: "20", kentucky: "21", louisiana: "22",
  maine: "23", maryland: "24", massachusetts: "25", michigan: "26", minnesota: "27",
  mississippi: "28", missouri: "29", montana: "30", nebraska: "31", nevada: "32",
  "new hampshire": "33", "new jersey": "34", "new mexico": "35", "new york": "36",
  "north carolina": "37", "north dakota": "38", ohio: "39", oklahoma: "40",
  oregon: "41", pennsylvania: "42", "rhode island": "44", "south carolina": "45",
  "south dakota": "46", tennessee: "47", texas: "48", utah: "49", vermont: "50",
  virginia: "51", washington: "53", "west virginia": "54", wisconsin: "55", wyoming: "56",
});

const STATE_ABBREV_TO_FIPS: Readonly<Record<string, string>> = Object.freeze({
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09",
  DE: "10", DC: "11", FL: "12", GA: "13", HI: "15", ID: "16", IL: "17",
  IN: "18", IA: "19", KS: "20", KY: "21", LA: "22", ME: "23", MD: "24",
  MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30", NE: "31",
  NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38",
  OH: "39", OK: "40", OR: "41", PA: "42", RI: "44", SC: "45", SD: "46",
  TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53", WV: "54",
  WI: "55", WY: "56",
});

export function stateInputToFips(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  // Already FIPS?
  if (/^\d{1,2}$/.test(raw)) return normalizeStateFips(raw);
  // Abbreviation?
  if (raw.length === 2) {
    const abbrev = raw.toUpperCase();
    return STATE_ABBREV_TO_FIPS[abbrev] ?? null;
  }
  // Full name (case-insensitive)?
  const key = raw.toLowerCase();
  return STATE_NAME_TO_FIPS[key] ?? null;
}

// ------------------------------------------------------------
// Data fetch
// ------------------------------------------------------------

/**
 * Load county DUI context from the matview.
 *
 * Returns null when:
 *   - FIPS inputs are malformed
 *   - The matview has no rows for this (state, county)
 *
 * Callers MUST handle null — counties with FIPS codes that retired
 * between FARS year and ACS vintage produce no matview row.
 */
export async function getCountyDuiContext(
  stateFipsInput: string | number | null | undefined,
  countyFipsInput: string | number | null | undefined,
  opts: { windowYears?: number } = {},
): Promise<CountyDuiContext | null> {
  const stateFips = normalizeStateFips(stateFipsInput);
  const countyFips = normalizeCountyFips(countyFipsInput);
  if (!stateFips || !countyFips) return null;

  const window = Math.max(1, Math.min(20, opts.windowYears ?? FARS_COUNTY_RECENT_WINDOW_YEARS));

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("fars_county_dui_stats")
    .select(
      "state_fips, county_fips, year, county_name, state_name, dui_crashes, dui_fatalities, fatalities_per_100k_adults, state_year_percentile",
    )
    .eq("state_fips", stateFips)
    .eq("county_fips", countyFips)
    .order("year", { ascending: false })
    .limit(window);

  if (error) {
    // Don't throw — the report layer must keep rendering even if FARS
    // is unavailable. Caller handles the null and skips the section.
    return null;
  }
  if (!data || data.length === 0) return null;

  const recentYears: CountyDuiYearRow[] = data.map((r) => ({
    year: Number(r.year),
    duiCrashes: Number(r.dui_crashes ?? 0),
    duiFatalities: Number(r.dui_fatalities ?? 0),
    fatalitiesPer100kAdults: r.fatalities_per_100k_adults === null || r.fatalities_per_100k_adults === undefined
      ? null
      : Number(r.fatalities_per_100k_adults),
    stateYearPercentile: r.state_year_percentile === null || r.state_year_percentile === undefined
      ? null
      : Number(r.state_year_percentile),
  }));

  const recentYearsFatalities = recentYears.reduce((acc, r) => acc + r.duiFatalities, 0);

  return {
    stateFips,
    countyFips,
    countyName: data[0].county_name ?? null,
    stateName: data[0].state_name ?? null,
    latestYear: recentYears[0]?.year ?? null,
    recentYears,
    recentYearsFatalities,
    recentYearsCount: recentYears.length,
  };
}

/**
 * Resolve (stateText, countyText) → matview row keys via ACS lookup.
 * Returns null when either input is unrecognized or no ACS row exists.
 *
 * The `countyText` is matched case-insensitively with optional
 * "County" suffix tolerance ("Pinellas" and "Pinellas County" both
 * resolve to FIPS 12-103).
 */
export async function resolveCountyByName(
  stateText: string | null | undefined,
  countyText: string | null | undefined,
): Promise<{ stateFips: string; countyFips: string } | null> {
  const stateFips = stateInputToFips(stateText ?? null);
  if (!stateFips) return null;
  const ct = (countyText ?? "").trim();
  if (!ct) return null;

  // Tolerate "Pinellas" / "Pinellas County" / "PINELLAS COUNTY" / etc.
  const normalized = ct.replace(/\s+county\s*$/i, "").trim();
  if (!normalized) return null;

  const supabase = createAdminClient();
  // Use ILIKE prefix match on county_name with explicit state_fips bound.
  const { data, error } = await supabase
    .from("acs_county_demographics")
    .select("state_fips, county_fips, county_name")
    .eq("state_fips", stateFips)
    .ilike("county_name", `${normalized}%`)
    .limit(2);
  if (error) return null;
  if (!data || data.length === 0) return null;
  // If multiple matches, prefer exact (post-strip) name match.
  const exact = data.find((r) => (r.county_name ?? "").replace(/\s+county\s*$/i, "").toLowerCase() === normalized.toLowerCase());
  const pick = exact ?? data[0];
  return { stateFips: pick.state_fips, countyFips: pick.county_fips };
}

/**
 * Convenience wrapper for the report-render call site: resolve then
 * fetch in one call. Returns null on any failure (unknown state /
 * unknown county / no FARS rows / DB error). Caller skips the
 * county section when null.
 */
export async function getCountyDuiContextByName(
  stateText: string | null | undefined,
  countyText: string | null | undefined,
  opts: { windowYears?: number } = {},
): Promise<CountyDuiContext | null> {
  const fips = await resolveCountyByName(stateText, countyText);
  if (!fips) return null;
  return getCountyDuiContext(fips.stateFips, fips.countyFips, opts);
}

// ------------------------------------------------------------
// Quartile bucketing — strictly descriptive, no advice
// ------------------------------------------------------------

/**
 * Map a state-year percentile (0-100) into a coarse descriptive bucket.
 * The buckets are deliberately neutral — "lowest quartile" / "second
 * quartile" / etc. — and never say "best" or "worst" or "high risk".
 */
export function describePercentileBucket(percentile: number | null): string | null {
  if (percentile === null) return null;
  if (percentile < 0 || percentile > 100) return null;
  if (percentile < 25) return "the lowest quartile for DUI fatality density";
  if (percentile < 50) return "the second quartile for DUI fatality density";
  if (percentile < 75) return "the third quartile for DUI fatality density";
  return "the top quartile for DUI fatality density";
}

// ------------------------------------------------------------
// Mercer-voice prose renderers
// ------------------------------------------------------------

function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : (plural ?? singular + "s");
}

/**
 * Render the Case Decoder county-context paragraph (Mercer CHARM).
 *
 * Returns plain prose suitable for inlining into the CD report body
 * inside an aside or paragraph block. Returns null when the context
 * has no usable rows (caller should skip the section entirely).
 *
 * UPL constraints:
 *   - Strictly historical (NEVER "you will", "you should", "likely")
 *   - Denominator is "driving-age adults" only
 *   - Percentile is described as a state cohort position, not a risk
 *     prediction
 *
 * Output shape (single paragraph):
 *   "{County}, {State}: {N} DUI fatalities over the last {K} years
 *    of FARS data ({first}-{last}). Most recent year on file
 *    ({latest}): {R} fatalities per 100K driving-age adults — {bucket}
 *    in {state} that year."
 */
export function renderCdCountyParagraph(ctx: CountyDuiContext | null): string | null {
  if (!ctx || ctx.recentYearsCount === 0) return null;
  const county = ctx.countyName?.trim() || "this county";
  const state = ctx.stateName?.trim() || "this state";

  const earliest = ctx.recentYears[ctx.recentYears.length - 1].year;
  const latestRow = ctx.recentYears[0];

  const headline =
    `${county}, ${state}: ${ctx.recentYearsFatalities} DUI ${pluralize(ctx.recentYearsFatalities, "fatality", "fatalities")} ` +
    `recorded across the last ${ctx.recentYearsCount} ${pluralize(ctx.recentYearsCount, "year")} of FARS data ` +
    `(${earliest}-${latestRow.year}).`;

  const rateClause = (() => {
    if (latestRow.fatalitiesPer100kAdults === null) {
      return ` Most recent year on file (${latestRow.year}): ${latestRow.duiFatalities} ${pluralize(latestRow.duiFatalities, "fatality", "fatalities")} (per-capita rate unavailable for this county).`;
    }
    const rate = latestRow.fatalitiesPer100kAdults.toFixed(2);
    const bucket = describePercentileBucket(latestRow.stateYearPercentile);
    const bucketClause = bucket ? ` That places ${county} in ${bucket} for ${state} that year.` : "";
    return ` Most recent year on file (${latestRow.year}): ${rate} ${FARS_COUNTY_DENOMINATOR_LABEL === "driving-age adults" ? "fatalities per 100K driving-age adults" : "fatalities per capita"}.${bucketClause}`;
  })();

  return headline + rateClause;
}

/**
 * Render the CD county aside as escaped HTML — safe to inline into
 * the mechanical CD skeleton. Returns null when no paragraph would
 * render (caller MUST omit the section to keep the report tight).
 *
 * UPL: same constraints as renderCdCountyParagraph — historical and
 * informational only. Source line surfaces NHTSA FARS publicly.
 */
export function renderCdCountyAsideHtml(ctx: CountyDuiContext | null): string | null {
  const para = renderCdCountyParagraph(ctx);
  if (!para) return null;
  // The paragraph contains only county name, state name, integers,
  // numerics — no user input — but escape defensively to keep the
  // sanitize-html invariant (Architectural Invariant 12) happy.
  const safe = String(para)
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;");
  return `<aside class="county-context" data-source="fars">
  <h3>County DUI history (NHTSA FARS)</h3>
  <p>${safe}</p>
  <p class="source-note"><small>Source: National Highway Traffic Safety Administration, Fatality Analysis Reporting System. Denominator: ACS driving-age adult population. Historical / informational only.</small></p>
</aside>`;
}

/**
 * Render a compact county sidebar block for the DUI Playbook sales
 * page. Returns plain text lines (no HTML) — caller wraps in markup.
 *
 * Sidebar shape (4-6 short lines, scan-friendly):
 *   "{County}, {State}"
 *   "DUI fatalities, last {K} years: {N}"
 *   "{latest} rate: {R} per 100K driving-age adults"
 *   "Position vs. {state} counties ({latest}): {bucket}"
 *   "Source: NHTSA FARS"
 */
export function renderDuiPlaybookCountySidebar(ctx: CountyDuiContext | null): string[] | null {
  if (!ctx || ctx.recentYearsCount === 0) return null;
  const county = ctx.countyName?.trim() || "This county";
  const state = ctx.stateName?.trim() || "this state";
  const latestRow = ctx.recentYears[0];

  const lines: string[] = [];
  lines.push(`${county}, ${state}`);
  lines.push(
    `DUI fatalities, last ${ctx.recentYearsCount} ${pluralize(ctx.recentYearsCount, "year")}: ${ctx.recentYearsFatalities}`,
  );
  if (latestRow.fatalitiesPer100kAdults !== null) {
    lines.push(`${latestRow.year} rate: ${latestRow.fatalitiesPer100kAdults.toFixed(2)} per 100K driving-age adults`);
    const bucket = describePercentileBucket(latestRow.stateYearPercentile);
    if (bucket) {
      lines.push(`Position vs. ${state} counties (${latestRow.year}): ${bucket}`);
    }
  } else {
    lines.push(`${latestRow.year}: ${latestRow.duiFatalities} ${pluralize(latestRow.duiFatalities, "fatality", "fatalities")} (per-capita rate unavailable)`);
  }
  lines.push("Source: NHTSA FARS");
  return lines;
}
