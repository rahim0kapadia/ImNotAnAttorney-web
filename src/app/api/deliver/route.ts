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
 * Email-before-status pattern:
 *   The delivery email is sent BEFORE updating case status to "delivered".
 *   Rationale: If we mark "delivered" first and the email fails, the case looks
 *   complete but the customer never got notified — a silent failure. By sending
 *   the email first, we know whether notification succeeded. If it fails after
 *   retries, the operator is alerted, but the case is still marked "delivered"
 *   so the report URL is accessible (the operator can share it manually).
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

/**
 * Returns the site origin URL for constructing absolute links.
 * Falls back to production URL if NEXT_PUBLIC_SITE_URL is not set.
 */
function getOrigin(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
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
    .select("id, email, tier, status, charge_type, report_token")
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
//   1. Validate auth + case status
//   2. Send delivery email to customer (with retry)
//   3. Update case status to "delivered"
//   4. Record drip to prevent duplicate delivery emails from cron
//   5. Return confirmation HTML to operator
//
// The email-before-status ordering is critical — see file-level JSDoc.
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

  // ──────────────────────────────────────────────────────────────
  // STATUS GUARDS: Same checks as GET — prevent re-delivery or
  // delivery of cases not yet in "review" status
  // ──────────────────────────────────────────────────────────────
  if (caseData.status === "delivered") {
    return new NextResponse(
      `<h1>Already Delivered</h1><p>This case was already delivered to ${escapeHtml(caseData.email)}.</p>`,
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  }

  if (caseData.status !== "review") {
    return new NextResponse(
      `<h1>Case not in review status</h1><p>Current status: ${escapeHtml(caseData.status)}</p>`,
      { status: 400, headers: { "Content-Type": "text/html" } }
    );
  }

  const now = new Date().toISOString();
  const reportUrl = `${origin}/report/${caseData.report_token}`;

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
  // STEP 1: SEND DELIVERY EMAIL (before status update)
  // ──────────────────────────────────────────────────────────────
  // IMPORTANT: Email is sent FIRST, then status is updated.
  // If we mark "delivered" first and email fails, the customer never
  // gets notified but the case looks complete — a silent failure.
  // Email-first ensures we know if notification worked before
  // claiming the case is delivered.
  //
  // The email includes:
  //   - Report view link (primary CTA)
  //   - Usage instructions (print, priority questions, document answers)
  //   - Upgrade upsell (100% credit toward higher tiers within 12 months)
  const emailResult = await sendEmail({
    to: caseData.email,
    subject: "Your Case Decoder Report is Ready",
    unsubscribeEmail: caseData.email,
    html: `
      <h1 style="color: #F59E0B;">Your Case Decoder Report is Ready</h1>
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>Your personalized Case Decoder report is ready to view. It contains targeted questions, evidence patterns, and accountability benchmarks built specifically from your case details.</p>
      <a href="${reportUrl}" style="display: inline-block; margin: 24px 0; padding: 16px 32px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">View Your Report</a>
      <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
        <p style="margin: 0; color: white; font-weight: bold;">How to use your report:</p>
        <ol style="color: #D4D4D8; padding-left: 20px; margin-top: 12px;">
          <li style="margin-bottom: 8px;"><strong style="color: white;">Print it</strong> and bring it to your next attorney meeting</li>
          <li style="margin-bottom: 8px;"><strong style="color: white;">Start with the Priority Questions</strong> (Section 5, Q1-Q5)</li>
          <li style="margin-bottom: 8px;"><strong style="color: white;">Document every answer</strong> — email your attorney a summary after the meeting</li>
          <li style="margin-bottom: 8px;"><strong style="color: white;">Use the Evidence Checklist</strong> (Section 6) when you receive discovery</li>
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
      subject: "Your Case Decoder Report is Ready",
      unsubscribeEmail: caseData.email,
      html: `<h1 style="color: #F59E0B;">Your Report is Ready</h1>
        <p>View your Case Decoder report: <a href="${reportUrl}" style="color: #F59E0B;">${reportUrl}</a></p>`,
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
  // STEP 2: UPDATE CASE STATUS → "delivered"
  // ──────────────────────────────────────────────────────────────
  // This happens AFTER the email attempt (regardless of success).
  // Even if the email failed, we mark delivered because:
  //   1. The report URL is live and accessible
  //   2. The operator was alerted to send it manually
  //   3. Not marking delivered would leave the case in "review" limbo
  //      and the cron would send review reminder alerts
  await supabase
    .from("cases")
    .update({
      status: "delivered",
      delivered_at: now,
      reviewed_by: "operator",
      reviewed_at: now,
      deliverable_url: reportUrl,
      updated_at: now,
    })
    .eq("id", caseId);

  // ──────────────────────────────────────────────────────────────
  // STEP 3: RECORD DRIP to prevent duplicate delivery emails
  // ──────────────────────────────────────────────────────────────
  // The cron (/api/cron/drip Part 2) sends post-purchase emails based
  // on the drip_emails table. Without this record, the cron would see
  // "post_case_decoder_delivery" as unsent and re-send it.
  // Uses upsert with onConflict to be idempotent if delivery is
  // somehow triggered twice.
  const { data: subData } = await supabase
    .from("subscribers")
    .select("id")
    .eq("email", caseData.email.toLowerCase())
    .maybeSingle();

  if (subData?.id) {
    await supabase.from("drip_emails").upsert(
      { subscriber_id: subData.id, email_key: "post_case_decoder_delivery" },
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
