/**
 * POST /api/court-reminders, Creates a court reminder sign-up.
 *
 * Validates input, generates a unique token, stores in Supabase,
 * sends confirmation email, returns the prep page token.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";
import { SITE_URL, normalizePhone, isValidPhone } from "@/lib/site";
import { randomUUID } from "crypto";
import type { CourtReminder } from "@/lib/court-reminders";
import { validateCheckInDays, sortCheckInDays } from "@/lib/check-in-schedule";
import { getPartnerPrefs, shouldSendEmail, shouldSendSMS, type PartnerNotificationPrefs } from "@/lib/notification-prefs";
import { sendSMS, capSMS } from "@/lib/sms";

interface CreateBody {
  first_name: string;
  email: string;
  phone?: string;
  /**
   * Charge-type slug (see CHARGE_DISPLAY_NAMES).
   *
   * Defaults to "other" when omitted or blank — compact-mode signup flows
   * (e.g. /checkin/[code]) post without a charge picker, since the bondsman
   * partner has already pre-qualified the client. "other" is a documented
   * bucket in the taxonomy, not a mystery value; downstream analytics that
   * segment by charge_type will see it as generic and should not treat it
   * as a "missing" or "bug" signal.
   */
  charge_type?: string;
  /**
   * "County, ST" string.
   *
   * Defaults to "Unknown County" when omitted or blank. Compact-mode flows
   * skip the county prompt to keep the form at 3 fields. Downstream consumers
   * (email templates, prep page, prep-data jurisdiction queries) must fall
   * back gracefully when they see this literal — they will NOT treat it as a
   * real jurisdiction.
   */
  county_state?: string;
  court_date: string;
  recommended_tier?: string;
  partner_promo_code?: string;
  check_in_days?: string[] | null;
  check_in_idk?: boolean;
  consent?: boolean;
}

export async function POST(req: NextRequest) {
  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Consent is only meaningful when coupled with a phone number (SMS opt-in).
  // The phone-coupled gate below enforces `consent === true` whenever a phone
  // is provided; callers that omit phone can pass any consent value (including
  // false/undefined/string) without being rejected at the top level.

  // Defaults for compact-mode payloads that omit charge_type / county_state.
  const charge_type = body.charge_type?.trim() ? body.charge_type.trim() : "other";
  const county_state = body.county_state?.trim() ? body.county_state.trim() : "Unknown County";

  // ── Validate required fields ──
  const { first_name, email, court_date } = body;
  if (!first_name?.trim() || !email?.trim() || !court_date?.trim()) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  // ── Phone validation + consent coupling ──
  // When a phone is provided we (a) validate it via normalizePhone/isValidPhone
  // and (b) require consent === true. The client's `requireConsent` prop is
  // advisory UX; the server enforces this rule regardless so partner-mode
  // flows cannot silently bypass SMS consent.
  const rawPhone = body.phone?.trim() ?? "";
  let normalizedPhone: string | null = null;
  if (rawPhone.length > 0) {
    const normalized = normalizePhone(rawPhone);
    if (!isValidPhone(normalized)) {
      return NextResponse.json(
        { error: "Enter a valid 10-digit US phone number" },
        { status: 400 }
      );
    }
    if (body.consent !== true) {
      return NextResponse.json(
        { error: "Consent required for SMS notifications" },
        { status: 400 }
      );
    }
    normalizedPhone = normalized;
  }

  // Court date must be in the future
  const courtDateObj = new Date(court_date + "T00:00:00");
  if (isNaN(courtDateObj.getTime()) || courtDateObj < new Date()) {
    return NextResponse.json({ error: "Court date must be in the future" }, { status: 400 });
  }

  const token = randomUUID();
  const supabase = createAdminClient();

  // -- Check-in schedule resolution --
  let checkInDays: string[] | null = null;
  let checkInSource: string | null = null;
  let resolvedPartner: {
    id: string; email: string; phone: string | null;
    notification_prefs: Partial<PartnerNotificationPrefs> | null;
    sms_consent_at: string | null; name: string;
    company: string | null; default_check_in_days: string[] | null;
  } | null = null;

  if (body.partner_promo_code) {
    if (body.check_in_days && !body.check_in_idk) {
      if (!validateCheckInDays(body.check_in_days)) {
        return NextResponse.json({ error: "Invalid check-in days" }, { status: 400 });
      }
      checkInDays = sortCheckInDays(body.check_in_days);
      checkInSource = "client";
    } else if (body.check_in_idk) {
      const { data: partner } = await supabase
        .from("partners")
        .select("id, email, phone, notification_prefs, sms_consent_at, name, company, default_check_in_days")
        .eq("promo_code", body.partner_promo_code)
        .maybeSingle();

      if (partner?.default_check_in_days && partner.default_check_in_days.length > 0) {
        checkInDays = partner.default_check_in_days;
        checkInSource = "default";
      }
      resolvedPartner = partner;
    }
  }

  // Persist phone + sms_consent_at. Columns were added in migration
  // 20260414a_sms_notification_prefs.sql — any earlier "columns don't exist"
  // comment here was stale. sms_consent_at is the audit timestamp proving the
  // user affirmatively consented at signup time (required for A2P compliance).
  const { error: insertErr } = await supabase.from("court_reminders").insert({
    token,
    first_name: first_name.trim(),
    email: email.trim().toLowerCase(),
    phone: normalizedPhone,
    // Invariant: phone-coupled gate above already guarantees consent===true
    // whenever normalizedPhone is non-null, so phone presence implies consent.
    sms_consent_at: normalizedPhone ? new Date().toISOString() : null,
    charge_type,
    county_state,
    court_date,
    recommended_tier: body.recommended_tier || null,
    partner_promo_code: body.partner_promo_code || null,
    check_in_days: checkInDays,
    check_in_source: checkInSource,
  });

  if (insertErr) {
    console.error("[Court Reminders] Insert error:", insertErr);
    return NextResponse.json({ error: "Failed to create reminder" }, { status: 500 });
  }

  // -- Bondsman fallback notification (no schedule set) --
  if (body.partner_promo_code && !checkInDays && body.check_in_idk) {
    const partner = resolvedPartner;

    if (partner) {
      const prefs = getPartnerPrefs(partner.notification_prefs);
      const dashUrl = `${SITE_URL}/partner/dashboard`;
      const msg = `${first_name.trim()} signed up for court reminders but doesn't know their check-in schedule. Set it here: ${dashUrl}`;

      if (shouldSendEmail(prefs.missed_check_in)) {
        sendEmail({
          to: partner.email,
          subject: `Check-in schedule needed for ${first_name.trim()}`,
          html: `<p style="color:#D4D4D8;font-size:15px;">${escapeHtml(msg)}</p>
                 <a href="${dashUrl}" style="display:inline-block;padding:12px 24px;background:#F59E0B;color:#000;font-weight:bold;border-radius:8px;text-decoration:none;margin-top:16px;">Set Schedule</a>`,
        }).catch((e) => console.error("[Court Reminders] Partner email failed:", e));
      }

      if (shouldSendSMS(prefs.missed_check_in) && partner.phone) {
        sendSMS(
          partner.phone,
          capSMS(`${first_name.trim()} needs a check-in schedule. Set it: ${dashUrl}, Do not reply`),
          { category: "schedule_needed", partner_id: partner.id, subject: "Check-In Schedule Needed" }
        ).catch((e) => console.warn("[Court Reminders] Partner SMS failed:", e));
      }
    }
  }

  // ── Send confirmation email ──
  const prepUrl = `${SITE_URL}/prep/${token}`;
  const safeName = escapeHtml(first_name.trim());
  try {
    await sendEmail({
      to: email.trim().toLowerCase(),
      subject: "Your court prep page is ready",
      html: `
        <h1 style="color: #F59E0B; font-size: 24px; margin: 0 0 16px;">Your court prep is set up, ${safeName}.</h1>
        <p style="color: #D4D4D8; font-size: 15px; line-height: 1.6;">We'll send you reminders before your court date so you don't miss anything.</p>
        <p style="color: #D4D4D8; font-size: 15px; line-height: 1.6;">Your personalized prep page, what to expect, what to bring, and how to prepare:</p>
        <p style="margin: 24px 0;"><a href="${prepUrl}" style="display: inline-block; background: #F59E0B; color: #0C0A09; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700;">View Your Court Prep</a></p>
        <p style="color: #71717A; font-size: 13px;">Bookmark this link, it's yours. We'll also include it in every reminder email.</p>
      `,
    });
  } catch (e) {
    console.warn("[Court Reminders] Confirmation email failed:", e);
    // Non-fatal, reminder was still created
  }

  return NextResponse.json({ token, prepUrl });
}
