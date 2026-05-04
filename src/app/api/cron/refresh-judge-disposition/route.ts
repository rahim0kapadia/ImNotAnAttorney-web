/**
 * GET /api/cron/refresh-judge-disposition
 *
 * Refreshes the judge_disposition_stats + district_disposition_stats
 * matviews built by 20260503a_judge_disposition_stats.sql. These power the
 * Judge Question Brief disposition-time benchmarks + IB Court Prep section.
 *
 * Runs WEEKLY via cron-job.org (jobId registered separately). Refresh is
 * CONCURRENTLY-safe so reader queries (sentencing fingerprint resolver,
 * IB Court Prep helper) are never blocked during the rebuild.
 *
 * Idempotency: acquireCronLock with 23h interval ensures no double-run if
 * cron-job.org retries on transient failure.
 *
 * Auth: Bearer CRON_AUTH_TOKEN via requireCron guard.
 *
 * TICKET-2 (2026-05-03).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";

export const runtime = "nodejs";
// Refresh of 31M-row matview can take 5-10 minutes on XL tier; allow generous
// budget. Vercel maxDuration is enforced by infra, this is the request budget.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = requireCron(req);
  if (!guard.authorized) return guard.error;

  // Weekly cadence — 6.5 days minimum between runs gives a 12h buffer for
  // scheduler jitter / clock drift. Stale-lock threshold = 30 min because
  // the worst-case refresh on XL tier is ~10 min and we want to give it
  // 3x headroom before treating a "running" lock as stale.
  const lock = await acquireCronLock(
    "refresh-judge-disposition",
    6.5 * 24 * 60 * 60 * 1000,
    {
      staleThresholdMs: 30 * 60 * 1000,
      // Fail-closed: a double matview rebuild wastes ~10 min of XL-tier IO.
      // Better to skip than to run twice on transient lock errors.
      failOpenOnError: false,
    },
  );
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();
  const started = Date.now();

  try {
    const { data, error } = await supabase.rpc("refresh_judge_disposition_stats");
    const ms = Date.now() - started;

    if (error) {
      await releaseCronLock(lock.executionId!, "failed");
      return NextResponse.json(
        { ok: false, ms, error: error.message },
        { status: 500 },
      );
    }

    await releaseCronLock(lock.executionId!, "completed");

    // refresh_judge_disposition_stats() returns jsonb { judge_rows, district_rows, elapsed_ms }
    return NextResponse.json({
      ok: true,
      ms,
      stats: data,
    });
  } catch (e: unknown) {
    await releaseCronLock(lock.executionId!, "failed");
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
