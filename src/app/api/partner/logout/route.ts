/**
 * POST /api/partner/logout — Destroy partner session.
 *
 * Deletes session from DB and clears session cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { destroyPartnerSession, PARTNER_SESSION_COOKIE } from "@/lib/partner-auth";

export async function POST(req: NextRequest) {
  const sessionToken = req.cookies.get(PARTNER_SESSION_COOKIE)?.value;

  if (sessionToken) {
    try {
      await destroyPartnerSession(sessionToken);
    } catch (err) {
      console.error("[partner/logout] Failed to destroy session:", err);
      // Continue — clear the cookie regardless so the user is logged out client-side
    }
  }

  const response = NextResponse.json({ loggedOut: true });
  response.cookies.set(PARTNER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });

  return response;
}
