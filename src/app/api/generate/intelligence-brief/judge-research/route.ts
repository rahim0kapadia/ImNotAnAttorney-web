/**
 * @file /api/generate/intelligence-brief/judge-research — Phase B dispatcher
 *
 * Pipeline position: Operator-facing endpoint for submitting judge research
 * and triggering Intelligence Brief Phase B compilation.
 *
 * Flow:
 *   1. Operator researches the assigned judge (after Phase A email notification)
 *   2. Operator POSTs judge research data here
 *   3. This endpoint saves the research, atomically claims the case, then fires
 *      the Edge Function with tier=intelligence-brief, phase=B
 *
 * Status flow: researching → compiling → review (Phase B success)
 *   - This endpoint handles: researching → compiling
 *   - The Edge Function (handleIBPhaseB) handles: compiling → review
 *   - The cron detects stuck "compiling" after 30 minutes
 *
 * Security: OPERATOR_SECRET bearer token required.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: NextRequest) {
  // ── AUTH ────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  if (
    !process.env.OPERATOR_SECRET ||
    authHeader !== `Bearer ${process.env.OPERATOR_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── INPUT VALIDATION ───────────────────────────────────────
  const body = await req.json();
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
  // Phase B can only start from "researching" status (set by Phase A on success).
  // Simpler guard than Phase A — exactly one valid source state.
  let guardQuery = supabase
    .from("cases")
    .update({ status: "compiling", updated_at: new Date().toISOString() })
    .eq("id", caseId);

  if (!force) {
    guardQuery = guardQuery.eq("status", "researching");
  }

  const { data: guardData } = await guardQuery.select("id").single();

  if (!guardData) {
    return NextResponse.json({
      skipped: true,
      message: "Case is not in 'researching' status. Pass force:true to override.",
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
