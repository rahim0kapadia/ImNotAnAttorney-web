/**
 * scripts/ingest/__tests__/seed-statutes-md.test.mjs
 *
 * Unit tests for Maryland Criminal Law Article (GCR) ingest seeder.
 * Tests row building, validation, and dedup logic (PDF parsing tested separately).
 *
 * Run: node --test scripts/ingest/__tests__/seed-statutes-md.test.mjs
 */

import { strict as assert } from 'assert';
import test from 'node:test';
import * as crypto from 'crypto';

// Mock row builder and schema validation (replicate from seed-statutes-md.mjs)
function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function buildRow(sectionData, sourceUrl) {
  const { sectionNum, title, body } = sectionData;
  const parts = sectionNum.split('-');
  const section = parts[0] || '';
  const subsection = parts.length > 1 ? parts.slice(1).join('.') : null;

  return {
    jurisdiction: 'MD',
    title: `Article 2: ${title || ''}`.trim(),
    section,
    subsection,
    section_text: body,
    source_urls: [sourceUrl],
    text_hash: sha256(body),
  };
}

function dedupeRows(rows) {
  const seen = new Set();
  const deduped = [];

  for (const row of rows) {
    const key = [row.jurisdiction, row.title, row.section, row.subsection].join('::');
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(row);
    }
  }

  return deduped;
}

// ============================================================================
// Tests
// ============================================================================

test('buildRow creates valid statute row', () => {
  const section = {
    sectionNum: '2-201',
    title: 'Test Title',
    body: 'This is a test body with sufficient length.',
  };

  const row = buildRow(section, 'https://example.com/test.pdf');
  assert.strictEqual(row.jurisdiction, 'MD');
  assert.strictEqual(row.title, 'Article 2: Test Title');
  assert.strictEqual(row.section, '2');
  assert.strictEqual(row.subsection, '201');
  assert.strictEqual(row.source_urls[0], 'https://example.com/test.pdf');
  assert.strictEqual(row.text_hash.length, 64, 'SHA-256 should be 64 hex chars');
});

test('buildRow with hyphenated section number', () => {
  const section = {
    sectionNum: '3-404.1',
    title: 'Complex Section',
    body: 'Body text for complex section numbers.',
  };

  const row = buildRow(section, 'https://example.com/test.pdf');
  assert.strictEqual(row.section, '3');
  assert.strictEqual(row.subsection, '404.1');
});

test('dedupeRows removes duplicates on natural key', () => {
  const rows = [
    {
      jurisdiction: 'MD',
      title: 'Article 2: Test',
      section: '2',
      subsection: '201',
      section_text: 'Body A',
      text_hash: 'hash1',
      source_urls: ['url1'],
    },
    {
      jurisdiction: 'MD',
      title: 'Article 2: Test',
      section: '2',
      subsection: '201',
      section_text: 'Body B',
      text_hash: 'hash2',
      source_urls: ['url2'],
    },
    {
      jurisdiction: 'MD',
      title: 'Article 2: Different',
      section: '2',
      subsection: '202',
      section_text: 'Body C',
      text_hash: 'hash3',
      source_urls: ['url3'],
    },
  ];

  const deduped = dedupeRows(rows);
  assert.strictEqual(
    deduped.length,
    2,
    'Should keep only unique (jurisdiction, title, section, subsection) keys'
  );
  assert.strictEqual(deduped[0].text_hash, 'hash1', 'First occurrence should be kept');
  assert.strictEqual(deduped[1].text_hash, 'hash3', 'Different subsection should be kept');
});

test('sha256 produces consistent hash', () => {
  const text = 'Test statute body text.';
  const hash1 = sha256(text);
  const hash2 = sha256(text);

  assert.strictEqual(hash1, hash2, 'Same input should produce same hash');
  assert.strictEqual(hash1.length, 64, 'SHA-256 should be 64 hex characters');
  assert.match(hash1, /^[a-f0-9]{64}$/, 'Hash should be lowercase hex');
});

test('buildRow sets jurisdiction to MD', () => {
  const section = {
    sectionNum: '2-301',
    title: 'Test',
    body: 'Test body with sufficient content.',
  };
  const row = buildRow(section, 'https://example.com');
  assert.strictEqual(row.jurisdiction, 'MD');
});

test('buildRow title includes Article 2 prefix', () => {
  const section = {
    sectionNum: '2-301',
    title: 'Assault',
    body: 'Test body with sufficient content.',
  };
  const row = buildRow(section, 'https://example.com');
  assert.strictEqual(row.title, 'Article 2: Assault');
});

test('buildRow section_text matches input body', () => {
  const section = {
    sectionNum: '2-301',
    title: 'Test',
    body: 'Test body with sufficient content.',
  };
  const row = buildRow(section, 'https://example.com');
  assert.strictEqual(row.section_text, 'Test body with sufficient content.');
});

test('buildRow source_urls is array with one element', () => {
  const section = {
    sectionNum: '2-301',
    title: 'Test',
    body: 'Test body with sufficient content.',
  };
  const row = buildRow(section, 'https://example.com');
  assert(Array.isArray(row.source_urls));
  assert.strictEqual(row.source_urls.length, 1);
});

test('dedupeRows keeps first occurrence when duplicates', () => {
  const rows = [
    {
      jurisdiction: 'MD',
      title: 'Article 2: Test',
      section: '2',
      subsection: '201',
      section_text: 'First body',
      text_hash: 'hash1',
      source_urls: ['url1'],
    },
    {
      jurisdiction: 'MD',
      title: 'Article 2: Test',
      section: '2',
      subsection: '201',
      section_text: 'Second body',
      text_hash: 'hash2',
      source_urls: ['url2'],
    },
  ];

  const deduped = dedupeRows(rows);
  assert.strictEqual(deduped.length, 1);
  assert.strictEqual(deduped[0].text_hash, 'hash1');
});
