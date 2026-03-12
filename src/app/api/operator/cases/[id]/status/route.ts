/**
 * @file /api/operator/cases/[id]/status — Manual status transition with atomic guard
 *
 * PATCH: Transitions a case to a new status. Validates against ALLOWED_TRANSITIONS
 *        and uses an atomic conditional update to prevent race conditions (if
 *        another process changed the status between our read and write, the
 *        UPDATE matches 0 rows and we return 409 Conflict).
 *
 * Auth: ADMIN_PASSWORD via X-Admin-Password header (timing-safe comparison).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOperatorAuthorized } from "@/lib/operator-auth";
import { ALLOWED_TRANSITIONS } from "@/lib/types/operator";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  if (!isOperatorAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing case id" }, { status: 400 });
  }

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const newStatus = body.status;
  if (!newStatus || typeof newStatus !== "string") {
    return NextResponse.json(
      { error: "status (string) is required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Fetch current status
  const { data: caseRow, error: fetchError } = await supabase
    .from("cases")
    .select("status")
    .eq("id", id)
    .single();

  if (fetchError) {
    console.error("[Operator/Status] Fetch failed:", fetchError.message);
    return NextResponse.json(
      { error: fetchError.code === "PGRST116" ? "Case not found" : fetchError.message },
      { status: fetchError.code === "PGRST116" ? 404 : 500 }
    );
  }

  const currentStatus = caseRow.status;

  // Validate transition
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    return NextResponse.json(
      {
        error: `Transition from "${currentStatus}" to "${newStatus}" is not allowed`,
        allowed: allowed ?? [],
      },
      { status: 422 }
    );
  }

  // Atomic conditional update — only succeeds if status hasn't changed since we read it
  const { data: updated, error: updateError } = await supabase
    .from("cases")
    .update({ status: newStatus })
    .eq("id", id)
    .eq("status", currentStatus)
    .select("id")
    .single();

  if (updateError) {
    // PGRST116 = "no rows returned" — means the status was changed by another process
    if (updateError.code === "PGRST116") {
      return NextResponse.json(
        { error: "Status was changed by another process. Refresh and try again." },
        { status: 409 }
      );
    }
    console.error("[Operator/Status] Update failed:", updateError.message);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json(
      { error: "Status was changed by another process. Refresh and try again." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, status: newStatus });
}
