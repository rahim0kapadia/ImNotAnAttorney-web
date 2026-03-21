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

// PHYSICAL_ADDRESS imported from @/lib/site (CAN-SPAM compliance).
// Also duplicated in supabase/functions/generate-report (Deno can't import Next.js modules).

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
  /** RFC 2822 threading headers for email conversation grouping. */
  threadingHeaders?: {
    messageId?: string;
    inReplyTo?: string;
    references?: string;
  };
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

/** Optional context for the email audit log. When provided, a row is inserted
 *  into the email_log table after each send attempt (fire-and-forget). */
export interface EmailLogContext {
  /** Category tag, e.g. "payment-confirmation", "delivery", "drip-nurture" */
  category: string;
  case_id?: string;
  order_id?: string;
  /** Drip email key when applicable (matches drip_emails.email_key) */
  email_key?: string;
  /** Catch-all for extra context (tier, amount, charge_type, etc.) */
  metadata?: Record<string, unknown>;
}

// ============================================================
// EMAIL AUDIT LOG (fire-and-forget)
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { PHYSICAL_ADDRESS } from "@/lib/site";

async function logEmailSend(
  params: EmailParams,
  result: EmailResult,
  context: EmailLogContext
): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from("email_log").insert({
      recipient: params.to,
      subject: params.subject,
      category: context.category,
      email_key: context.email_key || null,
      case_id: context.case_id || null,
      order_id: context.order_id || null,
      resend_id: result.id || null,
      success: result.success,
      error_message: result.error || null,
      metadata: context.metadata || null,
    });
  } catch (err) {
    console.error("[Email Log] Failed to log:", err);
  }
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
 * @param logContext - Optional audit log context. When provided, logs the send result.
 * @returns A result object indicating success or failure. Never throws.
 */
export async function sendEmail(
  params: EmailParams,
  logContext?: EmailLogContext
): Promise<EmailResult> {
  // Graceful degradation: allow the app to run without email credentials
  if (!RESEND_API_KEY) {
    console.warn("[Email] RESEND_API_KEY not configured, skipping email");
    const result: EmailResult = { success: false, error: "Email service not configured" };
    if (logContext) {
      logEmailSend(params, result, logContext).catch((err) =>
        console.error("[Email Log] Fire-and-forget failed:", err)
      );
    }
    return result;
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
  if (params.threadingHeaders?.messageId) {
    headers["Message-ID"] = params.threadingHeaders.messageId;
  }
  if (params.threadingHeaders?.inReplyTo) {
    headers["In-Reply-To"] = params.threadingHeaders.inReplyTo;
  }
  if (params.threadingHeaders?.references) {
    headers["References"] = params.threadingHeaders.references;
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
    const result: EmailResult = { success: true, id: data.id };
    if (logContext) {
      logEmailSend(params, result, logContext).catch((err) =>
        console.error("[Email Log] Fire-and-forget failed:", err)
      );
    }
    return result;
  } catch (error) {
    console.error("[Email] Failed to send:", error);
    const result: EmailResult = {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email",
    };
    if (logContext) {
      logEmailSend(params, result, logContext).catch((err) =>
        console.error("[Email Log] Fire-and-forget failed:", err)
      );
    }
    return result;
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
  params: EmailParams,
  logContext?: EmailLogContext
): Promise<EmailResult> {
  const result = await sendEmail(params, logContext);
  if (result.success) return result;

  // First attempt failed — wait 2s and retry (transient Resend API errors)
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const retry = await sendEmail(params, logContext);
  if (!retry.success) {
    console.error(
      `[Email] Failed after retry: to=${params.to} subject="${params.subject}"`,
      retry.error
    );
  }
  return retry;
}

// ============================================================
// SEND EMAIL WITH OPERATOR ALERT ON FAILURE
// ============================================================

const OPERATOR_EMAIL =
  process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com";

/**
 * Sends an email with one retry, then alerts the operator if both fail.
 * Use this for critical transactional emails (payment confirmation, delivery)
 * where silent failure would leave the customer in the dark.
 *
 * @param params - Email parameters
 * @param context - Human-readable description for the operator alert
 * @param logContext - Optional audit log context
 */
export async function sendEmailWithOperatorAlert(
  params: EmailParams,
  context: string,
  logContext?: EmailLogContext
): Promise<EmailResult> {
  const result = await sendEmail(params, logContext);
  if (result.success) return result;

  await new Promise((resolve) => setTimeout(resolve, 2000));
  const retry = await sendEmail(params, logContext);
  if (retry.success) return retry;

  // Both failed — notify operator so they can send manually
  console.error(`[Email] Failed after retry: ${context}`, retry.error);
  await sendEmail({
    to: OPERATOR_EMAIL,
    subject: `ALERT: Email delivery failed — ${context}`,
    html: `<h1 style="color: #EF4444;">Email Delivery Failed</h1>
      <p><strong>Context:</strong> ${escapeHtml(context)}</p>
      <p><strong>Recipient:</strong> ${escapeHtml(params.to)}</p>
      <p><strong>Subject:</strong> ${escapeHtml(params.subject)}</p>
      <p><strong>Error:</strong> ${escapeHtml(retry.error || "Unknown")}</p>
      <p>Both attempts failed. Please send this email manually.</p>`,
  }, logContext ? { category: "operator-alert", case_id: logContext.case_id, metadata: { original_category: logContext.category, error: retry.error } } : undefined);
  return retry;
}
