/**
 * POST /api/admin/blog-reingest-failing
 *
 * Enqueues a `blog_reingest` processing_jobs row for every `content/blog/*.mdx`
 * post that doesn't already have a non-declined `blog_drafts` row.
 *
 * The engine's `blog_reingest` worker does the Gate 5 pre-check itself:
 * - Post already passes Gate 5 → worker returns skipped_reason and creates no draft
 * - Post fails Gate 5 → worker inserts draft with status='qa-failed', qa_attempts=0
 *
 * The existing `/api/cron/blog-qa` enqueuer then picks up the qa-failed draft
 * and runs all 6 gates under current rules. Pass → republish via blog-publish
 * cron. Fail 3x → declined → operator triage.
 *
 * Single source of truth for Gate 5 logic stays in the engine
 * (`src/lib/blog-gen/qa-anti-hallucination-verify.mjs`). This route is a dumb
 * enqueuer.
 *
 * Idempotent: worker skips any slug already seeded as a non-declined draft.
 *
 * Auth: X-Admin-Password header (matches other /api/admin/* routes).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONTENT_DIR = path.join(process.cwd(), "content", "blog");

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  if (!fs.existsSync(CONTENT_DIR)) {
    return NextResponse.json({ error: `Content dir not found: ${CONTENT_DIR}` }, { status: 500 });
  }

  const files = fs.readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));
  const slugs = files.map((f) => f.replace(/\.mdx$/, ""));

  const supabase = createAdminClient();

  // Skip slugs that are already in a non-declined state. The worker also
  // enforces this; pre-filtering here saves on processing_jobs rows.
  const { data: existingDrafts, error: draftsErr } = await supabase
    .from("blog_drafts")
    .select("slug, status")
    .in("slug", slugs);
  if (draftsErr) {
    return NextResponse.json({ error: `Failed to query blog_drafts: ${draftsErr.message}` }, { status: 500 });
  }
  const seededSlugs = new Set(
    (existingDrafts ?? [])
      .filter((d) => ["draft", "qa-running", "qa-passed", "qa-failed", "published"].includes(d.status))
      .map((d) => d.slug)
  );

  const toEnqueue = slugs.filter((s) => !seededSlugs.has(s));

  if (toEnqueue.length > 0) {
    const jobs = toEnqueue.map((slug) => ({
      job_type: "blog_reingest",
      case_id: null,
      target_id: null,
      target_type: "blog_slug",
      priority: 5,
      status: "queued",
      metadata: { slug },
    }));
    const { error: insertErr } = await supabase.from("processing_jobs").insert(jobs);
    if (insertErr) {
      return NextResponse.json({ error: `Failed to enqueue jobs: ${insertErr.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({
    scanned: slugs.length,
    enqueued: toEnqueue.length,
    skipped_count: seededSlugs.size,
    enqueued_slugs: toEnqueue,
    skipped_slugs: [...seededSlugs],
  });
}
