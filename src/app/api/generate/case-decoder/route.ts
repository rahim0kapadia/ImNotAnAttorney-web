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
 * Status flow:
 *   Default (operator review): intake → generating → review (on success) / generation-failed (on timeout)
 *   Auto-delivery path:        intake → generating → delivered (skips operator review)
 *
 *   - This endpoint handles: intake → generating
 *   - The Edge Function handles: generating → review (or generation-failed)
 *   - When auto_deliver is set, after() polls case status and calls /api/deliver when review is reached
 *   - The cron (/api/cron/drip Part 5) detects stuck "generating" and marks generation-failed
 *
 * Auto-delivery (auto_deliver: true):
 *   Pass auto_deliver:true to skip operator review and deliver directly to the customer.
 *   Uses Next.js after() to schedule a background poll that watches for status:"review",
 *   then calls /api/deliver internally with OPERATOR_SECRET to transition to "delivered"
 *   and send the customer their report link.
 *   Poll interval: 15s, max attempts: 20 (~5 minutes). If poll times out, the case stays
 *   in "review" and the operator receives the standard review email for manual approval.
 *
 * Security: OPERATOR_SECRET bearer token required. The guard explicitly checks that
 * OPERATOR_SECRET is defined — if the env var is missing/undefined, ALL requests are
 * rejected. This prevents an auth bypass where "Bearer undefined" would match a
 * missing env var.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { caseThreadId, signOperatorToken } from "@/lib/site";
import { requireOperatorSecret } from "@/lib/auth/guards";

/**
 * Thin dispatcher — validates auth + idempotency, then fires off
 * the Supabase Edge Function (150s timeout) for the heavy work.
 * Returns immediately so Vercel Hobby's timeout is never hit.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ──────────────────────────────────────────────────────────────
// AUTO-DELIVERY BACKGROUND POLL
// ──────────────────────────────────────────────────────────────
// Runs inside after() — post-response background work.
// Polls the case status every 15s until it reaches "review",
// then calls /api/deliver to transition to "delivered" and email
// the customer. Max 20 attempts (~5 minutes). Falls back gracefully
// to operator-review flow if generation times out.
//
// Why poll instead of a callback: The Edge Function is Deno-based
// with no Node/Next.js imports. A poll in after() is the cleanest
// integration without modifying the Edge Function contract.
async function scheduleAutoDelivery(caseId: string): Promise<void> {
  const POLL_INTERVAL_MS = 15_000;
  const MAX_ATTEMPTS = 20;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
  const operatorSecret = process.env.OPERATOR_SECRET;

  if (!operatorSecret) {
    console.error("[CD-AutoDeliver] OPERATOR_SECRET not set — auto-delivery skipped");
    return;
  }

  const supabase = createAdminClient();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const { data } = await supabase
      .from("cases")
      .select("status")
      .eq("id", caseId)
      .single();

    const status = data?.status;
    console.warn(`[CD-AutoDeliver] Poll ${attempt}/${MAX_ATTEMPTS} — case ${caseId} status: ${status}`);

    if (status === "delivered") {
      console.log(`[CD-AutoDeliver] Case ${caseId} already delivered — stopping poll`);
      return;
    }

    if (status === "generation-failed") {
      console.error(`[CD-AutoDeliver] Case ${caseId} generation failed — auto-delivery aborted`);
      return;
    }

    if (status === "review") {
      // Report is ready — call /api/deliver with operator token
      // Using signed HMAC token (not raw secret) for security
      let deliverToken: string;
      try {
        deliverToken = signOperatorToken(caseId);
      } catch (err) {
        console.error("[CD-AutoDeliver] Failed to sign operator token:", err);
        return;
      }

      try {
        const deliverRes = await fetch(`${siteUrl}/api/deliver`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: deliverToken, case: caseId }),
        });

        if (deliverRes.ok) {
          console.log(`[CD-AutoDeliver] Case ${caseId} delivered successfully`);
        } else {
          const text = await deliverRes.text().catch(() => "(no body)");
          console.error(`[CD-AutoDeliver] /api/deliver returned ${deliverRes.status}: ${text}`);
        }
      } catch (err) {
        console.error("[CD-AutoDeliver] Failed to call /api/deliver:", err);
      }
      return;
    }

    // Still generating — continue polling
  }

  console.warn(`[CD-AutoDeliver] Case ${caseId} did not reach 'review' after ${MAX_ATTEMPTS} attempts — operator review email already sent`);
}

export async function POST(req: NextRequest) {
  // ──────────────────────────────────────────────────────────────
  // AUTH: Bearer token validation (timing-safe via guard library)
  // ──────────────────────────────────────────────────────────────
  const auth = requireOperatorSecret(req);
  if (!auth.authorized) return auth.error;

  // ──────────────────────────────────────────────────────────────
  // INPUT VALIDATION
  // ──────────────────────────────────────────────────────────────
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { caseId, force, auto_deliver } = body;
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
  const deliveryDue = new Date();
  deliveryDue.setDate(deliveryDue.getDate() + 2); // CD promise: 48 hours (2 calendar days)

  let guardQuery = supabase
    .from("cases")
    .update({
      status: "generating",
      updated_at: new Date().toISOString(),
      delivery_due_at: deliveryDue.toISOString(),
    })
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
  // AUTO-DELIVERY: Schedule background poll (when auto_deliver=true)
  // ──────────────────────────────────────────────────────────────
  // after() runs post-response, GC-safe on Vercel. The poll watches for
  // status:"review" then fires /api/deliver to skip operator review and
  // deliver directly to the customer.
  if (auto_deliver) {
    after(scheduleAutoDelivery(caseId));
  }

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
    auto_deliver: auto_deliver ? true : false,
    message: auto_deliver
      ? "Report generation started. Auto-delivery scheduled — customer will receive report directly."
      : "Report generation started. Check case status for updates.",
  });
}
