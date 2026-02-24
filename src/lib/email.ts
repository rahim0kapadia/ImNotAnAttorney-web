/**
 * @fileoverview Email sending via the Resend API.
 *
 * Handles all outbound transactional emails (welcome, delivery, drip, operator alerts).
 * Every email includes CAN-SPAM compliance elements:
 *   - Physical mailing address in the footer (required by 15 U.S.C. 7704)
 *   - Unsubscribe link visible in the email body
 *   - RFC 8058 List-Unsubscribe + List-Unsubscribe-Post headers for one-click
 *     unsubscribe in email clients that support it (Gmail, Apple Mail, etc.)
 *
 * Security: All user-supplied strings rendered in HTML are passed through
 * {@link escapeHtml} before interpolation to prevent XSS / HTML injection.
 *
 * Graceful degradation: If RESEND_API_KEY is not set (e.g., local dev, preview
 * deploys), sendEmail() logs a warning and returns an error result instead of
 * throwing, so callers do not need try/catch around missing config.
 */

// ============================================================
// HTML ESCAPING
// ============================================================

/**
 * Escapes HTML special characters to prevent XSS / HTML injection.
 * Applied to all user-supplied values (names, email addresses, charge types)
 * before they are interpolated into email HTML templates.
 *
 * @param str - Raw string that may contain HTML-special characters.
 * @returns The string with &, <, >, ", and ' replaced by HTML entities.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================================================
// CONFIGURATION
// ============================================================

/**
 * Resend API key — read once at module load.
 * If missing, sendEmail() gracefully degrades: logs a warning and returns
 * { success: false } instead of crashing. This allows local dev and preview
 * deploys to function without email credentials.
 */
const RESEND_API_KEY = process.env.RESEND_API_KEY;

/** Sender address shown in the "From" field of all outbound emails. */
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "noreply@imnotanattorney.com";

/**
 * CAN-SPAM required physical mailing address.
 * Shown in the footer of every customer-facing email per 15 U.S.C. 7704.
 * Also duplicated in the edge function (supabase/functions/generate-report)
 * because that Deno environment cannot import from Next.js modules.
 */
const PHYSICAL_ADDRESS = "195 Dr MLK Jr St N, St Petersburg, FL 33701";

// ============================================================
// TYPES
// ============================================================

/** Parameters for sending a single email via Resend. */
interface EmailParams {
  /** Recipient email address. */
  to: string;
  /** Email subject line. */
  subject: string;
  /** Inner HTML content (will be wrapped in the branded dark-theme template). */
  html: string;
  /**
   * If provided, generates an unsubscribe link in the footer and adds
   * RFC 8058 List-Unsubscribe / List-Unsubscribe-Post headers.
   * The email is base64-encoded in the URL to prevent casual scraping.
   * Omit for operator/internal emails that should not have unsubscribe.
   */
  unsubscribeEmail?: string;
}

/** Result returned by sendEmail — always resolves (never throws). */
interface EmailResult {
  /** Whether the Resend API accepted the email. */
  success: boolean;
  /** Resend message ID on success. */
  id?: string;
  /** Human-readable error message on failure. */
  error?: string;
}

// ============================================================
// SEND EMAIL
// ============================================================

/**
 * Sends a transactional email via the Resend API.
 *
 * The provided `html` is wrapped in a branded dark-theme template that
 * includes the CAN-SPAM footer (business name, disclaimer, physical address,
 * and optional unsubscribe link). Callers only need to supply the inner content.
 *
 * Graceful degradation: If RESEND_API_KEY is not configured, this function
 * logs a warning and returns `{ success: false, error: "..." }` instead of
 * throwing, so the calling API route can still return a meaningful response.
 *
 * @param params - Email parameters (recipient, subject, HTML body, optional unsubscribe).
 * @returns A result object indicating success or failure. Never throws.
 */
export async function sendEmail(params: EmailParams): Promise<EmailResult> {
  // Graceful degradation: allow the app to run without email credentials
  if (!RESEND_API_KEY) {
    console.warn("[Email] RESEND_API_KEY not configured, skipping email");
    return { success: false, error: "Email service not configured" };
  }

  // Build unsubscribe URL using env var so preview deploys point to the right host.
  // The email is base64-encoded in the query string to prevent casual scraping.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
  const unsubscribeUrl = params.unsubscribeEmail
    ? `${siteUrl}/api/unsubscribe?email=${Buffer.from(params.unsubscribeEmail).toString("base64")}`
    : null;

  const unsubscribeHtml = unsubscribeUrl
    ? `<p style="margin: 8px 0 0;"><a href="${unsubscribeUrl}" style="color: #71717A; text-decoration: underline;">Unsubscribe</a></p>`
    : "";

  // RFC 8058 one-click unsubscribe headers.
  // List-Unsubscribe: URL wrapped in angle brackets per RFC 2369.
  // List-Unsubscribe-Post: signals to email clients (Gmail, Apple Mail) that
  // they can unsubscribe with a single POST request without opening a browser.
  const headers: Record<string, string> = {};
  if (unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [params.to],
        subject: params.subject,
        reply_to: process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com",
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0C0A09; color: #D4D4D8; padding: 32px;">
            ${params.html}
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #27272A; font-size: 12px; color: #71717A; text-align: center;">
              <p style="margin: 0 0 8px;">ImNotAnAttorney</p>
              <p style="margin: 0;">Legal information and research services — not legal advice.</p>
              <p style="margin: 4px 0 0; font-size: 11px; color: #52525B;">${PHYSICAL_ADDRESS}</p>
              ${unsubscribeHtml}
            </div>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to send email");
    }

    const data = await response.json();
    return { success: true, id: data.id };
  } catch (error) {
    console.error("[Email] Failed to send:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email",
    };
  }
}

// ============================================================
// SEND EMAIL WITH RETRY
// ============================================================

/**
 * Sends an email with one automatic retry after a 2-second delay.
 * If both attempts fail, logs the error but does NOT send an operator alert
 * (callers in the cron use this for batch sends where individual failures
 * are tallied in the errors counter and summarized at the end).
 *
 * @param params - Email parameters (to, subject, html, etc.)
 * @returns The result of the last send attempt. Never throws.
 */
export async function sendEmailWithRetry(
  params: EmailParams
): Promise<EmailResult> {
  const result = await sendEmail(params);
  if (result.success) return result;

  // First attempt failed — wait 2s and retry (transient Resend API errors)
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const retry = await sendEmail(params);
  if (!retry.success) {
    console.error(
      `[Email] Failed after retry: to=${params.to} subject="${params.subject}"`,
      retry.error
    );
  }
  return retry;
}
