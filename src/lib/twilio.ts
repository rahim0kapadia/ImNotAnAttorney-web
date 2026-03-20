/**
 * @fileoverview Twilio SMS utility for partner magic link delivery.
 *
 * Sends SMS messages via Twilio REST API. Used for magic link auth
 * (partner portal login). Gracefully degrades if Twilio credentials
 * are not configured — logs a warning instead of throwing.
 *
 * Env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 */

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER;

/**
 * Sends an SMS message via Twilio.
 * Returns silently if Twilio is not configured (no env vars).
 */
export async function sendSMS(to: string, body: string): Promise<{ success: boolean; error?: string }> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    console.warn("[Twilio] Not configured — skipping SMS to", to);
    return { success: false, error: "Twilio not configured" };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }).toString(),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const errMsg = data.message || `HTTP ${res.status}`;
      console.error("[Twilio] SMS failed:", errMsg);
      return { success: false, error: errMsg };
    }

    return { success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Twilio] SMS error:", errMsg);
    return { success: false, error: errMsg };
  }
}
