/**
 * @file /api/cron/demand-performance, Weekly content performance tracker
 *
 * Schedule: Runs weekly on Sundays at 6:00 AM ET via cron-job.org.
 * Protected by CRON_SECRET bearer token.
 *
 * Correlates published blog posts → subscriber signups → orders + revenue.
 * Upserts results to content_performance table keyed on
 * (blog_slug, window_label, window_start).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { trackContentPerformance } from "@/lib/demand/track-performance";

export async function GET(req: NextRequest) {
  // ── Auth ──
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  // ── Idempotency guard (prevent duplicate runs within 7-day window) ──
  const lock = await acquireCronLock("demand-performance", 7 * 24 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();

  try {
    const result = await trackContentPerformance(supabase);

    await releaseCronLock(lock.executionId, "completed");
    return NextResponse.json(result);
  } catch (err) {
    console.error("[demand-performance] Unexpected error:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
