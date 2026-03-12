/**
 * GET /api/admin/demand/gaps — content gaps sorted by gap_score
 * PATCH /api/admin/demand/gaps — update gap status
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
  const status = req.nextUrl.searchParams.get("status") || null;

  let query = supabase
    .from("content_gaps")
    .select("*")
    .order("gap_score", { ascending: false })
    .limit(50);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ gaps: data });
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, status, notes } = await req.json();
  if (!id || !status) {
    return NextResponse.json({ error: "id and status required" }, { status: 400 });
  }

  const allowed = ["identified", "queued", "in-progress", "published", "declined"];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${allowed.join(", ")}` }, { status: 400 });
  }

  const supabase = createAdminClient();
  const update: Record<string, unknown> = { status };
  if (status === "declined" || status === "queued") {
    update.decided_at = new Date().toISOString();
  }
  if (notes !== undefined) {
    update.notes = notes;
  }

  const { error } = await supabase
    .from("content_gaps")
    .update(update)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
