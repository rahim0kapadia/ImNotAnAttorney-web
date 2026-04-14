/**
 * GET /api/cron/lock-commissions — Locks commissions after 45-day holdback period.
 *
 * Schedule: Daily at 06:00 UTC via cron-job.org.
 * Protected by CRON_AUTH_TOKEN bearer token.
 *
 * Finds referrals where locked_at IS NULL, created_at < 45 days ago,
 * and commission_amount > 0. Groups by partner, batch-locks all in one UPDATE,
 * then notifies each partner via their preferred channel (email/SMS/both).
 *
 * Safety invariant: .gt("commission_amount", 0) excludes refunded orders
 * whose commission was zeroed — those should never be locked.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";
import { sendSMS, capSMS } from "@/lib/sms";
import { getPartnerPrefs, shouldSendEmail, shouldSendSMS } from "@/lib/notification-prefs";

const HOLDBACK_DAYS = 45;

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const lock = await acquireCronLock("lock-commissions", 23 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();
  let locked = 0;
  let errors = 0;

  try {
    const cutoff = new Date(Date.now() - HOLDBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: referrals, error: fetchErr } = await supabase
      .from("referrals")
      .select("id, partner_id, commission_amount")
      .is("locked_at", null)
      .lt("created_at", cutoff)
      .gt("commission_amount", 0)
      .limit(200);

    if (fetchErr) {
      console.error("[Lock Commissions] Fetch error:", fetchErr);
      await releaseCronLock(lock.executionId, "failed");
      return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
    }

    if (!referrals || referrals.length === 0) {
      await releaseCronLock(lock.executionId, "completed");
      return NextResponse.json({ locked: 0, message: "No commissions to lock" });
    }

    // Group by partner for batch notifications
    const byPartner: Record<string, { ids: string[]; total: number }> = {};
    for (const ref of referrals) {
      if (!byPartner[ref.partner_id]) {
        byPartner[ref.partner_id] = { ids: [], total: 0 };
      }
      byPartner[ref.partner_id].ids.push(ref.id);
      byPartner[ref.partner_id].total += ref.commission_amount || 0;
    }

    // Lock all referrals in one UPDATE
    const allIds = referrals.map((ref) => ref.id);
    const { error: lockErr } = await supabase
      .from("referrals")
      .update({ locked_at: new Date().toISOString() })
      .in("id", allIds);

    if (lockErr) {
      console.error("[Lock Commissions] Lock error:", lockErr);
      errors++;
    } else {
      locked = allIds.length;
    }

    // Notify each partner
    for (const [partnerId, { total }] of Object.entries(byPartner)) {
      const { data: partner } = await supabase
        .from("partners")
        .select("email, phone, notification_prefs, name")
        .eq("id", partnerId)
        .maybeSingle();

      if (!partner) continue;

      const prefs = getPartnerPrefs(partner.notification_prefs);
      const dollars = (total / 100).toFixed(2);

      if (shouldSendEmail(prefs.payout)) {
        try {
          await sendEmail({
            to: partner.email,
            subject: `$${dollars} commission confirmed`,
            html: `
              <p style="color:#D4D4D8;font-size:15px;">Hey ${escapeHtml(partner.name)},</p>
              <p style="color:#F59E0B;font-size:20px;font-weight:bold;">$${dollars} confirmed</p>
              <p style="color:#D4D4D8;font-size:14px;">This amount is confirmed and will be included in your next monthly payout on the 1st.</p>
            `,
            unsubscribeEmail: partner.email,
          }, {
            category: "commission-locked",
            metadata: { partner_id: partnerId, amount: total },
          });
        } catch (e) {
          console.warn("[Lock Commissions] Notification email failed:", e);
        }
      }

      if (shouldSendSMS(prefs.payout) && partner.phone) {
        sendSMS(partner.phone, capSMS(`INAA: $${dollars} commission confirmed! Included in your next monthly payout.`))
          .catch((e) => console.warn("[Lock Commissions] Notification SMS failed:", e));
      }
    }

    await releaseCronLock(lock.executionId, "completed");
    return NextResponse.json({ locked, errors, partners: Object.keys(byPartner).length });
  } catch (err) {
    console.error("[Lock Commissions] Fatal:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
