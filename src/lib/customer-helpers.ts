/**
 * Shared auth helper for customer API routes.
 * Extracts session cookie, validates, returns customer or error response.
 * Mirrors src/lib/partner-helpers.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateCustomerSession, CUSTOMER_SESSION_COOKIE } from "./customer-auth";

type CustomerData = { email: string };

type CustomerAuthResult =
  | { customer: CustomerData; error: null }
  | { customer: null; error: NextResponse };

/**
 * Extracts and validates customer session from request cookie.
 * Returns `{ customer }` on success or `{ error: NextResponse }` on failure.
 */
export async function requireCustomerAuth(req: NextRequest): Promise<CustomerAuthResult> {
  const sessionToken = req.cookies.get(CUSTOMER_SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return { customer: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const customer = await validateCustomerSession(sessionToken);
  if (!customer) {
    return { customer: null, error: NextResponse.json({ error: "Session expired" }, { status: 401 }) };
  }

  return { customer, error: null };
}
