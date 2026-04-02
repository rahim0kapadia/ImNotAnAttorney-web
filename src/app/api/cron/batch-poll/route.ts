/**
 * @file /api/cron/batch-poll — Batch result polling (every 5 min)
 *
 * Lightweight endpoint that only runs the batch poller task.
 * Registered with cron-job.org at every-5-minutes cadence.
 * Protected by CRON_AUTH_TOKEN bearer token.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { pollBatchResults } from "@/lib/cron/batch-poller";
import type { CronContext } from "@/lib/cron/types";

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  // Idempotency lock — 4min window prevents overlapping 5-min cron runs
  const lock = await acquireCronLock("batch-poll", 4 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

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
    await releaseCronLock(lock.executionId, "completed");
    return NextResponse.json({
      success: true,
      ...result,
      ts: now.toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[batch-poll] Fatal:", msg);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
