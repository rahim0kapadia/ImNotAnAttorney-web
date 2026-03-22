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
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";

const RESEND_API = "https://api.resend.com";

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { to, subject, text, message_id } = body;

  if (!to || !text) {
    return NextResponse.json(
      { error: "to and text are required" },
      { status: 400 }
    );
  }

  // Restrict replies to known recipients only. Without this check, a
  // compromised admin password turns this endpoint into an open email relay.
  // The "to" email must exist as a from_email in inbound_emails (i.e., someone
  // who has previously emailed us) OR as an email in the cases table (a customer).
  const supabase = createAdminClient();
  const { data: knownInbound } = await supabase
    .from("inbound_emails")
    .select("from_email")
    .eq("from_email", to)
    .limit(1)
    .maybeSingle();

  if (!knownInbound) {
    // Fallback: also check the cases table for customer emails
    const { data: knownCase } = await supabase
      .from("cases")
      .select("email")
      .eq("email", to)
      .limit(1)
      .maybeSingle();

    if (!knownCase) {
      return NextResponse.json(
        { error: "Can only reply to known email addresses" },
        { status: 400 }
      );
    }
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

  // Append signature
  const signature = `\n\n—\nYour team at ImNotAnAttorney\nYou're not in this alone.\nhelp@imnotanattorney.com`;
  const fullText = text + signature;

  // Build email payload
  const payload: Record<string, unknown> = {
    from: `ImNotAnAttorney <${fromEmail}>`,
    to: [to],
    subject: subject || "Re: (no subject)",
    text: fullText,
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
