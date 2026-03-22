/**
 * @file /api/generate/intelligence-brief/judge-research — Optional judge research enrichment
 *
 * v4 CHANGE: This endpoint is NO LONGER a mandatory pipeline gate.
 * Phase A now auto-triggers Phase B without waiting for operator judge research.
 * IB uses jurisdiction-level intelligence patterns instead of specific judge data.
 *
 * This endpoint is now OPTIONAL — operators can submit judge research to enrich
 * the report if they have it. If Phase B hasn't run yet, this saves the data
 * and triggers Phase B. If Phase B already ran, use force:true to re-trigger
 * with the judge data included.
 *
 * For X-Ray ($2,497+), judge research is a core deliverable and will use this
 * endpoint as a mandatory gate.
 *
 * Status flow: compiling|researching → compiling → review
 *   - Accepts both "compiling" (v4 auto-flow) and "researching" (legacy/fallback)
 *   - The Edge Function (handleIBPhaseB) handles: compiling → review
 *
 * Security: OPERATOR_SECRET bearer token required.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOperatorSecret } from "@/lib/auth/guards";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: NextRequest) {
  // ── AUTH (timing-safe via guard library) ─────────────────────
  const auth = requireOperatorSecret(req);
  if (!auth.authorized) return auth.error;

  // ── INPUT VALIDATION ───────────────────────────────────────
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { caseId, judgeResearch, force } = body;
  if (!caseId) {
    return NextResponse.json({ error: "caseId required" }, { status: 400 });
  }
  if (!judgeResearch || typeof judgeResearch !== "object") {
    return NextResponse.json(
      { error: "judgeResearch object required" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // ── SAVE JUDGE RESEARCH ────────────────────────────────────
  // Skip save if judgeResearch is empty {} and case already has data (retry scenario)
  const isEmptyResearch = Object.keys(judgeResearch).length === 0;
  if (isEmptyResearch) {
    const { data: existing } = await supabase
      .from("cases")
      .select("judge_research_data")
      .eq("id", caseId)
      .single();
    if (existing?.judge_research_data && Object.keys(existing.judge_research_data).length > 0) {
      console.log("[Judge-Research] Empty {} received but case already has research data — skipping save");
    } else {
      return NextResponse.json(
        { error: "judgeResearch is empty and no existing data found on case" },
        { status: 400 },
      );
    }
  } else {
    const { error: saveError } = await supabase
      .from("cases")
      .update({
        judge_research_data: judgeResearch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", caseId);

    if (saveError) {
      console.error("[Judge-Research] Failed to save research:", saveError);
      return NextResponse.json(
        { error: "Failed to save judge research" },
        { status: 500 },
      );
    }
  }

  // ── ATOMIC GUARD ───────────────────────────────────────────
  // v4: Accepts both "researching" (legacy) and "compiling" (auto Phase B flow).
  // Phase A now auto-triggers Phase B, so the typical state is "compiling".
  // This endpoint is optional enrichment — use force:true to re-trigger if needed.
  let guardQuery = supabase
    .from("cases")
    .update({ status: "compiling", updated_at: new Date().toISOString() })
    .eq("id", caseId);

  if (!force) {
    guardQuery = guardQuery.in("status", ["researching", "compiling"]);
  }

  const { data: guardData } = await guardQuery.select("id").single();

  if (!guardData) {
    return NextResponse.json({
      skipped: true,
      message: "Case is not in 'researching' or 'compiling' status. Pass force:true to override.",
    });
  }

  // ── FIRE-AND-FORGET ────────────────────────────────────────
  const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/generate-report`;

  fetch(edgeFunctionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ caseId, force, tier: "intelligence-brief", phase: "B" }),
  }).catch((err) =>
    console.error("[Judge-Research] Edge function invocation failed:", err),
  );

  return NextResponse.json({
    success: true,
    caseId,
    status: "compiling",
    message: "Judge research saved. Intelligence Brief Phase B compilation started.",
  });
}
