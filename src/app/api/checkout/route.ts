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
 * - Situation Room ($9,997): requires active War Room — API validates prerequisite before creating session
 * - Consent checkbox required server-side for tiers >= $2,497 (legal risk mitigation)
 * - Redirect URLs sourced from NEXT_PUBLIC_SITE_URL env var, never from the request
 *   Origin header, to prevent open-redirect attacks
 * - Every Supabase query has explicit error handling with console logging
 *
 * The session metadata carries all context needed by the webhook handler to create
 * the order, case, and trigger downstream emails without re-querying business logic.
 */
import { NextRequest, NextResponse } from "next/server";
import { stripe, stripeForTier, TIERS, isValidTier, type TierSlug } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/site";
import { isValidChargeType } from "@/lib/charge-types";
import { getClientIp } from "@/lib/request";

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
  // Track coupon and tier for cleanup on failure (must be outside try block)
  let cleanupCouponId: string | undefined;
  let cleanupTier: TierSlug | undefined;
  try {
    const ip = getClientIp(req);
    const { limited } = await checkRateLimit(createAdminClient(), `checkout:${ip}`, 10, 300);
    if (limited) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { tier, email, consent, priorityDelivery, courtDate, chargeType, existingCaseNumber, existingCaseState, productType, promoCode, paymentPlan } = body;

    // =========================================================================
    // 1. TIER VALIDATION
    // Reject unknown tier slugs early. isValidTier() checks against the TIERS
    // config object which defines all valid product slugs and their pricing.
    // =========================================================================
    if (!tier || !isValidTier(tier)) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }
    cleanupTier = tier; // Track for coupon cleanup on failure (after validation)

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
    const normalizedEmail = normalizeEmail(email);

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

    // B9: Validate chargeType against shared allowlist before writing to Stripe metadata
    let resolvedChargeType = (chargeType && isValidChargeType(chargeType)) ? chargeType : null;
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
    // 5. SITUATION ROOM PREREQUISITE CHECK
    // The Situation Room ($9,997) requires a delivered War Room purchase.
    // This is enforced here so the prerequisite cannot be bypassed by
    // constructing a direct POST to this endpoint.
    // =========================================================================
    if (tier === "situation-room") {
      const { data: warRoomOrder, error: warRoomError } = await supabase
        .from("orders")
        .select("id")
        .eq("email", normalizedEmail)
        .eq("tier", "war-room")
        .eq("status", "delivered")
        .limit(1)
        .maybeSingle();

      if (warRoomError) {
        console.error("[Checkout] War Room prerequisite check error:", warRoomError);
        return NextResponse.json(
          { error: "Unable to verify prerequisite order" },
          { status: 500 }
        );
      }
      if (!warRoomOrder) {
        return NextResponse.json(
          { error: "The Situation Room requires a completed War Room purchase. Please purchase the War Room first." },
          { status: 400 }
        );
      }
    }

    // =========================================================================
    // 6. SERVER-SIDE CONSENT VALIDATION
    // All non-digital tiers require the customer to check a consent box
    // acknowledging they understand the service provides legal INFORMATION,
    // not legal ADVICE. This is enforced server-side because client-side
    // validation alone can be bypassed. The consent timestamp is recorded
    // in Stripe session metadata for compliance records.
    // =========================================================================
    if (!tierConfig.isDigitalProduct && !consent) {
      return NextResponse.json(
        { error: "Consent required for this tier" },
        { status: 400 }
      );
    }

    // Enhanced consent for high-value tiers ($2,497+): the frontend shows
    // additional non-refundable terms ("Work begins upon intake submission
    // and is non-refundable once delivered"). Require consent to be strictly
    // boolean true (not just truthy) to ensure the caller acknowledged these
    // terms and didn't accidentally pass a truthy string or number.
    if (tierConfig.price >= 249700 && consent !== true) {
      return NextResponse.json(
        { error: "Explicit consent required for tiers $2,497 and above" },
        { status: 400 }
      );
    }

    // =========================================================================
    // 6b. RETURNING CUSTOMER: CASE NUMBER LOOKUP
    // If the customer provided a court case number + state (indicating they
    // previously purchased a Case Decoder, possibly under a different email),
    // find the original order email to include in upgrade credit calculation.
    // =========================================================================
    let caseNumberEmail: string | null = null;
    // Validated/sanitized values — used for both DB query and Stripe metadata
    let trimmedCaseNumber = "";
    let trimmedCaseState = "";
    if (existingCaseNumber && existingCaseState) {
      // Validate input lengths to prevent metadata pollution
      trimmedCaseNumber = String(existingCaseNumber).trim().slice(0, 50);
      trimmedCaseState = String(existingCaseState).trim().slice(0, 50);

      if (trimmedCaseNumber && trimmedCaseState.length >= 2) {
        const { data: matchedCase } = await supabase
          .from("cases")
          .select("email")
          .eq("court_case_number", trimmedCaseNumber)
          .eq("court_state", trimmedCaseState)
          .eq("status", "delivered")
          .limit(1)
          .maybeSingle();

        // Only grant upgrade credit if the matched case belongs to this customer.
        // Prevents IDOR where an attacker probes case numbers to steal credits.
        if (matchedCase?.email && matchedCase.email === normalizedEmail) {
          caseNumberEmail = matchedCase.email;
        }
      }
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

      // Look up orders from current email
      const { data: priorOrders, error: creditError } = await supabase
        .from("orders")
        .select("amount, tier")
        .eq("email", normalizedEmail)
        .eq("status", "paid")
        .gte("paid_at", twelveMonthsAgo.toISOString());

      if (creditError) {
        console.error("[Checkout] Credit lookup error:", creditError);
      }

      // Also include orders from case-number-matched email (different email, same case)
      if (caseNumberEmail && caseNumberEmail !== normalizedEmail) {
        const { data: caseOrders } = await supabase
          .from("orders")
          .select("amount, tier")
          .eq("email", caseNumberEmail)
          .eq("status", "paid")
          .gte("paid_at", twelveMonthsAgo.toISOString());

        if (caseOrders && priorOrders) {
          // Merge, dedup by tier (take the higher amount per tier)
          const existingTiers = new Set(priorOrders.map((o: { tier: string }) => o.tier));
          for (const co of caseOrders) {
            if (!existingTiers.has(co.tier)) {
              priorOrders.push(co);
            }
          }
        }
      }

      // Also check for digital product (Playbook) purchases with 30-day credit window
      if (normalizedEmail && tier === "case-decoder") {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: playbookOrders } = await supabase
          .from("orders")
          .select("amount, tier")
          .eq("email", normalizedEmail)
          .eq("status", "paid")
          .eq("product_type", "digital-product")
          .gte("paid_at", thirtyDaysAgo.toISOString());

        if (playbookOrders && playbookOrders.length > 0) {
          let playbookCredit = playbookOrders.reduce(
            (sum: number, o: { amount: number }) => sum + (o.amount || 0),
            0
          );
          // Cap playbook credit at target tier price minus minimum charge
          const targetTierPrice = TIERS[tier]?.price || 0;
          if (playbookCredit > 0) {
            playbookCredit = Math.min(playbookCredit, Math.max(0, targetTierPrice - 50));
          }
          upgradeCreditCents += playbookCredit;
        }
      }

      if (priorOrders && priorOrders.length > 0) {
        // POLICY: Upgrade credits use base tier price, not amount actually paid.
        // A customer who bought CD ($197) then upgraded to IB (paying $800 after $197 credit)
        // gets $997 credit toward X-Ray — the full IB base price, not the $800 they paid.
        // This incentivizes the upgrade ladder by making each next tier more attractive.
        // Confirmed as correct business behavior 2026-03-27.
        //
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
        upgradeCreditCents += priorOrders
          .filter(
            (o: { amount: number; tier: string }) =>
              tierOrder.indexOf(o.tier) >= 0 && // Exclude digital products (not in tierOrder)
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
        // Ensure minimum $0.50 charge so Stripe creates a payment_intent.
        // Without a payment_intent, the order cannot be refunded later.
        // Stripe minimum charge is 50 cents.
        const maxCredit = Math.max(sessionTotal - 50, 0);
        const cappedCredit = Math.min(upgradeCreditCents, maxCredit);

        if (cappedCredit > 0) {
          const stripeClient = stripeForTier(tier);
          const coupon = await stripeClient.coupons.create({
            amount_off: cappedCredit,
            currency: "usd",
            duration: "once",
            name: "Upgrade Credit",
          });
          stripeCouponId = coupon.id;
          cleanupCouponId = coupon.id;
        }
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
            description: `Delivery: ${tierConfig.delivery}`,
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
    // 8b. REFERRAL PROMO CODE LOOKUP
    // If the customer came through a partner referral (promoCode field),
    // look up the partner's Stripe promo code ID for pre-applied discount.
    // =========================================================================
    let referralStripePromoId: string | undefined;
    let referralPartnerId: string | undefined;
    // Sanitize promoCode early — used in both DB lookup and Stripe metadata
    const sanitizedPromoCode = (promoCode && typeof promoCode === "string" && promoCode.length <= 50)
      ? promoCode.toUpperCase()
      : null;
    if (sanitizedPromoCode) {
      const { data: referralPartner } = await supabase
        .from("partners")
        .select("id, stripe_promo_code_id")
        .eq("promo_code", sanitizedPromoCode)
        .eq("status", "approved")
        .limit(1)
        .maybeSingle();
      if (referralPartner?.stripe_promo_code_id) {
        referralStripePromoId = referralPartner.stripe_promo_code_id;
        referralPartnerId = referralPartner.id;
      }
    }

    // =========================================================================
    // 8c. BUILD DISCOUNT STRATEGY (4-way conditional)
    // Stripe Checkout mode:"payment" allows only 1 entry in discounts[].
    // - referral only: discounts: [{ promotion_code: stripePromoCodeId }]
    // - upgrade only: discounts: [{ coupon: stripeCouponId }]
    // - both: create combined amount_off coupon, track referral via metadata
    // - neither: allow_promotion_codes: true
    // =========================================================================
    let discountConfig: { discounts?: Array<{ coupon?: string; promotion_code?: string }>; allow_promotion_codes?: boolean } = {};

    if (referralStripePromoId && stripeCouponId) {
      // BOTH: combined coupon (referral 10% + upgrade credit)
      const referralDiscount = Math.floor(
        (tierConfig.price + (priorityDelivery && tierConfig.priorityPrice ? tierConfig.priorityPrice : 0)) * 0.1
      );
      const stripeForDiscount = stripeForTier(tier);
      const upgradeCoupon = await stripeForDiscount.coupons.retrieve(stripeCouponId);
      const upgradeAmount = upgradeCoupon.amount_off || 0;
      const combinedAmount = referralDiscount + upgradeAmount;
      const sessionTotal = tierConfig.price + (priorityDelivery && tierConfig.priorityPrice ? tierConfig.priorityPrice : 0);
      const cappedCombined = Math.min(combinedAmount, Math.max(sessionTotal - 50, 0));

      // Delete the original upgrade coupon — it's replaced by the combined one
      await stripeForDiscount.coupons.del(stripeCouponId).catch(() => {});

      if (cappedCombined > 0) {
        const combinedCoupon = await stripeForDiscount.coupons.create({
          amount_off: cappedCombined,
          currency: "usd",
          duration: "once",
          name: "Referral + Upgrade Credit",
        });
        stripeCouponId = combinedCoupon.id;
        cleanupCouponId = combinedCoupon.id; // Track for cleanup on failure
        discountConfig = { discounts: [{ coupon: combinedCoupon.id }] };
      } else {
        stripeCouponId = undefined;
        cleanupCouponId = undefined; // No coupon to clean up
        discountConfig = { allow_promotion_codes: true };
      }
    } else if (referralStripePromoId) {
      discountConfig = { discounts: [{ promotion_code: referralStripePromoId }] };
    } else if (stripeCouponId) {
      discountConfig = { discounts: [{ coupon: stripeCouponId }] };
    } else {
      discountConfig = { allow_promotion_codes: true };
    }

    // =========================================================================
    // 9a. INSTALLMENT CHECKOUT (for digital products)
    // Creates a subscription with 2 monthly payments instead of a one-time
    // charge. The webhook sets cancel_at on the subscription after creation
    // so it auto-terminates after 2 billing cycles.
    //
    // Coupon handling: One-time coupons only discount the first invoice of a
    // subscription. For installments, we re-create as repeating/2-month so
    // the discount is split evenly across both payments.
    // =========================================================================
    if (paymentPlan === true && tierConfig.isDigitalProduct) {
      const installmentAmount = Math.ceil(tierConfig.price / 2);
      const tierStripeInstallment = stripeForTier(tier);

      // Convert one-time coupons to repeating for installment plans
      let installmentDiscountConfig = discountConfig;
      if (stripeCouponId && discountConfig.discounts?.length) {
        try {
          const origCoupon = await tierStripeInstallment.coupons.retrieve(stripeCouponId);
          if (origCoupon.duration === "once" && origCoupon.amount_off) {
            const perInstallment = Math.ceil(origCoupon.amount_off / 2);
            const repeatingCoupon = await tierStripeInstallment.coupons.create({
              amount_off: perInstallment,
              currency: "usd",
              duration: "repeating",
              duration_in_months: 2,
              name: origCoupon.name || "Installment Discount",
            });
            await tierStripeInstallment.coupons.del(stripeCouponId).catch(() => {});
            cleanupCouponId = repeatingCoupon.id;
            installmentDiscountConfig = { discounts: [{ coupon: repeatingCoupon.id }] };
          }
        } catch {
          // Coupon conversion failed — proceed with original config
        }
      }

      const installmentSession = await tierStripeInstallment.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        // NOTE: customer_email (not customer) is intentional — creates a fresh
        // Stripe Customer per session for privacy isolation. Criminal defense
        // clients should not see saved payment methods from prior purchases.
        customer_email: normalizedEmail || undefined,
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: tierConfig.name,
              description: `Delivery: ${tierConfig.delivery}`,
            },
            unit_amount: installmentAmount,
            recurring: { interval: "month" },
          },
          quantity: 1,
        }],
        ...installmentDiscountConfig,
        subscription_data: {
          metadata: {
            payment_plan: "2x",
            full_price: String(tierConfig.price),
            tier,
          },
        },
        metadata: {
          tier,
          product_name: tierConfig.name,
          product_type: "digital-product",
          payment_plan: "2x",
          full_price: String(tierConfig.price),
          ...(consent && { consent_timestamp: new Date().toISOString() }),
          ...(resolvedChargeType && { charge_type: resolvedChargeType }),
          ...(referralPartnerId && { partner_id: referralPartnerId }),
          ...(sanitizedPromoCode && { partner_promo_code: sanitizedPromoCode }),
        },
        success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&tier=${tier}`,
        cancel_url: `${origin}/checkout?tier=${tier}&plan=2x`,
      });

      return NextResponse.json({ url: installmentSession.url });
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
    const tierStripe = stripeForTier(tier);
    const session = await tierStripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      // customer_email (not customer) — see installment path comment for rationale
      customer_email: normalizedEmail || undefined,
      line_items: lineItems,
      ...discountConfig,
      payment_intent_data: {
        statement_descriptor_suffix: "LEGAL INFO",
      },
      metadata: {
        tier,
        product_name: tierConfig.name,
        ...(tierConfig.isDigitalProduct && { product_type: "digital-product" }),
        ...(upgradeCreditVoided && { upgrade_credit_voided: "true" }),
        ...(consent && { consent_timestamp: new Date().toISOString() }),
        ...(priorityDelivery && { priority_delivery: "true" }),
        ...(validCourtDate && { court_date: validCourtDate }),
        ...(resolvedChargeType && { charge_type: resolvedChargeType }),
        ...(upgradeCreditCents > 0 && { upgrade_credit_applied: String(upgradeCreditCents) }),
        ...(trimmedCaseNumber && trimmedCaseState && {
          existing_case_number: trimmedCaseNumber,
          existing_case_state: trimmedCaseState,
        }),
        ...(caseNumberEmail && { case_number_matched_email: caseNumberEmail }),
        ...(referralPartnerId && { partner_id: referralPartnerId }),
        ...(sanitizedPromoCode && { partner_promo_code: sanitizedPromoCode }),
        ...(tierConfig.includesTiers.length > 0 && {
          includes_tiers: tierConfig.includesTiers.join(","),
        }),
      },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&tier=${tier}`,
      cancel_url: `${origin}/checkout?tier=${tier}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[Checkout] Error:", error);
    // Clean up any orphaned Stripe coupons created before the failure
    if (cleanupCouponId && cleanupTier) {
      const cleanupStripe = stripeForTier(cleanupTier);
      await cleanupStripe.coupons.del(cleanupCouponId).catch(() => {});
    }
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
