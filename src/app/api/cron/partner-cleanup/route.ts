/**
 * GET /api/cron/partner-cleanup, Clean expired magic links and sessions.
 * Runs daily at 3am ET via cron-job.org.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-idempotency";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const lock = await acquireCronLock("partner-cleanup", 23 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();

  try {
    // Delete expired AND unused magic links (keep used ones as audit trail)
    const { count: linksDeleted } = await supabase
      .from("partner_magic_links")
      .delete({ count: "exact" })
      .lt("expires_at", new Date().toISOString())
      .is("used_at", null);

    // Delete expired sessions
    const { count: sessionsDeleted } = await supabase
      .from("partner_sessions")
      .delete({ count: "exact" })
      .lt("expires_at", new Date().toISOString());

    await releaseCronLock(lock.executionId!, "completed");

    return NextResponse.json({
      cleaned: {
        expired_magic_links: linksDeleted || 0,
        expired_sessions: sessionsDeleted || 0,
      },
    });
  } catch (e) {
    await releaseCronLock(lock.executionId!, "failed");
    console.error("[Partner Cleanup] Fatal error:", e);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
