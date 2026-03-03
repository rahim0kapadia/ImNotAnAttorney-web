/**
 * @fileoverview Shared site-wide constants and utility functions.
 *
 * **Single source of truth** for URLs, contact information, physical address,
 * email validation helpers, and operator token signing.
 *
 * WHY THIS FILE EXISTS:
 * Before this file was created, values like "https://imnotanattorney.com",
 * "help@imnotanattorney.com", and the CAN-SPAM physical address were
 * hardcoded in 30+ locations across email templates, page footers, legal
 * pages, API routes, and meta tags. Any change required a find-and-replace
 * across the entire codebase, with high risk of missing an occurrence.
 *
 * This file centralizes all of it so a single edit propagates everywhere.
 *
 * NOTE: The edge function (supabase/functions/generate-report/index.ts)
 * duplicates PHYSICAL_ADDRESS because it runs in Deno and cannot import
 * from Next.js modules. If the address changes, update both locations.
 *
 * Imported by: email templates, page layouts, API routes, checkout flow,
 * intake forms, blog pages, legal pages, and more.
 */

import { createHmac } from "crypto";

// ============================================================
// SITE CONSTANTS
// ============================================================

/**
 * Base URL for the site. Uses the NEXT_PUBLIC_SITE_URL env var when
 * deployed (supports preview deploys with unique URLs), falls back to
 * the production domain.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://imnotanattorney.com";

/**
 * Primary contact email for customer-facing communications.
 * Displayed on the site footer, contact pages, and email templates.
 */
export const CONTACT_EMAIL = "help@imnotanattorney.com";

/**
 * CAN-SPAM required physical mailing address (15 U.S.C. 7704).
 * Shown in all email footers and on legal pages (Terms, Privacy).
 *
 * Also duplicated in:
 *   - src/lib/email.ts (email template footer)
 *   - supabase/functions/generate-report/index.ts (Deno edge function)
 */
export const PHYSICAL_ADDRESS =
  "195 Dr MLK Jr St N, St Petersburg, FL 33701";

/**
 * Fallback operator email used when OPERATOR_EMAIL env var is not set.
 * Operator emails include: intake notifications, webhook failure alerts,
 * report review notifications, and delivery confirmations.
 */
export const OPERATOR_EMAIL_FALLBACK = "rahim0kapadia@gmail.com";

// ============================================================
// EMAIL HELPERS
// ============================================================

/**
 * Normalizes an email address for consistent database lookups.
 *
 * Lowercases the entire string and trims leading/trailing whitespace.
 * This prevents duplicate subscriber/customer records caused by
 * "User@Example.com" vs "user@example.com" and accidental spaces
 * from copy-paste.
 *
 * @param email - Raw email address input (e.g., from a form submission).
 * @returns The normalized lowercase, trimmed email address.
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Validates an email address format using a pragmatic regex.
 *
 * Checks for: non-empty local part, single @, domain with at least one dot.
 * This catches the most common malformed inputs ("", "@", "test@", "@.com",
 * "a b@c.com") without being so strict that it rejects valid edge cases.
 *
 * More robust than `email.includes("@")` which accepts "@@@", "test@", etc.
 * Less strict than RFC 5322 (which allows quoted strings, IP literals, etc.
 * that no real user would type into a form).
 *
 * @param email - The email address string to validate.
 * @returns True if the email matches the expected format.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ============================================================
// OPERATOR TOKEN SIGNING
// ============================================================
// Instead of embedding the raw OPERATOR_SECRET in email links (where it's
// visible in browser history, email logs, and anyone with inbox access),
// we generate short-lived HMAC-signed tokens scoped to a specific case.
//
// Token format: {timestamp}.{hmac}
//   - timestamp: Unix seconds when the token was created
//   - hmac: HMAC-SHA256 of "caseId:timestamp" using OPERATOR_SECRET as key
//
// Verification checks:
//   1. The HMAC is valid (proves the token was created by someone with the secret)
//   2. The token is not expired (24-hour window by default)
//   3. The caseId in the URL matches the caseId baked into the HMAC

/** Default token validity: 24 hours (in seconds). */
const OPERATOR_TOKEN_TTL_SECONDS = 24 * 60 * 60;

/** Phase 2 intake token validity: 30 days (in seconds). */
const PHASE2_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Generate a signed operator token for a specific case.
 * The token is scoped to the caseId and expires after 24 hours.
 *
 * @param caseId - The case this token authorizes action on
 * @returns A signed token string in format "timestamp.hmac"
 */
export function signOperatorToken(caseId: string): string {
  const secret = process.env.OPERATOR_SECRET;
  if (!secret) throw new Error("OPERATOR_SECRET not configured");

  const timestamp = Math.floor(Date.now() / 1000);
  const payload = `${caseId}:${timestamp}`;
  const hmac = createHmac("sha256", secret).update(payload).digest("hex");
  return `${timestamp}.${hmac}`;
}

/**
 * Verify a signed operator token for a specific case.
 *
 * @param token - The token string from the URL (format: "timestamp.hmac")
 * @param caseId - The case ID from the URL to verify against
 * @param ttlSeconds - Token validity window (default 24 hours)
 * @returns true if the token is valid and not expired
 */
export function verifyOperatorToken(
  token: string,
  caseId: string,
  ttlSeconds: number = OPERATOR_TOKEN_TTL_SECONDS
): boolean {
  const secret = process.env.OPERATOR_SECRET;
  if (!secret) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [timestampStr, providedHmac] = parts;
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (now - timestamp > ttlSeconds) return false;

  // Recompute HMAC and compare
  const payload = `${caseId}:${timestamp}`;
  const expectedHmac = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  if (providedHmac.length !== expectedHmac.length) return false;
  let mismatch = 0;
  for (let i = 0; i < providedHmac.length; i++) {
    mismatch |= providedHmac.charCodeAt(i) ^ expectedHmac.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Generate a signed Phase 2 intake token for a specific case.
 * Same HMAC algorithm as operator tokens but with 30-day TTL.
 * Used for Phase 2 intake email links where customers may not
 * fill the form immediately after receiving the email.
 *
 * @param caseId - The case this token authorizes intake for
 * @returns A signed token string in format "timestamp.hmac"
 */
export function signPhase2Token(caseId: string): string {
  const secret = process.env.OPERATOR_SECRET;
  if (!secret) throw new Error("OPERATOR_SECRET not configured");

  const timestamp = Math.floor(Date.now() / 1000);
  const payload = `${caseId}:${timestamp}`;
  const hmac = createHmac("sha256", secret).update(payload).digest("hex");
  return `${timestamp}.${hmac}`;
}

/**
 * Verify a signed Phase 2 intake token for a specific case.
 * 30-day TTL (vs 24h for operator tokens).
 *
 * @param token - The token string from the URL (format: "timestamp.hmac")
 * @param caseId - The case ID from the URL to verify against
 * @returns true if the token is valid and not expired
 */
export function verifyPhase2Token(token: string, caseId: string): boolean {
  return verifyOperatorToken(token, caseId, PHASE2_TOKEN_TTL_SECONDS);
}

/**
 * Generates a deterministic RFC 2822 Message-ID for email threading.
 * All emails about the same case will thread in the customer's inbox.
 */
export function caseThreadId(caseId: string): string {
  return `<case-${caseId}@imnotanattorney.com>`;
}
