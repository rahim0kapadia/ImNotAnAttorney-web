#!/usr/bin/env node
/**
 * Refresh public.ussc_similar_cases_summary after a USSC load.
 *
 * Call after any USSC ingest or partial-column backfill. Takes ~30-90 sec.
 * Uses CONCURRENTLY so readers (the $297 product API) don't block.
 *
 * Uses session-mode port 5432 with defensive session settings from
 * cl-bulk-data-defensive.md #17 so orphaned backends self-terminate
 * if this script dies mid-refresh.
 */
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local' });

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error('Missing SUPABASE_DB_URL env var (load from .env.local)');
  process.exit(1);
}

// Force session-mode port 5432 — a 90s REFRESH would hit 6543's 2-min timeout
const u = new URL(DB_URL);
u.port = '5432';

const client = new pg.Client({ connectionString: u.toString() });

async function main() {
  await client.connect();
  await client.query(`SET statement_timeout = '10min'`);
  await client.query(`SET idle_in_transaction_session_timeout = '5min'`);
  await client.query(`SET tcp_keepalives_idle = 60`);
  await client.query(`SET tcp_keepalives_interval = 10`);
  await client.query(`SET tcp_keepalives_count = 6`);

  console.log('[refresh-matview] starting REFRESH CONCURRENTLY...');
  const t0 = Date.now();
  await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY public.ussc_similar_cases_summary`);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[refresh-matview] done in ${dt}s`);

  const { rows } = await client.query(
    `SELECT COUNT(*) AS buckets, SUM(n_cases)::bigint AS total_cases,
            MIN(earliest_fy) AS earliest, MAX(latest_fy) AS latest
     FROM public.ussc_similar_cases_summary`
  );
  console.log('[refresh-matview] current state:', rows[0]);
}

main()
  .catch((err) => {
    console.error('[refresh-matview] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await client.end();
    } catch {
      // already closed
    }
  });
