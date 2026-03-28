/**
 * GET /api/admin/blog-pipeline — all drafts with QA results and linked content gap data
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const supabase = createAdminClient();

  const { data: drafts, error } = await supabase
    .from("blog_drafts")
    .select(
      "*, content_gaps!inner(charge_type_slug, pain_point_slug, gap_score, demand_quadrant)"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const stats = {
    total_drafts: drafts?.length || 0,
    by_status: {
      draft: drafts?.filter((d) => d.status === "draft").length || 0,
      "qa-running": drafts?.filter((d) => d.status === "qa-running").length || 0,
      "qa-passed": drafts?.filter((d) => d.status === "qa-passed").length || 0,
      "qa-failed": drafts?.filter((d) => d.status === "qa-failed").length || 0,
      published: drafts?.filter((d) => d.status === "published").length || 0,
      declined: drafts?.filter((d) => d.status === "declined").length || 0,
    },
  };

  return NextResponse.json({ drafts, stats });
}
