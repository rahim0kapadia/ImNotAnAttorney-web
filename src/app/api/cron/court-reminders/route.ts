/**
 * GET /api/cron/court-reminders — Sends court date reminder emails.
 *
 * Schedule: Every 6 hours via cron-job.org.
 * Protected by CRON_AUTH_TOKEN bearer token.
 *
 * Queries active reminders, checks which intervals are due,
 * sends emails, marks as sent. Handles post-court follow-up separately.
 * Sends indemnitor (co-signer) copies of pre-court reminders.
 * Includes partner branding when applicable.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";
import { sendSMS, capSMS } from "@/lib/sms";
import { getClientPrefs, getPartnerPrefs, shouldSendEmail, shouldSendSMS, canSendClientSMS } from "@/lib/notification-prefs";
import { REMINDER_INTERVALS, POST_COURT_KEY } from "@/lib/court-reminders";
import {
  reminder14d,
  reminder7d,
  reminder3d,
  reminder1d,
  postCourtEmail,
} from "@/lib/court-reminder-emails";

const EMAIL_BUILDERS: Record<
  string,
  (ctx: { firstName: string; chargeType: string; countyState: string; courtDate: string; token: string; partnerCompany?: string }) => { subject: string; html: string }
> = {
  reminder_14d: reminder14d,
  reminder_7d: reminder7d,
  reminder_3d: reminder3d,
  reminder_1d: reminder1d,
  [POST_COURT_KEY]: postCourtEmail,
};

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const lock = await acquireCronLock("court-reminders", 5 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();
  let sent = 0;
  let errors = 0;

  try {
    // Fetch all active reminders
    const { data: reminders, error: fetchErr } = await supabase
      .from("court_reminders")
      .select("*")
      .eq("status", "active")
      .limit(200);

    if (fetchErr) {
      console.error("[Court Reminders Cron] Fetch error:", fetchErr);
      await releaseCronLock(lock.executionId, "failed");
      return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
    }

    if (!reminders || reminders.length === 0) {
      await releaseCronLock(lock.executionId, "completed");
      return NextResponse.json({ sent: 0, message: "No active reminders" });
    }

    // Batch-fetch partner company names + notification prefs for branding and alerts
    const promoCodes = [...new Set(reminders.filter(r => r.partner_promo_code).map(r => r.partner_promo_code as string))];
    const partnerMap: Record<string, { id: string; company: string; email: string; phone: string | null; notification_prefs: unknown }> = {};
    if (promoCodes.length > 0) {
      const { data: partners } = await supabase
        .from("partners")
        .select("id, promo_code, company, name, email, phone, notification_prefs")
        .in("promo_code", promoCodes);
      for (const p of (partners || [])) {
        partnerMap[p.promo_code] = {
          id: p.id,
          company: p.company || p.name,
          email: p.email,
          phone: p.phone,
          notification_prefs: p.notification_prefs,
        };
      }
    }

    const now = new Date();

    for (const r of reminders) {
      const courtDate = new Date(r.court_date + "T00:00:00");
      const diffMs = courtDate.getTime() - now.getTime();
      const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const alreadySent = new Set<string>(r.reminders_sent || []);

      const ctx = {
        firstName: r.first_name,
        chargeType: r.charge_type,
        countyState: r.county_state,
        courtDate: r.court_date,
        token: r.token,
        partnerCompany: r.partner_promo_code ? partnerMap[r.partner_promo_code]?.company : undefined,
      };

      // Pre-court reminders
      for (const interval of REMINDER_INTERVALS) {
        if (daysUntil <= interval.daysBefore && !alreadySent.has(interval.key)) {
          const builder = EMAIL_BUILDERS[interval.key];
          if (!builder) continue;

          const prefs = getClientPrefs(r.notification_prefs);

          try {
            const email = builder(ctx);
            const sends: Promise<unknown>[] = [];

            if (shouldSendEmail(prefs.court_reminders)) {
              sends.push(sendEmail({ to: r.email, subject: email.subject, html: email.html }));
            }

            if (shouldSendSMS(prefs.court_reminders) && canSendClientSMS(r.phone, r.sms_consent_at)) {
              const smsBody = capSMS(`${r.first_name}, court in ${interval.daysBefore}d (${r.court_date}). Prep: https://imnotanattorney.com/prep/${r.token}`);
              sends.push(sendSMS(r.phone!, smsBody, { category: "court_reminder", court_reminder_id: r.id }));
            }

            // Fallback: if prefs routed to zero channels, force email (keep people out of jail)
            if (sends.length === 0) {
              sends.push(sendEmail({ to: r.email, subject: email.subject, html: email.html }));
            }

            const results = await Promise.allSettled(sends);
            const anySucceeded = results.some(
              (res) => res.status === "fulfilled" && (res.value as { success?: boolean })?.success !== false
            );
            if (!anySucceeded) {
              console.error(`[Cron] All sends failed for ${interval.key} / ${r.id}`);
              errors++;
              continue; // skip alreadySent — will retry next cron run
            }
            alreadySent.add(interval.key);
            sent++;

            // Indemnitor — email only for now
            if (r.indemnitor_email) {
              await sendEmail({
                to: r.indemnitor_email,
                subject: `${r.first_name}'s court date reminder`,
                html: email.html,
              }).catch(e => console.warn(`[Cron] Indemnitor email failed for ${r.id}:`, e));
            }

            // Partner "client reminded" notification (uses batch-fetched partnerMap, no N+1)
            if (r.partner_promo_code && partnerMap[r.partner_promo_code]) {
              const p = partnerMap[r.partner_promo_code];
              const partnerPrefs = getPartnerPrefs(p.notification_prefs as Record<string, string> | null);
              const msg = `We reminded ${r.first_name} about their court date on ${r.court_date}.`;
              const partnerSends: Promise<unknown>[] = [];

              if (shouldSendEmail(partnerPrefs.client_reminded)) {
                partnerSends.push(
                  sendEmail({
                    to: p.email,
                    subject: `Client reminder sent: ${r.first_name}`,
                    html: `<p style="color:#D4D4D8;font-size:15px;">${escapeHtml(msg)}</p>`,
                    unsubscribeEmail: p.email,
                  }, {
                    category: "partner-client-reminded",
                    metadata: { court_reminder_id: r.id, partner_promo_code: r.partner_promo_code },
                  }).catch(e => console.warn("[Cron] Partner notification email failed:", e))
                );
              }

              if (shouldSendSMS(partnerPrefs.client_reminded) && p.phone) {
                partnerSends.push(
                  sendSMS(p.phone, capSMS(`INAA: ${msg}`), { category: "partner_client_reminded", partner_id: p.id, court_reminder_id: r.id })
                    .catch(e => console.warn("[Cron] Partner notification SMS failed:", e))
                );
              }

              await Promise.allSettled(partnerSends);
            }
          } catch (e) {
            console.error(`[Cron] Failed ${interval.key} for ${r.id}:`, e);
            errors++;
          }
        }
      }

      // Post-court follow-up (+1 day)
      if (daysUntil < -1 && !alreadySent.has(POST_COURT_KEY)) {
        const prefs = getClientPrefs(r.notification_prefs);

        try {
          const email = postCourtEmail(ctx);
          const sends: Promise<unknown>[] = [];

          if (shouldSendEmail(prefs.post_court)) {
            sends.push(sendEmail({ to: r.email, subject: email.subject, html: email.html }));
          }

          if (shouldSendSMS(prefs.post_court) && canSendClientSMS(r.phone, r.sms_consent_at)) {
            sends.push(sendSMS(r.phone!, capSMS(`${r.first_name}, your court date passed. Check your prep page for next steps: https://imnotanattorney.com/prep/${r.token}`), { category: "post_court", court_reminder_id: r.id }));
          }

          // Fallback: if prefs routed to zero channels, force email
          if (sends.length === 0) {
            sends.push(sendEmail({ to: r.email, subject: email.subject, html: email.html }));
          }

          const results = await Promise.allSettled(sends);
          const anySucceeded = results.some(
            (res) => res.status === "fulfilled" && (res.value as { success?: boolean })?.success !== false
          );

          if (!anySucceeded) {
            console.error(`[Cron] All sends failed for post_court / ${r.id}`);
            errors++;
          } else {
            alreadySent.add(POST_COURT_KEY);
            sent++;

            // Mark as completed after post-court
            await supabase
              .from("court_reminders")
              .update({ status: "completed", reminders_sent: Array.from(alreadySent) })
              .eq("id", r.id);
            continue; // Skip the regular update below
          }
        } catch (e) {
          console.error(`[Cron] Failed post_court for ${r.id}:`, e);
          errors++;
        }
      }

      // Update reminders_sent if anything was added
      if (alreadySent.size > (r.reminders_sent || []).length) {
        await supabase
          .from("court_reminders")
          .update({ reminders_sent: Array.from(alreadySent) })
          .eq("id", r.id);
      }
    }

    await releaseCronLock(lock.executionId, "completed");
    return NextResponse.json({ sent, errors, processed: reminders.length });
  } catch (err) {
    console.error("[Court Reminders Cron] Fatal:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
