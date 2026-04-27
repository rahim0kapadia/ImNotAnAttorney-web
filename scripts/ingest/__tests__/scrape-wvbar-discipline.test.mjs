// Template: scripts/ingest/__tests__/scrape-ctbar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — self-contained unit test, fixtures derived from live CL responses 2026-04-27
// test-isolation-na: read-only unit test, no Supabase writes
//
// Unit tests for scripts/ingest/scrape-wvbar-discipline.mjs
//
// Anti-TN-bug guard: fixtures derived from VERIFIED LIVE CL responses 2026-04-27.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  isWvDocket,
  normalizeWvDocket,
  normalizeDiscipline,
  ALLOWED_DISCIPLINE_TYPES,
  buildRecordFromClResult,
} from '../scrape-wvbar-discipline.mjs';

test('isWvDocket accepts NN-NNN and NN-NNNN forms', () => {
  assert.ok(isWvDocket('24-376'));
  assert.ok(isWvDocket('22-916'));
  assert.ok(isWvDocket('18-0363'));
  assert.ok(isWvDocket('21-0590'));
});

test('isWvDocket rejects empty / non-WV', () => {
  assert.equal(isWvDocket(''), false);
  assert.equal(isWvDocket('SCBD-1234'), false);
  assert.equal(isWvDocket('FOO123'), false);
});

test('normalizeWvDocket strips marks and whitespace', () => {
  assert.equal(normalizeWvDocket('<mark>24-376</mark>'), '24-376');
  assert.equal(normalizeWvDocket('  18-0363  '), '18-0363');
});

test('parseCaseName accepts Lawyer Disciplinary Board v. <Name>', () => {
  assert.equal(parseCaseName('Lawyer Disciplinary Board v. Phillip s. Isner').fullName, 'Phillip s. Isner');
  assert.equal(parseCaseName('Lawyer Disciplinary Board v. Vickie L. Hylton').fullName, 'Vickie L. Hylton');
});

test('parseCaseName accepts Office of Lawyer Disciplinary Counsel v. <Name>', () => {
  assert.equal(
    parseCaseName('Office of Lawyer Disciplinary Counsel v. M. Paul Marteney, a Suspended Member of the West Virginia State Bar').fullName,
    'M. Paul Marteney',
  );
});

test('parseCaseName rejects In re Petition for Reinstatement', () => {
  assert.equal(parseCaseName('In re Petition for Reinstatement of Edward Raymond Kohout').fullName, null);
  assert.equal(parseCaseName('In re Petition for Reinstatement of C. Michael Sparks').fullName, null);
});

test('parseCaseName rejects ex rel mandamus', () => {
  assert.equal(
    parseCaseName('State of West Virginia ex rel. The Honorable Timothy L. Sweeney v. William Mundy').fullName,
    null,
  );
});

test('parseCaseName rejects judicial discipline', () => {
  assert.equal(
    parseCaseName('In the Matter of the Honorable Deanna R. Rock, Family Court Judge').fullName,
    null,
  );
});

test('parseCaseName rejects non-discipline cases mentioning the board', () => {
  assert.equal(parseCaseName('State of West Virginia v. Tex G. H. II').fullName, null);
  assert.equal(parseCaseName('Donald Dunn v. Jonathan Frame, Superintendent').fullName, null);
});

test('parseCaseName rejects CLE Commission cases', () => {
  assert.equal(
    parseCaseName('West Virginia Continuing Legal Education Commission v. Gregory J. Campbell').fullName,
    null,
  );
});

test('buildRecordFromClResult accepts a real-shape WV CL result', () => {
  const sample = {
    caseName: '<mark>Lawyer Disciplinary Board</mark> v. Phillip s. Isner',
    docketNumber: '24-376',
    dateFiled: '2026-03-27',
    absolute_url: '/opinion/10842695/lawyer-disciplinary-board-v-phillip-s-isner/',
    snippet: '',
    opinions: [{ snippet: 'WEST VIRGINIA <mark>LAWYER DISCIPLINARY BOARD</mark>, Petitioner. The respondent is hereby suspended.' }],
  };
  const r = buildRecordFromClResult(sample, 'suspension');
  assert.ok(r);
  assert.equal(r.bar_number, 'WVSC:24-376');
  assert.equal(r.full_name, 'Phillip s. Isner');
  assert.equal(r.discipline_type, 'suspension');
  assert.ok(r.source_url.startsWith('https://www.courtlistener.com/'));
});

test('buildRecordFromClResult rejects reinstatement caption', () => {
  const sample = {
    caseName: 'In re Petition for Reinstatement of Edward Raymond Kohout',
    docketNumber: '21-1033',
    dateFiled: '2025-06-10',
    absolute_url: '/opinion/10601811/foo/',
    opinions: [{ snippet: 'reinstatement granted' }],
  };
  assert.equal(buildRecordFromClResult(sample, 'suspension'), null);
});

test('buildRecordFromClResult rejects missing source_url', () => {
  const sample = {
    caseName: 'Lawyer Disciplinary Board v. Smith',
    docketNumber: '23-001',
    dateFiled: '2024-01-01',
    absolute_url: null,
    opinions: [{ snippet: 'suspended' }],
  };
  assert.equal(buildRecordFromClResult(sample, 'suspension'), null);
});

test('normalizeDiscipline maps standard sanctions', () => {
  assert.equal(normalizeDiscipline('annulment of license').type, 'disbarment');
  assert.equal(normalizeDiscipline('disbarred').type, 'disbarment');
  assert.equal(normalizeDiscipline('suspended for two years').type, 'suspension');
  assert.equal(normalizeDiscipline('publicly censured').type, 'censure');
});

test('ALLOWED_DISCIPLINE_TYPES sane', () => {
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('disbarment'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('public_reprimand'));
  assert.ok(!ALLOWED_DISCIPLINE_TYPES.has('fake'));
});
