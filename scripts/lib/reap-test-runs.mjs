#!/usr/bin/env node
/**
 * scripts/lib/reap-test-runs.mjs
 *
 * Storage gardener for test_run_id-marked rows. Reads marker files from
 * the OS temp directory (written by `newTestRunId` at call-time, so
 * SIGKILL-stranded runs still leave a marker behind), issues a DELETE
 * against each listed table where `test_run_id = $1`, and unlinks the
 * marker on success.
 *
 * Safety rules (Leach-cited):
 *   - NEVER runs against NODE_ENV=production or hostnames containing
 *     "production". Same guard as the helper.
 *   - Marker files younger than 60s are skipped — avoids racing a live
 *     test that wrote the marker but has not yet used it.
 *   - Marker files older than 30 days are unlinked WITHOUT DELETE
 *     (assumed pre-schema or already reaped).
 *   - Credentials live only in .env.local. The marker format carries
 *     zero secrets; see test-db.mjs.
 *
 * Plan: docs/plans/2026-04-24-worry-test-pollution-cv.md (T1a).
 * Rule:  ~/.claude/rules/drafts/test-isolation.md.
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MARKER_DIR = path.join(os.tmpdir(), 'claude-test-runs');
const MIN_AGE_MS = 60 * 1000;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// Ordered list mirrors the T0 migration. Tables with FKs to other
// in-scope tables are deleted AFTER their dependents so DELETE does not
// trip foreign-key cascade ambiguity.
const IN_SCOPE_TABLES = [
  'drip_emails',
  'case_findings',
  'processing_jobs',
  'operator_tasks',
  'intakes',
  'subscribers',
  'cases',
  'orders',
];

function loadDbUrl() {
  const envPath = path.resolve(__dirname, '..', '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('reap-test-runs.mjs: missing .env.local at ' + envPath);
  }
  const envFile = fs.readFileSync(envPath, 'utf8');
  for (const line of envFile.split('\n')) {
    if (line.startsWith('SUPABASE_DB_URL=')) {
      return line.slice(line.indexOf('=') + 1).trim();
    }
  }
  throw new Error('reap-test-runs.mjs: SUPABASE_DB_URL not found in .env.local');
}

function rewriteToSessionPort(urlStr) {
  const u = new URL(urlStr);
  u.port = '5432';
  return u.toString();
}

function assertNotProduction(urlStr) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('reap-test-runs.mjs: refuses NODE_ENV=production');
  }
  const host = String(new URL(urlStr).hostname || '').toLowerCase();
  if (host.indexOf('production') !== -1) {
    throw new Error(
      'reap-test-runs.mjs: refuses hostname containing "production": ' + host
    );
  }
}

function readMarker(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isUuid(s) {
  return (
    typeof s === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}

async function reapOne(client, runId, tables) {
  let totalDeleted = 0;
  // Intersect requested tables with the allowlist to refuse any
  // unexpected table name that sneaked into a tampered marker file.
  const targets = IN_SCOPE_TABLES.filter((t) => tables.includes(t));
  // If marker lists no tables, fall back to allowlist (legacy pre-plan callers).
  const effective = targets.length ? targets : IN_SCOPE_TABLES;
  for (const tbl of effective) {
    // Safe: `tbl` is a literal from the hard-coded allowlist above.
    const sql = 'DELETE FROM ' + tbl + ' WHERE test_run_id = $1';
    const res = await client.query(sql, [runId]);
    totalDeleted += res.rowCount || 0;
  }
  return totalDeleted;
}

async function main() {
  const raw = loadDbUrl();
  assertNotProduction(raw);
  const connectionString = rewriteToSessionPort(raw);

  if (!fs.existsSync(MARKER_DIR)) {
    process.stdout.write('reap-test-runs.mjs: no marker directory, nothing to do\n');
    return 0;
  }

  const now = Date.now();
  const entries = fs
    .readdirSync(MARKER_DIR)
    .filter((n) => n.endsWith('.json'))
    .map((n) => ({ name: n, full: path.join(MARKER_DIR, n) }));

  if (!entries.length) {
    process.stdout.write('reap-test-runs.mjs: no markers, nothing to do\n');
    return 0;
  }

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    application_name: 'inaa-reap-test-runs',
    port: 5432,
  });
  await client.connect();

  let reaped = 0;
  let skippedYoung = 0;
  let expiredUnlinked = 0;
  let failures = 0;

  try {
    for (const entry of entries) {
      let stat;
      try { stat = fs.statSync(entry.full); } catch { continue; }
      const age = now - stat.mtimeMs;
      if (age < MIN_AGE_MS) { skippedYoung += 1; continue; }
      if (age > MAX_AGE_MS) {
        try { fs.unlinkSync(entry.full); expiredUnlinked += 1; } catch {}
        continue;
      }
      const marker = readMarker(entry.full);
      if (!marker || !isUuid(marker.test_run_id)) {
        // Malformed marker — unlink (can't reap something we can't parse).
        try { fs.unlinkSync(entry.full); } catch {}
        continue;
      }
      try {
        const n = await reapOne(
          client,
          marker.test_run_id,
          Array.isArray(marker.tables) ? marker.tables : []
        );
        reaped += n;
        try { fs.unlinkSync(entry.full); } catch {}
      } catch (e) {
        failures += 1;
        process.stderr.write(
          'reap-test-runs.mjs: DELETE failed for ' +
          marker.test_run_id + ': ' + e.message + '\n'
        );
      }
    }
  } finally {
    try { await client.end(); } catch {}
  }

  process.stdout.write(
    'reap-test-runs.mjs: rows=' + reaped +
    ' skipped_young=' + skippedYoung +
    ' expired_unlinked=' + expiredUnlinked +
    ' failures=' + failures + '\n'
  );
  return failures > 0 ? 1 : 0;
}

// Only run when invoked as CLI, not when imported.
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      process.stderr.write('reap-test-runs.mjs: fatal: ' + e.message + '\n');
      process.exit(1);
    });
}
