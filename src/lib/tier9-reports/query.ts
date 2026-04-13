/**
 * Tier 9 database queries — one function per SKU.
 * Queries pre-computed tables populated by bulk extraction scripts.
 * Returns typed results + isEmpty flag for data availability checks.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// TYPES
// ============================================================

export interface JudgeReportCardData {
  judge: {
    id: string;
    name: string;
    court: string | null;
    jurisdiction: string | null;
    sentencing_distributions: unknown | null;
    judicial_quotes: unknown | null;
    bench_acquittal_rate: number | null;
    jury_acquittal_rate: number | null;
  } | null;
  sentencingDistributions: Array<{
    charge_slug: string;
    median_months: number | null;
    p25: number | null;
    p75: number | null;
    sample_size: number;
    source_urls: string[] | null;
  }>;
  prosecutorPairings: Array<{
    prosecutor_name: string;
    motion_type: string | null;
    grant_rate: number | null;
    sample_size: number;
    source_urls: string[] | null;
  }>;
  benchJuryDivergence: Array<{
    charge_slug: string | null;
    bench_acquittal_rate: number | null;
    jury_acquittal_rate: number | null;
    bench_sample: number;
    jury_sample: number;
    source_urls: string[] | null;
    // USSC sentencing divergence columns (populated by ingest-ussc-bench-jury.mjs)
    district: string | null;
    bench_median_sentence: number | null;
    jury_median_sentence: number | null;
    trial_penalty_pct: number | null;
    offense_category: string | null;
    fiscal_year_range: string | null;
    plea_median_sentence: number | null;
    plea_sample: number;
  }>;
  quotes: Array<{
    quote: string;
    topic: string | null;
    case_cited: string | null;
    source_url: string | null;
  }>;
  appellateTrends: Array<{
    argument_type: string;
    reverse_rate: number | null;
    affirm_rate: number | null;
    sample_size: number;
    source_urls: string[] | null;
  }>;
  usscPatterns: {
    total_cases: number;
    median_sentence_months: number | null;
    mean_sentence_months: number | null;
    p25_sentence_months: number | null;
    p75_sentence_months: number | null;
    downward_departure_rate: number | null;
    upward_departure_rate: number | null;
    offense_breakdown: unknown;
    retention_elections: unknown;
    aba_rating: string | null;
    aba_rating_year: number | null;
    source_urls: string[];
    data_period: string | null;
  } | null;
  isEmpty: boolean;
}

export interface OfficerBackgroundData {
  officers: Array<{
    officer_name: string;
    court: string | null;
    jurisdiction: string | null;
    testimony_count: number;
    discredited_count: number;
    reliability_score: number | null;
    brady_history: unknown;
    source_urls: string[] | null;
  }>;
  externalIntel: Array<{
    officer_name: string;
    officer_name_normalized: string;
    state: string | null;
    agency: string | null;
    brady_status: string | null;
    brady_reason: string | null;
    npi_employment_history: unknown;
    npi_is_wandering_officer: boolean | null;
    decertified: boolean;
    decertification_reason: string | null;
    complaint_count: number;
    use_of_force_count: number;
    sustained_complaints: number;
    credibility_risk_score: number | null;
    source_urls: string[];
    sources: string[];
  }>;
  isEmpty: boolean;
}

export interface SimilarCasesData {
  featureVectors: Array<{
    cluster_id: string;
    features: Record<string, unknown>;
    jurisdiction: string | null;
    charge_slug: string | null;
  }>;
  sentencingDistributions: Array<{
    judge_id: string | null;
    charge_slug: string;
    median_months: number | null;
    p25: number | null;
    p75: number | null;
    sample_size: number;
    source_urls: string[] | null;
  }>;
  pleaDiscountCurves: Array<{
    charge_slug: string | null;
    base_sentence: number | null;
    plea_sentence: number | null;
    cooperation_bonus: number | null;
    sample_size: number;
    source_urls: string[] | null;
  }>;
  outcomeBenchmarks: Array<{
    jurisdiction_level: string;
    jurisdiction_name: string;
    offense_type: string;
    total_cases: number | null;
    conviction_rate: number | null;
    dismissal_rate: number | null;
    median_sentence_months: number | null;
    plea_rate: number | null;
    trial_rate: number | null;
    plea_trial_penalty_pct: number | null;
    source_urls: string[];
    data_period: string | null;
  }>;
  appellateTrends: Array<{
    argument_type: string;
    reverse_rate: number | null;
    affirm_rate: number | null;
    sample_size: number;
    source_urls: string[] | null;
  }>;
  isEmpty: boolean;
}

// ============================================================
// INTAKE SHAPES (from standalone_intake JSONB)
// ============================================================

export interface JudgeReportCardIntake {
  judgeName: string;
  state: string;
  chargeType: string;
}

export interface OfficerBackgroundIntake {
  officerName: string;
  state: string;
}

export interface SimilarCasesIntake {
  chargeType: string;
  state: string;
}

// ============================================================
// HELPERS
// ============================================================

/** Escape ILIKE special characters to prevent wildcard injection. */
function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

// State abbreviation → full name (for USSC district ILIKE lookups)
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

const BENCH_JURY_SELECT = "charge_slug, bench_acquittal_rate, jury_acquittal_rate, bench_sample, jury_sample, source_urls, district, bench_median_sentence, jury_median_sentence, trial_penalty_pct, offense_category, fiscal_year_range, plea_median_sentence, plea_sample";

// ============================================================
// QUERIES
// ============================================================

export async function queryJudgeReportCard(
  intake: JudgeReportCardIntake
): Promise<JudgeReportCardData> {
  const supabase = createAdminClient();

  // Look up judge by name (case-insensitive, escaped) + jurisdiction filter.
  const safeName = escapeIlike(intake.judgeName);
  let { data: judges } = await supabase
    .from("judge_profiles")
    .select("id, full_name, jurisdiction, positions, sentencing_distributions, judicial_quotes, bench_acquittal_rate, jury_acquittal_rate")
    .ilike("full_name", `%${safeName}%`)
    .eq("jurisdiction", intake.state)
    .limit(5);

  // Fall back to name-only if jurisdiction filter yields nothing
  if (!judges || judges.length === 0) {
    ({ data: judges } = await supabase
      .from("judge_profiles")
      .select("id, full_name, jurisdiction, positions, sentencing_distributions, judicial_quotes, bench_acquittal_rate, jury_acquittal_rate")
      .ilike("full_name", `%${safeName}%`)
      .limit(5));
  }

  const rawJudge = judges?.[0] ?? null;

  if (!rawJudge) {
    return {
      judge: null,
      sentencingDistributions: [],
      prosecutorPairings: [],
      benchJuryDivergence: [],
      quotes: [],
      appellateTrends: [],
      usscPatterns: null,
      isEmpty: true,
    };
  }

  // Derive court from positions JSONB for display (most recent judicial appointment)
  const judicialPosition = Array.isArray(rawJudge.positions)
    ? (rawJudge.positions as Array<{ court_id?: string; position_type?: string }>)
        .filter((p) => p.position_type === "jud" && p.court_id)
        .sort((a, b) => (b.court_id ?? "").localeCompare(a.court_id ?? ""))[0]
    : null;

  const judge = {
    id: rawJudge.id as string,
    name: rawJudge.full_name as string,
    court: (judicialPosition?.court_id as string) ?? null,
    jurisdiction: (rawJudge.jurisdiction as string) ?? null,
    sentencing_distributions: rawJudge.sentencing_distributions,
    judicial_quotes: rawJudge.judicial_quotes,
    bench_acquittal_rate: rawJudge.bench_acquittal_rate as number | null,
    jury_acquittal_rate: rawJudge.jury_acquittal_rate as number | null,
  };

  // State name for USSC district-level bench/jury fallback lookup
  const stateName = STATE_NAMES[intake.state?.toUpperCase()] ?? intake.state;
  const safeStateName = escapeIlike(stateName);

  // Parallel queries for all related data
  const [sentencing, pairings, divergence, districtDivergence, quotes, appellate, usscData] =
    await Promise.all([
      // Sentencing distributions: try judge-specific first, fall back to charge-level
      // (current data has judge_id=NULL on all rows — charge-level aggregates)
      supabase
        .from("sentencing_distributions")
        .select("charge_slug, median_months, p25, p75, sample_size, source_urls")
        .or(`judge_id.eq.${judge.id},judge_id.is.null`)
        .eq("charge_slug", intake.chargeType)
        .order("sample_size", { ascending: false })
        .limit(50),

      supabase
        .from("judge_prosecutor_pairings")
        .select("prosecutor_name, motion_type, grant_rate, sample_size, source_urls")
        .eq("judge_id", judge.id)
        .order("sample_size", { ascending: false })
        .limit(50),

      // Judge-specific bench/jury data (from CL opinion mining — currently empty)
      supabase
        .from("bench_jury_divergence")
        .select(BENCH_JURY_SELECT)
        .eq("judge_id", judge.id)
        .limit(20),

      // District-level bench/jury data (from USSC — fallback when no judge-level data)
      supabase
        .from("bench_jury_divergence")
        .select(BENCH_JURY_SELECT)
        .ilike("district", `%${safeStateName}%`)
        .is("judge_id", null)
        .order("jury_sample", { ascending: false })
        .limit(20),

      supabase
        .from("judge_quotes")
        .select("quote, topic, case_cited, source_url")
        .eq("judge_id", judge.id)
        .limit(30),

      // Appellate trends: filter by intake state, fall back to "federal" for federal cases
      supabase
        .from("appellate_trends")
        .select("argument_type, reverse_rate, affirm_rate, sample_size, source_urls")
        .or(`jurisdiction.eq.${intake.state},jurisdiction.eq.federal`)
        .order("sample_size", { ascending: false })
        .limit(20),

      supabase
        .from("judge_sentencing_patterns")
        .select("total_cases, median_sentence_months, mean_sentence_months, p25_sentence_months, p75_sentence_months, downward_departure_rate, upward_departure_rate, offense_breakdown, retention_elections, aba_rating, aba_rating_year, source_urls, data_period")
        .ilike("judge_name_normalized", `%${safeName.toLowerCase()}%`)
        .limit(1),
    ]);

  // Prefer judge-level bench/jury data; fall back to district-level USSC data
  const benchJuryData = (divergence.data ?? []).length > 0
    ? (divergence.data ?? [])
    : (districtDivergence.data ?? []);

  return {
    judge,
    sentencingDistributions: sentencing.data ?? [],
    prosecutorPairings: pairings.data ?? [],
    benchJuryDivergence: benchJuryData,
    quotes: (quotes.data ?? [])
      .filter((q) => q.quote && q.quote.length >= 40)
      .sort((a, b) => b.quote.length - a.quote.length),
    appellateTrends: appellate.data ?? [],
    usscPatterns: usscData.data?.[0] ?? null,
    isEmpty: false,
  };
}

export async function queryOfficerBackground(
  intake: OfficerBackgroundIntake
): Promise<OfficerBackgroundData> {
  const supabase = createAdminClient();

  const safeOfficerName = escapeIlike(intake.officerName);

  // Officer reliability: try with jurisdiction filter first, fall back to name-only
  // (all existing rows have jurisdiction="multi", so filter always misses)
  let reliability = await supabase
    .from("officer_reliability")
    .select("officer_name, court, jurisdiction, testimony_count, discredited_count, reliability_score, brady_history, source_urls")
    .ilike("officer_name", `%${safeOfficerName}%`)
    .eq("jurisdiction", intake.state)
    .limit(20);

  if (!reliability.data?.length) {
    reliability = await supabase
      .from("officer_reliability")
      .select("officer_name, court, jurisdiction, testimony_count, discredited_count, reliability_score, brady_history, source_urls")
      .ilike("officer_name", `%${safeOfficerName}%`)
      .limit(20);
  }

  // External intel has proper state column — no fallback needed
  const external = await supabase
    .from("officer_external_intel")
    .select("officer_name, officer_name_normalized, state, agency, brady_status, brady_reason, npi_employment_history, npi_is_wandering_officer, decertified, decertification_reason, complaint_count, use_of_force_count, sustained_complaints, credibility_risk_score, source_urls, sources")
    .ilike("officer_name_normalized", `%${safeOfficerName.toLowerCase()}%`)
    .eq("state", intake.state)
    .limit(20);

  const hasData = (reliability.data?.length ?? 0) > 0 || (external.data?.length ?? 0) > 0;

  return {
    officers: reliability.data ?? [],
    externalIntel: external.data ?? [],
    isEmpty: !hasData,
  };
}

export async function querySimilarCases(
  intake: SimilarCasesIntake
): Promise<SimilarCasesData> {
  const supabase = createAdminClient();

  // chargeType from intake is already in slug format (from ALLOWED_CHARGE_TYPES allowlist)
  const chargeSlug = intake.chargeType;

  const [vectors, sentencing, plea, appellate, benchmarks] = await Promise.all([
    supabase
      .from("case_feature_vectors")
      .select("cluster_id, features, jurisdiction, charge_slug")
      .eq("charge_slug", chargeSlug)
      .eq("jurisdiction", intake.state)
      .limit(50),

    supabase
      .from("sentencing_distributions")
      .select("judge_id, charge_slug, median_months, p25, p75, sample_size, source_urls")
      .eq("charge_slug", chargeSlug)
      .eq("jurisdiction", intake.state)
      .order("sample_size", { ascending: false })
      .limit(50),

    supabase
      .from("plea_discount_curves")
      .select("charge_slug, base_sentence, plea_sentence, cooperation_bonus, sample_size, source_urls")
      .eq("charge_slug", chargeSlug)
      .eq("jurisdiction", intake.state)
      .limit(20),

    supabase
      .from("appellate_trends")
      .select("argument_type, reverse_rate, affirm_rate, sample_size, source_urls")
      .eq("jurisdiction", intake.state)
      .order("sample_size", { ascending: false })
      .limit(20),

    supabase
      .from("outcome_benchmarks")
      .select("jurisdiction_level, jurisdiction_name, offense_type, total_cases, conviction_rate, dismissal_rate, median_sentence_months, plea_rate, trial_rate, plea_trial_penalty_pct, source_urls, data_period")
      .eq("offense_type", chargeSlug)
      .in("jurisdiction_level", ["national", "state"])
      .limit(10),
  ]);

  const hasData =
    (vectors.data?.length ?? 0) > 0 ||
    (sentencing.data?.length ?? 0) > 0 ||
    (plea.data?.length ?? 0) > 0 ||
    (benchmarks.data?.length ?? 0) > 0;

  return {
    featureVectors: vectors.data ?? [],
    sentencingDistributions: sentencing.data ?? [],
    pleaDiscountCurves: plea.data ?? [],
    appellateTrends: appellate.data ?? [],
    outcomeBenchmarks: benchmarks.data ?? [],
    isEmpty: !hasData,
  };
}
