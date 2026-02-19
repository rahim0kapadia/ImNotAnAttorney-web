import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const tier = session.metadata?.tier;
    const email = session.customer_email || session.customer_details?.email;
    const amount = session.amount_total;
    const productName = session.metadata?.product_name || tier;

    if (!tier || !email || !amount) {
      console.error("[Stripe Webhook] Missing metadata:", { tier, email, amount });
      return NextResponse.json({ received: true });
    }

    const supabase = createAdminClient();

    // Create order record
    const { error: orderError } = await supabase.from("orders").insert({
      email,
      tier,
      amount,
      status: "paid",
      stripe_session_id: session.id,
      stripe_payment_intent_id:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : null,
      paid_at: new Date().toISOString(),
    });

    if (orderError) {
      console.error("[Stripe Webhook] Order insert error:", orderError);
    }

    // Send payment confirmation email
    await sendEmail({
      to: email,
      subject: `Payment Confirmed — Your ${productName} is Being Prepared`,
      html: `
        <h1 style="color: #F59E0B;">Payment Received</h1>
        <p>Thank you for your purchase. Your <strong>${productName}</strong> is now being prepared.</p>
        <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
          <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Product:</strong> ${productName}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Amount:</strong> $${(amount / 100).toFixed(2)}</p>
        </div>
        <p style="color: #A1A1AA;">We'll email you when your report is ready. Keep an eye on your inbox.</p>
        <p style="color: #A1A1AA; font-size: 14px;">If you purchased The X-Ray, War Room, or Situation Room, you'll receive a link to upload your discovery documents shortly.</p>
      `,
    });
  }

  return NextResponse.json({ received: true });
}
