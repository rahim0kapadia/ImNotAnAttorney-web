/**
 * @file /api/cron/demand-feedback-revise — Weekly underperformer flagging + adaptive QA
 *
 * Schedule: Sundays 9:00 AM ET via cron-job.org (after demand-feedback-patterns at 8:00 AM).
 * Self-gates: only activates when sufficient attribution data exists.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { computeFeedbackRevisions } from "@/lib/demand/feedback-revise";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const lock = await acquireCronLock("demand-feedback-revise", 7 * 24 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();

  try {
    const result = await computeFeedbackRevisions(supabase);
    await releaseCronLock(lock.executionId, "completed");
    return NextResponse.json(result);
  } catch (err) {
    console.error("[demand-feedback-revise] Error:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
