export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "noreply@imnotanattorney.com";

const PHYSICAL_ADDRESS = "195 Dr MLK Jr St N, St Petersburg, FL 33701";

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  unsubscribeEmail?: string;
}

interface EmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail(params: EmailParams): Promise<EmailResult> {
  if (!RESEND_API_KEY) {
    console.warn("[Email] RESEND_API_KEY not configured, skipping email");
    return { success: false, error: "Email service not configured" };
  }

  const unsubscribeUrl = params.unsubscribeEmail
    ? `https://imnotanattorney.com/api/unsubscribe?email=${Buffer.from(params.unsubscribeEmail).toString("base64")}`
    : null;

  const unsubscribeHtml = unsubscribeUrl
    ? `<p style="margin: 8px 0 0;"><a href="${unsubscribeUrl}" style="color: #71717A; text-decoration: underline;">Unsubscribe</a></p>`
    : "";

  // Build headers for List-Unsubscribe (one-click unsubscribe support)
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
