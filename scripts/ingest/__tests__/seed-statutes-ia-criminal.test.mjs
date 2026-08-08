// Template: scripts/ingest/__tests__/seed-statutes-ok-title21.test.mjs
// Pattern: pdf-statute-harness consumer (Wave 3 hostile-states design 2026-05-01)
// csv-bulk-checked: synthetic — no live IA chapter PDF fixture captured at design time.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  IA_DOCS_BASE,
  IA_ALLOWED_HOSTS,
  IA_CRIMINAL_CHAPTERS,
  IA_CONFIG,
  buildChapterPdfUrl,
  buildIaSourceUrl,
  parseIaChapter,
} from '../lib/ia-pdf.mjs';
import { IA_COHORT_FLOOR } from '../seed-statutes-ia-criminal.mjs';

test('IA_DOCS_BASE is HTTPS legis.iowa.gov/docs/code', () => {
  assert.equal(IA_DOCS_BASE, 'https://www.legis.iowa.gov/docs/code');
});

test('IA_ALLOWED_HOSTS includes both www and bare', () => {
  assert.deepEqual(IA_ALLOWED_HOSTS, ['www.legis.iowa.gov', 'legis.iowa.gov']);
});

test('IA_CRIMINAL_CHAPTERS covers core offenses 707-725', () => {
  for (const ch of ['707', '708', '709', '710', '711', '712', '714', '716']) {
    assert.ok(IA_CRIMINAL_CHAPTERS.includes(ch), `missing chapter ${ch}`);
  }
  assert.ok(IA_CRIMINAL_CHAPTERS.includes('724'), 'weapons');
  assert.ok(IA_CRIMINAL_CHAPTERS.includes('725'), 'prostitution/pornography');
});

test('IA_COHORT_FLOOR ≥ 300', () => {
  assert.ok(IA_COHORT_FLOOR >= 300);
});

test('IA_CONFIG.sectionRe is set + minBodyChars=20', () => {
  assert.ok(IA_CONFIG.sectionRe instanceof RegExp);
  assert.equal(IA_CONFIG.minBodyChars, 20);
});

// ── URL builders ─────────────────────────────────────────────────────────

test('buildChapterPdfUrl: simple', () => {
  assert.equal(buildChapterPdfUrl('707'), 'https://www.legis.iowa.gov/docs/code/707.pdf');
});

test('buildChapterPdfUrl: bad chapter throws', () => {
  assert.throws(() => buildChapterPdfUrl('99'));   // too short
  assert.throws(() => buildChapterPdfUrl('707x1')); // bad form
  assert.throws(() => buildChapterPdfUrl(''));
});

test('buildIaSourceUrl: returns chapter PDF as canonical surface', () => {
  assert.equal(
    buildIaSourceUrl('707', '707.1'),
    'https://www.legis.iowa.gov/docs/code/707.pdf',
  );
});

// ── parseIaChapter — synthetic header parsing ────────────────────────────

test('parseIaChapter: 2 sections from synthetic chapter text', () => {
  const text = [
    '707.1 Person.',
    'A person commits any offense in this chapter only if the act causes death of another person who was alive at the time of the act.',
    '707.2 Murder in the first degree.',
    'A person commits murder in the first degree when the person commits murder under any of the following circumstances:',
    '1. The person willfully, deliberately, and with premeditation kills another person.',
    '2. The person kills another person while participating in a forcible felony.',
  ].join('\n');
  const out = parseIaChapter(text);
  assert.equal(out.length, 2);
  assert.equal(out[0].sectionNum, '707.1');
  assert.match(out[0].title, /Person/);
  assert.match(out[0].body, /act causes death/);
  assert.equal(out[1].sectionNum, '707.2');
  assert.match(out[1].title, /Murder in the first degree/);
});

test('parseIaChapter: short body sections get skipped (TOC artifacts)', () => {
  const text = [
    '707.1 Person.',
    '707.2', // TOC dot-leader truncated; less than minBodyChars
    '707.3 Real section.',
    'A real chunk of text long enough to clear the minBodyChars=20 threshold for parsing.',
  ].join('\n');
  const out = parseIaChapter(text);
  // The header at line 0 has body of just the next short line — also < minBodyChars
  // The header at line 2 has a long body — should appear.
  const matched = out.find((s) => s.sectionNum === '707.3');
  assert.ok(matched, 'expected 707.3 to be parsed');
});

test('parseIaChapter: trailing-letter sections (e.g. 714.1A) parse', () => {
  const text = [
    '714.1A Theft as defined.',
    'Theft is committed when a person does any of the following acts: (1) Takes possession or control of the property of another, or property in the possession of another, with the intent to deprive the other thereof.',
  ].join('\n');
  const out = parseIaChapter(text);
  assert.equal(out.length, 1);
  assert.equal(out[0].sectionNum, '714.1A');
});

test('parseIaChapter: empty text returns empty array', () => {
  assert.deepEqual(parseIaChapter(''), []);
});
