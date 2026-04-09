/**
 * @file /api/cron/blog-qa — Blog draft QA pipeline ENQUEUER
 *
 * As of 2026-04-09 (blog engine port), this route no longer runs the 5 QA
 * gates inline. It selects eligible drafts and inserts processing_jobs rows
 * that the engine's blog_qa worker picks up and processes. Actual LLM calls
 * happen in ImNotAnAttorney-engine/src/workers/blog-qa.mjs through the
 * headless gateway ($0/call via Max subscription).
 *
 * Eligible drafts (OR clause):
 *   - status='draft' (new, never attempted)
 *   - status='qa-failed' AND qa_attempts<3 (retry window)
 *   - status='qa-running' AND updated_at<10min ago (stuck/stale claim)
 *
 * Protected by CRON_SECRET bearer token.
 * Idempotency lock: "blog-qa", 23h window.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";

export const dynamic = "force-dynamic";

const ENQUEUE_LIMIT = 5;

export async function GET(req: NextRequest) {
  // ── Auth ──
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  // ── Idempotency guard (prevent duplicate runs within 23h window) ──
  const lock = await acquireCronLock("blog-qa", 23 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();

  try {
    // ── Fetch eligible drafts ──
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: drafts, error: fetchError } = await supabase
      .from("blog_drafts")
      .select("id, slug, status, qa_attempts")
      .or(`status.eq.draft,and(status.eq.qa-failed,qa_attempts.lt.3),and(status.eq.qa-running,updated_at.lt.${tenMinutesAgo})`)
      .order("created_at", { ascending: true })
      .limit(ENQUEUE_LIMIT);

    if (fetchError) {
      console.error("[Cron/blog-qa] Failed to fetch drafts:", fetchError.message);
      await releaseCronLock(lock.executionId, "failed");
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!drafts || drafts.length === 0) {
      await releaseCronLock(lock.executionId, "completed");
      return NextResponse.json({ status: "no-drafts", enqueued: 0 });
    }

    // ── Enqueue one processing_jobs row per draft ──
    // case_id is null for blog jobs (migration 20260409e made it nullable).
    // target_id carries the draft_id; target_type='blog_draft' is the discriminator.
    const jobs = drafts.map((d) => ({
      job_type: "blog_qa",
      case_id: null,
      target_id: d.id,
      target_type: "blog_draft",
      priority: 5,
      status: "queued",
    }));

    const { error: insertError } = await supabase.from("processing_jobs").insert(jobs);
    if (insertError) {
      console.error("[Cron/blog-qa] Failed to enqueue jobs:", insertError.message);
      await releaseCronLock(lock.executionId, "failed");
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // ── Mark drafts as qa-running so we don't enqueue twice on the next run ──
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("blog_drafts")
      .update({ status: "qa-running", updated_at: now })
      .in("id", drafts.map((d) => d.id));

    if (updateError) {
      console.warn(`[Cron/blog-qa] Failed to mark drafts qa-running: ${updateError.message}`);
      // Non-fatal: the jobs were enqueued successfully. The stale-claim window
      // (10 min) will eventually recover these.
    }

    await releaseCronLock(lock.executionId, "completed");
    return NextResponse.json({
      status: "enqueued",
      enqueued: jobs.length,
      draft_ids: drafts.map((d) => d.id),
    });
  } catch (err) {
    console.error("[Cron/blog-qa] Fatal error:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
