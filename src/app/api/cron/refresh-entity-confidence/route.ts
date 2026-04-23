/**
 * GET /api/cron/refresh-entity-confidence
 *
 * Refreshes the v_entity_confidence materialized view that powers the
 * /report/[token] badge transformer. Runs nightly via cron-job.org.
 *
 * CONCURRENTLY refresh means readers are never blocked; badge lookups
 * during the refresh return the previous snapshot transparently.
 *
 * Protected by CRON_AUTH_TOKEN bearer token via requireCron guard.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = requireCron(req);
  if (!guard.authorized) return guard.error;

  const supabase = createAdminClient();
  const started = Date.now();
  const { error } = await supabase.rpc("refresh_entity_confidence_mv");
  const ms = Date.now() - started;

  if (error) {
    return NextResponse.json(
      { ok: false, ms, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, ms });
}
