// Template: scripts/ingest/__tests__/scrape-tnbar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18 — fixture is LIVE-derived from the
//   ncbar.gov JSON API endpoint (POST /mypastordersofdiscipline/search/),
//   captured 2026-04-27 via empty-filter request.
// csv-bulk-checked: none-exists — self-contained unit test, no DB/network
// test-isolation-na: read-only unit tests; no Supabase writes
//
// Run: node --test scripts/ingest/__tests__/scrape-ncbar-discipline.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeDiscipline,
  orderNumberToDate,
  parseName,
  deterministicBarNumber,
  transformApiRecord,
  extractResultsPageGuid,
  parseArgs,
} from '../scrape-ncbar-discipline.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, '..', '__fixtures__', 'nc-sample-live.json');
const SAMPLE = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

describe('normalizeDiscipline', () => {
  it('Disbarred → disbarment', () => assert.equal(normalizeDiscipline('Disbarred'), 'disbarment'));
  it('Disbarred on Consent → disbarment', () => assert.equal(normalizeDiscipline('Disbarred on Consent'), 'disbarment'));
  it('Suspension → suspension', () => assert.equal(normalizeDiscipline('Suspension'), 'suspension'));
  it('Suspension with All Stayed → suspension', () => assert.equal(normalizeDiscipline('Suspension with All Stayed'), 'suspension'));
  it('Reprimand → public_reprimand', () => assert.equal(normalizeDiscipline('Reprimand'), 'public_reprimand'));
  it('Private Reprimand → private_reprimand', () => assert.equal(normalizeDiscipline('Private Reprimand'), 'private_reprimand'));
  it('Censure → censure', () => assert.equal(normalizeDiscipline('Censure'), 'censure'));
  it('Disability Inactive → disability_inactive', () => assert.equal(normalizeDiscipline('Disability Inactive'), 'disability_inactive'));
  it('Reinstatement → null (skip)', () => assert.equal(normalizeDiscipline('Reinstatement'), null));
  it('Voluntary Dismissal with Prejudice → null', () => assert.equal(normalizeDiscipline('Voluntary Dismissal with Prejudice'), null));
  it('Petition Withdrawn → null', () => assert.equal(normalizeDiscipline('Petition Withdrawn'), null));
  it('unknown disposition → null', () => assert.equal(normalizeDiscipline('Some Brand New Disposition'), null));
});

describe('orderNumberToDate', () => {
  it('97DHC25 → 1997-01-01', () => assert.equal(orderNumberToDate('97DHC25'), '1997-01-01'));
  it('00DHC1 → 2000-01-01', () => assert.equal(orderNumberToDate('00DHC1'), '2000-01-01'));
  it('13DHC17 → 2013-01-01', () => assert.equal(orderNumberToDate('13DHC17'), '2013-01-01'));
  it('19BCR4 → 2019-01-01', () => assert.equal(orderNumberToDate('19BCR4'), '2019-01-01'));
  it('18G0701 → 2018-01-01', () => assert.equal(orderNumberToDate('18G0701'), '2018-01-01'));
  it('70 prefix → 1970', () => assert.equal(orderNumberToDate('70DHC1'), '1970-01-01'));
  it('50 prefix → 2050 (pivot upper)', () => assert.equal(orderNumberToDate('50DHC1'), '2050-01-01'));
  it('51 prefix → null (gap year)', () => assert.equal(orderNumberToDate('51DHC1'), null));
  it('rejects bad input', () => {
    assert.equal(orderNumberToDate(null), null);
    assert.equal(orderNumberToDate(''), null);
    assert.equal(orderNumberToDate('NOPREFIX'), null);
  });
});

describe('parseName', () => {
  it('"Smith, James W." → "James W. Smith"', () => {
    const r = parseName('Smith, James W.');
    assert.equal(r.fullName, 'James W. Smith');
    assert.equal(r.firstName, 'James W.');
    assert.equal(r.lastName, 'Smith');
  });
  it('"Adams, Robert W." → "Robert W. Adams"', () => {
    const r = parseName('Adams, Robert W.');
    assert.equal(r.fullName, 'Robert W. Adams');
    assert.equal(r.lastName, 'Adams');
  });
  it('"Smith, Franklin Delano" → "Franklin Delano Smith"', () => {
    const r = parseName('Smith, Franklin Delano');
    assert.equal(r.fullName, 'Franklin Delano Smith');
  });
  it('rejects empty', () => assert.equal(parseName(''), null));
  it('rejects null', () => assert.equal(parseName(null), null));
});

describe('deterministicBarNumber', () => {
  it('stable + NC-prefixed', () => {
    const a = deterministicBarNumber('Robert W. Adams', '2000-01-01');
    const b = deterministicBarNumber('Robert W. Adams', '2000-01-01');
    assert.equal(a, b);
    assert.match(a, /^NC:[0-9a-f]{8}$/);
  });
});

describe('transformApiRecord', () => {
  it('skips Reinstatement', () => {
    const apiRow = { id: 4057, name: 'Smith, James W.', disciplinaryOrderNumber: '19BCR4', disposition: 'Petition Withdrawn', pdfLink: '/foo' };
    assert.equal(transformApiRecord(apiRow, 'src'), null);
  });
  it('handles a typical Suspension row', () => {
    const apiRow = { id: 1, name: 'Smith, John A.', disciplinaryOrderNumber: '13DHC4', disposition: 'Suspension', pdfLink: '/mypastordersofdiscipline/getfile?id=abc&search=' };
    const r = transformApiRecord(apiRow, 'src');
    assert.equal(r.full_name, 'John A. Smith');
    assert.equal(r.order_date, '2013-01-01');
    assert.equal(r.discipline_type, 'suspension');
    assert.match(r.bar_number, /^NC:/);
    assert.match(r.order_url, /^https:\/\/www\.ncbar\.gov\/mypastordersofdiscipline\/getfile/);
  });
});

describe('parseListingPage equivalents — fixture is API JSON', () => {
  it('sample contains 10 results (default pageSize for fixture)', () => {
    assert.ok(SAMPLE.success);
    assert.ok(Array.isArray(SAMPLE.data.results));
    assert.equal(SAMPLE.data.results.length, 10);
    assert.ok(SAMPLE.data.totalCount >= 3000);
  });

  it('every result has expected shape', () => {
    for (const r of SAMPLE.data.results) {
      assert.ok(typeof r.name === 'string' && r.name.length > 0);
      assert.ok(typeof r.disciplinaryOrderNumber === 'string');
      assert.ok(typeof r.disposition === 'string');
      assert.ok(r.pdfLink && r.pdfLink.startsWith('/mypastordersofdiscipline/getfile'));
    }
  });

  it('transform pipeline produces records with valid fields', () => {
    const transformed = SAMPLE.data.results
      .map((r) => transformApiRecord(r, 'test-source'))
      .filter(Boolean);
    assert.ok(transformed.length > 0, 'fixture should produce at least one normalised record');
    for (const t of transformed) {
      assert.match(t.bar_number, /^NC:[0-9a-f]{8}$/);
      assert.match(t.order_date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(['suspension','disbarment','public_reprimand','private_reprimand',
                'censure','admonition','disability_inactive','interim_suspension'].includes(t.discipline_type));
      assert.match(t.order_url, /^https:\/\/www\.ncbar\.gov\//);
      assert.equal(t.source_url, 'test-source');
    }
  });
});

describe('extractResultsPageGuid', () => {
  it('extracts guid from a stub HTML', () => {
    const html = `<x-component resultsPageGuid="22dc3882-bdcb-4d5f-b609-3f0029baa5fd" foo="bar"></x-component>`;
    assert.equal(extractResultsPageGuid(html), '22dc3882-bdcb-4d5f-b609-3f0029baa5fd');
  });
  it('returns null when missing', () => {
    assert.equal(extractResultsPageGuid('<html>no guid</html>'), null);
  });
});

describe('parseArgs', () => {
  it('--apply --limit 100', () => {
    const o = parseArgs(['n', 's', '--apply', '--limit', '100']);
    assert.equal(o.apply, true);
    assert.equal(o.limit, 100);
  });
});
