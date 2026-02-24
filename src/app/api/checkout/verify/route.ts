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
import { stripe } from "@/lib/stripe";

/**
 * Verifies a Stripe checkout session's payment status and returns order details
 * for the success page to render tier-specific content.
 *
 * @param req - Query params: session_id (required, from Stripe redirect URL)
 * @returns JSON with verified (boolean), and if true: tier, email, amount (cents), productName
 */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  // B10: Reject obviously malformed session IDs before hitting Stripe API
  if (sessionId.length > 200 || !/^cs_/.test(sessionId)) {
    return NextResponse.json({ verified: false });
  }
  try {
    // Retrieve the full session object from Stripe, including metadata
    // that was set during session creation in POST /api/checkout
    const session = await stripe.checkout.sessions.retrieve(sessionId);

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
    return NextResponse.json({
      verified: true,
      tier: session.metadata?.tier,
      email: session.customer_email || session.customer_details?.email,
      amount: session.amount_total,
      productName: session.metadata?.product_name,
      sessionCreated: session.created, // Unix timestamp (seconds) for OTO timer TTL
    });
  } catch {
    // On any Stripe API error (invalid session ID, network failure, etc.),
    // return unverified rather than an error. The success page will show a
    // graceful fallback message instead of a broken error state.
    return NextResponse.json({ verified: false });
  }
}
