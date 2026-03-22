/**
 * POST /api/customer/magic-link — Request a magic link for customer login.
 *
 * Public route (no auth). Rate-limited to 3 requests per email per hour + 10 per IP per 5 min.
 * Sends magic link via Resend (email).
 * Only customers with at least one paid order can use the portal.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateCustomerMagicLink } from "@/lib/customer-auth";
import { sendCustomerMagicLinkEmail } from "@/lib/email";
import { SITE_URL, normalizeEmail } from "@/lib/site";
import { getClientIp } from "@/lib/request";

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
    const ip = getClientIp(req);

    const supabase = createAdminClient();

    // Rate limit: 10 magic link requests per IP per 5 minutes
    const { limited: ipLimited } = await checkRateLimit(
      supabase,
      `customer-magic:${ip}`,
      10,
      300
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

    // Send via email
    await sendCustomerMagicLinkEmail(normalizedEmail, magicUrl);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Customer Magic Link] Error:", err);
    return NextResponse.json(
      { error: "Failed to send login link" },
      { status: 500 }
    );
  }
}
