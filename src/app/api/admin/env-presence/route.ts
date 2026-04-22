/**
 * GET /api/admin/env-presence — diagnostic reporter for partner-system env vars.
 *
 * Returns { envs: { [KEY]: boolean } } indicating presence (not values).
 * Auth: admin password via x-admin-password header (middleware enforces).
 *
 * Purpose: lets an operator verify every partner-system env var is actually
 * set on Vercel prod without logging into the Vercel dashboard. Closes the
 * Phase 3 Operational Inventory follow-up list for env-var verification.
 *
 * Extending this list: when a new partner-system env var is added to
 * ARCHITECTURE.md § Partner System Operational Inventories → Env vars, add
 * it to PARTNER_SYSTEM_ENVS below in the same PR. The inventory + this route
 * should stay in lockstep.
 */

import { NextResponse } from "next/server";

// Source of truth: every env var read anywhere in the partner system. Keep
// in lockstep with ARCHITECTURE.md § Partner System Operational Inventories.
const PARTNER_SYSTEM_ENVS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "NEXT_PUBLIC_SITE_URL",
  "OPERATOR_EMAIL",
  "ADMIN_PASSWORD",
  "OPERATOR_SECRET",
  "CRON_AUTH_TOKEN",
  "NEXT_PUBLIC_PARTNER_BRANDING_ENABLED",
  "NEXT_PUBLIC_CHECKIN_TOGGLE_ENABLED",
  "SMS_HEALTH_TEST_PHONE",
  "TELEGRAM_BOT_TOKEN_LEGAL",
  "TELEGRAM_CHAT_ID",
  "NODE_ENV",
] as const;

export async function GET() {
  const envs: Record<string, boolean> = {};
  for (const key of PARTNER_SYSTEM_ENVS) {
    const value = process.env[key];
    envs[key] = typeof value === "string" && value.trim().length > 0;
  }

  return NextResponse.json({
    checked_at: new Date().toISOString(),
    envs,
    missing_count: Object.values(envs).filter((v) => !v).length,
    present_count: Object.values(envs).filter((v) => v).length,
  });
}
