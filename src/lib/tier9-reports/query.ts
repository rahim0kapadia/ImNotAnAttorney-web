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
// QUERIES
// ============================================================

export async function queryJudgeReportCard(
  intake: JudgeReportCardIntake
): Promise<JudgeReportCardData> {
  const supabase = createAdminClient();

  // Look up judge by name (case-insensitive) + jurisdiction
  const { data: judges } = await supabase
    .from("judge_profiles")
    .select("id, name, court, jurisdiction, sentencing_distributions, judicial_quotes, bench_acquittal_rate, jury_acquittal_rate")
    .ilike("name", `%${intake.judgeName}%`)
    .limit(1);

  const judge = judges?.[0] ?? null;

  if (!judge) {
    return {
      judge: null,
      sentencingDistributions: [],
      prosecutorPairings: [],
      benchJuryDivergence: [],
      quotes: [],
      appellateTrends: [],
      isEmpty: true,
    };
  }

  // Parallel queries for all related data
  const [sentencing, pairings, divergence, quotes, appellate] =
    await Promise.all([
      supabase
        .from("sentencing_distributions")
        .select("charge_slug, median_months, p25, p75, sample_size, source_urls")
        .eq("judge_id", judge.id)
        .order("sample_size", { ascending: false })
        .limit(50),

      supabase
        .from("judge_prosecutor_pairings")
        .select("prosecutor_name, motion_type, grant_rate, sample_size, source_urls")
        .eq("judge_id", judge.id)
        .order("sample_size", { ascending: false })
        .limit(50),

      supabase
        .from("bench_jury_divergence")
        .select("charge_slug, bench_acquittal_rate, jury_acquittal_rate, bench_sample, jury_sample, source_urls")
        .eq("judge_id", judge.id)
        .limit(20),

      supabase
        .from("judge_quotes")
        .select("quote, topic, case_cited, source_url")
        .eq("judge_id", judge.id)
        .limit(30),

      supabase
        .from("appellate_trends")
        .select("argument_type, reverse_rate, affirm_rate, sample_size, source_urls")
        .eq("jurisdiction", intake.state)
        .order("sample_size", { ascending: false })
        .limit(20),
    ]);

  return {
    judge,
    sentencingDistributions: sentencing.data ?? [],
    prosecutorPairings: pairings.data ?? [],
    benchJuryDivergence: divergence.data ?? [],
    quotes: quotes.data ?? [],
    appellateTrends: appellate.data ?? [],
    isEmpty: false,
  };
}

export async function queryOfficerBackground(
  intake: OfficerBackgroundIntake
): Promise<OfficerBackgroundData> {
  const supabase = createAdminClient();

  const { data: officers } = await supabase
    .from("officer_reliability")
    .select("officer_name, court, jurisdiction, testimony_count, discredited_count, reliability_score, brady_history, source_urls")
    .ilike("officer_name", `%${intake.officerName}%`)
    .limit(20);

  return {
    officers: officers ?? [],
    isEmpty: !officers || officers.length === 0,
  };
}

export async function querySimilarCases(
  intake: SimilarCasesIntake
): Promise<SimilarCasesData> {
  const supabase = createAdminClient();

  // Normalize charge type to charge_slug format
  const chargeSlug = intake.chargeType;

  const [vectors, sentencing, plea, appellate] = await Promise.all([
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
  ]);

  const hasData =
    (vectors.data?.length ?? 0) > 0 ||
    (sentencing.data?.length ?? 0) > 0 ||
    (plea.data?.length ?? 0) > 0;

  return {
    featureVectors: vectors.data ?? [],
    sentencingDistributions: sentencing.data ?? [],
    pleaDiscountCurves: plea.data ?? [],
    appellateTrends: appellate.data ?? [],
    isEmpty: !hasData,
  };
}
