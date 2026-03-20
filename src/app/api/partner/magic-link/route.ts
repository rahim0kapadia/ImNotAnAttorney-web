/**
 * POST /api/partner/magic-link — Request a magic link for partner login.
 *
 * Public route (no auth). Rate-limited to 3 requests per email per hour + 10 per IP per hour.
 * Sends magic link via Resend (email) + Twilio (SMS, if phone on file).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateMagicLink } from "@/lib/partner-auth";
import { sendEmail, escapeHtml } from "@/lib/email";
import { sendSMS } from "@/lib/twilio";
import { SITE_URL, normalizeEmail } from "@/lib/site";

export async function POST(req: NextRequest) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const normalizedEmail = normalizeEmail(email);
    const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    // Rate limit: 3 magic link requests per email per hour
    const supabase = createAdminClient();
    const { limited } = await checkRateLimit(
      supabase,
      `partner-magic:${normalizedEmail}`,
      3,
      3600
    );
    if (limited) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again in an hour." },
        { status: 429 }
      );
    }

    // Secondary rate limit: 10 magic link requests per IP per hour
    const { limited: ipLimited } = await checkRateLimit(
      supabase,
      `partner-magic-ip:${ip}`,
      10,
      3600
    );
    if (ipLimited) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again in an hour." },
        { status: 429 }
      );
    }

    const result = await generateMagicLink(normalizedEmail);

    // Always return success to prevent email enumeration
    if (!result) {
      return NextResponse.json({ sent: true });
    }

    const { token, partner } = result;
    const magicUrl = `${SITE_URL}/partner/login/verify#token=${token}`;

    // Send via email
    await sendEmail({
      to: normalizedEmail,
      subject: "Your ImNotAnAttorney Partner Login Link",
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #F59E0B;">Partner Login</h2>
          <p>Hey ${escapeHtml(partner.name)},</p>
          <p>Click below to access your partner dashboard:</p>
          <a href="${magicUrl}" style="display: inline-block; padding: 12px 24px; background: #F59E0B; color: #000; font-weight: bold; text-decoration: none; border-radius: 8px; margin: 16px 0;">
            Open Dashboard
          </a>
          <p style="color: #888; font-size: 14px;">This link expires in 15 minutes and can only be used once.</p>
          <p style="color: #888; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });

    // Send via SMS if phone on file
    if (partner.phone) {
      const smsResult = await sendSMS(
        partner.phone,
        `ImNotAnAttorney Partner Login: ${magicUrl} — expires in 15 min.`
      );
      if (!smsResult.success) {
        console.warn("[Partner Magic Link] SMS failed:", smsResult.error);
      }
    }

    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error("[Partner Magic Link] Error:", err);
    return NextResponse.json(
      { error: "Failed to send login link" },
      { status: 500 }
    );
  }
}
