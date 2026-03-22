/**
 * Resend Webhook — POST /api/webhooks/resend
 *
 * Handles bounce and complaint events from Resend's webhook system.
 * Auto-unsubscribes recipients who bounce or complain to maintain
 * sender reputation and CAN-SPAM compliance.
 *
 * Events handled:
 *   - email.bounced — Hard bounce, auto-unsubscribe
 *   - email.complained — Spam complaint, auto-unsubscribe
 *
 * Verification: Resend uses Svix for webhook signing.
 * The RESEND_WEBHOOK_SECRET env var contains the Svix signing secret.
 * If the secret is not configured, the webhook runs unverified (logs a warning).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  // ── SIGNATURE VERIFICATION ──
  // Resend uses Svix for webhook signing. Verify if secret is configured.
  if (webhookSecret) {
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: "Missing Svix headers" }, { status: 400 });
    }

    // Basic timestamp check — reject webhooks older than 5 minutes
    const ts = parseInt(svixTimestamp, 10);
    if (Math.abs(Date.now() / 1000 - ts) > 300) {
      return NextResponse.json({ error: "Timestamp too old" }, { status: 400 });
    }

    // Verify HMAC signature
    const signedContent = `${svixId}.${svixTimestamp}.${body}`;
    const encoder = new TextEncoder();
    const secretBytes = Uint8Array.from(atob(webhookSecret.replace("whsec_", "")), (c) => c.charCodeAt(0));

    const key = await crypto.subtle.importKey(
      "raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signedContent));
    const expectedSig = `v1,${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;

    // Svix sends multiple signatures separated by spaces — use constant-time comparison
    const signatures = svixSignature.split(" ");
    const expectedBytes = new TextEncoder().encode(expectedSig);
    let valid = false;
    for (const candidate of signatures) {
      const candidateBytes = new TextEncoder().encode(candidate);
      if (candidateBytes.length !== expectedBytes.length) continue;
      // HMAC both sides with a fixed key for constant-time comparison
      const cmpKey = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode("webhook-cmp"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const [hmacA, hmacB] = await Promise.all([
        crypto.subtle.sign("HMAC", cmpKey, expectedBytes),
        crypto.subtle.sign("HMAC", cmpKey, candidateBytes),
      ]);
      const a = new Uint8Array(hmacA);
      const b = new Uint8Array(hmacB);
      let match = true;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) match = false; // no early return — constant time
      }
      if (match) valid = true;
    }
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  } else {
    console.error("[Resend Webhook] RESEND_WEBHOOK_SECRET not set — rejecting request");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, data } = event;

  // Only handle bounce and complaint events
  if (type !== "email.bounced" && type !== "email.complained") {
    return NextResponse.json({ received: true });
  }

  // Extract recipient email(s)
  const recipients: string[] = data?.to || [];
  if (recipients.length === 0) {
    return NextResponse.json({ received: true });
  }

  const supabase = createAdminClient();

  for (const email of recipients) {
    const normalizedEmail = email.toLowerCase().trim();

    // Auto-unsubscribe the recipient
    const { error } = await supabase
      .from("subscribers")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("email", normalizedEmail)
      .is("unsubscribed_at", null);

    if (error) {
      console.error(`[Resend Webhook] Failed to unsubscribe ${normalizedEmail}:`, error.message);
    } else {
      console.log(`[Resend Webhook] Auto-unsubscribed ${normalizedEmail} (${type})`);
    }
  }

  return NextResponse.json({ received: true, unsubscribed: recipients.length });
}
