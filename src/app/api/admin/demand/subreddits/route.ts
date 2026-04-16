/**
 * GET /api/admin/demand/subreddits, discovered subreddits
 * PATCH /api/admin/demand/subreddits, approve or reject a subreddit
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const supabase = createAdminClient();
  const status = req.nextUrl.searchParams.get("status") || "candidate";

  const { data, error } = await supabase
    .from("discovered_subreddits")
    .select("*")
    .eq("status", status)
    .order("relevance_score", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ subreddits: data });
}

export async function PATCH(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { id, action } = body;
  if (!id || typeof id !== "string" || !action || typeof action !== "string") {
    return NextResponse.json({ error: "id (string) and action (string: approve|reject) required" }, { status: 400 });
  }

  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const update: Record<string, unknown> = {
    status: action === "approve" ? "approved" : "rejected",
  };
  if (action === "approve") {
    update.approved_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("discovered_subreddits")
    .update(update)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
