/**
 * @file /api/admin/reply — Send a reply to an inbound email
 *
 * Sends an email via Resend with proper threading headers (In-Reply-To,
 * References) so the reply appears in the same thread in the recipient's
 * email client.
 *
 * Auth: ADMIN_PASSWORD via X-Admin-Password header.
 */

import { NextRequest, NextResponse } from "next/server";

const RESEND_API = "https://api.resend.com";

function isAuthorized(req: NextRequest): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  const fromHeader = req.headers.get("x-admin-password");
  return fromHeader === password;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { to, subject, text, message_id } = await req.json();

  if (!to || !text) {
    return NextResponse.json(
      { error: "to and text are required" },
      { status: 400 }
    );
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return NextResponse.json(
      { error: "RESEND_API_KEY not set" },
      { status: 500 }
    );
  }

  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "help@imnotanattorney.com";

  // Build email payload
  const payload: Record<string, unknown> = {
    from: `ImNotAnAttorney <${fromEmail}>`,
    to: [to],
    subject: subject || "Re: (no subject)",
    text,
    reply_to: fromEmail,
  };

  // Threading headers — makes reply appear in same thread
  if (message_id) {
    payload.headers = {
      "In-Reply-To": message_id,
      References: message_id,
    };
  }

  try {
    const res = await fetch(`${RESEND_API}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error("[Admin Reply] Resend error:", errData);
      return NextResponse.json(
        { error: errData.message || "Failed to send" },
        { status: 502 }
      );
    }

    const result = await res.json();
    console.log(`[Admin Reply] Sent reply to ${to} — ${result.id}`);
    return NextResponse.json({ ok: true, id: result.id });
  } catch (err) {
    console.error("[Admin Reply] Send error:", err);
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }
}
