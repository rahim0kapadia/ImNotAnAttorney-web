// Template: scripts/ingest/__tests__/scrape-mobar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — self-contained unit test, synthetic fixtures
// test-isolation-na: read-only unit test, no Supabase writes
//
// Unit tests for scripts/ingest/scrape-arbar-discipline.mjs.
// No network, no DB.
//
// Anti-TN-bug guard: HTML fixtures here are derived from VERIFIED LIVE
// arcourts.gov/professional-conduct/opinions responses captured 2026-04-27.
// `<td class="views-field views-field-XXX">` row shape, anchor href format
// `/administration/professional-conduct/opinions/<slug>`, and
// `<div class="field field--name-field-NNN">` detail-page markers all
// match the live structure.
//
// Usage: node --test scripts/ingest/__tests__/scrape-arbar-discipline.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseDate,
  parseIndexRow,
  extractIndexRows,
  parseDetailPage,
  buildFullName,
  normalizeDiscipline,
  buildRecord,
  ALLOWED_DISCIPLINE_TYPES,
} from '../scrape-arbar-discipline.mjs';

// ── parseDate ────────────────────────────────────────────────────────────────

test('parseDate accepts MM/DD/YYYY', () => {
  assert.equal(parseDate('03/18/2026'), '2026-03-18');
});

test('parseDate rejects malformed input', () => {
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('not-a-date'), null);
  assert.equal(parseDate('03-18-2026'), null);
});

test('parseDate rejects out-of-range year', () => {
  assert.equal(parseDate('03/18/1899'), null);
  assert.equal(parseDate('03/18/2101'), null);
});

// ── normalizeDiscipline ─────────────────────────────────────────────────────

test('normalizeDiscipline maps disbarment slug', () => {
  assert.equal(normalizeDiscipline('initiate-disbarment', ''), 'disbarment');
  assert.equal(normalizeDiscipline('disbarment', 'DISBARMENT'), 'disbarment');
});

test('normalizeDiscipline maps interim-suspension before suspension', () => {
  assert.equal(
    normalizeDiscipline('interim-suspension', 'INTERIM SUSPENSION'),
    'interim_suspension',
  );
  assert.equal(
    normalizeDiscipline('modified-interim-suspension', ''),
    'interim_suspension',
  );
});

test('normalizeDiscipline maps consent-caution to admonition', () => {
  assert.equal(
    normalizeDiscipline('2025-028-consent-caution', 'CONSENT CAUTION'),
    'admonition',
  );
});

test('normalizeDiscipline maps reprimand variants to public_reprimand', () => {
  assert.equal(
    normalizeDiscipline('reprimand', 'REPRIMAND'),
    'public_reprimand',
  );
  assert.equal(
    normalizeDiscipline('consent-reprimand', 'CONSENT REPRIMAND'),
    'public_reprimand',
  );
});

test('normalizeDiscipline returns null for reinstatements', () => {
  assert.equal(
    normalizeDiscipline('reinstatement', 'REINSTATEMENT'),
    null,
  );
});

test('normalizeDiscipline maps probation', () => {
  assert.equal(normalizeDiscipline('probation', 'PROBATION'), 'probation');
});

test('ALLOWED_DISCIPLINE_TYPES contains 10 entries', () => {
  assert.equal(ALLOWED_DISCIPLINE_TYPES.size, 10);
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('public_reprimand'));
});

// ── buildFullName ───────────────────────────────────────────────────────────

test('buildFullName joins given + last', () => {
  assert.equal(buildFullName('Emily', 'Reed'), 'Emily Reed');
});

test('buildFullName tolerates missing last', () => {
  assert.equal(buildFullName('Emily Reed', ''), 'Emily Reed');
});

test('buildFullName rejects empty pair', () => {
  assert.equal(buildFullName('', ''), null);
  assert.equal(buildFullName(null, null), null);
});

// ── parseIndexRow ───────────────────────────────────────────────────────────

const FIXTURE_INDEX_ROW = [
  '<td class="views-field views-field-title"><a href="/administration/professional-conduct/opinions/2025-028-consent-caution">2025-028 - CONSENT CAUTION</a></td>',
  '<td class="views-field views-field-field-given-name">Emily Reed</td>',
  '<td class="views-field views-field-field-city">Little Rock</td>',
  '<td class="views-field views-field-field-state">AR</td>',
  '<td class="views-field views-field-field-date-filed">03/18/2026</td>',
];

test('parseIndexRow extracts all fields', () => {
  const r = parseIndexRow(FIXTURE_INDEX_ROW);
  assert.ok(r);
  assert.equal(r.opinionNumber, '2025-028');
  assert.equal(r.sanctionLabel, 'CONSENT CAUTION');
  assert.equal(r.givenName, 'Emily Reed');
  assert.equal(r.city, 'Little Rock');
  assert.equal(r.state, 'AR');
  assert.equal(r.dateFiled, '03/18/2026');
  assert.equal(r.slug, '2025-028-consent-caution');
});

test('parseIndexRow rejects malformed link cell', () => {
  const bad = ['<td>NO ANCHOR HERE</td>', ...FIXTURE_INDEX_ROW.slice(1)];
  assert.equal(parseIndexRow(bad), null);
});

test('parseIndexRow rejects too-few cells', () => {
  assert.equal(parseIndexRow([]), null);
  assert.equal(parseIndexRow(FIXTURE_INDEX_ROW.slice(0, 3)), null);
});

// ── extractIndexRows ────────────────────────────────────────────────────────

const FIXTURE_HTML = `
<table>
  <tbody>
    <tr>${FIXTURE_INDEX_ROW.join('')}</tr>
    <tr>
      <td class="views-field views-field-title"><a href="/administration/professional-conduct/opinions/2026-012-interim-suspension">2026-012 - INTERIM SUSPENSION</a></td>
      <td class="views-field views-field-field-given-name">Zoe Jackson</td>
      <td class="views-field views-field-field-city">Fort Smith</td>
      <td class="views-field views-field-field-state">AR</td>
      <td class="views-field views-field-field-date-filed">03/06/2026</td>
    </tr>
  </tbody>
</table>
`;

test('extractIndexRows finds all rows in fixture', () => {
  const rows = extractIndexRows(FIXTURE_HTML);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].opinionNumber, '2025-028');
  assert.equal(rows[1].opinionNumber, '2026-012');
});

test('extractIndexRows returns [] for irrelevant HTML', () => {
  assert.equal(extractIndexRows('<html><body>Nothing here</body></html>').length, 0);
});

// ── parseDetailPage ─────────────────────────────────────────────────────────

const FIXTURE_DETAIL = `
<html><body>
  <div class="field field--name-field-bar-number">
    <div class="field--label">Bar Number</div>
    <div class="field--item">2024156</div>
  </div>
  <div class="field field--name-field-given-name">
    <div class="field--label">Given Name</div>
    <div class="field--item">Emily</div>
  </div>
  <div class="field field--name-field-last-name">
    <div class="field--label">Last Name</div>
    <div class="field--item">Reed</div>
  </div>
  <div class="field field--name-field-city">
    <div class="field--label">City</div>
    <div class="field--item">Little Rock</div>
  </div>
  <div class="field field--name-field-state">
    <div class="field--label">State</div>
    <div class="field--item">AR</div>
  </div>
  <div class="field field--name-field-zip-code">
    <div class="field--label">Zip</div>
    <div class="field--item">72201</div>
  </div>
  <div class="field field--name-field-disciplinary-type">
    <div class="field--label">Type</div>
    <div class="field--item">CAUTION</div>
  </div>
  <div class="field field--name-field-case-number">
    <div class="field--label">Case</div>
    <div class="field--item">CPC-2025-028</div>
  </div>
  <div class="field field--name-field-date-filed">
    <div class="field--label">Date</div>
    <time datetime="2026-03-18T00:00:00Z">3/18/2026</time>
  </div>
  <div class="field field--name-field-attachment">
    <a href="https://www.arcourts.gov/sites/default/files/2025-028.pdf">PDF</a>
  </div>
</body></html>
`;

test('parseDetailPage extracts structured fields', () => {
  const d = parseDetailPage(FIXTURE_DETAIL);
  assert.equal(d.barNumber, '2024156');
  assert.equal(d.givenName, 'Emily');
  assert.equal(d.lastName, 'Reed');
  assert.equal(d.city, 'Little Rock');
  assert.equal(d.state, 'AR');
  assert.equal(d.zipCode, '72201');
  assert.equal(d.disciplinaryType, 'CAUTION');
  assert.equal(d.caseNumber, 'CPC-2025-028');
  assert.equal(d.dateFiled, '2026-03-18');
  assert.ok(d.pdfUrl.startsWith('https://www.arcourts.gov/'));
});

test('parseDetailPage tolerates missing fields', () => {
  const d = parseDetailPage('<html><body>No fields here</body></html>');
  assert.equal(d.barNumber, null);
  assert.equal(d.dateFiled, null);
});

test('parseDetailPage upgrades http PDF to https', () => {
  const html = FIXTURE_DETAIL.replace('https://www.arcourts.gov/', 'http://www.arcourts.gov/');
  const d = parseDetailPage(html);
  assert.ok(d.pdfUrl.startsWith('https://'));
});

// ── buildRecord ─────────────────────────────────────────────────────────────

const INDEX_ROW = {
  slug: '2025-028-consent-caution',
  href: '/administration/professional-conduct/opinions/2025-028-consent-caution',
  opinionNumber: '2025-028',
  sanctionLabel: 'CONSENT CAUTION',
  givenName: 'Emily Reed',
  city: 'Little Rock',
  state: 'AR',
  dateFiled: '03/18/2026',
};

const DETAIL = {
  barNumber: '2024156',
  dateFiled: '2026-03-18',
  caseNumber: 'CPC-2025-028',
  disciplinaryType: 'CAUTION',
  givenName: 'Emily',
  lastName: 'Reed',
  city: 'Little Rock',
  state: 'AR',
  zipCode: '72201',
  pdfUrl: 'https://www.arcourts.gov/sites/default/files/2025-028.pdf',
};

test('buildRecord prefers detail-page bar number over synthesis', () => {
  const r = buildRecord(
    INDEX_ROW,
    'https://www.arcourts.gov/administration/professional-conduct/opinions/2025-028-consent-caution',
    DETAIL,
  );
  assert.ok(r);
  assert.equal(r.bar_number, 'AR:2024156');
  assert.equal(r.full_name, 'Emily Reed');
  assert.equal(r.discipline_type, 'admonition'); // consent-caution → admonition
  assert.equal(r.order_date, '2026-03-18');
  assert.ok(r.source_url.startsWith('https://'));
  assert.ok(r.order_url.endsWith('.pdf'));
});

test('buildRecord falls back to opinion-number synthesis when detail missing', () => {
  const r = buildRecord(
    INDEX_ROW,
    'https://www.arcourts.gov/administration/professional-conduct/opinions/2025-028-consent-caution',
    null,
  );
  assert.ok(r);
  assert.equal(r.bar_number, 'AR:2025-028');
});

test('buildRecord returns null for reinstatement slug', () => {
  const r = buildRecord(
    { ...INDEX_ROW, slug: '2025-099-reinstatement', sanctionLabel: 'REINSTATEMENT' },
    'https://www.arcourts.gov/x',
    null,
  );
  assert.equal(r, null);
});

test('buildRecord uses HTTPS source_url even if input was http', () => {
  const r = buildRecord(
    INDEX_ROW,
    'http://www.arcourts.gov/administration/professional-conduct/opinions/2025-028-consent-caution',
    DETAIL,
  );
  assert.ok(r.source_url.startsWith('https://'));
});

test('buildRecord populates violation_summary with opinion number + sanction + city', () => {
  const r = buildRecord(
    INDEX_ROW,
    'https://www.arcourts.gov/x',
    DETAIL,
  );
  assert.ok(r.violation_summary.includes('2025-028'));
  assert.ok(r.violation_summary.includes('CAUTION'));
  assert.ok(r.violation_summary.includes('Little Rock'));
});
