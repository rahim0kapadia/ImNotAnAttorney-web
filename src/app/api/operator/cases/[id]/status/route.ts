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

import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import { ALLOWED_TRANSITIONS } from "@/lib/types/operator";
import { SITE_URL } from "@/lib/site";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const { id } = await params;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
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

  // Fetch current status and tier (tier needed for auto-trigger logic)
  const { data: caseRow, error: fetchError } = await supabase
    .from("cases")
    .select("status, tier")
    .eq("id", id)
    .single();

  if (fetchError) {
    console.error("[Operator/Status] Fetch failed:", fetchError.message);
    return NextResponse.json(
      { error: fetchError.code === "PGRST116" ? "Case not found" : "Internal server error" },
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json(
      { error: "Status was changed by another process. Refresh and try again." },
      { status: 409 }
    );
  }

  // Auto-trigger report generation when operator moves case to "generating"
  if (newStatus === "generating" && caseRow.tier === "case-decoder") {
    after(async () => {
      await fetch(`${SITE_URL}/api/generate/case-decoder`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPERATOR_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ caseId: id, force: true, skipEmail: true }),
      }).catch((err) =>
        console.error("[Operator/Status] Auto-trigger CD generation failed:", err)
      );
    });
  }

  if (newStatus === "generating" && caseRow.tier === "intelligence-brief") {
    after(async () => {
      await fetch(`${SITE_URL}/api/generate/intelligence-brief`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPERATOR_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ caseId: id, force: true }),
      }).catch((err) =>
        console.error("[Operator/Status] Auto-trigger IB generation failed:", err)
      );
    });
  }

  return NextResponse.json({ ok: true, status: newStatus });
}
