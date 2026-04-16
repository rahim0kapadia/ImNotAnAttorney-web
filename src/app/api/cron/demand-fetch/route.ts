/**
 * @file /api/cron/demand-fetch, Daily Reddit signal ingestion
 *
 * Fetches criminal defense posts from Reddit, classifies them by charge type,
 * urgency, price sensitivity, and geography, then upserts to reddit_signals.
 *
 * Also runs weekly subreddit discovery (Sundays) to find new relevant subreddits.
 *
 * Schedule: Daily at 5:00 AM ET via cron-job.org hitting this endpoint.
 * Protected by CRON_SECRET bearer token.
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { requireCron } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-idempotency';
import { fetchRedditSignals } from '@/lib/demand/fetch-signals';

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // ── Auth ──
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  // ── Idempotency guard (prevent duplicate runs within 23h window) ──
  // staleThresholdMs=360_000 (6min) because maxDuration=300s, default 5min would false-expire live runs
  const lock = await acquireCronLock('demand-fetch', 23 * 60 * 60 * 1000, { staleThresholdMs: 360_000 });
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  // Return 200 immediately so cron-job.org (30s free-plan cap) doesn't
  // report a false timeout. The actual work runs post-response via after().
  after(async () => {
    const supabase = createAdminClient();
    try {
      await fetchRedditSignals(supabase);
      await releaseCronLock(lock.executionId, 'completed');
    } catch (err) {
      console.error('[Cron/demand-fetch] Unexpected error:', err);
      await releaseCronLock(lock.executionId, 'failed');
    }
  });

  return NextResponse.json({ status: 'started', executionId: lock.executionId });
}
