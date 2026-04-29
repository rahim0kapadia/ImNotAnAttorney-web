// Template: scripts/ingest/scrape-mnsearch-discipline.mjs
// Pattern: gotcha-self-generated-fixture-passes-buggy-parser — fixture captured
//   2026-04-29 from live https://www.massbbo.org/s/decisions Apex Action JSON
//   response (real payload, real Salesforce object IDs).
// csv-bulk-checked: none-exists — fixtures are captured live JSON, not synthesized
// test-isolation-na: pure-function tests, no Supabase writes — load() exercised via dry-run + apply

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  disciplineFromFilename,
  extractYearFromCitation,
  extractAttorneyName,
  recordToDiscipline,
} from '../scrape-mabbo-discipline.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../__fixtures__/ma-bbo-sample.json'), 'utf8'),
);

// ── disciplineFromFilename ────────────────────────────────────────────────────

test('disciplineFromFilename — pr10-040 → public_reprimand', () => {
  assert.equal(disciplineFromFilename('https://www.massbbo.org/Files?fileName=pr10-040.pdf'), 'public_reprimand');
});

test('disciplineFromFilename — ad02-12 → admonition', () => {
  assert.equal(disciplineFromFilename('https://www.massbbo.org/Files?fileName=ad02-12.pdf'), 'admonition');
});

test('disciplineFromFilename — bd10-040 → unknown (BD prefix is broad)', () => {
  assert.equal(disciplineFromFilename('https://www.massbbo.org/Files?fileName=bd10-040.pdf'), 'unknown');
});

test('disciplineFromFilename — reinst14-002 → null (drop, not discipline)', () => {
  assert.equal(disciplineFromFilename('https://www.massbbo.org/Files?fileName=reinst14-002.pdf'), null);
});

test('disciplineFromFilename — null/empty → null (drop, no source available)', () => {
  assert.equal(disciplineFromFilename(null), null);
  assert.equal(disciplineFromFilename(''), null);
});

test('disciplineFromFilename — unmapped prefix → unknown', () => {
  assert.equal(disciplineFromFilename('https://www.massbbo.org/Files?fileName=xyz25-001.pdf'), 'unknown');
});

// ── extractYearFromCitation ───────────────────────────────────────────────────

test('extractYearFromCitation — single citation', () => {
  assert.equal(extractYearFromCitation("26 Mass. Att'y Disc. R. 1 (2010)"), 2010);
});

test('extractYearFromCitation — parallel citation (takes first)', () => {
  assert.equal(extractYearFromCitation("37 Mass. Att'y Disc. R. 1 (2021), 486 Mass. 1011 (2021)."), 2021);
});

test('extractYearFromCitation — placeholder page', () => {
  assert.equal(extractYearFromCitation("40 Mass. Att'y Disc. R. ___ (2024)"), 2024);
});

test('extractYearFromCitation — pre-1974 → null (BBO did not exist)', () => {
  assert.equal(extractYearFromCitation("1 Mass. Att'y Disc. R. 1 (1973)"), null);
});

test('extractYearFromCitation — null/empty → null', () => {
  assert.equal(extractYearFromCitation(null), null);
  assert.equal(extractYearFromCitation(''), null);
  assert.equal(extractYearFromCitation('no year here'), null);
});

// ── extractAttorneyName ───────────────────────────────────────────────────────

test('extractAttorneyName — basic', () => {
  assert.equal(extractAttorneyName('In the Matter of Robert J. Abalos'), 'Robert J. Abalos');
});

test('extractAttorneyName — with suffix', () => {
  assert.equal(extractAttorneyName('In the Matter of Antonio Abbene, Jr.'), 'Antonio Abbene, Jr.');
});

test('extractAttorneyName — Two Attorneys → null (not individual)', () => {
  assert.equal(extractAttorneyName('In the Matter of Two Attorneys'), null);
});

test('extractAttorneyName — Application for Criminal Complaint → null', () => {
  assert.equal(extractAttorneyName('In the Matter of an Application for a Criminal Complaint'), null);
});

test('extractAttorneyName — Discipline of an Attorney → null', () => {
  assert.equal(extractAttorneyName('In the Matter of Discipline of an Attorney for Reinstatement'), null);
});

test('extractAttorneyName — null/empty → null', () => {
  assert.equal(extractAttorneyName(null), null);
  assert.equal(extractAttorneyName(''), null);
  assert.equal(extractAttorneyName('Random non-prefix string'), null);
});

test('extractAttorneyName — single-token bare-noun cases rejected (Impoundment, Complaint)', () => {
  // Reviewer suggestion: bare-noun cases that strip down to one token after the
  // "In the Matter of " prefix must be rejected (no individual attorney to record).
  // The two-token whitespace check at the end of extractAttorneyName handles this.
  assert.equal(extractAttorneyName('In the Matter of Impoundment'), null);
  assert.equal(extractAttorneyName('In the Matter of Complaint'), null);
  assert.equal(extractAttorneyName('In the Matter of Sealed'), null);
});

// ── recordToDiscipline (integration) ─────────────────────────────────────────

test('recordToDiscipline — Abalos (bd10-040) → unknown discipline 2010', () => {
  const r = recordToDiscipline(FIXTURE[0]);
  assert.ok(r);
  assert.equal(r.full_name, 'Robert J. Abalos');
  assert.equal(r.bar_number, 'MABBO:a0W36000004ClrTEAS');
  assert.equal(r.discipline_type, 'unknown');
  assert.equal(r.order_date, '2010-01-01');
  assert.match(r.source_url, /^https:\/\/www\.massbbo\.org\//);
  assert.equal(r.order_url, r.source_url);
});

test('recordToDiscipline — Abbene (pr07-21) → public_reprimand 2007', () => {
  const r = recordToDiscipline(FIXTURE[1]);
  assert.ok(r);
  assert.equal(r.discipline_type, 'public_reprimand');
  assert.equal(r.order_date, '2007-01-01');
});

test('recordToDiscipline — Ablavsky pr24-07 → public_reprimand 2024', () => {
  const r = recordToDiscipline(FIXTURE[2]);
  assert.ok(r);
  assert.equal(r.discipline_type, 'public_reprimand');
  assert.equal(r.order_date, '2024-01-01');
});

test('recordToDiscipline — Ablitt with parallel citation → unknown 2021', () => {
  const r = recordToDiscipline(FIXTURE[3]);
  assert.ok(r);
  assert.equal(r.full_name, 'Steven A. Ablitt');
  assert.equal(r.order_date, '2021-01-01');
  assert.equal(r.discipline_type, 'unknown');
});

test('recordToDiscipline — "Two Attorneys" rejected (non-individual)', () => {
  const r = recordToDiscipline(FIXTURE[4]);
  assert.equal(r, null);
});

test('recordToDiscipline — Reinstatement filename rejected (not discipline)', () => {
  const r = recordToDiscipline(FIXTURE[5]);
  assert.equal(r, null);
});

test('recordToDiscipline — Abrams admonition (ad02-12) → admonition 2002', () => {
  const r = recordToDiscipline(FIXTURE[6]);
  assert.ok(r);
  assert.equal(r.discipline_type, 'admonition');
  assert.equal(r.full_name, 'Stuart R. Abrams');
});

test('recordToDiscipline — fabricated/invalid SF Id rejected', () => {
  const r = recordToDiscipline({
    Id: 'short',
    Case_Display_Label__c: 'In the Matter of Real Person',
    Citation__c: '1 Mass. Att\'y Disc. R. 1 (2020)',
    Document_Url__c: 'https://www.massbbo.org/Files?fileName=bd20-001.pdf',
  });
  assert.equal(r, null);
});

test('recordToDiscipline — http (non-https) source_url rejected', () => {
  const r = recordToDiscipline({
    Id: 'a0W36000004ClrTEAS',
    Case_Display_Label__c: 'In the Matter of Real Person',
    Citation__c: '1 Mass. Att\'y Disc. R. 1 (2020)',
    Document_Url__c: 'http://www.massbbo.org/Files?fileName=bd20-001.pdf',
  });
  assert.equal(r, null);
});

test('recordToDiscipline — missing year rejected (no fabrication)', () => {
  const r = recordToDiscipline({
    Id: 'a0W36000004ClrTEAS',
    Case_Display_Label__c: 'In the Matter of Real Person',
    Citation__c: 'No year here',
    Document_Url__c: 'https://www.massbbo.org/Files?fileName=bd20-001.pdf',
  });
  assert.equal(r, null);
});

test('recordToDiscipline — fixture batch yields 5 valid records', () => {
  let out = 0;
  for (const f of FIXTURE) {
    if (recordToDiscipline(f)) out++;
  }
  // 7 entries: Abalos, Abbene, Ablavsky, Ablitt, [Two Attorneys reject], [Reinst reject], Abrams = 5
  assert.equal(out, 5);
});
