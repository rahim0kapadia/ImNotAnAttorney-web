/**
 * @file /api/generate/case-decoder — Thin generation dispatcher
 *
 * Pipeline position: Called AFTER intake is linked to a paid case.
 * Triggered by:
 *   1. Stripe webhook (checkout.session.completed) — when intake already exists at payment time
 *   2. Intake endpoint (/api/intake) — when customer fills intake after paying
 *   3. Manual operator retry via curl (with force:true to override idempotency)
 *
 * Pattern: Fire-and-forget delegation
 *   This endpoint runs on Vercel Hobby (10s function timeout). The actual report
 *   generation takes 60-120s, so we can't do it here. Instead, we:
 *     1. Validate auth + idempotency (fast, <1s)
 *     2. Atomically claim the case via conditional UPDATE (prevents race conditions)
 *     3. Fire off the Supabase Edge Function (150s timeout) without awaiting the response
 *     4. Return immediately to the caller
 *
 * Status flow: intake → generating → review (on success) / generation-failed (on timeout)
 *   - This endpoint handles: intake → generating
 *   - The Edge Function handles: generating → review (or generation-failed)
 *   - The cron (/api/cron/drip Part 5) detects stuck "generating" and marks generation-failed
 *
 * Security: OPERATOR_SECRET bearer token required. The guard explicitly checks that
 * OPERATOR_SECRET is defined — if the env var is missing/undefined, ALL requests are
 * rejected. This prevents an auth bypass where "Bearer undefined" would match a
 * missing env var.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { caseThreadId } from "@/lib/site";

/**
 * Thin dispatcher — validates auth + idempotency, then fires off
 * the Supabase Edge Function (150s timeout) for the heavy work.
 * Returns immediately so Vercel Hobby's timeout is never hit.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: NextRequest) {
  // ──────────────────────────────────────────────────────────────
  // AUTH: Bearer token validation with undefined-env-var guard
  // ──────────────────────────────────────────────────────────────
  // If OPERATOR_SECRET is undefined, the check `!process.env.OPERATOR_SECRET`
  // short-circuits to true and rejects the request. This prevents the scenario
  // where both the header and env var are "undefined" (string), which would
  // otherwise pass the equality check and grant unauthorized access.
  const authHeader = req.headers.get("authorization");
  if (
    !process.env.OPERATOR_SECRET ||
    authHeader !== `Bearer ${process.env.OPERATOR_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ──────────────────────────────────────────────────────────────
  // INPUT VALIDATION
  // ──────────────────────────────────────────────────────────────
  const body = await req.json();
  const { caseId, force } = body;
  if (!caseId) {
    return NextResponse.json({ error: "caseId required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // ──────────────────────────────────────────────────────────────
  // IDEMPOTENCY CHECK: Skip if report is already in progress or done
  // ──────────────────────────────────────────────────────────────
  // Prevents duplicate generation when multiple triggers fire for the same case
  // (e.g., webhook + intake endpoint both call this within milliseconds).
  // The `force` flag allows operators to bypass this for manual re-generation
  // after fixing a failed report.
  const { data: caseData, error: caseError } = await supabase
    .from("cases")
    .select("status, report_token")
    .eq("id", caseId)
    .single();

  if (caseError || !caseData) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  // Idempotency: skip if already processing or completed (unless force=true)
  if (
    !force &&
    ["generating", "review", "delivered"].includes(caseData.status)
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

  // ──────────────────────────────────────────────────────────────
  // ATOMIC GUARD: Conditional UPDATE prevents race conditions
  // ──────────────────────────────────────────────────────────────
  // Two triggers can pass the idempotency check above simultaneously if they
  // both read status:"intake" before either writes. This conditional UPDATE
  // acts as a database-level mutex:
  //   - It sets status to "generating" ONLY IF the current status is NOT
  //     already "generating", "review", or "delivered".
  //   - Supabase/Postgres guarantees atomicity — only one UPDATE can match.
  //   - The loser gets zero rows back (guardData === null) and bails out.
  // This is cheaper and more reliable than advisory locks for our use case.
  // When force=true, skip the status filter so stuck-generating or failed
  // cases can be retried immediately. Without this, the atomic guard rejects
  // force retries because the case is already in "generating" status.
  let guardQuery = supabase
    .from("cases")
    .update({ status: "generating", updated_at: new Date().toISOString() })
    .eq("id", caseId);

  if (!force) {
    guardQuery = guardQuery.not("status", "in", '("generating","review","delivered")');
  }

  const { data: guardData } = await guardQuery.select("id").single();

  if (!guardData) {
    return NextResponse.json({
      skipped: true,
      message: "Already processing or completed",
    });
  }

  // ──────────────────────────────────────────────────────────────
  // FIRE-AND-FORGET: Delegate to Supabase Edge Function
  // ──────────────────────────────────────────────────────────────
  // The Edge Function has a 150s timeout (vs Vercel Hobby's 10s), which is
  // enough for the LLM to generate the full 9-section Case Decoder report.
  // We intentionally do NOT await this fetch — the response goes to the
  // caller immediately while the Edge Function works in the background.
  // Errors are caught and logged but don't affect the response.
  // If the Edge Function crashes silently, the cron (Part 5) will detect
  // the case stuck in "generating" after 30 minutes and alert the operator.
  const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/generate-report`;

  fetch(edgeFunctionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ caseId, force }),
  }).catch((err) =>
    console.error("[Generate] Edge function invocation failed:", err)
  );

  // ──────────────────────────────────────────────────────────────
  // "WE'VE STARTED" TRANSACTIONAL EMAIL
  // ──────────────────────────────────────────────────────────────
  // Let the customer know their CD is being generated. Same pattern as IB route.
  // Fire-and-forget — don't block the response on email delivery.
  const { data: caseForEmail } = await supabase
    .from("cases")
    .select("email")
    .eq("id", caseId)
    .single();

  if (caseForEmail?.email) {
    sendEmail({
      to: caseForEmail.email,
      subject: "We're analyzing your case now",
      unsubscribeEmail: caseForEmail.email,
      threadingHeaders: {
        inReplyTo: caseThreadId(caseId),
        references: caseThreadId(caseId),
      },
      html: `
        <h1 style="color: #F59E0B;">Your Case Decoder Is Being Built</h1>
        <p>Your case details are in. We're generating your Case Decoder report — including:</p>
        <ul style="padding-left: 20px;">
          <li><strong style="color: white;">Charge analysis</strong> — what the prosecution must prove, explained in plain English</li>
          <li><strong style="color: white;">15 calibrated questions</strong> — each traced to methods used by elite defense attorneys</li>
          <li><strong style="color: white;">Communication tools</strong> — email template and phone script for your attorney</li>
          <li><strong style="color: white;">7-day action plan</strong> — one action per day with a Meeting Ready Sheet</li>
        </ul>
        <p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
          <strong style="color: white;">Expected delivery: within 48 hours.</strong> We'll email you as soon as your Case Decoder is ready.
        </p>
      `,
    }, { category: "transactional", case_id: caseId, metadata: { tier: "case-decoder", event: "generation-started" } })
      .catch((err) => console.error("[CD-Generate] Started email failed:", err));
  }

  // ──────────────────────────────────────────────────────────────
  // RESPONSE: Confirm generation started
  // ──────────────────────────────────────────────────────────────
  // The caller (webhook or intake endpoint) doesn't wait for the report —
  // they'll check case status later or the customer gets an email when ready.
  return NextResponse.json({
    success: true,
    caseId,
    status: "generating",
    message: "Report generation started. Check case status for updates.",
  });
}
