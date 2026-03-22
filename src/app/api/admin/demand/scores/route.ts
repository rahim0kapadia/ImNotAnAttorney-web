/**
 * GET /api/admin/demand/scores — demand scores for latest window
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

  const { data, error } = await supabase
    .from("demand_scores")
    .select("*")
    .eq("window_label", window)
    .eq("dimension_type", dimension)
    .order("demand_score", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ scores: data });
}
