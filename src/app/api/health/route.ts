/**
 * Health Check Endpoint — GET /api/health
 *
 * Checks Supabase connectivity and presence of required env vars.
 * Returns 200 if healthy, 503 if degraded.
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
  "CRON_SECRET",
];

export async function GET() {
  const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);

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
      missingEnv: missingEnv.length > 0 ? missingEnv : undefined,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
