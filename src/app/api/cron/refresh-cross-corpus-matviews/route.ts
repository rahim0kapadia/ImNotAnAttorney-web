/**
 * GET /api/cron/refresh-cross-corpus-matviews
 *
 * Refreshes the three cross-corpus materialized views that power the J1, J3,
 * and BR-J1 JOIN SKUs. Runs weekly (Sunday 02:00 UTC) via cron-job.org.
 *
 * Matviews refreshed:
 *   - mv_judge_officer_motion_rates  (J3 — officer × judge motion-grant matrix)
 *   - mv_judge_bench_fingerprint     (BR-J1 — departure reason × Booker inflection)
 *   - mv_judge_docket_caseload       (J1 — judge caseload for closed-ecosystem map)
 *
 * REFRESH CONCURRENTLY means readers are never blocked; queries during the
 * refresh return the previous snapshot transparently. Each matview has a unique
 * index that CONCURRENTLY requires.
 *
 * The refreshes run sequentially (not parallel) to avoid competing IO on the
 * XL compute instance during the low-traffic Sunday window.
 *
 * Auth: requireCron (Bearer CRON_AUTH_TOKEN).
 * Direct Postgres via SUPABASE_DB_URL — Supabase JS cannot issue DDL.
 * maxDuration 300 s covers the longest matview (mv_judge_bench_fingerprint
 * which aggregates 819K USSC rows).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/auth/guards";
import pg from "pg";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export const MATVIEWS = [
  "mv_judge_officer_motion_rates",
  "mv_judge_bench_fingerprint",
  "mv_judge_docket_caseload",
] as const;

export type MatviewName = (typeof MATVIEWS)[number];

export interface RefreshResult {
  matview: MatviewName;
  ok: boolean;
  ms: number;
  error?: string;
}

/**
 * Run REFRESH MATERIALIZED VIEW CONCURRENTLY for one matview.
 * Returns timing + success/error info; never throws.
 * Exported for unit-test injection.
 */
export async function refreshOne(
  client: pg.Client,
  matview: MatviewName
): Promise<RefreshResult> {
  const started = Date.now();
  try {
    await client.query(
      `REFRESH MATERIALIZED VIEW CONCURRENTLY ${matview}`
    );
    return { matview, ok: true, ms: Date.now() - started };
  } catch (e) {
    return {
      matview,
      ok: false,
      ms: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function GET(req: NextRequest) {
  const guard = requireCron(req);
  if (!guard.authorized) return guard.error;

  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_DB_URL not set" },
      { status: 500 }
    );
  }

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 270_000, // 4.5 min — capped below maxDuration of 300s
  });

  try {
    await client.connect();

    const results: RefreshResult[] = [];
    for (const mv of MATVIEWS) {
      results.push(await refreshOne(client, mv));
    }

    const anyFailed = results.some((r) => !r.ok);
    const totalMs = results.reduce((s, r) => s + r.ms, 0);

    return NextResponse.json(
      {
        ok: !anyFailed,
        timestamp: new Date().toISOString(),
        totalMs,
        results,
      },
      { status: anyFailed ? 500 : 200 }
    );
  } finally {
    try {
      await client.end();
    } catch {
      /* swallow — connection may already be closed */
    }
  }
}
