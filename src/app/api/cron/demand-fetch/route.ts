/**
 * @file /api/cron/demand-fetch — Daily Reddit signal ingestion
 *
 * Fetches criminal defense posts from Reddit, classifies them by charge type,
 * urgency, price sensitivity, and geography, then upserts to reddit_signals.
 *
 * Also runs weekly subreddit discovery (Sundays) to find new relevant subreddits.
 *
 * Schedule: Daily at 5:00 AM ET via cron-job.org hitting this endpoint.
 * Protected by CRON_SECRET bearer token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-idempotency';
import { fetchRedditSignals } from '@/lib/demand/fetch-signals';

export async function GET(req: NextRequest) {
  // ── Auth ──
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  // ── Idempotency guard (prevent duplicate runs within 23h window) ──
  const lock = await acquireCronLock('demand-fetch', 23 * 60 * 60 * 1000);
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  const supabase = createAdminClient();

  try {
    const result = await fetchRedditSignals(supabase);

    await releaseCronLock(lock.executionId, 'completed');
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Cron/demand-fetch] Unexpected error:', err);
    await releaseCronLock(lock.executionId, 'failed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
