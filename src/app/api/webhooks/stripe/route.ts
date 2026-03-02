/**
 * @file /api/webhooks/stripe — Stripe webhook handler
 *
 * Pipeline position: Entry point for all payment events. This is where
 * paid cases are born and refunded cases are terminated.
 *
 * Handles two event types:
 *
 * 1. `checkout.session.completed` — Customer just paid
 *    Flow: Create order → Create case → Link intake (if exists) → Trigger generation (case-decoder)
 *    Status assignments:
 *      - "intake"           — Intake exists + non-discovery tier → ready for generation
 *      - "awaiting-intake"  — No intake found → email customer to fill intake form
 *      - "pending"          — Intake exists + discovery tier → waiting for document upload
 *
 * 2. `charge.refunded` — Stripe processed a refund (full or partial)
 *    Flow: Update order status → Update case status → Notify operator
 *    Business rules:
 *      - Full refund: order.status → "refunded", case.status → "refunded", report access revoked
 *      - Partial refund: order stays "paid", only refunded_at timestamp logged for audit
 *
 * Key patterns:
 *   - Duplicate webhook handling via Postgres unique constraint (error code 23505)
 *   - Email normalization: all emails lowercased + trimmed before storage/lookup
 *   - Fire-and-forget generation trigger (doesn't block webhook response)
 *   - Operator alerts on every failure path (order insert, case insert, email delivery)
 *
 * Security: Stripe signature verification using STRIPE_WEBHOOK_SECRET.
 * Stripe retries webhooks up to 3 times over 72 hours on non-2xx responses.
 */

import { NextRequest, NextResponse } from "next/server";
import { stripe, TIERS, isValidTier } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";

/** Fallback operator email if OPERATOR_EMAIL env var is not set. */
const OPERATOR_EMAIL =
  process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com";

/**
 * Sends an email with one automatic retry after a 2-second delay.
 * If both attempts fail, sends an alert to the operator so the email
 * can be sent manually. This prevents silent email delivery failures
 * from leaving customers in the dark after payment.
 *
 * @param params - Email parameters (to, subject, html, etc.)
 * @param context - Human-readable description of what this email is for (used in operator alert)
 * @returns The result of the last send attempt
 */
async function sendEmailWithRetry(
  params: Parameters<typeof sendEmail>[0],
  context: string
) {
  const result = await sendEmail(params);
  if (result.success) return result;

  // First attempt failed — wait 2s and retry (transient Resend API errors)
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const retry = await sendEmail(params);
  if (retry.success) return retry;

  // Both failed — notify operator so they can send manually
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
  // ──────────────────────────────────────────────────────────────
  // STRIPE SIGNATURE VERIFICATION
  // ──────────────────────────────────────────────────────────────
  // Stripe signs every webhook payload with STRIPE_WEBHOOK_SECRET.
  // This prevents forged webhook calls. We read the raw body (not
  // parsed JSON) because signature verification requires the exact
  // bytes Stripe sent.
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[Stripe Webhook] Missing STRIPE_WEBHOOK_SECRET env var");
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 500 }
      );
    }
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ================================================================
  // EVENT: checkout.session.completed
  // ================================================================
  // Fires when a customer completes payment through Stripe Checkout.
  // This is the primary order creation path — every paid customer
  // flows through here.
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    // ──────────────────────────────────────────────────────────────
    // EXTRACT & NORMALIZE METADATA
    // ──────────────────────────────────────────────────────────────
    // `tier` is set in checkout session metadata when creating the session.
    // Email normalization (lowercase + trim) ensures consistent lookup
    // across intakes, subscribers, and cases — prevents "User@Gmail.com"
    // and "user@gmail.com" from being treated as different customers.
    const tier = session.metadata?.tier;
    const rawEmail = session.customer_email || session.customer_details?.email;
    const email = rawEmail ? rawEmail.toLowerCase().trim() : null;
    const amount = session.amount_total;

    if (!tier || !email || amount == null) {
      console.error("[Stripe Webhook] Missing metadata:", { tier, email, amount });
      return NextResponse.json({ received: true });
    }

    const productName = session.metadata?.product_name || tier;
    const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";

    const supabase = createAdminClient();
    const tierConfig = isValidTier(tier) ? TIERS[tier] : null;
    const requiresDiscovery = tierConfig?.requiresDiscovery ?? false;

    // ──────────────────────────────────────────────────────────────
    // CREATE ORDER RECORD
    // ──────────────────────────────────────────────────────────────
    // The orders table has a unique constraint on stripe_session_id.
    // If Stripe retries this webhook (e.g., our response was slow),
    // the INSERT will fail with error code 23505 (unique violation).
    // We treat that as a successful no-op rather than an error.
    //
    // Fields from checkout metadata:
    //   - priority_delivery: customer paid for expedited processing
    //   - court_date: urgency signal for operator prioritization
    //   - consent_timestamp: when customer agreed to terms (legal compliance)
    //   - upgrade_credit_applied: cents credited from a previous tier purchase
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
        priority_delivery: session.metadata?.priority_delivery === "true",
        court_date: session.metadata?.court_date || null,
        consent_timestamp: session.metadata?.consent_timestamp || null,
        upgrade_credit_applied: session.metadata?.upgrade_credit_applied
          ? parseInt(session.metadata.upgrade_credit_applied, 10)
          : 0,
      })
      .select("id")
      .single();

    if (orderError) {
      // ── DUPLICATE WEBHOOK HANDLING ──
      // Stripe retries webhooks on timeout/5xx. The unique constraint on
      // stripe_session_id causes a 23505 error on duplicate INSERTs.
      // This is expected behavior — return 200 so Stripe stops retrying.
      const isDuplicate = orderError.code === "23505" || orderError.message?.includes("duplicate");
      if (isDuplicate) {
        console.log("[Stripe Webhook] Duplicate webhook event, skipping:", session.id);
        return NextResponse.json({ received: true });
      }

      // ── GENUINE ORDER INSERT FAILURE ──
      // Payment was collected but we couldn't record it. This is critical —
      // operator must manually create the order in Supabase.
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

    // ──────────────────────────────────────────────────────────────
    // CREATE CASE RECORD + LINK INTAKE
    // ──────────────────────────────────────────────────────────────
    // Cases are created for ALL tiers (not just discovery tiers) so every
    // purchase has a trackable lifecycle. The case status depends on two factors:
    //
    //   1. Does an intake exist for this email?
    //      - YES + non-discovery tier → "intake" (ready for generation)
    //      - YES + discovery tier → "pending" (waiting for document upload)
    //      - NO → "awaiting-intake" (customer needs to fill the intake form)
    //
    //   2. Intake linking: We find the most recent intake by email match.
    //      This handles the common flow where a customer fills the intake
    //      form BEFORE paying. The charge_type from the intake is copied
    //      to the case for quick reference in operator dashboards.
    let caseId: string | null = null;
    if (orderData) {
      caseId = crypto.randomUUID();

      // Look up the most recent intake for this email to auto-link
      const { data: linkedIntake } = await supabase
        .from("intakes")
        .select("id, charge_type")
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const hasIntake = !!linkedIntake;
      // Store charge_type on case from linked intake for operator visibility
      const chargeType = linkedIntake?.charge_type || null;

      // ── STATUS ASSIGNMENT LOGIC ──
      // hasIntake + non-discovery → "intake" → generation can start immediately
      // hasIntake + discovery → "pending" → needs document upload first
      // no intake → "awaiting-intake" → customer gets email to fill intake form
      const caseStatus = hasIntake
        ? (requiresDiscovery ? "pending" : "intake")
        : "awaiting-intake";

      const { error: caseError } = await supabase.from("cases").insert({
        id: caseId,
        order_id: orderData.id,
        email: email,
        tier,
        status: caseStatus,
        intake_id: linkedIntake?.id || null,
        charge_type: chargeType,
        file_urls: [],
      });

      if (caseError) {
        // Case creation failed — operator must create manually.
        // Order exists but has no linked case, so services can't be delivered
        // until the operator intervenes.
        console.error("[Stripe Webhook] Case insert error:", caseError);
        caseId = null;
        await sendEmail({
          to: OPERATOR_EMAIL,
          subject: `URGENT: Case creation failed for ${escapeHtml(email)}`,
          html: `<h1 style="color: #EF4444;">Case Creation Failed</h1>
            <p>Payment received but case record failed to create.</p>
            <p><strong>Customer:</strong> ${escapeHtml(email)}</p>
            <p><strong>Tier:</strong> ${tier}</p>
            <p><strong>Order ID:</strong> ${orderData.id}</p>
            <p><strong>Error:</strong> ${caseError.message}</p>
            <p><strong>Action:</strong> Manually create case.</p>`,
        });
      }

      // ──────────────────────────────────────────────────────────────
      // INCLUDED-TIER CASE CREATION (tier inclusion model)
      // ──────────────────────────────────────────────────────────────
      // When a customer buys IB ($997), they also get a Case Decoder
      // delivered within 24 hours. When they buy X-Ray ($1,497), they
      // get CD + IB. Each included tier gets its own case record with
      // is_included_deliverable=true so the system can track and
      // deliver them independently.
      //
      // Upgrade dedup: If the customer already has a delivered case
      // for an included tier (matched by email OR court case number),
      // skip creating a duplicate — link to the existing one instead.
      const existingCaseNumber = session.metadata?.existing_case_number;
      const existingCaseState = session.metadata?.existing_case_state;

      if (caseId && tierConfig?.includesTiers && tierConfig.includesTiers.length > 0) {
        for (const includedTier of tierConfig.includesTiers) {
          // Check if customer already has a delivered case for this tier (by email)
          const { data: existingCase } = await supabase
            .from("cases")
            .select("id")
            .eq("email", email)
            .eq("tier", includedTier)
            .eq("status", "delivered")
            .limit(1)
            .maybeSingle();

          if (existingCase) {
            console.log(`[Webhook] Skipping included ${includedTier} — customer already has delivered case ${existingCase.id} (email match)`);
            continue;
          }

          // Also check by court case number (different email, same defendant)
          if (existingCaseNumber && existingCaseState) {
            const { data: caseNumberMatch } = await supabase
              .from("cases")
              .select("id")
              .eq("court_case_number", existingCaseNumber)
              .eq("court_state", existingCaseState)
              .eq("tier", includedTier)
              .eq("status", "delivered")
              .limit(1)
              .maybeSingle();

            if (caseNumberMatch) {
              console.log(`[Webhook] Skipping included ${includedTier} — customer already has delivered case ${caseNumberMatch.id} (case number match)`);
              continue;
            }
          }

          const includedCaseId = crypto.randomUUID();
          const includedTierConfig = isValidTier(includedTier) ? TIERS[includedTier] : null;
          const includedRequiresDiscovery = includedTierConfig?.requiresDiscovery ?? false;

          const includedCaseStatus = hasIntake
            ? (includedRequiresDiscovery ? "pending" : "intake")
            : "awaiting-intake";

          const { error: includedCaseError } = await supabase.from("cases").insert({
            id: includedCaseId,
            order_id: orderData.id,
            email: email,
            tier: includedTier,
            status: includedCaseStatus,
            intake_id: linkedIntake?.id || null,
            charge_type: chargeType,
            file_urls: [],
            is_included_deliverable: true,
            parent_order_id: orderData.id,
          });

          if (includedCaseError) {
            console.error(`[Webhook] Included case insert error (${includedTier}):`, includedCaseError);
            continue;
          }

          // Auto-trigger CD generation for included case-decoder
          if (includedTier === "case-decoder" && hasIntake) {
            fetch(`${origin}/api/generate/case-decoder`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.OPERATOR_SECRET}`,
              },
              body: JSON.stringify({ caseId: includedCaseId }),
            }).catch((err) =>
              console.error("[Webhook] Auto-trigger included CD generation failed:", err)
            );
          }
        }
      }

      // ──────────────────────────────────────────────────────────────
      // AUTO-TRIGGER: Case Decoder report generation (standalone)
      // ──────────────────────────────────────────────────────────────
      // Only standalone case-decoder tier gets auto-triggered here.
      // Included CDs are triggered in the inclusion loop above.
      //
      // Two paths:
      //   A. Intake exists → Fire-and-forget to /api/generate/case-decoder
      //   B. No intake → Email customer with a link to the intake form.
      if (caseId && tier === "case-decoder") {
        if (hasIntake) {
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

      // For IB+ tiers without intake, email customer to complete intake
      if (caseId && tier !== "case-decoder" && tierConfig?.includesTiers && tierConfig.includesTiers.length > 0 && !hasIntake) {
        await sendEmailWithRetry({
          to: email,
          subject: `Complete Your Case Details — Your ${escapeHtml(productName)} Package`,
          unsubscribeEmail: email,
          html: `
            <h1 style="color: #F59E0B;">One More Step</h1>
            <p>Thank you for purchasing the ${escapeHtml(productName)}. Before we can start generating your reports, we need your case details.</p>
            <p style="color: #D4D4D8;">Your package includes a Case Decoder report delivered within 24 hours, followed by your full ${escapeHtml(productName)}.</p>
            <a href="${origin}/intake?email=${encodeURIComponent(email)}&tier=${encodeURIComponent(tier)}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Complete Your Case Details</a>
            <p style="color: #A1A1AA;">Once you submit your case details, your Case Decoder report will be generated within 24 hours.</p>
          `,
        }, `intake request for ${email} (${tier})`);
      }
    }

    // ──────────────────────────────────────────────────────────────
    // DISCOVERY UPLOAD SECTION (for payment confirmation email)
    // ──────────────────────────────────────────────────────────────
    // Discovery tiers ($1,497+) require the customer to upload their
    // discovery documents. This section is injected into the payment
    // confirmation email only for those tiers.
    const uploadSection = (caseId && requiresDiscovery)
      ? `
        <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border: 1px solid #F59E0B;">
          <p style="margin: 0; color: white; font-weight: bold;">Next Step: Upload Your Discovery Documents</p>
          <p style="margin: 8px 0 0; color: #D4D4D8;">Your ${escapeHtml(productName)} requires discovery documents for analysis. Upload them here:</p>
          <a href="${origin}/upload?case=${caseId}&email=${encodeURIComponent(email)}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px;">Upload Discovery Documents</a>
        </div>
      `
      : "";

    // ──────────────────────────────────────────────────────────────
    // PAYMENT CONFIRMATION EMAIL (to customer)
    // ──────────────────────────────────────────────────────────────
    // Sent for every successful payment. Includes:
    //   - Product name, amount, expected delivery timeframe
    //   - Upload section (discovery tiers only)
    //   - Unsubscribe link (CAN-SPAM compliance)
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

    // NOTE: Drip recording was intentionally removed from this webhook.
    // Previously, we recorded post_{tier}_delivery here at payment time, which
    // caused the actual delivery drip email to be skipped (it thought it was
    // already sent). Delivery drip is now recorded in /api/deliver after the
    // report is actually delivered to the customer.

    // ──────────────────────────────────────────────────────────────
    // OPERATOR NOTIFICATION EMAIL
    // ──────────────────────────────────────────────────────────────
    // Every payment triggers an operator email with full order details.
    // This is the operator's primary awareness mechanism for new orders.
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
          ${session.metadata?.prerequisite_skipped === "true" ? '<p style="margin: 8px 0 0; color: #EF4444;"><strong>WARNING: War Room prerequisite NOT confirmed — customer may not have completed War Room.</strong></p>' : ""}
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Time:</strong> ${new Date().toISOString()}</p>
        </div>
      `,
    }, `operator notification for ${email}`);
  }

  // ================================================================
  // EVENT: charge.refunded
  // ================================================================
  // Fires when Stripe processes a refund (initiated via Stripe Dashboard
  // or API). Handles both full and partial refunds differently:
  //
  // Full refund:
  //   - order.status → "refunded" (upgrade credits voided)
  //   - case.status → "refunded" (report access revoked)
  //   - Operator notified
  //
  // Partial refund:
  //   - order.status stays "paid" (upgrade credits preserved)
  //   - case.status unchanged (report access preserved)
  //   - refunded_at timestamp logged for audit trail
  //   - Operator notified
  //
  // Business rationale: Partial refunds are typically goodwill gestures
  // (e.g., late delivery). Revoking access would damage the relationship.
  // Full refunds indicate a complete cancellation — access must be revoked
  // and the drip cron (Part 2) will skip refunded orders.
  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    // payment_intent links the charge back to our order record
    const paymentIntentId =
      typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : null;

    if (paymentIntentId) {
      const supabase = createAdminClient();

      // Determine if full or partial refund by comparing refunded amount to total
      const isFullRefund = charge.amount_refunded === charge.amount;

      if (isFullRefund) {
        // ── FULL REFUND: Mark order as refunded, revoke report access ──
        const { error: refundError } = await supabase
          .from("orders")
          .update({
            status: "refunded",
            refunded_at: new Date().toISOString(),
          })
          .eq("stripe_payment_intent_id", paymentIntentId);

        if (refundError) {
          console.error("[Stripe Webhook] Refund update error:", refundError);
          // DB update failed — don't send "refund processed" notification
          // because the refund wasn't actually recorded. Return early.
          return NextResponse.json({ received: true });
        }
      } else {
        // ── PARTIAL REFUND: Log timestamp for audit, keep order active ──
        await supabase
          .from("orders")
          .update({ refunded_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", paymentIntentId);
      }

      // ── LOOKUP REFUNDED ORDER for case linking + operator notification ──
      const { data: refundedOrder } = await supabase
        .from("orders")
        .select("id, email, tier, amount")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .single();

      if (refundedOrder) {
        if (isFullRefund) {
          // ── UPDATE LINKED CASE STATUS ──
          // Setting case to "refunded" causes:
          //   1. Report page returns 403 (access revoked)
          //   2. Drip cron skips this order (Part 2 filters by status:"paid")
          //   3. Upgrade credit is voided (cannot be applied to future purchases)
          await supabase
            .from("cases")
            .update({
              status: "refunded",
              updated_at: new Date().toISOString(),
            })
            .eq("order_id", refundedOrder.id);
        }

        // ── CUSTOMER NOTIFICATION (partial refunds only) ──
        // Full refunds: Stripe sends its own receipt. Partial refunds: customer
        // gets no notification from Stripe, so we send one.
        if (!isFullRefund) {
          const partialRefundAmount = (charge.amount_refunded / 100).toFixed(2);
          await sendEmailWithRetry({
            to: refundedOrder.email,
            subject: `Partial Refund Processed — $${partialRefundAmount}`,
            unsubscribeEmail: refundedOrder.email,
            html: `
              <h1 style="color: #F59E0B;">Partial Refund Issued</h1>
              <p>We've issued a partial refund of <strong>$${partialRefundAmount}</strong> to your original payment method.</p>
              <p>You should see this reflected in 1-3 business days depending on your bank.</p>
              <p style="color: #A1A1AA;">Your report access and any upgrade credits remain active.</p>
            `,
          }, `partial refund notification for ${refundedOrder.email}`);
        }

        // ── OPERATOR NOTIFICATION ──
        // Always notify operator for both full and partial refunds
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

  // ================================================================
  // EVENT: charge.refund.updated — Refund bounce detection (E10)
  // ================================================================
  // Fires when a refund's status changes. If it fails or requires action,
  // alert the operator so they can resolve it manually via Stripe dashboard.
  if (event.type === "charge.refund.updated") {
    const refund = event.data.object;
    if (refund.status === "failed" || refund.status === "requires_action") {
      await sendEmail({
        to: OPERATOR_EMAIL,
        subject: `ALERT: Refund ${refund.status} — ${escapeHtml(refund.id)}`,
        html: `<h1 style="color: #EF4444;">Refund ${escapeHtml(refund.status)}</h1>
          <p>A refund has ${refund.status === "failed" ? "failed" : "stalled and requires action"}.</p>
          <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
            <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Refund ID:</strong> ${escapeHtml(refund.id)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Amount:</strong> $${((refund.amount || 0) / 100).toFixed(2)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Status:</strong> ${escapeHtml(refund.status)}</p>
          </div>
          <p><strong>Action:</strong> Check Stripe dashboard and resolve manually.</p>`,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // ACKNOWLEDGE WEBHOOK
  // ──────────────────────────────────────────────────────────────
  // Always return 200 to Stripe. Non-2xx causes retries (up to 3x over 72h).
  // Even if internal processing fails, we handle it via operator alerts
  // rather than letting Stripe re-deliver (which could cause duplicates).
  return NextResponse.json({ received: true });
}
