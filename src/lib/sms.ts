// src/lib/sms.ts
/**
 * @fileoverview SMS via email-to-text gateway (text.email).
 *
 * Sends SMS by emailing {phone}@text.email via Resend.
 * They handle 10DLC compliance. We pay $0 per message — just Resend email cost.
 *
 * Requires: RESEND_API_KEY (already configured for email delivery).
 * Phone numbers must be 10-digit US (stripped of +1 prefix for the gateway).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { isSmsSuspended } from "@/lib/sms-suspensions";

// ── Types ─────────────────────────────────────────────────

/** Optional context for sms_log audit trail. Fire-and-forget — never blocks send. */
export interface SmsLogContext {
  category: string;
  court_reminder_id?: string;
  partner_id?: string;
  subject?: string; // Email-to-SMS subject line override
  metadata?: Record<string, unknown>;
}

// ── SMS Core ──────────────────────────────────────────────

/** Truncate SMS to single segment. Appends "..." if truncated. */
export function capSMS(text: string, maxLen = 160): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen - 3) + "...";
}

/** Strip +1 prefix to get bare 10-digit number for the gateway address. */
function toGatewayAddress(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const bare = digits.startsWith("1") && digits.length === 11 ? digits.slice(1) : digits;
  return `${bare}@text.email`;
}

export async function sendSMS(
  to: string,
  body: string,
  logContext?: SmsLogContext
): Promise<{ success: boolean; error?: string; skipped?: "suspended" }> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn("[SMS] RESEND_API_KEY not configured — skipping SMS");
    return { success: false, error: "SMS not configured" };
  }

  // Layer 2 guard: skip if phone is suspended (prior gateway bounce).
  try {
    const supabaseForCheck = createAdminClient();
    const suspended = await isSmsSuspended(supabaseForCheck, to);
    if (suspended) {
      const result = { success: false, error: "phone suspended (prior bounce)", skipped: "suspended" as const };
      if (logContext) {
        logSmsSend(to, body, { success: false, error: result.error }, { ...logContext, category: logContext.category + ":suspended" }).catch(() => {});
      }
      return result;
    }
  } catch (err) {
    // Fail open — don't block sends on suspension-check errors.
    console.warn("[SMS] Suspension check failed, proceeding:", err instanceof Error ? err.message : err);
  }

  let result: { success: boolean; error?: string };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ImNotAnAttorney <notifications@imnotanattorney.com>",
        to: [toGatewayAddress(to)],
        subject: logContext?.subject ?? "Court Reminder",
        text: body,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const errMsg = (data as { message?: string }).message || `HTTP ${res.status}`;
      console.error("[SMS] Send failed:", errMsg);
      result = { success: false, error: errMsg };
    } else {
      result = { success: true };
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[SMS] Error:", errMsg);
    result = { success: false, error: errMsg };
  }

  // Fire-and-forget audit log
  if (logContext) {
    logSmsSend(to, body, result, logContext).catch(() => {});
  }

  return result;
}

// ── Audit Log ─────────────────────────────────────────────

async function logSmsSend(
  recipient: string,
  body: string,
  result: { success: boolean; error?: string },
  context: SmsLogContext
): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from("sms_log").insert({
      recipient,
      body,
      category: context.category,
      court_reminder_id: context.court_reminder_id || null,
      partner_id: context.partner_id || null,
      success: result.success,
      error_message: result.error || null,
      metadata: context.metadata || null,
    });
  } catch (err) {
    console.error("[SMS Log] Failed to log:", err);
  }
}
