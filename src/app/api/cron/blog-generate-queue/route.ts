/**
 * @file /api/cron/blog-generate-queue, Daily blog content queue selection
 *
 * Selects the highest-priority content gaps (status='identified', gap_score>=7,
 * quadrant IN GOLD_MINE/RISKY_BET) and transitions them to `queued` status so
 * the downstream generation pipeline can pick them up.
 *
 * Skips any gap that already has a blog_drafts row (idempotent re-runs).
 * Runs daily at 6:00 AM ET via cron-job.org.
 *
 * Protected by CRON_SECRET bearer token.
 * Idempotency lock: "blog-generate-queue", 23h window.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // ── Auth ──
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  // ── Idempotency guard (prevent duplicate runs within 23h window) ──
  const lock = await acquireCronLock("blog-generate-queue", 23 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();

  try {
    // ── Select hub gaps first (charge-type articles take priority) ──
    const { data: hubGaps, error: hubError } = await supabase
      .from("content_gaps")
      .select("id, charge_type_slug, pain_point_slug, gap_score, demand_quadrant, suggested_title, suggested_keywords, article_type")
      .eq("status", "identified")
      .eq("article_type", "hub")
      .gte("gap_score", 7)
      .in("demand_quadrant", ["GOLD_MINE", "RISKY_BET"])
      .order("gap_score", { ascending: false })
      .limit(1);

    if (hubError) {
      throw new Error(`Failed to query hub gaps: ${hubError.message}`);
    }

    // ── Fill remaining slots with spoke gaps ──
    // Throttle: 2 spoke slots when a hub was queued, 3 when no hubs remain
    const spokeLimit = (hubGaps?.length ?? 0) > 0 ? 2 : 3;
    const { data: spokeGaps, error: spokeError } = await supabase
      .from("content_gaps")
      .select("id, charge_type_slug, pain_point_slug, gap_score, demand_quadrant, suggested_title, suggested_keywords, article_type")
      .eq("status", "identified")
      .eq("article_type", "spoke")
      .gte("gap_score", 7)
      .in("demand_quadrant", ["GOLD_MINE", "RISKY_BET"])
      .order("gap_score", { ascending: false })
      .limit(spokeLimit);

    if (spokeError) {
      throw new Error(`Failed to query spoke gaps: ${spokeError.message}`);
    }

    const gaps = [...(hubGaps || []), ...(spokeGaps || [])];

    if (!gaps || gaps.length === 0) {
      await releaseCronLock(lock.executionId, "completed");
      return NextResponse.json({ queued: 0, skipped: 0, gaps: [] });
    }

    let queued = 0;
    let skipped = 0;
    const queuedGaps: { id: string; charge_type_slug: string; gap_score: number }[] = [];

    for (const gap of gaps) {
      // ── Check if a blog draft already exists for this gap ──
      const { data: existingDraft, error: draftCheckError } = await supabase
        .from("blog_drafts")
        .select("id")
        .eq("content_gap_id", gap.id)
        .limit(1)
        .maybeSingle();

      if (draftCheckError) {
        console.warn(`[Cron/blog-generate-queue] Draft check failed for gap ${gap.id}:`, draftCheckError.message);
        skipped++;
        continue;
      }

      if (existingDraft) {
        // Draft already exists, skip to avoid duplicate work
        skipped++;
        continue;
      }

      // ── Transition gap to queued ──
      const { error: updateError } = await supabase
        .from("content_gaps")
        .update({ status: "queued", decided_at: new Date().toISOString() })
        .eq("id", gap.id);

      if (updateError) {
        console.warn(`[Cron/blog-generate-queue] Failed to queue gap ${gap.id}:`, updateError.message);
        skipped++;
        continue;
      }

      queued++;
      queuedGaps.push({
        id: gap.id,
        charge_type_slug: gap.charge_type_slug,
        gap_score: gap.gap_score,
      });
    }

    const result = { queued, skipped, gaps: queuedGaps };

    await releaseCronLock(lock.executionId, "completed");
    return NextResponse.json(result);
  } catch (err) {
    console.error("[Cron/blog-generate-queue] Fatal error:", err);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
