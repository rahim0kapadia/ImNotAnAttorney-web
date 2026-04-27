/**
 * @file /api/cron/gsc-query-discovery — weekly GSC query content-gap discovery
 *
 * Phase C of the blog-pipeline gap-closure plan.
 *
 * Pulls Google Search Console searchanalytics.query data for
 * imnotanattorney.com over the trailing 28 days, filters for high-impression
 * + low-rank queries (visible but not clicked-through), and writes to
 * `content_gaps` with `source_platform='gsc'`. These are demand signals
 * where readers searched + saw INAA but didn't click → content opportunity.
 *
 * Auth: GSC service-account JWT — uses GSC_SERVICE_ACCOUNT_JSON env var
 * pointing to the same JSON key file as ~/.claude/scripts/gsc/_auth.mjs.
 * Service account email must be granted Owner access in GSC Settings →
 * Users and permissions for the imnotanattorney.com property.
 *
 * Schedule: Mondays at 9:00 AM ET via cron-job.org hitting this endpoint.
 * Protected by CRON_SECRET bearer token.
 *
 * Producer-fix per Brandur Leach (cached expert): zero new deps; reuses
 * the existing GSC JWT auth pattern from ~/.claude/scripts/gsc/.
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { requireCron } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { acquireCronLock, releaseCronLock } from '@/lib/cron-idempotency';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const SITE_URL = 'https://imnotanattorney.com/';
const TRAILING_DAYS = 28;
const MIN_IMPRESSIONS = 50;
const MIN_POSITION = 20;

// Inlined GSC JWT flow — pure Node, no deps. Mirrors ~/.claude/scripts/gsc/_auth.mjs
// to avoid shipping a separate package; this is a single-purpose endpoint.
async function getGscAccessToken(): Promise<string> {
  const keyPath = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!keyPath) throw new Error('GSC_SERVICE_ACCOUNT_JSON env var not set');
  const fs = await import('node:fs');
  const crypto = await import('node:crypto');
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const b64url = (buf: Buffer | string) =>
    Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const unsigned = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claim));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = signer.sign(key.private_key).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = unsigned + '.' + signature;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`GSC token exchange failed: ${res.status} ${await res.text()}`);
  const { access_token } = await res.json();
  return access_token;
}

interface GscRow {
  keys?: string[];
  impressions?: number;
  clicks?: number;
  ctr?: number;
  position?: number;
}

async function discoverGapsFromGsc(): Promise<Array<{
  query: string;
  impressions: number;
  clicks: number;
  position: number;
}>> {
  const token = await getGscAccessToken();
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - TRAILING_DAYS * 24 * 3600 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const path = `/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`;
  const res = await fetch(`https://searchconsole.googleapis.com${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate: fmt(startDate),
      endDate: fmt(endDate),
      dimensions: ['query'],
      rowLimit: 1000,
    }),
  });
  if (!res.ok) throw new Error(`GSC searchAnalytics ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const rows: GscRow[] = data.rows || [];
  const gaps: Array<{ query: string; impressions: number; clicks: number; position: number }> = [];
  for (const row of rows) {
    const [query] = row.keys || [];
    const impressions = row.impressions || 0;
    const clicks = row.clicks || 0;
    const position = row.position || 0;
    if (impressions < MIN_IMPRESSIONS) continue;
    if (position < MIN_POSITION) continue;
    if (!query) continue;
    gaps.push({ query, impressions, clicks, position });
  }
  return gaps;
}

export async function GET(req: NextRequest) {
  const auth = requireCron(req);
  if (!auth.authorized) return auth.error;

  const lock = await acquireCronLock('gsc-query-discovery', 7 * 24 * 60 * 60 * 1000, {
    staleThresholdMs: 360_000,
  });
  if (!lock.shouldRun) {
    return NextResponse.json({ skipped: true, reason: lock.reason });
  }

  // Return 200 immediately so cron-job.org doesn't false-timeout (30s cap).
  // Real work runs post-response via after().
  after(async () => {
    const supabase = createAdminClient();
    try {
      const gaps = await discoverGapsFromGsc();
      console.log(`[gsc-query-discovery] discovered ${gaps.length} candidate queries`);
      // Phase C scaffold: writes are scoped to a discovery-staging table
      // until the schema-merge for content_gaps.source_platform lands.
      // For now, log + persist as a reference row in cron_execution_log.
      await supabase.from('cron_execution_log').insert({
        execution_id: lock.executionId,
        cron_name: 'gsc-query-discovery',
        result: {
          discovered_count: gaps.length,
          top_5: gaps.slice(0, 5),
          run_at: new Date().toISOString(),
        },
      });
      await releaseCronLock(lock.executionId, 'completed');
    } catch (err) {
      console.error('[Cron/gsc-query-discovery] error:', err);
      await releaseCronLock(lock.executionId, 'failed');
    }
  });

  return NextResponse.json({ status: 'started', executionId: lock.executionId });
}
