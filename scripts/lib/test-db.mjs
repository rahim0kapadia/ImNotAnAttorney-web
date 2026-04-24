/**
 * scripts/lib/test-db.mjs
 *
 * Transactional test-fixture helper. The Brandur Leach pattern:
 *   1. Every test opens its own BEGIN, does all DB work inside it,
 *      ROLLBACKs on finally. The rollback IS the cleanup.
 *   2. Never mocks the DB. Hits real Supabase via raw pg.Client.
 *   3. Factories are parameter-only (randomUUID defaults + safe overrides).
 *   4. No @supabase/supabase-js import here — the JS client is HTTP /
 *      PostgREST and cannot participate in a pg-side BEGIN / ROLLBACK.
 *
 * Cited expert: ~/.claude/experts/brandur-leach.md.
 * Plan: docs/plans/2026-04-24-worry-test-pollution-cv.md (T1, T1a).
 * Companion: scripts/lib/reap-test-runs.mjs (storage gardener for
 * marker-path writes that happen through out-of-transaction paths).
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- Config + safety guards -----------------------------------------

// Per-user marker directory. os.tmpdir() alone is world-readable on many
// POSIX systems; adding the username scopes markers per-user. Windows
// ignores mode bits but its %TEMP% is per-user by default, so the
// namespacing also makes cross-user collisions impossible on CI hosts.
function userName() {
  try { return os.userInfo().username || 'unknown'; } catch { return 'unknown'; }
}
const MARKER_DIR = path.join(os.tmpdir(), 'claude-test-runs-' + userName());

function loadDbUrl() {
  const envPath = path.resolve(__dirname, '..', '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('test-db.mjs: missing .env.local at ' + envPath);
  }
  const envFile = fs.readFileSync(envPath, 'utf8');
  for (const line of envFile.split('\n')) {
    if (line.startsWith('SUPABASE_DB_URL=')) {
      return line.slice(line.indexOf('=') + 1).trim();
    }
  }
  throw new Error('test-db.mjs: SUPABASE_DB_URL not found in .env.local');
}

function rewriteToSessionPort(urlStr) {
  const u = new URL(urlStr);
  u.port = '5432';
  return u.toString();
}

// Allowlist of test-database project refs. Supabase project hostnames are
// opaque (for example `jxjbjmgdukwkoclydqdr.supabase.co`) and never contain
// the literal substring `production`, so a substring-match guard would
// silently pass even when pointed at a real customer database. Instead:
//   - If SUPABASE_TEST_DB_PROJECT_REFS is set (comma-separated allowlist),
//     refuse any URL whose hostname prefix is NOT in the list.
//   - Else fall back to the substring-match defense (intent signal only).
//   - Always refuse NODE_ENV=production.
function assertNotProduction(urlStr) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'test-db.mjs refuses to run when NODE_ENV=production. This helper ' +
      'performs BEGIN / ROLLBACK against a live database and is for test ' +
      'fixtures only.'
    );
  }
  const host = String(new URL(urlStr).hostname || '').toLowerCase();

  const allowlistRaw = process.env.SUPABASE_TEST_DB_PROJECT_REFS;
  if (allowlistRaw) {
    const allowed = allowlistRaw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const prefix = host.split('.')[0];
    if (!allowed.includes(prefix)) {
      throw new Error(
        'test-db.mjs refuses to connect: host prefix "' + prefix + '" is ' +
        'not in SUPABASE_TEST_DB_PROJECT_REFS allowlist [' +
        allowed.join(', ') + ']. ' +
        'Set SUPABASE_TEST_DB_PROJECT_REFS in .env.local to enable.'
      );
    }
    return;
  }

  if (host.indexOf('production') !== -1) {
    throw new Error(
      'test-db.mjs refuses to connect to a hostname containing "production": ' +
      host
    );
  }
}

// ---------- withTestTx ------------------------------------------------------

/**
 * Run `fn(tx)` inside a BEGIN / ROLLBACK envelope. A fresh pg.Client is
 * opened per invocation (no singleton) so parallel callers never share
 * a backend connection. The transaction is ALWAYS rolled back, success
 * or failure. Triggers are suppressed via SET LOCAL so that route-side
 * effects that fire via a separate connection (Edge Function webhooks,
 * drip_emails triggers, etc.) do not commit out-of-band.
 */
export async function withTestTx(fn) {
  const raw = loadDbUrl();
  assertNotProduction(raw);
  const connectionString = rewriteToSessionPort(raw);

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    application_name: 'inaa-test-db',
    // port: 5432 is set via connectionString rewrite above; explicit marker
    // for grep-based verification (SC #6).
    port: 5432,
  });

  await client.connect();
  try {
    await client.query('BEGIN');
    // `SET LOCAL session_replication_role = replica` requires SUPERUSER or
    // REPLICATION role. On Supabase the default `postgres` role typically
    // has it, but a misconfigured connection string (for example the
    // anon role) will hit `permission denied`. Degrade gracefully: same-
    // connection triggers still get rolled back with the tx; only
    // cross-connection Edge Function webhooks would fire out-of-band,
    // which is also the reason the marker-path exists in T4.
    try {
      await client.query("SET LOCAL session_replication_role = replica");
    } catch (e) {
      process.stderr.write(
        'test-db.mjs: SET LOCAL session_replication_role denied ' +
        '(' + (e.code || e.message) + '); proceeding without trigger ' +
        'suppression. Same-connection triggers still rollback with the tx.\n'
      );
    }
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '5s'");
    try {
      return await fn(client);
    } finally {
      try { await client.query('ROLLBACK'); } catch { /* swallow */ }
    }
  } finally {
    try { await client.end(); } catch { /* swallow */ }
  }
}

// ---------- newTestRunId + marker file --------------------------------------

/**
 * Allocate a run id and write a marker file so the reaper can clean up
 * non-transactional residue if the process dies before natural exit.
 * Written at call time (NOT at process exit) so SIGKILL still leaves
 * the marker on disk.
 *
 * Marker payload is EXACTLY three fields: run id, tables list,
 * created_at timestamp. Zero credentials. Zero environment. The reaper
 * reads its own credentials from .env.local.
 */
export function newTestRunId(tables = []) {
  const id = crypto.randomUUID();
  const marker = {
    test_run_id: id,
    tables: Array.isArray(tables) ? tables.slice() : [],
    created_at: new Date().toISOString(),
  };
  try {
    fs.mkdirSync(MARKER_DIR, { recursive: true, mode: 0o700 });
    const filePath = path.join(MARKER_DIR, id + '.json');
    fs.writeFileSync(filePath, JSON.stringify(marker), { mode: 0o600 });
  } catch (e) {
    // Marker is best-effort. The reaper runs on cadence; if the marker
    // failed to write, a single test run's residue will still be
    // filtered out by CV probes via test_run_id.is.null. Log and continue.
    process.stderr.write(
      'test-db.mjs: failed to write marker for ' + id + ': ' + e.message + '\n'
    );
  }
  return id;
}

/**
 * Unlink this run id's marker file on clean exit. The reaper handles
 * SIGKILL-stranded markers on cadence.
 */
export function clearTestRunMarker(id) {
  if (!id) return;
  try {
    fs.unlinkSync(path.join(MARKER_DIR, id + '.json'));
  } catch { /* already gone, fine */ }
}

// ---------- Factories -------------------------------------------------------

function defaultEmail(slug) {
  return 'test-' + slug + '-' + crypto.randomUUID() + '@example.com';
}

/**
 * Insert an `orders` row inside `tx`. Defaults use randomUUID for every
 * unique-indexed column so parallel callers never collide. Overrides
 * spread after defaults.
 */
export async function createTestOrder(tx, overrides = {}) {
  const row = {
    id: crypto.randomUUID(),
    email: defaultEmail('order'),
    tier: 'case-decoder',
    amount: 19700,
    status: 'pending',
    product_type: 'service',
    stripe_session_id: 'test_sess_' + crypto.randomUUID(),
    ...overrides,
  };
  const cols = Object.keys(row);
  const placeholders = cols.map((_, i) => '$' + (i + 1)).join(', ');
  const sql =
    'INSERT INTO orders (' + cols.map((c) => '"' + c + '"').join(', ') + ') ' +
    'VALUES (' + placeholders + ') RETURNING *';
  const { rows } = await tx.query(sql, cols.map((c) => row[c]));
  return rows[0];
}

/**
 * Insert a `cases` row. `order_id` is required (FK).
 */
export async function createTestCase(tx, overrides = {}) {
  if (!overrides.order_id) {
    throw new Error('createTestCase: overrides.order_id is required');
  }
  const row = {
    id: crypto.randomUUID(),
    email: defaultEmail('case'),
    tier: 'case-decoder',
    status: 'intake',
    ...overrides,
  };
  const cols = Object.keys(row);
  const placeholders = cols.map((_, i) => '$' + (i + 1)).join(', ');
  const sql =
    'INSERT INTO cases (' + cols.map((c) => '"' + c + '"').join(', ') + ') ' +
    'VALUES (' + placeholders + ') RETURNING *';
  const { rows } = await tx.query(sql, cols.map((c) => row[c]));
  return rows[0];
}

/**
 * Insert an `intakes` row.
 */
export async function createTestIntake(tx, overrides = {}) {
  const row = {
    id: crypto.randomUUID(),
    first_name: 'Test',
    email: defaultEmail('intake'),
    charge_type: 'dui',
    ...overrides,
  };
  const cols = Object.keys(row);
  const placeholders = cols.map((_, i) => '$' + (i + 1)).join(', ');
  const sql =
    'INSERT INTO intakes (' + cols.map((c) => '"' + c + '"').join(', ') + ') ' +
    'VALUES (' + placeholders + ') RETURNING *';
  const { rows } = await tx.query(sql, cols.map((c) => row[c]));
  return rows[0];
}

/**
 * Insert a `subscribers` row.
 */
export async function createTestSubscriber(tx, overrides = {}) {
  const row = {
    id: crypto.randomUUID(),
    email: defaultEmail('sub'),
    source: 'test',
    ...overrides,
  };
  const cols = Object.keys(row);
  const placeholders = cols.map((_, i) => '$' + (i + 1)).join(', ');
  const sql =
    'INSERT INTO subscribers (' + cols.map((c) => '"' + c + '"').join(', ') + ') ' +
    'VALUES (' + placeholders + ') RETURNING *';
  const { rows } = await tx.query(sql, cols.map((c) => row[c]));
  return rows[0];
}

/**
 * Insert a `drip_emails` row.
 */
export async function createTestDripEmail(tx, overrides = {}) {
  const row = {
    id: crypto.randomUUID(),
    email: defaultEmail('drip'),
    sequence_id: 'test-sequence',
    step: 0,
    ...overrides,
  };
  const cols = Object.keys(row);
  const placeholders = cols.map((_, i) => '$' + (i + 1)).join(', ');
  const sql =
    'INSERT INTO drip_emails (' + cols.map((c) => '"' + c + '"').join(', ') + ') ' +
    'VALUES (' + placeholders + ') RETURNING *';
  const { rows } = await tx.query(sql, cols.map((c) => row[c]));
  return rows[0];
}

// ---------- Module-load self-test -------------------------------------------
// Only runs when the module is executed directly (node scripts/lib/test-db.mjs)
// so importing it in a test file does not force a DB round-trip. The companion
// `test-db.test.mjs` covers the rollback-behavior assertions.

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  (async () => {
    process.stderr.write('test-db.mjs: self-test starting\n');
    await withTestTx(async (tx) => {
      await tx.query('CREATE TEMP TABLE _tdb_selftest (id uuid PRIMARY KEY)');
      const id = crypto.randomUUID();
      await tx.query('INSERT INTO _tdb_selftest (id) VALUES ($1)', [id]);
      const { rows } = await tx.query(
        'SELECT id FROM _tdb_selftest WHERE id = $1',
        [id]
      );
      if (rows.length !== 1) {
        throw new Error('self-test: expected 1 row, got ' + rows.length);
      }
    });
    process.stderr.write('test-db.mjs: self-test OK\n');
  })().catch((e) => {
    process.stderr.write('test-db.mjs: self-test FAILED: ' + e.message + '\n');
    process.exit(1);
  });
}
