/**
 * @file /api/cron/blog-generate — Blog post generation ENQUEUER
 *
 * As of 2026-04-09 (blog engine port), this route enqueues processing_jobs
 * rows for the engine's blog_generate worker. It picks up content_gaps that
 * blog-generate-queue marked as status='queued' and transitions them to
 * 'in-progress' while inserting one processing_jobs row per gap.
 *
 * Actual LLM generation happens in ImNotAnAttorney-engine/src/workers/blog-generate.mjs
 * through the headless gateway ($0/call via Max subscription).
 *
 * Pipeline:
 *   blog-generate-queue (daily 6am ET) → marks gaps 'queued'
 *   blog-generate       (this route)   → enqueues processing_jobs, marks 'in-progress'
 *   engine worker                       → runs generatePost logic, inserts blog_drafts
 *   blog-qa             (cron)          → enqueues qa jobs for new drafts
 *   engine worker                       → runs 5 QA gates
 *   blog-publish        (cron)          → commits qa-passed drafts to GitHub
 *
 * Protected by CRON_SECRET bearer token.
 * Idempotency lock: "blog-generate", 23h window.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";

export const dynamic = "force-dynamic";

const ENQUEUE_LIMIT = 3;

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
    // ── Fetch queued content gaps ──
    const { data: gaps, error: gapsError } = await supabase
      .from("content_gaps")
      .select("id, charge_type_slug, pain_point_slug, gap_score")
      .eq("status", "queued")
      .order("gap_score", { ascending: false })
      .limit(ENQUEUE_LIMIT);

    if (gapsError) {
      console.error("[Cron/blog-generate] Failed to fetch gaps:", gapsError.message);
      await releaseCronLock(lock.executionId, "failed");
      return NextResponse.json({ error: gapsError.message }, { status: 500 });
    }

    if (!gaps || gaps.length === 0) {
      await releaseCronLock(lock.executionId, "completed");
      return NextResponse.json({ status: "no-gaps", enqueued: 0 });
    }

    // ── Enqueue one processing_jobs row per gap ──
    // case_id is null for blog jobs (migration 20260409e made it nullable).
    // target_id carries the content_gap_id; target_type='content_gap' is the discriminator.
    const jobs = gaps.map((g) => ({
      job_type: "blog_generate",
      case_id: null,
      target_id: g.id,
      target_type: "content_gap",
      priority: 5,
      status: "queued",
    }));

    const { error: insertError } = await supabase.from("processing_jobs").insert(jobs);
    if (insertError) {
      console.error("[Cron/blog-generate] Failed to enqueue jobs:", insertError.message);
      await releaseCronLock(lock.executionId, "failed");
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // ── Transition gaps to in-progress so we don't enqueue twice ──
    const { error: updateError } = await supabase
      .from("content_gaps")
      .update({ status: "in-progress" })
      .in("id", gaps.map((g) => g.id));

    if (updateError) {
      console.warn(`[Cron/blog-generate] Failed to mark gaps in-progress: ${updateError.message}`);
      // Non-fatal: the jobs were enqueued successfully. Worst case is duplicate
      // enqueue on the next run — the engine worker checks for existing drafts
      // per gap as an idempotency guard.
    }

    await releaseCronLock(lock.executionId, "completed");
    return NextResponse.json({
      status: "enqueued",
      enqueued: jobs.length,
      gap_ids: gaps.map((g) => g.id),
    });
  } catch (err) {
    console.error("[Cron/blog-generate] Fatal error:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
