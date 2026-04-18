/**
 * GET /api/cron/check-in-prompt, Two-phase daily cron.
 *
 * Phase 1: Send check-in prompts to clients whose scheduled day is today.
 * Phase 2: Send missed-check-in alerts to bondsmen for yesterday's misses.
 *
 * Schedule: Daily 8am ET via cron-job.org (timezone-aware).
 * Auth: CRON_AUTH_TOKEN bearer (covered by /api/cron/* middleware).
 * Idempotency: Two separate lock keys for independent failure/retry.
 *
 * Uses after() to return 200 immediately, prevents cron-job.org timeout.
 * Each phase has independent try/catch, Phase 1 failure doesn't kill Phase 2.
 * Uses last_prompted_date (single column) not unbounded array.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";
import { sendSMS, capSMS } from "@/lib/sms";
import {
  getClientPrefs,
  getPartnerPrefs,
  shouldSendEmail,
  shouldSendSMS,
  canSendClientSMS,
} from "@/lib/notification-prefs";
import { getETDow, getETDate, getETMidnightUTC } from "@/lib/check-in-schedule";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE_SIZE = 500;

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const supabase = createAdminClient();

  // Acquire locks before returning, prevents duplicate after() work
  const lock1 = await acquireCronLock("check-in-prompt", 23 * 60 * 60 * 1000);
  const lock2 = await acquireCronLock("check-in-missed-alert", 23 * 60 * 60 * 1000);

  if (!lock1.shouldRun && !lock2.shouldRun) {
    return NextResponse.json({ skipped: true, reason: "both locks held" });
  }

  // Return 200 immediately so cron-job.org doesn't timeout.
  // All work runs post-response via after().
  after(async () => {
    const todayDow = getETDow();
    const todayDate = getETDate();

    // Pre-fetch partners with check_in_enabled=true. PostgREST inner-join would silently
    // no-op here because court_reminders.partner_promo_code is plain text (no FK). Use
    // explicit .in(enabledCodes) filter instead. Shared across both phases.
    let enabledCodes: string[] | null = null;
    async function loadEnabledCodes(): Promise<string[]> {
      if (enabledCodes !== null) return enabledCodes;
      const { data: enabledPartners } = await supabase
        .from("partners")
        .select("promo_code")
        .eq("check_in_enabled", true);
      enabledCodes = (enabledPartners || [])
        .map((p) => p.promo_code)
        .filter(Boolean) as string[];
      return enabledCodes;
    }

    // ================================================================
    // PHASE 1: Check-in prompts (independent try/catch)
    // ================================================================
    if (lock1.shouldRun) {
      try {
        const phase1Codes = await loadEnabledCodes();
        if (phase1Codes.length === 0) {
          console.log("[Check-In] Phase 1: no enabled partners, skipping");
          await releaseCronLock(lock1.executionId!, "completed");
        } else {
        let phase1Sent = 0;
        let phase1Errors = 0;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          // Filter on last_prompted_date instead of unbounded array
          const { data: reminders } = await supabase
            .from("court_reminders")
            .select("id, token, first_name, email, phone, notification_prefs, sms_consent_at, partner_promo_code")
            .eq("status", "active")
            .in("partner_promo_code", phase1Codes)
            .gt("court_date", todayDate)
            .contains("check_in_days", [todayDow])
            .or(`last_prompted_date.is.null,last_prompted_date.neq.${todayDate}`)
            .range(offset, offset + PAGE_SIZE - 1);

          if (!reminders || reminders.length === 0) {
            hasMore = false;
            break;
          }

          // Batch partner lookup: collect unique promo codes, fetch all at once
          const promoCodes = [...new Set(
            reminders.map((r) => r.partner_promo_code).filter(Boolean) as string[]
          )];
          const partnerMap = new Map<string, string>();
          if (promoCodes.length > 0) {
            const { data: partners } = await supabase
              .from("partners")
              .select("promo_code, company, name")
              .in("promo_code", promoCodes);
            for (const p of partners || []) {
              partnerMap.set(p.promo_code, p.company || p.name || "Your bondsman");
            }
          }

          for (const r of reminders) {
            const companyName = r.partner_promo_code
              ? (partnerMap.get(r.partner_promo_code) || "Your bondsman")
              : "Your bondsman";

            const prefs = getClientPrefs(r.notification_prefs);
            const prepUrl = `${SITE_URL}/prep/${r.token}`;
            const sends: Promise<unknown>[] = [];

            if (shouldSendEmail(prefs.check_in)) {
              sends.push(
                sendEmail({
                  to: r.email,
                  subject: `Check-in reminder from ${companyName}`,
                  html: `<p style="color:#D4D4D8;font-size:15px;">${escapeHtml(r.first_name)}, ${escapeHtml(companyName)} requests your check-in today.</p>
                         <a href="${prepUrl}" style="display:inline-block;padding:12px 24px;background:#F59E0B;color:#000;font-weight:bold;border-radius:8px;text-decoration:none;margin-top:16px;">Check In Now</a>
                         <p style="color:#71717A;font-size:12px;margin-top:16px;">This is an automated message. Do not reply to this email.</p>`,
                })
              );
            }

            if (shouldSendSMS(prefs.check_in) && canSendClientSMS(r.phone, r.sms_consent_at)) {
              sends.push(
                sendSMS(
                  r.phone!,
                  capSMS(`${r.first_name}, ${companyName} requests your check-in today: imnotanattorney.com/prep/${r.token}, Do not reply to this text`),
                  { category: "check_in_prompt", court_reminder_id: r.id, subject: "Check-In Reminder" }
                )
              );
            }

            try {
              await Promise.allSettled(sends);
              // Simple column update instead of array append RPC
              await supabase
                .from("court_reminders")
                .update({ last_prompted_date: todayDate })
                .eq("id", r.id);
              phase1Sent++;
            } catch (e) {
              console.error(`[Check-In Prompt] Failed for ${r.id}:`, e);
              phase1Errors++;
            }
          }

          offset += PAGE_SIZE;
          if (reminders.length < PAGE_SIZE) hasMore = false;
        }

        console.log(`[Check-In] Phase 1 complete: ${phase1Sent} sent, ${phase1Errors} errors`);
        await releaseCronLock(lock1.executionId!, "completed");
        }
      } catch (err) {
        console.error("[Check-In] Phase 1 failed:", err);
        try { await releaseCronLock(lock1.executionId!, "failed"); } catch {}
      }
    }

    // ================================================================
    // PHASE 2: Missed check-in alerts (yesterday) (independent)
    // ================================================================
    if (lock2.shouldRun) {
      try {
        const phase2Codes = await loadEnabledCodes();
        if (phase2Codes.length === 0) {
          console.log("[Check-In] Phase 2: no enabled partners, skipping");
          await releaseCronLock(lock2.executionId!, "completed");
          return;
        }

        // Compute yesterday via calendar subtraction (not ms, avoids DST breakage)
        const [y, m, d] = todayDate.split("-").map(Number);
        const yd = new Date(Date.UTC(y, m - 1, d));
        yd.setUTCDate(yd.getUTCDate() - 1);
        const yesterdayDate = yd.toISOString().slice(0, 10);
        const yesterdayDow = getETDow(new Date(yesterdayDate + "T12:00:00Z"));
        const yesterdayStart = getETMidnightUTC(yesterdayDate);
        const todayStart = getETMidnightUTC(todayDate);

        // Fetch all reminders that were scheduled yesterday (paginated)
        const allScheduled: Array<{ id: string; first_name: string; partner_promo_code: string | null }> = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          // .in(partner_promo_code, phase2Codes) implies non-null; no separate .not() needed
          const { data } = await supabase
            .from("court_reminders")
            .select("id, first_name, partner_promo_code")
            .eq("status", "active")
            .in("partner_promo_code", phase2Codes)
            .gt("court_date", todayDate)
            .contains("check_in_days", [yesterdayDow])
            .range(offset, offset + PAGE_SIZE - 1);

          if (!data || data.length === 0) { hasMore = false; break; }
          allScheduled.push(...data);
          offset += PAGE_SIZE;
          if (data.length < PAGE_SIZE) hasMore = false;
        }

        if (allScheduled.length > 0) {
          // Batch fetch check-ins in chunks to avoid PostgREST URL length limits
          const ids = allScheduled.map((r) => r.id);
          const checkedInSet = new Set<string>();
          const CHUNK_SIZE = 500;
          for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            const chunk = ids.slice(i, i + CHUNK_SIZE);
            const { data: checkIns } = await supabase
              .from("client_check_ins")
              .select("court_reminder_id")
              .in("court_reminder_id", chunk)
              .gte("checked_in_at", yesterdayStart.toISOString())
              .lt("checked_in_at", todayStart.toISOString());
            for (const c of checkIns || []) {
              checkedInSet.add(c.court_reminder_id);
            }
          }

          // Group misses by partner
          const missesByPartner = new Map<string, string[]>();
          for (const r of allScheduled) {
            if (checkedInSet.has(r.id) || !r.partner_promo_code) continue;
            const existing = missesByPartner.get(r.partner_promo_code) || [];
            existing.push(r.first_name);
            missesByPartner.set(r.partner_promo_code, existing);
          }

          // Batch-fetch all partners in one query
          const allPromoCodes = [...missesByPartner.keys()];
          const { data: partnerRows } = await supabase
            .from("partners")
            .select("id, email, phone, notification_prefs, sms_consent_at, promo_code")
            .in("promo_code", allPromoCodes);
          const partnerByPromo = new Map((partnerRows || []).map((p) => [p.promo_code, p]));

          let phase2Alerts = 0;

          // Send one summary per partner
          for (const [promoCode, missedNames] of missesByPartner) {
            const partner = partnerByPromo.get(promoCode);
            if (!partner) continue;

            const prefs = getPartnerPrefs(partner.notification_prefs);
            const dashUrl = `${SITE_URL}/partner/dashboard`;
            const count = missedNames.length;
            const names = missedNames.slice(0, 5).join(", ") + (count > 5 ? ` +${count - 5} more` : "");

            if (shouldSendEmail(prefs.missed_check_in)) {
              sendEmail({
                to: partner.email,
                subject: `${count} client${count > 1 ? "s" : ""} missed check-in yesterday`,
                html: `<p style="color:#D4D4D8;font-size:15px;">${count} client${count > 1 ? "s" : ""} missed their scheduled check-in yesterday: <strong>${escapeHtml(names)}</strong></p>
                       <a href="${dashUrl}" style="display:inline-block;padding:12px 24px;background:#F59E0B;color:#000;font-weight:bold;border-radius:8px;text-decoration:none;margin-top:16px;">View Details</a>`,
              }).catch((e) => console.error("[Missed Check-In] Email failed:", e));
            }

            if (shouldSendSMS(prefs.missed_check_in) && partner.phone) {
              sendSMS(
                partner.phone,
                capSMS(`${count} client(s) missed check-in yesterday: ${names}. Details: ${dashUrl}, Do not reply`),
                { category: "missed_check_in_alert", partner_id: partner.id, subject: "Missed Check-In Alert" }
              ).catch((e) => console.warn("[Missed Check-In] SMS failed:", e));
            }

            phase2Alerts++;
          }

          console.log(`[Check-In] Phase 2 complete: ${phase2Alerts} partner alerts`);
        }

        await releaseCronLock(lock2.executionId!, "completed");
      } catch (err) {
        console.error("[Check-In] Phase 2 failed:", err);
        try { await releaseCronLock(lock2.executionId!, "failed"); } catch {}
      }
    }
  });

  return NextResponse.json({
    accepted: true,
    phase1: lock1.shouldRun,
    phase2: lock2.shouldRun,
  });
}
