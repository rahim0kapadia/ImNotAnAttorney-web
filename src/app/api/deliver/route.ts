/**
 * @file /api/deliver — Operator-facing report delivery endpoint
 *
 * Pipeline position: Final step in the delivery pipeline. Called by the operator
 * after reviewing a generated report. This is where case status transitions from
 * "review" to "delivered" and the customer receives their report link.
 *
 * Two HTTP methods, each with a specific purpose:
 *
 *   GET  — Renders a confirmation page (read-only, no state change)
 *          Safe for email prefetch bots (Outlook, Gmail, etc.) that automatically
 *          follow links in emails. If this were a POST, bots would accidentally
 *          deliver reports. The GET shows case details + a "Confirm Delivery" button
 *          that submits a POST form.
 *
 *   POST — Actually delivers the report (sends email, updates status)
 *          This is the destructive action. Only triggered by the operator clicking
 *          the confirmation button.
 *
 * Atomic-claim-then-email pattern:
 *   The case status is atomically updated to "delivered" BEFORE sending the
 *   delivery email. This prevents the TOCTOU race where two concurrent POST
 *   requests both pass a bare status check and both send delivery emails.
 *   The atomic conditional UPDATE (.eq("status", "review")) acts as a mutex —
 *   only one request wins. If the email fails after the status update, the
 *   operator is alerted and the report URL still works (manual forwarding).
 *
 * Retry logic:
 *   1. First email attempt (full HTML template)
 *   2. If failed → wait 2s → retry with simplified HTML (less likely to trigger spam filters)
 *   3. If both fail → send operator alert with the report URL for manual forwarding
 *   4. Case status is updated to "delivered" regardless (report URL works even without email)
 *
 * Drip recording:
 *   After delivery, records "post_case_decoder_delivery" in drip_emails table.
 *   This prevents the cron (/api/cron/drip Part 2) from re-sending the delivery
 *   notification as a post-purchase drip email.
 *
 * Security: OPERATOR_SECRET token required (same undefined-guard pattern as /api/generate).
 * Status flow: review → delivered
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";
import { verifyOperatorToken } from "@/lib/site";

/** Fallback operator email if OPERATOR_EMAIL env var is not set. */
const OPERATOR_EMAIL =
  process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com";

/** Maps tier slugs to display names for delivery emails. */
const TIER_NAMES: Record<string, string> = {
  "case-decoder": "Case Decoder",
  "intelligence-brief": "Intelligence Brief",
  "x-ray": "X-Ray",
  "war-room": "War Room",
  "situation-room": "Situation Room",
};

/**
 * Returns the site origin URL for constructing absolute links.
 * Falls back to production URL if NEXT_PUBLIC_SITE_URL is not set.
 */
function getOrigin(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
}

/**
 * Renders eval scorecard HTML for the operator confirmation page.
 * Shows UPL gate status (red/green/yellow) and team-by-team results.
 */
// deno-lint-ignore no-explicit-any
function renderEvalScorecard(evalResults: any): string {
  if (!evalResults) {
    return `<div style="background: #422006; padding: 12px 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #F59E0B;">
      <p style="margin: 0; color: #FDE68A; font-weight: bold;">Evaluation: Pending</p>
      <p style="margin: 4px 0 0; color: #D4D4D8; font-size: 13px;">Evaluation has not completed yet. Results will appear here once ready.</p>
    </div>`;
  }

  const gatePassed = evalResults.gate_passed;
  const teams = evalResults.teams || {};

  // Gate banner
  let banner: string;
  if (gatePassed === false) {
    banner = `<div style="background: #7F1D1D; padding: 12px 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #EF4444;">
      <p style="margin: 0; color: #FCA5A5; font-weight: bold;">UPL GATE FAILED — Review evaluation below before delivering</p>
    </div>`;
  } else {
    const uplScore = teams.upl?.score || "N/A";
    const psychScore = teams.psych?.score || "N/A";
    banner = `<div style="background: #052E16; padding: 12px 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #22C55E;">
      <p style="margin: 0; color: #86EFAC; font-weight: bold;">Evaluation: PASSED</p>
      <p style="margin: 4px 0 0; color: #D4D4D8; font-size: 13px;">UPL ${escapeHtml(String(uplScore))} | Psych ${escapeHtml(String(psychScore))}</p>
    </div>`;
  }

  // Team details (collapsible)
  let details = "";
  for (const [key, team] of Object.entries(teams)) {
    // deno-lint-ignore no-explicit-any
    const t = team as any;
    if (t.error) {
      details += `<div style="margin: 8px 0;"><strong style="color: #EF4444;">${escapeHtml(t.name || key)}: ERROR</strong> — ${escapeHtml(t.error)}</div>`;
      continue;
    }
    if (t.skipped) {
      details += `<div style="margin: 8px 0;"><strong style="color: #F59E0B;">${escapeHtml(t.name || key)}: SKIPPED</strong> — ${escapeHtml(t.reason || "")}</div>`;
      continue;
    }
    if (!t.criteria) continue;

    const teamBadge = t.failed > 0 ? "color: #EF4444;" : t.needs_work > 0 ? "color: #F59E0B;" : "color: #22C55E;";
    details += `<div style="margin: 12px 0;">
      <strong style="${teamBadge}">${escapeHtml(t.name || key)} (${escapeHtml(t.weight || "")}): ${escapeHtml(t.score || "")}</strong>
      <span style="color: #71717A; font-size: 12px;"> — ${t.passed} pass, ${t.needs_work} needs_work, ${t.failed} fail</span>`;

    if (t.summary) {
      details += `<p style="margin: 4px 0 0; color: #A1A1AA; font-size: 13px;">${escapeHtml(t.summary)}</p>`;
    }

    // Show failed/needs_work criteria
    // deno-lint-ignore no-explicit-any
    const issues = (t.criteria as any[]).filter((c: any) => c.result !== "PASS");
    if (issues.length > 0) {
      details += `<ul style="margin: 8px 0 0; padding-left: 20px;">`;
      // deno-lint-ignore no-explicit-any
      for (const c of issues as any[]) {
        const color = c.result === "FAIL" ? "#EF4444" : "#F59E0B";
        details += `<li style="margin: 4px 0; font-size: 13px;"><span style="color: ${color};">${escapeHtml(c.result)}</span> <strong>${escapeHtml(c.id)}</strong>: ${escapeHtml(c.justification || "")}`;
        if (c.problematic_text) {
          details += `<br><em style="color: #EF4444; font-size: 12px;">"${escapeHtml(String(c.problematic_text).slice(0, 150))}"</em>`;
        }
        details += `</li>`;
      }
      details += `</ul>`;
    }

    details += `</div>`;
  }

  const costInfo = evalResults.cost_usd ? ` | Cost: $${evalResults.cost_usd.toFixed(4)}` : "";
  const durationInfo = evalResults.duration_ms ? ` | Duration: ${(evalResults.duration_ms / 1000).toFixed(1)}s` : "";

  return `${banner}
    <details style="margin: 8px 0 16px; cursor: pointer;">
      <summary style="color: #A1A1AA; font-size: 13px;">Evaluation Details (v${escapeHtml(evalResults.eval_version || "1.0")}${costInfo}${durationInfo})</summary>
      <div style="background: #1C1917; padding: 16px; border-radius: 8px; margin-top: 8px;">
        ${details}
      </div>
    </details>`;
}

// ================================================================
// GET: Render delivery confirmation page (safe for email prefetch)
// ================================================================
// This endpoint is linked in operator notification emails. Email clients
// (Outlook, Gmail) may prefetch/preview linked URLs with GET requests.
// By making GET read-only, these prefetch requests don't accidentally
// deliver reports. The operator must explicitly click "Confirm Delivery"
// which submits a POST form.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const caseId = searchParams.get("case");

  // ──────────────────────────────────────────────────────────────
  // AUTH: Operator token validation
  // ──────────────────────────────────────────────────────────────
  // Accepts two token formats:
  //   1. Raw OPERATOR_SECRET (for curl/manual access by operator)
  //   2. HMAC-signed token (from email links — scoped to caseId, 24h expiry)
  //
  // Signed tokens are preferred because they:
  //   - Don't expose the raw secret in browser history or email logs
  //   - Are scoped to a specific case (can't be reused for other cases)
  //   - Expire after 24 hours (limits damage if an email is compromised)
  if (!process.env.OPERATOR_SECRET || !token) {
    return new NextResponse(
      "<h1>Unauthorized</h1><p>Invalid operator token.</p>",
      { status: 401, headers: { "Content-Type": "text/html" } }
    );
  }

  if (!caseId) {
    return new NextResponse(
      "<h1>Missing case ID</h1>",
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }

  // Check raw secret first (operator curl), then signed token (email link)
  const isRawSecret = token === process.env.OPERATOR_SECRET;
  const isSignedToken = !isRawSecret && verifyOperatorToken(token, caseId);
  if (!isRawSecret && !isSignedToken) {
    return new NextResponse(
      "<h1>Unauthorized</h1><p>Invalid or expired operator token.</p>",
      { status: 401, headers: { "Content-Type": "text/html" } }
    );
  }

  // ──────────────────────────────────────────────────────────────
  // FETCH CASE DATA for display on confirmation page
  // ──────────────────────────────────────────────────────────────
  const supabase = createAdminClient();

  const { data: caseData, error: caseError } = await supabase
    .from("cases")
    .select("id, email, tier, status, charge_type, report_token, eval_results")
    .eq("id", caseId)
    .single();

  if (caseError || !caseData) {
    return new NextResponse(
      "<h1>Case not found</h1>",
      { status: 404, headers: { "Content-Type": "text/html" } }
    );
  }

  // ──────────────────────────────────────────────────────────────
  // STATUS GUARDS: Prevent re-delivery or premature delivery
  // ──────────────────────────────────────────────────────────────
  // "delivered" — idempotent: show already-delivered message
  // anything other than "review" — case isn't ready for delivery yet
  if (caseData.status === "delivered") {
    return new NextResponse(
      `<h1>Already Delivered</h1><p>This case has already been delivered to ${escapeHtml(caseData.email)}.</p>`,
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  }

  if (caseData.status !== "review") {
    return new NextResponse(
      `<h1>Case not in review status</h1><p>Current status: ${escapeHtml(caseData.status)}</p>`,
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }

  const origin = getOrigin(req);

  // ──────────────────────────────────────────────────────────────
  // RENDER CONFIRMATION PAGE (no state change — GET is read-only)
  // ──────────────────────────────────────────────────────────────
  // Shows case details, optional report preview link, and a POST form
  // with a "Confirm Delivery" button. The form POSTs back to this same
  // endpoint, which triggers the actual delivery logic below.
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head><title>Confirm Delivery</title></head>
<body style="font-family: Arial, sans-serif; background: #0C0A09; color: #D4D4D8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0;">
  <div style="text-align: center; max-width: 500px; padding: 32px;">
    <h1 style="color: #F59E0B;">Confirm Report Delivery</h1>
    <div style="text-align: left; background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
      <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(caseData.email)}</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${escapeHtml(caseData.tier)}</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Charge:</strong> ${escapeHtml(caseData.charge_type || "N/A")}</p>
      <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${escapeHtml(caseId)}</p>
    </div>
    ${renderEvalScorecard(caseData.eval_results)}
    <p style="color: #A1A1AA;">This will send the delivery email to the customer and update case status to "delivered".</p>
    ${caseData.report_token ? `<p style="margin: 12px 0;"><a href="${origin}/report/${caseData.report_token}" style="color: #3B82F6; text-decoration: underline;">Preview Report</a></p>` : ""}
    <form method="POST" action="${origin}/api/deliver">
      <input type="hidden" name="token" value="${escapeHtml(token)}" />
      <input type="hidden" name="case" value="${escapeHtml(caseId)}" />
      <button type="submit" style="margin-top: 16px; padding: 14px 32px; background: #22C55E; color: white; font-weight: bold; border: none; border-radius: 8px; font-size: 16px; cursor: pointer;">
        Confirm Delivery
      </button>
    </form>
  </div>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}

// ================================================================
// POST: Actually deliver the report to the customer
// ================================================================
// This is the destructive action triggered by the operator clicking
// "Confirm Delivery" on the GET page above.
//
// Execution order (intentional):
//   1. Validate auth + fetch case data
//   2. Atomic claim: UPDATE status to "delivered" WHERE status = "review" (mutex)
//   3. Send delivery email to customer (with retry)
//   4. Record drip to prevent duplicate delivery emails from cron
//   5. Return confirmation HTML to operator
//
// The atomic-claim-before-email ordering prevents duplicate emails — see file-level JSDoc.
export async function POST(req: NextRequest) {
  // ──────────────────────────────────────────────────────────────
  // PARSE INPUT: Support both form-encoded (from GET page button)
  // and JSON (from programmatic API calls)
  // ──────────────────────────────────────────────────────────────
  let token: string | null = null;
  let caseId: string | null = null;

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    // From the HTML form on the GET confirmation page
    const formData = await req.formData();
    token = formData.get("token") as string | null;
    caseId = formData.get("case") as string | null;
  } else {
    // From a programmatic JSON API call (e.g., curl or future automation)
    const body = await req.json().catch(() => ({}));
    token = body.token || null;
    caseId = body.case || body.caseId || null;
  }

  // ──────────────────────────────────────────────────────────────
  // AUTH: Operator token validation (raw secret or signed token)
  // ──────────────────────────────────────────────────────────────
  if (!process.env.OPERATOR_SECRET || !token) {
    return new NextResponse(
      "<h1>Unauthorized</h1><p>Invalid operator token.</p>",
      { status: 401, headers: { "Content-Type": "text/html" } }
    );
  }

  if (!caseId) {
    return new NextResponse(
      "<h1>Missing case ID</h1>",
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }

  // Accept raw OPERATOR_SECRET (curl) or HMAC-signed token (email links)
  const isRawSecretPost = token === process.env.OPERATOR_SECRET;
  const isSignedTokenPost = !isRawSecretPost && verifyOperatorToken(token, caseId);
  if (!isRawSecretPost && !isSignedTokenPost) {
    return new NextResponse(
      "<h1>Unauthorized</h1><p>Invalid or expired operator token.</p>",
      { status: 401, headers: { "Content-Type": "text/html" } }
    );
  }

  const supabase = createAdminClient();
  const origin = getOrigin(req);

  // ──────────────────────────────────────────────────────────────
  // FETCH FULL CASE DATA (need all fields for email + status update)
  // ──────────────────────────────────────────────────────────────
  const { data: caseData, error: caseError } = await supabase
    .from("cases")
    .select("*")
    .eq("id", caseId)
    .single();

  if (caseError || !caseData) {
    return new NextResponse(
      "<h1>Case not found</h1>",
      { status: 404, headers: { "Content-Type": "text/html" } }
    );
  }

  const now = new Date().toISOString();

  // ──────────────────────────────────────────────────────────────
  // ATOMIC DELIVERY GUARD: Claim the case for delivery
  // ──────────────────────────────────────────────────────────────
  // Uses a conditional UPDATE (eq status "review") as a database-level
  // mutex. Only one concurrent POST can win this UPDATE — the loser
  // gets null back and returns early. This prevents the TOCTOU race
  // where two requests both pass a bare status check and both send
  // delivery emails.
  //
  // The UPDATE is placed BEFORE the email send so that duplicate
  // requests are rejected before any emails go out.
  // E3: Set report token expiry to 12 months from now
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const { data: deliverGuard } = await supabase
    .from("cases")
    .update({
      status: "delivered",
      delivered_at: now,
      reviewed_by: "operator",
      reviewed_at: now,
      deliverable_url: `${getOrigin(req)}/report/${caseData.report_token || ""}`,
      updated_at: now,
      report_token_expires_at: expiresAt.toISOString(),
    })
    .eq("id", caseId)
    .eq("status", "review")
    .select("id")
    .single();

  if (!deliverGuard) {
    // Case was not in "review" status — either already delivered or not ready
    if (caseData.status === "delivered") {
      return new NextResponse(
        `<h1>Already Delivered</h1><p>This case was already delivered to ${escapeHtml(caseData.email)}.</p>`,
        { status: 200, headers: { "Content-Type": "text/html" } }
      );
    }
    return new NextResponse(
      `<h1>Case not in review status</h1><p>Current status: ${escapeHtml(caseData.status)}</p>`,
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }
  // B11: Validate report_token is a UUID before interpolating into HTML
  const reportToken = caseData.report_token;
  if (!reportToken || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportToken)) {
    return new NextResponse(
      "<h1>Invalid report token</h1><p>Case has no valid report token.</p>",
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }
  const reportUrl = `${origin}/report/${reportToken}`;

  // ──────────────────────────────────────────────────────────────
  // PERSONALIZATION: Get customer's first name from linked intake
  // ──────────────────────────────────────────────────────────────
  let firstName = "there";
  if (caseData.intake_id) {
    const { data: intake } = await supabase
      .from("intakes")
      .select("first_name")
      .eq("id", caseData.intake_id)
      .single();
    if (intake) firstName = intake.first_name;
  }

  // ──────────────────────────────────────────────────────────────
  // STEP 2: SEND DELIVERY EMAIL (after atomic status claim)
  // ──────────────────────────────────────────────────────────────
  // The status was already atomically updated to "delivered" by the
  // guard above. This prevents duplicate emails from concurrent
  // requests (the guard is the mutex, not the email send).
  // If the email fails, the report URL still works and the operator
  // is alerted to forward it manually.
  //
  // The email includes:
  //   - Report view link (primary CTA)
  //   - Usage instructions (print, priority questions, document answers)
  //   - Upgrade upsell (100% credit toward higher tiers within 12 months)
  const tierName = TIER_NAMES[caseData.tier] || "Case Decoder";
  const emailResult = await sendEmail({
    to: caseData.email,
    subject: `Your ${tierName} Report is Ready`,
    unsubscribeEmail: caseData.email,
    html: `
      <h1 style="color: #F59E0B;">Your ${escapeHtml(tierName)} Report is Ready</h1>
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>Your personalized ${escapeHtml(tierName)} report is ready to view. It contains targeted questions, communication tools, and a clear picture of where things stand — built specifically from your case details.</p>
      <a href="${reportUrl}" style="display: inline-block; margin: 24px 0; padding: 16px 32px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">View Your Report</a>
      <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
        <p style="margin: 0; color: white; font-weight: bold;">How to use your report:</p>
        <ol style="color: #D4D4D8; padding-left: 20px; margin-top: 12px;">
          <li style="margin-bottom: 8px;"><strong style="color: white;">Print it</strong> and bring it to your next attorney meeting</li>
          <li style="margin-bottom: 8px;"><strong style="color: white;">Start with the 5 Priority Questions</strong> in "Questions for Your Attorney" — if you only ask one, ask the Golden Question</li>
          <li style="margin-bottom: 8px;"><strong style="color: white;">Send the email</strong> from "Exactly What to Say" — it's already written for you, just copy-paste and hit send</li>
          <li style="margin-bottom: 8px;"><strong style="color: white;">Follow Your Next 7 Days</strong> — one simple action per day, starting with sending that email</li>
        </ol>
      </div>
      <div style="background: #1C1917; padding: 16px; border-radius: 8px; margin-top: 24px;">
        <p style="margin: 0; color: #F59E0B; font-weight: bold;">Ready to go deeper?</p>
        <p style="margin: 8px 0 0; color: #D4D4D8;">Your $197 is credited toward any higher tier within 12 months. <a href="${origin}/services" style="color: #F59E0B;">View upgrade options</a></p>
      </div>
    `,
  });

  let customerNotified = true;

  // ──────────────────────────────────────────────────────────────
  // STEP 1b: RETRY with simplified email if first attempt failed
  // ──────────────────────────────────────────────────────────────
  // The retry uses a much simpler HTML template — this helps if the
  // failure was due to email size or HTML complexity triggering spam
  // filters. If retry also fails, notify operator with the report URL
  // so they can forward it manually.
  if (!emailResult.success) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const retryResult = await sendEmail({
      to: caseData.email,
      subject: `Your ${tierName} Report is Ready`,
      unsubscribeEmail: caseData.email,
      html: `<h1 style="color: #F59E0B;">Your Report is Ready</h1>
        <p>View your ${escapeHtml(tierName)} report: <a href="${reportUrl}" style="color: #F59E0B;">${reportUrl}</a></p>`,
    });
    if (!retryResult.success) {
      // ── OPERATOR FALLBACK: Both email attempts failed ──
      // Mark customerNotified=false so the operator knows to send manually.
      // The case will still be marked "delivered" so the report URL works —
      // the operator just needs to get the URL to the customer another way.
      customerNotified = false;
      await sendEmail({
        to: OPERATOR_EMAIL,
        subject: `ALERT: Delivery email failed for ${escapeHtml(caseData.email)}`,
        html: `<p>Delivery email failed after 2 attempts.</p>
          <p><strong>Customer:</strong> ${escapeHtml(caseData.email)}</p>
          <p><strong>Report URL:</strong> ${reportUrl}</p>
          <p>Case status is updated to 'delivered' but customer was <strong>NOT notified</strong>. Please send the report link manually.</p>`,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // NOTE: Case status was already updated to "delivered" by the
  // atomic guard above (before email send). This prevents the
  // TOCTOU race where two concurrent POSTs both send emails.
  // ──────────────────────────────────────────────────────────────

  // ──────────────────────────────────────────────────────────────
  // STEP 3: RECORD DRIP to prevent duplicate delivery emails
  // ──────────────────────────────────────────────────────────────
  // The cron (/api/cron/drip Part 2) sends post-purchase emails based
  // on the drip_emails table. Without this record, the cron would see
  // "post_case_decoder_delivery" as unsent and re-send it.
  // Uses upsert with onConflict to be idempotent if delivery is
  // somehow triggered twice.
  // C2: Auto-create subscriber record for non-subscriber buyers to prevent
  // duplicate delivery emails from the cron (which needs a subscriber FK).
  const { data: subData } = await supabase
    .from("subscribers")
    .upsert(
      { email: caseData.email.toLowerCase(), source: `purchase-${caseData.tier}` },
      { onConflict: "email" }
    )
    .select("id")
    .single();

  if (subData?.id) {
    await supabase.from("drip_emails").upsert(
      { subscriber_id: subData.id, email_key: `post_${caseData.tier.replace(/-/g, "_")}_delivery` },
      { onConflict: "subscriber_id,email_key" }
    );
  }

  // ──────────────────────────────────────────────────────────────
  // STEP 4: RETURN CONFIRMATION HTML to operator
  // ──────────────────────────────────────────────────────────────
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head><title>Report Delivered</title></head>
<body style="font-family: Arial, sans-serif; background: #0C0A09; color: #D4D4D8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0;">
  <div style="text-align: center; max-width: 500px; padding: 32px;">
    <div style="font-size: 48px; margin-bottom: 16px;">&#10003;</div>
    <h1 style="color: #22C55E;">Report Delivered</h1>
    <p>Delivery email sent to <strong style="color: white;">${escapeHtml(caseData.email)}</strong></p>
    <p>Report URL: <a href="${reportUrl}" style="color: #F59E0B;">${reportUrl}</a></p>
    <p style="margin-top: 24px; color: #71717A;">Case ID: ${escapeHtml(caseId)}</p>
  </div>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}
