// src/lib/sms.ts
/**
 * @fileoverview Telnyx SMS utility.
 *
 * Sends SMS via Telnyx REST API v2.
 * Gracefully degrades if Telnyx credentials not configured.
 *
 * Env vars: TELNYX_API_KEY, TELNYX_FROM_NUMBER
 */

// ── SMS Core ──────────────────────────────────────────────

/** Truncate SMS to single segment. Appends "..." if truncated. */
export function capSMS(text: string, maxLen = 160): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen - 3) + "...";
}

export async function sendSMS(
  to: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.TELNYX_API_KEY;
  const fromNumber = process.env.TELNYX_FROM_NUMBER;

  if (!apiKey || !fromNumber) {
    console.warn("[Telnyx SMS] Not configured — skipping SMS");
    return { success: false, error: "SMS not configured" };
  }

  try {
    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromNumber,
        to,
        text: body,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const errors = (data as { errors?: { detail?: string }[] }).errors;
      const errMsg = errors?.[0]?.detail || `HTTP ${res.status}`;
      console.error("[Telnyx SMS] Send failed:", errMsg);
      return { success: false, error: errMsg };
    }

    return { success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Telnyx SMS] Error:", errMsg);
    return { success: false, error: errMsg };
  }
}
