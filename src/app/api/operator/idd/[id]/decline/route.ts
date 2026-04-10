/**
 * @file /api/operator/idd/[id]/decline — Decline an IDD scholarship application
 *
 * POST: Marks the application as declined with an optional reason.
 *       Only transitions from pending status (idempotent guard).
 *
 * Body: { reason?: string }
 *
 * Auth: ADMIN_PASSWORD via X-Admin-Password header (timing-safe comparison).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const { id } = await params;

  let body: { reason?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional — reason defaults to null
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("idd_applications")
    .update({
      status: "declined",
      decline_reason: body.reason || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: "operator",
    })
    .eq("id", id)
    .eq("status", "pending");

  if (error) {
    console.error("[Operator/IDD/Decline] Update failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "declined" });
}
