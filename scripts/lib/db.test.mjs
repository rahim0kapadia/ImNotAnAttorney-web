/**
 * scripts/lib/db.test.mjs
 *
 * Verifies that the shared Postgres client in db.mjs is constructed
 * with TCP keepalive options enabled, so long-running bulk extractions
 * (e.g. bulk-extract-charge-types.mjs streaming the 45GB criminal
 * opinions CSV) survive idle periods without the connection being
 * silently dropped by Supavisor / NATs / corporate firewalls.
 *
 * TICKET-6: keepalive defense for bulk pipelines.
 *
 * No DB connection is opened — we read the source file and assert the
 * constructor options are present. Per project rule "No regex on file
 * contents", we use string includes / split-based scanning.
 *
 * Run: `npm test -- --run db`
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_MJS_PATH = path.resolve(__dirname, 'db.mjs');

describe('scripts/lib/db.mjs — pg client construction', () => {
  const source = fs.readFileSync(DB_MJS_PATH, 'utf8');

  it('passes keepAlive: true to the pg.Client constructor', () => {
    expect(source.includes('keepAlive: true')).toBe(true);
  });

  it('sets keepAliveInitialDelayMillis to a positive integer', () => {
    expect(source.includes('keepAliveInitialDelayMillis')).toBe(true);

    // Locate the option, then validate the literal that follows is a
    // positive integer (no regex — split + token scan).
    const key = 'keepAliveInitialDelayMillis:';
    const idx = source.indexOf(key);
    expect(idx).toBeGreaterThan(-1);

    const tail = source.slice(idx + key.length).trimStart();
    // Read digits until a non-digit (comma / whitespace).
    let i = 0;
    while (i < tail.length && tail.charCodeAt(i) >= 48 && tail.charCodeAt(i) <= 57) i++;
    const numStr = tail.slice(0, i);
    expect(numStr.length).toBeGreaterThan(0);
    const value = Number(numStr);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
  });

  it('keepalive options are inside the pg.Client constructor block', () => {
    // Both options must appear AFTER `new pg.Client({` and BEFORE the
    // matching `});` so they actually get passed to the driver.
    const ctorStart = source.indexOf('new pg.Client({');
    expect(ctorStart).toBeGreaterThan(-1);

    const ctorTail = source.slice(ctorStart);
    const ctorEnd = ctorTail.indexOf('});');
    expect(ctorEnd).toBeGreaterThan(-1);

    const ctorBlock = ctorTail.slice(0, ctorEnd);
    expect(ctorBlock.includes('keepAlive: true')).toBe(true);
    expect(ctorBlock.includes('keepAliveInitialDelayMillis')).toBe(true);
  });
});
