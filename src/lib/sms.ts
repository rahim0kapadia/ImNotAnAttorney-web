// src/lib/sms.ts
/**
 * @fileoverview Bird SMS utility.
 *
 * Sends SMS via Bird (formerly MessageBird) REST API.
 * Gracefully degrades if Bird credentials not configured.
 *
 * Env vars: BIRD_API_KEY, BIRD_WORKSPACE_ID, BIRD_CHANNEL_ID
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
  const apiKey = process.env.BIRD_API_KEY;
  const workspaceId = process.env.BIRD_WORKSPACE_ID;
  const channelId = process.env.BIRD_CHANNEL_ID;

  if (!apiKey || !workspaceId || !channelId) {
    console.warn("[Bird SMS] Not configured — skipping SMS");
    return { success: false, error: "SMS not configured" };
  }

  try {
    const url = `https://api.bird.com/workspaces/${workspaceId}/channels/${channelId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `AccessKey ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        receiver: { contacts: [{ identifierValue: to }] },
        body: { type: "text", text: { text: body } },
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const errMsg = (data as Record<string, string>).message || `HTTP ${res.status}`;
      console.error("[Bird SMS] Send failed:", errMsg);
      return { success: false, error: errMsg };
    }

    return { success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Bird SMS] Error:", errMsg);
    return { success: false, error: errMsg };
  }
}
