/**
 * @file /api/cron/batch-poll — Batch result polling (every 5 min)
 *
 * Lightweight endpoint that only runs the batch poller task.
 * Registered with cron-job.org at every-5-minutes cadence.
 * Protected by CRON_SECRET bearer token.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { pollBatchResults } from "@/lib/cron/batch-poller";
import type { CronContext } from "@/lib/cron/types";

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const supabase = createAdminClient();
  const now = new Date();

  const ctx: CronContext = {
    supabase,
    operatorEmail: process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com",
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com",
    operatorSecret: process.env.OPERATOR_SECRET || "",
    now,
  };

  try {
    const result = await pollBatchResults(ctx);
    return NextResponse.json({
      success: true,
      ...result,
      ts: now.toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[batch-poll] Fatal:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
