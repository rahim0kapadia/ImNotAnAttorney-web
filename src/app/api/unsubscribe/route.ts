/**
 * @fileoverview CAN-SPAM Compliant Unsubscribe Endpoint
 *
 * Handles email unsubscribe requests via two flows:
 *
 *   1. GET  /api/unsubscribe?email=<base64> --> Confirmation page (no state change)
 *   2. POST /api/unsubscribe              --> Processes the actual unsubscribe
 *
 * This two-step design exists because:
 * - Email clients (Gmail, Outlook) often prefetch links in emails. If GET
 *   triggered the unsubscribe, users would be auto-unsubscribed by their
 *   email client without clicking anything. GET is safe -- it only shows
 *   a confirmation page.
 * - POST handles both the confirmation form submission AND RFC 8058 one-click
 *   unsubscribe (used by Gmail's "Unsubscribe" button in the email header).
 *
 * Security considerations:
 * - Email addresses are base64-encoded in the URL parameter to prevent
 *   plaintext email addresses from appearing in URLs, server logs, and
 *   browser history. This is NOT encryption -- it's obfuscation.
 * - The decodeEmail() function validates the decoded result contains "@"
 *   to prevent HTML injection. Without this check, a crafted base64 string
 *   could decode to malicious HTML/JS that gets embedded in the confirmation
 *   page's hidden input field.
 * - The response always shows success regardless of whether the email exists
 *   in the database, to prevent email enumeration attacks.
 *
 * CAN-SPAM compliance:
 * - Every marketing email includes a List-Unsubscribe header pointing here
 * - Unsubscribe is processed within one request (no multi-step confirmation required by law)
 * - The GET confirmation page is a UX nicety, not a compliance requirement
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml } from "@/lib/email";

/**
 * Decodes a base64-encoded email parameter and validates it.
 *
 * The base64 encoding prevents plaintext emails from appearing in URLs and logs.
 * The "@" check serves double duty: it validates the decoded string is actually
 * an email, AND it prevents HTML injection (a malicious base64 payload like
 * `"><script>alert(1)</script>` would fail the "@" check).
 *
 * @param param - Base64-encoded email string from the URL query parameter
 * @returns The decoded email string, or null if decoding fails or result is not an email
 */
function decodeEmail(param: string): string | null {
  try {
    const email = Buffer.from(param, "base64").toString("utf-8");
    if (!email || !email.includes("@")) return null;
    return email;
  } catch {
    return null;
  }
}

// =============================================================================
// GET: SHOW CONFIRMATION PAGE
// This is safe for email prefetch -- it performs NO state change. Email clients
// like Gmail and Outlook may follow links in emails automatically (prefetch/
// link preview). If this GET handler actually unsubscribed the user, they'd be
// silently removed without consent. Instead, we show a confirmation form that
// requires an explicit POST to process the unsubscribe.
// =============================================================================

/**
 * Renders an inline HTML confirmation page asking the user to confirm unsubscribe.
 * No database writes occur -- this is a safe, idempotent GET request.
 *
 * @param req - Query params: email (base64-encoded)
 * @returns HTML page with a confirmation form that POSTs back to this endpoint
 */
export async function GET(req: NextRequest) {
  const emailParam = req.nextUrl.searchParams.get("email");

  if (!emailParam) {
    return NextResponse.redirect(
      new URL("/unsubscribe?error=missing", req.url)
    );
  }

  // Decode and validate -- reject if not a valid email format.
  // The emailParam (still base64) is passed to the form's hidden field,
  // NOT the decoded email, to maintain the obfuscation through the POST.
  const email = decodeEmail(emailParam);
  if (!email) {
    return NextResponse.redirect(
      new URL("/unsubscribe?error=invalid", req.url)
    );
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";

  // Inline HTML response -- no React rendering needed for this simple page.
  // The form POSTs back to /api/unsubscribe with the base64 email in a hidden field.
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head><title>Confirm Unsubscribe</title></head>
<body style="font-family: Arial, sans-serif; background: #0C0A09; color: #D4D4D8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0;">
  <div style="text-align: center; max-width: 400px; padding: 32px;">
    <h1 style="color: #F59E0B;">Unsubscribe</h1>
    <p>Are you sure you want to unsubscribe?</p>
    <p style="color: #A1A1AA; font-size: 14px;">You will stop receiving emails from ImNotAnAttorney.</p>
    <form method="POST" action="${origin}/api/unsubscribe">
      <input type="hidden" name="email" value="${escapeHtml(emailParam)}" />
      <button type="submit" style="margin-top: 16px; padding: 12px 32px; background: #EF4444; color: white; font-weight: bold; border: none; border-radius: 8px; font-size: 16px; cursor: pointer;">
        Confirm Unsubscribe
      </button>
    </form>
    <p style="margin-top: 16px;"><a href="${origin}" style="color: #F59E0B; text-decoration: underline;">Never mind, take me back</a></p>
  </div>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}

// =============================================================================
// POST: PROCESS UNSUBSCRIBE
// Handles two distinct sources:
//   1. Form submission from the GET confirmation page above
//   2. RFC 8058 one-click unsubscribe (Gmail's "Unsubscribe" header button)
//
// RFC 8058 one-click sends: POST with form body "List-Unsubscribe=One-Click"
// and the email in the URL query parameter (not the form body).
// =============================================================================

/**
 * Processes the unsubscribe by setting `unsubscribed_at` on the subscriber row.
 * Supports form-encoded (confirmation page + RFC 8058) and JSON body formats.
 *
 * @param req - Form body with email (base64), or RFC 8058 one-click format,
 *              or JSON body with email (base64)
 * @returns Redirect to /unsubscribe?success=true (always, to prevent email enumeration)
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  let emailParam: string | null = null;

  // Determine the email source based on content type and RFC 8058 detection
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await req.formData();
    // RFC 8058 one-click: Gmail sends "List-Unsubscribe=One-Click" in the body.
    // In this case, the email is in the URL query param, not the form body.
    const listUnsub = formData.get("List-Unsubscribe");
    if (listUnsub === "One-Click") {
      emailParam = req.nextUrl.searchParams.get("email");
    } else {
      // Standard form submission from the GET confirmation page
      emailParam = formData.get("email") as string | null;
    }
  } else {
    // JSON body fallback -- allows programmatic unsubscribe calls
    const body = await req.json().catch(() => ({}));
    emailParam = body.email || null;
  }

  if (!emailParam) {
    return NextResponse.redirect(
      new URL("/unsubscribe?error=missing", req.url)
    );
  }

  // Decode base64 and validate -- same decodeEmail() used by GET handler
  const email = decodeEmail(emailParam);
  if (!email) {
    return NextResponse.redirect(
      new URL("/unsubscribe?error=invalid", req.url)
    );
  }

  // =========================================================================
  // SOFT UNSUBSCRIBE
  // We set unsubscribed_at rather than deleting the row. This preserves the
  // subscriber record for analytics and allows re-subscription (the subscribe
  // endpoint clears unsubscribed_at on upsert). The drip email cron checks
  // for non-null unsubscribed_at to skip these subscribers.
  // =========================================================================
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("email", email.toLowerCase().trim());

  if (error) {
    console.error("[Unsubscribe] Supabase error:", error);
  }

  // Always redirect to success -- never reveal whether the email was found.
  // This prevents email enumeration (attacker testing if an email is subscribed).
  return NextResponse.redirect(new URL("/unsubscribe?success=true", req.url));
}
