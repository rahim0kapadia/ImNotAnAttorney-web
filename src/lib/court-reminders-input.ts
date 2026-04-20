/**
 * Input validation + sanitization for POST /api/court-reminders.
 *
 * Separated from the route so the request-handling code stays linear and
 * testable without having to mock the full Supabase stack. Enforces:
 *   - required fields
 *   - email format
 *   - charge-type allowlist (rejects unknown slugs)
 *   - length caps on free-text fields before they reach the DB, email
 *     templates, and SMS body
 *   - court_date is a parseable future date
 *
 * Returns either { ok: true, cleaned } (ready to persist) or
 * { ok: false, status, error } (ready to return as a NextResponse).
 *
 * Plan ref: docs/plans/2026-04-20-quality-gate-deferred-fixes.md Tier B2/B3.
 */

import { isValidChargeType } from "@/lib/charge-types";

const FIRST_NAME_MAX = 80;
const COUNTY_STATE_MAX = 60;
const EMAIL_MAX = 254; // RFC 5321 practical limit
const INDEMNITOR_NAME_MAX = 80;
const INDEMNITOR_EMAIL_MAX = 254;

// RFC-ish format check; rate-limit + partner-gate + Resend final-verify handle
// the abuse and deliverability surfaces. We do not attempt full RFC 5322.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ValidatedBody {
  first_name: string;
  email: string;
  court_date: string;
  charge_type: string;
  county_state: string;
  recommended_tier: string | null;
  partner_promo_code: string | null;
  indemnitor_name: string | null;
  indemnitor_email: string | null;
}

export type ValidationResult =
  | { ok: true; cleaned: ValidatedBody }
  | { ok: false; status: number; error: string };

export function validateCourtReminderBody(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, status: 400, error: "Invalid payload" };
  }
  const body = raw as Record<string, unknown>;

  const first_name = str(body.first_name).trim().slice(0, FIRST_NAME_MAX);
  const emailRaw = str(body.email).trim();
  const email = emailRaw.toLowerCase().slice(0, EMAIL_MAX);
  const court_date = str(body.court_date).trim();

  if (!first_name || !email || !court_date) {
    return { ok: false, status: 400, error: "All fields are required" };
  }
  if (!EMAIL_RE.test(emailRaw)) {
    return { ok: false, status: 400, error: "Invalid email address" };
  }

  // Court date must parse and be in the future.
  const courtDateObj = new Date(court_date + "T00:00:00");
  if (isNaN(courtDateObj.getTime()) || courtDateObj < new Date()) {
    return { ok: false, status: 400, error: "Court date must be in the future" };
  }

  // Charge-type allowlist — prevents prompt injection into downstream LLM
  // personalization, and prevents free-text blobs from polluting analytics.
  // Compact-mode flows that omit charge_type default to "other" (still in
  // the allowlist).
  const chargeRaw = str(body.charge_type).trim();
  const charge_type = chargeRaw ? chargeRaw : "other";
  if (!isValidChargeType(charge_type)) {
    return { ok: false, status: 400, error: "Unknown charge type" };
  }

  // County/state is free text but capped. Compact-mode default is "Unknown
  // County" which downstream renderers handle via displayCounty().
  const countyRaw = str(body.county_state).trim();
  const county_state = (countyRaw ? countyRaw : "Unknown County").slice(0, COUNTY_STATE_MAX);

  const recommended_tier = optStr(body.recommended_tier);
  const partner_promo_code = optStr(body.partner_promo_code);

  // Indemnitor fields (B6) — optional. When an email is present we validate
  // format + cap length so the downstream welcome send doesn't leak a bogus
  // address into Resend.
  const indemnitor_name = cappedOptStr(body.indemnitor_name, INDEMNITOR_NAME_MAX);
  const indemnitor_email_raw = optStr(body.indemnitor_email);
  let indemnitor_email: string | null = null;
  if (indemnitor_email_raw) {
    if (!EMAIL_RE.test(indemnitor_email_raw)) {
      return { ok: false, status: 400, error: "Invalid indemnitor email" };
    }
    indemnitor_email = indemnitor_email_raw.toLowerCase().slice(0, INDEMNITOR_EMAIL_MAX);
  }

  return {
    ok: true,
    cleaned: {
      first_name,
      email,
      court_date,
      charge_type,
      county_state,
      recommended_tier,
      partner_promo_code,
      indemnitor_name,
      indemnitor_email,
    },
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function optStr(v: unknown): string | null {
  const s = str(v).trim();
  return s.length > 0 ? s : null;
}

function cappedOptStr(v: unknown, max: number): string | null {
  const s = optStr(v);
  return s ? s.slice(0, max) : null;
}
