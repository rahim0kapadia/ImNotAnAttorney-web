// Template: scripts/ingest/__tests__/scrape-tnbar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — self-contained unit test, no DB/network
// test-isolation-na: read-only unit tests; no Supabase writes
//
// Run: node --test scripts/ingest/__tests__/scrape-labar-discipline.test.mjs
//
// Anti-TN-bug guard: fixtures lifted directly from live HTML 2026-04-26,
// then cross-checked against the parsed dry-run output (Charles, Hatch,
// Fewell, Burns matched live source).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseDate,
  parseLaName,
  toTitleCase,
  syntheticBarNumber,
  extractRows,
} from '../scrape-labar-discipline.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = fs.readFileSync(
  path.join(__dirname, '..', '__fixtures__', 'la-sample.html'),
  'utf8',
);

describe('labar — parseDate', () => {
  it('M/D/YYYY → YYYY-MM-DD', () => {
    assert.equal(parseDate('04/21/2026'), '2026-04-21');
    assert.equal(parseDate('1/9/2024'),   '2024-01-09');
  });
  it('rejects bad input', () => {
    assert.equal(parseDate(''), null);
    assert.equal(parseDate('not a date'), null);
  });
});

describe('labar — toTitleCase', () => {
  it('lowercases all-caps words', () => {
    assert.equal(toTitleCase('CHARLES'), 'Charles');
    assert.equal(toTitleCase('MICHELLE ANDRICA CHARLES'), 'Michelle Andrica Charles');
  });
  it('preserves roman-numeral suffixes', () => {
    assert.equal(toTitleCase('FONTANA III'), 'Fontana III');
  });
  it('preserves single-letter initials', () => {
    assert.equal(toTitleCase('G. KARL BERNARD'), 'G. Karl Bernard');
  });
});

describe('labar — parseLaName', () => {
  it('all-caps "LAST, FIRST" → "First Last"', () => {
    assert.equal(parseLaName('CHARLES, MICHELLE ANDRICA'), 'Michelle Andrica Charles');
  });
  it('handles "FEWELL, RICHARD L., JR." → "Richard L. Fewell Jr."', () => {
    assert.equal(parseLaName('FEWELL, RICHARD L., JR.'), 'Richard L. Fewell Jr.');
  });
  it('handles "BURNS, LIONEL JR." (no comma before Jr.) → "Lionel Burns Jr."', () => {
    assert.equal(parseLaName('BURNS, LIONEL JR.'), 'Lionel Burns Jr.');
  });
  it('returns null on input without comma', () => {
    assert.equal(parseLaName('NO COMMA HERE'), null);
  });
});

describe('labar — syntheticBarNumber', () => {
  it('is deterministic + LA-prefixed', () => {
    const a = syntheticBarNumber('Michelle Andrica Charles', '2026-04-21');
    const b = syntheticBarNumber('Michelle Andrica Charles', '2026-04-21');
    assert.equal(a, b);
    assert.match(a, /^LA:[0-9a-f]{8}$/);
  });
});

describe('labar — extractRows (live-validated fixture)', () => {
  const records = extractRows(FIXTURE);

  it('parses entries from all three panels (SC + BD + HC)', () => {
    // Fixture: 4 SC + 1 BD + 1 HC = 6 rows
    assert.equal(records.length, 6);
  });
  it('first SC row matches live-source values', () => {
    const r = records[0];
    assert.equal(r.full_name, 'Michelle Andrica Charles');
    assert.equal(r.order_date, '2026-04-21');
    assert.equal(r.source_url, 'https://www.ladb.org/DR/');
    assert.equal(r.order_url, 'https://www.ladb.org/handler.document.aspx?DocID=10399');
    assert.match(r.discipline_raw, /Supreme Court: 2026-B-00336/);
  });
  it('Disciplinary Board panel rows are tagged correctly', () => {
    const bd = records.find((r) => r.discipline_raw.startsWith('Disciplinary Board'));
    assert.ok(bd, 'expected to find Disciplinary Board row');
    assert.equal(bd.full_name, 'Daniel B. Barzare');
  });
  it('Hearing Committee panel rows are tagged correctly', () => {
    const hc = records.find((r) => r.discipline_raw.startsWith('Hearing Committee'));
    assert.ok(hc, 'expected to find Hearing Committee row');
    assert.equal(hc.full_name, 'Gregory Joseph St. Angelo');
  });
  it('every record has HTTPS source_url + order_url', () => {
    for (const r of records) {
      assert.ok(r.source_url.startsWith('https://'), `non-HTTPS source: ${r.source_url}`);
      assert.ok(r.order_url.startsWith('https://'), `non-HTTPS order: ${r.order_url}`);
    }
  });
});
