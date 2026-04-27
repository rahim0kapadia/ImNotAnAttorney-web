/**
 * @file /api/cron/quora-discovery — weekly Quora abandoned-question ingestion
 *
 * Phase C of the blog-pipeline gap-closure plan (F-NEW-3 successor).
 *
 * The existing scraper at `blog-pipeline/scripts/discover-quora.mjs` writes
 * to `abandoned_questions` directly (uses Playwright-extra + cookie-imported
 * profile). This cron route is the scheduled-trigger wrapper so cron-job.org
 * can invoke discovery on cadence rather than relying on manual invocation.
 *
 * Status: SCAFFOLD (live: false). Wiring requires:
 *   1. Server-side execution model decision: Vercel after() can't spawn
 *      headed Playwright; needs either (a) Fly.io machine running the
 *      scraper on schedule, or (b) GitHub Actions workflow with the
 *      .quora-cookies.json artifact, or (c) move to Quora API
 *      (rate-limited, requires waitlist approval).
 *   2. CRONJOB_API_KEY-registered cron-job.org entry pointing here once
 *      the spawn model is decided.
 *
 * Schedule (when wired): Sundays at 7:00 AM ET via cron-job.org hitting
 * this endpoint. Protected by CRON_SECRET bearer token.
 *
 * Until wired, this route returns 503 with a clear message + the exact
 * runbook for closing the gap.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/auth/guards';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  // Phase C scaffold: route exists so cron-job.org can be registered against it,
  // but the spawn-Playwright-from-Vercel-edge model is not viable. Return a
  // structured 503 with the runbook so a future operator can close the gap
  // without re-discovering the constraint.
  return NextResponse.json(
    {
      status: 'not-yet-wired',
      reason: 'Vercel edge cannot spawn headed Playwright; cookie-imported profile required for Quora.',
      runbook: [
        '1. Decide spawn model: (a) Fly.io machine with scheduled scraper, (b) GitHub Actions workflow with .quora-cookies.json artifact, (c) Quora API once waitlist approved.',
        '2. Update this route to dispatch to the chosen surface.',
        '3. Register cron-job.org entry pointing here on Sunday 12:00 UTC cadence.',
        '4. Update blog-pipeline/CONTEXT.md to mark Quora discovery as cron-driven.',
      ],
      existing_scraper: 'blog-pipeline/scripts/discover-quora.mjs',
      existing_table: 'abandoned_questions',
      schedule_when_wired: 'weekly Sunday 12:00 UTC',
    },
    { status: 503 },
  );
}
