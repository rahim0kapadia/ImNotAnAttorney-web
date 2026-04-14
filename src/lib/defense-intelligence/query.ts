/**
 * Defense Intelligence Query Module
 *
 * Single query surface for all intelligence data.
 * Wraps and extends tier9-reports/query.ts — no breaking changes.
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
// Source: osf.io/nseh5 — 595,851 federal sentencing records
// FEDERAL COURTS ONLY — state court judges return isEmpty=true
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
 * FEDERAL COURTS ONLY — 1,126 judges in database.
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
