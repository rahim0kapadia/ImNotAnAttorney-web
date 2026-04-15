/**
 * @fileoverview Sentencing Calculator API — queries JUSTFAIR + USSC data.
 *
 * POST /api/tools/sentencing-calculator
 *
 * Input: { state, chargeType, judgeName? }
 * Returns: district-level sentencing stats + optional judge-specific data.
 *
 * All data sourced from:
 *   - judge_sentencing_patterns (USSC FY2001-2023, 595K records)
 *   - sentencing_distributions (per-charge percentiles)
 *   - judge_demographics (JUSTFAIR — federal judges only)
 *
 * FEDERAL COURTS ONLY — clearly labeled in response.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

const MINIMUM_SAMPLE_SIZE = 5;

interface SentencingInput {
  state: string;
  chargeType: string;
  judgeName?: string;
}

function validate(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["Invalid request body"] };
  }
  const body = input as Record<string, unknown>;
  if (typeof body.state !== "string" || body.state.length < 2) {
    errors.push("state is required (2-letter code)");
  }
  if (typeof body.chargeType !== "string" || body.chargeType.length < 2) {
    errors.push("chargeType is required");
  }
  if (body.judgeName !== undefined && typeof body.judgeName !== "string") {
    errors.push("judgeName must be a string if provided");
  }
  return { valid: errors.length === 0, errors };
}

export async function POST(req: NextRequest) {
  // Rate limit: 30 lookups per 5 minutes per IP
  const ip = getClientIp(req);
  const supabase = createAdminClient();
  const { limited } = await checkRateLimit(
    supabase,
    `calc:sentencing:${ip}`,
    30,
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

  const input = body as SentencingInput;
  const stateUpper = input.state.toUpperCase();

  // --- District-level sentencing patterns (all judges in state) ---
  const districtQuery = supabase
    .from("judge_sentencing_patterns")
    .select(
      "judge_name, district, total_cases, median_sentence_months, mean_sentence_months, p25_sentence_months, p75_sentence_months, downward_departure_rate, upward_departure_rate, source_urls, data_period",
    )
    .eq("state", stateUpper)
    .gte("total_cases", MINIMUM_SAMPLE_SIZE)
    .order("total_cases", { ascending: false })
    .limit(20);

  // --- Charge-level sentencing distribution ---
  const chargeQuery = supabase
    .from("sentencing_distributions")
    .select("charge_slug, median_months, p25, p75, sample_size, source_urls")
    .eq("charge_slug", input.chargeType)
    .is("judge_id", null)
    .gte("sample_size", MINIMUM_SAMPLE_SIZE)
    .limit(5);

  // --- Optional: judge-specific data ---
  const hasJudge = input.judgeName && input.judgeName.trim().length >= 2;
  const safeName = hasJudge
    ? input.judgeName!.toLowerCase().replace(/[%_\\]/g, (ch) => `\\${ch}`)
    : "";

  const judgePatternQuery = hasJudge
    ? supabase
        .from("judge_sentencing_patterns")
        .select(
          "judge_name, district, total_cases, median_sentence_months, mean_sentence_months, p25_sentence_months, p75_sentence_months, downward_departure_rate, upward_departure_rate, offense_breakdown, source_urls, data_period",
        )
        .ilike("judge_name_normalized", `%${safeName}%`)
        .gte("total_cases", MINIMUM_SAMPLE_SIZE)
        .limit(1)
    : null;

  const judgeDemoQuery = hasJudge
    ? supabase
        .from("judge_demographics")
        .select("judge_name, district, gender, race_ethnicity, appointing_president, appointing_party, aba_rating, law_school, active_start, active_end, source_urls")
        .ilike("judge_name_normalized", `%${safeName}%`)
        .limit(1)
    : null;

  // Run all queries in parallel (Supabase returns PromiseLike, not Promise)
  const [districtResult, chargeResult, judgePatternResult, judgeDemoResult] =
    await Promise.all([
      districtQuery,
      chargeQuery,
      judgePatternQuery ?? Promise.resolve(null),
      judgeDemoQuery ?? Promise.resolve(null),
    ]);

  const districtPatterns = districtResult?.data ?? [];
  const chargeDistribution = chargeResult?.data?.[0] ?? null;
  const judgePattern = judgePatternResult?.data?.[0] ?? null;
  const judgeDemographics = judgeDemoResult?.data?.[0] ?? null;

  // Fire anonymous analytics (non-blocking)
  supabase
    .rpc("increment_calculator_aggregate", {
      p_slug: "sentencing-calculator",
      p_state: stateUpper,
      p_charge_type: input.chargeType,
    })
    .then(({ error }) => {
      if (error) console.error("[SentencingCalc] Analytics error:", error);
    });

  return NextResponse.json({
    result: {
      state: stateUpper,
      chargeType: input.chargeType,
      federalOnly: true,
      districtPatterns,
      chargeDistribution,
      judgePattern,
      judgeDemographics,
      judgeName: hasJudge ? input.judgeName : null,
      dataSource: "USSC/JUSTFAIR FY2001-2023 (595,851 federal sentencing records)",
      sourceUrl: "https://osf.io/nseh5/",
    },
  });
}
