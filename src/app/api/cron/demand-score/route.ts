/**
 * @file /api/cron/demand-score — Daily demand scoring pipeline
 *
 * Computes demand scores, quadrant classifications (GOLD_MINE / RED_OCEAN /
 * RISKY_BET / DEAD_ZONE), content gaps, and emerging topics from
 * reddit_signals data. Writes results to:
 *   - demand_scores    (upsert by dimension+window)
 *   - content_gaps     (upsert by charge_type_slug+pain_point_slug)
 *   - emerging_topics  (insert/update by topic_phrases)
 *
 * Protected by CRON_SECRET bearer token.
 * Idempotency lock: "demand-score", 23h window.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { scoreDemand } from "@/lib/demand/score-demand";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // ── Auth ──
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  // ── Idempotency guard (prevent duplicate runs within 23h window) ──
  const lock = await acquireCronLock("demand-score", 23 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  // Return 200 immediately so cron-job.org (30s free-plan cap) doesn't
  // report a false timeout. The actual work runs post-response via after().
  after(async () => {
    const supabase = createAdminClient();
    try {
      await scoreDemand(supabase);
      await releaseCronLock(lock.executionId, "completed");
    } catch (err) {
      console.error("[Cron/demand-score] Fatal error:", err);
      await releaseCronLock(lock.executionId, "failed");
    }
  });

  return NextResponse.json({ status: "started", executionId: lock.executionId });
}
