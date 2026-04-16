/**
 * @file /api/cron/blog-publish, Publishes up to 3 qa-passed blog drafts per run.
 *
 * For each draft:
 *   1. Resolves slug conflicts
 *   2. Commits the MDX file to GitHub via Contents API
 *   3. Marks blog_drafts.status = 'published'
 *   4. Marks content_gaps.status = 'published', has_blog_post = true
 *   5. Submits the new URL to IndexNow
 *
 * Protected by CRON_SECRET bearer token.
 * Idempotency lock: "blog-publish", 23h window.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { publishDraft } from "@/lib/blog-generation/publish";
import type { BlogDraft } from "@/lib/types/blog-pipeline";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // ── Auth ──
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  // ── Idempotency guard (prevent duplicate runs within 23h window) ──
  const lock = await acquireCronLock("blog-publish", 23 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  // Return 200 immediately so cron-job.org (30s free-plan cap) doesn't
  // report a false timeout. The actual work runs post-response via after().
  after(async () => {
    const supabase = createAdminClient();

    try {
      // ── Fetch up to 3 qa-passed drafts, oldest first ──
      const { data: drafts, error: fetchErr } = await supabase
        .from("blog_drafts")
        .select("*, content_gaps!blog_drafts_content_gap_id_fkey(charge_type_slug)")
        .eq("status", "qa-passed")
        .order("qa_passed_at", { ascending: true })
        .limit(3);

      if (fetchErr) {
        console.error("[Cron/blog-publish] Failed to fetch drafts:", fetchErr.message);
        await releaseCronLock(lock.executionId, "failed");
        return;
      }

      if (!drafts || drafts.length === 0) {
        await releaseCronLock(lock.executionId, "completed");
        return;
      }

      // ── Publish each draft sequentially (GitHub rate-limit friendly) ──
      for (const draft of drafts as (BlogDraft & { content_gaps: { charge_type_slug: string } })[]) {
        await publishDraft(draft, supabase);
      }

      await releaseCronLock(lock.executionId, "completed");
    } catch (err) {
      console.error("[Cron/blog-publish] Fatal error:", err);
      await releaseCronLock(lock.executionId, "failed");
    }
  });

  return NextResponse.json({ status: "started", executionId: lock.executionId });
}
