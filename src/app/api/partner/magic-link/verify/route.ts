/**
 * POST /api/partner/magic-link/verify, Verify magic link token.
 *
 * Called by the client-rendered verify page via fetch (same origin).
 * Validates token, creates session, returns session token for cookie setting.
 * POST to prevent token from appearing in server logs via query string.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  verifyMagicLink,
  createPartnerSession,
  PARTNER_SESSION_COOKIE,
  PARTNER_SESSION_MAX_AGE,
} from "@/lib/partner-auth";
import { activatePartnerPromoCode } from "@/lib/referral";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

export async function POST(req: NextRequest) {
  // Rate limit: 10 verify attempts per IP per 5 minutes
  const ip = getClientIp(req);
  const supabase = createAdminClient();
  const { limited } = await checkRateLimit(supabase, `partner-verify:${ip}`, 10, 300);
  if (limited) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  let token: string | null = null;
  try {
    const body = await req.json();
    token = typeof body.token === "string" ? body.token : null;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    return NextResponse.json({ error: "Invalid token format" }, { status: 400 });
  }

  const partnerId = await verifyMagicLink(token);

  if (!partnerId) {
    return NextResponse.json(
      { error: "Invalid or expired link. Please request a new one." },
      { status: 401 }
    );
  }

  const sessionToken = await createPartnerSession(partnerId);

  if (!sessionToken) {
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }

  // Activate Stripe promo code now that email is verified
  try {
    const { data: partnerData } = await supabase
      .from("partners")
      .select("stripe_promo_code_id")
      .eq("id", partnerId)
      .maybeSingle();
    if (partnerData?.stripe_promo_code_id) {
      await activatePartnerPromoCode(partnerData.stripe_promo_code_id);
    }
  } catch (e) {
    console.error("[Magic Link Verify] Promo code activation failed:", e);
    // Non-fatal, partner can still use dashboard
  }

  // Set session cookie and return success
  const response = NextResponse.json({ success: true });
  response.cookies.set(PARTNER_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: PARTNER_SESSION_MAX_AGE,
    path: "/",
  });

  return response;
}
