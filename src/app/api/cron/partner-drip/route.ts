/**
 * @file /api/cron/partner-drip, Partner activation email drip
 *
 * Schedule: Every 6 hours via cron-job.org.
 * Protected by CRON_AUTH_TOKEN bearer token.
 *
 * Sends Day 1/3/7/14 activation emails to approved partners.
 * Day 0 welcome email is sent by the apply route, NOT by this cron.
 *
 * Sequence:
 *   partner_first_share  (Day 1)
 *   partner_the_math     (Day 3)
 *   partner_social_proof (Day 7)
 *   partner_checkin      (Day 14)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { sendSMS, capSMS } from "@/lib/sms";
import { getPartnerPrefs, shouldSendEmail, shouldSendSMS } from "@/lib/notification-prefs";
import { SITE_URL } from "@/lib/site";
import {
  partnerFirstShareEmail,
  partnerTheMathEmail,
  partnerSocialProofEmail,
  partnerCheckinEmail,
  partnerDay30Email,
  partnerDay60Email,
} from "@/lib/partner-emails";

// ── Drip sequence definition ────────────────────────────────
interface DripStep {
  key: string;
  dayThreshold: number;
  buildEmail: (partner: PartnerRow) => { subject: string; html: string };
}

interface PartnerRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  notification_prefs: Record<string, string> | null;
  promo_code: string | null;
  source: string | null;
  total_referrals: number;
  total_commission: number;
  last_activation_email_key: string | null;
  created_at: string;
}

const DRIP_SEQUENCE: DripStep[] = [
  {
    key: "partner_first_share",
    dayThreshold: 1,
    buildEmail: (p) =>
      partnerFirstShareEmail(
        p.name,
        p.promo_code || "YOUR-CODE",
        `${SITE_URL}/r/${encodeURIComponent(p.promo_code || "")}`,
        p.source
      ),
  },
  {
    key: "partner_the_math",
    dayThreshold: 3,
    buildEmail: (p) => partnerTheMathEmail(p.name),
  },
  {
    key: "partner_social_proof",
    dayThreshold: 7,
    buildEmail: (p) => partnerSocialProofEmail(p.name),
  },
  {
    key: "partner_checkin",
    dayThreshold: 14,
    buildEmail: (p) =>
      partnerCheckinEmail(p.name, p.total_referrals || 0, p.total_commission || 0),
  },
  {
    key: "partner_day30",
    dayThreshold: 30,
    buildEmail: (p) => partnerDay30Email(p.name, p.total_referrals || 0),
  },
  {
    key: "partner_day60",
    dayThreshold: 60,
    buildEmail: (p) => partnerDay60Email(p.name),
  },
];

/** Sequence key order for comparison. */
const KEY_ORDER = DRIP_SEQUENCE.map((s) => s.key);

export async function GET(req: NextRequest) {
  // ── Auth ──
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  // ── Idempotency guard (5h window for 6h interval) ──
  const lock = await acquireCronLock("partner-drip", 5 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // Fetch approved partners who haven't completed the full drip sequence
    const { data: partners, error: fetchErr } = await supabase
      .from("partners")
      .select(
        "id, name, email, phone, notification_prefs, promo_code, source, total_referrals, total_commission, last_activation_email_key, created_at"
      )
      .eq("status", "approved")
      .or(
        "last_activation_email_key.is.null,last_activation_email_key.neq.partner_day60"
      )
      .limit(100);

    if (fetchErr) {
      console.error("[Partner Drip] Fetch error:", fetchErr);
      await releaseCronLock(lock.executionId, "failed");
      return NextResponse.json(
        { error: "Failed to fetch partners" },
        { status: 500 }
      );
    }

    if (!partners || partners.length === 0) {
      await releaseCronLock(lock.executionId, "completed");
      return NextResponse.json({ sent: 0, skipped: 0, errors: 0 });
    }

    const now = Date.now();

    for (const partner of partners) {
      try {
        const createdAt = new Date(partner.created_at).getTime();
        const daysSinceCreation = (now - createdAt) / (1000 * 60 * 60 * 24);
        const lastKey = partner.last_activation_email_key;

        // Determine the next email in sequence
        let nextStep: DripStep | null = null;

        if (!lastKey) {
          // Never sent any activation email, start at step 0
          nextStep = DRIP_SEQUENCE[0];
        } else {
          const lastIdx = KEY_ORDER.indexOf(lastKey);
          if (lastIdx >= 0 && lastIdx < DRIP_SEQUENCE.length - 1) {
            nextStep = DRIP_SEQUENCE[lastIdx + 1];
          }
          // If lastIdx is the last step (partner_day60), sequence is complete
        }

        if (!nextStep) {
          skipped++;
          continue;
        }

        // Check if enough days have passed
        if (daysSinceCreation < nextStep.dayThreshold) {
          skipped++;
          continue;
        }

        // Build and send via preferred channels
        const { subject, html } = nextStep.buildEmail(partner as PartnerRow);
        const prefs = getPartnerPrefs(partner.notification_prefs);
        let anySendSucceeded = false;

        if (shouldSendEmail(prefs.drip)) {
          const result = await sendEmail(
            {
              to: partner.email,
              subject,
              html,
              unsubscribeEmail: partner.email,
            },
            {
              category: "partner-drip",
              email_key: nextStep.key,
              metadata: {
                partner_id: partner.id,
                step: nextStep.key,
                day: nextStep.dayThreshold,
              },
            }
          );
          if (result.success) anySendSucceeded = true;
        }

        if (shouldSendSMS(prefs.drip) && partner.phone) {
          const smsResult = await sendSMS(partner.phone, capSMS(`${subject}. Dashboard: https://imnotanattorney.com/partner/dashboard`), { category: "partner_drip", partner_id: partner.id });
          if (smsResult.success) anySendSucceeded = true;
          else console.warn("[Partner Drip] SMS failed:", smsResult.error);
        }

        if (anySendSucceeded) {
          await supabase
            .from("partners")
            .update({
              last_activation_email_key: nextStep.key,
              activation_email_sent_at: new Date().toISOString(),
            })
            .eq("id", partner.id);
          sent++;
        } else {
          console.error(`[Partner Drip] All channels failed for ${nextStep.key} to ${partner.email}`);
          errors++;
        }
      } catch (partnerErr) {
        console.error(
          `[Partner Drip] Error processing partner ${partner.id}:`,
          partnerErr
        );
        errors++;
      }
    }

    await releaseCronLock(lock.executionId, "completed");
    return NextResponse.json({ sent, skipped, errors });
  } catch (err) {
    console.error("[Partner Drip] Unexpected error:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
