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
  body: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn("[SMS] RESEND_API_KEY not configured — skipping SMS");
    return { success: false, error: "SMS not configured" };
  }

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
        subject: "Court Reminder",
        text: body,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const errMsg = (data as { message?: string }).message || `HTTP ${res.status}`;
      console.error("[SMS] Send failed:", errMsg);
      return { success: false, error: errMsg };
    }

    return { success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[SMS] Error:", errMsg);
    return { success: false, error: errMsg };
  }
}
