/**
 * @file /api/webhooks/stripe — Stripe webhook handler
 *
 * Pipeline position: Entry point for all payment events. This is where
 * paid cases are born and refunded cases are terminated.
 *
 * Handles these event types:
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
 *      - Commission reversal: referral commission zeroed + partner totals decremented
 *
 * 3. `charge.refund.updated` — Refund bounce detection
 *    Flow: Alert operator when refund fails or requires action
 *
 * 4. `invoice.payment_failed` — Installment payment failure
 *    Flow: Alert operator when a subscription invoice payment fails (e.g., second installment)
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
import { getProduct } from "@/lib/products";
import { getScholarshipCount, isPlaybookPurchase, PLAYBOOK_HALF_CREDITS } from "@/lib/product-matrix";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, sendEmailWithOperatorAlert, escapeHtml } from "@/lib/email";
import type { EmailLogContext } from "@/lib/email";
import { signOperatorToken, signPhase2Token, caseThreadId, normalizeEmail, hashToken } from "@/lib/site";
import { calculateCommission, getPartnerByStripePromoId, getPartnerByPromoCode } from "@/lib/referral";
import { randomBytes } from "crypto";
import { TIER9_SLUGS } from "@/lib/tier9-reports/constants";
import { sendSMS, capSMS } from "@/lib/sms";
import { getPartnerPrefs, shouldSendEmail, shouldSendSMS } from "@/lib/notification-prefs";

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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("No signatures found matching the expected signature")) {
        console.error("[Stripe Webhook] constructEvent error:", msg);
      }
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
    // STANDALONE PRODUCT FAST PATH
    // ──────────────────────────────────────────────────────────────
    // Standalone products (Employment Impact, License Risk, etc.) skip
    // case/intake creation. They write directly to orders with
    // tier: "standalone" sentinel + standalone_product_slug, and email
    // the customer a tokenized intake link.
    const standaloneSlug = session.metadata?.standalone_product_slug;
    if (session.metadata?.product_type === "standalone" && standaloneSlug) {
      const product = getProduct(standaloneSlug);
      if (!product) {
        console.error(`[Webhook] Unknown standalone product: ${standaloneSlug}`);
        await sendEmail({
          to: OPERATOR_EMAIL,
          subject: `[ERROR] Standalone webhook — unknown product ${escapeHtml(standaloneSlug)}`,
          html: `<p>Session: ${escapeHtml(session.id)}</p><p>Slug: ${escapeHtml(standaloneSlug)}</p>`,
        });
        return NextResponse.json({ error: "Unknown product" }, { status: 400 });
      }

      const standaloneSupabase = createAdminClient();
      const rawStandaloneEmail =
        session.metadata.email ||
        session.customer_email ||
        session.customer_details?.email ||
        "";
      const customerStandaloneEmail = normalizeEmail(rawStandaloneEmail);
      if (!customerStandaloneEmail) {
        console.error("[Webhook] Standalone missing email:", session.id);
        return NextResponse.json({ error: "Missing email" }, { status: 500 });
      }

      // Cryptographic intake token — only the customer gets this via email.
      // The plaintext token is NEVER stored in the DB; only its SHA-256 hash.
      // Matches the pattern already used for standalone_report_token_hash.
      const intakeToken = randomBytes(24).toString("base64url");
      const intakeTokenHash = hashToken(intakeToken);

      // Use tier: "standalone" (sentinel). The slug lives in standalone_product_slug.
      // This prevents contaminating the tier column used by upgrade credit queries.
      const { error: standaloneOrderError } = await standaloneSupabase
        .from("orders")
        .insert({
          email: customerStandaloneEmail,
          tier: "standalone",
          amount: session.amount_total,
          status: "paid",
          stripe_session_id: session.id,
          stripe_payment_intent_id:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : (session.payment_intent as { id?: string } | null)?.id ?? null,
          paid_at: new Date().toISOString(),
          product_type: "standalone",
          standalone_product_slug: standaloneSlug,
          standalone_intake_token_hash: intakeTokenHash,
        });

      if (standaloneOrderError) {
        if (standaloneOrderError.code === "23505") {
          return NextResponse.json({ received: true });
        }
        console.error(
          "[Webhook] Standalone order insert error:",
          standaloneOrderError
        );
        await sendEmail({
          to: OPERATOR_EMAIL,
          subject: `[ERROR] Standalone order insert failed — ${standaloneSlug}`,
          html: `<p>Payment collected but order record failed.</p>
                 <p>Email: ${escapeHtml(customerStandaloneEmail)}</p>
                 <p>Product: ${escapeHtml(standaloneSlug)}</p>
                 <p>Session: ${escapeHtml(session.id)}</p>
                 <p>Error: ${escapeHtml(JSON.stringify(standaloneOrderError))}</p>`,
        });
        return NextResponse.json({ error: "Order creation failed" }, { status: 500 });
      }

      // ── PRE-POPULATED INTAKE CHECK (availability gate fast path) ──
      // When the customer came through the availability checker, intake
      // fields are already in session metadata. Skip the intake email
      // and trigger report generation immediately (~60s delivery).
      const preJudgeName = session.metadata?.judge_name || "";
      const preOfficerName = session.metadata?.officer_name || "";
      const preChargeType = session.metadata?.charge_type || "";
      const preState = session.metadata?.state || "";

      const hasPrePopulatedIntake =
        (standaloneSlug === "judge-report-card" && preJudgeName && preState) ||
        (standaloneSlug === "officer-background-check" && preOfficerName && preState) ||
        (standaloneSlug === "similar-cases-analyzer" && preChargeType && preState);

      if (hasPrePopulatedIntake) {
        // Build intake object matching what the intake form would submit
        let intake: Record<string, string> = {};
        if (standaloneSlug === "judge-report-card") {
          intake = { judgeName: preJudgeName, state: preState, chargeType: preChargeType || "other" };
        } else if (standaloneSlug === "officer-background-check") {
          intake = { officerName: preOfficerName, state: preState };
        } else if (standaloneSlug === "similar-cases-analyzer") {
          intake = { chargeType: preChargeType, state: preState };
        }

        // Write intake directly — same fields the intake API route would set
        const standaloneSupabaseUpdate = createAdminClient();
        await standaloneSupabaseUpdate.from("orders")
          .update({ standalone_intake: intake })
          .eq("stripe_session_id", session.id);

        // Fetch the order ID for generation
        const { data: orderForGen } = await standaloneSupabaseUpdate.from("orders")
          .select("id")
          .eq("stripe_session_id", session.id)
          .single();

        if (orderForGen) {
          // Fire-and-forget — cron Part 5e catches stuck reports
          const { generateTier9Report } = await import("@/lib/tier9-reports/generate");
          generateTier9Report(orderForGen.id).catch((err: unknown) => {
            console.error("[Webhook] Tier9 pre-populated generation error:", err);
          });
        }

        // Operator sale notification (includes "pre-populated" flag)
        await sendEmail({
          to: OPERATOR_EMAIL,
          subject: `[SALE] ${product.name} — $${((session.amount_total || 0) / 100).toFixed(2)} (instant)`,
          html: `<p>New standalone purchase (pre-populated intake, instant generation): ${escapeHtml(product.name)} by ${escapeHtml(customerStandaloneEmail)}</p>`,
        });

        return NextResponse.json({ received: true });
      }

      // ── STANDARD FLOW: send intake email ──
      const siteOrigin =
        process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com";
      await sendEmailWithOperatorAlert(
        {
          to: customerStandaloneEmail,
          subject: `Your ${product.name} — Complete Your Details`,
          html: `
            <p>Thank you for your purchase.</p>
            <p>To generate your personalized ${escapeHtml(product.name)}, we need a few details about your situation.</p>
            <p style="margin: 24px 0;">
              <a href="${siteOrigin}/intake/standalone/${standaloneSlug}?token=${intakeToken}"
                 style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                Complete Your Details
              </a>
            </p>
            <p>This takes about 2 minutes. Your report is generated within 60 seconds of submission.</p>
          `,
        },
        `standalone intake email for ${customerStandaloneEmail}`,
        {
          category: "standalone-intake-invite",
          metadata: { standalone_product_slug: standaloneSlug },
        }
      );

      await sendEmail({
        to: OPERATOR_EMAIL,
        subject: `[SALE] ${product.name} — $${((session.amount_total || 0) / 100).toFixed(2)}`,
        html: `<p>New standalone purchase: ${escapeHtml(product.name)} by ${escapeHtml(customerStandaloneEmail)}</p>`,
      });

      return NextResponse.json({ received: true });
    }

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
    let amount: number;
    if (isInstallment && session.metadata?.full_price) {
      const parsedAmount = parseInt(session.metadata.full_price, 10);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        console.error("[Webhook] Invalid full_price in installment metadata:", session.metadata?.full_price);
        // Don't block the webhook — fall back to session.amount_total
        // (which is the first installment amount, better than NaN)
      }
      amount = isNaN(parsedAmount) || parsedAmount <= 0 ? (session.amount_total || 0) : parsedAmount;
    } else {
      amount = session.amount_total ?? 0;
    }

    // Allow $0 amount for internal QA orders (100% coupon for E2E testing)
    const isInternalQa = process.env.INTERNAL_QA_EMAIL && email === process.env.INTERNAL_QA_EMAIL.toLowerCase();
    if (!tier || !email || amount == null || (amount < 50 && !isInternalQa)) {
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
      return NextResponse.json({ error: "Missing required metadata" }, { status: 500 });
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
    let orderData: { id: string } | null = null;
    const { data: insertedOrder, error: orderError } = await supabase
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
      // ── DUPLICATE WEBHOOK HANDLING (RETRY-SAFE) ──
      // Stripe retries webhooks on timeout/5xx. The unique constraint on
      // stripe_session_id causes a 23505 error on duplicate INSERTs.
      // Instead of returning 200 immediately, look up the existing order
      // and check if a case was created. If no case exists, fall through
      // to case creation — this handles the retry scenario where the order
      // was created but case creation failed (returned 500).
      const isDuplicate = orderError.code === "23505" || orderError.message?.includes("duplicate");
      if (isDuplicate) {
        console.log(`[Webhook] Order already exists for session ${session.id} — checking for case`);
        const { data: existingOrder } = await supabase
          .from("orders")
          .select("id")
          .eq("stripe_session_id", session.id)
          .single();

        if (!existingOrder) {
          // Can't find the order that triggered the unique violation — bail
          return NextResponse.json({ received: true });
        }

        // Check if case already exists for this order
        const { data: existingCase } = await supabase
          .from("cases")
          .select("id")
          .eq("order_id", existingOrder.id)
          .limit(1)
          .maybeSingle();

        if (existingCase) {
          // Both order and case exist — true duplicate, safe to return
          console.log(`[Webhook] Order and case both exist for session ${session.id} — true duplicate`);
          return NextResponse.json({ received: true });
        }

        // Order exists but case doesn't — fall through to case creation
        console.log(`[Webhook] Order exists but case missing for session ${session.id} — reattempting case creation`);
        orderData = existingOrder;
      }

      // ── GENUINE ORDER INSERT FAILURE ──
      // Payment was collected but we couldn't record it. This is critical —
      // operator must manually create the order in Supabase.
      if (!orderData) {
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
        // Return 500 so Stripe retries — transient DB failures can recover on retry
        return NextResponse.json({ error: "Order insert failed" }, { status: 500 });
      }
    } else {
      orderData = insertedOrder;
    }

    // ──────────────────────────────────────────────────────────────
    // SCHOLARSHIP COUNTER INCREMENT
    // ──────────────────────────────────────────────────────────────
    // Non-blocking — counter failures must never crash the webhook.
    // Tier purchases: add whole scholarship count immediately.
    // Playbook purchases: accumulate half-credits; every 2 halves = 1 scholarship.
    if (orderData) {
      try {
        const scholarshipCount = getScholarshipCount(tier);
        const currentMonth = new Date().toISOString().slice(0, 7);
        const monthKey = `scholarships_${currentMonth}`;

        if (scholarshipCount > 0) {
          // Service tier purchase: increment by whole scholarship count
          await supabase.rpc("increment_counter", { counter_key: "scholarships_total", amount: scholarshipCount });
          await supabase.rpc("increment_counter", { counter_key: monthKey, amount: scholarshipCount });
        } else if (isPlaybookPurchase(tier)) {
          // Playbook purchase: add half-credit, then atomically roll over if >= 2
          await supabase.rpc("increment_counter", { counter_key: "scholarship_half_credits", amount: PLAYBOOK_HALF_CREDITS });
          // Atomic rollover: locks row, checks >= 2, grants scholarships, updates counters
          await supabase.rpc("rollover_scholarship_half_credits", { month_key: monthKey });
        }
      } catch (scholarshipErr) {
        // Log but do not bubble — a counter failure must not block order processing
        console.error("[Webhook] Scholarship counter increment failed:", scholarshipErr);
      }
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

          const discountAmount = item.amount; // cents — total discount (duration:"once" = applied to first invoice only)

          // Defensive: warn if non-once coupon used on installment subscription
          if (isInstallment && discountAmount > 0) {
            const couponDuration = (fullSession.total_details?.breakdown as { discounts?: Array<{ discount: { coupon?: { duration?: string } }; amount: number }> })?.discounts?.[0]?.discount?.coupon?.duration;
            if (couponDuration && couponDuration !== "once") {
              console.warn(`[Webhook] Non-once coupon "${couponDuration}" on installment ${session.subscription}`);
              await sendEmail({
                to: OPERATOR_EMAIL,
                subject: "Warning: Unexpected coupon duration on installment",
                html: `<p>Subscription ${escapeHtml(String(session.subscription))} has a "${escapeHtml(couponDuration)}" coupon instead of "once". Commission assumes one-time discount.</p>`,
              }, { category: "operator-alert" });
            }
          }

          // For installments: amount = full_price, discount applied once → revenue = full_price - discount
          // For one-time: amount = amount_total (already post-discount), so saleAmount = amount
          const saleAmount = isInstallment ? amount - discountAmount : amount;
          const commissionAmount = calculateCommission(saleAmount, partner.commission_rate);

          // Atomic: insert referral + increment partner totals + tier evaluation in one transaction
          const { data: trackResult, error: refError } = await supabase.rpc("track_referral", {
            p_partner_id: partner.id,
            p_order_id: orderData.id,
            p_tier: tier,
            p_sale_amount: saleAmount,
            p_discount_amount: discountAmount,
            p_commission_amount: commissionAmount,
            p_sub_id: session.metadata?.partner_sub_id || null,
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

            // Sale notification to partner (own try-catch so failures don't swallow)
            try {
              const { partnerSaleNotificationEmail } = await import("@/lib/partner-emails");
              const { data: partnerDetail } = await supabase
                .from("partners")
                .select("name, email, total_commission, phone, notification_prefs")
                .eq("id", partner.id)
                .single();
              if (partnerDetail?.email) {
                const partnerPrefs = getPartnerPrefs(partnerDetail.notification_prefs || null);
                const tierName = tier in TIER_CORE ? TIER_CORE[tier as TierSlug].name : tier;
                const commissionDollars = (commissionAmount / 100).toFixed(2);
                const holdbackDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US");

                if (shouldSendEmail(partnerPrefs.payout)) {
                  const { subject, html } = partnerSaleNotificationEmail(
                    partnerDetail.name,
                    tierName,
                    commissionAmount,
                    partnerDetail.total_commission || 0
                  );
                  await sendEmail({ to: partnerDetail.email, subject, html, unsubscribeEmail: partnerDetail.email }, {
                    category: "partner-sale-notification",
                    metadata: { partner_id: partner.id, tier, commission: commissionAmount },
                  });
                }

                // Fire-and-forget SMS — don't await, avoid webhook timeout risk
                if (shouldSendSMS(partnerPrefs.payout) && partnerDetail.phone) {
                  sendSMS(partnerDetail.phone, capSMS(`INAA: You earned $${commissionDollars} from a referral! Confirms ${holdbackDate}.`))
                    .catch(e => console.warn("[Webhook] Partner sale SMS failed:", e));
                }
              }
            } catch (notifErr) {
              console.error("[Webhook] Partner sale notification failed:", notifErr);
            }

            // Tier upgrade notification if tier changed
            if (trackResult?.tier_changed) {
              try {
                const { partnerTierUpgradeEmail } = await import("@/lib/partner-emails");
                const { data: upgPartner } = await supabase
                  .from("partners")
                  .select("name, email")
                  .eq("id", partner.id)
                  .single();
                if (upgPartner?.email) {
                  const { subject, html } = partnerTierUpgradeEmail(
                    upgPartner.name,
                    trackResult.new_tier,
                    trackResult.new_rate
                  );
                  await sendEmail({ to: upgPartner.email, subject, html, unsubscribeEmail: upgPartner.email }, {
                    category: "partner-tier-upgrade",
                    metadata: { partner_id: partner.id, new_tier: trackResult.new_tier, new_rate: trackResult.new_rate },
                  });
                }
              } catch (tierNotifErr) {
                console.error("[Webhook] Tier upgrade notification failed:", tierNotifErr);
              }
            }
          }
          // Only attribute to the first matching partner — prevent double-attribution
          break;
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
          const { data: metaTrackResult, error: refError } = await supabase.rpc("track_referral", {
            p_partner_id: partner.id,
            p_order_id: orderData.id,
            p_tier: tier,
            p_sale_amount: amount,
            p_discount_amount: 0,
            p_commission_amount: commissionAmount,
            p_sub_id: session.metadata?.partner_sub_id || null,
          });
          if (refError) {
            if (refError.code === "23505") {
              console.log(`[Webhook] Referral already tracked (metadata fallback) for order=${orderData.id}, partner=${partner.id}`);
            } else {
              console.error("[Webhook] Metadata referral tracking error:", refError);
            }
          } else {
            console.log(`[Webhook] Referral tracked (metadata fallback): partner=${partner.name}, commission=$${(commissionAmount / 100).toFixed(2)}`);

            // Sale notification to partner (own try-catch)
            try {
              const { partnerSaleNotificationEmail } = await import("@/lib/partner-emails");
              const { data: partnerDetail } = await supabase
                .from("partners")
                .select("name, email, total_commission, phone, notification_prefs")
                .eq("id", partner.id)
                .single();
              if (partnerDetail?.email) {
                const partnerPrefs = getPartnerPrefs(partnerDetail.notification_prefs || null);
                const tierName = tier in TIER_CORE ? TIER_CORE[tier as TierSlug].name : tier;
                const commissionDollars = (commissionAmount / 100).toFixed(2);
                const holdbackDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US");

                if (shouldSendEmail(partnerPrefs.payout)) {
                  const { subject, html } = partnerSaleNotificationEmail(
                    partnerDetail.name,
                    tierName,
                    commissionAmount,
                    partnerDetail.total_commission || 0
                  );
                  await sendEmail({ to: partnerDetail.email, subject, html, unsubscribeEmail: partnerDetail.email }, {
                    category: "partner-sale-notification",
                    metadata: { partner_id: partner.id, tier, commission: commissionAmount },
                  });
                }

                if (shouldSendSMS(partnerPrefs.payout) && partnerDetail.phone) {
                  sendSMS(partnerDetail.phone, capSMS(`INAA: You earned $${commissionDollars} from a referral! Confirms ${holdbackDate}.`))
                    .catch(e => console.warn("[Webhook] Partner sale SMS (metadata) failed:", e));
                }
              }
            } catch (notifErr) {
              console.error("[Webhook] Partner sale notification (metadata) failed:", notifErr);
            }

            // Tier upgrade notification if tier changed
            if (metaTrackResult?.tier_changed) {
              try {
                const { partnerTierUpgradeEmail } = await import("@/lib/partner-emails");
                const { data: upgPartner } = await supabase
                  .from("partners")
                  .select("name, email")
                  .eq("id", partner.id)
                  .single();
                if (upgPartner?.email) {
                  const { subject, html } = partnerTierUpgradeEmail(
                    upgPartner.name,
                    metaTrackResult.new_tier,
                    metaTrackResult.new_rate
                  );
                  await sendEmail({ to: upgPartner.email, subject, html, unsubscribeEmail: upgPartner.email }, {
                    category: "partner-tier-upgrade",
                    metadata: { partner_id: partner.id, new_tier: metaTrackResult.new_tier, new_rate: metaTrackResult.new_rate },
                  });
                }
              } catch (tierNotifErr) {
                console.error("[Webhook] Tier upgrade notification (metadata) failed:", tierNotifErr);
              }
            }
          }
        }
      } catch (metaRefErr) {
        console.error("[Webhook] Metadata referral tracking error:", metaRefErr);
      }
    }

    // ──────────────────────────────────────────────────────────────
    // COURT REMINDER CONVERSION TRACKING
    // ──────────────────────────────────────────────────────────────
    // If the customer arrived via a court reminder prep page, the
    // checkout session carries a court_reminder_token in metadata.
    // Mark the reminder as converted so we can measure the free-to-paid
    // funnel and attribute partner referrals through the reminder path.
    const reminderToken = session.metadata?.court_reminder_token;
    if (reminderToken && orderData) {
      const { error: crErr } = await supabase
        .from("court_reminders")
        .update({
          converted_at: new Date().toISOString(),
          order_id: orderData.id,
        })
        .eq("token", reminderToken)
        .eq("status", "active");

      if (crErr) {
        console.warn("[Webhook] Court reminder conversion tracking failed:", crErr);
      }
    }

    // ──────────────────────────────────────────────────────────────
    // TIER 9 DATA-DRIVEN PRODUCTS — INTAKE THEN GENERATE
    // ──────────────────────────────────────────────────────────────
    // Tier 9 products (Judge Report Card, Officer Background Check,
    // Similar Cases Analyzer) are isDigitalProduct tiers that need
    // customer intake before generation. Unlike playbooks (pre-built
    // PDFs), these query Tier 9 database tables on demand.
    // Flow: create order → generate intake token → send intake email
    // → customer fills form → inline generation (no Edge Function).
    const productType = session.metadata?.product_type || "service";

    if (productType === "digital-product" && TIER9_SLUGS.has(tier) && orderData) {
      const intakeToken = randomBytes(24).toString("base64url");
      const intakeTokenHash = hashToken(intakeToken);

      // Set standalone columns so the intake route + report viewer work
      await supabase
        .from("orders")
        .update({
          product_type: "standalone",
          standalone_product_slug: tier,
          standalone_intake_token_hash: intakeTokenHash,
        })
        .eq("id", orderData.id);

      const tier9Product = getProduct(tier);
      const tier9ProductName = tier9Product?.name || tier;

      // Send intake email (same pattern as standalone webhook fast path)
      await sendEmailWithOperatorAlert(
        {
          to: email,
          subject: `Your ${tier9ProductName} — Complete Your Details`,
          html: `
            <p>Thank you for your purchase.</p>
            <p>To generate your personalized ${escapeHtml(tier9ProductName)}, we need a few details about your situation.</p>
            <p style="margin: 24px 0;">
              <a href="${origin}/intake/standalone/${tier}?token=${intakeToken}"
                 style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                Complete Your Details
              </a>
            </p>
            <p>This takes about 1 minute. Your report is generated within 60 seconds of submission.</p>
          `,
        },
        `tier9 intake email for ${email}`,
        {
          category: "standalone-intake-invite",
          metadata: { standalone_product_slug: tier },
        }
      );

      // Operator sale notification
      await sendEmail({
        to: OPERATOR_EMAIL,
        subject: `[SALE] ${tier9ProductName} — $${(amount / 100).toFixed(2)}`,
        html: `<p>New Tier 9 purchase: ${escapeHtml(tier9ProductName)} by ${escapeHtml(email)}</p>`,
      });

      return NextResponse.json({ received: true });
    }

    // ──────────────────────────────────────────────────────────────
    // DIGITAL PRODUCT BRANCH (Defense Playbooks)
    // ──────────────────────────────────────────────────────────────
    // Digital products skip the entire case creation / intake / generation
    // pipeline. They deliver a pre-built PDF via signed URL immediately.

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
        "probation-violation": "Read the \"Two Types of Violations\" section. Whether yours is technical or substantive matters significantly. Knowing which type you're facing helps you ask the right questions. Gather every document that proves compliance — receipts, certificates, sign-in sheets, communication with your PO. Compliance documentation is often central to revocation hearings.",
        "white-collar": "Read the \"Document Preservation\" section immediately. White collar cases live and die on documentation — know what to preserve and what questions to raise before your next meeting.",
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
            <p style="margin: 8px 0 0; color: #D4D4D8;">The ${TIER_CORE["case-decoder"].name} is ${TIER_CORE["case-decoder"].priceDisplay} — your ${TIER_CORE[upgradeTierSlug].priceDisplay} is fully credited, so you pay just ${upgradeCost}. Every dollar moves upward. Get 15 questions built from YOUR charges, YOUR state, YOUR stage.</p>
            <a href="${origin}/checkout?tier=case-decoder" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background: transparent; color: #F59E0B; font-weight: bold; text-decoration: none; border: 1px solid #F59E0B; border-radius: 8px;">${upgradeCost ? `Upgrade for ${upgradeCost} (your ${TIER_CORE[upgradeTierSlug].priceDisplay} credited) →` : "Upgrade to Case Decoder →"}</a>
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

      // Generate report_token at purchase time so customer can track progress
      // from the moment they pay — even before generation completes.
      const reportToken = crypto.randomUUID();
      const reportTokenExpiry = new Date();
      reportTokenExpiry.setFullYear(reportTokenExpiry.getFullYear() + 1);

      // Compute delivery SLA from purchase time (Fix 13)
      const DELIVERY_SLA_DAYS: Record<string, number> = {
        "case-decoder": 2,           // 48 hours
        "intelligence-brief": 3,     // 72 hours
        "x-ray": 10,                 // 10 business days
        "war-room": 28,              // 25-28 days
        "situation-room": 2,         // 24-48 hours priority
        "extra-witness": 3,          // Next update cycle
        "witness-pack": 5,           // 3-5 days
      };
      const slaDays = DELIVERY_SLA_DAYS[tier] ?? 7;
      const deliveryDue = new Date();
      deliveryDue.setDate(deliveryDue.getDate() + slaDays);

      const { error: caseError } = await supabase.from("cases").insert({
        id: caseId,
        order_id: orderData.id,
        email: email,
        tier,
        status: caseStatus,
        intake_id: linkedIntake?.id || null,
        charge_type: chargeType,
        file_urls: [],
        report_token: reportToken,
        report_token_hash: hashToken(reportToken),
        report_token_expires_at: reportTokenExpiry.toISOString(),
        delivery_due_at: deliveryDue.toISOString(),
      });

      if (caseError) {
        // Case creation failed — return 500 so Stripe retries the webhook.
        // The 23505 handler above will find the existing order and reattempt
        // case creation on the next delivery attempt.
        console.error("[Stripe Webhook] Case insert error:", caseError);
        caseId = null;
        await sendEmail({
          to: OPERATOR_EMAIL,
          subject: `URGENT: Case creation failed for ${escapeHtml(email)}`,
          html: `<h1 style="color: #EF4444;">Case Creation Failed</h1>
            <p>Payment received but case record failed to create. Stripe will retry.</p>
            <p><strong>Customer:</strong> ${escapeHtml(email)}</p>
            <p><strong>Tier:</strong> ${escapeHtml(tier)}</p>
            <p><strong>Order ID:</strong> ${escapeHtml(orderData.id)}</p>
            <p><strong>Error:</strong> ${escapeHtml(caseError.message)}</p>
            <p><strong>Action:</strong> Stripe will retry automatically. If retries exhaust, manually create case.</p>`,
        }, { category: "operator-alert", order_id: orderData.id, metadata: { reason: "case-insert-failed", tier } });
        // Return 500 so Stripe retries — the 23505 handler above will find the
        // existing order and reattempt case creation
        return NextResponse.json({ error: "Case creation failed, will retry" }, { status: 500 });
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
          .not("status", "in", "(refunded)")
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
      // SITUATION ROOM PRIORITY FLAG
      // ──────────────────────────────────────────────────────────────
      // Situation Room ($9,997) cases get priority = 1 so the engine
      // queue and operator dashboard surface them above all other cases.
      // Lower number = higher priority; null = standard queue position.
      if (caseId && tier === "situation-room") {
        const { error: priorityError } = await supabase
          .from("cases")
          .update({ priority: 1 })
          .eq("id", caseId);
        if (priorityError) {
          // Non-blocking — priority is an operational convenience, not business-critical
          console.error("[Webhook] Failed to set situation-room priority:", priorityError);
        } else {
          console.log(`[Webhook] Set priority=1 on situation-room case ${caseId}`);
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
            .not("status", "in", "(cancelled,refunded)")
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
              .not("status", "in", "(cancelled,refunded)")
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
            sendEmail({
              to: OPERATOR_EMAIL,
              subject: `URGENT: Included case creation failed — ${escapeHtml(includedTier)} for ${escapeHtml(email)}`,
              html: `<h1 style="color: #EF4444;">Included Case Creation Failed</h1>
                <p>A case record for an included deliverable could not be inserted. The customer will NOT receive this tier automatically.</p>
                <p><strong>Customer:</strong> ${escapeHtml(email)}</p>
                <p><strong>Primary Tier:</strong> ${escapeHtml(tier)}</p>
                <p><strong>Missing Included Tier:</strong> ${escapeHtml(includedTier)}</p>
                <p><strong>Order ID:</strong> ${escapeHtml(orderData.id)}</p>
                <p><strong>Error:</strong> ${escapeHtml(includedCaseError.message)}</p>
                <p><strong>Action:</strong> Manually create a case record in Supabase for tier <code>${escapeHtml(includedTier)}</code> linked to order <code>${escapeHtml(orderData.id)}</code>.</p>`,
            }, { category: "operator-alert", metadata: { reason: "included-case-insert-failed", tier: includedTier, primary_tier: tier, order_id: orderData.id } }).catch((emailErr) => {
              console.error("[Webhook] Failed to send operator alert for included case insert failure:", emailErr);
            });
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
            <a href="${origin}/intake?tier=${encodeURIComponent(tier)}&case=${caseId}&token=${phase2Token}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Complete ${escapeHtml(productName)} Details</a>
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

    // ──────────────────────────────────────────────────────────────
    // DRIP: Upsert subscriber record at purchase time
    // ──────────────────────────────────────────────────────────────
    // We upsert a subscriber record here so the drip cron can track
    // dedup state for this customer. We do NOT record any drip key —
    // that would cause the actual delivery email to be skipped later.
    // The delivery drip key (post_{tier}_delivery) is recorded in
    // /api/webhooks/engine/delivery after the report reaches the customer.
    //
    // Without this upsert, drip cron sends all emails but cannot record
    // "sent" state — causing duplicate emails on re-runs.
    if (orderData) {
      try {
        await supabase
          .from("subscribers")
          .upsert(
            { email: email.toLowerCase(), source: `purchase-${tier}` },
            { onConflict: "email" }
          );
      } catch (dripUpsertErr) {
        // Non-critical — log but do not block the webhook response
        console.error("[Webhook] Subscriber upsert for drip failed:", dripUpsertErr);
      }
    }

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
        // ── FULL REFUND: Atomic RPC — order + cases + commission in one transaction ──
        // Eliminates race condition where order could be marked "refunded" but
        // case stays active (report access remains open) if a step fails mid-way.
        const { data: refundResult, error: refundError } = await supabase
          .rpc("process_full_refund", { p_payment_intent_id: paymentIntentId });

        if (refundError) {
          console.error("[Stripe Webhook] Atomic refund failed:", refundError);
          await sendEmail({
            to: OPERATOR_EMAIL,
            subject: `URGENT: Refund processing failed — PI ${paymentIntentId}`,
            html: `<p>Stripe processed a full refund but the atomic refund RPC failed.</p>
                   <p><strong>payment_intent_id:</strong> ${escapeHtml(paymentIntentId || "unknown")}</p>
                   <p><strong>Error:</strong> ${escapeHtml(refundError.message || "unknown")}</p>`,
          }).catch((emailErr: unknown) => console.error("[Stripe Webhook] Refund alert email failed:", emailErr));
          return NextResponse.json({ error: "Refund recording failed" }, { status: 500 });
        }

        if (refundResult?.already_processed) {
          console.log(`[Webhook] Refund already processed for PI ${paymentIntentId}`);
          return NextResponse.json({ received: true });
        }

        // RPC returns: order_id, email, tier, amount, cases_updated, commission_reversed
        if (refundResult?.commission_reversed) {
          console.log(`[Webhook] Commission reversed for refunded order ${refundResult.order_id}`);
        }

        // ── CUSTOMER NOTIFICATION (full refund) ──
        const fullRefundAmount = (charge.amount_refunded / 100).toFixed(2);
        await sendEmailWithOperatorAlert({
          to: refundResult.email,
          subject: `Your Refund Has Been Processed — $${fullRefundAmount}`,
          unsubscribeEmail: refundResult.email,
          html: `
            <h1 style="color: #F59E0B;">Refund Processed</h1>
            <p>Your refund of <strong>$${fullRefundAmount}</strong> has been processed and sent to your original payment method.</p>
            <p>You'll typically see it reflected in <strong style="color: white;">5-10 business days</strong> depending on your bank.</p>
            <p style="color: #A1A1AA;">If you have any questions, reply to this email.</p>
          `,
        }, `full refund notification for ${refundResult.email}`, { category: "refund-notification", order_id: refundResult.order_id, metadata: { amount: charge.amount_refunded, tier: refundResult.tier } });

        // ── OPERATOR NOTIFICATION (full refund) ──
        const fullRefundTotal = ((refundResult.amount || 0) / 100).toFixed(2);
        await sendEmail({
          to: OPERATOR_EMAIL,
          subject: `Full Refund: ${escapeHtml(refundResult.tier)} — $${fullRefundAmount}`,
          html: `<h1 style="color: #EF4444;">Full Refund Processed</h1>
            <p><strong>Customer:</strong> ${escapeHtml(refundResult.email)}</p>
            <p><strong>Tier:</strong> ${escapeHtml(refundResult.tier)}</p>
            <p><strong>Refunded:</strong> $${fullRefundAmount} of $${fullRefundTotal}</p>
            <p><strong>Cases updated:</strong> ${refundResult.cases_updated}</p>
            <p><strong>Commission reversed:</strong> ${refundResult.commission_reversed ? "Yes" : "No"}</p>
            <p><strong>Note:</strong> Upgrade credits voided. Case status updated to 'refunded'. Report access revoked.</p>`,
        }, { category: "operator-alert", order_id: refundResult.order_id, metadata: { reason: "refund", tier: refundResult.tier, amount: charge.amount_refunded } });
      } else {
        // ── PARTIAL REFUND: Log timestamp for audit, keep order active ──
        await supabase
          .from("orders")
          .update({ refunded_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", paymentIntentId);

        // ── LOOKUP ORDER for partial refund notifications ──
        const { data: refundedOrder } = await supabase
          .from("orders")
          .select("id, email, tier, amount")
          .eq("stripe_payment_intent_id", paymentIntentId)
          .single();

        if (refundedOrder) {
          // ── CUSTOMER NOTIFICATION (partial refund) ──
          const partialRefundAmount = (charge.amount_refunded / 100).toFixed(2);
          await sendEmailWithOperatorAlert({
            to: refundedOrder.email,
            subject: `Partial Refund Processed — $${partialRefundAmount}`,
            unsubscribeEmail: refundedOrder.email,
            html: `
              <h1 style="color: #F59E0B;">Partial Refund Issued</h1>
              <p>We've issued a partial refund of <strong>$${partialRefundAmount}</strong> to your original payment method.</p>
              <p>This is typically reflected in 1-3 business days depending on your bank.</p>
              <p style="color: #A1A1AA;">Your report access and any upgrade credits remain active.</p>
            `,
          }, `partial refund notification for ${refundedOrder.email}`, { category: "refund-notification", order_id: refundedOrder.id, metadata: { amount: charge.amount_refunded, tier: refundedOrder.tier } });

          // ── OPERATOR NOTIFICATION (partial refund) ──
          const partialRefundTotal = ((refundedOrder.amount || 0) / 100).toFixed(2);
          await sendEmail({
            to: OPERATOR_EMAIL,
            subject: `Partial Refund: ${escapeHtml(refundedOrder.tier)} — $${partialRefundAmount}`,
            html: `<h1 style="color: #EF4444;">Partial Refund Processed</h1>
              <p><strong>Customer:</strong> ${escapeHtml(refundedOrder.email)}</p>
              <p><strong>Tier:</strong> ${escapeHtml(refundedOrder.tier)}</p>
              <p><strong>Refunded:</strong> $${partialRefundAmount} of $${partialRefundTotal}</p>
              <p><strong>Note:</strong> Partial refund — order remains 'paid'. Upgrade credits and report access preserved.</p>`,
          }, { category: "operator-alert", order_id: refundedOrder.id, metadata: { reason: "refund", tier: refundedOrder.tier, amount: charge.amount_refunded } });
        }
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

  // ================================================================
  // EVENT: invoice.payment_failed — Installment payment failure
  // ================================================================
  // Fires when a subscription invoice payment fails (e.g., card declined
  // on the second installment). Alerts the operator to follow up with
  // the customer or consider revoking access.
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as any;
    const subscriptionId = typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id;

    if (subscriptionId) {
      console.error("[Webhook] Installment payment failed for subscription:", subscriptionId);
      await sendEmail({
        to: OPERATOR_EMAIL,
        subject: "ALERT: Installment Payment Failed",
        html: `<div style="font-family: system-ui; padding: 16px;">
          <h2 style="color: #EF4444;">Installment Payment Failed</h2>
          <p><strong>Subscription:</strong> ${escapeHtml(subscriptionId)}</p>
          <p><strong>Amount due:</strong> $${((invoice.amount_due || 0) / 100).toFixed(2)}</p>
          <p><strong>Customer email:</strong> ${invoice.customer_email ? escapeHtml(invoice.customer_email) : "unknown"}</p>
          <p><strong>Attempt:</strong> ${invoice.attempt_count || "unknown"}</p>
          <p>Action needed: Follow up with customer or consider revoking access.</p>
        </div>`,
      }, { category: "operator-alert", metadata: { reason: "installment-payment-failed", subscription_id: subscriptionId, amount_due: invoice.amount_due } });
    }

    return NextResponse.json({ received: true });
  }

  // ──────────────────────────────────────────────────────────────
  // ACKNOWLEDGE WEBHOOK
  // ──────────────────────────────────────────────────────────────
  // Always return 200 to Stripe. Non-2xx causes retries (up to 3x over 72h).
  // Even if internal processing fails, we handle it via operator alerts
  // rather than letting Stripe re-deliver (which could cause duplicates).
  return NextResponse.json({ received: true });
}
