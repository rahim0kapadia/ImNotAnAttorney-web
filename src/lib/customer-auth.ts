/**
 * @fileoverview Customer authentication — magic links + sessions.
 *
 * Mirrors the partner auth system (src/lib/partner-auth.ts) but scoped
 * to customers with at least one paid order. No partner lookup — just
 * email-based verification against the orders table.
 *
 * Magic link flow:
 *   1. Customer enters email → generateCustomerMagicLink() checks for paid orders
 *   2. If paid orders exist, creates a 15-min hashed token in customer_magic_links
 *   3. Token sent via email (Resend)
 *   4. Customer clicks link → verifyCustomerMagicLink() validates via atomic RPC
 *   5. createCustomerSession() creates a 30-day session → cookie set
 *   6. validateCustomerSession() checks cookie on each protected request
 *
 * Security:
 *   - Tokens are single-use (used_at set on consumption via RPC)
 *   - 15-minute expiry on magic link tokens
 *   - 30-day session expiry
 *   - Session tokens stored as SHA-256 hashes (plaintext never in DB)
 *   - Rate limiting handled by caller
 */

import { createAdminClient } from "./supabase/admin";
import { normalizeEmail } from "./site";
import crypto from "crypto";

const MAGIC_LINK_EXPIRY_MINUTES = 15;
const SESSION_EXPIRY_DAYS = 30;

/** Hash a token with SHA-256 for storage. Raw token stays in cookie/URL only. */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generates a magic link token for a customer.
 * Only customers with at least one paid order can use the portal.
 * Returns the token string and normalized email, or null if no paid orders.
 */
export async function generateCustomerMagicLink(email: string): Promise<{
  token: string;
  email: string;
} | null> {
  const supabase = createAdminClient();
  const normalizedEmail = normalizeEmail(email);

  // Check if this email has any paid orders
  const { data: order, error } = await supabase
    .from("orders")
    .select("id")
    .eq("email", normalizedEmail)
    .eq("status", "paid")
    .limit(1)
    .maybeSingle();

  if (error || !order) return null;

  // Generate cryptographically secure token
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000);

  const { error: insertError } = await supabase.from("customer_magic_links").insert({
    email: normalizedEmail,
    token: hashToken(token),
    expires_at: expiresAt.toISOString(),
  });

  if (insertError) {
    console.error("[CustomerAuth] Magic link insert error:", insertError);
    return null;
  }

  return { token, email: normalizedEmail };
}

/**
 * Verifies a magic link token. Returns the email if valid, null otherwise.
 * Marks the token as used (single-use).
 * Uses an atomic RPC call to prevent TOCTOU race conditions.
 */
export async function verifyCustomerMagicLink(token: string): Promise<string | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("consume_customer_magic_link", { p_token: token });

  if (error) {
    console.error("[CustomerAuth] Magic link verify error:", error);
    return null;
  }

  return data || null;
}

/**
 * Creates a new session for a customer. Returns the session token.
 */
export async function createCustomerSession(email: string): Promise<string | null> {
  const supabase = createAdminClient();
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const { error } = await supabase.from("customer_sessions").insert({
    email,
    session_token_hash: hashToken(sessionToken),
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    console.error("[CustomerAuth] Session insert error:", error);
    return null;
  }

  return sessionToken;
}

/**
 * Validates a session token. Returns customer data if valid, null otherwise.
 * Used by route handlers for auth (not middleware — keeps DB calls in Node runtime).
 */
export async function validateCustomerSession(sessionToken: string): Promise<{
  email: string;
} | null> {
  const supabase = createAdminClient();

  // Find non-expired session by token hash
  const { data: session, error: sessionError } = await supabase
    .from("customer_sessions")
    .select("email")
    .eq("session_token_hash", hashToken(sessionToken))
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (sessionError || !session) return null;

  return { email: session.email };
}

/**
 * Destroys a customer session (logout).
 */
export async function destroyCustomerSession(sessionToken: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("customer_sessions")
    .delete()
    .eq("session_token_hash", hashToken(sessionToken));
}

/** Session cookie name used across customer auth. */
export const CUSTOMER_SESSION_COOKIE = "customer-session";

/** Session cookie max-age in seconds (30 days). */
export const CUSTOMER_SESSION_MAX_AGE = SESSION_EXPIRY_DAYS * 24 * 60 * 60;
