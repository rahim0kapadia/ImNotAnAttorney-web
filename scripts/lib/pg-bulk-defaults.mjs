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

/**
 * Tier-safe session-memory ceilings (cl-bulk-data-defensive.md gotcha #7).
 *
 * 2026-04-19 incident: setting memory '2GB' on Supabase Micro (1 GB RAM)
 * triggered 53100 could not resize shared memory segment, killed the DB,
 * required dashboard restart. Defensive rule: session memory ≤ RAM / 16
 * (ratio 16), maintenance session memory ≤ RAM / 4 (ratio 4), each capped
 * to a practical ceiling where more RAM stops helping plan shape.
 *
 * Expert: Lukas Fittl (~/.claude/experts/lukas-fittl.md) — "work_mem above
 * 2GB rarely helps; plan shape dominates."
 */
const TIER_RAM_GB = {
  nano: 0.5, micro: 1, small: 2, medium: 4, large: 8,
  xlarge: 16, '2xlarge': 32, '4xlarge': 64, '8xlarge': 128,
  '12xlarge': 192, '16xlarge': 256,
};
const SESSION_MEM_RATIO = 16;
const MAINT_MEM_RATIO = 4;
const SESSION_MEM_HARD_CAP_MB = 1024;   // practical ceiling; large tiers clamp here
const MAINT_MEM_HARD_CAP_MB = 4096;

function tierCeilings(tierKey) {
  const gb = TIER_RAM_GB[tierKey];
  if (gb == null) return null;
  return {
    ramGB: gb,
    workMemMB: Math.min(Math.floor((gb * 1024) / SESSION_MEM_RATIO), SESSION_MEM_HARD_CAP_MB),
    maintWorkMemMB: Math.min(Math.floor((gb * 1024) / MAINT_MEM_RATIO), MAINT_MEM_HARD_CAP_MB),
  };
}

/**
 * Resolve the active compute tier.
 *
 * Priority: opts.tier > SUPABASE_COMPUTE_TIER env > conservative `small`
 * fallback (2 GB RAM — safe on every production tier ≥ Small).
 *
 * Accepts both short form (`xlarge`) and the Management-API variant id
 * (`ci_xlarge`). Unknown tier → fallback to `small` with a stderr warning,
 * so a typo never silently over-allocates memory.
 */
function resolveTier(raw) {
  if (!raw) return 'small';
  const n = String(raw).trim().toLowerCase().replace(/^ci_/, '');
  if (!TIER_RAM_GB[n]) {
    process.stderr.write(`[pg-bulk-defaults] unknown tier "${raw}" — falling back to small (2 GB RAM). Valid: ${Object.keys(TIER_RAM_GB).join(', ')}\n`);
    return 'small';
  }
  return n;
}

/**
 * Open a pg.Client tuned for bulk operations.
 *
 * Session parameters are batched into a single simple-query round trip
 * (code-review finding #15 — Supabase runs in us-west-2, so individual
 * SET statements cost ~150ms each from Windows; batching saves ~1s of
 * startup latency).
 *
 * Defaults are tier-safe per cl-bulk-data-defensive.md gotcha #7. If the
 * caller does not pass explicit `workMemMB` / `maintWorkMemMB`, they are
 * resolved from the compute tier (opts.tier → SUPABASE_COMPUTE_TIER env →
 * `small`). Pass explicit values only when the workload NEEDS them AND the
 * tier has been verified — the edit-time hook blocks raw SET overrides
 * above the logged ceiling.
 */
export async function createBulkClient(opts = {}) {
  const tierKey = resolveTier(opts.tier ?? process.env.SUPABASE_COMPUTE_TIER);
  const tier = tierCeilings(tierKey);
  const {
    workMemMB = tier.workMemMB,
    maintWorkMemMB = tier.maintWorkMemMB,
    statementTimeout = '30min',
    idleTxTimeout = '5min',
    connectionString = process.env.SUPABASE_DB_URL,
  } = opts;

  if (!connectionString) {
    throw new Error('createBulkClient: missing SUPABASE_DB_URL (pass connectionString or set env)');
  }

  if (workMemMB > tier.workMemMB) {
    throw new Error(`createBulkClient: workMemMB=${workMemMB} exceeds ${tierKey} tier ceiling ${tier.workMemMB}MB (RAM/${SESSION_MEM_RATIO}). See cl-bulk-data-defensive.md gotcha #7.`);
  }
  if (maintWorkMemMB > tier.maintWorkMemMB) {
    throw new Error(`createBulkClient: maintWorkMemMB=${maintWorkMemMB} exceeds ${tierKey} tier ceiling ${tier.maintWorkMemMB}MB (RAM/${MAINT_MEM_RATIO}). See cl-bulk-data-defensive.md gotcha #7.`);
  }

  const client = new pg.Client({
    connectionString: rewriteToSessionPort(connectionString),
    // Supabase's pooler uses a cert chain that Node's default CA bundle
    // accepts, but `db.<ref>.supabase.co:5432` direct-host sessions can
    // present a cert that trips `self-signed certificate in certificate
    // chain` on some Node builds. Matches the repo-wide convention from
    // scripts/lib/db.mjs + every CL-bulk loader. The connection is still
    // TLS-encrypted — this only disables chain verification.
    ssl: { rejectUnauthorized: false },
    application_name: 'inaa-bulk-loader',
  });

  await client.connect();

  const settings = [
    `SET work_mem = '${workMemMB}MB'`,
    `SET maintenance_work_mem = '${maintWorkMemMB}MB'`,
    `SET statement_timeout = '${statementTimeout}'`,
    `SET idle_in_transaction_session_timeout = '${idleTxTimeout}'`,
    `SET tcp_keepalives_idle = 60`,
    `SET tcp_keepalives_interval = 10`,
    `SET tcp_keepalives_count = 6`,
  ];
  await client.query(settings.join('; '));

  return {
    client,
    cleanup: async () => {
      try { await client.end(); } catch {}
    },
  };
}

/**
 * Stream a CSV file to COPY FROM STDIN.
 *
 * Note: NULL marker '\\N' is the repo-wide convention. Caller-provided CSVs
 * (Marshall, USSC subsets) use empty-string-as-null and never contain literal
 * `\N` text, so this is safe.
 *
 * Returns { rowCount, durationMs }.
 */
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

const NUL = String.fromCharCode(0);
const NUL_RE = new RegExp(NUL, 'g');

function csvEscape(value) {
  if (value === null || value === undefined) return '\\N';
  if (typeof value === 'boolean') return value ? 't' : 'f';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '\\N';
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  let s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Postgres COPY rejects NULL bytes in text columns:
  //   "invalid byte sequence for encoding UTF8: 0x00"
  // Oyez OCR text occasionally contains them — strip before encoding.
  if (s.indexOf(NUL) !== -1) s = s.replace(NUL_RE, '');
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Stream an async iterable of row-arrays to COPY FROM STDIN.
 *
 *   await bulkCopyRows(client, 'my_table', ['a','b','c'], async function*() {
 *     for (const r of source) yield [r.a, r.b, r.c];
 *   }());
 *
 * Returns { rowCount, durationMs }.
 */
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

// Exported for unit testing only.
export const _internals = { csvEscape };
