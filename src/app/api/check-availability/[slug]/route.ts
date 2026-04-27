/**
 * POST /api/check-availability/[slug]
 * Checks Tier 9 data availability before purchase.
 * Returns coverage counts + available boolean.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkJudgeCoverage,
  checkOfficerCoverage,
  checkSimilarCasesCoverage,
  checkDistrictCoverage,
  checkArrestKitCoverage,
  checkFJIBCoverage,
  type CoverageResult,
} from "@/lib/tier9-reports/coverage";
import { isValidChargeType } from "@/lib/charge-types";
import {
  FEDERAL_CHARGES,
  CIRCUIT_NAMES as FJB_CIRCUIT_NAMES,
} from "@/lib/tier9-reports/federal-jury-instruction-brief";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
// C3 (2026-04-26 stop-the-bleed): canonical TIER9_SLUGS — was a local
// drifted Set with 6 entries; canonical at constants.ts has 10. Dark slugs
// return available:false via the isActive boolean check downstream, NOT 400.
import { TIER9_SLUGS } from "@/lib/tier9-reports/constants";
const VALID_STATES = new Set(["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!TIER9_SLUGS.has(slug)) {
    return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  }

  // Rate limit: 10 per minute per IP
  const ip = getClientIp(req);
  const { limited } = await checkRateLimit(createAdminClient(), `check-avail:${ip}`, 10, 60);
  if (limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const state = typeof body.state === "string" ? body.state.trim().toUpperCase() : "";
  if (!VALID_STATES.has(state)) {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  // Waitlist helper, only runs when body.waitlist === true && body.email is set
  async function handleWaitlist(
    result: CoverageResult,
    searchName: string,
    chargeTypeOverride?: string
  ): Promise<NextResponse> {
    if (body.waitlist !== true || typeof body.email !== "string") {
      return NextResponse.json(result);
    }

    const email = body.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    await supabase.from("data_waitlist").upsert(
      {
        product_slug: slug,
        search_name: searchName,
        search_state: state,
        search_charge_type: chargeTypeOverride ?? null,
        email,
      },
      { onConflict: "product_slug,search_name,search_state,email" }
    );

    // Fire-and-forget Telegram alert to operator
    const { exec } = await import("child_process");
    const msg = `New data request: ${searchName} (${state})\nProduct: ${slug}\nCustomer: ${email}\nCoverage: ${JSON.stringify(result.coverage)}`;
    exec(
      `node "C:\\Users\\email\\.claude\\scripts\\telegram\\telegram-send.js" --bot legal --message "${msg.replace(/"/g, '\\"')}"`
    );

    return NextResponse.json({ ...result, waitlisted: true });
  }

  try {
    switch (slug) {
      case "judge-report-card": {
        const judgeName = typeof body.judgeName === "string" ? body.judgeName.trim() : "";
        if (!judgeName || judgeName.length < 2 || judgeName.length > 100) {
          return NextResponse.json({ error: "Judge name required (2-100 chars)" }, { status: 400 });
        }
        const result = await checkJudgeCoverage(judgeName, state);
        return handleWaitlist(result, judgeName);
      }

      case "officer-background-check": {
        const officerName = typeof body.officerName === "string" ? body.officerName.trim() : "";
        if (!officerName || officerName.length < 2 || officerName.length > 100) {
          return NextResponse.json({ error: "Officer name required (2-100 chars)" }, { status: 400 });
        }
        const result = await checkOfficerCoverage(officerName, state);
        return handleWaitlist(result, officerName);
      }

      case "similar-cases-analyzer": {
        const chargeType = typeof body.chargeType === "string" ? body.chargeType.trim() : "";
        if (!chargeType || !isValidChargeType(chargeType)) {
          return NextResponse.json({ error: "Valid charge type required" }, { status: 400 });
        }
        const result = await checkSimilarCasesCoverage(chargeType, state);
        return handleWaitlist(result, chargeType, chargeType);
      }

      case "district-court-intelligence": {
        const result = await checkDistrictCoverage(state);
        return handleWaitlist(result, state);
      }

      case "arrest-survival-kit": {
        const result = await checkArrestKitCoverage(state);
        return handleWaitlist(result, state);
      }

      case "federal-jury-instruction-brief": {
        // Federal-only gate first — D5 plan, 2026-04-26.
        const federalCharge =
          typeof body.federalCharge === "string"
            ? body.federalCharge.trim()
            : "";
        if (
          !federalCharge ||
          !Object.prototype.hasOwnProperty.call(FEDERAL_CHARGES, federalCharge)
        ) {
          return NextResponse.json(
            {
              error:
                "Federal charge required (this product covers federal criminal code only)",
            },
            { status: 400 },
          );
        }
        // Circuit is optional at the API layer — when blank, the helper
        // cascades from the state code (existing STATE_TO_CIRCUIT map).
        const rawCircuit =
          typeof body.circuit === "string" ? body.circuit.trim() : "";
        if (rawCircuit && !FJB_CIRCUIT_NAMES[rawCircuit]) {
          return NextResponse.json(
            { error: "Invalid federal circuit (1-11 or DC)" },
            { status: 400 },
          );
        }
        const result = await checkFJIBCoverage(
          rawCircuit || null,
          state,
          federalCharge,
        );
        // W2 (PR #171 review): include the circuit in the waitlist key so a
        // VA customer waitlisting circuit-4 and another VA customer
        // explicitly picking circuit-2 do NOT collide on
        // (product_slug, search_name, search_state, email). Auto-detect
        // (blank circuit) gets its own bucket so per-circuit ingest demand
        // is countable.
        const waitlistKey = rawCircuit
          ? `${federalCharge}|c${rawCircuit}`
          : `${federalCharge}|auto`;
        return handleWaitlist(result, waitlistKey, federalCharge);
      }

      default:
        return NextResponse.json({ error: "Invalid product" }, { status: 400 });
    }
  } catch (err) {
    console.error("[check-availability] Error:", err);
    return NextResponse.json({ error: "Service error" }, { status: 500 });
  }
}
