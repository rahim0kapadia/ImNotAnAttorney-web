// Template: scripts/ingest/__tests__/seed-statutes-mn-chapter609.test.mjs
// Pattern: bucket-b-html.mjs harness contract (Wave 2 design report 2026-05-02)
// csv-bulk-checked: none-exists - synthetic + pre-captured fixtures, no network
//
// Unit tests for MT Wave 2 Title 45 seeder. Fixtures captured 2026-05-02 from
// mca.legmt.gov live site.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MT_COHORT_DEFAULT,
  MT_CHAPTER_DESCRIPTIONS,
  MT_TITLE45_ROW_FLOOR,
  bucketBParse,
  buildTitleConfig,
  makeBuildSourceUrl,
  parseCliFlags,
} from '../seed-statutes-mt-title45.mjs';

import {
  decodeEntities,
  stripHtml,
  padMT,
  buildChapterListUrl,
  buildPartsIndexUrl,
  buildSectionsIndexUrl,
  buildSectionUrl,
  parseSectionUrl,
  sectionIdFromUrl,
  citationFromHeading,
  discoverChapterUrls,
  discoverPartUrls,
  discoverSectionUrls,
  parseSection,
  MT_BASE,
} from '../lib/mt-html.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.join(__dirname, 'fixtures', 'mt');

function loadFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf-8');
}

// ── Constants ────────────────────────────────────────────────────────────

test('MT_COHORT_DEFAULT covers chapters 1-10', () => {
  assert.deepEqual(MT_COHORT_DEFAULT, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
});

test('MT_CHAPTER_DESCRIPTIONS has all 10 chapter labels', () => {
  for (const ch of MT_COHORT_DEFAULT) {
    assert.ok(MT_CHAPTER_DESCRIPTIONS[ch], `missing description for chapter ${ch}`);
  }
});

test('MT_CHAPTER_DESCRIPTIONS chapter 5 is Offenses Against the Person', () => {
  assert.match(MT_CHAPTER_DESCRIPTIONS['5'], /Offenses Against the Person/);
});

test('MT_TITLE45_ROW_FLOOR is conservative (≥250)', () => {
  assert.ok(MT_TITLE45_ROW_FLOOR >= 250);
});

// ── padMT (positional encoding) ─────────────────────────────────────────

test('padMT(1) → "0010"', () => {
  assert.equal(padMT(1), '0010');
});

test('padMT(5) → "0050"', () => {
  assert.equal(padMT(5), '0050');
});

test('padMT(10) → "0100"', () => {
  assert.equal(padMT(10), '0100');
});

test('padMT("5") accepts string input', () => {
  assert.equal(padMT('5'), '0050');
});

test('padMT throws on invalid input', () => {
  assert.throws(() => padMT('foo'));
  assert.throws(() => padMT(-1));
});

// ── URL builders ────────────────────────────────────────────────────────

test('buildChapterListUrl produces title-45 chapters_index URL', () => {
  assert.equal(
    buildChapterListUrl(),
    'https://mca.legmt.gov/bills/mca/title_0450/chapters_index.html',
  );
});

test('buildPartsIndexUrl(5) produces chapter 5 parts_index URL', () => {
  assert.equal(
    buildPartsIndexUrl(5),
    'https://mca.legmt.gov/bills/mca/title_0450/chapter_0050/parts_index.html',
  );
});

test('buildSectionsIndexUrl(5,1) produces chapter 5 part 1 sections_index URL', () => {
  assert.equal(
    buildSectionsIndexUrl(5, 1),
    'https://mca.legmt.gov/bills/mca/title_0450/chapter_0050/part_0010/sections_index.html',
  );
});

test('buildSectionUrl(5,1,2) produces section URL with positional filename', () => {
  assert.equal(
    buildSectionUrl(5, 1, 2),
    'https://mca.legmt.gov/bills/mca/title_0450/chapter_0050/part_0010/section_0020/0450-0050-0010-0020.html',
  );
});

// ── URL parsing roundtrip ───────────────────────────────────────────────

test('parseSectionUrl decodes positional segments', () => {
  const u = 'https://mca.legmt.gov/bills/mca/title_0450/chapter_0050/part_0010/section_0020/0450-0050-0010-0020.html';
  assert.deepEqual(parseSectionUrl(u), {
    title: '45',
    chapter: '5',
    part: '1',
    sectionIdx: '2',
  });
});

test('parseSectionUrl throws on unparseable URL', () => {
  assert.throws(() => parseSectionUrl('https://example.com/foo'));
});

test('sectionIdFromUrl returns positional citation', () => {
  const u = 'https://mca.legmt.gov/bills/mca/title_0450/chapter_0050/part_0010/section_0020/0450-0050-0010-0020.html';
  assert.equal(sectionIdFromUrl(u), '45-5-1-2');
});

test('buildSectionUrl roundtrips through parseSectionUrl', () => {
  const u = buildSectionUrl(5, 1, 2);
  const p = parseSectionUrl(u);
  assert.equal(p.chapter, '5');
  assert.equal(p.part, '1');
  assert.equal(p.sectionIdx, '2');
});

// ── decodeEntities + stripHtml ──────────────────────────────────────────

test('decodeEntities handles common HTML entities', () => {
  assert.equal(decodeEntities('&amp;'), '&');
  assert.equal(decodeEntities('&sect;'), '§');
  assert.equal(decodeEntities('&quot;hi&quot;'), '"hi"');
});

test('decodeEntities handles MT em-quad space (&#8195;)', () => {
  assert.equal(decodeEntities('45-5-102.&#8195;Deliberate'), '45-5-102. Deliberate');
});

test('stripHtml removes script + style + tags', () => {
  const out = stripHtml('<p>keep</p><script>alert(1)</script><style>p{}</style>');
  assert.match(out, /keep/);
  assert.doesNotMatch(out, /alert/);
});

test('stripHtml removes APM_DO_NOT_TOUCH Akamai prefix defensively', () => {
  const out = stripHtml('<APM_DO_NOT_TOUCH>akamai blob</APM_DO_NOT_TOUCH><p>real text</p>');
  assert.equal(out, 'real text');
});

// ── Title-level discovery (chapters_index.html) ─────────────────────────

test('discoverChapterUrls walks fixture → 10 chapters', () => {
  const html = loadFixture('title45-chapters-index.html');
  const chapters = discoverChapterUrls(html);
  assert.equal(chapters.length, 10);
  assert.deepEqual(
    chapters.map((c) => c.chapter).sort((a, b) => Number(a) - Number(b)),
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
  );
});

test('discoverChapterUrls produces full HTTPS URLs for each chapter', () => {
  const html = loadFixture('title45-chapters-index.html');
  const chapters = discoverChapterUrls(html);
  for (const c of chapters) {
    assert.match(c.url, /^https:\/\/mca\.legmt\.gov\/bills\/mca\/title_0450\/chapter_\d{4}\/parts_index\.html$/);
  }
});

test('discoverChapterUrls dedupes', () => {
  const html = loadFixture('title45-chapters-index.html');
  const chapters = discoverChapterUrls(html);
  const seen = new Set();
  for (const c of chapters) {
    assert.ok(!seen.has(c.url), `duplicate chapter URL: ${c.url}`);
    seen.add(c.url);
  }
});

test('discoverChapterUrls handles empty html', () => {
  assert.deepEqual(discoverChapterUrls(''), []);
});

// ── Chapter-level discovery (parts_index.html) ──────────────────────────

test('discoverPartUrls walks chapter 5 fixture → 8 parts', () => {
  const html = loadFixture('chapter5-parts-index.html');
  const parts = discoverPartUrls(html, 5);
  assert.equal(parts.length, 8);
});

test('discoverPartUrls produces full HTTPS URLs nested under chapter 5', () => {
  const html = loadFixture('chapter5-parts-index.html');
  const parts = discoverPartUrls(html, 5);
  for (const p of parts) {
    assert.match(p.url, /^https:\/\/mca\.legmt\.gov\/bills\/mca\/title_0450\/chapter_0050\/part_\d{4}\/sections_index\.html$/);
  }
});

// ── Part-level discovery (citation-aware) ───────────────────────────────

test('discoverSectionUrls extracts citation from anchor inner text', () => {
  const html = loadFixture('chapter5-part1-sections-index.html');
  const sections = discoverSectionUrls(html, 5, 1);
  assert.ok(sections.length >= 8);
  // First active should be 45-5-101 (Repealed) or 45-5-102 (Deliberate homicide)
  const cit102 = sections.find((s) => s.citation === '45-5-102');
  assert.ok(cit102, '45-5-102 must be present');
  assert.equal(cit102.headnote, 'Deliberate homicide');
  assert.equal(cit102.inactive, false);
});

test('discoverSectionUrls flags Repealed sections as inactive', () => {
  const html = loadFixture('chapter5-part1-sections-index.html');
  const sections = discoverSectionUrls(html, 5, 1);
  const rep = sections.find((s) => s.citation === '45-5-101');
  assert.ok(rep);
  assert.equal(rep.inactive, true, '45-5-101 marked Repealed → inactive=true');
});

test('discoverSectionUrls flags reserved-range sections as inactive', () => {
  const html = loadFixture('chapter5-part1-sections-index.html');
  const sections = discoverSectionUrls(html, 5, 1);
  const reserved = sections.find((s) => s.citation === '45-5-108');
  assert.ok(reserved);
  assert.equal(reserved.inactive, true, '45-5-108 (range/reserved) marked inactive');
});

test('discoverSectionUrls dedupes by URL', () => {
  const html = loadFixture('chapter5-part1-sections-index.html');
  const sections = discoverSectionUrls(html, 5, 1);
  const seen = new Set();
  for (const s of sections) {
    assert.ok(!seen.has(s.url), `duplicate URL: ${s.url}`);
    seen.add(s.url);
  }
});

test('discoverSectionUrls all URLs are HTTPS mca.legmt.gov', () => {
  const html = loadFixture('chapter5-part1-sections-index.html');
  const sections = discoverSectionUrls(html, 5, 1);
  for (const s of sections) {
    assert.match(s.url, /^https:\/\/mca\.legmt\.gov\/bills\/mca\/title_0450\//);
  }
});

// ── Section page parser ─────────────────────────────────────────────────

test('parseSection extracts headnote + body from active 45-5-102', () => {
  const html = loadFixture('section-45-5-102-active.html');
  const parsed = parseSection(html, '45-5-102');
  assert.ok(parsed, 'parser returned null on active fixture');
  assert.equal(parsed.titleText, 'Deliberate homicide');
  assert.ok(parsed.bodyText.length > 200, `bodyText too short: ${parsed.bodyText.length}`);
  assert.match(parsed.bodyText, /A person commits the offense/);
  assert.equal(parsed.effectiveDate, null);
});

test('parseSection returns null on Repealed shell (45-5-101)', () => {
  const html = loadFixture('section-45-5-101-repealed.html');
  const parsed = parseSection(html, '45-5-101');
  assert.equal(parsed, null);
});

test('parseSection returns null on reserved-range page (45-5-108)', () => {
  const html = loadFixture('section-45-5-108-range.html');
  const parsed = parseSection(html, '45-5-108');
  assert.equal(parsed, null);
});

test('parseSection returns null on citation mismatch', () => {
  const html = loadFixture('section-45-5-102-active.html');
  const parsed = parseSection(html, '45-5-999'); // wrong
  assert.equal(parsed, null);
});

test('parseSection returns null on too-short HTML', () => {
  assert.equal(parseSection('<html></html>', '45-5-102'), null);
});

test('parseSection output shape is {titleText, bodyText, effectiveDate}', () => {
  const html = loadFixture('section-45-5-102-active.html');
  const parsed = parseSection(html, '45-5-102');
  assert.ok(parsed);
  assert.deepEqual(Object.keys(parsed).sort(), ['bodyText', 'effectiveDate', 'titleText']);
});

// ── bucketBParse adapter ────────────────────────────────────────────────

test('bucketBParse output is {titleText, bodyText} (no effectiveDate leakage)', () => {
  const html = loadFixture('section-45-5-102-active.html');
  const parsed = bucketBParse(html, '45-5-102');
  assert.ok(parsed);
  assert.deepEqual(Object.keys(parsed).sort(), ['bodyText', 'titleText']);
});

test('bucketBParse returns null on repealed shell', () => {
  const html = loadFixture('section-45-5-101-repealed.html');
  assert.equal(bucketBParse(html, '45-5-101'), null);
});

// ── makeBuildSourceUrl closure ──────────────────────────────────────────

test('makeBuildSourceUrl returns mapped URL for known section', () => {
  const map = new Map([['45-5-102', 'https://mca.legmt.gov/foo']]);
  const fn = makeBuildSourceUrl(map);
  assert.equal(fn('45-5-102'), 'https://mca.legmt.gov/foo');
});

test('makeBuildSourceUrl throws on unknown section', () => {
  const map = new Map();
  const fn = makeBuildSourceUrl(map);
  assert.throws(() => fn('45-5-999'));
});

// ── buildTitleConfig ────────────────────────────────────────────────────

test('buildTitleConfig produces stateCode=MT, titleNum=45', () => {
  const descriptors = [
    { sectionNum: '45-5-102', sectionUrl: 'https://mca.legmt.gov/x', chapterNum: '5' },
  ];
  const cfg = buildTitleConfig(descriptors);
  assert.equal(cfg.stateCode, 'MT');
  assert.equal(cfg.stateName, 'Montana');
  assert.equal(cfg.titleNum, '45');
  assert.match(cfg.titleLabel, /Crimes/);
});

test('buildTitleConfig allowedHosts is mca.legmt.gov only', () => {
  const cfg = buildTitleConfig([]);
  assert.ok(cfg.allowedHosts instanceof Set);
  assert.ok(cfg.allowedHosts.has('mca.legmt.gov'));
  assert.ok(!cfg.allowedHosts.has('justia.com'));
  assert.ok(!cfg.allowedHosts.has('archive.legmt.gov'));
});

test('buildTitleConfig crawl-delay is 2500ms (Akamai-conservative)', () => {
  const cfg = buildTitleConfig([]);
  assert.equal(cfg.crawlDelayMs, 2500);
  assert.equal(cfg.fetchTimeoutMs, 45000);
});

test('buildTitleConfig discoverSections returns the pre-walked descriptors', () => {
  const descriptors = [
    { sectionNum: '45-5-102', sectionUrl: 'https://mca.legmt.gov/a', chapterNum: '5' },
    { sectionNum: '45-5-103', sectionUrl: 'https://mca.legmt.gov/b', chapterNum: '5' },
  ];
  const cfg = buildTitleConfig(descriptors);
  // Harness call signature: discoverSections(tocHtml, config)
  const result = cfg.discoverSections('<ignored>', cfg);
  assert.equal(result.length, 2);
  assert.equal(result[0].sectionNum, '45-5-102');
});

test('buildTitleConfig buildSourceUrl resolves descriptor citations', () => {
  const descriptors = [
    { sectionNum: '45-5-102', sectionUrl: 'https://mca.legmt.gov/foo', chapterNum: '5' },
  ];
  const cfg = buildTitleConfig(descriptors);
  assert.equal(cfg.buildSourceUrl('45-5-102'), 'https://mca.legmt.gov/foo');
});

test('buildTitleConfig has User-Agent set to a real browser string', () => {
  const cfg = buildTitleConfig([]);
  assert.match(cfg.userAgent, /Mozilla\/5\.0/);
});

// ── CLI flags ───────────────────────────────────────────────────────────

test('parseCliFlags defaults', () => {
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

test('parseCliFlags --chapters=5 parses single chapter', () => {
  const f = parseCliFlags(['--chapters=5']);
  assert.deepEqual(f.chapters, ['5']);
});

test('parseCliFlags --chapters=1,5,10 parses multi-chapter', () => {
  const f = parseCliFlags(['--chapters=1,5,10']);
  assert.deepEqual(f.chapters, ['1', '5', '10']);
});

test('parseCliFlags rejects non-numeric chapter labels', () => {
  const f = parseCliFlags(['--chapters=abc,5,xyz']);
  assert.deepEqual(f.chapters, ['5']);
});

test('parseCliFlags --limit=0 rejected', () => {
  assert.equal(parseCliFlags(['--limit=0']).limit, null);
});

test('parseCliFlags --limit=-1 rejected', () => {
  assert.equal(parseCliFlags(['--limit=-1']).limit, null);
});

// ── citationFromHeading helper ──────────────────────────────────────────

test('citationFromHeading extracts citation from h1', () => {
  const html = '<h1>45-5-102. Deliberate homicide</h1>';
  assert.equal(citationFromHeading(html), '45-5-102');
});

test('citationFromHeading returns null when no heading present', () => {
  assert.equal(citationFromHeading(''), null);
  assert.equal(citationFromHeading('<p>no heading</p>'), null);
});
