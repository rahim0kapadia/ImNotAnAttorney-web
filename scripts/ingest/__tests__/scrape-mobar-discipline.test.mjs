// Template: scripts/ingest/__tests__/scrape-tnbar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — self-contained unit test, no DB/network
// test-isolation-na: read-only unit tests; no Supabase writes
//
// Run: node --test scripts/ingest/__tests__/scrape-mobar-discipline.test.mjs
//
// Anti-TN-bug guard: fixtures below were extracted directly from the live
// listing page on 2026-04-26 (eyeball-validated against fetched HTML), then
// pasted unmodified. If the parser is buggy in the same direction as the
// fixture, full-listing dry-run output is the second check (see
// docs/handoff/2026-04-27-bar-disc-batch2-outcome.md).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeDiscipline,
  parseDate,
  parseMoName,
  syntheticBarNumber,
  extractRows,
} from '../scrape-mobar-discipline.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = fs.readFileSync(
  path.join(__dirname, '..', '__fixtures__', 'mo-sample.html'),
  'utf8',
);

describe('mobar — normalizeDiscipline', () => {
  it('Default Disbarment → disbarment', () => {
    assert.equal(normalizeDiscipline('Default Disbarment', 'Ethics - Disbarment'), 'disbarment');
  });
  it('Suspension → suspension', () => {
    assert.equal(normalizeDiscipline('Suspension', 'Ethics - Suspension'), 'suspension');
  });
  it('Interim Suspension → interim_suspension', () => {
    assert.equal(normalizeDiscipline('Interim Suspension', 'Ethics - Suspension'), 'interim_suspension');
  });
  it('Reciprocal Suspension → reciprocal_discipline (more specific wins)', () => {
    assert.equal(normalizeDiscipline('Reciprocal Suspension', 'Ethics - Suspension'), 'reciprocal_discipline');
  });
  it('Probation → probation', () => {
    assert.equal(normalizeDiscipline('Probation', 'Ethics - Probation'), 'probation');
  });
  it('Reprimand → public_reprimand', () => {
    assert.equal(normalizeDiscipline('Reprimand', 'Ethics - Reprimand'), 'public_reprimand');
  });
  it('Termination of Probation → null (skip — reinstatement-class)', () => {
    assert.equal(normalizeDiscipline('Termination of Probation', 'Ethics - Reinstatement'), null);
  });
  it('No Discipline Imposed → null (skip)', () => {
    assert.equal(normalizeDiscipline('No Discipline Imposed', 'Ethics - No Discipline Imposed'), null);
  });
});

describe('mobar — parseDate', () => {
  it('parses MM-DD-YYYY', () => {
    assert.equal(parseDate('12-20-2016'), '2016-12-20');
    assert.equal(parseDate('01-07-2009'), '2009-01-07');
  });
  it('returns null on bad input', () => {
    assert.equal(parseDate(''), null);
    assert.equal(parseDate('not a date'), null);
    assert.equal(parseDate('13-40-2020'), null); // month 13 / day 40
  });
});

describe('mobar — parseMoName', () => {
  it('mixed-case "Last, First" → "First Last"', () => {
    assert.equal(parseMoName('Bert, Michael'), 'Michael Bert');
  });
  it('preserves middle initials', () => {
    assert.equal(parseMoName('Todd, William G.'), 'William G. Todd');
  });
  it('handles inline lastname suffix "Leggat Jr., Robert B."', () => {
    assert.equal(parseMoName('Leggat Jr., Robert B.'), 'Robert B. Leggat Jr.');
  });
  it('handles apostrophe names (O\'Laughlin)', () => {
    assert.equal(parseMoName("O'Laughlin, Frederick J."), "Frederick J. O'Laughlin");
  });
  it('handles three-given-name forms', () => {
    assert.equal(
      parseMoName('Gaughan, Julia Michelle Gilmore'),
      'Julia Michelle Gilmore Gaughan',
    );
  });
  it('returns null on input without comma', () => {
    assert.equal(parseMoName('No Comma Here'), null);
  });
});

describe('mobar — syntheticBarNumber', () => {
  it('is deterministic', () => {
    const a = syntheticBarNumber('Michael Bert', '2016-12-20');
    const b = syntheticBarNumber('Michael Bert', '2016-12-20');
    assert.equal(a, b);
    assert.match(a, /^MO:[0-9a-f]{8}$/);
  });
  it('differs by date', () => {
    const a = syntheticBarNumber('Michael Bert', '2016-12-20');
    const c = syntheticBarNumber('Michael Bert', '2016-12-21');
    assert.notEqual(a, c);
  });
});

describe('mobar — extractRows (live-validated fixture)', () => {
  const records = extractRows(FIXTURE);

  it('skips reinstatement / termination-of-probation rows', () => {
    // Fixture has 8 entries; one is "Termination of Probation" (skip).
    assert.equal(records.length, 7);
  });
  it('first row matches live-source values', () => {
    const r = records[0];
    assert.equal(r.full_name, 'Michael Bert');
    assert.equal(r.order_date, '2016-12-20');
    assert.equal(r.discipline_type, 'disbarment');
    assert.equal(r.source_url, 'https://www.courts.mo.gov/page.jsp?id=109856');
    assert.equal(r.order_url, 'https://www.courts.mo.gov/page.jsp?id=108481');
  });
  it('"Interim Suspension" maps correctly (more specific wins)', () => {
    const interim = records.find((r) => r.full_name === 'Julia Michelle Gilmore Gaughan');
    assert.ok(interim, 'expected to find Gaughan row');
    assert.equal(interim.discipline_type, 'interim_suspension');
  });
  it('"Reciprocal Suspension" maps to reciprocal_discipline', () => {
    const recip = records.find((r) => r.full_name === "Frederick J. O'Laughlin");
    assert.ok(recip, 'expected to find O\'Laughlin row');
    assert.equal(recip.discipline_type, 'reciprocal_discipline');
  });
  it('every record has source_url + HTTPS', () => {
    for (const r of records) {
      assert.ok(r.source_url.startsWith('https://'), `non-HTTPS source: ${r.source_url}`);
      assert.ok(r.order_url.startsWith('https://'), `non-HTTPS order: ${r.order_url}`);
    }
  });
});
