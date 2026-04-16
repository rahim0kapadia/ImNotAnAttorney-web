/**
 * @file /api/cron/demand-classify, Demand classifier ENQUEUER
 *
 * As of 2026-04-09 (blog engine port), this route enqueues a single
 * processing_jobs row for the engine's demand_classify worker. The worker
 * itself discovers ambiguous Reddit signals and classifies them via Haiku
 * through the headless gateway ($0/call via Max subscription).
 *
 * Schedule: Daily at 5:15 AM ET (10:15 UTC) via cron-job.org.
 * Protected by CRON_SECRET bearer token.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";

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

    // ── Dedup guard: skip if a demand_classify job is already queued/running ──
    const { data: existing } = await supabase
      .from("processing_jobs")
      .select("id")
      .eq("job_type", "demand_classify")
      .in("status", ["queued", "processing"])
      .limit(1);

    if (existing && existing.length > 0) {
      await releaseCronLock(lock.executionId, "completed");
      return NextResponse.json({
        status: "already-queued",
        existing_job_id: existing[0].id,
      });
    }

    // ── Enqueue a single demand_classify job ──
    // No target_id, the worker discovers its own ambiguous posts from
    // reddit_signals. case_id is null (nullable since migration 20260409e).
    const { data: inserted, error: insertError } = await supabase
      .from("processing_jobs")
      .insert({
        job_type: "demand_classify",
        case_id: null,
        priority: 5,
        status: "queued",
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      console.error("[cron/demand-classify] Failed to enqueue job:", insertError?.message);
      await releaseCronLock(lock.executionId, "failed");
      return NextResponse.json(
        { error: insertError?.message ?? "enqueue failed" },
        { status: 500 }
      );
    }

    await releaseCronLock(lock.executionId, "completed");
    return NextResponse.json({ status: "enqueued", job_id: inserted.id });
  } catch (err) {
    console.error("[cron/demand-classify] Unexpected error:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
