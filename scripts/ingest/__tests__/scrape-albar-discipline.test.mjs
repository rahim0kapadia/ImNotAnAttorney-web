// Template: scripts/ingest/__tests__/scrape-tnbar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18 — fixture is LIVE-derived (page 2 of
//   alabar.org/office-of-general-counsel/disciplinary-history/page/2/),
//   captured 2026-04-27. Validated against the live source by parsing the
//   live HTML before fixture was written, per TN-bug avoidance rule.
// csv-bulk-checked: none-exists — self-contained unit test, no DB/network
// test-isolation-na: read-only unit tests; no Supabase writes
//
// Run: node --test scripts/ingest/__tests__/scrape-albar-discipline.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeDiscipline,
  parseDate,
  isAnonymousEntry,
  extractAttorney,
  deterministicBarNumber,
  parseListingPage,
  hasNextPage,
  parseArgs,
} from '../scrape-albar-discipline.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, '..', '__fixtures__', 'al-sample-live-p2.html');
const HTML = fs.readFileSync(FIXTURE, 'utf8');

describe('normalizeDiscipline', () => {
  it('Disbarred → disbarment', () => assert.equal(normalizeDiscipline('Disbarred'), 'disbarment'));
  it('Suspended → suspension', () => assert.equal(normalizeDiscipline('Suspended'), 'suspension'));
  it('Public Reprimand With Publication → public_reprimand',
    () => assert.equal(normalizeDiscipline('Public Reprimand With Publication'), 'public_reprimand'));
  it('Public Reprimand Without Publication → public_reprimand',
    () => assert.equal(normalizeDiscipline('Public Reprimand Without Publication'), 'public_reprimand'));
  it('Private Reprimand → private_reprimand',
    () => assert.equal(normalizeDiscipline('Private Reprimand'), 'private_reprimand'));
  it('Surrender of license → resignation_with_charges',
    () => assert.equal(normalizeDiscipline('Surrender of license'), 'resignation_with_charges'));
  it('Disability Inactive → disability_inactive',
    () => assert.equal(normalizeDiscipline('Disability Inactive'), 'disability_inactive'));
  it('Reinstated → null', () => assert.equal(normalizeDiscipline('Reinstated'), null));
  it('null/empty → null', () => {
    assert.equal(normalizeDiscipline(null), null);
    assert.equal(normalizeDiscipline(''), null);
  });
});

describe('parseDate', () => {
  it('1/19/2024 → 2024-01-19', () => assert.equal(parseDate('1/19/2024'), '2024-01-19'));
  it('12/8/2023 → 2023-12-08', () => assert.equal(parseDate('12/8/2023'), '2023-12-08'));
  it('rejects garbage', () => assert.equal(parseDate('not a date'), null));
  it('rejects 13/1/2024', () => assert.equal(parseDate('13/1/2024'), null));
  it('rejects 1/32/2024', () => assert.equal(parseDate('1/32/2024'), null));
});

describe('isAnonymousEntry', () => {
  it('detects "an attorney"', () => {
    assert.equal(isAnonymousEntry('An attorney failed to communicate...'), true);
  });
  it('detects "an Alabama attorney"', () => {
    assert.equal(isAnonymousEntry('An Alabama attorney was issued...'), true);
  });
  it('detects "a Birmingham, Alabama attorney"', () => {
    assert.equal(isAnonymousEntry('A Birmingham, Alabama attorney was issued a Private Reprimand'), true);
  });
  it('detects "On {date}, the Disciplinary Commission ... issued an attorney"', () => {
    assert.equal(isAnonymousEntry(
      'On 12/18/2023, the Disciplinary Commission of the Alabama State Bar issued an attorney a private reprimand'
    ), true);
  });
  it('does NOT flag a named entry', () => {
    assert.equal(isAnonymousEntry('Birmingham attorney, Sandy Eugene Lee was disbarred...'), false);
    assert.equal(isAnonymousEntry('Hoover, Alabama attorney, Bradley James Latta was issued...'), false);
  });
});

describe('extractAttorney — patterns from live page-2 fixture', () => {
  it('Pattern A — "City, Alabama attorney, Name was..."', () => {
    const r = extractAttorney(
      'Hoover, Alabama attorney, Bradley James Latta was issued a public reprimand with general publication on January 19, 2024',
    );
    assert.equal(r.fullName, 'Bradley James Latta');
    assert.equal(r.lastName, 'Latta');
    assert.equal(r.city, 'Hoover');
  });

  it('Pattern A — "City attorney, Name III, was..."', () => {
    const r = extractAttorney(
      'Birmingham attorney, William Henry McGowen, III, was summarily suspended from the practice of law',
    );
    assert.equal(r.fullName, 'William Henry McGowen, III');
    assert.equal(r.city, 'Birmingham');
  });

  it('Pattern B — voluntary surrender of Name\'s license', () => {
    const r = extractAttorney(
      "On February 6, 2024, the Supreme Court of Alabama issued an order accepting the voluntary surrender of Brent Lorne Parker's license to practice law",
    );
    assert.equal(r.fullName, 'Brent Lorne Parker');
    assert.equal(r.lastName, 'Parker');
    assert.equal(r.city, null);
  });

  it('Pattern E — "City attorney Name was disbarred"', () => {
    const r = extractAttorney(
      'Birmingham attorney Sandy Eugene Lee was disbarred from the practice of law',
    );
    assert.equal(r.fullName, 'Sandy Eugene Lee');
    assert.equal(r.city, 'Birmingham');
  });

  it('returns null for anonymous narrative', () => {
    assert.equal(extractAttorney('An attorney failed to communicate'), null);
    assert.equal(extractAttorney('A Birmingham, Alabama attorney was issued a Private Reprimand'), null);
  });
});

describe('deterministicBarNumber', () => {
  it('is stable for same input', () => {
    const a = deterministicBarNumber('Bradley James Latta', '2024-01-19');
    const b = deterministicBarNumber('Bradley James Latta', '2024-01-19');
    assert.equal(a, b);
    assert.match(a, /^AL:[0-9a-f]{8}$/);
  });
  it('differs for different name+date', () => {
    const a = deterministicBarNumber('Bradley James Latta', '2024-01-19');
    const b = deterministicBarNumber('Bradley James Latta', '2024-02-19');
    assert.notEqual(a, b);
  });
  it('case-insensitive on name (whitespace normalized)', () => {
    const a = deterministicBarNumber('Bradley James Latta', '2024-01-19');
    const b = deterministicBarNumber('bradley james latta', '2024-01-19');
    assert.equal(a, b);
  });
});

describe('parseListingPage — live fixture', () => {
  const records = parseListingPage(HTML, 'https://www.alabar.org/office-of-general-counsel/disciplinary-history/page/2/');

  it('parses 9 named records (drops anonymous ones)', () => {
    assert.equal(records.length, 9);
  });

  it('every record has required fields populated', () => {
    for (const r of records) {
      assert.match(r.bar_number, /^AL:[0-9a-f]{8}$/);
      assert.ok(r.full_name && r.full_name.length > 0);
      assert.match(r.order_date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(['disbarment','suspension','public_reprimand','private_reprimand',
                 'censure','probation','admonition','interim_suspension',
                 'resignation_with_charges','disability_inactive'].includes(r.discipline_type));
      assert.equal(r.source_url, 'https://www.alabar.org/office-of-general-counsel/disciplinary-history/page/2/');
    }
  });

  it('Bradley James Latta — public reprimand 2024-01-19, Hoover', () => {
    const r = records.find((x) => x.full_name === 'Bradley James Latta');
    assert.ok(r, 'Latta missing');
    assert.equal(r.discipline_type, 'public_reprimand');
    assert.equal(r.order_date, '2024-01-19');
    assert.equal(r.city, 'Hoover');
  });

  it('Brent Lorne Parker — resignation 2024-01-11', () => {
    const r = records.find((x) => x.full_name === 'Brent Lorne Parker');
    assert.ok(r, 'Parker missing');
    assert.equal(r.discipline_type, 'resignation_with_charges');
    assert.equal(r.order_date, '2024-01-11');
  });

  it('Sandy Eugene Lee — disbarment 2023-11-17 Birmingham', () => {
    const r = records.find((x) => x.full_name === 'Sandy Eugene Lee');
    assert.ok(r, 'Lee missing');
    assert.equal(r.discipline_type, 'disbarment');
    assert.equal(r.order_date, '2023-11-17');
    assert.equal(r.city, 'Birmingham');
  });
});

describe('hasNextPage', () => {
  it('detects /page/3/ on page 2', () => {
    assert.equal(hasNextPage(HTML, 2), true);
  });
  it('returns false when next-page anchor absent', () => {
    assert.equal(hasNextPage('<html>nothing</html>', 99), false);
  });
});

describe('parseArgs', () => {
  it('default → dry-run from page 1', () => {
    const o = parseArgs(['node', 'script.js']);
    assert.equal(o.apply, false);
    assert.equal(o.startPage, 1);
    assert.equal(o.endPage, Infinity);
  });
  it('--apply --start-page 5 --end-page 10 --limit 20', () => {
    const o = parseArgs(['node', 'script.js', '--apply', '--start-page', '5', '--end-page', '10', '--limit', '20']);
    assert.equal(o.apply, true);
    assert.equal(o.startPage, 5);
    assert.equal(o.endPage, 10);
    assert.equal(o.limit, 20);
  });
});
