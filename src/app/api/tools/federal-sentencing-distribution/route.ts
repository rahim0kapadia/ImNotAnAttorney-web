/**
 * @fileoverview POST /api/tools/federal-sentencing-distribution — powers the
 * $297 Federal Sentencing Distribution Report.
 *
 * Input:
 *   {
 *     chargeType: string,                          // required (INAA slug)
 *     district?: string | null,                    // optional USSC code
 *     criminalHistoryCategory?: string | null,     // "1"-"6" (USSC category)
 *     fyFrom?: number,                             // 2-digit (default 14)
 *     fyTo?: number,                               // 2-digit (default 24)
 *   }
 *
 * Output:
 *   match_depth + widening_note + district_agg + national_agg + per_year[]
 *   + monte_carlo[] (1000 samples) + sample_size_caveat + district_display
 *   + dataSource + disclaimer
 *
 * Falls back through 4 widening tiers when the exact bucket returns zero rows.
 * UPL-safe — returns distribution data, never advice.
 */
import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import {
  queryDistribution,
  histogram,
  OFFGUIDE_CODES,
  VALID_CH_CATEGORIES,
  type FsdAggregate,
} from "@/lib/fsd-distribution";
import { chargeTypeToFsdOffguide, priorsToChCategory } from "@/lib/fsd-offguide";
import {
  queryDistrictDisplay,
  type DistrictDisplay,
} from "@/lib/ussc-similar-cases";

interface FsdInput {
  chargeType: string;
  district?: string | null;
  criminalHistoryCategory?: string | null;
  priorConvictions?: string | null;
  fyFrom?: number;
  fyTo?: number;
}

function validate(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["Invalid request body"] };
  }
  const b = input as Record<string, unknown>;
  if (typeof b.chargeType !== "string" || b.chargeType.length < 2) {
    errors.push("chargeType is required");
  }
  if (b.district !== undefined && b.district !== null && typeof b.district !== "string") {
    errors.push("district must be a string if provided");
  }
  if (
    b.criminalHistoryCategory !== undefined &&
    b.criminalHistoryCategory !== null &&
    typeof b.criminalHistoryCategory !== "string"
  ) {
    errors.push("criminalHistoryCategory must be a string if provided");
  }
  if (
    b.priorConvictions !== undefined &&
    b.priorConvictions !== null &&
    typeof b.priorConvictions !== "string"
  ) {
    errors.push("priorConvictions must be a string if provided");
  }
  for (const field of ["fyFrom", "fyTo"] as const) {
    const v = b[field];
    if (v !== undefined && v !== null) {
      if (typeof v !== "number" || !Number.isInteger(v) || v < 14 || v > 24) {
        errors.push(`${field} must be an integer between 14 and 24 if provided`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

function shapeAgg(agg: FsdAggregate | null) {
  if (!agg) return null;
  return {
    total_n: agg.total_n,
    mean_months: agg.mean_months,
    median_months: agg.median_months,
    percentiles: {
      p10: agg.p10_months,
      p25: agg.p25_months,
      p50: agg.median_months,
      p75: agg.p75_months,
      p90: agg.p90_months,
    },
    departure_rates: {
      downward: agg.downward_departure_rate,
      upward: agg.upward_departure_rate,
      probation: agg.probation_rate,
    },
    fiscal_year_range: `FY${agg.earliest_fy}-FY${agg.latest_fy}`,
    offguide_label: agg.offguide_label,
    offense_category: agg.offense_category,
  };
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const supabase = createAdminClient();
  const { limited } = await checkRateLimit(supabase, `calc:fsd:${ip}`, 30, 300);
  if (limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const v = validate(body);
  if (!v.valid) {
    return NextResponse.json(
      { error: "Validation failed", details: v.errors },
      { status: 400 },
    );
  }

  const input = body as FsdInput;

  // Resolve offguide + criminal history — prefer explicit values, fall back
  // to slug-based lookup for each.
  const offguide_code = chargeTypeToFsdOffguide(input.chargeType);
  if (offguide_code === null || !OFFGUIDE_CODES.has(offguide_code)) {
    return NextResponse.json(
      {
        error:
          "Insufficient data — this charge type isn't mapped to a federal sentencing guideline (mostly state offenses or rare federal).",
        chargeType: input.chargeType,
      },
      { status: 400 },
    );
  }

  const ch: string | null =
    typeof input.criminalHistoryCategory === "string" &&
    VALID_CH_CATEGORIES.has(input.criminalHistoryCategory)
      ? input.criminalHistoryCategory
      : priorsToChCategory(input.priorConvictions ?? null);

  // Fire the matview query + district display in parallel.
  const [response, districtDisplay] = await Promise.all([
    queryDistribution(supabase, {
      district: input.district ?? null,
      offguide_code,
      criminal_history_category: ch ?? "",
      fy_from: input.fyFrom ?? 14,
      fy_to: input.fyTo ?? 24,
    }),
    queryDistrictDisplay(supabase, input.district ?? null),
  ]);

  // Fire analytics after response (Vercel serverless-safe via after()).
  after(async () => {
    const { error } = await supabase.rpc("increment_calculator_aggregate", {
      p_slug: "federal-sentencing-distribution",
      p_state: null,
      p_charge_type: input.chargeType,
    });
    if (error) console.error("[FSD] Analytics error:", error);
  });

  const hist = histogram(response.monte_carlo, 20);

  const districtDisplayTyped: DistrictDisplay | null = districtDisplay;

  return NextResponse.json({
    result: {
      input: {
        chargeType: input.chargeType,
        district: input.district ?? null,
        criminalHistoryCategory: ch,
        fyFrom: input.fyFrom ?? 14,
        fyTo: input.fyTo ?? 24,
        offguide_code,
      },
      match_depth: response.match_depth,
      widening_note: response.widening_note,
      sample_size_caveat: response.sample_size_caveat,
      district_agg: shapeAgg(response.district_agg),
      national_agg: shapeAgg(response.national_agg),
      per_year: response.per_year.map((r) => ({
        fy: r.fy,
        n: r.n,
        mean_months: r.mean_months,
        median_months: r.median_months,
      })),
      monte_carlo: response.monte_carlo,
      histogram: hist,
      district_display: districtDisplayTyped,
      federalOnly: true,
      dataSource:
        "USSC Individual Offender Datafiles FY2014-FY2024 (13,131 district-level buckets across 94 federal districts).",
      sourceUrl: "https://www.ussc.gov/research/datafiles/commission-datafiles",
      disclaimer:
        "This provides legal INFORMATION about the historical distribution of federal sentences for this offense + criminal history + district — not legal advice. Every case is different; your attorney remains the final authority on strategy.",
    },
  });
}
