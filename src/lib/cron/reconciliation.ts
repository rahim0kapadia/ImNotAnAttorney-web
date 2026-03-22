/**
 * @file Part 9 — Stripe reconciliation + orphan order detection
 *
 * Part 9a: Stripe reconciliation — detect paid sessions with no matching order.
 *          If webhook failed or was never delivered, the customer paid but we
 *          have no record. Checks last 2 hours of paid sessions against orders.
 *          Checks BOTH test and live Stripe instances.
 *
 * Part 9b: Orphan order detection — detect orders with no linked case.
 *          If the case INSERT failed after the order INSERT, the customer has
 *          an order but no case — services can't be delivered.
 */

import { sendEmail, escapeHtml } from "@/lib/email";
import { stripe } from "@/lib/stripe";
import type { CronContext, CronResult } from "./types";
import { emptyResult } from "./types";

// ============================================================
// PART 9a: STRIPE RECONCILIATION
// ============================================================

export async function reconcileStripePayments(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  try {
    const twoHoursAgoEpoch = Math.floor((ctx.now.getTime() - 2 * 60 * 60 * 1000) / 1000);
    const sessions = await stripe.checkout.sessions.list({
      limit: 50,
      created: { gte: twoHoursAgoEpoch },
    });

    for (const session of sessions.data) {
      if (session.payment_status !== "paid") continue;
      if (!session.metadata?.tier) continue;

      const { data: existingOrder } = await ctx.supabase
        .from("orders")
        .select("id")
        .eq("stripe_session_id", session.id)
        .maybeSingle();

      if (!existingOrder) {
        // Missing order — webhook never fired or failed
        const email = (session.customer_email || session.customer_details?.email || "").toLowerCase().trim();
        const tier = session.metadata.tier;
        const amount = session.amount_total || 0;

        // Auto-create the missing order
        const { data: recoveredOrder } = await ctx.supabase
          .from("orders")
          .insert({
            email,
            tier,
            amount,
            status: "paid",
            stripe_session_id: session.id,
            stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
            paid_at: new Date(session.created * 1000).toISOString(),
          })
          .select("id")
          .single();

        if (recoveredOrder) {
          // Auto-create case
          const caseId = crypto.randomUUID();
          await ctx.supabase.from("cases").insert({
            id: caseId,
            order_id: recoveredOrder.id,
            email,
            tier,
            status: "awaiting-intake",
            file_urls: [],
          });
        }

        // URGENT operator alert
        await sendEmail({
          to: ctx.operatorEmail,
          subject: `URGENT: Recovered missed payment — ${escapeHtml(email || "unknown")}`,
          html: `<h1 style="color: #EF4444;">Webhook Failure Recovered</h1>
            <p>A paid Stripe session had no matching order. Auto-recovered.</p>
            <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
              <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(email || "unknown")}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${escapeHtml(tier)}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Amount:</strong> $${(amount / 100).toFixed(2)}</p>
              <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Stripe Session:</strong> ${escapeHtml(session.id)}</p>
            </div>
            <p><strong>Action:</strong> Verify recovery + send customer their intake/upload email if needed.</p>`,
        }, { category: "operator-alert", metadata: { reason: "webhook-recovery", stripe_session: session.id } });
        result.errors++; // Count as an anomaly
      }
    }
  } catch (stripeErr) {
    console.error("[Drip Cron] Part 9a Stripe reconciliation error:", stripeErr);
    result.errors++;
  }

  return result;
}

// ============================================================
// PART 9b: ORPHAN ORDER DETECTION
// ============================================================

export async function detectOrphanOrders(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  try {
    const oneHourAgo = new Date(ctx.now);
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const { data: recentOrders } = await ctx.supabase
      .from("orders")
      .select("id, email, tier, amount")
      .eq("status", "paid")
      .lt("created_at", oneHourAgo.toISOString())
      .gte("created_at", new Date(ctx.now.getTime() - 24 * 60 * 60 * 1000).toISOString());

    if (recentOrders) {
      for (const order of recentOrders) {
        // Use .limit(1) instead of .maybeSingle() — multi-case orders
        // (IB+) create multiple cases per order, and .maybeSingle()
        // throws when more than one row matches.
        const { data: linkedCases } = await ctx.supabase
          .from("cases")
          .select("id")
          .eq("order_id", order.id)
          .limit(1);

        if (!linkedCases || linkedCases.length === 0) {
          // Orphan order — create case and alert
          const caseId = crypto.randomUUID();
          await ctx.supabase.from("cases").insert({
            id: caseId,
            order_id: order.id,
            email: order.email,
            tier: order.tier,
            status: "awaiting-intake",
            file_urls: [],
          });

          await sendEmail({
            to: ctx.operatorEmail,
            subject: `URGENT: Orphan order recovered — ${escapeHtml(order.email)}`,
            html: `<h1 style="color: #EF4444;">Orphan Order — Case Auto-Created</h1>
              <p>Order existed with no linked case. Auto-created case.</p>
              <div style="background: #1C1917; padding: 24px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #EF4444;">
                <p style="margin: 0; color: #D4D4D8;"><strong style="color: white;">Customer:</strong> ${escapeHtml(order.email)}</p>
                <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Tier:</strong> ${escapeHtml(order.tier)}</p>
                <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">Order ID:</strong> ${order.id}</p>
                <p style="margin: 8px 0 0; color: #D4D4D8;"><strong style="color: white;">New Case ID:</strong> ${caseId}</p>
              </div>
              <p><strong>Action:</strong> Verify and send customer their intake email.</p>`,
          }, { category: "operator-alert", case_id: caseId, order_id: order.id, metadata: { reason: "orphan-order" } });
          result.errors++;
        }
      }
    }
  } catch (err) {
    console.error("[Drip Cron] Part 9b orphan order detection error:", err);
    result.errors++;
  }

  return result;
}
