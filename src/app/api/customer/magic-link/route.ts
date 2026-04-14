/**
 * POST /api/customer/magic-link — Request a magic link for customer login.
 *
 * Public route (no auth). Rate-limited to 3 requests per email per hour + 10 per IP per hour.
 * Sends magic link via Resend (email).
 * Only customers with at least one paid order can use the portal.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateCustomerMagicLink } from "@/lib/customer-auth";
import { sendCustomerMagicLinkEmail } from "@/lib/email";
import { SITE_URL, normalizeEmail, isValidEmail } from "@/lib/site";
import { getClientIp } from "@/lib/request";
import { sendSMS, capSMS } from "@/lib/sms";
import { getClientPrefs, shouldSendSMS, shouldSendEmail, canSendClientSMS } from "@/lib/notification-prefs";

export async function POST(req: NextRequest) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { email } = body;

    if (!email || typeof email !== "string" || !isValidEmail(email)) {
      // Always return success to prevent email enumeration
      return NextResponse.json({ success: true });
    }

    const normalizedEmail = normalizeEmail(email);
    const ip = getClientIp(req);

    const supabase = createAdminClient();

    // Rate limit: 10 magic link requests per IP per hour
    const { limited: ipLimited } = await checkRateLimit(
      supabase,
      `customer-magic:${ip}`,
      10,
      3600
    );
    if (ipLimited) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        { status: 429 }
      );
    }

    // Rate limit: 3 magic link requests per email per hour
    const { limited } = await checkRateLimit(
      supabase,
      `customer-magic:${normalizedEmail}`,
      3,
      3600
    );
    if (limited) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again in an hour." },
        { status: 429 }
      );
    }

    const result = await generateCustomerMagicLink(normalizedEmail);

    // Always return success to prevent email enumeration
    if (!result) {
      return NextResponse.json({ success: true });
    }

    const { token } = result;
    const magicUrl = `${SITE_URL}/my-cases/login/verify#token=${token}`;

    const { data: reminderRow } = await supabase
      .from("court_reminders")
      .select("phone, notification_prefs, sms_consent_at")
      .eq("email", normalizedEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const prefs = getClientPrefs(reminderRow?.notification_prefs || null);

    if (shouldSendEmail(prefs.magic_link)) {
      await sendCustomerMagicLinkEmail(normalizedEmail, magicUrl);
    }

    if (shouldSendSMS(prefs.magic_link) && canSendClientSMS(reminderRow?.phone, reminderRow?.sms_consent_at)) {
      await sendSMS(reminderRow!.phone!, capSMS(`ImNotAnAttorney login: ${magicUrl}`))
        .catch(e => console.warn("[Customer Magic Link] SMS failed:", e));
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Customer Magic Link] Error:", err);
    return NextResponse.json(
      { error: "Failed to send login link" },
      { status: 500 }
    );
  }
}
