/**
 * @fileoverview Stripe Checkout Session Creator
 *
 * Creates Stripe Checkout sessions for all paid product tiers ($197 -- $9,997).
 * This is the central purchase entry point in the customer pipeline:
 *
 *   Intake Form / Services Page --> POST /api/checkout --> Stripe Hosted Checkout
 *     --> Stripe webhook (checkout.session.completed) --> Order creation in Supabase
 *
 * Key business rules enforced here:
 * - Tier validation against the TIERS allowlist (rejects unknown tier slugs)
 * - Email normalization (lowercase + trim) for consistent Supabase lookups
 * - Upgrade credit calculation: 100% of prior lower-tier purchases applied as a
 *   one-time Stripe coupon, with a 12-month expiration window
 * - Situation Room ($9,997) requires a prior paid War Room order (prerequisite gate)
 * - Consent checkbox required server-side for tiers >= $1,497 (legal risk mitigation)
 * - Redirect URLs sourced from NEXT_PUBLIC_SITE_URL env var, never from the request
 *   Origin header, to prevent open-redirect attacks
 * - Every Supabase query has explicit error handling with console logging
 *
 * The session metadata carries all context needed by the webhook handler to create
 * the order, case, and trigger downstream emails without re-querying business logic.
 */
import { NextRequest, NextResponse } from "next/server";
import { stripe, TIERS, isValidTier } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Creates a Stripe Checkout session for a given product tier.
 *
 * @param req - JSON body with: tier (required), email, consent, priorityDelivery, courtDate, chargeType
 * @returns JSON with { url } pointing to the Stripe-hosted checkout page
 *
 * @example
 * POST /api/checkout
 * { "tier": "x-ray", "email": "user@example.com", "consent": true }
 * --> { "url": "https://checkout.stripe.com/c/pay/..." }
 */
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { limited } = await checkRateLimit(createAdminClient(), `checkout:${ip}`, 10, 300);
    if (limited) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const { tier, email, consent, priorityDelivery, courtDate, chargeType } = body;

    // =========================================================================
    // 1. TIER VALIDATION
    // Reject unknown tier slugs early. isValidTier() checks against the TIERS
    // config object which defines all valid product slugs and their pricing.
    // =========================================================================
    if (!tier || !isValidTier(tier)) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    const tierConfig = TIERS[tier];

    // Use env var for redirect URLs — never trust Origin header (open redirect risk).
    // If the env var is missing, fall back to the production domain as a safe default.
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
    const supabase = createAdminClient();

    // B6+B15: Require email and validate format before Stripe session creation.
    // Without email, the webhook can't create orders properly.
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Valid email required" },
        { status: 400 }
      );
    }

    // Normalize email: lowercase + trim for consistent lookups across all tables.
    const normalizedEmail = email.toLowerCase().trim();

    // =========================================================================
    // 2. EMAIL CAPTURE FOR ABANDONMENT RECOVERY
    // Even if the customer abandons checkout, we capture their email in the
    // subscribers table. The upsert with onConflict:"email" is idempotent --
    // existing subscribers are not duplicated. This powers cart-abandonment
    // email flows. Errors are logged but non-blocking (checkout should proceed).
    // =========================================================================
    if (normalizedEmail) {
      const { error: subError } = await supabase.from("subscribers").upsert(
        { email: normalizedEmail, source: "checkout" },
        { onConflict: "email" }
      );
      if (subError) {
        console.error("[Checkout] Subscriber upsert error:", subError);
      }
    }

    // =========================================================================
    // 3. CHARGE TYPE AUTO-DETECTION
    // If the client didn't pass a chargeType (e.g., direct link to checkout),
    // look up their most recent intake form submission to auto-fill it. This
    // ensures the Stripe session metadata has charge context for downstream
    // report generation without requiring the customer to re-enter it.
    // =========================================================================
    // B8: Validate courtDate format if provided (ISO date, max 20 chars)
    const validCourtDate = courtDate && /^\d{4}-\d{2}-\d{2}$/.test(courtDate) ? courtDate : null;

    // B9: Validate chargeType against known types before writing to Stripe metadata
    const ALLOWED_CHARGE_TYPES = [
      "drug-possession", "drug-trafficking", "dui-first", "dui-repeat",
      "white-collar", "assault", "theft", "other-felony", "other-misdemeanor",
      "drug", "dui", "domestic-violence", "sex-offense", "weapons", "federal",
      "robbery", "burglary", "fraud", "other",
    ];
    let resolvedChargeType = (chargeType && ALLOWED_CHARGE_TYPES.includes(chargeType)) ? chargeType : null;
    if (!resolvedChargeType && normalizedEmail) {
      const { data: priorIntake, error: intakeError } = await supabase
        .from("intakes")
        .select("charge_type")
        .eq("email", normalizedEmail)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (intakeError) {
        console.error("[Checkout] Intake lookup error:", intakeError);
      }
      if (priorIntake?.charge_type) {
        resolvedChargeType = priorIntake.charge_type;
      }
    }

    // =========================================================================
    // 4. REFUND CHECK -- VOID UPGRADE CREDITS IF PRIOR REFUND EXISTS
    // Business rule: customers who received a refund forfeit all upgrade credit.
    // This prevents abuse where someone buys a low tier, gets credited on
    // upgrade, then refunds the original to get a net discount.
    // This is a BLOCKING check -- if we can't verify refund history, we fail
    // the request (500) rather than risk giving unearned credit.
    // =========================================================================
    let upgradeCreditVoided = false;
    if (normalizedEmail) {
      const { data: refundedOrder, error: refundError } = await supabase
        .from("orders")
        .select("id")
        .eq("email", normalizedEmail)
        .eq("status", "refunded")
        .limit(1)
        .maybeSingle();

      if (refundError) {
        console.error("[Checkout] Refund check error:", refundError);
        return NextResponse.json(
          { error: "Unable to verify order history" },
          { status: 500 }
        );
      }
      if (refundedOrder) {
        upgradeCreditVoided = true;
      }
    }

    // =========================================================================
    // 5. SITUATION ROOM PREREQUISITE GATE
    // The Situation Room ($9,997) requires a prior paid War Room ($3,497) order.
    // This is a "soft gate" -- we don't block the purchase, but flag it in the
    // Stripe session metadata (prerequisite_skipped: "true") and add a note to
    // the line item description. The operator can then follow up manually.
    // Without an email, we can't verify the prerequisite, so it's auto-skipped.
    // =========================================================================
    let prerequisiteSkipped = false;
    if (tier === "situation-room" && normalizedEmail) {
      const { data: warRoomOrder, error: warRoomError } = await supabase
        .from("orders")
        .select("id")
        .eq("email", normalizedEmail)
        .eq("tier", "war-room")
        .eq("status", "paid")
        .limit(1)
        .maybeSingle();

      if (warRoomError) {
        console.error("[Checkout] War Room prerequisite check error:", warRoomError);
      }
      if (!warRoomOrder) {
        prerequisiteSkipped = true;
      }
    } else if (tier === "situation-room" && !normalizedEmail) {
      prerequisiteSkipped = true;
    }

    // =========================================================================
    // 6. SERVER-SIDE CONSENT VALIDATION
    // Tiers at $1,497+ (The X-Ray and above) require the customer to check a
    // consent box on the checkout page acknowledging they understand the service
    // provides legal INFORMATION, not legal ADVICE. This is enforced server-side
    // because client-side validation alone can be bypassed. The consent timestamp
    // is recorded in Stripe session metadata for compliance records.
    // Price comparison is in cents: $1,497 = 149700 cents.
    // =========================================================================
    if (tierConfig.price >= 149700 && !consent) {
      return NextResponse.json(
        { error: "Consent required for this tier" },
        { status: 400 }
      );
    }

    // =========================================================================
    // 7. UPGRADE CREDIT CALCULATION
    // Customers who upgrade get 100% credit from prior purchases toward the new
    // tier, within a 12-month rolling window. Key safeguards:
    //
    // - Only credits from LOWER tiers count. This prevents a customer from
    //   re-purchasing the same tier and getting a free second purchase via
    //   "self-credit" (e.g., buying Case Decoder twice, second one free).
    //
    // - Credit is voided entirely if any prior order was refunded (step 4).
    //
    // - Credit is capped at the total session price (base + priority delivery)
    //   so it never results in a negative amount.
    //
    // - Implemented as a one-time Stripe coupon attached to the session, so
    //   the discount is visible on the Stripe receipt and in the dashboard.
    // =========================================================================
    let upgradeCreditCents = 0;
    let stripeCouponId: string | undefined;
    if (normalizedEmail && !upgradeCreditVoided) {
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

      const { data: priorOrders, error: creditError } = await supabase
        .from("orders")
        .select("amount, tier")
        .eq("email", normalizedEmail)
        .eq("status", "paid")
        .gte("paid_at", twelveMonthsAgo.toISOString());

      if (creditError) {
        console.error("[Checkout] Credit lookup error:", creditError);
      }

      if (priorOrders && priorOrders.length > 0) {
        // Tier ordering from lowest to highest price. indexOf() returns the
        // position; only orders with a lower index than the current tier qualify.
        const tierOrder = [
          "case-decoder",
          "intelligence-brief",
          "x-ray",
          "war-room",
          "situation-room",
        ];
        const currentTierIndex = tierOrder.indexOf(tier);
        upgradeCreditCents = priorOrders
          .filter(
            (o: { amount: number; tier: string }) =>
              tierOrder.indexOf(o.tier) < currentTierIndex
          )
          .reduce(
            (sum: number, o: { amount: number; tier: string }) => {
              // C8: Use base tier price, not o.amount which may include priority delivery add-on.
              // A customer who paid $197 + $97 priority = $294 should only get $197 credit.
              const baseTier = TIERS[o.tier as keyof typeof TIERS];
              return sum + (baseTier ? baseTier.price : o.amount || 0);
            },
            0
          );
      }

      // Create a one-time Stripe coupon if there's applicable credit.
      // The coupon is capped at the session total so Stripe never sees a
      // negative amount (which would cause an API error).
      if (upgradeCreditCents > 0) {
        const sessionTotal = tierConfig.price + (priorityDelivery && tierConfig.priorityPrice ? tierConfig.priorityPrice : 0);
        const cappedCredit = Math.min(upgradeCreditCents, sessionTotal);

        const coupon = await stripe.coupons.create({
          amount_off: cappedCredit,
          currency: "usd",
          duration: "once",
          name: "Upgrade Credit",
        });
        stripeCouponId = coupon.id;
      }
    }

    // =========================================================================
    // 8. BUILD LINE ITEMS
    // Stripe Checkout requires inline price_data (we don't use pre-created
    // Stripe Price objects). The primary line item is the tier itself. If the
    // customer opted for priority delivery (and the tier supports it), a second
    // line item is added. The prerequisite warning is embedded in the product
    // description so the operator sees it on the Stripe dashboard.
    // =========================================================================
    const lineItems: {
      price_data: { currency: string; product_data: { name: string; description?: string }; unit_amount: number };
      quantity: number;
    }[] = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: tierConfig.name,
            description: prerequisiteSkipped
              ? `Delivery: ${tierConfig.delivery} | Note: War Room prerequisite not confirmed`
              : `Delivery: ${tierConfig.delivery}`,
          },
          unit_amount: tierConfig.price,
        },
        quantity: 1,
      },
    ];

    // Optional priority delivery add-on line item
    if (priorityDelivery && tierConfig.priorityPrice) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: `Priority Delivery — ${tierConfig.name}`,
            description: tierConfig.priorityDelivery || "Expedited delivery",
          },
          unit_amount: tierConfig.priorityPrice,
        },
        quantity: 1,
      });
    }

    // =========================================================================
    // 9. CREATE STRIPE CHECKOUT SESSION
    // Session metadata carries all business context downstream to the webhook
    // handler (POST /api/webhooks/stripe). The webhook uses this metadata to
    // create the order and case records in Supabase without re-querying any of
    // the business logic computed above (credit, prerequisite, consent, etc.).
    //
    // Redirect URLs use the env-var origin (not request headers) to prevent
    // open-redirect attacks. {CHECKOUT_SESSION_ID} is a Stripe template variable
    // that gets replaced with the actual session ID after payment.
    // =========================================================================
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: normalizedEmail || undefined,
      line_items: lineItems,
      ...(stripeCouponId && { discounts: [{ coupon: stripeCouponId }] }),
      metadata: {
        tier,
        product_name: tierConfig.name,
        ...(prerequisiteSkipped && { prerequisite_skipped: "true" }),
        ...(upgradeCreditVoided && { upgrade_credit_voided: "true" }),
        ...(consent && { consent_timestamp: new Date().toISOString() }),
        ...(priorityDelivery && { priority_delivery: "true" }),
        ...(validCourtDate && { court_date: validCourtDate }),
        ...(resolvedChargeType && { charge_type: resolvedChargeType }),
        ...(upgradeCreditCents > 0 && { upgrade_credit_applied: String(upgradeCreditCents) }),
      },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&tier=${tier}`,
      cancel_url: `${origin}/checkout?tier=${tier}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[Checkout] Error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
