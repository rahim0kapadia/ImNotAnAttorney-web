/**
 * Defense Intelligence Query Module
 *
 * Single query surface for all intelligence data.
 * Wraps and extends tier9-reports/query.ts, no breaking changes.
 *
 * Integration principles (spec Section 7.1):
 *   1. Every product works with zero intelligence data
 *   2. Source URL chain on everything
 *   3. Confidence thresholds per tier
 *   4. Motion-level vs case-level clarity
 *   5. Appellate bias framing
 *
 * Phase 1-2: wraps tier9-reports/query.ts
 * Phase 3: tier9-reports/query.ts deprecated, this becomes sole surface
 */

import { createAdminClient } from "@/lib/supabase/admin";

// Re-export existing Tier 9 types and functions (no breaking changes)
export {
  queryJudgeReportCard,
  queryOfficerBackground,
  querySimilarCases,
  type JudgeReportCardData,
  type JudgeReportCardIntake,
  type OfficerBackgroundData,
  type OfficerBackgroundIntake,
  type SimilarCasesData,
  type SimilarCasesIntake,
} from "@/lib/tier9-reports/query";

// ============================================================
// INTELLIGENCE TYPES
// ============================================================

export interface DefenseTheoryOutcome {
  charge_slug: string;
  defense_theory: string;
  jurisdiction: string;
  attempts: number;
  successes: number;
  motion_success_rate: number | null;
  case_success_rate: number | null;
  best_combined_motion: string | null;
  sample_source_urls: string[];
  data_source_note: string;
}

export interface MotionSuccessPattern {
  motion_type: string;
  charge_slug: string;
  jurisdiction: string;
  judge_id: string | null;
  filed_count: number;
  granted_count: number;
  denied_count: number;
  grant_rate: number | null;
  most_cited_opinion_id: string | null;
  sample_source_urls: string[];
  data_source_note: string;
}

export interface ClassifiedOpinion {
  cluster_id: string;
  case_name: string;
  court: string;
  jurisdiction: string;
  decision_date: string | null;
  opinion_type: string;
  charge_types: string[];
  motion_types: string[];
  defense_theories: string[];
  motion_outcomes: Array<{ motion_type: string; outcome: string | null }> | null;
  motion_favorability: Array<{ motion_type: string; favorability: number }> | null;
  case_favorability: number | null;
  holding_text: string | null;
  is_good_law: boolean | null;
  classification_confidence: string;
  source_urls: string[];
}

export interface DefenseIntelligenceData {
  theoryOutcomes: DefenseTheoryOutcome[];
  motionPatterns: MotionSuccessPattern[];
  relevantOpinions: ClassifiedOpinion[];
  isEmpty: boolean;
}

// ============================================================
// JUSTFAIR TYPES (federal sentencing + judge demographics)
// Source: osf.io/nseh5, 595,851 federal sentencing records
// FEDERAL COURTS ONLY, state court judges return isEmpty=true
// ============================================================

export interface JudgeDemographics {
  judge_name: string;
  judge_name_normalized: string;
  district: string | null;
  gender: string | null;
  race_ethnicity: string | null;
  appointing_president: string | null;
  appointing_party: string | null;
  aba_rating: string | null;
  birth_year: number | null;
  law_school: string | null;
  senior_status_date: string | null;
  active_start: number | null;
  active_end: number | null;
  source_urls: string[];
}

export interface JudgeSentencingByRace {
  defendant_race: string;
  total_cases: number;
  median_sentence_months: number | null;
  mean_sentence_months: number | null;
  guideline_departure_rate: number | null;
  avg_departure_pct: number | null;
}

export interface JustfairJudgeData {
  demographics: JudgeDemographics | null;
  sentencingByRace: JudgeSentencingByRace[];
  isEmpty: boolean;
}

// ============================================================
// CONFIDENCE THRESHOLDS (spec Section 8.4)
// ============================================================

export const CONFIDENCE_THRESHOLDS = {
  playbook: 70,
  "case-decoder": 60,
  "intelligence-brief": 50,
  "x-ray": 40,
  "war-room": 30,
  "situation-room": 20,
  "judge-report-card": 40,
  "officer-background-check": 40,
  "similar-cases-analyzer": 40,
} as const;

// Hard floor: no statistic with N < 5 surfaced to any product
const MINIMUM_SAMPLE_SIZE = 5;
// N < 10 only for operator-reviewed products
const OPERATOR_ONLY_THRESHOLD = 10;
const OPERATOR_PRODUCTS = new Set(["war-room", "situation-room"]);

// ============================================================
// INTELLIGENCE QUERIES
// ============================================================

/**
 * Query defense theory outcomes for a charge + jurisdiction.
 */
export async function queryDefenseTheoryOutcomes(
  chargeSlug: string,
  jurisdiction: string,
  productSlug: string = "similar-cases-analyzer"
): Promise<DefenseTheoryOutcome[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("defense_theory_outcomes")
    .select("*")
    .eq("charge_slug", chargeSlug)
    .eq("jurisdiction", jurisdiction)
    .gte("attempts", MINIMUM_SAMPLE_SIZE)
    .order("attempts", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  if (!OPERATOR_PRODUCTS.has(productSlug)) {
    return (data as DefenseTheoryOutcome[]).filter(
      (d) => d.attempts >= OPERATOR_ONLY_THRESHOLD
    );
  }

  return data as DefenseTheoryOutcome[];
}

/**
 * Query motion success patterns for a charge + jurisdiction.
 */
export async function queryMotionSuccessPatterns(
  chargeSlug: string,
  jurisdiction: string,
  judgeId: string | null = null,
  productSlug: string = "judge-report-card"
): Promise<MotionSuccessPattern[]> {
  const supabase = createAdminClient();

  let query = supabase
    .from("motion_success_patterns")
    .select("*")
    .eq("charge_slug", chargeSlug)
    .eq("jurisdiction", jurisdiction)
    .gte("filed_count", MINIMUM_SAMPLE_SIZE)
    .order("filed_count", { ascending: false })
    .limit(50);

  if (judgeId) {
    query = query.eq("judge_id", judgeId);
  }

  const { data, error } = await query;

  if (error || !data) return [];

  if (!OPERATOR_PRODUCTS.has(productSlug)) {
    return (data as MotionSuccessPattern[]).filter(
      (d) => d.filed_count >= OPERATOR_ONLY_THRESHOLD
    );
  }

  return data as MotionSuccessPattern[];
}

/**
 * Query classified opinions matching charge + jurisdiction.
 */
export async function queryRelevantOpinions(
  chargeSlug: string,
  jurisdiction: string,
  limit: number = 10
): Promise<ClassifiedOpinion[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("classified_opinions")
    .select("*")
    .contains("charge_types", [chargeSlug])
    .eq("jurisdiction", jurisdiction)
    .eq("classification_confidence", "verified")
    .not("source_urls", "eq", "{}")
    .order("case_favorability", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error || !data) return [];
  return data as ClassifiedOpinion[];
}

/**
 * Unified intelligence query for a case profile.
 * Primary entry point for product integration.
 */
export async function queryDefenseIntelligence(
  chargeSlug: string,
  jurisdiction: string,
  productSlug: string = "similar-cases-analyzer"
): Promise<DefenseIntelligenceData> {
  const [theoryOutcomes, motionPatterns, relevantOpinions] = await Promise.all([
    queryDefenseTheoryOutcomes(chargeSlug, jurisdiction, productSlug),
    queryMotionSuccessPatterns(chargeSlug, jurisdiction, null, productSlug),
    queryRelevantOpinions(chargeSlug, jurisdiction),
  ]);

  const hasData =
    theoryOutcomes.length > 0 ||
    motionPatterns.length > 0 ||
    relevantOpinions.length > 0;

  return {
    theoryOutcomes,
    motionPatterns,
    relevantOpinions,
    isEmpty: !hasData,
  };
}

// ============================================================
// JUSTFAIR QUERIES (federal sentencing + judge demographics)
// ============================================================

/**
 * Query JUSTFAIR judge demographics + racial disparity data.
 * FEDERAL COURTS ONLY, 1,126 judges in database.
 * State court judges will return isEmpty=true.
 */
export async function queryJustfairJudge(
  judgeName: string
): Promise<JustfairJudgeData> {
  const supabase = createAdminClient();
  const safeName = judgeName.toLowerCase().replace(/[%_\\]/g, (ch) => `\\${ch}`);

  const [demoResult, raceResult] = await Promise.all([
    supabase
      .from("judge_demographics")
      .select("*")
      .ilike("judge_name_normalized", `%${safeName}%`)
      .limit(1),

    supabase
      .from("judge_sentencing_demographics")
      .select("defendant_race, total_cases, median_sentence_months, mean_sentence_months, guideline_departure_rate, avg_departure_pct")
      .ilike("judge_name_normalized", `%${safeName}%`)
      .gte("total_cases", MINIMUM_SAMPLE_SIZE)
      .order("total_cases", { ascending: false }),
  ]);

  const demographics = (demoResult.data?.[0] as JudgeDemographics) ?? null;
  const sentencingByRace = (raceResult.data ?? []) as JudgeSentencingByRace[];

  return {
    demographics,
    sentencingByRace,
    isEmpty: !demographics && sentencingByRace.length === 0,
  };
}

// ============================================================
// DISTRICT COURT INTELLIGENCE TYPES + QUERIES
// ============================================================

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii",
  ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine",
  MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska",
  NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export interface DistrictCourtIntelData {
  stateName: string;
  stateCode: string;
  judges: JudgeDemographics[];
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
  prosecutionPatterns: Array<{
    motion_type: string | null;
    grant_rate: number | null;
    sample_size: number;
    source_urls: string[] | null;
  }>;
  sentencingDistributions: Array<{
    charge_slug: string;
    median_months: number | null;
    p25: number | null;
    p75: number | null;
    sample_size: number;
    source_urls: string[] | null;
  }>;
  isEmpty: boolean;
}

/**
 * Query district-level intelligence for a state's federal courts.
 * Aggregates across all judges in the state's federal districts.
 * FEDERAL COURTS ONLY.
 */
export async function queryDistrictCourtIntel(
  stateCode: string
): Promise<DistrictCourtIntelData> {
  const supabase = createAdminClient();
  const stateName = STATE_NAMES[stateCode.toUpperCase()] ?? stateCode;
  const safeStateName = stateName.toLowerCase().replace(/[%_\\]/g, (ch) => `\\${ch}`);

  const [demoResult, benchResult, pairingResult, sentencingResult] = await Promise.all([
    // All federal judges in this state's districts
    supabase
      .from("judge_demographics")
      .select("*")
      .ilike("district", `%${safeStateName}%`)
      .order("judge_name_normalized", { ascending: true })
      .limit(200),

    // Outcome benchmarks, state + national for comparison
    supabase
      .from("outcome_benchmarks")
      .select("jurisdiction_level, jurisdiction_name, offense_type, total_cases, conviction_rate, dismissal_rate, median_sentence_months, plea_rate, trial_rate, plea_trial_penalty_pct, source_urls, data_period")
      .or(`jurisdiction_name.ilike.%${safeStateName}%,jurisdiction_level.eq.national`)
      .order("total_cases", { ascending: false })
      .limit(30),

    // Aggregated prosecution patterns (district level, no prosecutor names)
    supabase
      .from("judge_prosecutor_pairings")
      .select("motion_type, grant_rate, sample_size, source_urls")
      .eq("jurisdiction", stateCode.toUpperCase())
      .gte("sample_size", MINIMUM_SAMPLE_SIZE)
      .order("sample_size", { ascending: false })
      .limit(50),

    // Sentencing distributions for the state (non-judge-specific)
    supabase
      .from("sentencing_distributions")
      .select("charge_slug, median_months, p25, p75, sample_size, source_urls")
      .is("judge_id", null)
      .gte("sample_size", MINIMUM_SAMPLE_SIZE)
      .order("sample_size", { ascending: false })
      .limit(30),
  ]);

  const judges = (demoResult.data ?? []) as JudgeDemographics[];
  const outcomeBenchmarks = (benchResult.data ?? []) as DistrictCourtIntelData["outcomeBenchmarks"];
  const prosecutionPatterns = (pairingResult.data ?? []) as DistrictCourtIntelData["prosecutionPatterns"];
  const sentencingDistributions = (sentencingResult.data ?? []) as DistrictCourtIntelData["sentencingDistributions"];

  const hasData =
    judges.length > 0 ||
    outcomeBenchmarks.length > 0 ||
    sentencingDistributions.length > 0;

  return {
    stateName,
    stateCode: stateCode.toUpperCase(),
    judges,
    outcomeBenchmarks,
    prosecutionPatterns,
    sentencingDistributions,
    isEmpty: !hasData,
  };
}

// ============================================================
// ARREST SURVIVAL KIT TYPES + QUERIES
// ============================================================

/**
 * Status of the agency_incidents data fetch.
 *
 * - "ok"               — table exists and rows were returned
 * - "no_incidents"     — table exists but no rows for this jurisdiction
 * - "data_unavailable" — table does not exist yet (not yet ingested) or
 *                        an unexpected query error occurred
 */
export type AgencyIncidentsStatus = "ok" | "no_incidents" | "data_unavailable";

/**
 * Status of the officer_external_intel data fetch.
 *
 * - "ok"               — table exists and rows were returned
 * - "no_officers"      — table exists but no rows for this jurisdiction
 * - "data_unavailable" — table does not exist yet (not yet ingested) or
 *                        an unexpected query error occurred
 */
export type OfficerStatsStatus = "ok" | "no_officers" | "data_unavailable";

export interface ArrestSurvivalKitData {
  stateName: string;
  stateCode: string;
  agencyIncidents: Array<{
    agency: string;
    use_of_force_count: number;
    source_urls: string[];
  }>;
  /** Explicit status so the renderer can show a sensible message instead of silence. */
  agencyIncidentsStatus: AgencyIncidentsStatus;
  officerStats: {
    totalAgencies: number;
    totalOfficers: number;
    wanderingOfficerCount: number;
    /** Explicit status so the renderer can show a sensible message instead of silence. */
    status: OfficerStatsStatus;
  };
  isEmpty: boolean;
}

/**
 * PostgREST error code for an unknown relation (table/view not found).
 * Returned when the `agency_incidents` table has not yet been ingested.
 */
const PGRST_RELATION_NOT_FOUND = "PGRST200";

/**
 * Query agency-level data for the Arrest Survival Kit.
 * Always "available", rights checklist is universal, agency data is bonus.
 *
 * Distinguishes three agency-incidents states so the renderer can surface
 * a sensible message rather than silently showing an empty section:
 *   - "ok"               rows returned
 *   - "no_incidents"     table exists, no rows for this state
 *   - "data_unavailable" table missing (not yet ingested) or unexpected error
 */
export async function queryArrestSurvivalKit(
  stateCode: string
): Promise<ArrestSurvivalKitData> {
  const supabase = createAdminClient();
  const stateName = STATE_NAMES[stateCode.toUpperCase()] ?? stateCode;
  const upperState = stateCode.toUpperCase();

  const [agencyResult, officerResult] = await Promise.all([
    // Agency-level incident data
    supabase
      .from("agency_incidents")
      .select("agency, use_of_force_count, source_urls")
      .eq("state", upperState)
      .order("use_of_force_count", { ascending: false })
      .limit(20),

    // Officer external intel aggregate for the state
    supabase
      .from("officer_external_intel")
      .select("agency, npi_is_wandering_officer")
      .eq("state", upperState)
      .limit(500),
  ]);

  // Resolve agency incidents with explicit status rather than silently swallowing errors.
  let agencyIncidents: ArrestSurvivalKitData["agencyIncidents"] = [];
  let agencyIncidentsStatus: AgencyIncidentsStatus;

  if (agencyResult.error) {
    // PGRST200 = PostgREST "Could not find the table" — table not yet ingested.
    // Any other error is unexpected; treat as data_unavailable to avoid crashing.
    if (agencyResult.error.code === PGRST_RELATION_NOT_FOUND) {
      console.warn(
        "[queryArrestSurvivalKit] agency_incidents table not found — data not yet ingested"
      );
    } else {
      console.error(
        "[queryArrestSurvivalKit] unexpected error querying agency_incidents:",
        agencyResult.error
      );
    }
    agencyIncidentsStatus = "data_unavailable";
  } else if (!agencyResult.data || agencyResult.data.length === 0) {
    agencyIncidentsStatus = "no_incidents";
  } else {
    agencyIncidents = agencyResult.data as ArrestSurvivalKitData["agencyIncidents"];
    agencyIncidentsStatus = "ok";
  }

  // Resolve officer stats with explicit status rather than silently swallowing errors.
  // Mirrors agency_incidents handling above (PR #164 pattern).
  let officers: Array<Record<string, unknown>> = [];
  let officerStatsStatus: OfficerStatsStatus;

  if (officerResult.error) {
    if (officerResult.error.code === PGRST_RELATION_NOT_FOUND) {
      console.warn(
        "[queryArrestSurvivalKit] officer_external_intel table not found — data not yet ingested"
      );
    } else {
      console.error(
        "[queryArrestSurvivalKit] unexpected error querying officer_external_intel:",
        officerResult.error
      );
    }
    officerStatsStatus = "data_unavailable";
  } else if (!officerResult.data || officerResult.data.length === 0) {
    officerStatsStatus = "no_officers";
  } else {
    officers = officerResult.data as Array<Record<string, unknown>>;
    officerStatsStatus = "ok";
  }

  // Aggregate officer stats (safe to compute on [] for both error/empty branches)
  const agencies = new Set(officers.map((o) => o.agency as string).filter(Boolean));
  const wanderingCount = officers.filter((o) => o.npi_is_wandering_officer === true).length;

  return {
    stateName,
    stateCode: upperState,
    agencyIncidents,
    agencyIncidentsStatus,
    officerStats: {
      totalAgencies: agencies.size,
      totalOfficers: officers.length,
      wanderingOfficerCount: wanderingCount,
      status: officerStatsStatus,
    },
    // Always available, rights checklist is universal
    isEmpty: false,
  };
}
