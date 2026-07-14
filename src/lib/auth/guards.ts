/**
 * Typed auth guards for API routes.
 * Replaces scattered inline auth checks with consistent, timing-safe guards.
 *
 * Middleware provides first-line defense (Edge Runtime).
 * These guards provide defense-in-depth (Node Runtime).
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual, createHmac } from "crypto";

// ── Error Classes ──────────────────────────────────────────
export class AuthError {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 401
  ) {}

  toResponse(): NextResponse {
    return NextResponse.json(
      { error: this.message },
      { status: this.statusCode }
    );
  }
}

// ── Guard Results ──────────────────────────────────────────
export type GuardResult =
  | { authorized: true; error: null }
  | { authorized: false; error: NextResponse };

// ── Timing-safe comparison (Node Runtime) ──────────────────
// Uses HMAC-then-compare to eliminate the length oracle.
// Raw Buffer comparison leaks whether the attacker's input has the correct
// LENGTH via response timing (early return on bufA.length !== bufB.length).
// HMAC digests are always 32 bytes regardless of input length, so
// timingSafeEqual never short-circuits on length mismatch.

// Not a secret — fixed-length digest normalization salt for timingSafeEqual.
// Named explicitly so future readers don't mistake it for a cryptographic key.
const TIMING_NORMALIZER_SALT = "inna-guard-compare";

function timingSafeCompare(a: string, b: string): boolean {
  const hmacA = createHmac("sha256", TIMING_NORMALIZER_SALT).update(a).digest();
  const hmacB = createHmac("sha256", TIMING_NORMALIZER_SALT).update(b).digest();
  return timingSafeEqual(hmacA, hmacB);
}

// ── Guards ─────────────────────────────────────────────────

/** Validates X-Admin-Password header. Used by /api/admin/* and /api/operator/* routes. */
export function requireAdmin(req: NextRequest): GuardResult {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return { authorized: false, error: new AuthError("Server misconfigured", 500).toResponse() };
  }
  const fromHeader = req.headers.get("x-admin-password");
  if (!fromHeader || !timingSafeCompare(password, fromHeader)) {
    return { authorized: false, error: new AuthError("Unauthorized").toResponse() };
  }
  return { authorized: true, error: null };
}

/** Validates Bearer token against OPERATOR_SECRET. Used by /api/generate/*, /api/evaluate/*, /api/deliver. */
export function requireOperatorSecret(req: NextRequest): GuardResult {
  const secret = process.env.OPERATOR_SECRET;
  if (!secret) {
    return { authorized: false, error: new AuthError("Server misconfigured", 500).toResponse() };
  }
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || !timingSafeCompare(secret, token)) {
    return { authorized: false, error: new AuthError("Unauthorized").toResponse() };
  }
  return { authorized: true, error: null };
}

/** Validates Bearer token against CRON_SECRET. Used by /api/cron/* routes. */
export function requireCron(req: NextRequest): GuardResult {
  const secret = process.env.CRON_AUTH_TOKEN;
  if (!secret) {
    return { authorized: false, error: new AuthError("Server misconfigured", 500).toResponse() };
  }
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || !timingSafeCompare(secret, token)) {
    return { authorized: false, error: new AuthError("Unauthorized").toResponse() };
  }
  return { authorized: true, error: null };
}
