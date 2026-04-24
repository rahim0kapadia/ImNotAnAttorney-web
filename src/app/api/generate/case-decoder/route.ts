/**
 * @file /api/generate/case-decoder, Thin generation dispatcher
 *
 * Pipeline position: Called AFTER intake is linked to a paid case.
 * Triggered by:
 *   1. Stripe webhook (checkout.session.completed), when intake already exists at payment time
 *   2. Intake endpoint (/api/intake), when customer fills intake after paying
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
 *   intake → generating → review (on success) / generation-failed (on timeout)
 *
 *   - This endpoint handles: intake → generating
 *   - The Edge Function handles: generating → review (or generation-failed)
 *   - The cron (/api/cron/drip Part 5) detects stuck "generating" and marks generation-failed
 *
 * Security: OPERATOR_SECRET bearer token required. The guard explicitly checks that
 * OPERATOR_SECRET is defined, if the env var is missing/undefined, ALL requests are
 * rejected. This prevents an auth bypass where "Bearer undefined" would match a
 * missing env var.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { caseThreadId } from "@/lib/site";
import { requireOperatorSecret } from "@/lib/auth/guards";
import { getTierGenerationMode } from "@/lib/report/mode-config";
import {
  fireSessionNotify,
  trustedSiteOrigin,
} from "@/lib/report/dispatch-session";

/**
 * Thin dispatcher, validates auth + idempotency, then fires off
 * the Supabase Edge Function (150s timeout) for the heavy work.
 * Returns immediately so Vercel Hobby's timeout is never hit.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  const { caseId, force, skipEmail } = body;
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

  // Idempotency: skip if already processing, waiting on operator session,
  // or completed. `awaiting-session-generation` is included so retries
  // against a session-flipped case return skipped instead of re-racing
  // the atomic guard.
  if (
    !force &&
    ["generating", "awaiting-session-generation", "review", "delivered"].includes(
      caseData.status,
    )
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
  // PER-TIER MODE RESOLUTION (BEFORE atomic guard)
  // ──────────────────────────────────────────────────────────────
  // Resolving the mode first lets the atomic guard flip directly to
  // the correct terminal status in a single UPDATE — no TOCTOU window
  // between a "generating" flip and a later "awaiting-session-generation"
  // re-flip. Stale 'hybrid' values in the DB resolve to 'session' via
  // mode-config's unknown-value fallback (Haiku path removed 2026-04-24).
  const mode = await getTierGenerationMode("case-decoder");
  const targetStatus: "generating" | "awaiting-session-generation" =
    mode === "session" ? "awaiting-session-generation" : "generating";
  const guardUpdate: Record<string, unknown> = {
    status: targetStatus,
    updated_at: new Date().toISOString(),
  };
  if (mode === "session") guardUpdate.generator_mode = "session";

  // ──────────────────────────────────────────────────────────────
  // ATOMIC GUARD: Conditional UPDATE prevents race conditions
  // ──────────────────────────────────────────────────────────────
  // Sets the chosen target status ONLY IF the current status is NOT
  // already a terminal/in-flight value. One write per case regardless
  // of mode — no split "flip to generating, then flip to awaiting-*"
  // race. `force:true` bypasses the status filter so stuck or failed
  // cases can be retried. The loser of a race gets zero rows back.
  let guardQuery = supabase
    .from("cases")
    .update(guardUpdate)
    .eq("id", caseId);

  if (!force) {
    guardQuery = guardQuery.not(
      "status",
      "in",
      '("generating","awaiting-session-generation","review","delivered")',
    );
  }

  const { data: guardData } = await guardQuery.select("id").single();

  if (!guardData) {
    return NextResponse.json({
      skipped: true,
      message: "Already processing or completed",
    });
  }

  // ──────────────────────────────────────────────────────────────
  // MODE DISPATCH (post-guard action only — status already set)
  // ──────────────────────────────────────────────────────────────
  // Each branch is a side-effectful follow-up: trigger the mechanical
  // renderer, fire the Telegram operator notify, or kick the Edge
  // Function. Mechanical failure falls through to the api path so a
  // paid case is never stranded on a flipped mode.
  const fwdBase = trustedSiteOrigin(req.url);
  const fwdHeaders = {
    Authorization: req.headers.get("authorization") ?? "",
    "Content-Type": "application/json",
  };

  if (mode === "mechanical") {
    const target = `${fwdBase}/api/reports/mechanical/${caseId}`;
    try {
      const r = await fetch(target, { method: "POST", headers: fwdHeaders });
      if (r.ok) {
        return NextResponse.json({
          success: true,
          caseId,
          status: "generating",
          mode,
          message: `${mode} generation accepted`,
        });
      }
      // eslint-disable-next-line no-console
      console.error(
        `[CD-dispatcher] ${mode} path returned ${r.status}; falling through to api`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[CD-dispatcher] ${mode} fetch failed; falling through to api:`,
        err,
      );
    }
  } else if (mode === "session") {
    fireSessionNotify(fwdBase, caseId, "CD");
    return NextResponse.json({
      success: true,
      caseId,
      status: "awaiting-session-generation",
      mode: "session",
      message: "Operator will complete by hand.",
    });
  }

  // ──────────────────────────────────────────────────────────────
  // FIRE-AND-FORGET: Delegate to Supabase Edge Function
  // ──────────────────────────────────────────────────────────────
  // The Edge Function has a 150s timeout (vs Vercel Hobby's 10s), which is
  // enough for the LLM to generate the full 9-section Case Decoder report.
  // We intentionally do NOT await this fetch, the response goes to the
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
  // ────────────────────────────────────────────────────────���─────
  // Let the customer know their CD is being generated. Same pattern as IB route.
  // Fire-and-forget, don't block the response on email delivery.
  // skipEmail: when triggered by intake route (which sends its own confirmation),
  // skip this email to avoid sending near-identical "analyzing" emails (Fix 4).
  const { data: caseForEmail } = await supabase
    .from("cases")
    .select("email")
    .eq("id", caseId)
    .single();

  if (caseForEmail?.email && !skipEmail) {
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
        <p>Your case details are in. We're generating your Case Decoder report, including:</p>
        <ul style="padding-left: 20px;">
          <li><strong style="color: white;">Charge analysis</strong>, what the prosecution must prove, explained in plain English</li>
          <li><strong style="color: white;">15 calibrated questions</strong>, each traced to methods used by elite defense attorneys</li>
          <li><strong style="color: white;">Communication tools</strong>, email template and phone script for your attorney</li>
          <li><strong style="color: white;">7-day action plan</strong>, one action per day with a Meeting Ready Sheet</li>
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
  // The caller (webhook or intake endpoint) doesn't wait for the report,
  // they'll check case status later or the customer gets an email when ready.
  return NextResponse.json({
    success: true,
    caseId,
    status: "generating",
    message: "Report generation started. Check case status for updates.",
  });
}
