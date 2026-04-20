/**
 * POST /api/court-reminders, Creates a court reminder sign-up.
 *
 * Validates input, generates a unique token, stores in Supabase,
 * sends confirmation email, returns the prep page token.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";
import { SITE_URL, normalizePhone, isValidPhone } from "@/lib/site";
import { randomUUID } from "crypto";
import type { CourtReminder } from "@/lib/court-reminders";
import { validateCheckInDays, sortCheckInDays } from "@/lib/check-in-schedule";
import { getPartnerPrefs, shouldSendEmail, shouldSendSMS, type PartnerNotificationPrefs } from "@/lib/notification-prefs";
import { sendSMS, capSMS } from "@/lib/sms";
import { welcomeReminder, welcomeSmsBody } from "@/lib/court-reminder-emails";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { validateCourtReminderBody } from "@/lib/court-reminders-input";

// A2P + spam-abuse guards. Endpoint is unauthenticated and fires email + SMS
// per request, so IP + email windows throttle bulk enrollments. Phone opt-in
// additionally requires a pre-qualified partner (promo_code must resolve) —
// this is the "challenge" per plan 2026-04-20-quality-gate-deferred-fixes A1.
const IP_MAX_PER_HOUR = 3;
const IP_WINDOW_SECONDS = 3600;
const EMAIL_MAX_PER_DAY = 1;
const EMAIL_WINDOW_SECONDS = 86400;
const ABUSE_ALERT_THRESHOLD = 20; // rejections/hour that trigger Telegram
const ABUSE_WINDOW_SECONDS = 3600;

async function fireAbuseAlert(ip: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN_LEGAL;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.error("[court-reminders] Telegram not configured; abuse threshold hit", { ip });
    return;
  }
  const text = `[court-reminders] abuse threshold crossed: >${ABUSE_ALERT_THRESHOLD} rejections in the last hour. Most recent IP: ${ip}.`;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (e) {
    console.warn("[court-reminders] Telegram alert failed:", e);
  }
}

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

  // ── Rate limits (spam-abuse guard) ──
  // IP window: max IP_MAX_PER_HOUR enrollments / IP / hour.
  // Email window: max EMAIL_MAX_PER_DAY enrollments per email address / day.
  // Both must pass. On rejection, bump a shared abuse counter; when >20
  // rejections land in an hour we Telegram-alert (dedup 1/hr via rate_limits).
  const ip = getClientIp(req);
  const emailForLimit = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const rateSupabase = createAdminClient();

  const ipCheck = await checkRateLimit(
    rateSupabase,
    `court-reminders:ip:${ip}`,
    IP_MAX_PER_HOUR,
    IP_WINDOW_SECONDS
  );
  let emailLimited = false;
  if (!ipCheck.limited && emailForLimit) {
    const emailCheck = await checkRateLimit(
      rateSupabase,
      `court-reminders:email:${emailForLimit}`,
      EMAIL_MAX_PER_DAY,
      EMAIL_WINDOW_SECONDS
    );
    emailLimited = emailCheck.limited;
  }

  if (ipCheck.limited || emailLimited) {
    const retryAfter = ipCheck.limited ? IP_WINDOW_SECONDS : EMAIL_WINDOW_SECONDS;
    const abuseCheck = await checkRateLimit(
      rateSupabase,
      `court-reminders:abuse:global`,
      ABUSE_ALERT_THRESHOLD,
      ABUSE_WINDOW_SECONDS
    );
    if (abuseCheck.limited) {
      const alertDedup = await checkRateLimit(
        rateSupabase,
        `court-reminders:abuse-alert:global`,
        1,
        ABUSE_WINDOW_SECONDS
      );
      if (!alertDedup.limited) {
        fireAbuseAlert(ip).catch(() => {});
      }
    }
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  // ── Body validation + sanitization (B2/B3) ──
  // Length caps, charge-type allowlist, email format, and future-date check
  // live in the input helper so route.ts stays linear. Compact-mode defaults
  // ("other", "Unknown County") are applied there too.
  const validation = validateCourtReminderBody(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }
  const {
    first_name,
    email,
    court_date,
    charge_type,
    county_state,
    recommended_tier,
    partner_promo_code,
    indemnitor_name,
    indemnitor_email,
  } = validation.cleaned;

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

  const token = randomUUID();
  const supabase = createAdminClient();

  // ── Partner lookup (one fetch, reused everywhere) ──
  // Hoisted so every downstream path can see branding + default schedule:
  //   - Phone opt-in challenge (A1) needs to verify the promo_code resolves.
  //   - check_in_idk branch needs default_check_in_days.
  //   - Welcome email (all enrollment paths) needs `company` for Provided-by
  //     branding — prior code only populated this on the check_in_idk branch,
  //     so non-check-in referral flows lost branding on the first-impression
  //     email. (C6 fix, plan 2026-04-20-quality-gate-deferred-fixes.)
  let resolvedPartner: {
    id: string; email: string; phone: string | null;
    notification_prefs: Partial<PartnerNotificationPrefs> | null;
    sms_consent_at: string | null; name: string;
    company: string | null; default_check_in_days: string[] | null;
  } | null = null;

  if (partner_promo_code) {
    const { data: partner } = await supabase
      .from("partners")
      .select("id, email, phone, notification_prefs, sms_consent_at, name, company, default_check_in_days")
      .eq("promo_code", partner_promo_code)
      .maybeSingle();
    resolvedPartner = partner ?? null;
  }

  // ── Phone opt-in challenge (A1) ──
  // Unauth SMS enrollment is the high-cost abuse path (A2P cost + reputation
  // burn). Gate phone signup on a valid partner_promo_code: the "challenge"
  // is that the caller must already have been pre-qualified through a
  // bondsman partner link. Enforced at the server regardless of client flow.
  if (normalizedPhone) {
    if (!partner_promo_code) {
      return NextResponse.json(
        { error: "SMS enrollment requires a valid partner link" },
        { status: 400 }
      );
    }
    if (!resolvedPartner) {
      return NextResponse.json(
        { error: "Invalid partner link" },
        { status: 400 }
      );
    }
  }

  // -- Check-in schedule resolution --
  let checkInDays: string[] | null = null;
  let checkInSource: string | null = null;

  if (partner_promo_code) {
    if (body.check_in_days && !body.check_in_idk) {
      if (!validateCheckInDays(body.check_in_days)) {
        return NextResponse.json({ error: "Invalid check-in days" }, { status: 400 });
      }
      checkInDays = sortCheckInDays(body.check_in_days);
      checkInSource = "client";
    } else if (body.check_in_idk) {
      if (resolvedPartner?.default_check_in_days && resolvedPartner.default_check_in_days.length > 0) {
        checkInDays = resolvedPartner.default_check_in_days;
        checkInSource = "default";
      }
    }
  }

  // Persist phone + sms_consent_at + consent audit (IP + UA). Columns added in
  // migration 20260414a_sms_notification_prefs.sql (phone/consent) and
  // 20260420f_court_reminders_consent_audit.sql (IP + UA). Taken together these
  // create a TCPA-defensible consent record: WHEN (sms_consent_at), FROM WHERE
  // (consent_ip), and WITH WHAT DEVICE (consent_user_agent). Populated only
  // when phone + consent are present. UA capped at 512 chars (hostile clients
  // can send arbitrarily long headers). IP is whatever getClientIp resolved
  // from x-real-ip / x-forwarded-for earlier in the request. Partner dashboard
  // query explicitly allowlists columns and does NOT return these — no new
  // surface exposure. (C5, plan 2026-04-20-quality-gate-deferred-fixes.)
  const consentUserAgent = normalizedPhone
    ? (req.headers.get("user-agent") || "").slice(0, 512) || null
    : null;
  const { error: insertErr } = await supabase.from("court_reminders").insert({
    token,
    first_name,
    email,
    phone: normalizedPhone,
    // Invariant: phone-coupled gate above already guarantees consent===true
    // whenever normalizedPhone is non-null, so phone presence implies consent.
    sms_consent_at: normalizedPhone ? new Date().toISOString() : null,
    consent_ip: normalizedPhone ? ip : null,
    consent_user_agent: consentUserAgent,
    charge_type,
    county_state,
    court_date,
    recommended_tier,
    partner_promo_code,
    indemnitor_name,
    indemnitor_email,
    check_in_days: checkInDays,
    check_in_source: checkInSource,
  });

  if (insertErr) {
    console.error("[Court Reminders] Insert error:", insertErr);
    return NextResponse.json({ error: "Failed to create reminder" }, { status: 500 });
  }

  // -- Bondsman fallback notification (no schedule set) --
  if (partner_promo_code && !checkInDays && body.check_in_idk) {
    const partner = resolvedPartner;

    if (partner) {
      const prefs = getPartnerPrefs(partner.notification_prefs);
      const dashUrl = `${SITE_URL}/partner/dashboard`;
      const msg = `${first_name} signed up for court reminders but doesn't know their check-in schedule. Set it here: ${dashUrl}`;

      if (shouldSendEmail(prefs.missed_check_in)) {
        sendEmail({
          to: partner.email,
          subject: `Check-in schedule needed for ${first_name}`,
          html: `<p style="color:#D4D4D8;font-size:15px;">${escapeHtml(msg)}</p>
                 <a href="${dashUrl}" style="display:inline-block;padding:12px 24px;background:#F59E0B;color:#000;font-weight:bold;border-radius:8px;text-decoration:none;margin-top:16px;">Set Schedule</a>`,
        }).catch((e) => console.error("[Court Reminders] Partner email failed:", e));
      }

      if (shouldSendSMS(prefs.missed_check_in) && partner.phone) {
        sendSMS(
          partner.phone,
          capSMS(`${first_name} needs a check-in schedule. Set it: ${dashUrl}, Do not reply`),
          { category: "schedule_needed", partner_id: partner.id, subject: "Check-In Schedule Needed" }
        ).catch((e) => console.warn("[Court Reminders] Partner SMS failed:", e));
      }
    }
  }

  // ── Immediate welcome reminder (email + optional SMS) ──
  // Fires synchronously on enrollment so the defendant gets immediate
  // orientation: what the hearing is, what to bring, what to wear, when to
  // arrive, and the upcoming 14/7/3/1-day automated cadence. Non-fatal if
  // either channel fails — the row is created either way and cron still
  // sends the pre-court reminders. Partner branding ("Provided by {company}")
  // renders whenever partner_promo_code resolved to an actual partner row;
  // the hoisted partner lookup above guarantees resolvedPartner is populated
  // on every enrollment path (not just check_in_idk).
  const prepUrl = `${SITE_URL}/prep/${token}`;
  const welcomeCtx = {
    firstName: first_name,
    chargeType: charge_type,
    countyState: county_state,
    courtDate: court_date,
    token,
    partnerCompany: resolvedPartner?.company || undefined,
  };
  try {
    const welcomeEmail = welcomeReminder(welcomeCtx);
    await sendEmail({
      to: email,
      subject: welcomeEmail.subject,
      html: welcomeEmail.html,
    });
  } catch (e) {
    console.warn("[Court Reminders] Welcome email failed:", e);
  }

  // B6: Copy welcome to indemnitor when provided. FAQ Q11 promises indemnitor
  // "gets a copy of every reminder" — welcome is the first-impression touch,
  // so include it alongside the 14/7/3/1d/post-court cadence handled by cron.
  // Salutation is slightly tweaked so the indemnitor sees it's their copy.
  if (indemnitor_email) {
    try {
      const indemnitorEmail = welcomeReminder({
        ...welcomeCtx,
        firstName: `${first_name}'s court prep`,
      });
      await sendEmail({
        to: indemnitor_email,
        subject: indemnitorEmail.subject,
        html: indemnitorEmail.html,
      });
    } catch (e) {
      console.warn("[Court Reminders] Indemnitor welcome email failed:", e);
    }
  }

  // B4: Welcome SMS via after() — Vercel kills fire-and-forget work once the
  // function returns, so a bare .catch() can drop the SMS send mid-flight.
  // after() registers the work on the serverless lifecycle extension so it
  // completes post-response.
  if (normalizedPhone) {
    const smsPhone = normalizedPhone;
    after(async () => {
      try {
        await sendSMS(
          smsPhone,
          capSMS(welcomeSmsBody(welcomeCtx)),
          { category: "court_reminder_welcome", subject: "Court Prep Ready" }
        );
      } catch (e) {
        console.warn("[Court Reminders] Welcome SMS failed:", e);
      }
    });
  }

  return NextResponse.json({ token, prepUrl });
}
