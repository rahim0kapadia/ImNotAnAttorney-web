/**
 * @file Parts 10, 11 — Customer lifecycle emails
 *
 * Part 10: Report expiry warnings (30-day warning before 12-month expiry)
 * Part 11: Abandoned checkout recovery (2-email sequence: 24h empathy + 48h urgency)
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
    .lt("report_token_expires_at", thirtyOneDaysFromNow.toISOString())
    .limit(200);

  if (expiringCases && expiringCases.length > 0) {
    // ── N+1 FIX: Batch-fetch subscribers + dedup records ──
    const expEmails = [...new Set(expiringCases.map((c) => c.email.toLowerCase()))];
    const { data: expSubs } = await ctx.supabase
      .from("subscribers").select("id, email").in("email", expEmails);
    const expSubByEmail = new Map(
      (expSubs ?? []).map((s) => [s.email.toLowerCase(), { id: s.id }])
    );
    const expSubIds = (expSubs ?? []).map((s) => s.id);
    const { data: expDripEmails } = expSubIds.length > 0
      ? await ctx.supabase.from("drip_emails").select("subscriber_id, email_key")
          .in("subscriber_id", expSubIds).like("email_key", "report_expiry_warning_%")
      : { data: [] as { subscriber_id: string; email_key: string }[] };
    const expSentKeys = new Map<string, Set<string>>();
    for (const d of expDripEmails ?? []) {
      if (!expSentKeys.has(d.subscriber_id)) expSentKeys.set(d.subscriber_id, new Set());
      expSentKeys.get(d.subscriber_id)!.add(d.email_key);
    }

    for (const expCase of expiringCases) {
      if (!expCase.report_token) continue;

      // Dedup via batch-fetched data
      const expSub = expSubByEmail.get(expCase.email.toLowerCase()) ?? null;

      if (expSub?.id) {
        const sentKeys = expSentKeys.get(expSub.id);
        if (sentKeys?.has(`report_expiry_warning_${expCase.id}`)) continue;
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

  // Two-email sequence:
  // Email 1: 24-48h after checkout abandonment — empathy + value
  // Email 2: 48-72h after checkout abandonment — information gap + finality
  const windowStart = new Date(ctx.now);
  windowStart.setHours(windowStart.getHours() - 72);
  const windowEnd = new Date(ctx.now);
  windowEnd.setHours(windowEnd.getHours() - 24);

  const { data: abandonedSubs } = await ctx.supabase
    .from("subscribers")
    .select("id, email, created_at")
    .eq("source", "checkout")
    .gte("created_at", windowStart.toISOString())
    .lt("created_at", windowEnd.toISOString())
    .is("unsubscribed_at", null)
    .limit(200);

  if (!abandonedSubs || abandonedSubs.length === 0) return result;

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

  const allDedupKeys = abSubIds.flatMap((id: string) => [
    `abandoned_checkout_1_${id}`,
    `abandoned_checkout_2_${id}`,
  ]);
  const { data: sentRecords } = await ctx.supabase
    .from("drip_emails")
    .select("subscriber_id, email_key")
    .in("subscriber_id", abSubIds)
    .in("email_key", allDedupKeys);
  const sentSet = new Set(
    (sentRecords ?? []).map((r: { subscriber_id: string; email_key: string }) => `${r.subscriber_id}:${r.email_key}`)
  );

  for (const abSub of abandonedSubs) {
    if (paidEmailSet.has(abSub.email.toLowerCase())) continue;

    const ageMs = ctx.now.getTime() - new Date(abSub.created_at).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);

    const key1 = `abandoned_checkout_1_${abSub.id}`;
    const key2 = `abandoned_checkout_2_${abSub.id}`;
    const sent1 = sentSet.has(`${abSub.id}:${key1}`);
    const sent2 = sentSet.has(`${abSub.id}:${key2}`);

    let emailToSend: { subject: string; html: string; key: string } | null = null;

    if (ageHours >= 24 && ageHours < 48 && !sent1) {
      emailToSend = {
        subject: "Your case isn\u2019t going to wait",
        key: key1,
        html: `
          <h1 style="color: #F59E0B;">You started something important</h1>
          <p>You came to ImNotAnAttorney because something about your case didn\u2019t feel right. That instinct matters.</p>
          <p>The Case Decoder gives you a documented analysis of your charge \u2014 the kind of breakdown that turns confusion into specific questions your attorney has to answer.</p>
          <p style="margin: 16px 0; padding: 16px; border-left: 3px solid #F59E0B; color: #D4D4D8;">For ${TIER_CORE["case-decoder"].priceDisplay}: a plain-English charge breakdown, 15 calibrated questions, ready-to-send email templates, and a 7-day action plan.</p>
          <a href="${ctx.siteUrl}/checkout?tier=case-decoder" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Get My Case Decoder \u2014 ${TIER_CORE["case-decoder"].priceDisplay}</a>
          <p style="color: #A1A1AA;">Questions? Reply to this email \u2014 a real person reads every message.</p>
        `,
      };
    } else if (ageHours >= 48 && ageHours < 72 && sent1 && !sent2) {
      emailToSend = {
        subject: "The question your attorney hopes you never ask",
        key: key2,
        html: `
          <h1 style="color: #F59E0B;">Everyone in that courtroom knows each other</h1>
          <p>The judge, the prosecutor, your defense attorney \u2014 they work together every week. You\u2019re the only stranger in the room.</p>
          <p>The Case Decoder closes that information gap. It gives you the specific questions that show your attorney you\u2019re paying attention \u2014 the kind of questions that change how they prepare your case.</p>
          <p style="margin: 16px 0; padding: 16px; border-left: 3px solid #F59E0B; color: #D4D4D8;">Defendants who prepare differently get treated differently. This is how you start.</p>
          <a href="${ctx.siteUrl}/checkout?tier=case-decoder" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 16px;">Get My Case Decoder \u2014 ${TIER_CORE["case-decoder"].priceDisplay}</a>
          <p style="color: #A1A1AA;">This is the last email about this. If now isn\u2019t the right time, we understand. Reply if you have questions.</p>
        `,
      };
    }

    if (!emailToSend) continue;

    const sendResult = await sendEmailWithRetry({
      to: abSub.email,
      subject: emailToSend.subject,
      unsubscribeEmail: abSub.email,
      html: emailToSend.html,
    }, { category: "abandoned-checkout", metadata: { subscriber_id: abSub.id } });

    if (sendResult.success) {
      await ctx.supabase.from("drip_emails").insert({
        subscriber_id: abSub.id,
        email_key: emailToSend.key,
      });
      result.sent++;
    } else {
      result.errors++;
    }
  }

  return result;
}
