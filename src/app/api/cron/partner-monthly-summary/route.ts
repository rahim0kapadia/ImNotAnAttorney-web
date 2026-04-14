/**
 * GET /api/cron/partner-monthly-summary -- Monthly earning summary for active partners.
 *
 * Schedule: 1st of each month, 2PM UTC (10AM ET) via cron-job.org.
 * Protected by CRON_AUTH_TOKEN bearer token.
 *
 * Sends SMS and/or email summary to partners who earned commissions in the
 * previous month or have a pending balance. Processes partners sequentially
 * to avoid overwhelming the SMS gateway.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";
import { sendSMS } from "@/lib/sms";
import { getPartnerPrefs, shouldSendEmail, shouldSendSMS } from "@/lib/notification-prefs";
import { buildMonthlySummarySMS } from "@/lib/partner-sms";
import { getTierInfo, getNextTier } from "@/lib/partner-data";
import { formatCents } from "@/lib/format";

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const lock = await acquireCronLock("partner-monthly-summary", 23 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();
  let sentSMS = 0;
  let sentEmail = 0;
  let partnersNotified = 0;
  let skipped = 0;

  try {
    // Compute previous month date range
    const now = new Date();
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prevMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
    const monthName = prevMonthStart.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
    const rangeStart = prevMonthStart.toISOString();
    const rangeEnd = prevMonthEnd.toISOString();

    // Fetch approved partners (paginated to avoid PostgREST 1000-row cap)
    const { data: partners, error: fetchErr } = await supabase
      .from("partners")
      .select("id, name, email, phone, notification_prefs, total_commission, total_paid_out, commission_tier, total_referrals")
      .eq("status", "approved")
      .limit(500);

    if (fetchErr) {
      console.error("[MonthlySummary] Fetch partners error:", fetchErr);
      await releaseCronLock(lock.executionId, "failed");
      return NextResponse.json({ error: "Failed to fetch partners" }, { status: 500 });
    }

    if ((partners || []).length >= 500) {
      console.warn("[MonthlySummary] Partner count hit limit (500). Pagination needed.");
    }

    // Batch: fetch ALL referrals for the month in one query, group in memory
    const { data: allMonthReferrals } = await supabase
      .from("referrals")
      .select("partner_id, commission_amount, tier")
      .gte("created_at", rangeStart)
      .lte("created_at", rangeEnd)
      .limit(5000);

    const referralsByPartner = new Map<string, { commission_amount: number; tier: string }[]>();
    for (const ref of (allMonthReferrals || [])) {
      const existing = referralsByPartner.get(ref.partner_id) || [];
      existing.push(ref);
      referralsByPartner.set(ref.partner_id, existing);
    }

    for (const partner of (partners || [])) {
      const pendingBalance = (partner.total_commission || 0) - (partner.total_paid_out || 0);
      const monthRefs = referralsByPartner.get(partner.id) || [];
      const monthEarningsCents = monthRefs.reduce((sum, r) => sum + (r.commission_amount || 0), 0);

      // Skip partners with no activity and no pending balance
      if (monthRefs.length === 0 && pendingBalance <= 0) {
        skipped++;
        continue;
      }

      const prefs = getPartnerPrefs(partner.notification_prefs || null);

      // SMS
      if (shouldSendSMS(prefs.commission_earned) && partner.phone) {
        try {
          const smsText = buildMonthlySummarySMS({
            monthName,
            monthEarningsCents,
            totalBalanceCents: pendingBalance,
          });
          await sendSMS(partner.phone, smsText, {
            category: "partner_monthly_summary",
            partner_id: partner.id,
          });
          sentSMS++;
        } catch (e) {
          console.warn(`[MonthlySummary] SMS failed for partner ${partner.id}:`, e);
        }
      }

      // Email
      if (shouldSendEmail(prefs.commission_earned) && partner.email) {
        try {
          const tierBreakdown = monthRefs.reduce<Record<string, { count: number; total: number }>>((acc, r) => {
            if (!acc[r.tier]) acc[r.tier] = { count: 0, total: 0 };
            acc[r.tier].count++;
            acc[r.tier].total += r.commission_amount || 0;
            return acc;
          }, {});

          const tierInfo = getTierInfo(partner.commission_tier || "partner");
          const nextTier = getNextTier(partner.commission_tier || "partner");

          const tierRows = Object.entries(tierBreakdown)
            .map(([tier, data]) =>
              `<tr><td style="padding:4px 8px;color:#D4D4D8;">${escapeHtml(tier)}</td><td style="padding:4px 8px;color:#D4D4D8;">${data.count}</td><td style="padding:4px 8px;color:#F59E0B;">${formatCents(data.total)}</td></tr>`
            )
            .join("");

          const progressLine = nextTier
            ? `<p style="color:#D4D4D8;">Current tier: <strong style="color:white;">${escapeHtml(tierInfo.label)} (${tierInfo.rate}%)</strong> -- ${partner.total_referrals || 0}/${nextTier.threshold} to ${escapeHtml(nextTier.label)} (${nextTier.rate}%)</p>`
            : `<p style="color:#D4D4D8;">Current tier: <strong style="color:#F59E0B;">${escapeHtml(tierInfo.label)} (${tierInfo.rate}%)</strong> -- Max tier reached</p>`;

          const firstName = escapeHtml((partner.name || "").split(" ")[0]);

          await sendEmail(
            {
              to: partner.email,
              subject: `Your ${monthName} Partner Summary -- ImNotAnAttorney`,
              html: `
                <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;">
                  <h2 style="color:#F59E0B;">${escapeHtml(monthName)} Summary</h2>
                  <p style="color:#D4D4D8;">Hey ${firstName},</p>
                  <div style="background:#1C1917;padding:20px;border-radius:12px;border-left:4px solid #F59E0B;margin:16px 0;">
                    <p style="color:white;font-size:24px;margin:0;">${formatCents(monthEarningsCents)} earned</p>
                    <p style="color:#A1A1AA;margin:4px 0 0;">${monthRefs.length} referral${monthRefs.length !== 1 ? "s" : ""} in ${escapeHtml(monthName)}</p>
                  </div>
                  ${tierRows ? `<table style="width:100%;border-collapse:collapse;margin:12px 0;"><thead><tr><th style="text-align:left;padding:4px 8px;color:#71717A;">Product</th><th style="text-align:left;padding:4px 8px;color:#71717A;">Sales</th><th style="text-align:left;padding:4px 8px;color:#71717A;">Earned</th></tr></thead><tbody>${tierRows}</tbody></table>` : ""}
                  ${progressLine}
                  <div style="background:#1C1917;padding:16px;border-radius:8px;margin:16px 0;">
                    <p style="color:#A1A1AA;margin:0;">Pending payout balance</p>
                    <p style="color:white;font-size:20px;margin:4px 0 0;">${formatCents(pendingBalance)}</p>
                    <p style="color:#71717A;font-size:13px;margin:4px 0 0;">Payouts process on the 1st of each month.</p>
                  </div>
                </div>
              `,
              unsubscribeEmail: partner.email,
            },
            {
              category: "partner-monthly-summary",
              metadata: { partner_id: partner.id, month: monthName },
            }
          );
          sentEmail++;
        } catch (e) {
          console.warn(`[MonthlySummary] Email failed for partner ${partner.id}:`, e);
        }
      }

      partnersNotified++;
    }

    await releaseCronLock(lock.executionId, "completed");

    return NextResponse.json({
      sent_sms: sentSMS,
      sent_email: sentEmail,
      partners_notified: partnersNotified,
      skipped,
    });
  } catch (err) {
    console.error("[MonthlySummary] Unexpected error:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
