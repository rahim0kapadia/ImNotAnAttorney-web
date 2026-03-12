/**
 * @file /api/evaluate/case-decoder — Thin evaluation dispatcher
 *
 * Pipeline position: Called AFTER report generation completes (status = "review").
 * Triggered by:
 *   1. generate-report Edge Function (fire-and-forget after saving report)
 *   2. Cron safety net (/api/cron/drip) for cases with NULL eval_results
 *   3. Manual operator trigger
 *
 * Pattern: Fire-and-forget delegation
 *   Same pattern as /api/generate/case-decoder — validates auth, checks case
 *   exists and has a report, then fires off the evaluate-report Supabase Edge
 *   Function without awaiting the response. Returns 202 Accepted immediately.
 *
 * No atomic guard needed — evaluation is advisory and idempotent (re-running
 * just overwrites eval_results). No status change happens here.
 *
 * Security: OPERATOR_SECRET bearer token required (same as generation dispatcher).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { timingSafeEqual } from "crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: NextRequest) {
  // ──────────────────────────────────────────────────────────────
  // AUTH
  // ──────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  const operatorSecret = process.env.OPERATOR_SECRET;
  const expected = `Bearer ${operatorSecret}`;
  if (
    !operatorSecret ||
    !authHeader ||
    authHeader.length !== expected.length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ──────────────────────────────────────────────────────────────
  // INPUT VALIDATION
  // ──────────────────────────────────────────────────────────────
  const body = await req.json();
  const { caseId } = body;
  if (!caseId) {
    return NextResponse.json({ error: "caseId required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // ──────────────────────────────────────────────────────────────
  // CHECK: Case exists and has a report
  // ──────────────────────────────────────────────────────────────
  const { data: caseData, error: caseError } = await supabase
    .from("cases")
    .select("status, report_html")
    .eq("id", caseId)
    .single();

  if (caseError || !caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  if (!caseData.report_html) {
    return NextResponse.json(
      { error: "Case has no report — generate first" },
      { status: 400 }
    );
  }

  // ──────────────────────────────────────────────────────────────
  // FIRE-AND-FORGET: Delegate to Supabase Edge Function
  // ──────────────────────────────────────────────────────────────
  const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/evaluate-report`;

  fetch(edgeFunctionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ caseId }),
  }).catch((err) =>
    console.error("[Evaluate] Edge function invocation failed:", err)
  );

  // ──────────────────────────────────────────────────────────────
  // RESPONSE: 202 Accepted (evaluation started in background)
  // ──────────────────────────────────────────────────────────────
  return NextResponse.json(
    {
      success: true,
      caseId,
      message: "Evaluation started. Results will be saved to eval_results.",
    },
    { status: 202 }
  );
}
