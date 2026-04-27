// Template: scripts/ingest/__tests__/scrape-tnbar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — self-contained unit test, no DB/network
// test-isolation-na: read-only unit tests; no Supabase writes
//
// Run: node --test scripts/ingest/__tests__/scrape-wibar-discipline.test.mjs
//
// Anti-TN-bug guard: fixtures are real <tr>...</tr> blocks lifted directly
// from a live fetch on 2026-04-26 (HTTPS curl with browser UA), then
// hand-validated against actual visible page entries.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseSortDate,
  parseWiName,
  syntheticBarNumber,
  extractRows,
} from '../scrape-wibar-discipline.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = fs.readFileSync(
  path.join(__dirname, '..', '__fixtures__', 'wi-sample.html'),
  'utf8',
);

describe('wibar — parseSortDate', () => {
  it('YYYYMMDD → YYYY-MM-DD', () => {
    assert.equal(parseSortDate('20220525'), '2022-05-25');
    assert.equal(parseSortDate('20251211'), '2025-12-11');
  });
  it('rejects bad input', () => {
    assert.equal(parseSortDate(''), null);
    assert.equal(parseSortDate('19900101'), '1990-01-01');
    assert.equal(parseSortDate('0000-not-a-date'), null);
  });
});

describe('wibar — parseWiName', () => {
  it('"Last, First" → "First Last"', () => {
    assert.equal(parseWiName('Alfredson, Melinda'), 'Melinda Alfredson');
  });
  it('preserves middle initial', () => {
    assert.equal(parseWiName('Barham, Daniel O.'), 'Daniel O. Barham');
    assert.equal(parseWiName('Buran, John P.'), 'John P. Buran');
  });
  it('returns null on input without comma', () => {
    assert.equal(parseWiName('NoComma Here'), null);
  });
});

describe('wibar — syntheticBarNumber', () => {
  it('is deterministic + WI-prefixed', () => {
    const a = syntheticBarNumber('Melinda Alfredson', '2022-05-25');
    const b = syntheticBarNumber('Melinda Alfredson', '2022-05-25');
    assert.equal(a, b);
    assert.match(a, /^WI:[0-9a-f]{8}$/);
  });
});

describe('wibar — extractRows (live-validated fixture)', () => {
  const records = extractRows(FIXTURE);

  it('parses 4 rows from fixture', () => {
    assert.equal(records.length, 4);
  });
  it('first row matches live-source values', () => {
    const r = records[0];
    assert.equal(r.full_name, 'Melinda Alfredson');
    assert.equal(r.order_date, '2022-05-25');
    assert.equal(r.discipline_type, 'unknown');
    assert.equal(r.source_url, 'https://www.wicourts.gov/services/public/lawyerreg/statuspublic.htm');
    // Order URL has &amp; → & + scheme prefix
    assert.match(r.order_url, /^https:\/\/www\.wicourts\.gov\/sc\/opinion\/DisplayDocument\.pdf\?content=pdf&seqNo=525963$/);
    assert.match(r.discipline_raw, /Case 21AP1106-D/);
  });
  it('OLR-format case URLs resolve via lawyerreg base path', () => {
    const r = records.find((x) => x.full_name === 'Patricia Arreazola');
    assert.ok(r, 'expected to find Arreazola row');
    // statuspublic/arreazola.pdf → https://www.wicourts.gov/services/public/lawyerreg/statuspublic/arreazola.pdf
    assert.match(r.order_url, /^https:\/\/www\.wicourts\.gov\/services\/public\/lawyerreg\/statuspublic\/arreazola\.pdf$/);
  });
  it('every record has HTTPS source_url + order_url', () => {
    for (const r of records) {
      assert.ok(r.source_url.startsWith('https://'), `non-HTTPS source: ${r.source_url}`);
      assert.ok(r.order_url.startsWith('https://'), `non-HTTPS order: ${r.order_url}`);
    }
  });
  it('discipline_type is uniformly "unknown" (listing does not expose)', () => {
    for (const r of records) {
      assert.equal(r.discipline_type, 'unknown');
    }
  });
});
