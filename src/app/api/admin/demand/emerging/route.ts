/**
 * GET /api/admin/demand/emerging — emerging topics (detected/promoted)
 * PATCH /api/admin/demand/emerging — promote or dismiss a topic
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const supabase = createAdminClient();
  const VALID_STATUSES = ["detected", "promoted", "dismissed"];
  const status = req.nextUrl.searchParams.get("status") || "detected";
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("emerging_topics")
    .select("*")
    .eq("status", status)
    .order("post_count", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ topics: data });
}

export async function PATCH(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { id, action, promoted_to_charge_type, promoted_to_pain_point, notes } = body;
  if (!id || typeof id !== "string" || !action || typeof action !== "string") {
    return NextResponse.json({ error: "id (string) and action (string: promote|dismiss) required" }, { status: 400 });
  }
  if (notes !== undefined && typeof notes !== "string") {
    return NextResponse.json({ error: "notes must be a string" }, { status: 400 });
  }

  if (!["promote", "dismiss"].includes(action)) {
    return NextResponse.json({ error: "action must be 'promote' or 'dismiss'" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const update: Record<string, unknown> = {
    status: action === "promote" ? "promoted" : "dismissed",
  };

  if (action === "promote") {
    if (promoted_to_charge_type) update.promoted_to_charge_type = promoted_to_charge_type;
    if (promoted_to_pain_point) update.promoted_to_pain_point = promoted_to_pain_point;
  }
  if (notes !== undefined) update.notes = notes;

  const { error } = await supabase
    .from("emerging_topics")
    .update(update)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
