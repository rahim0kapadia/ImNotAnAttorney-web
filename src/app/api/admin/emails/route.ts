/**
 * @file /api/admin/emails, Admin API for inbound emails
 *
 * GET: List inbound emails with views (all/unread/starred/snoozed).
 *      Snoozed emails are hidden from default list until snoozed_until elapses.
 * PATCH: Update read/starred/snoozed_until/labels on an email.
 * DELETE: Hard-delete email by id (irreversible — UPL exposure minimization).
 *
 * Auth: ADMIN_PASSWORD via X-Admin-Password header.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import { rewriteImgUrls } from "@/lib/admin-img-proxy";

type View = "all" | "unread" | "starred" | "snoozed";

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const supabase = createAdminClient();
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1);
  const limit = 25;
  const offset = (page - 1) * limit;
  const view = (req.nextUrl.searchParams.get("view") as View) || "all";

  let query = supabase
    .from("inbound_emails")
    .select(
      "id, from_email, from_name, to_email, subject, body_text, body_html, headers, message_id, read, starred, snoozed_until, labels, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const nowIso = new Date().toISOString();
  if (view === "unread") {
    query = query.eq("read", false).or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`);
  } else if (view === "starred") {
    query = query.eq("starred", true);
  } else if (view === "snoozed") {
    query = query.gt("snoozed_until", nowIso);
  } else {
    // default "all" view: hide currently-snoozed emails
    query = query.or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // Rewrite img URLs in body_html to route through /api/admin/img-proxy.
  // Solves cross-origin-resource-policy blocks (e.g. claude.ai) and gives us
  // privacy/tracking control. Pattern matches Gmail's googleusercontent proxy.
  const rewritten = await Promise.all(
    (data || []).map(async (row) => {
      if (!row.body_html) return row;
      try {
        const html = await rewriteImgUrls(row.body_html);
        return { ...row, body_html: html };
      } catch {
        return row;
      }
    })
  );

  return NextResponse.json({ emails: rewritten, total: count, page, limit, view });
}

export async function PATCH(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { id, read, starred, snoozed_until, labels } = body;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id (string) required" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof read === "boolean") update.read = read;
  if (typeof starred === "boolean") update.starred = starred;
  if (snoozed_until === null) update.snoozed_until = null;
  else if (typeof snoozed_until === "string") {
    const ts = Date.parse(snoozed_until);
    if (Number.isNaN(ts)) {
      return NextResponse.json({ error: "snoozed_until must be ISO date or null" }, { status: 400 });
    }
    update.snoozed_until = new Date(ts).toISOString();
  }
  if (Array.isArray(labels)) {
    const clean = labels
      .filter((l) => typeof l === "string")
      .map((l) => l.trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 20);
    update.labels = Array.from(new Set(clean));
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("inbound_emails")
    .update(update)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { id } = body;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id (string) required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("inbound_emails")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
