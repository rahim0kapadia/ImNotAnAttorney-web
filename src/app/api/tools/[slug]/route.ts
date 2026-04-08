/**
 * @fileoverview Dynamic Calculator API — serves all calculator tools.
 *
 * POST /api/tools/good-time   → Good Time Credit Calculator
 * POST /api/tools/sol          → Statute of Limitations Calculator (future)
 * POST /api/tools/diversion-eligibility → Diversion Eligibility Checker
 *
 * Pattern: Same as /api/score — validate input, compute, return result,
 * fire anonymous analytics. No PII stored at computation time.
 *
 * The slug determines which calculator function to call. Add new calculators
 * to CALCULATOR_REGISTRY as they're built.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import {
  calculateGoodTime,
  validateGoodTimeInput,
  type GoodTimeInput,
  calculateDiversion,
  validateDiversionInput,
  type DiversionInput,
} from "@/lib/calculator";

/**
 * Registry of calculator functions keyed by product slug. Each entry
 * validates and computes its own input shape. Add new calculators here
 * as they ship — the route is generic, the registry is where the
 * calculator-specific wiring lives.
 */
const CALCULATOR_REGISTRY: Record<
  string,
  {
    validate: (input: unknown) => { valid: boolean; errors: string[] };
    calculate: (input: unknown) => unknown;
  }
> = {
  "good-time": {
    validate: (input) => validateGoodTimeInput(input as GoodTimeInput),
    calculate: (input) => calculateGoodTime(input as GoodTimeInput),
  },
  "diversion-eligibility": {
    validate: (input) => validateDiversionInput(input as DiversionInput),
    calculate: (input) => calculateDiversion(input as DiversionInput),
  },
  // "sol": { validate: validateSOLInput, calculate: calculateSOL },
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Validate calculator exists
  const calculator = CALCULATOR_REGISTRY[slug];
  if (!calculator) {
    return NextResponse.json(
      { error: "Calculator not found" },
      { status: 404 },
    );
  }

  // Rate limit: 20 calculations per 5 minutes per IP
  const ip = getClientIp(req);
  const supabase = createAdminClient();
  const { limited } = await checkRateLimit(
    supabase,
    `calc:${slug}:${ip}`,
    20,
    300,
  );
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 },
    );
  }

  // Parse and validate input
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const validation = calculator.validate(body);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Validation failed", details: validation.errors },
      { status: 400 },
    );
  }

  // Compute result
  const result = calculator.calculate(body);

  // Fire anonymous analytics (non-blocking — fire and forget)
  const b = body as { state?: unknown; chargeType?: unknown };
  const analyticsState =
    typeof b.state === "string" ? b.state.toUpperCase() : null;
  const analyticsChargeType =
    typeof b.chargeType === "string" ? b.chargeType : null;
  supabase
    .rpc("increment_calculator_aggregate", {
      p_slug: slug,
      p_state: analyticsState,
      p_charge_type: analyticsChargeType,
    })
    .then(({ error }) => {
      if (error) {
        console.error("[Calculator] Analytics error:", error);
      }
    });

  return NextResponse.json({ result });
}
