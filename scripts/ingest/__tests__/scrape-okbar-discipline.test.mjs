// Template: scripts/ingest/__tests__/scrape-cobar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — self-contained unit test, synthetic fixtures
// test-isolation-na: read-only unit test, no Supabase writes
//
// Unit tests for scripts/ingest/scrape-okbar-discipline.mjs
// No network, no DB. Exercises parsing logic with synthetic CL JSON results.
//
// Anti-TN-bug guard: fixtures below are derived from VERIFIED LIVE CL responses
// captured 2026-04-27 (live-source URL probe via fetchJson). Field shapes
// (caseName format, docketNumber with <mark> tags, opinions[0].snippet
// presence) match the live API. Modifying these fixtures to make a parser
// change pass without re-validating against live source is the exact
// failure pattern this comment guards against.
//
// Usage: node --test scripts/ingest/__tests__/scrape-okbar-discipline.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  isScbdDocket,
  normalizeDiscipline,
  ALLOWED_DISCIPLINE_TYPES,
  buildRecordFromClResult,
} from '../scrape-okbar-discipline.mjs';

// ── isScbdDocket ────────────────────────────────────────────────────────────

test('isScbdDocket accepts standard SCBD-NNNN', () => {
  assert.ok(isScbdDocket('SCBD-7480'));
  assert.ok(isScbdDocket('SCBD-8073'));
  assert.ok(isScbdDocket('SCBD-7941'));
});

test('isScbdDocket accepts space-separated form', () => {
  assert.ok(isScbdDocket('SCBD 7480'));
});

test('isScbdDocket rejects empty / null / non-SCBD', () => {
  assert.equal(isScbdDocket(''), false);
  assert.equal(isScbdDocket(null), false);
  assert.equal(isScbdDocket('SCAD-1234'), false);
  assert.equal(isScbdDocket('1234'), false);
});

test('isScbdDocket is case-insensitive', () => {
  assert.ok(isScbdDocket('scbd-7480'));
});

// ── parseCaseName ───────────────────────────────────────────────────────────

test('parseCaseName strips full state-OBA caption', () => {
  const r = parseCaseName('STATE OF OKLAHOMA ex rel. OBA v. KLINE');
  assert.equal(r.fullName, 'Kline');
});

test('parseCaseName handles "ex rel." with comma variant', () => {
  const r = parseCaseName('STATE OF OKLAHOMA ex rel., OBA v. LILE');
  assert.equal(r.fullName, 'Lile');
});

test('parseCaseName handles long full name', () => {
  const r = parseCaseName('STATE ex rel. OKLAHOMA BAR ASSOCIATION v. LAW WATSON PRYOR MCMEANS');
  assert.equal(r.fullName, 'Law Watson Pryor Mcmeans');
});

test('parseCaseName rejects reversed caption (reinstatement)', () => {
  const r = parseCaseName('SMITH v. Oklahoma Bar Association');
  assert.equal(r.fullName, null);
});

test('parseCaseName rejects court phrase', () => {
  const r = parseCaseName('In re Rules of the Supreme Court');
  assert.equal(r.fullName, null);
});

// ── normalizeDiscipline ─────────────────────────────────────────────────────

test('normalizeDiscipline tags disbarment', () => {
  assert.equal(normalizeDiscipline('respondent is hereby disbarred from the practice').type, 'disbarment');
});

test('normalizeDiscipline tags interim suspension over generic suspension', () => {
  assert.equal(normalizeDiscipline('emergency interim suspension').type, 'interim_suspension');
});

test('normalizeDiscipline returns unknown for non-matching text', () => {
  assert.equal(normalizeDiscipline('the court holds that the case is dismissed').type, 'unknown');
});

// ── buildRecordFromClResult ─────────────────────────────────────────────────

test('buildRecordFromClResult accepts a real-shape CL result', () => {
  // Verified shape per live CL API 2026-04-27:
  //   docketNumber comes wrapped in <mark>SCBD</mark>-NNNN with highlight=on
  //   r.snippet is empty; opinion text is at r.opinions[0].snippet
  const sample = {
    caseName: 'STATE OF OKLAHOMA ex rel. OBA v. MORRIS',
    docketNumber: '<mark>SCBD</mark>-7961',
    dateFiled: '2025-12-15',
    absolute_url: '/opinion/10773902/state-of-oklahoma-ex-rel-oba-v-morris/',
    snippet: '',
    opinions: [
      {
        snippet: 'STATE OF OKLAHOMA ex rel. OBA v. MORRIS  Decided 12/15/2025  ' +
                 'Respondent is hereby disbarred from the practice of law.',
      },
    ],
  };
  const r = buildRecordFromClResult(sample, 'disbarment');
  assert.ok(r);
  assert.equal(r.bar_number, 'OKSCBD:SCBD-7961');
  assert.equal(r.full_name, 'Morris');
  assert.equal(r.discipline_type, 'disbarment');
  assert.equal(r.order_date, '2025-12-15');
  assert.ok(r.source_url.startsWith('https://www.courtlistener.com/opinion/'));
});

test('buildRecordFromClResult returns null for non-SCBD docket', () => {
  const r = buildRecordFromClResult({
    caseName: 'STATE v. SMITH',
    docketNumber: 'CR-2024-001',
    dateFiled: '2024-01-01',
    absolute_url: '/opinion/1/foo/',
    opinions: [{ snippet: 'disbarred' }],
  }, 'disbarment');
  assert.equal(r, null);
});

test('buildRecordFromClResult returns null when source_url is missing (no fabrication)', () => {
  const r = buildRecordFromClResult({
    caseName: 'STATE OF OKLAHOMA ex rel. OBA v. SMITH',
    docketNumber: 'SCBD-1234',
    dateFiled: '2024-01-01',
    absolute_url: null,
    opinions: [{ snippet: 'disbarred' }],
  }, 'disbarment');
  assert.equal(r, null);
});

test('buildRecordFromClResult returns null when sanction not in allowed set', () => {
  const r = buildRecordFromClResult({
    caseName: 'STATE OF OKLAHOMA ex rel. OBA v. SMITH',
    docketNumber: 'SCBD-1234',
    dateFiled: '2024-01-01',
    absolute_url: '/opinion/1/foo/',
    opinions: [{ snippet: 'disbarred' }],
  }, 'fake_type');
  assert.equal(r, null);
});

test('ALLOWED_DISCIPLINE_TYPES contains expected enum values', () => {
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('disbarment'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('suspension'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('public_reprimand'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('censure'));
  assert.ok(!ALLOWED_DISCIPLINE_TYPES.has('fake_type'));
});
