/**
 * GET /api/cron/court-reminders — Sends court date reminder emails.
 *
 * Schedule: Every 6 hours via cron-job.org.
 * Protected by CRON_AUTH_TOKEN bearer token.
 *
 * Queries active reminders, checks which intervals are due,
 * sends emails, marks as sent. Handles post-court follow-up separately.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
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
  (ctx: { firstName: string; chargeType: string; countyState: string; courtDate: string; token: string }) => { subject: string; html: string }
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
      };

      // Pre-court reminders
      for (const interval of REMINDER_INTERVALS) {
        if (daysUntil <= interval.daysBefore && !alreadySent.has(interval.key)) {
          const builder = EMAIL_BUILDERS[interval.key];
          if (!builder) continue;

          try {
            const email = builder(ctx);
            await sendEmail({ to: r.email, subject: email.subject, html: email.html });
            alreadySent.add(interval.key);
            sent++;
          } catch (e) {
            console.error(`[Court Reminders Cron] Failed ${interval.key} for ${r.id}:`, e);
            errors++;
          }
        }
      }

      // Post-court follow-up (+1 day)
      if (daysUntil < -1 && !alreadySent.has(POST_COURT_KEY)) {
        try {
          const email = postCourtEmail(ctx);
          await sendEmail({ to: r.email, subject: email.subject, html: email.html });
          alreadySent.add(POST_COURT_KEY);
          sent++;

          // Mark as completed after post-court email
          await supabase
            .from("court_reminders")
            .update({ status: "completed", reminders_sent: Array.from(alreadySent) })
            .eq("id", r.id);
          continue; // Skip the regular update below
        } catch (e) {
          console.error(`[Court Reminders Cron] Failed post_court for ${r.id}:`, e);
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
