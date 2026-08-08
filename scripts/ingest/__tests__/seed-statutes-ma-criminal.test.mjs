// Template: scripts/ingest/__tests__/seed-statutes-va.test.mjs
// Pattern: bucket-b-html.mjs harness contract (Wave 2 design report 2026-05-02)
// csv-bulk-checked: none-exists - synthetic + pre-captured fixtures, no network
//
// Unit tests for MA Wave 2 cohort seeder. Reuses fixtures previously captured
// at scripts/ingest/__tests__/fixtures/ma/ (sibling Wave 2 capture pass).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MA_COHORT_DEFAULT,
  MA_CHAPTER_DESCRIPTIONS,
  bucketBDiscover,
  bucketBParse,
  buildSourceUrl,
  buildChapterConfig,
  parseCliFlags,
} from '../seed-statutes-ma-criminal.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.join(__dirname, 'fixtures', 'ma');

function loadFixture(name) {
  const p = path.join(FIXTURES, name);
  return fs.readFileSync(p, 'utf-8');
}

// ── Constants ────────────────────────────────────────────────────────────

test('MA_COHORT_DEFAULT covers Wave 2 cohort (265, 266, 268, 269, 272)', () => {
  assert.deepEqual(MA_COHORT_DEFAULT, ['265', '266', '268', '269', '272']);
});

test('MA_CHAPTER_DESCRIPTIONS includes every cohort chapter', () => {
  for (const c of MA_COHORT_DEFAULT) {
    assert.ok(MA_CHAPTER_DESCRIPTIONS[c], `missing description for ch ${c}`);
    assert.ok(MA_CHAPTER_DESCRIPTIONS[c].length > 5, `description too short for ch ${c}`);
  }
});

test('MA_CHAPTER_DESCRIPTIONS handles 268A suffix', () => {
  assert.ok(MA_CHAPTER_DESCRIPTIONS['268A']);
  assert.match(MA_CHAPTER_DESCRIPTIONS['268A'], /Public Officer/i);
});

// ── CLI flags ────────────────────────────────────────────────────────────

test('parseCliFlags defaults are dryRun=false, no limit, no chapters', () => {
  const f = parseCliFlags([]);
  assert.equal(f.dryRun, false);
  assert.equal(f.verbose, false);
  assert.equal(f.limit, null);
  assert.equal(f.chapters, null);
});

test('parseCliFlags handles --dry-run + --limit + --verbose', () => {
  const f = parseCliFlags(['--dry-run', '--limit=5', '--verbose']);
  assert.equal(f.dryRun, true);
  assert.equal(f.verbose, true);
  assert.equal(f.limit, 5);
});

test('parseCliFlags --chapters=265,266 parses string list', () => {
  const f = parseCliFlags(['--chapters=265,266']);
  assert.deepEqual(f.chapters, ['265', '266']);
});

test('parseCliFlags --chapters preserves alphanumeric labels (268A)', () => {
  const f = parseCliFlags(['--chapters=265,268A']);
  assert.deepEqual(f.chapters, ['265', '268A']);
});

test('parseCliFlags --chapters trims whitespace + drops empty entries', () => {
  const f = parseCliFlags(['--chapters= 265 , , 266 ']);
  assert.deepEqual(f.chapters, ['265', '266']);
});

test('parseCliFlags rejects malformed chapter values (non-numeric prefix)', () => {
  // "ABC" should be filtered out, but "265" survives
  const f = parseCliFlags(['--chapters=ABC,265,foo123']);
  assert.deepEqual(f.chapters, ['265']);
});

test('parseCliFlags --limit=0 rejected (positive integer required)', () => {
  const f = parseCliFlags(['--limit=0']);
  assert.equal(f.limit, null);
});

test('parseCliFlags --limit=-1 rejected', () => {
  const f = parseCliFlags(['--limit=-1']);
  assert.equal(f.limit, null);
});

// ── Source URL builder ──────────────────────────────────────────────────

test('buildSourceUrl handles standard chapter-section format', () => {
  const u = buildSourceUrl('265-1');
  assert.equal(u, 'https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter265/Section1');
});

test('buildSourceUrl handles alphanumeric section (13A)', () => {
  const u = buildSourceUrl('265-13A');
  assert.equal(u, 'https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter265/Section13A');
});

test('buildSourceUrl handles chapter 268A (alphanumeric chapter)', () => {
  const u = buildSourceUrl('268A-1');
  assert.equal(u, 'https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter268A/Section1');
});

test('buildSourceUrl encodes spaces in range sections (6_to_8 → 6%20to%208)', () => {
  const u = buildSourceUrl('265-6_to_8');
  assert.equal(u, 'https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter265/Section6%20to%208');
});

test('buildSourceUrl falls back to chapter URL when no dash', () => {
  const u = buildSourceUrl('265');
  assert.equal(u, 'https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter265');
});

// ── Per-chapter config builder ──────────────────────────────────────────

test('buildChapterConfig produces stateCode=MA + correct titleNum + HTTPS chapterListUrl', () => {
  const c = buildChapterConfig('265');
  assert.equal(c.stateCode, 'MA');
  assert.equal(c.stateName, 'Massachusetts');
  assert.equal(c.titleNum, '265');
  assert.equal(c.titleLabel, MA_CHAPTER_DESCRIPTIONS['265']);
  assert.ok(c.chapterListUrl.startsWith('https://malegislature.gov/'));
  assert.ok(c.chapterListUrl.endsWith('/Chapter265'));
});

test('buildChapterConfig allowedHosts limited to malegislature.gov + www', () => {
  const c = buildChapterConfig('265');
  assert.ok(c.allowedHosts instanceof Set);
  assert.ok(c.allowedHosts.has('malegislature.gov'));
  assert.ok(c.allowedHosts.has('www.malegislature.gov'));
  assert.ok(!c.allowedHosts.has('justia.com'));
});

test('buildChapterConfig crawl-delay matches MA robots (none, polite 1500ms)', () => {
  const c = buildChapterConfig('265');
  assert.equal(c.crawlDelay, 'none');
  assert.equal(c.crawlDelayMs, 1500);
});

test('buildChapterConfig wires sibling-built MA adapter functions', () => {
  const c = buildChapterConfig('265');
  assert.equal(typeof c.discoverSections, 'function');
  assert.equal(typeof c.parseSection, 'function');
  assert.equal(typeof c.buildSourceUrl, 'function');
});

test('buildChapterConfig handles chapter 268A', () => {
  const c = buildChapterConfig('268A');
  assert.equal(c.titleNum, '268A');
  assert.ok(c.chapterListUrl.endsWith('/Chapter268A'));
});

// ── Adapter: bucketBDiscover ────────────────────────────────────────────

test('bucketBDiscover walks chapter-265 fixture → ≥10 section descriptors', () => {
  const html = loadFixture('chapter-265.html');
  const config = buildChapterConfig('265');
  const descriptors = bucketBDiscover(html, config);
  assert.ok(descriptors.length >= 10, `expected ≥10 sections in ch265, got ${descriptors.length}`);
});

test('bucketBDiscover descriptors have sectionNum + sectionUrl + chapterNum', () => {
  const html = loadFixture('chapter-265.html');
  const config = buildChapterConfig('265');
  const descriptors = bucketBDiscover(html, config);
  for (const d of descriptors.slice(0, 5)) {
    assert.ok(d.sectionNum, 'sectionNum missing');
    assert.ok(d.sectionUrl, 'sectionUrl missing');
    assert.ok(d.sectionUrl.startsWith('https://malegislature.gov/'));
    assert.equal(d.chapterNum, '265', `chapterNum should be 265, got ${d.chapterNum}`);
    // sectionNum format: chapter-section
    assert.match(d.sectionNum, /^265-/, `sectionNum should start with 265-, got ${d.sectionNum}`);
  }
});

test('bucketBDiscover dedupes URLs within page', () => {
  const html = loadFixture('chapter-265.html');
  const config = buildChapterConfig('265');
  const descriptors = bucketBDiscover(html, config);
  const seen = new Set();
  for (const d of descriptors) {
    assert.ok(!seen.has(d.sectionUrl), `duplicate sectionUrl: ${d.sectionUrl}`);
    seen.add(d.sectionUrl);
  }
});

// ── Adapter: bucketBParse ──────────────────────────────────────────────

test('bucketBParse extracts title + body from chapter-265 section 1 fixture', () => {
  const html = loadFixture('chapter-265-section-1.html');
  const parsed = bucketBParse(html, '265-1');
  assert.ok(parsed, 'parser returned null on real fixture');
  assert.ok(parsed.titleText, 'titleText empty');
  assert.ok(parsed.bodyText, 'bodyText empty');
  assert.ok(parsed.bodyText.length >= 12, `bodyText too short: "${parsed.bodyText}"`);
});

test('bucketBParse handles alphanumeric section 13A', () => {
  const html = loadFixture('chapter-265-section-13A.html');
  const parsed = bucketBParse(html, '265-13A');
  assert.ok(parsed, 'parser returned null on 13A fixture');
  assert.ok(parsed.bodyText.length >= 12);
});

test('bucketBParse handles cohort chapter 268 (Public Justice) section 13B', () => {
  const html = loadFixture('chapter-268-section-13B.html');
  const parsed = bucketBParse(html, '268-13B');
  assert.ok(parsed, 'parser returned null on 268-13B fixture');
  assert.ok(parsed.bodyText.length >= 12);
});

test('bucketBParse returns null on too-short HTML (defensive)', () => {
  const parsed = bucketBParse('<html></html>', '265-1');
  assert.equal(parsed, null);
});

test('bucketBParse output shape is {titleText, bodyText} (no effectiveDate leakage)', () => {
  const html = loadFixture('chapter-265-section-1.html');
  const parsed = bucketBParse(html, '265-1');
  assert.ok(parsed);
  assert.deepEqual(Object.keys(parsed).sort(), ['bodyText', 'titleText']);
});
