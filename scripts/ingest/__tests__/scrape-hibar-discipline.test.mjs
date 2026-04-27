// Template: scripts/ingest/__tests__/scrape-ctbar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — self-contained unit test, fixtures derived from live CL responses 2026-04-27
// test-isolation-na: read-only unit test, no Supabase writes
//
// Unit tests for scripts/ingest/scrape-hibar-discipline.mjs
//
// Anti-TN-bug guard: fixtures derived from VERIFIED LIVE CL responses 2026-04-27.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  isHiDocket,
  normalizeHiDocket,
  normalizeDiscipline,
  ALLOWED_DISCIPLINE_TYPES,
  buildRecordFromClResult,
} from '../scrape-hibar-discipline.mjs';

test('isHiDocket accepts SCAD/SCPR/SCPW with NN-NNNNNNN form', () => {
  assert.ok(isHiDocket('SCAD-25-0000205'));
  assert.ok(isHiDocket('SCPR-25-0000804'));
  assert.ok(isHiDocket('SCPW-24-0000463'));
});

test('isHiDocket rejects empty / non-HI', () => {
  assert.equal(isHiDocket(''), false);
  assert.equal(isHiDocket('SCBD-1234'), false);
  assert.equal(isHiDocket('FOO123'), false);
});

test('normalizeHiDocket uppercases + strips marks', () => {
  assert.equal(normalizeHiDocket('<mark>SCAD-25-0000205</mark>'), 'SCAD-25-0000205');
  assert.equal(normalizeHiDocket('scpr-22-0000099'), 'SCPR-22-0000099');
});

test('parseCaseName accepts Office of Disciplinary Counsel v. <Name>', () => {
  assert.equal(parseCaseName('Office of Disciplinary Counsel v. Hayashi').fullName, 'Hayashi');
  assert.equal(parseCaseName('Office of Disciplinary Counsel v. Leong').fullName, 'Leong');
  assert.equal(parseCaseName("Office of Disciplinary Counsel v. Ka'iama").fullName, "Ka'iama");
});

test('parseCaseName accepts Disciplinary Board of the Hawaii SC v. <Name>', () => {
  assert.equal(
    parseCaseName("Disciplinary Board of the Hawai'i Supreme Court v. Collins, II").fullName,
    'Collins, II',
  );
});

test('parseCaseName accepts In re: <Name>', () => {
  assert.equal(parseCaseName('In re: Kidani').fullName, 'Kidani');
  assert.equal(parseCaseName('In re: Long').fullName, 'Long');
});

test('parseCaseName strips trailing Opinion By and concurring tags', () => {
  assert.equal(
    parseCaseName('Office of Disciplinary Counsel v. Zenger. Opinion by Recktenwald, C.J., Concurring in Part [ada].').fullName,
    'Zenger',
  );
});

test('parseCaseName rejects reverse caption (Jeffries v. ODC)', () => {
  assert.equal(parseCaseName('Jeffries v. Office of Disciplinary Counsel').fullName, null);
});

test('parseCaseName rejects challenge to Disciplinary Board', () => {
  assert.equal(
    parseCaseName("Melnychuk-Beselt v. Disciplinary Board of the Hawai'i Supreme Court").fullName,
    null,
  );
});

test('parseCaseName rejects unrelated names (Li v. Elefante)', () => {
  // ODC is mentioned in opinion text but caption does not match — must reject.
  assert.equal(parseCaseName('Li v. Elefante').fullName, null);
  assert.equal(parseCaseName('Nice v. Valenciano').fullName, null);
});

test('buildRecordFromClResult accepts a real-shape HI CL result', () => {
  const sample = {
    caseName: '<mark>Office of Disciplinary Counsel</mark> v. Hayashi',
    docketNumber: 'SCPR-25-0000804',
    dateFiled: '2025-12-19',
    absolute_url: '/opinion/10762002/office-of-disciplinary-counsel-v-hayashi/',
    snippet: '',
    opinions: [{ snippet: 'STATE OF HAWAIʻI <mark>OFFICE OF DISCIPLINARY COUNSEL</mark>, Petitioner. Suspended.' }],
  };
  const r = buildRecordFromClResult(sample, 'suspension');
  assert.ok(r);
  assert.equal(r.bar_number, 'HISC:SCPR-25-0000804');
  assert.equal(r.full_name, 'Hayashi');
  assert.equal(r.discipline_type, 'suspension');
  assert.ok(r.source_url.startsWith('https://www.courtlistener.com/'));
});

test('buildRecordFromClResult rejects reverse caption', () => {
  const sample = {
    caseName: 'Jeffries v. Office of Disciplinary Counsel',
    docketNumber: 'SCPW-24-0000463',
    dateFiled: '2025-01-09',
    absolute_url: '/opinion/10311391/jeffries-v-office-of-disciplinary-counsel/',
    opinions: [{ snippet: 'OFFICE OF DISCIPLINARY COUNSEL, Respondent.' }],
  };
  assert.equal(buildRecordFromClResult(sample, 'suspension'), null);
});

test('buildRecordFromClResult rejects bad docket', () => {
  const sample = {
    caseName: 'Office of Disciplinary Counsel v. Smith',
    docketNumber: 'BAD-DOCKET',
    dateFiled: '2024-01-01',
    absolute_url: '/opinion/x/',
    opinions: [{ snippet: 'suspended' }],
  };
  assert.equal(buildRecordFromClResult(sample, 'suspension'), null);
});

test('normalizeDiscipline maps standard sanctions', () => {
  assert.equal(normalizeDiscipline('disbarred').type, 'disbarment');
  assert.equal(normalizeDiscipline('public censure').type, 'censure');
  assert.equal(normalizeDiscipline('informal admonition').type, 'admonition');
});

test('ALLOWED_DISCIPLINE_TYPES sane', () => {
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('disbarment'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('reciprocal_discipline'));
  assert.ok(!ALLOWED_DISCIPLINE_TYPES.has('fake'));
});
