/**
 * Shared auth helper for partner API routes.
 * Extracts session cookie, validates, returns partner or error response.
 */

import { NextRequest, NextResponse } from "next/server";
import { validatePartnerSession, PARTNER_SESSION_COOKIE } from "./partner-auth";

type PartnerData = NonNullable<Awaited<ReturnType<typeof validatePartnerSession>>>;

type AuthResult =
  | { partner: PartnerData; error: null }
  | { partner: null; error: NextResponse };

/**
 * Extracts and validates partner session from request cookie.
 * Returns `{ partner }` on success or `{ error: NextResponse }` on failure.
 */
export async function requirePartnerAuth(req: NextRequest): Promise<AuthResult> {
  const sessionToken = req.cookies.get(PARTNER_SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return { partner: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const partner = await validatePartnerSession(sessionToken);
  if (!partner) {
    return { partner: null, error: NextResponse.json({ error: "Session expired" }, { status: 401 }) };
  }

  return { partner, error: null };
}
