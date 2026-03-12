/**
 * GET /api/admin/demand/emerging — emerging topics (detected/promoted)
 * PATCH /api/admin/demand/emerging — promote or dismiss a topic
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
  const status = req.nextUrl.searchParams.get("status") || "detected";

  const { data, error } = await supabase
    .from("emerging_topics")
    .select("*")
    .eq("status", status)
    .order("post_count", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ topics: data });
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, action, promoted_to_charge_type, promoted_to_pain_point, notes } = await req.json();
  if (!id || !action) {
    return NextResponse.json({ error: "id and action (promote|dismiss) required" }, { status: 400 });
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
