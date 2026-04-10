/**
 * @file /api/cron/demand-feedback-score — Weekly performance feedback scorer
 *
 * Schedule: Sundays 7:00 AM ET via cron-job.org (after demand-performance at 6:00 AM).
 * Computes performance multipliers and auto-promotes emerging topics.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { computeFeedbackScores } from "@/lib/demand/feedback-score";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const lock = await acquireCronLock("demand-feedback-score", 7 * 24 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();

  try {
    const result = await computeFeedbackScores(supabase);
    await releaseCronLock(lock.executionId, "completed");
    return NextResponse.json(result);
  } catch (err) {
    console.error("[demand-feedback-score] Error:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
