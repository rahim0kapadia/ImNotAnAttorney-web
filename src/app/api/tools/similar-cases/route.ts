/**
 * @fileoverview Similar Cases Analyzer API — powers the $297 product.
 *
 * POST /api/tools/similar-cases
 *
 * Input:
 *   { district: string, offguide: string, xcrhissr: string, citizen: string, age?: number }
 *
 * Output:
 *   match_depth + widening_note + outcomes { plea, trial } + trial_tax_months
 *   + sample_size_caveat + district_display + dataSource
 *
 * Queries public.ussc_similar_cases_summary (23,210 buckets, 690K federal cases,
 * FY14-FY24). Progressive widening when the exact bucket is empty:
 *   drop age → drop citizen → drop district (national).
 *
 * UPL-safe — returns distribution data, no recommendations. Customer-facing
 * language says "information" and "what similar federal cases resulted in"
 * — never "you should" or "we advise".
 */
import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import {
  queryBucket,
  queryDistrictDisplay,
  extractPleaTrialSplit,
  computeTrialTaxMonths,
  normalizeAgeBucket,
  type SimilarCasesRow,
} from "@/lib/ussc-similar-cases";

interface SimilarCasesInput {
  offguide: string;
  xcrhissr: string;
  /** Optional — query widens to national when omitted. */
  district?: string | null;
  citizen?: string | null;
  age?: number | null;
  age_bucket?: string | null;
}

function validate(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["Invalid request body"] };
  }
  const body = input as Record<string, unknown>;
  for (const field of ["offguide", "xcrhissr"] as const) {
    const v = body[field];
    if (typeof v !== "string" || v.length === 0) {
      errors.push(`${field} is required`);
    }
  }
  for (const field of ["district", "citizen", "age_bucket"] as const) {
    const v = body[field];
    if (v !== undefined && v !== null && typeof v !== "string") {
      errors.push(`${field} must be a string if provided`);
    }
  }
  if (body.age !== undefined && body.age !== null) {
    if (typeof body.age !== "number" || !Number.isFinite(body.age) || body.age < 0 || body.age > 120) {
      errors.push("age must be a number between 0 and 120");
    }
  }
  return { valid: errors.length === 0, errors };
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

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const supabase = createAdminClient();
  const { limited } = await checkRateLimit(supabase, `calc:similar-cases:${ip}`, 30, 300);
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

  const input = body as SimilarCasesInput;
  // Prefer caller-supplied age_bucket label; otherwise derive from numeric age.
  // When neither is supplied, age_bucket is null and widening skips the age tier.
  const age_bucket: string | null =
    typeof input.age_bucket === "string" && input.age_bucket.length > 0
      ? input.age_bucket
      : input.age !== undefined && input.age !== null
        ? normalizeAgeBucket(input.age)
        : null;

  const [response, districtDisplay] = await Promise.all([
    queryBucket(supabase, {
      district: input.district ?? null,
      offguide: input.offguide,
      xcrhissr: input.xcrhissr,
      citizen: input.citizen ?? null,
      age_bucket,
    }),
    queryDistrictDisplay(supabase, input.district ?? null),
  ]);

  const { plea, trial } = extractPleaTrialSplit(response.rows);
  const trial_tax_months = computeTrialTaxMonths(plea, trial);

  // Analytics after response — after() guarantees the RPC completes before
  // the serverless function terminates (fire-and-forget loses invocations
  // on Vercel when the isolate freezes).
  after(async () => {
    const { error } = await supabase.rpc("increment_calculator_aggregate", {
      p_slug: "similar-cases",
      p_state: null,
      p_charge_type: input.offguide,
    });
    if (error) console.error("[SimilarCases] Analytics error:", error);
  });

  // Contract: sample_size_caveat is always non-empty when match_depth !==
  // "insufficient_data" (enforced by buildCaveat in lib/ussc-similar-cases.ts).
  // Callers can display distribution data confidently knowing sample size
  // will always accompany it.
  return NextResponse.json({
    result: {
      // Echo only validated fields — never spread raw input (avoids leaking
      // unexpected keys from the caller).
      input: {
        offguide: input.offguide,
        xcrhissr: input.xcrhissr,
        district: input.district ?? null,
        citizen: input.citizen ?? null,
        age: input.age ?? null,
        age_bucket: age_bucket ?? null,
      },
      match_depth: response.match_depth,
      widening_note: response.widening_note,
      total_cases: response.total_cases,
      sample_size_caveat: response.sample_size_caveat,
      outcomes: {
        plea: shapeOutcome(plea),
        trial: shapeOutcome(trial),
      },
      trial_tax_months,
      district_display: districtDisplay,
      federalOnly: true,
      dataSource:
        "USSC Individual Offender Datafiles FY2014-FY2024 (690,491 federal sentences across 23,210 buckets)",
      sourceUrl: "https://www.ussc.gov/research/datafiles/commission-datafiles",
      disclaimer:
        "This provides legal INFORMATION about what similar federal cases resulted in — not legal advice. Every case is different. Decisions about how to use this information stay with you.",
    },
  });
}
