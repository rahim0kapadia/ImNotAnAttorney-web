import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseRespondent, parseDate, normalizeDiscipline, extractEntriesFromHtml,
  buildRecord, ALLOWED_DISCIPLINE_TYPES,
} from '../scrape-mebar-discipline.mjs';

test('parseRespondent — plain name', () => {
  assert.equal(parseRespondent('Thomas S. Karod').fullName, 'Thomas S. Karod');
});

test('parseRespondent — strips In re: prefix', () => {
  assert.equal(parseRespondent('In re: Margaret P. Shalhoob').fullName, 'Margaret P. Shalhoob');
  assert.equal(parseRespondent('In Re: Stephen D. Bither, Esq.').fullName, 'Stephen D. Bither');
});

test('parseRespondent — strips Petition for Reinstatement of', () => {
  assert.equal(
    parseRespondent('In re: Petition for Reinstatement of Seth T. Carey').fullName,
    'Seth T. Carey',
  );
});

test('parseRespondent — strips trailing Esq.', () => {
  assert.equal(parseRespondent('In re: Daniel C. Purdy, Esq.').fullName, 'Daniel C. Purdy');
  assert.equal(parseRespondent('John Doe, Esquire').fullName, 'John Doe');
});

test('parseRespondent — rejects single-word', () => {
  assert.equal(parseRespondent('Smith').fullName, null);
});

test('parseRespondent — rejects empty / placeholders', () => {
  assert.equal(parseRespondent('').fullName, null);
  assert.equal(parseRespondent('Anonymous').fullName, null);
  assert.equal(parseRespondent('N/A').fullName, null);
});

test('parseRespondent — strips wrapping HTML', () => {
  assert.equal(
    parseRespondent('<td>In re: <strong>Jane Doe</strong>, Esq.</td>').fullName,
    'Jane Doe',
  );
});

test('parseDate — M/D/YYYY', () => {
  assert.equal(parseDate('4/7/2026'), '2026-04-07');
  assert.equal(parseDate('12/15/2025'), '2025-12-15');
  assert.equal(parseDate('1/1/2000'), '2000-01-01');
});

test('parseDate — M/D/YY century heuristic', () => {
  assert.equal(parseDate('1/1/00'), '2000-01-01');
  assert.equal(parseDate('12/31/99'), '1999-12-31');
  assert.equal(parseDate('6/15/30'), '2030-06-15');
  assert.equal(parseDate('6/15/31'), '1931-06-15');
});

test('parseDate — invalid input returns null', () => {
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('abc'), null);
  assert.equal(parseDate('2026-04-15'), null); // ISO not supported
});

test('normalizeDiscipline — canonical sanctions', () => {
  assert.equal(normalizeDiscipline('Disbarment').type, 'disbarment');
  assert.equal(normalizeDiscipline('Suspension').type, 'suspension');
  assert.equal(normalizeDiscipline('Immediate Interim Suspension').type, 'interim_suspension');
  assert.equal(normalizeDiscipline('Public Reprimand').type, 'public_reprimand');
  assert.equal(normalizeDiscipline('Reprimand').type, 'public_reprimand');
  assert.equal(normalizeDiscipline('Admonition').type, 'admonition');
  assert.equal(normalizeDiscipline('Reciprocal Discipline').type, 'reciprocal_discipline');
  assert.equal(normalizeDiscipline('Order of Surrender').type, 'resignation_with_charges');
});

test('normalizeDiscipline — unknown for non-sanction prose', () => {
  assert.equal(normalizeDiscipline('Receiver Appointment').type, 'unknown');
  assert.equal(normalizeDiscipline('Order for Appointment of Co-Receivers').type, 'unknown');
  assert.equal(normalizeDiscipline('').type, 'unknown');
});

test('extractEntriesFromHtml — parses 5-cell rows in year tables', () => {
  const html = `
<table id="2026">
  <tr><th>Date</th><th>Respondent</th><th>Issued By</th><th>Order</th><th>Disposition</th></tr>
  <tr>
    <td>4/7/2026</td>
    <td>Thomas S. Karod</td>
    <td>Single Justice</td>
    <td><a href="https://www.maine.gov/tools/whatsnew/attach.php?id=13346834&an=1">Disbarment [PDF]</a></td>
    <td>Immediate Disciplinary Disbarment</td>
  </tr>
  <tr>
    <td>3/2/2026</td>
    <td>Dennis Hamrick</td>
    <td>Single Justice</td>
    <td><a href="https://www.maine.gov/tools/whatsnew/attach.php?id=13345114&an=1">Suspension Sanction Order [PDF]</a></td>
    <td>Suspension</td>
  </tr>
</table>`;
  const entries = extractEntriesFromHtml(html);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].full_name, 'Thomas S. Karod');
  assert.equal(entries[0].order_date, '2026-04-07');
  assert.equal(entries[0].discipline_type, 'disbarment');
  assert.equal(entries[0].order_url, 'https://www.maine.gov/tools/whatsnew/attach.php?id=13346834&an=1');
  assert.equal(entries[1].full_name, 'Dennis Hamrick');
  assert.equal(entries[1].discipline_type, 'suspension');
});

test('extractEntriesFromHtml — skips header rows', () => {
  const html = `
<table id="2025">
  <tr>
    <td>not-a-date</td>
    <td>header-respondent</td>
    <td>header-issuer</td>
    <td>header-order</td>
    <td>header-disposition</td>
  </tr>
  <tr>
    <td>1/1/2025</td>
    <td>Real Person</td>
    <td>Single Justice</td>
    <td><a href="https://x.com/foo">Suspension [PDF]</a></td>
    <td>Suspension</td>
  </tr>
</table>`;
  const entries = extractEntriesFromHtml(html);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].full_name, 'Real Person');
});

test('buildRecord — synthesizes deterministic me-name bar_number', () => {
  const e = {
    year: '2026',
    order_date: '2026-04-07',
    full_name: 'Thomas S. Karod',
    sanction_text: 'Disbarment',
    disposition: 'Immediate Disciplinary Disbarment',
    issued_by: 'Single Justice',
    order_url: 'https://www.maine.gov/tools/whatsnew/attach.php?id=13346834&an=1',
    discipline_type: 'disbarment',
    discipline_raw: 'Disbarment Immediate Disciplinary Disbarment',
  };
  const rec = buildRecord(e);
  assert.ok(rec);
  assert.match(rec.bar_number, /^me-name-[a-f0-9]{12}$/);
  assert.equal(rec.full_name, 'Thomas S. Karod');
  assert.equal(rec.discipline_type, 'disbarment');
  assert.equal(rec.source_url, 'https://www.mebaroverseers.org/dah_schedule/court_grievance_decisions.html');
  assert.equal(rec.order_url, 'https://www.maine.gov/tools/whatsnew/attach.php?id=13346834&an=1');
});

test('buildRecord — drops unknown discipline_type', () => {
  const e = {
    year: '2026',
    order_date: '2026-04-15',
    full_name: 'Margaret P. Shalhoob',
    sanction_text: 'Receiver Appointment',
    disposition: 'Order for Appointment of Co-Receivers',
    issued_by: 'Single Justice',
    order_url: 'https://x.com/foo',
    discipline_type: 'unknown',
    discipline_raw: 'Receiver Appointment',
  };
  assert.equal(buildRecord(e), null);
});

test('buildRecord — same name → same bar_number (idempotent)', () => {
  const e1 = {
    year: '2026', order_date: '2026-04-07', full_name: 'Thomas S. Karod',
    sanction_text: 'Disbarment', disposition: '', issued_by: '',
    order_url: null, discipline_type: 'disbarment', discipline_raw: 'Disbarment',
  };
  const e2 = { ...e1, year: '2025', order_date: '2025-12-01' };
  assert.equal(buildRecord(e1).bar_number, buildRecord(e2).bar_number);
});

test('buildRecord — different normalized names → different bar_numbers', () => {
  const a = buildRecord({
    year: '2026', order_date: '2026-04-07', full_name: 'John Doe',
    sanction_text: 'Disbarment', disposition: '', issued_by: '',
    order_url: null, discipline_type: 'disbarment', discipline_raw: 'Disbarment',
  });
  const b = buildRecord({
    year: '2026', order_date: '2026-04-07', full_name: 'Jane Doe',
    sanction_text: 'Disbarment', disposition: '', issued_by: '',
    order_url: null, discipline_type: 'disbarment', discipline_raw: 'Disbarment',
  });
  assert.notEqual(a.bar_number, b.bar_number);
});

test('ALLOWED_DISCIPLINE_TYPES includes the canonical set', () => {
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('disbarment'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('suspension'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('public_reprimand'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('admonition'));
});
