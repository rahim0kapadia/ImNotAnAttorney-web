/**
 * PATCH /api/partner/clients/[id]/schedule, Set or clear check-in schedule.
 *
 * Auth: Partner session (requirePartnerAuth).
 * Body: { check_in_days: string[] | null }
 *   - string[]: validates days, sets check_in_source = "partner"
 *   - null: clears schedule (sets both to null)
 *
 * Sends one-time confirmation to client when transitioning from null -> set.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePartnerAuth } from "@/lib/partner-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateCheckInDays, formatDaysDisplay, sortCheckInDays } from "@/lib/check-in-schedule";
import { sendEmail, escapeHtml } from "@/lib/email";
import { sendSMS, capSMS } from "@/lib/sms";
import { getClientPrefs, shouldSendEmail, shouldSendSMS, canSendClientSMS } from "@/lib/notification-prefs";
import { SITE_URL } from "@/lib/site";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { partner, error: authError } = await requirePartnerAuth(req);
  if (authError) return authError;

  if (!partner.promo_code) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Task 7 (bondsman-modes v2): block schedule writes for referral-mode partners.
  // Referral mode = check_in_enabled:false — no check-in ops available on this partner.
  // Audit log every attempt so we can detect UI drift (button should be hidden).
  if (!partner.check_in_enabled) {
    console.warn("[Schedule] Referral-mode partner attempted schedule set", {
      partner_id: partner.id, client_id: id,
    });
    createAdminClient()
      .from("partner_events")
      .insert({
        partner_id: partner.id,
        event_type: "schedule_denied_referral_mode",
        metadata: { client_id: id },
      })
      .then(
        () => {},
        (e: unknown) => console.error("[Schedule] Event insert failed:", e),
      );
    return NextResponse.json(
      { error: "Check-in scheduling is not available in Referral mode" },
      { status: 403 },
    );
  }

  let body: { check_in_days: string[] | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.check_in_days === undefined) {
    return NextResponse.json({ error: "check_in_days is required" }, { status: 400 });
  }
  if (body.check_in_days !== null && !validateCheckInDays(body.check_in_days)) {
    return NextResponse.json({ error: "Invalid check-in days" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify client belongs to this partner
  const { data: reminder } = await supabase
    .from("court_reminders")
    .select("id, first_name, email, phone, notification_prefs, sms_consent_at, token, check_in_days, partner_promo_code")
    .eq("id", id)
    .eq("partner_promo_code", partner.promo_code)
    .maybeSingle();

  if (!reminder) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const wasNull = !reminder.check_in_days || reminder.check_in_days.length === 0;
  const isClearing = body.check_in_days === null;

  const { error: updateErr } = await supabase
    .from("court_reminders")
    .update({
      check_in_days: isClearing ? null : sortCheckInDays(body.check_in_days!),
      check_in_source: isClearing ? null : "partner",
    })
    .eq("id", id);

  if (updateErr) {
    console.error("[Schedule Override] Update failed:", updateErr);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  // One-time confirmation to client when going from null -> configured
  if (wasNull && !isClearing) {
    const daysStr = formatDaysDisplay(body.check_in_days);
    const prepUrl = `${SITE_URL}/prep/${reminder.token}`;
    const prefs = getClientPrefs(reminder.notification_prefs);
    const companyName = partner.company || partner.name;

    if (shouldSendEmail(prefs.check_in)) {
      sendEmail({
        to: reminder.email,
        subject: `Check-in reminders set up by ${companyName}`,
        html: `<p style="color:#D4D4D8;font-size:15px;">${escapeHtml(reminder.first_name)}, ${escapeHtml(companyName)} has set up check-in reminders for you on <strong>${daysStr}</strong>.</p>
               <p style="color:#D4D4D8;font-size:15px;">You'll receive a reminder each scheduled day, tap the link to check in.</p>
               <a href="${prepUrl}" style="display:inline-block;padding:12px 24px;background:#F59E0B;color:#000;font-weight:bold;border-radius:8px;text-decoration:none;margin-top:16px;">View Your Prep Page</a>`,
      }).catch((e) => console.error("[Schedule Override] Client email failed:", e));
    }

    if (shouldSendSMS(prefs.check_in) && canSendClientSMS(reminder.phone, reminder.sms_consent_at)) {
      sendSMS(
        reminder.phone!,
        capSMS(`${reminder.first_name}, ${companyName} set your check-in days: ${daysStr}. Tap here on those days: ${prepUrl}, Do not reply`),
        { category: "schedule_set_confirmation", court_reminder_id: reminder.id, subject: "Check-In Schedule Set" }
      ).catch((e) => console.warn("[Schedule Override] Client SMS failed:", e));
    }
  }

  return NextResponse.json({ success: true, check_in_days: body.check_in_days });
}
