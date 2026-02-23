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
        .single();

      if (!warRoomOrder) {
        prerequisiteSkipped = true;
      }
    } else if (tier === "situation-room" && !email) {
      prerequisiteSkipped = true;
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
      metadata: {
        tier,
        product_name: tierConfig.name,
        ...(prerequisiteSkipped && { prerequisite_skipped: "true" }),
        ...(upgradeCreditVoided && { upgrade_credit_voided: "true" }),
        ...(consent && { consent_timestamp: new Date().toISOString() }),
        ...(priorityDelivery && { priority_delivery: "true" }),
        ...(courtDate && { court_date: courtDate }),
        ...(resolvedChargeType && { charge_type: resolvedChargeType }),
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
