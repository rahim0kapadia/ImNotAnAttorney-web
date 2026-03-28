/**
 * @file /api/cron/demand-classify — Daily LLM re-classifier for ambiguous Reddit signals
 *
 * Schedule: Daily at 5:15 AM ET (10:15 UTC) via cron-job.org.
 * Protected by CRON_SECRET bearer token.
 *
 * Re-classifies Reddit signals that keyword matching left ambiguous:
 *   - 0 charge type matches (unclassified)
 *   - 3+ charge type matches (over-classified)
 *   - Urgency score 3-6 (unclear severity)
 *
 * Cost: ~$0.01-0.05/day (Claude Haiku, only ambiguous posts, batches of 20)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { classifyWithLLM } from "@/lib/demand/classify-llm";

export async function GET(req: NextRequest) {
  // ── Auth ──
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  // ── Idempotency guard (prevent duplicate runs within 23h window) ──
  const lock = await acquireCronLock("demand-classify", 23 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  try {
    const supabase = createAdminClient();
    const result = await classifyWithLLM(supabase);

    await releaseCronLock(lock.executionId, "completed");
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/demand-classify] Unexpected error:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
