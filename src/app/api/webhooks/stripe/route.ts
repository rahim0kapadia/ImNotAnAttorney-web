import { NextRequest, NextResponse } from "next/server";
import { stripe, TIERS, isValidTier } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";

const OPERATOR_EMAIL =
  process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com";

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

    if (!tier || !email || !amount) {
      console.error("[Stripe Webhook] Missing metadata:", { tier, email, amount });
      return NextResponse.json({ received: true });
    }

    const productName = session.metadata?.product_name || tier;

    const supabase = createAdminClient();
    const tierConfig = isValidTier(tier) ? TIERS[tier] : null;
    const requiresDiscovery = tierConfig?.requiresDiscovery ?? false;

    // Create order record
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert({
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
      })
      .select("id")
      .single();

    if (orderError) {
      console.error("[Stripe Webhook] Order insert error:", orderError);
      await sendEmail({
        to: OPERATOR_EMAIL,
        subject: `URGENT: Order insert failed for ${email}`,
        html: `<h1 style="color: #EF4444;">Order Insert Failed</h1>
          <p>Payment received but order record failed to create.</p>
          <p><strong>Customer:</strong> ${email}</p>
          <p><strong>Tier:</strong> ${tier}</p>
          <p><strong>Amount:</strong> $${(amount / 100).toFixed(2)}</p>
          <p><strong>Stripe Session:</strong> ${session.id}</p>
          <p><strong>Error:</strong> ${orderError.message}</p>
          <p><strong>Action:</strong> Manually create order record in Supabase.</p>`,
      });
    }

    // Create cases record for discovery tiers
    let caseId: string | null = null;
    if (requiresDiscovery && orderData) {
      caseId = crypto.randomUUID();
      const { error: caseError } = await supabase.from("cases").insert({
        id: caseId,
        order_id: orderData.id,
        email,
        tier,
        status: "pending",
        file_urls: [],
      });
      if (caseError) {
        console.error("[Stripe Webhook] Case insert error:", caseError);
        caseId = null;
        await sendEmail({
          to: OPERATOR_EMAIL,
          subject: `URGENT: Case creation failed for ${email}`,
          html: `<h1 style="color: #EF4444;">Case Creation Failed</h1>
            <p>Payment received but case record failed to create.</p>
            <p><strong>Customer:</strong> ${email}</p>
            <p><strong>Tier:</strong> ${tier}</p>
            <p><strong>Order ID:</strong> ${orderData.id}</p>
            <p><strong>Error:</strong> ${caseError.message}</p>
            <p><strong>Action:</strong> Manually create case and send upload link to customer.</p>`,
        });
      }
    }

    // Build upload section for discovery tier emails
    const uploadSection = caseId
      ? `
        <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border: 1px solid #F59E0B;">
          <p style="margin: 0; color: white; font-weight: bold;">Next Step: Upload Your Discovery Documents</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;">Your ${escapeHtml(productName)} requires discovery documents for analysis. Upload them here:</p>
          <a href="https://imnotanattorney.com/upload?case=${caseId}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px;">Upload Discovery Documents</a>
        </div>
      `
      : "";

    // Send payment confirmation email
    await sendEmail({
      to: email,
      subject: `Payment Confirmed — Your ${escapeHtml(productName)} is Being Prepared`,
      unsubscribeEmail: email,
      html: `
        <h1 style="color: #F59E0B;">Payment Received</h1>
        <p>Thank you for your purchase. Your <strong>${escapeHtml(productName)}</strong> is now being prepared.</p>
        <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
          <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Product:</strong> ${escapeHtml(productName)}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Amount:</strong> $${(amount / 100).toFixed(2)}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Delivery:</strong> ${tierConfig?.delivery ?? "We'll be in touch"}</p>
        </div>
        ${uploadSection}
        <p style="color: #A1A1AA;">We'll email you when your report is ready. Keep an eye on your inbox.</p>
      `,
    });

    // Send operator notification
    await sendEmail({
      to: OPERATOR_EMAIL,
      subject: `New Order: ${escapeHtml(productName)} — $${(amount / 100).toFixed(2)}`,
      html: `
        <h1 style="color: #F59E0B;">New Order Received</h1>
        <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
          <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Product:</strong> ${escapeHtml(productName)}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${email}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Amount:</strong> $${(amount / 100).toFixed(2)}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${tier}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Stripe Session:</strong> ${session.id}</p>
          ${caseId ? `<p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${caseId}</p>` : ""}
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Requires Discovery:</strong> ${requiresDiscovery ? "Yes" : "No"}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Time:</strong> ${new Date().toISOString()}</p>
        </div>
      `,
    });
  }

  return NextResponse.json({ received: true });
}
