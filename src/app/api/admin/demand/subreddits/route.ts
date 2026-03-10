/**
 * GET /api/admin/demand/subreddits — discovered subreddits
 * PATCH /api/admin/demand/subreddits — approve or reject a subreddit
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
  const status = req.nextUrl.searchParams.get("status") || "candidate";

  const { data, error } = await supabase
    .from("discovered_subreddits")
    .select("*")
    .eq("status", status)
    .order("relevance_score", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ subreddits: data });
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, action } = await req.json();
  if (!id || !action) {
    return NextResponse.json({ error: "id and action (approve|reject) required" }, { status: 400 });
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
