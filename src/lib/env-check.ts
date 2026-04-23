/**
 * Env-var presence checker — warns loudly when optional-with-fallback
 * env vars are missing in production.
 *
 * Problem: Several env vars (OPERATOR_EMAIL, RESEND_FROM_EMAIL, etc.) ship
 * with hardcoded fallback values. Missing the env var silently means emails
 * go from a personal Gmail or an anonymous no-reply — bad enough to
 * investigate, not bad enough to crash the app.
 *
 * This module exports `envWithWarn(key, fallback)`. In production, if the
 * env var is unset, it logs a distinctive warning that shows up in Vercel
 * logs + monitoring. In dev, it silently returns the fallback (local work
 * doesn't need the warning noise).
 *
 * Usage:
 *   const FROM_EMAIL = envWithWarn("RESEND_FROM_EMAIL", "noreply@imnotanattorney.com");
 *
 * See ARCHITECTURE.md § "Partner System Operational Inventories" — this closes
 * the "consider promoting Optional → Required" follow-up without hard-crashing
 * the boot path.
 */

const warned = new Set<string>();

export function envWithWarn(key: string, fallback: string): string {
  const value = process.env[key];
  if (value && value.trim().length > 0) {
    return value;
  }

  // Only warn once per key per process — Vercel warm lambdas re-import
  // modules; we don't want one log line per request.
  if (process.env.NODE_ENV === "production" && !warned.has(key)) {
    warned.add(key);
    console.warn(
      `[ENV-MISSING] ${key} not set in production — falling back to hard-coded default "${fallback}". Set the env var on Vercel (project: imnotanattorney).`,
    );
  }

  return fallback;
}

/**
 * Test-only helper: reset the one-time-warn cache so a fresh warn fires.
 * NOT called from application code.
 */
export function __resetEnvWarnCache(): void {
  warned.clear();
}
