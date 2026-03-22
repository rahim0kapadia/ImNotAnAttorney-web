/**
 * @file Parts 10, 11 — Customer lifecycle emails
 *
 * Part 10: Report expiry warnings (30-day warning before 12-month expiry)
 * Part 11: Abandoned checkout recovery emails (24-48h after checkout abandonment)
 */

import { sendEmailWithRetry, escapeHtml } from "@/lib/email";
import { TIER_CORE } from "@/lib/tiers";
import type { CronContext, CronResult } from "./types";
import { emptyResult } from "./types";

// ============================================================
// PART 10: REPORT EXPIRING SOON EMAIL (E9)
// ============================================================

export async function sendReportExpiryWarnings(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  const thirtyDaysFromNow = new Date(ctx.now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const thirtyOneDaysFromNow = new Date(ctx.now);
  thirtyOneDaysFromNow.setDate(thirtyOneDaysFromNow.getDate() + 31);

  const { data: expiringCases } = await ctx.supabase
    .from("cases")
    .select("id, email, tier, report_token, report_token_expires_at")
    .eq("status", "delivered")
    .gte("report_token_expires_at", thirtyDaysFromNow.toISOString())
    .lt("report_token_expires_at", thirtyOneDaysFromNow.toISOString());

  if (expiringCases && expiringCases.length > 0) {
    for (const expCase of expiringCases) {
      if (!expCase.report_token) continue;

      // Dedup via drip_emails
      const { data: expSub } = await ctx.supabase
        .from("subscribers")
        .select("id")
        .eq("email", expCase.email.toLowerCase())
        .maybeSingle();

      if (expSub?.id) {
        const { data: alreadySent } = await ctx.supabase
          .from("drip_emails")
          .select("id")
          .eq("subscriber_id", expSub.id)
          .eq("email_key", `report_expiry_warning_${expCase.id}`)
          .maybeSingle();

        if (alreadySent) continue;
      }

      const sendResult = await sendEmailWithRetry({
        to: expCase.email,
        subject: "Your report link expires in 30 days",
        unsubscribeEmail: expCase.email,
        html: `
          <h1 style="color: #F59E0B;">Report Link Expiring Soon</h1>
          <p>Your report link will expire in 30 days. Make sure to access it before then:</p>
          <a href="${ctx.siteUrl}/report/${expCase.report_token}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">View Your Report</a>
          <p style="color: #A1A1AA;">After expiration, contact us to request a new link.</p>
        `,
      }, { category: "report-expiry-warning", case_id: expCase.id, metadata: { tier: expCase.tier } });

      if (sendResult.success) {
        // Ensure subscriber exists for dedup (some customers have no subscriber record)
        let subId = expSub?.id;
        if (!subId) {
          const { data: newSub } = await ctx.supabase
            .from("subscribers")
            .upsert({ email: expCase.email.toLowerCase(), source: "checkout" }, { onConflict: "email" })
            .select("id")
            .single();
          subId = newSub?.id;
        }
        if (subId) {
          await ctx.supabase.from("drip_emails").insert({
            subscriber_id: subId,
            email_key: `report_expiry_warning_${expCase.id}`,
          });
        }
        result.sent++;
      }
    }
  }

  return result;
}

// ============================================================
// PART 11: ABANDONED CHECKOUT RECOVERY EMAIL (U8)
// ============================================================

export async function sendAbandonedCheckoutEmails(ctx: CronContext): Promise<CronResult> {
  const result = emptyResult();

  const abandonedStart = new Date(ctx.now);
  abandonedStart.setHours(abandonedStart.getHours() - 48);
  const abandonedEnd = new Date(ctx.now);
  abandonedEnd.setHours(abandonedEnd.getHours() - 24);

  const { data: abandonedSubs } = await ctx.supabase
    .from("subscribers")
    .select("id, email, created_at")
    .eq("source", "checkout")
    .gte("created_at", abandonedStart.toISOString())
    .lt("created_at", abandonedEnd.toISOString())
    .is("unsubscribed_at", null);

  if (abandonedSubs && abandonedSubs.length > 0) {
    // Batch-fetch paid orders and dedup records to avoid N+1 queries
    const abEmails = abandonedSubs.map((s: { email: string }) => s.email.toLowerCase());
    const abSubIds = abandonedSubs.map((s: { id: string }) => s.id);

    const { data: paidOrders } = await ctx.supabase
      .from("orders")
      .select("email")
      .in("email", abEmails)
      .eq("status", "paid");
    const paidEmailSet = new Set(
      (paidOrders ?? []).map((o: { email: string }) => o.email.toLowerCase())
    );

    const dedupKeys = abSubIds.map((id: string) => `abandoned_checkout_${id}`);
    const { data: sentRecords } = await ctx.supabase
      .from("drip_emails")
      .select("subscriber_id, email_key")
      .in("subscriber_id", abSubIds)
      .in("email_key", dedupKeys);
    const sentSet = new Set(
      (sentRecords ?? []).map((r: { subscriber_id: string; email_key: string }) => `${r.subscriber_id}:${r.email_key}`)
    );

    for (const abSub of abandonedSubs) {
      if (paidEmailSet.has(abSub.email.toLowerCase())) continue; // They bought — skip
      if (sentSet.has(`${abSub.id}:abandoned_checkout_${abSub.id}`)) continue; // Already sent

      const sendResult = await sendEmailWithRetry({
        to: abSub.email,
        subject: "Still thinking about the Case Decoder?",
        unsubscribeEmail: abSub.email,
        html: `
          <h1 style="color: #F59E0B;">You Were Close</h1>
          <p>You started checkout but didn't finish. No pressure — but if you're still thinking about it, the Case Decoder is the right place to start.</p>
          <p>For ${TIER_CORE["case-decoder"].priceDisplay}, you get a plain-English charge breakdown, 15 calibrated questions for your attorney, ready-to-send email templates, and a 7-day action plan.</p>
          <a href="${ctx.siteUrl}/checkout?tier=case-decoder" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Continue to Checkout</a>
          <p style="color: #A1A1AA;">Questions? Reply to this email — a real person reads every message.</p>
        `,
      }, { category: "abandoned-checkout", metadata: { subscriber_id: abSub.id } });

      if (sendResult.success) {
        await ctx.supabase.from("drip_emails").insert({
          subscriber_id: abSub.id,
          email_key: `abandoned_checkout_${abSub.id}`,
        });
        result.sent++;
      } else {
        result.errors++;
      }
    }
  }

  return result;
}
