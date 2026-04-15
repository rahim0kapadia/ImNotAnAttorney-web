/**
 * SMS suspension registry — Layer 2 of the SMS delivery monitoring stack.
 *
 * Populated by the Resend webhook when a {phone}@text.email email bounces.
 * Read by sendSMS() pre-flight to skip sends to known-bad numbers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Normalize to bare 10-digit US number (strip +1, non-digits). Matches toGatewayAddress() in sms.ts. */
export function normalizePhoneForGateway(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("1") && digits.length === 11 ? digits.slice(1) : digits;
}

/** Extract bare 10-digit phone from a {phone}@text.email address. Returns null if not matching. */
export function extractPhoneFromGateway(recipient: string): string | null {
  const match = recipient.trim().toLowerCase().match(/^(\d{10})@text\.email$/);
  return match ? match[1] : null;
}

/**
 * Returns true if this phone is currently suspended (active row, resolved_at IS NULL).
 * Safe to call from hot paths — indexed on phone WHERE resolved_at IS NULL.
 */
export async function isSmsSuspended(
  supabase: SupabaseClient,
  phone: string
): Promise<boolean> {
  const normalized = normalizePhoneForGateway(phone);
  if (!normalized) return false;
  const { data } = await supabase
    .from("sms_suspensions")
    .select("phone")
    .eq("phone", normalized)
    .is("resolved_at", null)
    .maybeSingle();
  return !!data;
}

/**
 * Upsert a suspension row. If the phone is already suspended (active), this is a no-op
 * on suspended_at — we keep the earliest detection timestamp. If a previous suspension
 * was resolved, the upsert overwrites with a fresh suspension.
 */
export async function suspendSmsPhone(
  supabase: SupabaseClient,
  phone: string,
  opts: {
    reason: string;
    bounceType?: string;
    source?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<{ ok: boolean; error?: string; alreadySuspended: boolean }> {
  const normalized = normalizePhoneForGateway(phone);
  if (!normalized) return { ok: false, error: "invalid phone", alreadySuspended: false };

  const { data: existing } = await supabase
    .from("sms_suspensions")
    .select("phone, resolved_at")
    .eq("phone", normalized)
    .maybeSingle();

  if (existing && existing.resolved_at === null) {
    return { ok: true, alreadySuspended: true };
  }

  const row = {
    phone: normalized,
    suspended_at: new Date().toISOString(),
    reason: opts.reason,
    bounce_type: opts.bounceType ?? null,
    source: opts.source ?? "resend_webhook",
    metadata: opts.metadata ?? null,
    resolved_at: null,
    resolved_by: null,
  };

  const { error } = await supabase.from("sms_suspensions").upsert(row, { onConflict: "phone" });
  if (error) return { ok: false, error: error.message, alreadySuspended: false };
  return { ok: true, alreadySuspended: false };
}
