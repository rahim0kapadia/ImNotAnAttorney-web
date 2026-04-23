/**
 * GET /api/cron/cleanup-e2e-orphans — daily sweep for Phase 2 E2E test orphans.
 *
 * Round-1 finding S3 (E2E prod-DB pollution guard): the self-seeding
 * Playwright spec at `e2e/phase2-badges.spec.ts` inserts a throwaway
 * orders + cases pair in `beforeAll` and deletes them in `afterAll`. If
 * the session crashes between insert and teardown (OS kill, Playwright
 * timeout, CI agent loss), the seeded rows are orphaned in prod.
 *
 * The spec itself already runs a best-effort startup sweep (C2) on each
 * run, but that only fires when the spec re-executes — a one-off crash
 * that's never re-run leaves rows indefinitely. This cron is the
 * scheduled backstop.
 *
 * Contract:
 *   - Only deletes rows older than 1 day (so never stomps an in-flight
 *     concurrent seed).
 *   - Email prefix `phase2-e2e-` + suffix `@test.invalid` scope the
 *     delete tight — cannot touch a real customer row.
 *   - Cases first, orders second (FK reverse order).
 *   - Idempotent: re-running mid-day is a no-op when nothing matches.
 *
 * Cron registration: cron-job.org jobId TBD (captured at wire-up time).
 * Schedule: daily at 04:05 UTC (off-peak, staggered from other cleanups).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { createAdminClient } from "@/lib/supabase/admin";

const E2E_EMAIL_LIKE = "phase2-e2e-%@test.invalid";

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const lock = await acquireCronLock("cleanup-e2e-orphans", 23 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Round-2 finding S1: row-count cap before deletion. If something has gone
  // wrong upstream (E2E loop stuck, seed prefix mis-used, malicious row
  // injection using the test-prefix pattern) and >100 rows match, log a
  // loud warning and bail instead of silently mass-deleting. The operator
  // can then inspect + act deliberately rather than watching the cron wipe
  // a pile of data it was never designed to handle.
  const CLEANUP_SAFETY_CAP = 100;
  try {
    const { count: casesCandidate, error: casesPeekErr } = await supabase
      .from("cases")
      .select("id", { count: "exact", head: true })
      .like("email", E2E_EMAIL_LIKE)
      .lt("created_at", cutoff);
    if (casesPeekErr) {
      throw new Error(`cases peek failed: ${casesPeekErr.message}`);
    }
    const { count: ordersCandidate, error: ordersPeekErr } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .like("email", E2E_EMAIL_LIKE)
      .lt("created_at", cutoff);
    if (ordersPeekErr) {
      throw new Error(`orders peek failed: ${ordersPeekErr.message}`);
    }

    const casesPeek = casesCandidate ?? 0;
    const ordersPeek = ordersCandidate ?? 0;
    if (casesPeek > CLEANUP_SAFETY_CAP || ordersPeek > CLEANUP_SAFETY_CAP) {
      console.warn(
        "[cleanup-e2e-orphans] SAFETY CAP TRIPPED — refusing to delete.",
        { casesPeek, ordersPeek, cap: CLEANUP_SAFETY_CAP, cutoff }
      );
      await releaseCronLock(lock.executionId!, "completed");
      return NextResponse.json({
        skipped: true,
        reason: "safety_cap_exceeded",
        cases_candidate: casesPeek,
        orders_candidate: ordersPeek,
        cap: CLEANUP_SAFETY_CAP,
        cutoff_iso: cutoff,
      });
    }

    const { count: casesDeleted, error: caseErr } = await supabase
      .from("cases")
      .delete({ count: "exact" })
      .like("email", E2E_EMAIL_LIKE)
      .lt("created_at", cutoff);
    if (caseErr) {
      throw new Error(`cases delete failed: ${caseErr.message}`);
    }

    const { count: ordersDeleted, error: orderErr } = await supabase
      .from("orders")
      .delete({ count: "exact" })
      .like("email", E2E_EMAIL_LIKE)
      .lt("created_at", cutoff);
    if (orderErr) {
      throw new Error(`orders delete failed: ${orderErr.message}`);
    }

    await releaseCronLock(lock.executionId!, "completed");

    return NextResponse.json({
      cleaned: {
        orphan_e2e_cases: casesDeleted ?? 0,
        orphan_e2e_orders: ordersDeleted ?? 0,
      },
      cutoff_iso: cutoff,
    });
  } catch (e) {
    await releaseCronLock(lock.executionId!, "failed");
    console.error("[cleanup-e2e-orphans] Fatal error:", e);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
