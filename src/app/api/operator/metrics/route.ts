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

  const [
    totalCasesResult,
    casesByStatusResult,
    casesByTierResult,
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

    // 2. Cases by status (discovery tiers)
    supabase
      .from("cases")
      .select("status")
      .in("tier", [...DISCOVERY_TIERS]),

    // 3. Cases by tier (discovery tiers)
    supabase
      .from("cases")
      .select("tier")
      .in("tier", [...DISCOVERY_TIERS]),

    // 4. Total revenue from paid orders
    supabase
      .from("orders")
      .select("amount_cents")
      .eq("status", "paid"),

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

    // 8. Delivery times for avg calculation
    supabase
      .from("cases")
      .select("created_at, delivered_at")
      .eq("status", "delivered")
      .not("delivered_at", "is", null),

    // 9. Open tasks
    supabase
      .from("operator_tasks")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "in_progress"]),
  ]);

  // Reduce cases by status
  const casesByStatus: Record<string, number> = {};
  if (casesByStatusResult.data) {
    for (const row of casesByStatusResult.data) {
      const s = row.status as string;
      casesByStatus[s] = (casesByStatus[s] || 0) + 1;
    }
  }

  // Reduce cases by tier
  const casesByTier: Record<string, number> = {};
  if (casesByTierResult.data) {
    for (const row of casesByTierResult.data) {
      const t = row.tier as string;
      casesByTier[t] = (casesByTier[t] || 0) + 1;
    }
  }

  // Sum revenue
  let totalRevenueCents = 0;
  if (revenueResult.data) {
    for (const row of revenueResult.data) {
      totalRevenueCents += (row.amount_cents as number) || 0;
    }
  }

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
