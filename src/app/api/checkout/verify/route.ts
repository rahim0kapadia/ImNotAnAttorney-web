/**
 * @fileoverview Checkout Session Verification Endpoint
 *
 * Called by the /checkout/success page to verify that a Stripe checkout session
 * was actually paid before showing the success UI. This prevents users from
 * manually navigating to the success page URL without completing payment.
 *
 * Pipeline position:
 *   Stripe Checkout --> Redirect to /checkout/success?session_id=X&tier=Y
 *     --> Success page calls GET /api/checkout/verify?session_id=X
 *     --> If verified: show tier-specific next steps, OTO countdown, upload link
 *     --> If not verified: show generic "payment not confirmed" message
 *
 * Security notes:
 * - The session_id comes from the URL query parameter, which is set by Stripe
 *   during the redirect. It is NOT user-controllable in normal flow, but could
 *   be tampered with. The Stripe API call validates the session exists.
 * - On any error (invalid session ID, Stripe API failure, network issue), the
 *   endpoint returns { verified: false } rather than an error. This is
 *   intentional -- the success page gracefully degrades to a "check your email"
 *   message rather than showing an error.
 * - The email is pulled from customer_email (set during session creation) with
 *   a fallback to customer_details.email (filled by Stripe after the customer
 *   enters payment info). One of these is always available for paid sessions.
 */
import { NextRequest, NextResponse } from "next/server";
import { stripeTest, stripeLive } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";

/**
 * Verifies a Stripe checkout session's payment status and returns order details
 * for the success page to render tier-specific content.
 *
 * @param req - Query params: session_id (required, from Stripe redirect URL)
 * @returns JSON with verified (boolean), and if true: tier, email, amount (cents), productName
 */
export async function GET(req: NextRequest) {
  // Rate limit: 20 requests per minute per IP
  const ip = getClientIp(req);
  const supabase = createAdminClient();
  const { limited } = await checkRateLimit(supabase, `checkout-verify:${ip}`, 20, 60);
  if (limited) {
    return NextResponse.json({ verified: false });
  }

  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  // B10: Reject obviously malformed session IDs before hitting Stripe API
  if (sessionId.length > 200 || !/^cs_/.test(sessionId)) {
    return NextResponse.json({ verified: false });
  }
  try {
    // Try test client first, then live client. Sessions created with one mode
    // cannot be retrieved by the other — ensures verify works for all tiers
    // regardless of their live/test mode.
    let session;
    try {
      session = await stripeTest.checkout.sessions.retrieve(sessionId);
    } catch {
      if (stripeLive) {
        session = await stripeLive.checkout.sessions.retrieve(sessionId);
      } else {
        throw new Error("Session not found in test mode and no live client configured");
      }
    }

    // Only treat "paid" as verified. Stripe sessions can also be "unpaid"
    // (abandoned) or "no_payment_required" (100% coupon). We require "paid"
    // because all our tiers have a non-zero price after any applicable credit.
    if (session.payment_status !== "paid") {
      return NextResponse.json({ verified: false });
    }

    // Return the data the success page needs to render tier-specific content:
    // - tier: determines which next-steps block to show (e.g., upload link for X-Ray+)
    // - email: shown in the "check your email" confirmation message
    // - amount: displayed as the payment amount (in cents, formatted client-side)
    // - productName: human-readable tier name for the receipt summary
    // - downloadUrl: for digital products, the secure download link (if webhook has fired)
    const response: Record<string, unknown> = {
      verified: true,
      tier: session.metadata?.tier,
      email: session.customer_email || session.customer_details?.email,
      amount: session.amount_total,
      productName: session.metadata?.product_name,
      sessionCreated: session.created, // Unix timestamp (seconds) for OTO timer TTL
      priorityDelivery: session.metadata?.priority_delivery === "true",
    };

    // Download URLs are delivered via webhook email (token-based, 72hr expiry,
    // refund-revocable). Not generated here — this endpoint is unauthenticated
    // and session_ids are not secret enough to gate file access.

    return NextResponse.json(response);
  } catch {
    // On any Stripe API error (invalid session ID, network failure, etc.),
    // return unverified rather than an error. The success page will show a
    // graceful fallback message instead of a broken error state.
    return NextResponse.json({ verified: false });
  }
}
