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
 * Status flow (v4 — fully automated, no operator judge research gate):
 *   intake → auto-generating → compiling → review
 *   - This endpoint handles: intake → auto-generating
 *   - The Edge Function (handleIBPhaseA) handles: auto-generating → compiling
 *   - Phase A auto-triggers Phase B (fire-and-forget)
 *   - The Edge Function (handleIBPhaseB) handles: compiling → review
 *   - The cron detects stuck "auto-generating" or "compiling" after 30 minutes
 *
 * Security: OPERATOR_SECRET bearer token required.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { caseThreadId } from "@/lib/site";
import { requireOperatorSecret } from "@/lib/auth/guards";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: NextRequest) {
  // ── AUTH (timing-safe via guard library) ─────────────────────
  const auth = requireOperatorSecret(req);
  if (!auth.authorized) return auth.error;

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

  // ── "WE'VE STARTED" TRANSACTIONAL EMAIL ──────────────────────
  // Let the customer know their IB is being generated. This fills the
  // silence gap between CD delivery and IB delivery (up to 72 hours).
  // Fire-and-forget — don't block the response on email delivery.
  const { data: caseForEmail } = await supabase
    .from("cases")
    .select("email")
    .eq("id", caseId)
    .single();

  if (caseForEmail?.email) {
    sendEmail({
      to: caseForEmail.email,
      subject: "We're building your Intelligence Brief now",
      unsubscribeEmail: caseForEmail.email,
      threadingHeaders: {
        inReplyTo: caseThreadId(caseId),
        references: caseThreadId(caseId),
      },
      html: `
        <h1 style="color: #F59E0B;">Your Intelligence Brief Is Being Built</h1>
        <p>Your Case Decoder has been delivered. We're now generating your full Intelligence Brief — including:</p>
        <ul style="padding-left: 20px;">
          <li><strong style="color: white;">Judge intelligence</strong> — your judge's actual sentencing patterns and tendencies</li>
          <li><strong style="color: white;">Motion landscape</strong> — every motion that applies to your case, with deadlines</li>
          <li><strong style="color: white;">Defense theory analysis</strong> — established defense strategies for your charge type</li>
          <li><strong style="color: white;">Priority questions</strong> — 10-15 targeted questions with follow-up probes</li>
          <li><strong style="color: white;">14-day action plan</strong> — one action per day, with scripts for difficult conversations</li>
        </ul>
        <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
          <strong style="color: white;">Expected delivery: within 72 hours.</strong> We'll email you as soon as your Intelligence Brief is ready.
        </p>
      `,
    }, { category: "transactional", case_id: caseId, metadata: { tier: "intelligence-brief", event: "generation-started" } })
      .catch((err) => console.error("[IB-Generate] Started email failed:", err));
  }

  return NextResponse.json({
    success: true,
    caseId,
    status: "auto-generating",
    message: "Intelligence Brief Phase A started. Phase B will auto-trigger on completion (v4 — no operator gate).",
  });
}
