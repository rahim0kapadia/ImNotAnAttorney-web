/**
 * @file /api/generate/intelligence-brief — Phase A generation dispatcher
 *
 * Pipeline position: Called AFTER Phase 2 intake is submitted.
 * Triggered by:
 *   1. Phase 2 intake endpoint (/api/intake/intelligence-brief) — fire-and-forget
 *   2. Manual operator retry via curl (with force:true to override idempotency)
 *
 * Pattern: Fire-and-forget delegation (same as Case Decoder dispatcher)
 *   Validates auth + idempotency, atomically claims the case, then fires
 *   the Supabase Edge Function with tier=intelligence-brief, phase=A.
 *
 * Status flow: intake → auto-generating → researching (Phase A success)
 *   - This endpoint handles: intake → auto-generating
 *   - The Edge Function (handleIBPhaseA) handles: auto-generating → researching
 *   - The cron detects stuck "auto-generating" after 30 minutes
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
  const { caseId, force } = body;
  if (!caseId) {
    return NextResponse.json({ error: "caseId required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // ── IDEMPOTENCY CHECK ──────────────────────────────────────
  // IB has more statuses than CD: auto-generating covers the Phase A
  // generation window, researching means waiting for judge research,
  // compiling means Phase B is running.
  const { data: caseData, error: caseError } = await supabase
    .from("cases")
    .select("status, report_token")
    .eq("id", caseId)
    .single();

  if (caseError || !caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  if (
    !force &&
    ["auto-generating", "researching", "compiling", "review", "delivered"].includes(caseData.status)
  ) {
    return NextResponse.json({
      success: true,
      caseId,
      reportToken: caseData.report_token,
      status: caseData.status,
      skipped: true,
      message: `Report already ${caseData.status}. Pass force:true to regenerate.`,
    });
  }

  // ── ATOMIC GUARD ───────────────────────────────────────────
  // Conditional UPDATE prevents race conditions from duplicate triggers.
  let guardQuery = supabase
    .from("cases")
    .update({ status: "auto-generating", updated_at: new Date().toISOString() })
    .eq("id", caseId);

  if (!force) {
    guardQuery = guardQuery.not(
      "status",
      "in",
      '("auto-generating","researching","compiling","review","delivered")',
    );
  }

  const { data: guardData } = await guardQuery.select("id").single();

  if (!guardData) {
    return NextResponse.json({
      skipped: true,
      message: "Already processing or completed",
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
    body: JSON.stringify({ caseId, force, tier: "intelligence-brief", phase: "A" }),
  }).catch((err) =>
    console.error("[IB-Generate] Edge function invocation failed:", err),
  );

  return NextResponse.json({
    success: true,
    caseId,
    status: "auto-generating",
    message: "Intelligence Brief Phase A started. Operator will be notified when judge research is needed.",
  });
}
