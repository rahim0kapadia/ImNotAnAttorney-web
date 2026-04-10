/**
 * @file /api/cron/demand-feedback-patterns — Weekly structural pattern extraction
 *
 * Schedule: Sundays 8:00 AM ET via cron-job.org (after demand-feedback-score at 7:00 AM).
 * Extracts winning patterns from published blog posts.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { extractWinningPatterns } from "@/lib/demand/feedback-patterns";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const lock = await acquireCronLock("demand-feedback-patterns", 7 * 24 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();

  try {
    const result = await extractWinningPatterns(supabase);
    await releaseCronLock(lock.executionId, "completed");
    return NextResponse.json(result);
  } catch (err) {
    console.error("[demand-feedback-patterns] Error:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
