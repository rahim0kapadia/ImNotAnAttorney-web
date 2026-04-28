/**
 * @fileoverview QA Checkout Shortcut
 *
 * GET /api/qa-checkout?tier=dui-first-offense
 * GET /api/qa-checkout?product=employment-impact
 *
 * Creates a Stripe checkout session with the internal QA coupon (100% off)
 * and redirects to the Stripe-hosted checkout page. Saves pasting long
 * Stripe URLs, just open this URL in a browser.
 *
 * Supports both tier products (?tier=) and standalone products (?product=).
 *
 * Security: Requires ?key= matching OPERATOR_SECRET. Without the correct
 * key, returns 404 (looks like the route doesn't exist). Not linked from
 * any page. The tier defaults to dui-first-offense if omitted.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual, createHmac } from "crypto";

const QA_EMAIL = process.env.INTERNAL_QA_EMAIL;
const OPERATOR_SECRET = process.env.OPERATOR_SECRET;

/** Timing-safe string comparison using HMAC-then-compare to eliminate length oracle. */
function timingSafeCompare(a: string, b: string): boolean {
  const hmacA = createHmac("sha256", "inna-guard-compare").update(a).digest();
  const hmacB = createHmac("sha256", "inna-guard-compare").update(b).digest();
  return timingSafeEqual(hmacA, hmacB);
}

export async function GET(req: NextRequest) {
  // Gate on operator secret, return 404 to avoid revealing the route exists
  const key = req.nextUrl.searchParams.get("key");
  if (!OPERATOR_SECRET || !key || !timingSafeCompare(OPERATOR_SECRET, key)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!QA_EMAIL) {
    return NextResponse.json({ error: "QA not configured" }, { status: 500 });
  }

  const tier = req.nextUrl.searchParams.get("tier") || "dui-first-offense";
  const product = req.nextUrl.searchParams.get("product");
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";

  // Optional intake-field passthrough — let the QA caller exercise the
  // archetype-B auto-generate path for Tier 9 SKUs by supplying the same
  // metadata AvailabilityChecker would. Each field is read from the URL
  // query string and forwarded to /api/checkout, which threads it into
  // Stripe metadata, where the webhook's buildPrePopulatedIntake reads it.
  const intakeFields = [
    "state", "chargeType", "judgeName", "officerName", "agency",
    "courthouse", "federalCharge", "circuit",
  ] as const;
  const intakeBody: Record<string, string> = {};
  for (const f of intakeFields) {
    const v = req.nextUrl.searchParams.get(f);
    if (v) intakeBody[f] = v;
  }

  // Call our own checkout API to create the session.
  // ?product= creates a standalone product checkout; otherwise tier checkout.
  const checkoutBody = product
    ? { standaloneProduct: product, email: QA_EMAIL, ...intakeBody }
    : { tier, email: QA_EMAIL, ...intakeBody };

  const checkoutRes = await fetch(`${origin}/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(checkoutBody),
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
