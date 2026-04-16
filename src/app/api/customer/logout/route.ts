/**
 * POST /api/customer/logout, Destroy customer session.
 *
 * Deletes session from DB and clears session cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { destroyCustomerSession, CUSTOMER_SESSION_COOKIE } from "@/lib/customer-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const ip = getClientIp(req);
  const { limited } = await checkRateLimit(supabase, `customer-logout:${ip}`, 10, 300);
  if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const sessionToken = req.cookies.get(CUSTOMER_SESSION_COOKIE)?.value;

  if (sessionToken) {
    await destroyCustomerSession(sessionToken);
  }

  const response = NextResponse.json({ loggedOut: true });
  response.cookies.set(CUSTOMER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });

  return response;
}
