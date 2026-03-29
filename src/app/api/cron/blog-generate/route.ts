/**
 * @file /api/cron/blog-generate — Daily blog post generation pipeline
 *
 * Picks the highest-scoring queued content gap, runs the full generation
 * pipeline (topic enrichment → Anthropic claude-opus-4-6 → MDX parse →
 * validation → DB insert), and returns the generated draft slug + title.
 *
 * One post per invocation. maxDuration = 300s (Vercel Pro limit) to
 * accommodate the Opus API call which can take 60-120s for 8K token output.
 *
 * Protected by CRON_SECRET bearer token.
 * Idempotency lock: "blog-generate", 23h window.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { generatePost } from "@/lib/blog-generation/generate-post";
import type { ContentGapForGeneration } from "@/lib/types/blog-pipeline";

export const maxDuration = 300; // 5 minutes for Opus generation
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
    // ── Pick ONE queued gap (highest gap_score first) ──
    const { data: gaps, error: gapError } = await supabase
      .from("content_gaps")
      .select(
        "id, charge_type_slug, pain_point_slug, demand_quadrant, demand_score, gap_score, suggested_title, suggested_keywords"
      )
      .eq("status", "queued")
      .order("gap_score", { ascending: false })
      .limit(1);

    if (gapError) {
      throw new Error(`content_gaps query failed: ${gapError.message}`);
    }

    if (!gaps || gaps.length === 0) {
      await releaseCronLock(lock.executionId, "completed");
      return NextResponse.json({ generated: false, reason: "no queued gaps" });
    }

    const gap = gaps[0] as ContentGapForGeneration;

    // ── Mark in-progress to prevent double-pick ──
    const { error: updateError } = await supabase
      .from("content_gaps")
      .update({ status: "in-progress" })
      .eq("id", gap.id);

    if (updateError) {
      throw new Error(
        `Failed to mark gap ${gap.id} in-progress: ${updateError.message}`
      );
    }

    // ── Run generation pipeline ──
    const draft = await generatePost(gap, supabase);

    await releaseCronLock(lock.executionId, "completed");

    return NextResponse.json({
      generated: true,
      slug: draft.slug,
      title: draft.title,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[Cron/blog-generate] Fatal error:", errMsg);
    await releaseCronLock(lock.executionId, "failed");
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
