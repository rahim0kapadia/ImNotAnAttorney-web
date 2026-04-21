/**
 * @fileoverview Sentencing Calculator API, queries JUSTFAIR + USSC data.
 *
 * POST /api/tools/sentencing-calculator
 *
 * Input: { state, chargeType, judgeName? }
 * Returns: district-level sentencing stats + optional judge-specific data.
 *
 * All data sourced from:
 *   - judge_sentencing_patterns (USSC FY2001-2023, 595K records)
 *   - sentencing_distributions (per-charge percentiles)
 *   - judge_demographics (JUSTFAIR, federal judges only)
 *
 * FEDERAL COURTS ONLY, clearly labeled in response.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import {
  queryBucket,
  extractPleaTrialSplit,
  computeTrialTaxMonths,
  normalizeAgeBucket,
  type SimilarCasesRow,
} from "@/lib/ussc-similar-cases";

const MINIMUM_SAMPLE_SIZE = 5;

interface SentencingInput {
  state: string;
  chargeType: string;
  judgeName?: string;
  district?: string;
  offguide?: string;
  xcrhissr?: string;
  citizen?: string;
  age?: number;
}

function shapeOutcome(row: SimilarCasesRow | null) {
  if (!row) return null;
  return {
    n_cases: row.n_cases,
    median_months: row.median_senttot,
    mean_months: row.mean_senttot,
    percentiles: {
      p10: row.p10_senttot,
      p25: row.p25_senttot,
      p50: row.median_senttot,
      p75: row.p75_senttot,
      p90: row.p90_senttot,
    },
    pct_got_prison: row.pct_got_prison,
    pct_downward_departure: row.pct_downward_departure,
    earliest_fy: row.earliest_fy,
    latest_fy: row.latest_fy,
  };
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
  if (body.district !== undefined && typeof body.district !== "string") {
    errors.push("district must be a string if provided");
  }
  if (body.offguide !== undefined && typeof body.offguide !== "string") {
    errors.push("offguide must be a string if provided");
  }
  if (body.xcrhissr !== undefined && typeof body.xcrhissr !== "string") {
    errors.push("xcrhissr must be a string if provided");
  }
  if (body.citizen !== undefined && typeof body.citizen !== "string") {
    errors.push("citizen must be a string if provided");
  }
  if (
    body.age !== undefined &&
    body.age !== null &&
    (typeof body.age !== "number" || !Number.isFinite(body.age))
  ) {
    errors.push("age must be a finite number if provided");
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

  // Optional third perspective — federal-bucket distribution from the USSC
  // matview when all three required dimensions were supplied.
  let districtDistribution: {
    match_depth: string;
    widening_note: string | null;
    total_cases: number;
    sample_size_caveat: string;
    outcomes: {
      plea: ReturnType<typeof shapeOutcome>;
      trial: ReturnType<typeof shapeOutcome>;
    };
    trial_tax_months: number | null;
  } | null = null;

  if (input.district && input.offguide && input.xcrhissr) {
    try {
      const mv = await queryBucket(supabase, {
        district: input.district,
        offguide: input.offguide,
        xcrhissr: input.xcrhissr,
        citizen: input.citizen ?? "UNK",
        age_bucket: normalizeAgeBucket(input.age ?? null),
      });
      const { plea, trial } = extractPleaTrialSplit(mv.rows);
      districtDistribution = {
        match_depth: mv.match_depth,
        widening_note: mv.widening_note,
        total_cases: mv.total_cases,
        sample_size_caveat: mv.sample_size_caveat,
        outcomes: {
          plea: shapeOutcome(plea),
          trial: shapeOutcome(trial),
        },
        trial_tax_months: computeTrialTaxMonths(plea, trial),
      };
    } catch (err) {
      console.error("[SentencingCalc] Matview augmentation failed:", err);
    }
  }

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
      districtDistribution,
      judgePattern,
      judgeDemographics,
      judgeName: hasJudge ? input.judgeName : null,
      dataSource:
        "USSC Individual Offender Datafiles FY2014-FY2024 + JUSTFAIR FY2001-FY2023 (690K+ federal sentencing records, 1,126 judges)",
      sourceUrl: "https://www.ussc.gov/research/datafiles/commission-datafiles",
      disclaimer:
        "Federal courts only. This provides legal INFORMATION about historical sentencing distributions — not legal advice. Your attorney remains the final authority on strategy.",
    },
  });
}
