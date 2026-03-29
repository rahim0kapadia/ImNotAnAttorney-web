/**
 * Health Check Endpoint — GET /api/health
 *
 * Checks Supabase connectivity and presence of required env vars.
 * Returns 200 if healthy, 503 if degraded.
 *
 * Security: The names of missing env vars are NOT exposed in the response
 * to prevent information disclosure (attackers learning which services are
 * configured). Only the count is returned. Full details are logged server-side.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const REQUIRED_ENV = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPERATOR_SECRET",
  "OPERATOR_EMAIL",
  "CRON_AUTH_TOKEN",
];

export async function GET() {
  const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);

  if (missingEnv.length > 0) {
    console.warn("[Health] Missing env vars:", missingEnv.join(", "));
  }

  let dbOk = false;
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("subscribers").select("id").limit(1);
    dbOk = !error;
  } catch {
    dbOk = false;
  }

  const healthy = dbOk && missingEnv.length === 0;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      db: dbOk ? "connected" : "unreachable",
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
