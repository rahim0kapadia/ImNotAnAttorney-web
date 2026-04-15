/**
 * @fileoverview Judge Comparison API — side-by-side JUSTFAIR data for two judges.
 *
 * POST /api/tools/judge-comparison
 *
 * Input: { judgeNameA, judgeNameB }
 * Returns: demographics + sentencing + racial disparity for each judge.
 *
 * FEDERAL COURTS ONLY — 1,126 judges in JUSTFAIR database.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

const MINIMUM_SAMPLE_SIZE = 5;

interface ComparisonInput {
  judgeNameA: string;
  judgeNameB: string;
}

function validate(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["Invalid request body"] };
  }
  const body = input as Record<string, unknown>;
  if (typeof body.judgeNameA !== "string" || body.judgeNameA.trim().length < 2) {
    errors.push("First judge name is required (at least 2 characters)");
  }
  if (typeof body.judgeNameB !== "string" || body.judgeNameB.trim().length < 2) {
    errors.push("Second judge name is required (at least 2 characters)");
  }
  return { valid: errors.length === 0, errors };
}

async function queryJudgeData(supabase: ReturnType<typeof createAdminClient>, judgeName: string) {
  const safeName = judgeName.toLowerCase().replace(/[%_\\]/g, (ch) => `\\${ch}`);

  const [demoResult, raceResult, patternResult] = await Promise.all([
    supabase
      .from("judge_demographics")
      .select("judge_name, district, gender, race_ethnicity, appointing_president, appointing_party, aba_rating, law_school, active_start, active_end, source_urls")
      .ilike("judge_name_normalized", `%${safeName}%`)
      .limit(1),

    supabase
      .from("judge_sentencing_demographics")
      .select("defendant_race, total_cases, median_sentence_months, mean_sentence_months, guideline_departure_rate, avg_departure_pct")
      .ilike("judge_name_normalized", `%${safeName}%`)
      .gte("total_cases", MINIMUM_SAMPLE_SIZE)
      .order("total_cases", { ascending: false }),

    supabase
      .from("judge_sentencing_patterns")
      .select("judge_name, district, total_cases, median_sentence_months, mean_sentence_months, p25_sentence_months, p75_sentence_months, downward_departure_rate, upward_departure_rate, source_urls, data_period")
      .ilike("judge_name_normalized", `%${safeName}%`)
      .gte("total_cases", MINIMUM_SAMPLE_SIZE)
      .limit(1),
  ]);

  const demographics = demoResult.data?.[0] ?? null;
  const sentencingByRace = raceResult.data ?? [];
  const sentencingPattern = patternResult.data?.[0] ?? null;

  return {
    searchName: judgeName,
    demographics,
    sentencingPattern,
    sentencingByRace,
    found: !!(demographics || sentencingPattern),
  };
}

export async function POST(req: NextRequest) {
  // Rate limit: 20 comparisons per 5 minutes per IP
  const ip = getClientIp(req);
  const supabase = createAdminClient();
  const { limited } = await checkRateLimit(
    supabase,
    `calc:judge-comparison:${ip}`,
    20,
    300,
  );
  if (limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const validation = validate(body);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Validation failed", details: validation.errors },
      { status: 400 },
    );
  }

  const input = body as ComparisonInput;

  // Parallel queries for both judges
  const [judgeA, judgeB] = await Promise.all([
    queryJudgeData(supabase, input.judgeNameA.trim()),
    queryJudgeData(supabase, input.judgeNameB.trim()),
  ]);

  // Fire anonymous analytics (non-blocking)
  supabase
    .rpc("increment_calculator_aggregate", {
      p_slug: "judge-comparison",
      p_state: null,
      p_charge_type: null,
    })
    .then(({ error }) => {
      if (error) console.error("[JudgeComparison] Analytics error:", error);
    });

  return NextResponse.json({
    result: {
      judgeA,
      judgeB,
      federalOnly: true,
      dataSource: "JUSTFAIR/USSC FY2001-2023 (595,851 federal sentencing records, 1,126 judges)",
      sourceUrl: "https://osf.io/nseh5/",
    },
  });
}
