/**
 * @fileoverview QA Checkout Shortcut
 *
 * GET /api/qa-checkout?tier=dui-first-offense
 *
 * Creates a Stripe checkout session with the internal QA coupon (100% off)
 * and redirects to the Stripe-hosted checkout page. Saves pasting long
 * Stripe URLs — just open this URL in a browser.
 *
 * Security: Only works when the request email matches INTERNAL_QA_EMAIL.
 * Not linked from any page. The tier defaults to dui-first-offense if omitted.
 */
import { NextRequest, NextResponse } from "next/server";

const QA_EMAIL = process.env.INTERNAL_QA_EMAIL;

export async function GET(req: NextRequest) {
  if (!QA_EMAIL) {
    return NextResponse.json({ error: "QA not configured" }, { status: 500 });
  }

  const tier = req.nextUrl.searchParams.get("tier") || "dui-first-offense";
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";

  // Call our own checkout API to create the session
  const checkoutRes = await fetch(`${origin}/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier, email: QA_EMAIL }),
  });

  if (!checkoutRes.ok) {
    const err = await checkoutRes.json().catch(() => ({}));
    return NextResponse.json(
      { error: "Checkout session creation failed", details: err },
      { status: checkoutRes.status }
    );
  }

  const { url } = await checkoutRes.json();
  if (!url) {
    return NextResponse.json({ error: "No checkout URL returned" }, { status: 500 });
  }

  return NextResponse.redirect(url);
}
