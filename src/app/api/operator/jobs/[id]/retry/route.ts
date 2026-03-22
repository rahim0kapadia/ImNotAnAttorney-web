/**
 * @file /api/operator/jobs/[id]/retry — Retry a failed processing job
 *
 * POST: Resets a failed job back to 'queued' status for re-processing.
 *       Validates the job is actually in 'failed' state and that retry_count
 *       hasn't exceeded max_retries.
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
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch current job
  const { data: job, error: fetchError } = await supabase
    .from("processing_jobs")
    .select("id, status, retry_count, max_retries")
    .eq("id", id)
    .single();

  if (fetchError) {
    console.error("[Operator/JobRetry] Fetch failed:", fetchError.message);
    return NextResponse.json(
      { error: fetchError.code === "PGRST116" ? "Job not found" : "Internal server error" },
      { status: fetchError.code === "PGRST116" ? 404 : 500 }
    );
  }

  if (job.status !== "failed") {
    return NextResponse.json(
      { error: `Job is "${job.status}", not "failed". Only failed jobs can be retried.` },
      { status: 400 }
    );
  }

  if (job.retry_count >= job.max_retries) {
    return NextResponse.json(
      {
        error: "Max retries exceeded",
        retry_count: job.retry_count,
        max_retries: job.max_retries,
      },
      { status: 400 }
    );
  }

  // Atomic conditional update — prevents race condition when two operators retry simultaneously
  const { data: updated, error: updateError } = await supabase
    .from("processing_jobs")
    .update({
      status: "queued",
      error_message: null,
      error_details: null,
      retry_count: job.retry_count + 1,
      started_at: null,
      completed_at: null,
      progress: 0,
    })
    .eq("id", id)
    .eq("status", "failed") // Guard: only update if still in "failed" state
    .select("id")
    .single();

  if (updateError || !updated) {
    if (updateError?.code === "PGRST116") {
      return NextResponse.json({ error: "Job already retried by another operator" }, { status: 409 });
    }
    console.error("[Operator/JobRetry] Update failed:", updateError?.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
