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
import { extractPhoneFromGateway, suspendSmsPhone } from "@/lib/sms-suspensions";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  // ── SIGNATURE VERIFICATION ──
  // Resend uses Svix for webhook signing. REJECT if secret is not configured
  // to prevent forged webhooks (e.g., mass-unsubscribe attacks).
  if (!webhookSecret) {
    console.error("[Resend Webhook] RESEND_WEBHOOK_SECRET not configured — rejecting request");
    return NextResponse.json({ error: "Webhook verification not configured" }, { status: 500 });
  }
  {
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: "Missing Svix headers" }, { status: 400 });
    }

    // Basic timestamp check — reject webhooks older than 5 minutes or malformed
    const ts = parseInt(svixTimestamp, 10);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
      return NextResponse.json({ error: "Timestamp too old or malformed" }, { status: 400 });
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

  // Extract recipient email(s). `data.to` is usually string[] but some events
  // deliver a single string — normalize, then cap to avoid pathological payloads.
  const rawTo = data?.to;
  const toList: string[] = Array.isArray(rawTo) ? rawTo : rawTo ? [rawTo] : [];
  const MAX_RECIPIENTS = 100;
  const recipients = toList.slice(0, MAX_RECIPIENTS).filter((x): x is string => typeof x === "string");
  if (recipients.length === 0) {
    return NextResponse.json({ received: true });
  }

  const supabase = createAdminClient();
  let smsSuspended = 0;
  const suspendedPhones: string[] = [];

  for (const email of recipients) {
    const normalizedEmail = email.toLowerCase().trim();

    // Layer 2 SMS path: {10digits}@text.email is our SMS gateway. A bounce here
    // means the gateway rejected the number — suspend future sends.
    const gatewayPhone = extractPhoneFromGateway(normalizedEmail);
    if (gatewayPhone) {
      const res = await suspendSmsPhone(supabase, gatewayPhone, {
        reason: type,
        bounceType: data?.bounce?.type ?? data?.bounce?.subType ?? null,
        source: "resend_webhook",
        metadata: {
          email_id: data?.email_id,
          resend_to: data?.to,
          resend_from: data?.from,
          received_at: new Date().toISOString(),
        },
      });
      if (res.ok && !res.alreadySuspended) {
        smsSuspended += 1;
        suspendedPhones.push(gatewayPhone);
      }
      // Don't unsubscribe the gateway address from the subscriber list —
      // it's not a real subscriber. Skip to next recipient.
      continue;
    }

    // Auto-unsubscribe the recipient
    const { error } = await supabase
      .from("subscribers")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("email", normalizedEmail)
      .is("unsubscribed_at", null);

    if (error) {
      console.error(`[Resend Webhook] Failed to unsubscribe ${normalizedEmail}:`, error.message);
    } else {
      console.warn(`[Resend Webhook] Auto-unsubscribed ${normalizedEmail} (${type})`);
    }
  }

  // Telegram alert on new SMS suspensions (real-time Layer 2 signal).
  if (smsSuspended > 0) {
    void sendSmsSuspensionAlert(suspendedPhones, type);
  }

  return NextResponse.json({
    received: true,
    unsubscribed: recipients.length - smsSuspended,
    smsSuspended,
  });
}

async function sendSmsSuspensionAlert(phones: string[], eventType: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN_LEGAL;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;
  const text = `SMS Gateway Alert (${eventType})\n\n${phones.length} phone(s) suspended after text.email bounce:\n${phones.map((p) => `- ${p}`).join("\n")}`;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    // Fire-and-forget — alert failures don't break webhook 200.
  }
}
