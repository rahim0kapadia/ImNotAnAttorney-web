// Template: scripts/ingest/__tests__/scrape-okbar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — self-contained unit test, synthetic fixtures
// test-isolation-na: read-only unit test, no Supabase writes
//
// Unit tests for scripts/ingest/scrape-msbar-discipline.mjs
// No network, no DB. Exercises parsing logic with synthetic CL JSON results.
//
// Anti-TN-bug guard: fixtures derived from VERIFIED LIVE CL responses
// captured 2026-04-27 (live-source URL probe). Field shapes match live API.
//
// Usage: node --test scripts/ingest/__tests__/scrape-msbar-discipline.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  isMsBdDocket,
  isMsBrDocket,
  normalizeDiscipline,
  ALLOWED_DISCIPLINE_TYPES,
  buildRecordFromClResult,
} from '../scrape-msbar-discipline.mjs';

// ── isMsBdDocket / isMsBrDocket ─────────────────────────────────────────────

test('isMsBdDocket accepts standard YYYY-BD-NNNNN-SCT', () => {
  assert.ok(isMsBdDocket('2024-BD-00123-SCT'));
  assert.ok(isMsBdDocket('2017-BD-1234-SCT'));
});

test('isMsBdDocket rejects BR (reinstatement) docket', () => {
  assert.equal(isMsBdDocket('2024-BR-00123-SCT'), false);
});

test('isMsBdDocket rejects empty / null / non-MS', () => {
  assert.equal(isMsBdDocket(''), false);
  assert.equal(isMsBdDocket(null), false);
  assert.equal(isMsBdDocket('SCBD-7480'), false);
  assert.equal(isMsBdDocket('1234'), false);
});

test('isMsBrDocket accepts BR docket', () => {
  assert.ok(isMsBrDocket('2024-BR-00123-SCT'));
});

// ── parseCaseName ───────────────────────────────────────────────────────────

test('parseCaseName extracts name from "The Mississippi Bar v. <Name>"', () => {
  const r = parseCaseName('The Mississippi Bar v. Charlie A. Carr');
  assert.equal(r.fullName, 'Charlie A. Carr');
});

test('parseCaseName handles Jr. suffix', () => {
  const r = parseCaseName('The Mississippi Bar v. Guy N. Rogers, Jr.');
  assert.equal(r.fullName, 'Guy N. Rogers, Jr.');
});

test('parseCaseName rejects reversed caption (reinstatement appeal)', () => {
  const r = parseCaseName('Christina Huffman Bennett v. The Mississippi Bar');
  assert.equal(r.fullName, null);
});

test('parseCaseName accepts "In Re: <Name>"', () => {
  const r = parseCaseName('In Re: John Smith');
  assert.equal(r.fullName, 'John Smith');
});

test('parseCaseName strips <mark> highlight tags', () => {
  const r = parseCaseName('The <mark>Mississippi Bar</mark> v. Charlie A. Carr');
  assert.equal(r.fullName, 'Charlie A. Carr');
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

test('buildRecordFromClResult accepts MS BD docket caption', () => {
  const sample = {
    caseName: 'The Mississippi Bar v. John Smith',
    docketNumber: '2024-BD-00123-SCT',
    dateFiled: '2024-06-15',
    absolute_url: '/opinion/9999999/the-mississippi-bar-v-smith/',
    snippet: '',
    opinions: [{ snippet: 'respondent is hereby disbarred from the practice of law in Mississippi' }],
  };
  const r = buildRecordFromClResult(sample, 'disbarment');
  assert.ok(r);
  assert.equal(r.bar_number, 'MS:2024-BD-00123-SCT');
  assert.equal(r.full_name, 'John Smith');
  assert.equal(r.discipline_type, 'disbarment');
  assert.equal(r.order_date, '2024-06-15');
  assert.ok(r.source_url.startsWith('https://www.courtlistener.com/opinion/'));
});

test('buildRecordFromClResult rejects BR (reinstatement) docket', () => {
  const sample = {
    caseName: 'The Mississippi Bar v. John Smith',
    docketNumber: '2024-BR-00123-SCT',
    dateFiled: '2024-06-15',
    absolute_url: '/opinion/9999999/x/',
    opinions: [{ snippet: 'reinstatement granted' }],
  };
  assert.equal(buildRecordFromClResult(sample, 'disbarment'), null);
});

test('buildRecordFromClResult rejects reversed caption (Name v. MS Bar)', () => {
  const sample = {
    caseName: 'John Smith v. The Mississippi Bar',
    docketNumber: '2024-BD-00123-SCT',
    dateFiled: '2024-06-15',
    absolute_url: '/opinion/9999999/x/',
    opinions: [{ snippet: 'reinstatement appeal' }],
  };
  assert.equal(buildRecordFromClResult(sample, 'disbarment'), null);
});

test('buildRecordFromClResult requires absolute_url (no fabricated source_url)', () => {
  const sample = {
    caseName: 'The Mississippi Bar v. John Smith',
    docketNumber: '2024-BD-00123-SCT',
    dateFiled: '2024-06-15',
    absolute_url: null,
    opinions: [{ snippet: 'disbarred' }],
  };
  assert.equal(buildRecordFromClResult(sample, 'disbarment'), null);
});

test('ALLOWED_DISCIPLINE_TYPES contains expected enum values', () => {
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('disbarment'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('suspension'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('reciprocal_discipline'));
});
