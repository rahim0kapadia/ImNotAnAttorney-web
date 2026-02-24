import { NextRequest, NextResponse } from "next/server";
import { stripe, TIERS, isValidTier } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tier, email, consent, priorityDelivery, courtDate, chargeType } = body;

    if (!tier || !isValidTier(tier)) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    const tierConfig = TIERS[tier];
    const origin = req.headers.get("origin") || "https://imnotanattorney.com";
    const supabase = createAdminClient();

    // Capture email for abandonment recovery
    if (email) {
      await supabase.from("subscribers").upsert(
        { email: email.toLowerCase(), source: "checkout" },
        { onConflict: "email" }
      );
    }

    // Auto-detect charge type from prior intake if not provided
    let resolvedChargeType = chargeType || null;
    if (!resolvedChargeType && email) {
      const { data: priorIntake } = await supabase
        .from("intakes")
        .select("charge_type")
        .eq("email", email.toLowerCase())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (priorIntake?.charge_type) {
        resolvedChargeType = priorIntake.charge_type;
      }
    }

    // Check for prior refunds — void upgrade credit if found
    let upgradeCreditVoided = false;
    if (email) {
      const { data: refundedOrder } = await supabase
        .from("orders")
        .select("id")
        .eq("email", email.toLowerCase())
        .eq("status", "refunded")
        .limit(1)
        .maybeSingle();

      if (refundedOrder) {
        upgradeCreditVoided = true;
      }
    }

    // Situation Room prerequisite check
    let prerequisiteSkipped = false;
    if (tier === "situation-room" && email) {
      const { data: warRoomOrder } = await supabase
        .from("orders")
        .select("id")
        .eq("email", email.toLowerCase())
        .eq("tier", "war-room")
        .eq("status", "paid")
        .limit(1)
        .maybeSingle();

      if (!warRoomOrder) {
        prerequisiteSkipped = true;
      }
    } else if (tier === "situation-room" && !email) {
      prerequisiteSkipped = true;
    }

    // Server-side consent validation for $1,497+ tiers
    if (tierConfig.price >= 149700 && !consent) {
      return NextResponse.json(
        { error: "Consent required for this tier" },
        { status: 400 }
      );
    }

    // Calculate upgrade credits from prior paid orders (12-month window)
    let upgradeCreditCents = 0;
    let stripeCouponId: string | undefined;
    if (email && !upgradeCreditVoided) {
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

      const { data: priorOrders } = await supabase
        .from("orders")
        .select("amount")
        .eq("email", email.toLowerCase())
        .eq("status", "paid")
        .gte("paid_at", twelveMonthsAgo.toISOString());

      if (priorOrders && priorOrders.length > 0) {
        upgradeCreditCents = priorOrders.reduce(
          (sum: number, o: { amount: number }) => sum + (o.amount || 0),
          0
        );
      }

      if (upgradeCreditCents > 0) {
        // Cap credit at total session price
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

    // Build line items
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

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email || undefined,
      line_items: lineItems,
      ...(stripeCouponId && { discounts: [{ coupon: stripeCouponId }] }),
      metadata: {
        tier,
        product_name: tierConfig.name,
        ...(prerequisiteSkipped && { prerequisite_skipped: "true" }),
        ...(upgradeCreditVoided && { upgrade_credit_voided: "true" }),
        ...(consent && { consent_timestamp: new Date().toISOString() }),
        ...(priorityDelivery && { priority_delivery: "true" }),
        ...(courtDate && { court_date: courtDate }),
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
