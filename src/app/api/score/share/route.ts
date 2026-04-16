/**
 * POST /api/score/share, Generate a shareable score URL.
 *
 * Accepts the original 10 quiz answers, re-calculates the score server-side
 * (preventing tampering), generates a 12-char token, stores the verified
 * result in score_results, and returns the shareable URL.
 *
 * Privacy: scores are stored ONLY when the user explicitly shares.
 * The token is opaque, no score data in the URL.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { calculateScore, ALLOWED_VALUES } from "@/lib/score";
import { SITE_URL } from "@/lib/site";
import type { ScoreInput } from "@/lib/score";

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const ip = getClientIp(req);
    const { limited } = await checkRateLimit(supabase, `score-share:${ip}`, 10, 3600);
    if (limited) {
      return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Validate all 10 fields against allowlist (same validation as /api/score)
    const required: (keyof ScoreInput)[] = [
      "chargeType", "timeSinceArrest", "hasAttorney", "motionsFiled",
      "hasDiscovery", "communicationFrequency", "strategyDiscussed",
      "criminalHistory", "caseStage", "licensedProfession",
    ];

    for (const field of required) {
      if (body[field] === undefined || body[field] === null) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }
      if (ALLOWED_VALUES[field] && !ALLOWED_VALUES[field].includes(body[field])) {
        return NextResponse.json({ error: "Invalid input value" }, { status: 400 });
      }
    }

    // Re-calculate score server-side (prevents tampering)
    const result = calculateScore(body as ScoreInput);

    // Generate 12-char base64url token
    const token = randomBytes(9).toString("base64url");

    // Store result
    const { error: insertError } = await supabase.from("score_results").insert({
      token,
      charge_type: (body as ScoreInput).chargeType,
      score_value: result.score,
      score_band: result.band,
      observations: result.observations,
    });

    if (insertError) {
      console.error("[ScoreShare] Insert error:", insertError);
      return NextResponse.json({ error: "Could not create share link" }, { status: 500 });
    }

    const url = `${SITE_URL}/score/results/${token}`;
    return NextResponse.json({ token, url });
  } catch (error) {
    console.error("[ScoreShare] Error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
