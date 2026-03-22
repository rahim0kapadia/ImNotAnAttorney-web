/**
 * @file /api/cron/drip — Daily cron orchestrator
 *
 * Schedule: Runs daily at 9 AM EST (14:00 UTC) via Vercel Cron.
 * Protected by CRON_SECRET bearer token (Vercel sets this automatically).
 *
 * All task logic lives in src/lib/cron/*.ts — this file is a thin orchestrator
 * that runs each task sequentially with isolated error handling.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import type { CronContext, CronResult } from "@/lib/cron/types";
import { mergeResults } from "@/lib/cron/types";

// ── Task imports ──────────────────────────────────────────────
import { sendNurtureEmails } from "@/lib/cron/drip-nurture";
import { sendPostPurchaseEmails } from "@/lib/cron/drip-post-purchase";
import {
  sendReviewReminders,
  detectStuckIntakes,
  detectStuckGenerating,
  detectStuckIBGeneration,
  sendPhase2IntakeReminders,
  sendAwaitingIntakeReminders,
  escalateStuckIntakes,
} from "@/lib/cron/operator-alerts";
import {
  cleanupAbandonedIntakes,
  cleanupRateLimits,
  cleanupDripEmailLogs,
  cleanupDiscoveryDocuments,
} from "@/lib/cron/compliance";
import { reconcileStripePayments, detectOrphanOrders } from "@/lib/cron/reconciliation";
import { sendReportExpiryWarnings, sendAbandonedCheckoutEmails } from "@/lib/cron/customer-lifecycle";
import { retriggerMissedEvaluations, detectStuckJobs, checkPipelineCompletion } from "@/lib/cron/pipeline";
import { detectSLABreaches, sendWeeklyProgressEmails, checkEngineHeartbeat } from "@/lib/cron/monitoring";

/** Task registry — each entry runs sequentially with isolated error handling. */
const TASKS: { name: string; fn: (ctx: CronContext) => Promise<CronResult> }[] = [
  // Drip emails (Parts 1-2)
  { name: "nurture-emails", fn: sendNurtureEmails },
  { name: "post-purchase-emails", fn: sendPostPurchaseEmails },
  // Operator alerts (Parts 3-5c, 8)
  { name: "review-reminders", fn: sendReviewReminders },
  { name: "stuck-intakes", fn: detectStuckIntakes },
  { name: "stuck-generating", fn: detectStuckGenerating },
  { name: "stuck-ib-generation", fn: detectStuckIBGeneration },
  { name: "phase2-intake-reminders", fn: sendPhase2IntakeReminders },
  { name: "awaiting-intake-reminders", fn: sendAwaitingIntakeReminders },
  { name: "intake-escalation", fn: escalateStuckIntakes },
  // Compliance cleanup (Parts 6-7)
  { name: "abandoned-intake-cleanup", fn: cleanupAbandonedIntakes },
  { name: "rate-limit-cleanup", fn: cleanupRateLimits },
  // Stripe reconciliation (Parts 9-10)
  { name: "stripe-reconciliation", fn: reconcileStripePayments },
  { name: "orphan-order-detection", fn: detectOrphanOrders },
  // Customer lifecycle (Parts 11, 11b)
  { name: "report-expiry-warnings", fn: sendReportExpiryWarnings },
  { name: "abandoned-checkout", fn: sendAbandonedCheckoutEmails },
  // Pipeline management (Part 12)
  { name: "missed-evaluation", fn: retriggerMissedEvaluations },
  // Compliance cleanup continued (Parts 13-14)
  { name: "drip-log-cleanup", fn: cleanupDripEmailLogs },
  { name: "discovery-doc-cleanup", fn: cleanupDiscoveryDocuments },
  // Pipeline health (Parts 15-16)
  { name: "stuck-jobs", fn: detectStuckJobs },
  { name: "pipeline-completion", fn: checkPipelineCompletion },
  // Monitoring (Parts 17-19)
  { name: "sla-breaches", fn: detectSLABreaches },
  { name: "weekly-progress", fn: sendWeeklyProgressEmails },
  { name: "engine-heartbeat", fn: checkEngineHeartbeat },
];

export async function GET(req: NextRequest) {
  // ── Auth ──
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const supabase = createAdminClient();

  // ── Advisory lock (prevent concurrent runs) ──
  const { data: lockAcquired } = await supabase.rpc("acquire_cron_lock", { lock_key: 1 });
  if (!lockAcquired) {
    return NextResponse.json({ message: "Cron already running (lock not acquired)" });
  }

  const now = new Date();
  const ctx: CronContext = {
    supabase,
    operatorEmail: process.env.OPERATOR_EMAIL || "rahim0kapadia@gmail.com",
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://imnotanattorney.com",
    operatorSecret: process.env.OPERATOR_SECRET || "",
    now,
  };

  const results: CronResult[] = [];
  const failedTasks: string[] = [];

  try {
    // ── Heartbeat: Detect if cron missed runs (Gap D) ──
    const { data: lastRun } = await supabase
      .from("cron_runs")
      .select("ran_at")
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastRun?.ran_at) {
      const hoursSinceLastRun = (now.getTime() - new Date(lastRun.ran_at).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastRun > 48) {
        await sendEmail({
          to: ctx.operatorEmail,
          subject: `ALERT: Cron missed runs \u2014 last run was ${Math.round(hoursSinceLastRun)} hours ago`,
          html: `<h1 style="color: #EF4444;">Cron Gap Detected</h1>
            <p>The daily cron job hasn't run in <strong>${Math.round(hoursSinceLastRun)} hours</strong>.</p>
            <p>Last successful run: ${new Date(lastRun.ran_at).toISOString()}</p>
            <p><strong>Action:</strong> Check Vercel cron configuration and logs.</p>`,
        }, { category: "operator-alert", metadata: { reason: "cron-gap", hours_since_last: Math.round(hoursSinceLastRun) } });
      }
    }

    // ── Run all tasks with error isolation ──
    for (const task of TASKS) {
      try {
        const result = await task.fn(ctx);
        results.push(result);
      } catch (err) {
        console.error(`[Cron] Task "${task.name}" failed:`, err);
        failedTasks.push(task.name);
        results.push({ sent: 0, skipped: 0, errors: 1, cleaned: 0 });
      }
    }

    // ── Record run ──
    const totals = mergeResults(...results);
    await supabase.from("cron_runs").insert({
      result: { ...totals, failedTasks },
    });

    return NextResponse.json(totals);
  } catch (err) {
    console.error("[Cron] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    await supabase.rpc("release_cron_lock", { lock_key: 1 });
  }
}
