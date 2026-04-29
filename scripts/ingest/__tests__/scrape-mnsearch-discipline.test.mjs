// Template: scripts/ingest/scrape-mabar-discipline.mjs (CL discipline mapping pattern)
// Pattern: cl-bulk-data-defensive #18; gotcha-self-generated-fixture-passes-buggy-parser
// csv-bulk-checked: none-exists — fixture captured 2026-04-29 from live POST /Search/Detail
//   on https://lawyersearch.mncourts.gov/ for marsNumber 0387795 (Paul R. Hansmeier).
// test-isolation-na: pure-function tests, no Supabase writes — load() exercised manually via dry-run + apply
//
// Unit tests for scripts/ingest/scrape-mnsearch-discipline.mjs.
// No network, no DB — exercises pure functions against the Hansmeier live fixture.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  mapDiscipline,
  normalizeDetDate,
  buildFullName,
  buildBarNumber,
  detailToRecords,
  extractMarsIds,
  extractMarsRowsFromSearch,
} from '../scrape-mnsearch-discipline.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../__fixtures__/mn-search-hansmeier.json'), 'utf8'),
);

// ── mapDiscipline ────────────────────────────────────────────────────────────

test('mapDiscipline — Disbarment → disbarment', () => {
  assert.equal(mapDiscipline('Disbarment'), 'disbarment');
});

test('mapDiscipline — Stayed Disbarment → disbarment', () => {
  assert.equal(mapDiscipline('Stayed Disbarment'), 'disbarment');
});

test('mapDiscipline — Suspension → suspension', () => {
  assert.equal(mapDiscipline('Suspension'), 'suspension');
});

test('mapDiscipline — Interim Suspension → interim_suspension', () => {
  assert.equal(mapDiscipline('Interim Suspension'), 'interim_suspension');
});

test('mapDiscipline — Public Reprimand → public_reprimand', () => {
  assert.equal(mapDiscipline('Public Reprimand'), 'public_reprimand');
});

test('mapDiscipline — Reprimand/Probation → public_reprimand', () => {
  assert.equal(mapDiscipline('Reprimand/Probation'), 'public_reprimand');
});

test('mapDiscipline — Probation → probation', () => {
  assert.equal(mapDiscipline('Probation'), 'probation');
});

test('mapDiscipline — Disability Status → disability_inactive', () => {
  assert.equal(mapDiscipline('Disability Status'), 'disability_inactive');
});

test('mapDiscipline — Reciprocal Discipline → reciprocal_discipline', () => {
  assert.equal(mapDiscipline('Reciprocal Discipline'), 'reciprocal_discipline');
});

test('mapDiscipline — Reinstated → null (NOT a discipline event)', () => {
  assert.equal(mapDiscipline('Reinstated'), null);
});

test('mapDiscipline — Reinstatement/Probation → null', () => {
  assert.equal(mapDiscipline('Reinstatement/Probation'), null);
});

test('mapDiscipline — Petition for Reinstatement Denied → null', () => {
  assert.equal(mapDiscipline('Petition for Reinstatement Denied'), null);
});

test('mapDiscipline — empty/null → null (never fabricate)', () => {
  assert.equal(mapDiscipline(''), null);
  assert.equal(mapDiscipline(null), null);
  assert.equal(mapDiscipline(undefined), null);
});

test('mapDiscipline — unknown string → null (drop, never fabricate)', () => {
  assert.equal(mapDiscipline('Some Random String'), null);
  assert.equal(mapDiscipline('xyzzy'), null);
});

// ── normalizeDetDate ─────────────────────────────────────────────────────────

test('normalizeDetDate — MM/DD/YYYY → ISO YYYY-MM-DD', () => {
  assert.equal(normalizeDetDate('04/22/2020'), '2020-04-22');
  assert.equal(normalizeDetDate('09/12/2016'), '2016-09-12');
  assert.equal(normalizeDetDate('1/5/2019'), '2019-01-05');
});

test('normalizeDetDate — invalid date → null (no fabrication)', () => {
  assert.equal(normalizeDetDate('13/45/2020'), null);
  assert.equal(normalizeDetDate('not-a-date'), null);
  assert.equal(normalizeDetDate(''), null);
  assert.equal(normalizeDetDate(null), null);
  assert.equal(normalizeDetDate('2020-04-22'), null); // wrong format
});

test('normalizeDetDate — Feb 30 → null (real calendar validation)', () => {
  assert.equal(normalizeDetDate('02/30/2020'), null);
});

// ── buildFullName ────────────────────────────────────────────────────────────

test('buildFullName — Hansmeier (Paul Robert)', () => {
  assert.equal(buildFullName(FIXTURE[0]), 'Paul Robert Hansmeier');
});

test('buildFullName — handles suffix', () => {
  const r = buildFullName({ attFirstName: 'JOHN', attMiddleName: '', attLastName: 'SMITH', attSuffName: 'JR' });
  assert.match(r, /Smith/);
  assert.match(r, /Jr\./);
});

test('buildFullName — handles hyphenated last name', () => {
  const r = buildFullName({ attFirstName: 'JANE', attMiddleName: '', attLastName: 'SMITH-JONES', attSuffName: '' });
  assert.equal(r, 'Jane Smith-Jones');
});

test("buildFullName — handles apostrophe in last name", () => {
  const r = buildFullName({ attFirstName: 'PAT', attMiddleName: '', attLastName: "O'BRIEN", attSuffName: '' });
  assert.match(r, /O'Brien/);
});

// ── buildBarNumber ───────────────────────────────────────────────────────────

test('buildBarNumber — strips trailing whitespace (live fixture has spaces)', () => {
  assert.equal(buildBarNumber('0387795   '), 'MN:0387795');
});

test('buildBarNumber — invalid input → null (no fabrication)', () => {
  assert.equal(buildBarNumber(''), null);
  assert.equal(buildBarNumber('abc'), null);
  assert.equal(buildBarNumber('123'), null); // too short
  assert.equal(buildBarNumber(null), null);
});

// ── detailToRecords (the integration of all of the above) ────────────────────

test('detailToRecords — Hansmeier yields 2 discipline events (1 disbarment, 1 suspension)', () => {
  const records = detailToRecords(FIXTURE[0]);
  assert.equal(records.length, 2);
  const types = records.map((r) => r.discipline_type).sort();
  assert.deepEqual(types, ['disbarment', 'suspension']);
});

test('detailToRecords — Hansmeier disbarment has correct order_date 2020-04-22', () => {
  const records = detailToRecords(FIXTURE[0]);
  const dis = records.find((r) => r.discipline_type === 'disbarment');
  assert.ok(dis);
  assert.equal(dis.order_date, '2020-04-22');
  assert.equal(dis.full_name, 'Paul Robert Hansmeier');
  assert.equal(dis.bar_number, 'MN:0387795');
});

test('detailToRecords — every record has source_url HTTPS + matches lawyersearch.mncourts.gov', () => {
  const records = detailToRecords(FIXTURE[0]);
  for (const r of records) {
    assert.match(r.source_url, /^https:\/\/lawyersearch\.mncourts\.gov\//);
  }
});

test('detailToRecords — violation_summary includes Rule descriptions', () => {
  const records = detailToRecords(FIXTURE[0]);
  const dis = records.find((r) => r.discipline_type === 'disbarment');
  assert.match(dis.violation_summary, /Rule 8\.4\(c\)/);
  assert.match(dis.violation_summary, /Prejudicial Misconduct/);
});

test('detailToRecords — order_url is null (docURL serving endpoint undocumented)', () => {
  const records = detailToRecords(FIXTURE[0]);
  for (const r of records) {
    assert.equal(r.order_url, null);
  }
});

test('detailToRecords — Reinstated decision is filtered out (not fabricated as discipline)', () => {
  const synthetic = {
    ...FIXTURE[0],
    decisions: [
      { caseNumber: 'A21-9999', detDate: '01/15/2022', detDesc: 'Reinstated', docURL: 'X.pdf', ruleViolations: [] },
      { caseNumber: 'A20-1111', detDate: '03/03/2021', detDesc: 'Disbarment', docURL: 'Y.pdf', ruleViolations: [] },
    ],
  };
  const r = detailToRecords(synthetic);
  assert.equal(r.length, 1);
  assert.equal(r[0].discipline_type, 'disbarment');
});

test('detailToRecords — invalid date → drops the row (never fabricate)', () => {
  const synthetic = {
    ...FIXTURE[0],
    decisions: [
      { caseNumber: 'X', detDate: '99/99/9999', detDesc: 'Suspension', docURL: 'X.pdf', ruleViolations: [] },
    ],
  };
  assert.equal(detailToRecords(synthetic).length, 0);
});

test('detailToRecords — null/empty detail → []', () => {
  assert.deepEqual(detailToRecords(null), []);
  assert.deepEqual(detailToRecords({}), []);
  assert.deepEqual(detailToRecords({ decisions: null }), []);
});

// ── extractMarsIds (HTML parser) ──────────────────────────────────────────────

test('extractMarsIds — parses openmodal calls', () => {
  const html = `
    <button id="0387795" onclick="openmodal('0387795')">...</button>
    <button id="0040770" onclick="openmodal(&quot;0040770&quot;)">...</button>
    <button id="0388524" onclick='openmodal("0388524")'>...</button>
  `;
  const ids = extractMarsIds(html);
  assert.deepEqual(ids.sort(), ['0040770', '0388524', '0387795'].sort());
});

test('extractMarsIds — empty/null HTML → []', () => {
  assert.deepEqual(extractMarsIds(''), []);
  assert.deepEqual(extractMarsIds(null), []);
});

test('extractMarsIds — dedupes', () => {
  const html = `
    <button id="0387795" onclick="openmodal('0387795')">...</button>
    <button id="0387795" onclick="openmodal('0387795')">...</button>
  `;
  assert.deepEqual(extractMarsIds(html), ['0387795']);
});

// ── extractMarsRowsFromSearch (production response, captured 2026-04-29) ─────

const SEARCH_FIXTURE = `
<table id="searchResults" class="table table-striped">
<thead><tr><th>Detail</th><th>Attorney Name</th><th>Date Admitted to MN Bar</th>
<th>Authorized to practice in MN?</th><th>Public decision issued?</th><th>City</th>
<th>State</th><th>marsNumber</th></tr></thead>
<tbody>
<tr><td>*</td><td>ZABEL, JOLENA MARIE</td><td>05/03/2022</td><td>YES</td><td>NO</td><td>Minneapolis</td><td>MN</td><td>0403132   </td></tr>
<tr><td>*</td><td>HANSMEIER, PAUL ROBERT</td><td>10/26/2007</td><td>NO</td><td>YES</td><td>MINNEAPOLIS</td><td>MN</td><td>0387795   </td></tr>
<tr><td>*</td><td>ZABEL, MATTHEW LANE</td><td>02/18/2020</td><td>YES</td><td>NO</td><td>Edina</td><td>MN</td><td>0401389   </td></tr>
</tbody>
</table>
`;

test('extractMarsRowsFromSearch — parses 3 rows + extracts marsNumber/hasDecision', () => {
  const rows = extractMarsRowsFromSearch(SEARCH_FIXTURE);
  assert.equal(rows.length, 3);
  const ids = rows.map((r) => r.marsId).sort();
  assert.deepEqual(ids, ['0387795', '0401389', '0403132']);
});

test('extractMarsRowsFromSearch — hasDecision=true only for Hansmeier (column-5 YES)', () => {
  const rows = extractMarsRowsFromSearch(SEARCH_FIXTURE);
  const withDecision = rows.filter((r) => r.hasDecision);
  assert.equal(withDecision.length, 1);
  assert.equal(withDecision[0].marsId, '0387795');
  assert.match(withDecision[0].attName, /HANSMEIER/);
});

test('extractMarsRowsFromSearch — extractMarsIds also picks up server-rendered table rows', () => {
  const ids = extractMarsIds(SEARCH_FIXTURE);
  assert.deepEqual(ids.sort(), ['0387795', '0401389', '0403132']);
});

test('extractMarsIds — dedupes when both modal-button AND table row reference same id', () => {
  // Reviewer suggestion: dual-mode extraction (legacy openmodal AND #searchResults
  // table) must dedupe via Set even when the same MarsId appears in both forms.
  const dual = `
    <button id="0387795" onclick="openmodal('0387795')">...</button>
    <table id="searchResults"><tbody>
      <tr><td>*</td><td>HANSMEIER, PAUL ROBERT</td><td>10/26/2007</td>
        <td>NO</td><td>YES</td><td>MINNEAPOLIS</td><td>MN</td><td>0387795   </td></tr>
    </tbody></table>
  `;
  const ids = extractMarsIds(dual);
  assert.deepEqual(ids, ['0387795']);
});
