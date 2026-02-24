import { NextRequest, NextResponse } from "next/server";
import { stripe, TIERS, isValidTier } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";

const OPERATOR_EMAIL =
  process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com";

/** sendEmail with one retry after 2s. If both fail, notify operator. */
async function sendEmailWithRetry(
  params: Parameters<typeof sendEmail>[0],
  context: string
) {
  const result = await sendEmail(params);
  if (result.success) return result;

  await new Promise((resolve) => setTimeout(resolve, 2000));
  const retry = await sendEmail(params);
  if (retry.success) return retry;

  // Both failed — notify operator
  console.error(`[Webhook] Email failed after retry: ${context}`, retry.error);
  await sendEmail({
    to: OPERATOR_EMAIL,
    subject: `ALERT: Email delivery failed — ${context}`,
    html: `<h1 style="color: #EF4444;">Email Delivery Failed</h1>
      <p><strong>Context:</strong> ${escapeHtml(context)}</p>
      <p><strong>Recipient:</strong> ${escapeHtml(params.to)}</p>
      <p><strong>Subject:</strong> ${escapeHtml(params.subject)}</p>
      <p><strong>Error:</strong> ${escapeHtml(retry.error || "Unknown")}</p>
      <p>Both attempts failed. Please send this email manually.</p>`,
  });
  return retry;
}

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
    const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";

    const supabase = createAdminClient();
    const tierConfig = isValidTier(tier) ? TIERS[tier] : null;
    const requiresDiscovery = tierConfig?.requiresDiscovery ?? false;

    // Create order record
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert({
        email: email.toLowerCase(),
        tier,
        amount,
        status: "paid",
        stripe_session_id: session.id,
        stripe_payment_intent_id:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : null,
        paid_at: new Date().toISOString(),
        priority_delivery: session.metadata?.priority_delivery === "true",
        court_date: session.metadata?.court_date || null,
        consent_timestamp: session.metadata?.consent_timestamp || null,
      })
      .select("id")
      .single();

    if (orderError) {
      // Check if this is a duplicate (unique constraint violation) — Stripe retries webhooks
      const isDuplicate = orderError.code === "23505" || orderError.message?.includes("duplicate");
      if (isDuplicate) {
        console.log("[Stripe Webhook] Duplicate webhook event, skipping:", session.id);
        return NextResponse.json({ received: true });
      }

      console.error("[Stripe Webhook] Order insert error:", orderError);
      await sendEmail({
        to: OPERATOR_EMAIL,
        subject: `URGENT: Order insert failed for ${escapeHtml(email)}`,
        html: `<h1 style="color: #EF4444;">Order Insert Failed</h1>
          <p>Payment received but order record failed to create.</p>
          <p><strong>Customer:</strong> ${escapeHtml(email)}</p>
          <p><strong>Tier:</strong> ${escapeHtml(tier)}</p>
          <p><strong>Amount:</strong> $${(amount / 100).toFixed(2)}</p>
          <p><strong>Stripe Session:</strong> ${escapeHtml(session.id)}</p>
          <p><strong>Error:</strong> ${escapeHtml(orderError.message)}</p>
          <p><strong>Action:</strong> Manually create order record in Supabase.</p>`,
      });
    }

    // CHANGE #1: Create case record for ALL tiers (not just discovery tiers)
    let caseId: string | null = null;
    if (orderData) {
      caseId = crypto.randomUUID();

      // CHANGE #2: Link intake to case by email match
      const { data: linkedIntake } = await supabase
        .from("intakes")
        .select("id, charge_type")
        .eq("email", email.toLowerCase())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const hasIntake = !!linkedIntake;
      // CHANGE #3: Store charge_type on case from linked intake
      const chargeType = linkedIntake?.charge_type || null;

      const caseStatus = hasIntake
        ? (requiresDiscovery ? "pending" : "intake")
        : "awaiting-intake";

      const { error: caseError } = await supabase.from("cases").insert({
        id: caseId,
        order_id: orderData.id,
        email,
        tier,
        status: caseStatus,
        intake_id: linkedIntake?.id || null,
        charge_type: chargeType,
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
            <p><strong>Action:</strong> Manually create case.</p>`,
        });
      }

      // CHANGE #5: Trigger report generation or request intake
      if (caseId && tier === "case-decoder") {
        if (hasIntake) {
          // Fire-and-forget report generation
          fetch(`${origin}/api/generate/case-decoder`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.OPERATOR_SECRET}`,
            },
            body: JSON.stringify({ caseId }),
          }).catch((err) =>
            console.error("[Webhook] Auto-trigger report generation failed:", err)
          );
        } else {
          // No intake — email customer to complete intake form
          await sendEmailWithRetry({
            to: email,
            subject: "Complete Your Case Details to Start Your Report",
            unsubscribeEmail: email,
            html: `
              <h1 style="color: #F59E0B;">One More Step</h1>
              <p>Thank you for purchasing the Case Decoder. Before we can generate your personalized report, we need your case details.</p>
              <a href="${origin}/intake?email=${encodeURIComponent(email)}&tier=case-decoder" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Complete Your Case Details</a>
              <p style="color: #A1A1AA;">Once you submit your case details, your report will be generated within 24 hours.</p>
            `,
          }, `intake request for ${email}`);
        }
      }
    }

    // Build upload section for discovery tier emails
    const uploadSection = (caseId && requiresDiscovery)
      ? `
        <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border: 1px solid #F59E0B;">
          <p style="margin: 0; color: white; font-weight: bold;">Next Step: Upload Your Discovery Documents</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;">Your ${escapeHtml(productName)} requires discovery documents for analysis. Upload them here:</p>
          <a href="${origin}/upload?case=${caseId}&email=${encodeURIComponent(email)}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px;">Upload Discovery Documents</a>
        </div>
      `
      : "";

    // CHANGE #8: Send payment confirmation email with retry
    await sendEmailWithRetry({
      to: email,
      subject: `Payment Confirmed — Your ${escapeHtml(productName)} is Being Prepared`,
      unsubscribeEmail: email,
      html: `
        <h1 style="color: #F59E0B;">Payment Received</h1>
        <p>You're the kind of defendant who does their homework. Your <strong>${escapeHtml(productName)}</strong> is being prepared now.</p>
        <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
          <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Product:</strong> ${escapeHtml(productName)}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Amount:</strong> $${(amount / 100).toFixed(2)}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Delivery:</strong> ${tierConfig?.delivery ?? "We'll be in touch"}</p>
        </div>
        ${uploadSection}
        <p style="color: #A1A1AA;">We'll email you when your report is ready. Keep an eye on your inbox.</p>
      `,
    }, `payment confirmation for ${email}`);

    // CHANGE #4: Remove premature drip recording — delivery drip is now handled
    // by /api/deliver after actual delivery, not at payment time.
    // (Previously recorded post_{tier}_delivery here, which prevented the actual
    // delivery email from firing via the cron.)

    // Send operator notification
    await sendEmailWithRetry({
      to: OPERATOR_EMAIL,
      subject: `New Order: ${escapeHtml(productName)} — $${(amount / 100).toFixed(2)}`,
      html: `
        <h1 style="color: #F59E0B;">New Order Received</h1>
        <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
          <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Product:</strong> ${escapeHtml(productName)}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(email)}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Amount:</strong> $${(amount / 100).toFixed(2)}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${escapeHtml(tier)}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Stripe Session:</strong> ${escapeHtml(session.id)}</p>
          ${caseId ? `<p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Case ID:</strong> ${caseId}</p>` : ""}
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Requires Discovery:</strong> ${requiresDiscovery ? "Yes" : "No"}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Intake Found:</strong> ${caseId ? (requiresDiscovery ? "N/A (discovery tier)" : "Check case status") : "Case creation failed"}</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Time:</strong> ${new Date().toISOString()}</p>
        </div>
      `,
    }, `operator notification for ${email}`);
  }

  // CHANGE #6: Refund handler — also update linked case status
  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    const paymentIntentId =
      typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : null;

    if (paymentIntentId) {
      const supabase = createAdminClient();

      // Determine if full or partial refund
      const isFullRefund = charge.amount_refunded === charge.amount;

      if (isFullRefund) {
        // Full refund: mark order as refunded, revoke report access
        const { error: refundError } = await supabase
          .from("orders")
          .update({
            status: "refunded",
            refunded_at: new Date().toISOString(),
          })
          .eq("stripe_payment_intent_id", paymentIntentId);

        if (refundError) {
          console.error("[Stripe Webhook] Refund update error:", refundError);
        }
      } else {
        // Partial refund: log refunded_at for audit but keep status "paid"
        await supabase
          .from("orders")
          .update({ refunded_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", paymentIntentId);
      }

      // Get the refunded order to find linked case
      const { data: refundedOrder } = await supabase
        .from("orders")
        .select("id, email, tier, amount")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .single();

      if (refundedOrder) {
        if (isFullRefund) {
          // Update linked case status to refunded
          await supabase
            .from("cases")
            .update({
              status: "refunded",
              updated_at: new Date().toISOString(),
            })
            .eq("order_id", refundedOrder.id);
        }

        // Notify operator
        const refundAmount = (charge.amount_refunded / 100).toFixed(2);
        const totalAmount = ((refundedOrder.amount || 0) / 100).toFixed(2);
        await sendEmail({
          to: OPERATOR_EMAIL,
          subject: `${isFullRefund ? "Full" : "Partial"} Refund: ${escapeHtml(refundedOrder.tier)} — $${refundAmount}`,
          html: `<h1 style="color: #EF4444;">${isFullRefund ? "Full" : "Partial"} Refund Processed</h1>
            <p><strong>Customer:</strong> ${escapeHtml(refundedOrder.email)}</p>
            <p><strong>Tier:</strong> ${escapeHtml(refundedOrder.tier)}</p>
            <p><strong>Refunded:</strong> $${refundAmount} of $${totalAmount}</p>
            ${isFullRefund
              ? "<p><strong>Note:</strong> Upgrade credits voided. Case status updated to 'refunded'. Report access revoked.</p>"
              : "<p><strong>Note:</strong> Partial refund — order remains 'paid'. Upgrade credits and report access preserved.</p>"}`,
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
