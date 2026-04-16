/**
 * GET /api/admin/demand/scores, demand scores for latest window
 * Query params: window (7d|30d|90d), dimension (charge_type|pain_point)
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const supabase = createAdminClient();
  const window = req.nextUrl.searchParams.get("window") || "7d";
  const dimension = req.nextUrl.searchParams.get("dimension") || "charge_type";

  // Validate params against allowed values
  const ALLOWED_WINDOWS = ["7d", "30d", "90d"];
  const ALLOWED_DIMENSIONS = ["charge_type", "pain_point"];
  if (!ALLOWED_WINDOWS.includes(window)) {
    return NextResponse.json({ error: `Invalid window. Allowed: ${ALLOWED_WINDOWS.join(", ")}` }, { status: 400 });
  }
  if (!ALLOWED_DIMENSIONS.includes(dimension)) {
    return NextResponse.json({ error: `Invalid dimension. Allowed: ${ALLOWED_DIMENSIONS.join(", ")}` }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("demand_scores")
    .select("*")
    .eq("window_label", window)
    .eq("dimension_type", dimension)
    .order("demand_score", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ scores: data });
}
