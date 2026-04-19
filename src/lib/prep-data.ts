import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// HELPERS
// ============================================================

/** Escape ILIKE special characters to prevent wildcard injection. */
function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

/**
 * Extract 2-letter state code from "County, ST" format.
 *
 * Short-circuits on the "Unknown County" sentinel written by compact-mode
 * signup flows (see src/app/api/court-reminders/route.ts) — returning null
 * prevents downstream jurisdiction queries from filtering on the literal
 * placeholder (e.g. `.eq("jurisdiction", "Unknown County")`), which would
 * silently return no rows and leak the placeholder into diagnostics.
 */
export function parseStateCode(countyState: string): string | null {
  if (!countyState || countyState === "Unknown County") return null;
  return countyState.split(",").pop()?.trim() || null;
}

// State abbreviation -> full name (for USSC district ILIKE lookups)
const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", GU: "Guam", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska",
  NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", PR: "Puerto Rico", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", VI: "Virgin Islands", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming",
};

// Charge type slug -> taxonomy slug used in DB tables
const CHARGE_TO_TAXONOMY_SLUG: Record<string, string> = {
  "dui-first-offense": "dui-dwi",
  "drug-possession": "drug-possession",
  "drug-trafficking": "drug-trafficking",
  "white-collar": "theft-larceny",
  "federal-criminal": "federal-other",
  "probation-violation": "probation-violation",
  "sex-offense": "sex-offense",
  "self-defense": "self-defense",
  other: "other",
};

// ============================================================
// TYPES
// ============================================================

export interface StatuteData {
  statute_number: string | null;
  statute_title: string | null;
  offense_class: string | null;
  penalty_min: string | null;
  penalty_max: string | null;
  fine_max: string | null;
  elements: string[] | null;
  mandatory_minimum: string | null;
  common_defenses: string[] | null;
  defense_opportunities: string[] | null;
  source_urls: string[] | null;
}

export interface OutcomeData {
  conviction_rate: number | null;
  dismissal_rate: number | null;
  median_sentence_months: number | null;
  plea_conviction_rate: number | null;
  trial_conviction_rate: number | null;
  plea_rate: number | null;
  trial_rate: number | null;
  source_urls: string[] | null;
  data_period: string | null;
  jurisdiction_level: string;
}

export interface SentencingData {
  median_months: number | null;
  p25: number | null;
  p75: number | null;
  sample_size: number;
  source_urls: string[] | null;
}

export interface BenchJuryData {
  bench_acquittal_rate: number | null;
  jury_acquittal_rate: number | null;
  bench_median_sentence: number | null;
  jury_median_sentence: number | null;
  trial_penalty_pct: number | null;
  offense_category: string | null;
  fiscal_year_range: string | null;
  source_urls: string[] | null;
}

export interface PrepAggregateData {
  statute: StatuteData | null;
  outcomes: OutcomeData[];
  sentencing: SentencingData | null;
  benchJury: BenchJuryData[];
  isEmpty: boolean;
}

// ============================================================
// QUERY
// ============================================================

export async function queryPrepData(
  chargeType: string,
  countyState: string
): Promise<PrepAggregateData> {
  const stateCode = parseStateCode(countyState);
  const taxonomySlug = CHARGE_TO_TAXONOMY_SLUG[chargeType] || chargeType;

  if (!stateCode) {
    return { statute: null, outcomes: [], sentencing: null, benchJury: [], isEmpty: true };
  }

  const stateName = STATE_NAMES[stateCode.toUpperCase()] ?? stateCode;
  const supabase = createAdminClient();

  const [statuteRes, outcomesRes, sentencingRes, benchJuryRes] = await Promise.all([
    // 1. jurisdiction_statutes
    supabase
      .from("jurisdiction_statutes")
      .select("statute_number, statute_title, offense_class, penalty_min, penalty_max, fine_max, elements, mandatory_minimum, common_defenses, defense_opportunities, source_urls")
      .eq("common_charge_slug", taxonomySlug)
      .eq("jurisdiction", stateCode)
      .maybeSingle(),

    // 2. outcome_benchmarks
    supabase
      .from("outcome_benchmarks")
      .select("conviction_rate, dismissal_rate, median_sentence_months, plea_conviction_rate, trial_conviction_rate, plea_rate, trial_rate, source_urls, data_period, jurisdiction_level")
      .eq("offense_type", taxonomySlug)
      .in("jurisdiction_level", ["national", "state"])
      .limit(5),

    // 3. sentencing_distributions (aggregate only -- judge_id IS NULL)
    supabase
      .from("sentencing_distributions")
      .select("median_months, p25, p75, sample_size, source_urls")
      .eq("charge_slug", taxonomySlug)
      .eq("jurisdiction", stateCode)
      .is("judge_id", null)
      .order("sample_size", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // 4. bench_jury_divergence (aggregate -- judge_id IS NULL, ILIKE on district)
    supabase
      .from("bench_jury_divergence")
      .select("bench_acquittal_rate, jury_acquittal_rate, bench_median_sentence, jury_median_sentence, trial_penalty_pct, offense_category, fiscal_year_range, source_urls")
      .ilike("district", `%${escapeIlike(stateName)}%`)
      .is("judge_id", null)
      .order("jury_sample", { ascending: false })
      .limit(5),
  ]);

  const statute = statuteRes.data as StatuteData | null;
  const outcomes = (outcomesRes.data || []) as OutcomeData[];
  const sentencing = sentencingRes.data as SentencingData | null;
  const benchJury = (benchJuryRes.data || []) as BenchJuryData[];
  const isEmpty = !statute && outcomes.length === 0 && !sentencing && benchJury.length === 0;

  return { statute, outcomes, sentencing, benchJury, isEmpty };
}
