/**
 * POST /api/check-availability/[slug]
 * Checks Tier 9 data availability before purchase.
 * Returns coverage counts + available boolean.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkJudgeCoverage, checkOfficerCoverage, checkSimilarCasesCoverage } from "@/lib/tier9-reports/coverage";
import { isValidChargeType } from "@/lib/charge-types";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

const TIER9_SLUGS = new Set(["judge-report-card", "officer-background-check", "similar-cases-analyzer"]);
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

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const state = typeof body.state === "string" ? body.state.trim().toUpperCase() : "";
  if (!VALID_STATES.has(state)) {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  try {
    switch (slug) {
      case "judge-report-card": {
        const judgeName = typeof body.judgeName === "string" ? body.judgeName.trim() : "";
        if (!judgeName || judgeName.length < 2 || judgeName.length > 100) {
          return NextResponse.json({ error: "Judge name required (2-100 chars)" }, { status: 400 });
        }
        const result = await checkJudgeCoverage(judgeName, state);
        return NextResponse.json(result);
      }

      case "officer-background-check": {
        const officerName = typeof body.officerName === "string" ? body.officerName.trim() : "";
        if (!officerName || officerName.length < 2 || officerName.length > 100) {
          return NextResponse.json({ error: "Officer name required (2-100 chars)" }, { status: 400 });
        }
        const result = await checkOfficerCoverage(officerName, state);
        return NextResponse.json(result);
      }

      case "similar-cases-analyzer": {
        const chargeType = typeof body.chargeType === "string" ? body.chargeType.trim() : "";
        if (!chargeType || !isValidChargeType(chargeType)) {
          return NextResponse.json({ error: "Valid charge type required" }, { status: 400 });
        }
        const result = await checkSimilarCasesCoverage(chargeType, state);
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: "Invalid product" }, { status: 400 });
    }
  } catch (err) {
    console.error("[check-availability] Error:", err);
    return NextResponse.json({ error: "Service error" }, { status: 500 });
  }
}
