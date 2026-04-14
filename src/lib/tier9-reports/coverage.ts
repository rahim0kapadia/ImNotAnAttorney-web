/**
 * Lightweight coverage checks for Tier 9 data availability.
 * Returns counts per section — used by /api/check-availability/[slug]
 * to gate purchases before checkout.
 */

import { createAdminClient } from "@/lib/supabase/admin";

function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

export interface CoverageResult {
  available: boolean;
  coverage: Record<string, number>;
  matchedName: string | null;
  matchedCourt: string | null;
}

export async function checkJudgeCoverage(
  judgeName: string,
  state: string
): Promise<CoverageResult> {
  const supabase = createAdminClient();
  const safeName = escapeIlike(judgeName);

  // Find judge — try with jurisdiction first, fall back to name only
  let judges;
  ({ data: judges } = await supabase
    .from("judge_profiles")
    .select("id, full_name, jurisdiction, positions")
    .ilike("full_name", `%${safeName}%`)
    .eq("jurisdiction", state)
    .limit(3));

  if (!judges?.length) {
    ({ data: judges } = await supabase
      .from("judge_profiles")
      .select("id, full_name, jurisdiction, positions")
      .ilike("full_name", `%${safeName}%`)
      .limit(3));
  }

  if (!judges?.length) {
    return { available: false, coverage: {}, matchedName: null, matchedCourt: null };
  }

  const judge = judges[0];
  const judgeId = judge.id as string;

  // Derive court from positions
  const positions = Array.isArray(judge.positions)
    ? (judge.positions as Array<{ court_id?: string; position_type?: string }>)
    : [];
  const judicial = positions.find((p) => p.position_type === "jud" && p.court_id);

  // Parallel count queries
  const [quotes, sentencing, pairings, appellate, divergence, justfairDemo] = await Promise.all([
    supabase.from("judge_quotes").select("id", { count: "exact", head: true }).eq("judge_id", judgeId),
    supabase.from("sentencing_distributions").select("id", { count: "exact", head: true }).eq("judge_id", judgeId),
    supabase.from("judge_prosecutor_pairings").select("id", { count: "exact", head: true }).eq("judge_id", judgeId),
    supabase.from("appellate_trends").select("id", { count: "exact", head: true }).eq("jurisdiction", state),
    supabase.from("bench_jury_divergence").select("id", { count: "exact", head: true }).eq("judge_id", judgeId),
    // JUSTFAIR federal judge demographics (1,126 judges)
    supabase.from("judge_demographics").select("judge_name", { count: "exact", head: true })
      .ilike("judge_name_normalized", `%${safeName.toLowerCase()}%`),
  ]);

  const coverage = {
    quotes: quotes.count ?? 0,
    sentencing: sentencing.count ?? 0,
    pairings: pairings.count ?? 0,
    appellate: appellate.count ?? 0,
    benchJury: divergence.count ?? 0,
    justfairDemographics: justfairDemo.count ?? 0,
  };

  // Available if CL data OR JUSTFAIR data exists
  const available =
    coverage.quotes >= 5 || coverage.sentencing >= 1 || coverage.pairings >= 1 ||
    coverage.justfairDemographics >= 1;

  return {
    available,
    coverage,
    matchedName: judge.full_name as string,
    matchedCourt: (judicial?.court_id as string) ?? null,
  };
}

export async function checkOfficerCoverage(
  officerName: string,
  state: string
): Promise<CoverageResult> {
  const supabase = createAdminClient();
  const safeName = escapeIlike(officerName);

  // Try with state filter first, fall back to name only
  let result = await supabase
    .from("officer_reliability")
    .select("officer_name", { count: "exact", head: true })
    .ilike("officer_name", `%${safeName}%`)
    .eq("jurisdiction", state);

  if (!result.count) {
    result = await supabase
      .from("officer_reliability")
      .select("officer_name", { count: "exact", head: true })
      .ilike("officer_name", `%${safeName}%`);
  }

  const count = result.count ?? 0;

  return {
    available: count >= 1,
    coverage: { officers: count },
    matchedName: null,
    matchedCourt: null,
  };
}

export async function checkSimilarCasesCoverage(
  chargeType: string,
  state: string
): Promise<CoverageResult> {
  const supabase = createAdminClient();

  const [vectors, appellate] = await Promise.all([
    supabase
      .from("case_feature_vectors")
      .select("id", { count: "exact", head: true })
      .eq("charge_slug", chargeType)
      .eq("jurisdiction", state),
    supabase
      .from("appellate_trends")
      .select("id", { count: "exact", head: true })
      .eq("jurisdiction", state),
  ]);

  const coverage = {
    similarCases: vectors.count ?? 0,
    appellate: appellate.count ?? 0,
  };

  const available = coverage.similarCases >= 3;

  return {
    available,
    coverage,
    matchedName: null,
    matchedCourt: null,
  };
}
