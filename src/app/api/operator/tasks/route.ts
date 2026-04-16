/**
 * @file /api/operator/tasks, Operator task list and status updates
 *
 * GET:   Paginated task list. Defaults to open/in_progress tasks, ordered by
 *        priority_rank ascending (urgent first), then due_at ascending (nulls last).
 *
 * PATCH: Update a task's status and/or notes. Automatically sets started_at on
 *        transition to 'in_progress' and completed_at on transition to 'completed'.
 *
 * Auth: ADMIN_PASSWORD via X-Admin-Password header (timing-safe comparison).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import type { OperatorTaskRow } from "@/lib/types/operator";

const VALID_TASK_STATUSES = ["open", "in_progress", "completed", "dismissed"];

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const supabase = createAdminClient();
  const searchParams = req.nextUrl.searchParams;

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
  const offset = (page - 1) * limit;

  const statusParam = searchParams.get("status");
  if (statusParam && !VALID_TASK_STATUSES.includes(statusParam)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const status = statusParam;
  const caseId = searchParams.get("case_id");

  let query = supabase
    .from("operator_tasks")
    .select("id, case_id, task_type, title, description, status, priority, priority_rank, notes, due_at, sla_breach, started_at, completed_at, created_at", { count: "exact" })
    .order("priority_rank", { ascending: true })
    .order("due_at", { ascending: true, nullsFirst: false })
    .range(offset, offset + limit - 1);

  // Default: show open + in_progress unless a specific status is requested
  if (status) {
    query = query.eq("status", status);
  } else {
    query = query.in("status", ["open", "in_progress"]);
  }

  if (caseId) {
    query = query.eq("case_id", caseId);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[Operator/Tasks] List failed:", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({
    tasks: (data ?? []) as OperatorTaskRow[],
    total: count ?? 0,
    page,
    limit,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  let body: { id?: string; status?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "id (string) is required" }, { status: 400 });
  }

  if (!body.status && body.notes === undefined) {
    return NextResponse.json(
      { error: "At least one of status or notes is required" },
      { status: 400 }
    );
  }

  if (body.status !== undefined && !VALID_TASK_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_TASK_STATUSES.join(", ")}` },
      { status: 422 }
    );
  }

  const supabase = createAdminClient();

  // Build the update object from provided fields
  const updateObj: Record<string, unknown> = {};

  if (body.status !== undefined) {
    updateObj.status = body.status;

    if (body.status === "in_progress") {
      updateObj.started_at = new Date().toISOString();
    }
    if (body.status === "completed") {
      updateObj.completed_at = new Date().toISOString();
    }
  }

  if (body.notes !== undefined) {
    if (typeof body.notes !== "string" || body.notes.length > 5000) {
      return NextResponse.json({ error: "notes must be a string (max 5000 chars)" }, { status: 400 });
    }
    updateObj.notes = body.notes;
  }

  const { error } = await supabase
    .from("operator_tasks")
    .update(updateObj)
    .eq("id", body.id);

  if (error) {
    console.error("[Operator/Tasks] Update failed:", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
