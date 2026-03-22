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
 * Security: GET requires HMAC-signed token (no raw secret in URLs).
 *           POST accepts raw OPERATOR_SECRET in body or HMAC-signed token.
 * Status flow: review → delivered
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual, createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";
import type { EmailLogContext } from "@/lib/email";
import { verifyOperatorToken, signPhase2Token, caseThreadId } from "@/lib/site";
import { TIER_CORE, upgradePrice, tierDisplayName } from "@/lib/tiers";

/**
 * Timing-safe string comparison using HMAC-then-compare.
 * HMAC digests are always 32 bytes, eliminating the length oracle
 * that raw Buffer comparison would leak via early return.
 */
function safeCompare(a: string, b: string): boolean {
  const hmacA = createHmac("sha256", "inna-guard-compare").update(a).digest();
  const hmacB = createHmac("sha256", "inna-guard-compare").update(b).digest();
  return timingSafeEqual(hmacA, hmacB);
}

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
  // AUTH: Operator token validation (signed tokens only for GET)
  // ──────────────────────────────────────────────────────────────
  // GET only accepts HMAC-signed tokens (from email links — scoped to
  // caseId, 24h expiry). Raw OPERATOR_SECRET is NOT accepted in GET
  // because query strings are logged in browser history, server access
  // logs, and email link prefetch services.
  //
  // POST still accepts raw OPERATOR_SECRET (in form body or JSON) for
  // programmatic/curl access where the secret stays in the request body.
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

  // GET handler only accepts HMAC-signed tokens (not raw OPERATOR_SECRET).
  // Raw secrets in query strings are visible in browser history, server logs,
  // and email link preview services. Signed tokens are scoped to a specific
  // case and expire after 24 hours.
  if (!verifyOperatorToken(token, caseId)) {
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
      ${caseData.eval_results?.gate_passed === false
        ? `<button type="button" disabled style="margin-top: 16px; padding: 14px 32px; background: #7F1D1D; color: #FCA5A5; font-weight: bold; border: 2px solid #EF4444; border-radius: 8px; font-size: 16px; cursor: not-allowed; opacity: 0.8;">
            Delivery Blocked — UPL Gate Failed
          </button>
          <p style="margin-top: 8px; color: #EF4444; font-size: 13px;">Report cannot be delivered until evaluation issues are resolved and gate_passed is true.</p>`
        : `<button type="submit" style="margin-top: 16px; padding: 14px 32px; background: #22C55E; color: white; font-weight: bold; border: none; border-radius: 8px; font-size: 16px; cursor: pointer;">
            Confirm Delivery
          </button>`
      }
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
  // Uses timing-safe comparison to prevent response-time side-channel leaks.
  const isRawSecretPost = safeCompare(token, process.env.OPERATOR_SECRET!);
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
  // EVAL GATE HARD BLOCK: Prevent delivering UPL-failing reports
  // ──────────────────────────────────────────────────────────────
  // If eval_results exists and gate_passed is explicitly false, block
  // delivery. If eval_results is null (eval not run), allow delivery
  // with existing behavior (operator acknowledgment).
  //
  // IMPORTANT: This check runs BEFORE the atomic status claim below.
  // Previously it was after the claim, which left the case in "delivered"
  // status even when the gate blocked delivery — an inconsistent state.
  if (caseData.eval_results?.gate_passed === false) {
    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head><title>Delivery Blocked</title></head>
<body style="font-family: Arial, sans-serif; background: #0C0A09; color: #D4D4D8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0;">
  <div style="text-align: center; max-width: 500px; padding: 32px;">
    <div style="font-size: 48px; margin-bottom: 16px; color: #EF4444;">&#10007;</div>
    <h1 style="color: #EF4444;">Delivery Blocked — UPL Gate Failed</h1>
    <p>This report cannot be delivered because the evaluation gate failed. The report may contain UPL violations that must be resolved before delivery.</p>
    <p style="margin-top: 16px; color: #71717A;">Case ID: ${escapeHtml(caseId)}</p>
    <p style="margin-top: 8px; color: #71717A;">Fix the report, re-run evaluation, and ensure gate_passed is true before attempting delivery.</p>
  </div>
</body>
</html>`,
      { status: 403, headers: { "Content-Type": "text/html" } }
    );
  }

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
  const tierName = tierDisplayName(caseData.tier);
  const isIncluded = caseData.is_included_deliverable === true;

  // Look up parent tier for included deliverables (e.g., CD included with IB)
  // so the email subject says "Intelligence Brief Package" not "Case Decoder Package"
  let parentTierName = tierName;
  if (isIncluded && caseData.parent_order_id) {
    const { data: parentOrder } = await supabase
      .from("orders")
      .select("tier")
      .eq("id", caseData.parent_order_id)
      .single();
    if (parentOrder) {
      parentTierName = tierDisplayName(parentOrder.tier);
    }
  }

  // Tier-specific delivery email instructions
  let instructionsHtml: string;
  let upgradeHtml: string;

  if (caseData.tier === "intelligence-brief") {
    instructionsHtml = `
      <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
        <p style="margin: 0; color: white; font-weight: bold;">How to use your Intelligence Brief:</p>
        <ol style="color: #D4D4D8; padding-left: 20px; margin-top: 12px;">
          <li style="margin-bottom: 8px;"><strong style="color: white;">Start with the 48-Hour Priority List</strong> — three actions ranked by urgency</li>
          <li style="margin-bottom: 8px;"><strong style="color: white;">Read the Case Progress Score</strong> in Section 2 — understand where communication stands</li>
          <li style="margin-bottom: 8px;"><strong style="color: white;">Review the 10-15 questions in Appendix D</strong> — pick your top 5 for your next attorney meeting</li>
          <li style="margin-bottom: 8px;"><strong style="color: white;">Use the Meeting Ready Sheet</strong> in Section 6 — bring it to your next appointment</li>
        </ol>
      </div>`;
    upgradeHtml = `
      <div style="background: #1C1917; padding: 16px; border-radius: 8px; margin-top: 24px;">
        <p style="margin: 0; color: #F59E0B; font-weight: bold;">When you get discovery — we're ready.</p>
        <p style="margin: 8px 0 0; color: #D4D4D8;">Your ${TIER_CORE["intelligence-brief"].priceDisplay} is credited toward ${TIER_CORE["x-ray"].name} (${TIER_CORE["x-ray"].priceDisplay}). Pay only ${upgradePrice("intelligence-brief")}. <a href="${origin}/services" style="color: #F59E0B;">View upgrade options</a></p>
      </div>`;
  } else if (caseData.tier === "x-ray") {
    // Fetch analysis results for template variables
    let docCount = 0;
    let redFlagCount = 0;
    let questionCount = 0;
    let discoveryScore = "—";
    const { data: analysisData } = await supabase
      .from("case_analysis_results")
      .select("red_flag_count, discovery_health_score")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (analysisData) {
      redFlagCount = analysisData.red_flag_count || 0;
      discoveryScore = analysisData.discovery_health_score != null ? String(analysisData.discovery_health_score) : "—";
    }
    // Count discovery documents
    const { count: docCountResult } = await supabase
      .from("discovery_documents")
      .select("*", { count: "exact", head: true })
      .eq("case_id", caseId);
    docCount = docCountResult || caseData.file_urls?.length || 0;
    // Estimate question count from findings
    questionCount = Math.max(35, redFlagCount * 3);

    instructionsHtml = `
      <h2 style="color: #F59E0B; margin-top: 32px;">Your X-Ray Discovery Analysis Is Ready</h2>
      <p>We analyzed <strong>${docCount} discovery document${docCount !== 1 ? "s" : ""}</strong> and found:</p>
      <ul>
        <li><strong>${redFlagCount} red flag${redFlagCount !== 1 ? "s" : ""}</strong> — issues in the prosecution's evidence that deserve attention</li>
        <li><strong>${questionCount}+ targeted questions</strong> — specific questions for your next attorney meeting</li>
        <li><strong>Discovery Strength Rating: ${escapeHtml(discoveryScore)}/100</strong> — how complete your discovery is</li>
      </ul>
      <h3 style="color: #E5E5E5;">How to Use This Report</h3>
      <ol style="color: #D4D4D8; padding-left: 20px;">
        <li style="margin-bottom: 8px;"><strong style="color: white;">Read the Executive Summary</strong> (page 1) — your case at a glance</li>
        <li style="margin-bottom: 8px;"><strong style="color: white;">Review the Top 3 Findings</strong> (page 2) — hand this page to your attorney</li>
        <li style="margin-bottom: 8px;"><strong style="color: white;">Bring the "If You Only Have 15 Minutes" questions</strong> to your next attorney meeting</li>
        <li style="margin-bottom: 8px;"><strong style="color: white;">Share relevant sections</strong> with your attorney — especially the Red Flags</li>
      </ol>
      <p style="color: #71717A;">This is your Attorney Meeting Prep Kit. Schedule a meeting with your attorney within the next 7 days while findings are current.</p>`;
    upgradeHtml = `
      <div style="background: #1C1917; padding: 16px; border-radius: 8px; margin-top: 24px;">
        <p style="margin: 0; color: #F59E0B; font-weight: bold;">Need deeper investigation?</p>
        <p style="margin: 8px 0 0; color: #D4D4D8;">Your ${TIER_CORE["x-ray"].priceDisplay} is credited toward ${TIER_CORE["war-room"].name} (${TIER_CORE["war-room"].priceDisplay}). Pay only ${upgradePrice("x-ray")}. Witness dossiers, judge intelligence, and weekly updates. <a href="${origin}/services#war-room" style="color: #F59E0B;">Learn more</a></p>
      </div>`;
  } else {
    // Case Decoder (default)
    instructionsHtml = `
      <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
        <p style="margin: 0; color: white; font-weight: bold;">How to use your report:</p>
        <ol style="color: #D4D4D8; padding-left: 20px; margin-top: 12px;">
          <li style="margin-bottom: 8px;"><strong style="color: white;">Print it</strong> and bring it to your next attorney meeting</li>
          <li style="margin-bottom: 8px;"><strong style="color: white;">Start with the 5 Priority Questions</strong> in "Questions for Your Attorney" — if you only ask one, ask the Golden Question</li>
          <li style="margin-bottom: 8px;"><strong style="color: white;">Send the email</strong> from "Exactly What to Say" — it's already written for you, just copy-paste and hit send</li>
          <li style="margin-bottom: 8px;"><strong style="color: white;">Follow Your Next 7 Days</strong> — one simple action per day, starting with sending that email</li>
        </ol>
      </div>`;
    // Skip upgrade CTA if this is an included deliverable (customer already bought higher tier)
    upgradeHtml = isIncluded ? "" : `
      <div style="background: #1C1917; padding: 16px; border-radius: 8px; margin-top: 24px;">
        <p style="margin: 0; color: #F59E0B; font-weight: bold;">Ready to go deeper?</p>
        <p style="margin: 8px 0 0; color: #D4D4D8;">Your ${TIER_CORE["case-decoder"].priceDisplay} is credited toward any higher tier within 12 months. <a href="${origin}/services" style="color: #F59E0B;">View upgrade options</a></p>
      </div>`;
  }

  // For included deliverables, adjust the subject and intro
  const emailSubject = isIncluded
    ? `Part 1 of Your ${escapeHtml(parentTierName)} Package is Ready — Your Case Decoder Report`
    : `Your ${tierName} Report is Ready`;

  const deliveryLogContext: EmailLogContext = { category: "delivery", case_id: caseId! };
  const emailResult = await sendEmail({
    to: caseData.email,
    subject: emailSubject,
    unsubscribeEmail: caseData.email,
    threadingHeaders: {
      inReplyTo: caseThreadId(caseId!),
      references: caseThreadId(caseId!),
    },
    html: `
      <h1 style="color: #F59E0B;">${isIncluded ? `Part 1 of Your ${escapeHtml(parentTierName)} Package` : `Your ${escapeHtml(tierName)} Report`} is Ready</h1>
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>Your personalized ${escapeHtml(tierName)} report is ready to view. It contains targeted questions, communication tools, and a clear picture of where things stand — built specifically from your case details.</p>
      <a href="${reportUrl}" style="display: inline-block; margin: 24px 0; padding: 16px 32px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">View Your Report</a>
      ${instructionsHtml}
      ${upgradeHtml}
    `,
  }, deliveryLogContext);

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
      threadingHeaders: {
        inReplyTo: caseThreadId(caseId!),
        references: caseThreadId(caseId!),
      },
      html: `<h1 style="color: #F59E0B;">Your Report is Ready</h1>
        <p>View your ${escapeHtml(tierName)} report: <a href="${reportUrl}" style="color: #F59E0B;">${reportUrl}</a></p>`,
    }, { category: "delivery-retry", case_id: caseId! });
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
      }, { category: "operator-alert", case_id: caseId!, metadata: { reason: "delivery-failed" } });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // NOTE: Case status was already updated to "delivered" by the
  // atomic guard above (before email send). This prevents the
  // TOCTOU race where two concurrent POSTs both send emails.
  // ──────────────────────────────────────────────────────────────

  // ──────────────────────────────────────────────────────────────
  // PHASE 2 TRIGGER: When delivering an included CD, notify
  // customer about the next step for their higher-tier product
  // ──────────────────────────────────────────────────────────────
  // If this is an is_included_deliverable case (e.g., CD included
  // with an IB purchase), find sibling cases on the same order
  // that are still awaiting intake and send Phase 2 intake emails.
  if (caseData.is_included_deliverable && caseData.order_id) {
    const { data: siblingCases } = await supabase
      .from("cases")
      .select("id, tier, status")
      .eq("order_id", caseData.order_id)
      .neq("id", caseId)
      .in("status", ["awaiting-intake", "intake"]);

    if (siblingCases && siblingCases.length > 0) {
      for (const sibling of siblingCases) {
        const siblingTierName = tierDisplayName(sibling.tier);
        // Send Phase 2 intake email for IB+ tiers
        // Both awaiting-intake (hasn't filled standard intake yet) and intake
        // (filled standard intake before payment) need Phase 2 details.
        if (sibling.tier === "intelligence-brief" && (sibling.status === "awaiting-intake" || sibling.status === "intake")) {
          await sendEmail({
            to: caseData.email,
            subject: `Your Case Decoder is Ready — Next: Complete Your ${siblingTierName} Details`,
            unsubscribeEmail: caseData.email,
            threadingHeaders: {
              inReplyTo: caseThreadId(sibling.id),
              references: caseThreadId(sibling.id),
            },
            html: `
              <h1 style="color: #F59E0B;">Part 1 Complete: Your Case Decoder Report</h1>
              <p>Hi ${escapeHtml(firstName)},</p>
              <p>Your Case Decoder report is ready — <a href="${reportUrl}" style="color: #F59E0B;">view it here</a>.</p>
              <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
                <p style="margin: 0; color: white; font-weight: bold;">Next Step: Complete Your ${escapeHtml(siblingTierName)}</p>
                <p style="margin: 8px 0 0; color: #D4D4D8;">Your ${escapeHtml(siblingTierName)} includes judge intelligence, motion landscape analysis, and 10-15 targeted questions — but we need a few more details about your case.</p>
                <a href="${origin}/intake/intelligence-brief?case=${sibling.id}&token=${signPhase2Token(sibling.id)}" style="display: inline-block; margin-top: 16px; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Complete Intelligence Brief Details</a>
              </div>
              <p style="color: #A1A1AA;">This takes about 3-5 minutes. Your full ${escapeHtml(siblingTierName)} will be delivered within 72 hours after you complete this form.</p>
            `,
          }, { category: "phase2-intake", case_id: sibling.id, metadata: { tier: sibling.tier } });

          // Set prior_case_id on the IB case pointing to the delivered CD case
          // so the IB pipeline can fetch prior CD context directly
          await supabase
            .from("cases")
            .update({ prior_case_id: caseId, updated_at: new Date().toISOString() })
            .eq("id", sibling.id);
        }
      }
    }
  }

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
    const dripKey = `post_${caseData.tier.replace(/-/g, "_")}_delivery`;
    await supabase.from("drip_emails").upsert(
      { subscriber_id: subData.id, email_key: dripKey },
      { onConflict: "subscriber_id,email_key" }
    );
    // For included deliverables, also record that the included delivery drip was sent
    // so the cron doesn't re-send it
    if (isIncluded) {
      await supabase.from("drip_emails").upsert(
        { subscriber_id: subData.id, email_key: `included_${dripKey}` },
        { onConflict: "subscriber_id,email_key" }
      );
    }
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
