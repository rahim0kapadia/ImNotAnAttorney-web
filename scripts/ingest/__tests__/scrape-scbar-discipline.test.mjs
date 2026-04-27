// Template: scripts/ingest/__tests__/scrape-tnbar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18 — fixture is LIVE-derived (April 2026
//   page from sccourts.org/opinions-orders/opinions/published-opinions/supreme-court/),
//   captured 2026-04-27. Validated against live source before fixture written.
// csv-bulk-checked: none-exists — self-contained unit test, no DB/network
// test-isolation-na: read-only unit tests; no Supabase writes
//
// Run: node --test scripts/ingest/__tests__/scrape-scbar-discipline.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeDiscipline,
  parseDate,
  extractAttorneyFromCaption,
  deterministicBarNumber,
  parseListingPage,
  monthsBetween,
  parseArgs,
} from '../scrape-scbar-discipline.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, '..', '__fixtures__', 'sc-sample-live.html');
const HTML = fs.readFileSync(FIXTURE, 'utf8');

describe('normalizeDiscipline', () => {
  it('definite suspension → suspension',
    () => assert.equal(normalizeDiscipline('In this attorney disciplinary matter, the Court imposes a definite suspension.'), 'suspension'));
  it('public reprimand → public_reprimand',
    () => assert.equal(normalizeDiscipline('In this attorney disciplinary matter, the Court imposes a public reprimand.'), 'public_reprimand'));
  it('disbarment → disbarment',
    () => assert.equal(normalizeDiscipline('Court orders disbarment'), 'disbarment'));
  it('reinstatement → null',
    () => assert.equal(normalizeDiscipline('Court reinstates respondent'), null));
  it('null → null', () => assert.equal(normalizeDiscipline(null), null));
});

describe('parseDate', () => {
  it('April 22, 2026 → 2026-04-22', () => assert.equal(parseDate('April 22, 2026'), '2026-04-22'));
  it('January 1, 2020 → 2020-01-01', () => assert.equal(parseDate('January 1, 2020'), '2020-01-01'));
  it('rejects garbage', () => assert.equal(parseDate('not a date'), null));
});

describe('extractAttorneyFromCaption', () => {
  it('In the Matter of MaRhonda Shatoya Smith', () => {
    const r = extractAttorneyFromCaption('In the Matter of MaRhonda Shatoya Smith');
    assert.equal(r.fullName, 'MaRhonda Shatoya Smith');
    assert.equal(r.lastName, 'Smith');
  });
  it('strips ", Respondent."', () => {
    const r = extractAttorneyFromCaption('In the Matter of David J. Miller, Respondent.');
    assert.equal(r.fullName, 'David J. Miller');
    assert.equal(r.lastName, 'Miller');
  });
  it('returns null for "In the Matter of Anonymous Member ..."', () => {
    assert.equal(extractAttorneyFromCaption('In the Matter of Anonymous Member of the South Carolina Bar'), null);
  });
  it('returns null for non-matter caption', () => {
    assert.equal(extractAttorneyFromCaption('The State v. Garvin'), null);
  });
});

describe('deterministicBarNumber', () => {
  it('stable + correctly prefixed', () => {
    const a = deterministicBarNumber('David J. Miller', '2026-04-22');
    const b = deterministicBarNumber('David J. Miller', '2026-04-22');
    assert.equal(a, b);
    assert.match(a, /^SC:[0-9a-f]{8}$/);
  });
});

describe('parseListingPage — live April 2026 fixture', () => {
  const records = parseListingPage(HTML, 'sc-2026-04');

  it('parses 2 attorney-discipline opinions (out of 4 opinions on page)', () => {
    assert.equal(records.length, 2);
  });

  it('MaRhonda Shatoya Smith — suspension 2026-04-22', () => {
    const r = records.find((x) => x.full_name === 'MaRhonda Shatoya Smith');
    assert.ok(r);
    assert.equal(r.discipline_type, 'suspension');
    assert.equal(r.order_date, '2026-04-22');
    assert.match(r.order_url, /28326\.pdf$/);
  });

  it('David J. Miller — public_reprimand 2026-04-22', () => {
    const r = records.find((x) => x.full_name === 'David J. Miller');
    assert.ok(r);
    assert.equal(r.discipline_type, 'public_reprimand');
    assert.match(r.order_url, /28327\.pdf$/);
  });

  it('every record has required fields', () => {
    for (const r of records) {
      assert.match(r.bar_number, /^SC:[0-9a-f]{8}$/);
      assert.ok(r.full_name);
      assert.match(r.order_date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(r.discipline_type);
      assert.equal(r.source_url, 'sc-2026-04');
    }
  });
});

describe('monthsBetween', () => {
  it('iterates Jan-Mar 2024', () => {
    const all = [...monthsBetween('2024-01', '2024-03')];
    assert.deepEqual(all, ['2024-01', '2024-02', '2024-03']);
  });
  it('crosses year boundary', () => {
    const all = [...monthsBetween('2023-11', '2024-02')];
    assert.deepEqual(all, ['2023-11', '2023-12', '2024-01', '2024-02']);
  });
});

describe('parseArgs', () => {
  it('--apply --start 2024-01 --end 2024-12', () => {
    const o = parseArgs(['n', 's', '--apply', '--start', '2024-01', '--end', '2024-12']);
    assert.equal(o.apply, true);
    assert.equal(o.start, '2024-01');
    assert.equal(o.end, '2024-12');
  });
});
