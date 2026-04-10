/**
 * @file /api/operator/idd — IDD scholarship application queue
 *
 * GET: List applications filtered by status (default: pending).
 *      Returns up to 50, ordered oldest-first so operators work FIFO.
 *
 * Auth: ADMIN_PASSWORD via X-Admin-Password header (timing-safe comparison).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const supabase = createAdminClient();
  const status = req.nextUrl.searchParams.get("status") || "pending";

  const { data, error } = await supabase
    .from("idd_applications")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("[Operator/IDD] List failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ applications: data ?? [] });
}
