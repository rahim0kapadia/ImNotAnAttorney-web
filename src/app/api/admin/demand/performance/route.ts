/**
 * GET /api/admin/demand/performance — content performance metrics
 * Query params: window (7d|30d|all-time)
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function isAuthorized(req: NextRequest): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  return req.headers.get("x-admin-password") === password;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
