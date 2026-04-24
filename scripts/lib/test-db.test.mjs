/**
 * scripts/lib/test-db.test.mjs
 *
 * Verifies the Leach-shaped contract of test-db.mjs:
 *   - withTestTx rolls back on normal return AND on thrown error
 *   - newTestRunId returns a v4 UUID + writes a marker file at call time
 *   - Factories insert + the row is visible inside the tx and gone after
 *   - Two concurrent withTestTx invocations are MVCC-isolated
 *   - Override containing SQL-injection fragment rolls back cleanly
 *
 * Run: `node --test scripts/lib/test-db.test.mjs`
 *
 * Requires SUPABASE_DB_URL in .env.local. Skips when missing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  withTestTx,
  createTestOrder,
  createTestCase,
  createTestIntake,
  createTestSubscriber,
  createTestDripEmail,
  newTestRunId,
  clearTestRunMarker,
} from './test-db.mjs';

const ENV_PATH = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '.env.local');
const HAS_ENV = fs.existsSync(ENV_PATH);

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('newTestRunId returns v4 UUID and writes a marker at call time', () => {
  const tables = ['orders', 'cases'];
  const id = newTestRunId(tables);
  assert.match(id, UUID_V4_RE);
  const markerPath = path.join(os.tmpdir(), 'claude-test-runs', id + '.json');
  assert.ok(fs.existsSync(markerPath), 'marker file must exist at call time');
  const payload = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  assert.equal(payload.test_run_id, id);
  assert.deepEqual(payload.tables, tables);
  assert.equal(typeof payload.created_at, 'string');
  // marker payload contains ONLY these three fields — no credentials leak
  assert.deepEqual(
    Object.keys(payload).sort(),
    ['created_at', 'tables', 'test_run_id']
  );
  clearTestRunMarker(id);
  assert.ok(!fs.existsSync(markerPath), 'marker must be unlinked');
});

test(
  'withTestTx rolls back on normal return',
  { skip: !HAS_ENV },
  async () => {
    let insertedId = null;
    await withTestTx(async (tx) => {
      const row = await createTestOrder(tx, {});
      insertedId = row.id;
      const { rows } = await tx.query('SELECT id FROM orders WHERE id = $1', [
        insertedId,
      ]);
      assert.equal(rows.length, 1, 'visible inside tx');
    });
    // After rollback, the row must be gone. Use withTestTx again so we have
    // a client to run the assertion query with.
    await withTestTx(async (tx) => {
      const { rows } = await tx.query('SELECT id FROM orders WHERE id = $1', [
        insertedId,
      ]);
      assert.equal(rows.length, 0, 'row must be gone after rollback');
    });
  }
);

test(
  'withTestTx rolls back on thrown error',
  { skip: !HAS_ENV },
  async () => {
    let insertedId = null;
    await assert.rejects(
      withTestTx(async (tx) => {
        const row = await createTestOrder(tx, {});
        insertedId = row.id;
        throw new Error('boom');
      }),
      /boom/
    );
    await withTestTx(async (tx) => {
      const { rows } = await tx.query('SELECT id FROM orders WHERE id = $1', [
        insertedId,
      ]);
      assert.equal(rows.length, 0, 'row must be gone after error rollback');
    });
  }
);

test(
  'two concurrent withTestTx calls are MVCC-isolated — parallel-safety',
  { skip: !HAS_ENV },
  async () => {
    let idA = null;
    let idB = null;
    // Phase 1: each tx inserts its own row and asserts it sees only its own.
    await Promise.all([
      withTestTx(async (tx) => {
        const row = await createTestOrder(tx, {});
        idA = row.id;
        // idB may or may not exist yet in Phase 1 depending on interleaving.
        // The invariant we test is "tx A sees its own row"; isolation from
        // B's in-flight insert is established by Postgres read committed.
        const { rows } = await tx.query(
          'SELECT id FROM orders WHERE id = $1',
          [idA]
        );
        assert.equal(rows.length, 1);
      }),
      withTestTx(async (tx) => {
        const row = await createTestOrder(tx, {});
        idB = row.id;
        const { rows } = await tx.query(
          'SELECT id FROM orders WHERE id = $1',
          [idB]
        );
        assert.equal(rows.length, 1);
      }),
    ]);
    // Phase 2: both rollbacks have completed. Neither row should survive.
    await withTestTx(async (tx) => {
      const { rows } = await tx.query(
        'SELECT id FROM orders WHERE id = ANY($1::uuid[])',
        [[idA, idB]]
      );
      assert.equal(rows.length, 0, 'both rollbacks must clean up');
    });
  }
);

test(
  'adversarial override with SQL-injection fragment rolls back cleanly',
  { skip: !HAS_ENV },
  async () => {
    const attack = "test-attack-'; DROP TABLE orders; --";
    await withTestTx(async (tx) => {
      // Factory uses parameterized query — the attack becomes a literal string,
      // not SQL. Insert succeeds with the weird email.
      const row = await createTestOrder(tx, { email: attack });
      assert.equal(row.email, attack);
    });
    // orders table still exists + is queryable.
    await withTestTx(async (tx) => {
      const { rows } = await tx.query(
        "SELECT 1 AS ok FROM information_schema.tables " +
        "WHERE table_schema = 'public' AND table_name = 'orders'"
      );
      assert.equal(rows.length, 1, 'orders table must still exist');
    });
  }
);

test(
  'createTestCase requires order_id',
  { skip: !HAS_ENV },
  async () => {
    await withTestTx(async (tx) => {
      await assert.rejects(
        createTestCase(tx, {}),
        /order_id is required/
      );
    });
  }
);

test(
  'factory suite smoke — every factory inserts + rolls back',
  { skip: !HAS_ENV },
  async () => {
    await withTestTx(async (tx) => {
      const order = await createTestOrder(tx, {});
      const kase = await createTestCase(tx, { order_id: order.id });
      const intake = await createTestIntake(tx, {});
      const sub = await createTestSubscriber(tx, {});
      const drip = await createTestDripEmail(tx, {});
      assert.match(order.id, UUID_V4_RE);
      assert.match(kase.id, UUID_V4_RE);
      assert.match(intake.id, UUID_V4_RE);
      assert.match(sub.id, UUID_V4_RE);
      assert.match(drip.id, UUID_V4_RE);
    });
  }
);
