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
    await destroyPartnerSession(sessionToken);
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
