/**
 * @file /api/operator/jobs, Paginated processing job list with filters
 *
 * GET: Lists processing jobs with optional filters for status, job_type, case_id.
 *      Ordered by priority ascending (higher priority first), then created_at descending.
 *      Failed jobs sort first due to their default high priority values.
 *
 * Auth: ADMIN_PASSWORD via X-Admin-Password header (timing-safe comparison).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import type { ProcessingJobRow } from "@/lib/types/operator";

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const supabase = createAdminClient();
  const searchParams = req.nextUrl.searchParams;

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
  const offset = (page - 1) * limit;

  const status = searchParams.get("status");
  const jobType = searchParams.get("job_type");
  const caseId = searchParams.get("case_id");

  let query = supabase
    .from("processing_jobs")
    .select("id, case_id, job_type, job_subtype, status, priority, worker_id, progress, retry_count, max_retries, items_produced, started_at, completed_at, error_message, created_at", { count: "exact" })
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }
  if (jobType) {
    query = query.eq("job_type", jobType);
  }
  if (caseId) {
    query = query.eq("case_id", caseId);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[Operator/Jobs] List failed:", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({
    jobs: (data ?? []) as ProcessingJobRow[],
    total: count ?? 0,
    page,
    limit,
  });
}
