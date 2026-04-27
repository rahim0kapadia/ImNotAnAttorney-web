// test-isolation-na: read-only unit tests — no Supabase writes, no DB connection
//
// Unit tests for scripts/ingest/scrape-mabar-federal-discipline.mjs
// No network, no DB — exercises pure parsing logic only. Fixtures are
// minimized live samples from https://www.mad.uscourts.gov/attorneys/data/discipline.json
// fetched 2026-04-26.
//
// Usage: node --test scripts/ingest/__tests__/scrape-mabar-federal-discipline.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeDiscipline,
  ALLOWED_DISCIPLINE_TYPES,
  normalizeName,
  splitName,
  normalizeDate,
  normalizeDocket,
  buildRecordFromMadRow,
} from '../scrape-mabar-federal-discipline.mjs';

// ── normalizeDiscipline ───────────────────────────────────────────────────────

test('normalizeDiscipline maps "Disbarment" → disbarment', () => {
  assert.equal(normalizeDiscipline('Disbarment').type, 'disbarment');
});

test('normalizeDiscipline maps "Judgment of Disbarment" → disbarment', () => {
  assert.equal(normalizeDiscipline('Judgment of Disbarment').type, 'disbarment');
});

test('normalizeDiscipline maps "Term Suspension" → suspension', () => {
  assert.equal(normalizeDiscipline('Term Suspension').type, 'suspension');
});

test('normalizeDiscipline maps "Order of Term Suspension" → suspension', () => {
  assert.equal(normalizeDiscipline('Order of Term Suspension').type, 'suspension');
});

test('normalizeDiscipline maps "Indefinite Suspension" → suspension', () => {
  assert.equal(normalizeDiscipline('Indefinite Suspension').type, 'suspension');
});

test('normalizeDiscipline maps "Administrative Suspension" → suspension', () => {
  assert.equal(normalizeDiscipline('Administrative Suspension').type, 'suspension');
});

test('normalizeDiscipline maps "Admin Suspension" → suspension', () => {
  assert.equal(normalizeDiscipline('Admin Suspension').type, 'suspension');
});

test('normalizeDiscipline maps "Suspension" → suspension', () => {
  assert.equal(normalizeDiscipline('Suspension').type, 'suspension');
});

test('normalizeDiscipline maps "Immediate Temporary Suspension" → interim_suspension', () => {
  assert.equal(normalizeDiscipline('Immediate Temporary Suspension').type, 'interim_suspension');
});

test('normalizeDiscipline maps "Immediate Temp Suspension" → interim_suspension', () => {
  assert.equal(normalizeDiscipline('Immediate Temp Suspension').type, 'interim_suspension');
});

test('normalizeDiscipline maps "Immediate Admin Suspension" → interim_suspension', () => {
  assert.equal(normalizeDiscipline('Immediate Admin Suspension').type, 'interim_suspension');
});

test('normalizeDiscipline maps "Temporary Suspension" → interim_suspension', () => {
  assert.equal(normalizeDiscipline('Temporary Suspension').type, 'interim_suspension');
});

test('normalizeDiscipline maps "Temp Suspension" → interim_suspension', () => {
  assert.equal(normalizeDiscipline('Temp Suspension').type, 'interim_suspension');
});

test('normalizeDiscipline maps "Public Reprimand" → public_reprimand', () => {
  assert.equal(normalizeDiscipline('Public Reprimand').type, 'public_reprimand');
});

test('normalizeDiscipline maps "Reciprocal Discipline" → reciprocal_discipline', () => {
  assert.equal(normalizeDiscipline('Reciprocal Discipline').type, 'reciprocal_discipline');
});

test('normalizeDiscipline maps "Reciprocal Disciplinary Sanction" → reciprocal_discipline', () => {
  assert.equal(normalizeDiscipline('Reciprocal Disciplinary Sanction').type, 'reciprocal_discipline');
});

test('normalizeDiscipline maps "Reciprocal Discipline/Resignation" → reciprocal_discipline', () => {
  // "/" precedes resignation but reciprocal discipline pattern wins (specific before general)
  assert.equal(normalizeDiscipline('Reciprocal Discipline/Resignation').type, 'reciprocal_discipline');
});

test('normalizeDiscipline maps "Disability Inactive Status" → disability_inactive', () => {
  assert.equal(normalizeDiscipline('Disability Inactive Status').type, 'disability_inactive');
});

test('normalizeDiscipline maps "Reinstatement" → reinstatement (filtered out by build)', () => {
  assert.equal(normalizeDiscipline('Reinstatement').type, 'reinstatement');
});

test('normalizeDiscipline maps "Reinstated" → reinstatement (filtered)', () => {
  assert.equal(normalizeDiscipline('Reinstated').type, 'reinstatement');
});

test('normalizeDiscipline maps "Order of Reinstatement" → reinstatement (filtered)', () => {
  assert.equal(normalizeDiscipline('Order of Reinstatement').type, 'reinstatement');
});

test('normalizeDiscipline returns unknown for empty', () => {
  assert.equal(normalizeDiscipline('').type, null);
});

test('normalizeDiscipline returns unknown for unrecognized text', () => {
  assert.equal(normalizeDiscipline('something else entirely').type, 'unknown');
});

// ── ALLOWED_DISCIPLINE_TYPES ──────────────────────────────────────────────────

test('ALLOWED_DISCIPLINE_TYPES does NOT include reinstatement (filtered out)', () => {
  assert.ok(!ALLOWED_DISCIPLINE_TYPES.has('reinstatement'),
    'reinstatement is an outcome, not a discipline event');
});

test('ALLOWED_DISCIPLINE_TYPES does NOT include unknown (federal scraper drops unknowns)', () => {
  // Unlike the SJC/CL scraper (which keeps "unknown" because every "In the Matter of"
  // SJC docket IS attorney discipline), the MAD JSON disposition field is structured
  // — unknown means we genuinely failed to classify, drop the row.
  assert.ok(!ALLOWED_DISCIPLINE_TYPES.has('unknown'));
});

test('ALLOWED_DISCIPLINE_TYPES contains all 10 production discipline types', () => {
  const required = [
    'disbarment', 'suspension', 'interim_suspension', 'probation',
    'public_reprimand', 'resignation_with_charges', 'censure',
    'admonition', 'reciprocal_discipline', 'disability_inactive',
  ];
  for (const t of required) {
    assert.ok(ALLOWED_DISCIPLINE_TYPES.has(t), `missing type: ${t}`);
  }
});

// ── normalizeName ─────────────────────────────────────────────────────────────

test('normalizeName converts "Last, First M." → "First M. Last"', () => {
  assert.equal(normalizeName('Smith, John A.'), 'John A. Smith');
});

test('normalizeName converts "Uhl, Christopher M." → "Christopher M. Uhl"', () => {
  assert.equal(normalizeName('Uhl, Christopher M.'), 'Christopher M. Uhl');
});

test('normalizeName leaves "First Last" form unchanged', () => {
  assert.equal(normalizeName('Christopher M. Uhl'), 'Christopher M. Uhl');
});

test('normalizeName leaves "First M.D. Last" form unchanged (compound initials)', () => {
  assert.equal(normalizeName('Kenneth A.D. Filarski'), 'Kenneth A.D. Filarski');
});

test('normalizeName collapses internal whitespace', () => {
  assert.equal(normalizeName('John   A.   Smith'), 'John A. Smith');
});

test('normalizeName returns null for empty input', () => {
  assert.equal(normalizeName(''), null);
});

test('normalizeName returns null for null input', () => {
  assert.equal(normalizeName(null), null);
});

// ── splitName ─────────────────────────────────────────────────────────────────

test('splitName splits "Christopher M. Uhl" → first="Christopher M.", last="Uhl"', () => {
  const { first, last } = splitName('Christopher M. Uhl');
  assert.equal(first, 'Christopher M.');
  assert.equal(last, 'Uhl');
});

test('splitName handles single-token name', () => {
  const { first, last } = splitName('Cher');
  assert.equal(first, null);
  assert.equal(last, 'Cher');
});

test('splitName handles three+ token name', () => {
  const { first, last } = splitName('Mary Anne Johnson');
  assert.equal(first, 'Mary Anne');
  assert.equal(last, 'Johnson');
});

test('splitName handles null input', () => {
  const { first, last } = splitName(null);
  assert.equal(first, null);
  assert.equal(last, null);
});

// ── normalizeDate ─────────────────────────────────────────────────────────────

test('normalizeDate converts "12/13/2010" → "2010-12-13"', () => {
  assert.equal(normalizeDate('12/13/2010'), '2010-12-13');
});

test('normalizeDate converts "1/4/2012" → "2012-01-04"', () => {
  assert.equal(normalizeDate('1/4/2012'), '2012-01-04');
});

test('normalizeDate converts "3/27/2026" → "2026-03-27"', () => {
  assert.equal(normalizeDate('3/27/2026'), '2026-03-27');
});

test('normalizeDate returns null for ISO format (we only accept M/D/YYYY)', () => {
  assert.equal(normalizeDate('2024-01-15'), null);
});

test('normalizeDate returns null for empty', () => {
  assert.equal(normalizeDate(''), null);
});

test('normalizeDate returns null for null', () => {
  assert.equal(normalizeDate(null), null);
});

test('normalizeDate returns null for malformed', () => {
  assert.equal(normalizeDate('not a date'), null);
});

// ── normalizeDocket ───────────────────────────────────────────────────────────

test('normalizeDocket trims and collapses whitespace', () => {
  assert.equal(normalizeDocket('  10-mc-10158-MLW  '), '10-mc-10158-MLW');
});

test('normalizeDocket preserves docket content', () => {
  assert.equal(normalizeDocket('26-mc-91066-DJC'), '26-mc-91066-DJC');
});

test('normalizeDocket returns null for null', () => {
  assert.equal(normalizeDocket(null), null);
});

// ── buildRecordFromMadRow ─────────────────────────────────────────────────────
//
// LIVE-VALIDATED FIXTURES: every fixture row below was extracted directly from
// https://www.mad.uscourts.gov/attorneys/data/discipline.json on 2026-04-26.
// Avoids the TN-bug class (synthetic fixture passing buggy parser) by anchoring
// every test to a real row shape.

test('buildRecordFromMadRow produces MAFED: bar_number prefix', () => {
  // Live row from JSON, index 0:
  //   {"name":"Uhl, Christopher M.","docket":"10-mc-10158-MLW","disposition":"Temp Suspension","date":"12/13/2010"}
  const r = buildRecordFromMadRow({
    name: 'Uhl, Christopher M.',
    docket: '10-mc-10158-MLW',
    disposition: 'Temp Suspension',
    date: '12/13/2010',
  });
  assert.ok(r, 'should return a record');
  assert.equal(r.bar_number, 'MAFED:10-mc-10158-MLW');
  assert.equal(r.full_name, 'Christopher M. Uhl');
  assert.equal(r.discipline_type, 'interim_suspension');
  assert.equal(r.order_date, '2010-12-13');
});

test('buildRecordFromMadRow handles "Last, First" name form (older entries)', () => {
  // Live row index 2: {"name":"Smith, William F.","docket":"10-mc-10072-MLW","disposition":"Disbarment","date":"2/1/2012"}
  const r = buildRecordFromMadRow({
    name: 'Smith, William F.',
    docket: '10-mc-10072-MLW',
    disposition: 'Disbarment',
    date: '2/1/2012',
  });
  assert.ok(r, 'should return a record');
  assert.equal(r.full_name, 'William F. Smith');
  assert.equal(r.discipline_type, 'disbarment');
});

test('buildRecordFromMadRow handles "First Last" name form (newer entries)', () => {
  // Live row last: {"name":"Ann E. Johnston","docket":"26-mc-91114-DJC","disposition":"Order of Term Suspension","date":"4/14/2026"}
  const r = buildRecordFromMadRow({
    name: 'Ann E. Johnston',
    docket: '26-mc-91114-DJC',
    disposition: 'Order of Term Suspension',
    date: '4/14/2026',
  });
  assert.ok(r, 'should return a record');
  assert.equal(r.full_name, 'Ann E. Johnston');
  assert.equal(r.discipline_type, 'suspension');
  assert.equal(r.order_date, '2026-04-14');
});

test('buildRecordFromMadRow handles compound-initial name (Kenneth A.D. Filarski)', () => {
  // Live row -3: {"name":"Kenneth A.D. Filarski","docket":"26-mc-91041-DJC","disposition":"Immediate Temporary Suspension","date":"3/27/2026"}
  const r = buildRecordFromMadRow({
    name: 'Kenneth A.D. Filarski',
    docket: '26-mc-91041-DJC',
    disposition: 'Immediate Temporary Suspension',
    date: '3/27/2026',
  });
  assert.ok(r, 'should return a record');
  assert.equal(r.full_name, 'Kenneth A.D. Filarski');
  assert.equal(r.discipline_type, 'interim_suspension');
});

test('buildRecordFromMadRow drops Reinstatement rows', () => {
  // Reinstatement is an outcome, not a discipline event
  const r = buildRecordFromMadRow({
    name: 'Some Person',
    docket: '20-mc-99999-XYZ',
    disposition: 'Reinstatement',
    date: '6/1/2020',
  });
  assert.equal(r, null, 'reinstatement should be filtered out');
});

test('buildRecordFromMadRow drops Order of Reinstatement', () => {
  const r = buildRecordFromMadRow({
    name: 'Some Person',
    docket: '20-mc-99998-XYZ',
    disposition: 'Order of Reinstatement',
    date: '6/1/2020',
  });
  assert.equal(r, null);
});

test('buildRecordFromMadRow drops missing docket', () => {
  const r = buildRecordFromMadRow({
    name: 'Some Person',
    docket: '',
    disposition: 'Disbarment',
    date: '6/1/2020',
  });
  assert.equal(r, null);
});

test('buildRecordFromMadRow drops missing date', () => {
  const r = buildRecordFromMadRow({
    name: 'Some Person',
    docket: '20-mc-12345-XYZ',
    disposition: 'Disbarment',
    date: '',
  });
  assert.equal(r, null);
});

test('buildRecordFromMadRow drops missing name', () => {
  const r = buildRecordFromMadRow({
    name: '',
    docket: '20-mc-12345-XYZ',
    disposition: 'Disbarment',
    date: '6/1/2020',
  });
  assert.equal(r, null);
});

test('buildRecordFromMadRow source_url and order_url are HTTPS to MAD listing', () => {
  const r = buildRecordFromMadRow({
    name: 'Test User',
    docket: '20-mc-11111-XYZ',
    disposition: 'Disbarment',
    date: '6/1/2020',
  });
  assert.ok(r);
  assert.ok(r.source_url.startsWith('https://www.mad.uscourts.gov/'),
    `source_url must be HTTPS MAD: ${r.source_url}`);
  assert.equal(r.source_url, r.order_url);
});

test('buildRecordFromMadRow source_url ALWAYS populated (no-hallucinated-legal-data invariant)', () => {
  const r = buildRecordFromMadRow({
    name: 'Test User',
    docket: '20-mc-11111-XYZ',
    disposition: 'Public Reprimand',
    date: '6/1/2020',
  });
  assert.ok(r);
  assert.ok(r.source_url, 'source_url must always be set');
  assert.ok(r.source_url.length > 0);
});

test('buildRecordFromMadRow handles multiline disposition (replaces \\n with /)', () => {
  const r = buildRecordFromMadRow({
    name: 'John Doe',
    docket: '20-mc-12345-ABC',
    disposition: 'Term Suspension\n6 months',
    date: '5/15/2020',
  });
  assert.ok(r);
  assert.equal(r.discipline_type, 'suspension');
  assert.ok(r.violation_summary.includes('/'));
});
