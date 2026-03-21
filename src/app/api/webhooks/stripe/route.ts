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
 *   - Generation trigger via after() (runs post-response, GC-safe on Vercel)
 *   - Operator alerts on every failure path (order insert, case insert, email delivery)
 *
 * Security: Stripe signature verification using STRIPE_WEBHOOK_SECRET.
 * Stripe retries webhooks up to 3 times over 72 hours on non-2xx responses.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { stripe, TIERS, isValidTier, stripeForTier } from "@/lib/stripe";
import { TIER_CORE, upgradeCostBetween, type TierSlug } from "@/lib/tiers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, sendEmailWithOperatorAlert, escapeHtml } from "@/lib/email";
import type { EmailLogContext } from "@/lib/email";
import { signOperatorToken, signPhase2Token, caseThreadId, normalizeEmail } from "@/lib/site";
import { calculateCommission, getPartnerByStripePromoId, getPartnerByPromoCode } from "@/lib/referral";

/** Fallback operator email if OPERATOR_EMAIL env var is not set. */
const OPERATOR_EMAIL =
  process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com";

export async function POST(req: NextRequest) {
  // ──────────────────────────────────────────────────────────────
  // STRIPE SIGNATURE VERIFICATION (DUAL-MODE)
  // ──────────────────────────────────────────────────────────────
  // Supports both test and live webhooks on the same endpoint.
  // Tries the test secret first, then the live secret. This allows
  // gradual go-live where some tiers use live keys and others use
  // test keys. Both webhook endpoints (test + live) point here.
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  const testSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const liveSecret = process.env.STRIPE_WEBHOOK_SECRET_LIVE;

  if (!testSecret && !liveSecret) {
    console.error("[Stripe Webhook] No webhook secrets configured");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  // Try each configured secret. Whichever verifies successfully wins.
  const secrets = [testSecret, liveSecret].filter(Boolean) as string[];
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, secret);
      break; // Verified successfully
    } catch {
      // This secret didn't match — try the next one
    }
  }

  if (!event) {
    console.error("[Stripe Webhook] Signature verification failed with all configured secrets");
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
    const email = rawEmail ? normalizeEmail(rawEmail) : null;
    const isInstallment = session.metadata?.payment_plan === "2x";
    const amount = isInstallment && session.metadata?.full_price
      ? parseInt(session.metadata.full_price, 10)
      : session.amount_total;

    if (!tier || !email || amount == null) {
      console.error("[Stripe Webhook] Missing metadata:", { tier, email, amount });
      await sendEmail({
        to: OPERATOR_EMAIL,
        subject: `ALERT: Missing metadata in Stripe webhook — ${session.id}`,
        html: `<h1 style="color: #EF4444;">Missing Metadata in Stripe Webhook</h1>
          <p>A checkout.session.completed event arrived with missing metadata. The order was NOT created.</p>
          <p><strong>Session ID:</strong> ${escapeHtml(session.id)}</p>
          <p><strong>Tier:</strong> ${tier ? escapeHtml(tier) : "MISSING"}</p>
          <p><strong>Email:</strong> ${email ? escapeHtml(email) : "MISSING"}</p>
          <p><strong>Amount:</strong> ${amount != null ? String(amount) : "MISSING"}</p>
          <p><strong>Action:</strong> Check Stripe dashboard for session ${escapeHtml(session.id)} and manually create the order if payment was collected.</p>`,
      });
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
      }, { category: "operator-alert", metadata: { reason: "order-insert-failed", tier, amount } });
      // Stop processing — no order record exists, cannot proceed with case creation or emails
      return NextResponse.json({ received: true });
    }

    // ──────────────────────────────────────────────────────────────
    // INSTALLMENT SUBSCRIPTION AUTO-CANCEL
    // ──────────────────────────────────────────────────────────────
    // For 2-payment installment plans, set cancel_at on the subscription
    // so Stripe auto-cancels after the second billing cycle (35 days buffer).
    if (isInstallment && orderData && session.subscription) {
      const subId = typeof session.subscription === "string"
        ? session.subscription
        : (session.subscription as { id: string }).id;
      const cancelAt = Math.floor(Date.now() / 1000) + 35 * 86400;
      try {
        const tierStripeClient = isValidTier(tier) ? stripeForTier(tier as TierSlug) : stripe;
        await tierStripeClient.subscriptions.update(subId, { cancel_at: cancelAt });
      } catch (err) {
        console.error("[Webhook] Failed to set cancel_at on installment subscription:", err);
      }
    }

    // ──────────────────────────────────────────────────────────────
    // REFERRAL TRACKING (Bondsman Partner System)
    // ──────────────────────────────────────────────────────────────
    // If the customer used a promotion code, check if it belongs to a
    // bondsman partner. If so, create a referral record and update
    // the partner's totals. Works for ALL product types (digital + service).
    // Track referrals when a discount was applied (including $0 discounts from promo codes)
    if (orderData && session.total_details?.amount_discount != null) {
      try {
        const tierStripe = isValidTier(tier) ? stripeForTier(tier as TierSlug) : stripe;
        // Retrieve session with expanded discount breakdown
        const fullSession = await tierStripe.checkout.sessions.retrieve(session.id, {
          expand: ["total_details.breakdown"],
        });

        const discountItems = (fullSession.total_details?.breakdown as { discounts?: Array<{ discount: { promotion_code?: string | { id: string; code: string; metadata: Record<string, string> } }; amount: number }> })?.discounts || [];

        for (const item of discountItems) {
          const promoCodeRef = item.discount.promotion_code;
          if (!promoCodeRef) continue;

          const promoCodeId = typeof promoCodeRef === "string" ? promoCodeRef : promoCodeRef.id;

          // Try to find partner by Stripe promo code ID first, then by code text
          let partner = await getPartnerByStripePromoId(promoCodeId);
          if (!partner && typeof promoCodeRef !== "string" && promoCodeRef.code) {
            partner = await getPartnerByPromoCode(promoCodeRef.code);
          }
          if (!partner && typeof promoCodeRef === "string") {
            // Retrieve the promo code to get the code text for fallback lookup
            try {
              const promoObj = await tierStripe.promotionCodes.retrieve(promoCodeId);
              partner = await getPartnerByPromoCode(promoObj.code);
            } catch {
              // Promo code might be from the other Stripe account — skip
            }
          }

          if (!partner || partner.status !== "approved") continue;

          const discountAmount = item.amount; // cents
          const saleAmount = amount - discountAmount; // what customer actually paid
          const commissionAmount = calculateCommission(saleAmount, partner.commission_rate);

          // Atomic: insert referral + increment partner totals in one transaction
          const { error: refError } = await supabase.rpc("track_referral", {
            p_partner_id: partner.id,
            p_order_id: orderData.id,
            p_tier: tier,
            p_sale_amount: saleAmount,
            p_discount_amount: discountAmount,
            p_commission_amount: commissionAmount,
          });

          if (refError) {
            // 23505 = duplicate (order_id, partner_id) — already tracked, skip
            if (refError.code === "23505") {
              console.log(`[Webhook] Referral already tracked for order=${orderData.id}, partner=${partner.id}`);
            } else {
              console.error("[Webhook] Referral tracking error:", refError);
            }
          } else {
            console.log(`[Webhook] Referral tracked: partner=${partner.name}, commission=$${(commissionAmount / 100).toFixed(2)}`);
          }
        }
      } catch (refTrackErr) {
        // Non-blocking — referral tracking failure should not break order processing
        console.error("[Webhook] Referral tracking error:", refTrackErr);
      }
    }
    // Metadata fallback: track referral even when promo code didn't create a discount
    // (e.g., manual metadata set by checkout flow when cookie-based attribution is used)
    else if (orderData && session.metadata?.partner_promo_code) {
      try {
        const partner = await getPartnerByPromoCode(session.metadata.partner_promo_code);
        if (partner && partner.status === "approved") {
          const commissionAmount = calculateCommission(amount, partner.commission_rate);
          // Atomic: same RPC as the primary path to prevent partial-failure inconsistency
          const { error: refError } = await supabase.rpc("track_referral", {
            p_partner_id: partner.id,
            p_order_id: orderData.id,
            p_tier: tier,
            p_sale_amount: amount,
            p_discount_amount: 0,
            p_commission_amount: commissionAmount,
          });
          if (refError) {
            if (refError.code === "23505") {
              console.log(`[Webhook] Referral already tracked (metadata fallback) for order=${orderData.id}, partner=${partner.id}`);
            } else {
              console.error("[Webhook] Metadata referral tracking error:", refError);
            }
          } else {
            console.log(`[Webhook] Referral tracked (metadata fallback): partner=${partner.name}, commission=$${(commissionAmount / 100).toFixed(2)}`);
          }
        }
      } catch (metaRefErr) {
        console.error("[Webhook] Metadata referral tracking error:", metaRefErr);
      }
    }

    // ──────────────────────────────────────────────────────────────
    // DIGITAL PRODUCT BRANCH (Defense Playbooks)
    // ──────────────────────────────────────────────────────────────
    // Digital products skip the entire case creation / intake / generation
    // pipeline. They deliver a pre-built PDF via signed URL immediately.
    const productType = session.metadata?.product_type || "service";

    if (productType === "digital-product" && orderData) {
      // Generate download token with 72-hour expiry
      const downloadToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

      await supabase
        .from("orders")
        .update({
          product_type: "digital-product",
          download_token: downloadToken,
          download_token_expires_at: expiresAt,
        })
        .eq("id", orderData.id);

      const downloadUrl = `${origin}/api/download/${downloadToken}`;
      const emergencyDownloadUrl = `${origin}/api/download/${downloadToken}?doc=emergency`;

      // Check if this charge type has an emergency playbook
      const { data: chargePack } = await supabase
        .from("charge_packs")
        .select("emergency_pdf_path")
        .eq("slug", tier)
        .single();
      const hasEmergency = !!chargePack?.emergency_pdf_path;

      // Send delivery email with download link(s)
      // Per-playbook delivery email step 2 (charge-specific action)
      const playbookStep2: Record<string, string> = {
        "dui-first-offense": "Check your state's DMV hearing deadline NOW (page 2). In most states, you have 10 days or fewer — miss it and your license is automatically suspended.",
        "drug-possession": "Read the \"What Makes Your Case Unique\" section. Drug cases turn on specific facts — substance type, weight, how it was found. Know YOUR facts before your next conversation.",
        "probation-violation": "Read the \"Two Types of Violations\" section. Whether yours is technical or substantive changes your entire defense strategy. Gather every document that proves compliance — that's your strongest defense.",
        "white-collar": "Read the \"Document Preservation\" section immediately. White collar cases live and die on documentation — know what to preserve and what your attorney should be requesting before your next meeting.",
        "sex-offense": "Read the \"Collateral Consequences\" section. Sex offense cases carry registration requirements and restrictions that go far beyond sentencing — know the full picture before making any decisions.",
        "federal-criminal": "Read the \"Federal vs. State\" differences section. Federal cases operate on a completely different timeline with different rules — mandatory minimums, sentencing guidelines, and cooperation agreements all work differently.",
        "drug-trafficking": "Read the \"Conspiracy Exposure\" section. Trafficking cases often involve conspiracy charges that can make you responsible for others' conduct — understand your exposure before your next attorney conversation.",
        "self-defense": "Read the \"Force Proportionality\" section. Self-defense cases hinge on whether your response was proportional to the threat — know what standard your state uses before discussing strategy with your attorney.",
      };
      const step2 = playbookStep2[tier] || "Review the charge-specific details section. Every case has facts that matter more than others — know yours.";

      const upgradeTierSlug = tier as TierSlug;
      const upgradeCost = upgradeCostBetween(upgradeTierSlug, "case-decoder");

      // Build download buttons — two-document layout if emergency exists
      const downloadButtons = hasEmergency
        ? `<div style="margin: 24px 0;">
            <p style="color: #D4D4D8; margin: 0 0 12px; font-size: 14px;">Your purchase includes <strong style="color: white;">two books</strong> — start with the Emergency Playbook.</p>
            <a href="${emergencyDownloadUrl}" style="display: inline-block; padding: 14px 28px; background: #EF4444; color: white; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Download Emergency Playbook</a>
            <p style="color: #A1A1AA; font-size: 13px; margin: 8px 0 0;">Start here — your First 72 Hours checklist, 5 Priority Questions, and what to do right now.</p>
          </div>
          <div style="margin: 24px 0;">
            <a href="${downloadUrl}" style="display: inline-block; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Download Full Defense Playbook</a>
            <p style="color: #A1A1AA; font-size: 13px; margin: 8px 0 0;">The complete reference — case stage roadmap, red flag checklist, scorecard, all 26 questions, and more.</p>
          </div>`
        : `<a href="${downloadUrl}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Download Your Playbook</a>`;

      await sendEmailWithOperatorAlert({
        to: email,
        subject: `Your ${escapeHtml(productName)} is ready — download now`,
        unsubscribeEmail: email,
        html: `
          <h1 style="color: #F59E0B;">Your ${escapeHtml(productName)} Is Ready</h1>
          <p>${hasEmergency ? "Two books are inside — an Emergency Playbook for right now, and the Full Defense Playbook for everything else." : `Your ${escapeHtml(productName)} is inside. Click below to download your PDF.`}</p>
          ${downloadButtons}
          <p><strong style="color: white;">Step 1:</strong> ${hasEmergency ? "Open the <strong style=\"color: #EF4444;\">Emergency Playbook</strong> and read the First 72 Hours checklist. These are the actions that matter most right now." : "Open the playbook and read page 2 — your <strong style=\"color: #F59E0B;\">First 72 Hours</strong> checklist. These are the actions that matter most right now."}</p>
          <p><strong style="color: white;">Step 2:</strong> ${step2}</p>
          <p><strong style="color: white;">Step 3:</strong> Read the 5 Priority Questions before your next attorney conversation. Most people can only answer 1 or 2. The blanks are what your next meeting is for.</p>
          <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
            <p style="margin: 0; color: white; font-weight: bold;">Want case-specific questions?</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;">Your ${TIER_CORE[upgradeTierSlug].priceDisplay} is fully credited toward the ${TIER_CORE["case-decoder"].name} (${TIER_CORE["case-decoder"].priceDisplay}). Get 15 questions built from YOUR charges, YOUR state, YOUR stage.</p>
            <a href="${origin}/checkout?tier=case-decoder" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background: transparent; color: #F59E0B; font-weight: bold; text-decoration: none; border: 1px solid #F59E0B; border-radius: 8px;">${upgradeCost ? `Upgrade for ${upgradeCost} →` : "Upgrade to Case Decoder →"}</a>
          </div>
          <p style="color: #A1A1AA;">These download links expire in 72 hours. Reply to this email if you have questions.</p>
        `,
      }, `playbook delivery for ${email}`, { category: "playbook-delivery", order_id: orderData.id, metadata: { tier, product_type: "digital-product" } });

      // Simplified operator notification for digital products
      await sendEmailWithOperatorAlert({
        to: OPERATOR_EMAIL,
        subject: `New Playbook Sale: ${escapeHtml(productName)} — $${(amount / 100).toFixed(2)}`,
        html: `
          <h1 style="color: #F59E0B;">New Digital Product Sale</h1>
          <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #F59E0B;">
            <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Product:</strong> ${escapeHtml(productName)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(email)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Amount:</strong> $${(amount / 100).toFixed(2)}</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Type:</strong> Digital product (instant PDF delivery)</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Download token:</strong> ${downloadToken.slice(0, 8)}...</p>
            <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Time:</strong> ${new Date().toISOString()}</p>
          </div>
        `,
      }, `operator notification for playbook sale ${email}`, { category: "operator-new-order", order_id: orderData.id, metadata: { tier, product_type: "digital-product", amount } });

      // Return early — skip case creation, intake linking, generation
      return NextResponse.json({ received: true });
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
    let cdSkippedDueToDedup = false;
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
        }, { category: "operator-alert", order_id: orderData.id, metadata: { reason: "case-insert-failed", tier } });
      }

      // ──────────────────────────────────────────────────────────────
      // ADD-ON PARENT CASE LINKING
      // ──────────────────────────────────────────────────────────────
      // Add-on tiers (extra-witness, witness-pack) should link to the
      // customer's most recent active discovery case so the operator
      // knows which engagement this add-on belongs to.
      if (caseId && tierConfig?.isAddon) {
        const discoveryTiers = ["x-ray", "war-room", "situation-room"];
        const { data: parentCase } = await supabase
          .from("cases")
          .select("id, order_id")
          .eq("email", email)
          .in("tier", discoveryTiers)
          .not("status", "in", '("refunded")')
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (parentCase) {
          await supabase
            .from("cases")
            .update({ parent_order_id: parentCase.order_id })
            .eq("id", caseId);
          console.log(`[Webhook] Linked add-on ${tier} case ${caseId} to parent case ${parentCase.id}`);
        } else {
          console.warn(`[Webhook] Add-on ${tier} for ${email} — no active discovery case found to link`);
        }
      }

      // ──────────────────────────────────────────────────────────────
      // INCLUDED-TIER CASE CREATION (tier inclusion model)
      // ──────────────────────────────────────────────────────────────
      // When a customer buys IB ($997), they also get a Case Decoder
      // delivered within 48 hours. When they buy X-Ray ($2,497), they
      // get CD + IB. Each included tier gets its own case record with
      // is_included_deliverable=true so the system can track and
      // deliver them independently.
      //
      // Upgrade dedup: If the customer already has a delivered case
      // for an included tier (matched by email OR court case number),
      // skip creating a duplicate — link to the existing one instead.
      const existingCaseNumber = session.metadata?.existing_case_number;
      const existingCaseState = session.metadata?.existing_case_state;

      // Track if CD was skipped due to upgrade dedup — if so, send Phase 2
      // intake email immediately (no CD delivery to trigger it later).
      if (caseId && tierConfig?.includesTiers && tierConfig.includesTiers.length > 0) {
        for (const includedTier of tierConfig.includesTiers) {
          // Check if customer already has an active case for this tier (by email).
          // Checks all non-terminal statuses — not just "delivered" — to prevent
          // duplicates when a prior case is still in-progress (review, processing, etc.).
          const { data: existingCase } = await supabase
            .from("cases")
            .select("id")
            .eq("email", email)
            .eq("tier", includedTier)
            .not("status", "in", '("cancelled","refunded")')
            .limit(1)
            .maybeSingle();

          if (existingCase) {
            console.log(`[Webhook] Skipping included ${includedTier} — customer already has active case ${existingCase.id} (email match)`);
            if (includedTier === "case-decoder") cdSkippedDueToDedup = true;
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
              .not("status", "in", '("cancelled","refunded")')
              .limit(1)
              .maybeSingle();

            if (caseNumberMatch) {
              console.log(`[Webhook] Skipping included ${includedTier} — customer already has active case ${caseNumberMatch.id} (case number match)`);
              if (includedTier === "case-decoder") cdSkippedDueToDedup = true;
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

          // Auto-trigger CD generation for included case-decoder.
          // Uses after() so the fetch runs after the response is sent to Stripe,
          // avoiding GC on Vercel (fire-and-forget fetch may be killed post-response).
          if (includedTier === "case-decoder" && hasIntake) {
            const capturedIncludedCaseId = includedCaseId;
            after(async () => {
              try {
                await fetch(`${origin}/api/generate/case-decoder`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.OPERATOR_SECRET}`,
                  },
                  body: JSON.stringify({ caseId: capturedIncludedCaseId }),
                });
              } catch (err) {
                console.error("[Webhook] Auto-trigger included CD generation failed:", err);
              }
            });
          }
        }
      }

      // ──────────────────────────────────────────────────────────────
      // UPGRADE FLOW: CD already delivered, send Phase 2 immediately
      // ──────────────────────────────────────────────────────────────
      // When a CD-delivered customer upgrades to IB+, the included CD
      // is skipped (dedup). Since there's no CD delivery to trigger the
      // Phase 2 email, we send it now. The primary case (IB) is already
      // created as awaiting-intake.
      if (cdSkippedDueToDedup && caseId && tier !== "case-decoder") {
        // Find the most recent delivered CD for this customer to set prior_case_id
        const { data: priorCd } = await supabase
          .from("cases")
          .select("id")
          .eq("email", email)
          .eq("tier", "case-decoder")
          .eq("status", "delivered")
          .order("delivered_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (priorCd) {
          await supabase
            .from("cases")
            .update({ prior_case_id: priorCd.id })
            .eq("id", caseId);
        }

        const phase2Token = signPhase2Token(caseId);
        await sendEmailWithOperatorAlert({
          to: email,
          subject: `Next Step: Complete Your ${escapeHtml(productName)} Intake`,
          unsubscribeEmail: email,
          threadingHeaders: {
            inReplyTo: caseThreadId(caseId),
            references: caseThreadId(caseId),
          },
          html: `
            <h1 style="color: #F59E0B;">Your Upgrade is Active</h1>
            <p>Since you already have your Case Decoder report, we can start building your ${escapeHtml(productName)} right away.</p>
            <p>We just need a few additional details about your judge, your attorney, and your case situation:</p>
            <a href="${origin}/intake/intelligence-brief?case=${caseId}&token=${phase2Token}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Complete Intelligence Brief Details</a>
            <p style="color: #A1A1AA;">This takes about 5 minutes. Your ${escapeHtml(productName)} will be delivered within 72 hours after you submit.</p>
          `,
        }, `phase 2 intake for upgrade ${email} (${tier})`, { category: "phase2-intake", case_id: caseId!, metadata: { tier } });
      }

      // ──────────────────────────────────────────────────────────────
      // AUTO-TRIGGER: Case Decoder report generation (standalone)
      // ──────────────────────────────────────────────────────────────
      // Only standalone case-decoder tier gets auto-triggered here.
      // Included CDs are triggered in the inclusion loop above.
      //
      // Two paths:
      //   A. Intake exists → Trigger generation via after() (runs post-response)
      //   B. No intake → Email customer with a link to the intake form.
      if (caseId && tier === "case-decoder") {
        if (hasIntake) {
          const capturedCaseId = caseId;
          after(async () => {
            try {
              await fetch(`${origin}/api/generate/case-decoder`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${process.env.OPERATOR_SECRET}`,
                },
                body: JSON.stringify({ caseId: capturedCaseId }),
              });
            } catch (err) {
              console.error("[Webhook] Auto-trigger report generation failed:", err);
            }
          });
        } else {
          await sendEmailWithOperatorAlert({
            to: email,
            subject: "Complete Your Case Details to Start Your Report",
            unsubscribeEmail: email,
            threadingHeaders: {
              inReplyTo: caseThreadId(caseId),
              references: caseThreadId(caseId),
            },
            html: `
              <h1 style="color: #F59E0B;">One More Step</h1>
              <p>Thank you for purchasing the Case Decoder. Before we can generate your personalized report, we need your case details.</p>
              <a href="${origin}/intake?email=${encodeURIComponent(email)}&tier=case-decoder" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Complete Your Case Details</a>
              <p style="color: #A1A1AA;">Once you submit your case details, your report will be generated within 48 hours.</p>
            `,
          }, `intake request for ${email}`, { category: "intake-request", case_id: caseId!, metadata: { tier: "case-decoder" } });
        }
      }

      // For IB+ tiers without intake, email customer to complete intake
      if (caseId && tier !== "case-decoder" && tierConfig?.includesTiers && tierConfig.includesTiers.length > 0 && !hasIntake) {
        await sendEmailWithOperatorAlert({
          to: email,
          subject: `Complete Your Case Details — Your ${escapeHtml(productName)} Package`,
          unsubscribeEmail: email,
          threadingHeaders: {
            inReplyTo: caseThreadId(caseId),
            references: caseThreadId(caseId),
          },
          html: `
            <h1 style="color: #F59E0B;">One More Step</h1>
            <p>Thank you for purchasing the ${escapeHtml(productName)}. Before we can start generating your reports, we need your case details.</p>
            <p style="color: #D4D4D8;">Your package includes a Case Decoder report delivered within 48 hours, followed by your full ${escapeHtml(productName)}.</p>
            <a href="${origin}/intake?email=${encodeURIComponent(email)}&tier=${encodeURIComponent(tier)}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Complete Your Case Details</a>
            <p style="color: #A1A1AA;">Once you submit your case details, your Case Decoder report will be generated within 48 hours.</p>
          `,
        }, `intake request for ${email} (${tier})`, { category: "intake-request", case_id: caseId!, metadata: { tier } });
      }
    }

    // ──────────────────────────────────────────────────────────────
    // DISCOVERY UPLOAD SECTION (for payment confirmation email)
    // ──────────────────────────────────────────────────────────────
    // Discovery tiers ($2,497+) require the customer to upload their
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
    await sendEmailWithOperatorAlert({
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
    }, `payment confirmation for ${email}`, { category: "payment-confirmation", case_id: caseId || undefined, order_id: orderData?.id, metadata: { tier, amount } });

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
    await sendEmailWithOperatorAlert({
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
          ${tierConfig?.includesTiers && tierConfig.includesTiers.length > 0 ? `<p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Included tiers:</strong> ${tierConfig.includesTiers.join(", ")}${cdSkippedDueToDedup ? " (CD skipped — upgrade)" : ""}</p>` : ""}
          ${session.metadata?.prerequisite_skipped === "true" ? '<p style="margin: 8px 0 0; color: #EF4444;"><strong>WARNING: War Room prerequisite NOT confirmed — customer may not have completed War Room.</strong></p>' : ""}
          <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Time:</strong> ${new Date().toISOString()}</p>
        </div>
      `,
    }, `operator notification for ${email}`, { category: "operator-new-order", order_id: orderData?.id, metadata: { tier, amount } });
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
        // ── FULL REFUND: Mark order as refunded, revoke report + download access ──
        const { error: refundError } = await supabase
          .from("orders")
          .update({
            status: "refunded",
            refunded_at: new Date().toISOString(),
            download_token: null,
            download_token_expires_at: null,
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
          // Updates ALL cases linked to this order — including included deliverables
          // (e.g., when an IB order is refunded, both the IB case and the included
          // CD case are marked "refunded" because they share the same order_id).
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
          await sendEmailWithOperatorAlert({
            to: refundedOrder.email,
            subject: `Partial Refund Processed — $${partialRefundAmount}`,
            unsubscribeEmail: refundedOrder.email,
            html: `
              <h1 style="color: #F59E0B;">Partial Refund Issued</h1>
              <p>We've issued a partial refund of <strong>$${partialRefundAmount}</strong> to your original payment method.</p>
              <p>You should see this reflected in 1-3 business days depending on your bank.</p>
              <p style="color: #A1A1AA;">Your report access and any upgrade credits remain active.</p>
            `,
          }, `partial refund notification for ${refundedOrder.email}`, { category: "refund-notification", order_id: refundedOrder.id, metadata: { amount: charge.amount_refunded, tier: refundedOrder.tier } });
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
        }, { category: "operator-alert", order_id: refundedOrder.id, metadata: { reason: "refund", tier: refundedOrder.tier, amount: charge.amount_refunded } });
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
      }, { category: "operator-alert", metadata: { reason: "refund-bounce", refund_id: refund.id, refund_status: refund.status } });
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
