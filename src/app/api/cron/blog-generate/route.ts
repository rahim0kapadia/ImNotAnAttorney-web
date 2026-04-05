/**
 * @file /api/cron/blog-generate — Blog pipeline status endpoint
 *
 * Returns counts of content_gaps and blog_drafts by status.
 * Generation has been moved to a local scheduled task (claude -p via Max
 * subscription) — this route is now a lightweight status-only probe.
 *
 * Protected by CRON_SECRET bearer token.
 * Idempotency lock: "blog-generate", 23h window (prevents status spam).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // ── Auth ──
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  // ── Idempotency guard (prevent duplicate runs within 23h window) ──
  const lock = await acquireCronLock("blog-generate", 23 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();

  try {
    // Query gap counts by status
    const { data: statusCounts, error: _error } = await supabase
      .from("content_gaps")
      .select("status");

    // Count by status
    const counts: Record<string, number> = { queued: 0, "in-progress": 0, complete: 0 };
    if (statusCounts) {
      for (const row of statusCounts) {
        if (row.status in counts) counts[row.status]++;
      }
    }

    // Also count blog_drafts by status
    const { data: draftCounts, error: _draftError } = await supabase
      .from("blog_drafts")
      .select("status");

    const drafts: Record<string, number> = { draft: 0, "qa-running": 0, "qa-passed": 0, "qa-failed": 0, published: 0 };
    if (draftCounts) {
      for (const row of draftCounts) {
        if (row.status in drafts) drafts[row.status]++;
      }
    }

    await releaseCronLock(lock.executionId, "completed");

    return NextResponse.json({
      pipeline: "blog-generate",
      note: "Generation moved to local scheduled task (claude -p via Max subscription)",
      content_gaps: counts,
      blog_drafts: drafts,
    });
  } catch (err) {
    console.error("[Cron/blog-generate] Fatal error:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
