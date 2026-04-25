/**
 * @fileoverview Defense Milestone Score API Route
 *
 * Validates inputs, computes score via the pure scoring function in
 * src/lib/score.ts, fires anonymous aggregates, and returns the result.
 *
 * Privacy-first design:
 * - Anonymous aggregate counters are incremented (total completions and
 *   charge-type breakdowns). No individual answers, scores, or PII are stored.
 * - score_completions records {charge_type, score_value, score_band,
 *   attribution_source, referrer_host, matched_blog_slug} per completion
 *   for the TT 2026-07-23 checkpoint Gate A computation. NO answers,
 *   NO email, NO IP, NO full URL.
 * - No email is collected (email capture is handled by the frontend separately)
 * - No cookies or session tracking
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { calculateScore, ALLOWED_VALUES } from "@/lib/score";
import type { ScoreInput } from "@/lib/score";
import { classifyAttributionSource, parseReferrerHost } from "@/lib/score-attribution";

/**
 * Validates all 10 required inputs against the allowlist, then computes and
 * returns the Defense Milestone Score. No data is persisted to any
 * database -- the score is computed and returned in the response only.
 *
 * @param req - JSON body with all 10 ScoreInput fields
 * @returns JSON with score (number 0-100), band (string), and observations (array of strings)
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const { limited } = await checkRateLimit(createAdminClient(), `score:${ip}`, 10, 60);
    if (limited) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // =========================================================================
    // INPUT VALIDATION
    // All 10 fields are required. Each value is checked against the ALLOWED_VALUES
    // allowlist. This is the ONLY validation needed -- the scoring algorithm
    // trusts that inputs have been pre-validated to known-good values.
    // =========================================================================
    const required = [
      "chargeType",
      "timeSinceArrest",
      "hasAttorney",
      "motionsFiled",
      "hasDiscovery",
      "communicationFrequency",
      "strategyDiscussed",
      "criminalHistory",
      "caseStage",
      "licensedProfession",
    ];

    for (const field of required) {
      if (body[field] === undefined || body[field] === null) {
        return NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 }
        );
      }
      // Allowlist validation: reject any value not in the predefined set
      if (ALLOWED_VALUES[field] && !ALLOWED_VALUES[field].includes(body[field])) {
        return NextResponse.json(
          { error: "Invalid input value" },
          { status: 400 }
        );
      }
    }

    // Compute score -- pure function, no side effects, no data storage
    const result = calculateScore(body as ScoreInput);

    // Fire-and-forget: increment counters and anonymous aggregates
    // Supabase failures do NOT break the score response but ARE logged
    const supabase = createAdminClient();
    const input = body as ScoreInput;
    const ct = input.chargeType;
    const rpcLog = (label: string) => (err: unknown) =>
      console.error(`[Score] RPC ${label} failed:`, err);

    // TT 2026-07-23 checkpoint Gate A: log anonymous completion with
    // attribution source. Body fields are advisory; final classification
    // happens server-side in classifyAttributionSource (allowlist-only).
    const referrerHeader = req.headers.get("referer") || req.headers.get("referrer") || null;
    const referrerHost = parseReferrerHost(referrerHeader);
    const attributionSource = classifyAttributionSource({
      bodyAttributionSource: typeof body.attributionSource === "string" ? body.attributionSource : null,
      bodyUtmSource: typeof body.utmSource === "string" ? body.utmSource : null,
      referrerHost,
    });
    const matchedBlogSlug = typeof body.matchedBlogSlug === "string"
      && /^[a-z0-9-]{1,120}$/.test(body.matchedBlogSlug)
        ? body.matchedBlogSlug
        : null;

    supabase
      .from("score_completions")
      .insert({
        charge_type: ct,
        score_value: result.score,
        score_band: result.band,
        attribution_source: attributionSource,
        referrer_host: referrerHost,
        matched_blog_slug: matchedBlogSlug,
      })
      .then(({ error }) => {
        if (error) console.error("[Score] score_completions insert failed:", error.message);
      });

    supabase.rpc("increment_counter", { p_id: "score_completions" }).then(null, rpcLog("increment_counter"));

    // Anonymous aggregate tracking, NO individual answers stored
    supabase.rpc("increment_score_aggregate", { p_charge_type: ct, p_metric: "total_by_charge" }).then(null, rpcLog("total_by_charge"));
    supabase.rpc("increment_score_aggregate", { p_charge_type: ct, p_metric: `band_${result.band.toLowerCase()}` }).then(null, rpcLog("band"));
    if (input.motionsFiled === "no") {
      supabase.rpc("increment_score_aggregate", { p_charge_type: ct, p_metric: "no_motions_filed" }).then(null, rpcLog("no_motions_filed"));
    }
    if (input.hasDiscovery === "no") {
      supabase.rpc("increment_score_aggregate", { p_charge_type: ct, p_metric: "never_seen_discovery" }).then(null, rpcLog("never_seen_discovery"));
    }
    if (input.communicationFrequency === "never") {
      supabase.rpc("increment_score_aggregate", { p_charge_type: ct, p_metric: "communication_never" }).then(null, rpcLog("communication_never"));
    }
    if (input.strategyDiscussed === "no") {
      supabase.rpc("increment_score_aggregate", { p_charge_type: ct, p_metric: "no_strategy_discussion" }).then(null, rpcLog("no_strategy_discussion"));
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Score] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
