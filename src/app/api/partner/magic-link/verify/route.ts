/**
 * GET /api/partner/magic-link/verify?token=xxx — Verify magic link token.
 *
 * Called by the client-rendered verify page via fetch (not a redirect).
 * Validates token, creates session, returns session token for cookie setting.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  verifyMagicLink,
  createPartnerSession,
  PARTNER_SESSION_COOKIE,
  PARTNER_SESSION_MAX_AGE,
} from "@/lib/partner-auth";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
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
