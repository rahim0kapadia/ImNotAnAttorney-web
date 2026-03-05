/**
 * @file /api/webhooks/resend-inbound — Resend inbound email webhook handler
 *
 * Receives `email.received` events from Resend when someone emails
 * help@imnotanattorney.com. The webhook payload only contains metadata,
 * so we call the Resend API to fetch the full email body, then store
 * everything in the `inbound_emails` Supabase table.
 *
 * Security: Svix signature verification using RESEND_INBOUND_WEBHOOK_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const RESEND_API = "https://api.resend.com";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const webhookSecret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;

  // ── SIGNATURE VERIFICATION ──
  if (webhookSecret) {
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: "Missing Svix headers" }, { status: 400 });
    }

    const ts = parseInt(svixTimestamp, 10);
    if (Math.abs(Date.now() / 1000 - ts) > 300) {
      return NextResponse.json({ error: "Timestamp too old" }, { status: 400 });
    }

    const signedContent = `${svixId}.${svixTimestamp}.${body}`;
    const encoder = new TextEncoder();
    const secretBytes = Uint8Array.from(
      atob(webhookSecret.replace("whsec_", "")),
      (c) => c.charCodeAt(0)
    );

    const key = await crypto.subtle.importKey(
      "raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signedContent));
    const expectedSig = `v1,${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;

    const signatures = svixSignature.split(" ");
    if (!signatures.includes(expectedSig)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  } else {
    console.warn("[Resend Inbound] RESEND_INBOUND_WEBHOOK_SECRET not set — running unverified");
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, data } = event;

  if (type !== "email.received") {
    return NextResponse.json({ received: true, skipped: true });
  }

  const emailId = data?.email_id;
  if (!emailId) {
    console.error("[Resend Inbound] No email_id in payload");
    return NextResponse.json({ error: "No email_id" }, { status: 400 });
  }

  // ── FETCH FULL EMAIL CONTENT ──
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error("[Resend Inbound] RESEND_API_KEY not set");
    return NextResponse.json({ error: "Server config error" }, { status: 500 });
  }

  let emailData;
  try {
    const res = await fetch(`${RESEND_API}/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${resendApiKey}` },
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Resend Inbound] Failed to fetch email ${emailId}: ${res.status} ${errText}`);
      return NextResponse.json({ error: "Failed to fetch email" }, { status: 502 });
    }
    emailData = await res.json();
  } catch (err) {
    console.error("[Resend Inbound] Fetch error:", err);
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }

  // ── STORE IN SUPABASE ──
  const supabase = createAdminClient();

  const { error: insertError } = await supabase.from("inbound_emails").insert({
    from_email: emailData.from || data.from || "unknown",
    from_name: extractName(emailData.from || data.from || ""),
    to_email: (emailData.to || data.to)?.[0] || "help@imnotanattorney.com",
    subject: emailData.subject || data.subject || "(no subject)",
    body_text: emailData.text || null,
    body_html: emailData.html || null,
    message_id: emailData.message_id || null,
    headers: emailData.headers || null,
    raw_payload: { webhook: data, email: emailData },
    read: false,
  });

  if (insertError) {
    console.error("[Resend Inbound] Insert error:", insertError.message);
    return NextResponse.json({ error: "DB insert failed" }, { status: 500 });
  }

  console.log(`[Resend Inbound] Stored email from ${emailData.from || data.from} — ${emailData.subject || data.subject}`);
  return NextResponse.json({ received: true, stored: true });
}

/** Extract display name from "Name <email>" format */
function extractName(from: string): string | null {
  const match = from.match(/^(.+?)\s*<.+>$/);
  return match ? match[1].trim() : null;
}
