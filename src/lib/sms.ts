// src/lib/sms.ts
/**
 * @fileoverview Twilio SMS utility.
 *
 * Sends SMS via Twilio REST API.
 * Gracefully degrades if Twilio credentials not configured.
 *
 * Env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
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
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from) {
    console.warn("[Twilio SMS] Not configured — skipping SMS");
    return { success: false, error: "SMS not configured" };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const errMsg = (data as Record<string, string>).message || `HTTP ${res.status}`;
      console.error("[Twilio SMS] Send failed:", errMsg);
      return { success: false, error: errMsg };
    }

    return { success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Twilio SMS] Error:", errMsg);
    return { success: false, error: errMsg };
  }
}
