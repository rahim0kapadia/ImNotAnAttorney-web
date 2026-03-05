/**
 * @file /api/admin/emails — Admin API for inbound emails
 *
 * GET: List inbound emails (paginated, newest first)
 * PATCH: Mark email as read/unread
 *
 * Auth: ADMIN_PASSWORD via X-Admin-Password header.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function isAuthorized(req: NextRequest): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  const fromHeader = req.headers.get("x-admin-password");
  return fromHeader === password;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10);
  const limit = 25;
  const offset = (page - 1) * limit;
  const unreadOnly = req.nextUrl.searchParams.get("unread") === "true";

  let query = supabase
    .from("inbound_emails")
    .select("id, from_email, from_name, to_email, subject, body_text, body_html, read, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (unreadOnly) {
    query = query.eq("read", false);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ emails: data, total: count, page, limit });
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, read } = await req.json();
  if (!id || typeof read !== "boolean") {
    return NextResponse.json({ error: "id and read (boolean) required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("inbound_emails")
    .update({ read })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
