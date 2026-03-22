/**
 * GET /api/admin/demand/performance — content performance metrics
 * Query params: window (7d|30d|all-time)
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const supabase = createAdminClient();
  const window = req.nextUrl.searchParams.get("window") || "all-time";

  const { data, error } = await supabase
    .from("content_performance")
    .select("*")
    .eq("window_label", window)
    .order("revenue_attributed", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ performance: data });
}
