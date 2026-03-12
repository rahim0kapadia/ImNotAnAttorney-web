/**
 * GET /api/admin/demand/scores — demand scores for latest window
 * Query params: window (7d|30d|90d), dimension (charge_type|pain_point)
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { timingSafeEqual } from "crypto";

function isAuthorized(req: NextRequest): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  const fromHeader = req.headers.get("x-admin-password");
  if (!fromHeader) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(fromHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
