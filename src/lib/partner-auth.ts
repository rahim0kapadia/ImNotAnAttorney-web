/**
 * @fileoverview Partner authentication — magic links + sessions.
 *
 * Magic link flow:
 *   1. Partner enters email → generateMagicLink() creates a 15-min token
 *   2. Token sent via email (Resend) + optional SMS (Twilio)
 *   3. Partner clicks link → verifyMagicLink() validates + marks used
 *   4. createPartnerSession() creates a 30-day session → cookie set
 *   5. validatePartnerSession() checks cookie on each protected request
 *
 * Security:
 *   - Tokens are single-use (used_at set on consumption)
 *   - 15-minute expiry on magic link tokens
 *   - 30-day session expiry
 *   - Rate limiting handled by caller (3 per email per hour)
 */

import { createAdminClient } from "./supabase/admin";
import { normalizeEmail } from "./site";
import crypto from "crypto";

const MAGIC_LINK_EXPIRY_MINUTES = 15;
const SESSION_EXPIRY_DAYS = 30;

/**
 * Generates a magic link token for a partner.
 * Returns the token string and partner info, or null if partner not found/not approved.
 */
export async function generateMagicLink(email: string): Promise<{
  token: string;
  partner: { id: string; name: string; phone: string | null };
} | null> {
  const supabase = createAdminClient();

  // Look up approved partner by email
  const { data: partner, error } = await supabase
    .from("partners")
    .select("id, name, phone")
    .eq("email", normalizeEmail(email))
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();

  if (error || !partner) return null;

  // Generate cryptographically secure token
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000);

  const { error: insertError } = await supabase.from("partner_magic_links").insert({
    partner_id: partner.id,
    token,
    expires_at: expiresAt.toISOString(),
  });

  if (insertError) {
    console.error("[PartnerAuth] Magic link insert error:", insertError);
    return null;
  }

  return { token, partner };
}

/**
 * Verifies a magic link token. Returns the partner_id if valid, null otherwise.
 * Marks the token as used (single-use).
 * Uses an atomic RPC call to prevent TOCTOU race conditions.
 */
export async function verifyMagicLink(token: string): Promise<string | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("consume_magic_link", { p_token: token });

  if (error) {
    console.error("[PartnerAuth] Magic link verify error:", error);
    return null;
  }

  return data || null;
}

/**
 * Creates a new session for a partner. Returns the session token.
 */
export async function createPartnerSession(partnerId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const { error } = await supabase.from("partner_sessions").insert({
    partner_id: partnerId,
    session_token: sessionToken,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    console.error("[PartnerAuth] Session insert error:", error);
    return null;
  }

  return sessionToken;
}

/**
 * Validates a session token. Returns partner data if valid, null otherwise.
 * Used by route handlers for auth (not middleware — keeps DB calls in Node runtime).
 */
export async function validatePartnerSession(sessionToken: string): Promise<{
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  promo_code: string | null;
  commission_rate: number;
  status: string;
  preferred_payment_method: string | null;
  payment_zelle: string | null;
  payment_venmo: string | null;
  payment_check_address: string | null;
  total_referrals: number;
  total_commission: number;
  total_paid_out: number;
} | null> {
  const supabase = createAdminClient();

  // Find non-expired session (expiry filtered in query to skip extra round-trip)
  const { data: session, error: sessionError } = await supabase
    .from("partner_sessions")
    .select("partner_id")
    .eq("session_token", sessionToken)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (sessionError || !session) return null;

  // Fetch partner data
  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("id, name, email, phone, company, promo_code, commission_rate, status, preferred_payment_method, payment_zelle, payment_venmo, payment_check_address, total_referrals, total_commission, total_paid_out")
    .eq("id", session.partner_id)
    .eq("status", "approved")
    .single();

  if (partnerError || !partner) return null;

  return partner;
}

/**
 * Destroys a partner session (logout).
 */
export async function destroyPartnerSession(sessionToken: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("partner_sessions")
    .delete()
    .eq("session_token", sessionToken);
}

/** Session cookie name used across partner auth. */
export const PARTNER_SESSION_COOKIE = "partner-session";

/** Session cookie max-age in seconds (30 days). */
export const PARTNER_SESSION_MAX_AGE = SESSION_EXPIRY_DAYS * 24 * 60 * 60;
