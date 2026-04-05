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
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  // B10: Reject obviously malformed session IDs before hitting Stripe API
  if (sessionId.length > 200 || !/^cs_/.test(sessionId)) {
    return NextResponse.json({ verified: false });
  }

  try {
    // Rate limit: 20 requests per minute per IP
    const ip = getClientIp(req);
    const supabase = createAdminClient();
    const { limited } = await checkRateLimit(supabase, `checkout-verify:${ip}`, 20, 60);
    if (limited) {
      return NextResponse.json({ verified: false });
    }

    // Try the matching Stripe client based on session ID prefix to avoid
    // double-latency. cs_live_ sessions can only be retrieved by the live
    // client, cs_test_ by the test client.
    let session;
    const isLiveSession = sessionId.startsWith("cs_live_");
    const primaryClient = isLiveSession && stripeLive ? stripeLive : stripeTest;
    const fallbackClient = isLiveSession ? stripeTest : stripeLive;
    try {
      session = await primaryClient.checkout.sessions.retrieve(sessionId);
    } catch {
      if (fallbackClient) {
        session = await fallbackClient.checkout.sessions.retrieve(sessionId);
      } else {
        throw new Error("Session not found and no fallback Stripe client configured");
      }
    }

    // Reject test-mode sessions in production — test sessions are trivially
    // created with test card numbers and should never verify as paid.
    if (process.env.NODE_ENV === "production" && !session.livemode) {
      return NextResponse.json({ verified: false });
    }

    // Treat "paid" and "no_payment_required" as verified. "no_payment_required"
    // occurs with 100% coupons (e.g., internal QA coupon for E2E testing).
    // "unpaid" means the customer abandoned — reject that.
    if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
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

    // For digital products, look up the download token from the order record.
    // The webhook creates the token async — it may not exist yet if the customer
    // hits the success page before the webhook fires. Return null gracefully;
    // the success page shows "check email" as fallback.
    const tierSlug = session.metadata?.tier;
    if (session.metadata?.product_type === "digital-product" ||
        (tierSlug && !["case-decoder","intelligence-brief","x-ray","war-room","situation-room","extra-witness","witness-pack"].includes(tierSlug))) {
      const { data: order } = await supabase
        .from("orders")
        .select("download_token, download_token_expires_at")
        .eq("stripe_session_id", sessionId)
        .eq("product_type", "digital-product")
        .maybeSingle();

      if (order?.download_token) {
        const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
        response.downloadUrl = `${origin}/api/download/${order.download_token}`;
        response.emergencyDownloadUrl = `${origin}/api/download/${order.download_token}?doc=emergency`;
      }
    }

    return NextResponse.json(response);
  } catch {
    // On any Stripe API error (invalid session ID, network failure, etc.),
    // return unverified rather than an error. The success page will show a
    // graceful fallback message instead of a broken error state.
    return NextResponse.json({ verified: false });
  }
}
