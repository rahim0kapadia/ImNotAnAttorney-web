/**
 * @file /api/operator/metrics — Aggregate dashboard statistics
 *
 * GET: Returns CaseMetrics with counts, breakdowns, revenue, SLA breaches,
 *      and avg delivery time. All queries run in parallel via Promise.all.
 *
 * Auth: ADMIN_PASSWORD via X-Admin-Password header (timing-safe comparison).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";
import type { CaseMetrics } from "@/lib/types/operator";

const DISCOVERY_TIERS = ["x-ray", "war-room", "situation-room"] as const;

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const supabase = createAdminClient();

  // Status and tier values for count-based aggregation (avoids full table scans)
  const CASE_STATUSES = [
    "awaiting-intake", "intake", "intake-stalled", "pending", "submitted",
    "generating", "auto-generating", "compiling", "researching",
    "generation-failed", "processing", "review", "delivered", "refunded", "cancelled",
  ] as const;

  // Build parallel count queries for status/tier breakdowns instead of fetching all rows
  const statusCountQueries = CASE_STATUSES.map((s) =>
    supabase.from("cases").select("id", { count: "exact", head: true })
      .in("tier", [...DISCOVERY_TIERS]).eq("status", s)
      .then((r) => ({ status: s, count: r.count ?? 0 }))
  );
  const tierCountQueries = [...DISCOVERY_TIERS].map((t) =>
    supabase.from("cases").select("id", { count: "exact", head: true })
      .eq("tier", t)
      .then((r) => ({ tier: t, count: r.count ?? 0 }))
  );

  const [
    totalCasesResult,
    statusCounts,
    tierCounts,
    revenueResult,
    activeJobsResult,
    failedJobsResult,
    slaBreachResult,
    deliveryTimesResult,
    openTasksResult,
  ] = await Promise.all([
    // 1. Total discovery-tier cases
    supabase
      .from("cases")
      .select("id", { count: "exact", head: true })
      .in("tier", [...DISCOVERY_TIERS]),

    // 2. Cases by status (individual count queries — no full table scan)
    Promise.all(statusCountQueries),

    // 3. Cases by tier (individual count queries — no full table scan)
    Promise.all(tierCountQueries),

    // 4. Total revenue from paid orders (atomic RPC — no row limit)
    supabase.rpc("sum_paid_revenue"),

    // 5. Active jobs (currently processing)
    supabase
      .from("processing_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "processing"),

    // 6. Failed jobs
    supabase
      .from("processing_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),

    // 7. SLA breaches: delivery_due_at in the past and not yet delivered/refunded
    supabase
      .from("cases")
      .select("id", { count: "exact", head: true })
      .lt("delivery_due_at", new Date().toISOString())
      .not("status", "in", "(delivered,refunded)"),

    // 8. Delivery times for avg calculation (limited to recent 500)
    supabase
      .from("cases")
      .select("created_at, delivered_at")
      .eq("status", "delivered")
      .not("delivered_at", "is", null)
      .order("delivered_at", { ascending: false })
      .limit(500),

    // 9. Open tasks
    supabase
      .from("operator_tasks")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "in_progress"]),
  ]);

  // Build status breakdown from count queries
  const casesByStatus: Record<string, number> = {};
  for (const { status, count } of statusCounts) {
    if (count > 0) casesByStatus[status] = count;
  }

  // Build tier breakdown from count queries
  const casesByTier: Record<string, number> = {};
  for (const { tier, count } of tierCounts) {
    if (count > 0) casesByTier[tier] = count;
  }

  const totalRevenueCents = revenueResult.data ?? 0;

  // Compute average delivery hours
  let avgDeliveryHours: number | null = null;
  if (deliveryTimesResult.data && deliveryTimesResult.data.length > 0) {
    let totalMs = 0;
    let count = 0;
    for (const row of deliveryTimesResult.data) {
      const created = new Date(row.created_at as string).getTime();
      const delivered = new Date(row.delivered_at as string).getTime();
      if (delivered > created) {
        totalMs += delivered - created;
        count++;
      }
    }
    if (count > 0) {
      avgDeliveryHours = Math.round((totalMs / count / (1000 * 60 * 60)) * 10) / 10;
    }
  }

  const metrics: CaseMetrics = {
    total_cases: totalCasesResult.count ?? 0,
    cases_by_status: casesByStatus,
    cases_by_tier: casesByTier,
    total_revenue_cents: totalRevenueCents,
    active_jobs: activeJobsResult.count ?? 0,
    failed_jobs: failedJobsResult.count ?? 0,
    sla_breaches: slaBreachResult.count ?? 0,
    avg_delivery_hours: avgDeliveryHours,
    open_tasks: openTasksResult.count ?? 0,
  };

  return NextResponse.json(metrics);
}
