/**
 * scripts/lib/pg-bulk-defaults.mjs
 *
 * Shared bulk-load client for Supabase-backed ingest scripts. Centralizes
 * the defensive session settings from `cl-bulk-data-defensive.md` (gotchas
 * #7, #14, #17, #18) so every loader script gets the same guarantees:
 *   - session-mode pooler port 5432 (multi-statement scripts safe)
 *   - work_mem / maintenance_work_mem tuned per tier (default Supabase Pro)
 *   - statement_timeout + idle_in_transaction_session_timeout bounded
 *   - tcp_keepalives configured so orphan backends self-terminate
 *   - COPY FROM STDIN helpers (`bulkCopyCsv`, `bulkCopyRows`) to replace
 *     per-row INSERT loops (rule #18 / hook enforcement).
 *
 * Environment:
 *   Reads SUPABASE_DB_URL from the caller project's .env.local. The
 *   connection string can point at either port 6543 (pooler txn mode) or
 *   port 5432 (session mode) — the helper rewrites to 5432 for safety.
 *
 * Usage:
 *   import { createBulkClient, bulkCopyCsv, bulkCopyRows } from './lib/pg-bulk-defaults.mjs';
 *   const { client, cleanup } = await createBulkClient();
 *   try { await bulkCopyCsv(client, 'my_table', ['a','b'], 'data.csv'); }
 *   finally { await cleanup(); }
 */

import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import fs from 'node:fs';
import pg from 'pg';
import { from as copyFrom } from 'pg-copy-streams';

function rewriteToSessionPort(urlStr) {
  try {
    const u = new URL(urlStr);
    u.port = '5432';
    return u.toString();
  } catch {
    return urlStr;
  }
}

export async function createBulkClient(opts = {}) {
  const {
    workMemMB = 256,
    maintWorkMemMB = 1024,
    statementTimeout = '30min',
    idleTxTimeout = '5min',
    connectionString = process.env.SUPABASE_DB_URL,
  } = opts;

  if (!connectionString) {
    throw new Error('createBulkClient: missing SUPABASE_DB_URL (pass connectionString or set env)');
  }

  const client = new pg.Client({
    connectionString: rewriteToSessionPort(connectionString),
    ssl: { rejectUnauthorized: false },
    application_name: 'inaa-bulk-loader',
  });

  await client.connect();

  await client.query(`SET work_mem = '${workMemMB}MB'`);
  await client.query(`SET maintenance_work_mem = '${maintWorkMemMB}MB'`);
  await client.query(`SET statement_timeout = '${statementTimeout}'`);
  await client.query(`SET idle_in_transaction_session_timeout = '${idleTxTimeout}'`);
  await client.query(`SET tcp_keepalives_idle = 60`);
  await client.query(`SET tcp_keepalives_interval = 10`);
  await client.query(`SET tcp_keepalives_count = 6`);

  return {
    client,
    cleanup: async () => {
      try { await client.end(); } catch {}
    },
  };
}

export async function bulkCopyCsv(client, table, columns, csvPath) {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`bulkCopyCsv: CSV not found: ${csvPath}`);
  }
  const colList = columns.map((c) => `"${c}"`).join(', ');
  const copySql = `COPY ${table} (${colList}) FROM STDIN WITH (FORMAT CSV, NULL '\\N', HEADER true)`;

  const started = Date.now();
  const pgStream = client.query(copyFrom(copySql));
  const fileStream = fs.createReadStream(csvPath);
  await pipeline(fileStream, pgStream);
  const durationMs = Date.now() - started;

  return { rowCount: pgStream.rowCount ?? null, durationMs };
}

function csvEscape(value) {
  if (value === null || value === undefined) return '\\N';
  if (typeof value === 'boolean') return value ? 't' : 'f';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '\\N';
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export async function bulkCopyRows(client, table, columns, rowsIterable) {
  const colList = columns.map((c) => `"${c}"`).join(', ');
  const copySql = `COPY ${table} (${colList}) FROM STDIN WITH (FORMAT CSV, NULL '\\N')`;

  const started = Date.now();
  const pgStream = client.query(copyFrom(copySql));

  async function* encode() {
    for await (const row of rowsIterable) {
      if (!Array.isArray(row) || row.length !== columns.length) {
        throw new Error(`bulkCopyRows: expected array of length ${columns.length}, got ${row && row.length}`);
      }
      yield row.map(csvEscape).join(',') + '\n';
    }
  }

  await pipeline(Readable.from(encode(), { objectMode: false }), pgStream);
  const durationMs = Date.now() - started;

  return { rowCount: pgStream.rowCount ?? null, durationMs };
}
