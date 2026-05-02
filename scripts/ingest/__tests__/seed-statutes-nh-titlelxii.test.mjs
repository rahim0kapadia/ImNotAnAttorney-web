// Template: scripts/ingest/__tests__/seed-statutes-mn-chapter609.test.mjs
// Pattern: bucket-b-html.mjs harness contract (Wave 2 design report 2026-05-02)
// csv-bulk-checked: none-exists - synthetic + pre-captured fixtures, no network
//
// Unit tests for NH Wave 2 Title LXII seeder. Fixtures captured 2026-05-02 from
// gc.nh.gov live site (synthetic but matching documented HTML structure;
// real-fixture replacement happens at first smoke run).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NH_COHORT_DEFAULT,
  NH_CHAPTER_DESCRIPTIONS,
  NH_TITLELXII_ROW_FLOOR,
  bucketBDiscover,
  bucketBParse,
  buildSourceUrl,
  buildChapterConfig,
  parseCliFlags,
} from '../seed-statutes-nh-titlelxii.mjs';

import {
  discoverChapterTokens,
  discoverSections,
  parseSection,
  partsFromUrl,
  buildChapterUrl,
  buildNHSourceUrl,
  canonicalSectionId,
  stripHtml,
  decodeEntities,
} from '../lib/nh-html.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.join(__dirname, 'fixtures', 'nh');

function loadFixture(name) {
  const p = path.join(FIXTURES, name);
  return fs.readFileSync(p, 'utf-8');
}

// ── Constants ────────────────────────────────────────────────────────────

test('NH_COHORT_DEFAULT covers all Title LXII chapters incl letter-suffixed', () => {
  assert.ok(NH_COHORT_DEFAULT.includes('625'));
  assert.ok(NH_COHORT_DEFAULT.includes('630'));
  assert.ok(NH_COHORT_DEFAULT.includes('632-A'));
  assert.ok(NH_COHORT_DEFAULT.includes('651-F'));
  // Should be ~42 chapters per design report
  assert.ok(NH_COHORT_DEFAULT.length >= 40, `cohort too small: ${NH_COHORT_DEFAULT.length}`);
});

test('NH_CHAPTER_DESCRIPTIONS has all cohort chapters', () => {
  for (const ch of NH_COHORT_DEFAULT) {
    assert.ok(NH_CHAPTER_DESCRIPTIONS[ch], `missing description for ${ch}`);
  }
});

test('NH_CHAPTER_DESCRIPTIONS labels Chapter 630 as Homicide', () => {
  assert.match(NH_CHAPTER_DESCRIPTIONS['630'], /homicide/i);
});

test('NH_TITLELXII_ROW_FLOOR set to ≥250 (conservative, design est 600-800)', () => {
  assert.ok(NH_TITLELXII_ROW_FLOOR >= 250);
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

test('parseCliFlags --chapters=630 parses', () => {
  const f = parseCliFlags(['--chapters=630']);
  assert.deepEqual(f.chapters, ['630']);
});

test('parseCliFlags --chapters=632-A parses letter-suffixed chapter', () => {
  const f = parseCliFlags(['--chapters=632-A']);
  assert.deepEqual(f.chapters, ['632-A']);
});

test('parseCliFlags rejects malformed chapter labels (must be 3-digit + opt -A suffix)', () => {
  const f = parseCliFlags(['--chapters=ABC,630,foo,12,632-A,632-AB']);
  // Accepts 630 (3-digit) and 632-A (3-digit + -A); rejects ABC, foo, 12, 632-AB.
  assert.deepEqual(f.chapters, ['630', '632-A']);
});

test('parseCliFlags --limit=0 rejected', () => {
  const f = parseCliFlags(['--limit=0']);
  assert.equal(f.limit, null);
});

// ── URL builders ────────────────────────────────────────────────────────

test('buildChapterUrl produces canonical chapter TOC URL', () => {
  assert.equal(buildChapterUrl('630'), 'https://gc.nh.gov/rsa/html/NHTOC/NHTOC-LXII-630.htm');
});

test('buildChapterUrl handles letter-suffixed chapter (632-A)', () => {
  assert.equal(buildChapterUrl('632-A'), 'https://gc.nh.gov/rsa/html/NHTOC/NHTOC-LXII-632-A.htm');
});

test('buildNHSourceUrl produces canonical section URL', () => {
  assert.equal(
    buildNHSourceUrl('630', '1'),
    'https://gc.nh.gov/rsa/html/LXII/630/630-1.htm',
  );
});

test('buildNHSourceUrl handles section sub-letter suffix', () => {
  assert.equal(
    buildNHSourceUrl('630', '1-a'),
    'https://gc.nh.gov/rsa/html/LXII/630/630-1-a.htm',
  );
});

test('buildNHSourceUrl handles letter-suffixed chapter', () => {
  assert.equal(
    buildNHSourceUrl('632-A', '2'),
    'https://gc.nh.gov/rsa/html/LXII/632-A/632-A-2.htm',
  );
});

test('buildSourceUrl seeder adapter round-trips colon citation form', () => {
  assert.equal(
    buildSourceUrl('630:1'),
    'https://gc.nh.gov/rsa/html/LXII/630/630-1.htm',
  );
  assert.equal(
    buildSourceUrl('632-A:2'),
    'https://gc.nh.gov/rsa/html/LXII/632-A/632-A-2.htm',
  );
  assert.equal(
    buildSourceUrl('630:1-a'),
    'https://gc.nh.gov/rsa/html/LXII/630/630-1-a.htm',
  );
});

test('buildSourceUrl rejects citation without colon', () => {
  assert.throws(() => buildSourceUrl('630-1'));
});

test('canonicalSectionId joins chapter + section with colon', () => {
  assert.equal(canonicalSectionId('630', '1'), '630:1');
  assert.equal(canonicalSectionId('632-A', '2'), '632-A:2');
  assert.equal(canonicalSectionId('630', '1-a'), '630:1-a');
});

test('partsFromUrl extracts chapter + section from URL', () => {
  assert.deepEqual(
    partsFromUrl('https://gc.nh.gov/rsa/html/LXII/630/630-1.htm'),
    { chapter: '630', section: '1' },
  );
  assert.deepEqual(
    partsFromUrl('https://gc.nh.gov/rsa/html/LXII/632-A/632-A-2.htm'),
    { chapter: '632-A', section: '2' },
  );
  assert.deepEqual(
    partsFromUrl('https://gc.nh.gov/rsa/html/LXII/630/630-1-a.htm'),
    { chapter: '630', section: '1-a' },
  );
});

test('partsFromUrl throws on unparseable URL', () => {
  assert.throws(() => partsFromUrl('https://example.com/foo'));
});

// ── Per-chapter config builder ──────────────────────────────────────────

test('buildChapterConfig produces stateCode=NH + chapter as titleNum', () => {
  const c = buildChapterConfig('630');
  assert.equal(c.stateCode, 'NH');
  assert.equal(c.stateName, 'New Hampshire');
  assert.equal(c.titleNum, '630');
  assert.equal(c.titleLabel, NH_CHAPTER_DESCRIPTIONS['630']);
  assert.ok(c.chapterListUrl.endsWith('NHTOC-LXII-630.htm'));
});

test('buildChapterConfig allowedHosts limited to gc.nh.gov', () => {
  const c = buildChapterConfig('630');
  assert.ok(c.allowedHosts instanceof Set);
  assert.ok(c.allowedHosts.has('gc.nh.gov'));
  assert.ok(!c.allowedHosts.has('justia.com'));
  assert.ok(!c.allowedHosts.has('findlaw.com'));
});

test('buildChapterConfig honors NH 11s Crawl-delay (HARD)', () => {
  const c = buildChapterConfig('630');
  assert.equal(c.crawlDelay, '11s');
  assert.equal(c.crawlDelayMs, 11000);
});

test('buildChapterConfig wires NH adapter functions', () => {
  const c = buildChapterConfig('630');
  assert.equal(typeof c.discoverSections, 'function');
  assert.equal(typeof c.parseSection, 'function');
  assert.equal(typeof c.buildSourceUrl, 'function');
});

// ── lib helpers ─────────────────────────────────────────────────────────

test('decodeEntities handles common entities', () => {
  assert.equal(decodeEntities('&amp;'), '&');
  assert.equal(decodeEntities('&sect;'), '§');
  assert.equal(decodeEntities('&quot;hi&quot;'), '"hi"');
});

test('stripHtml drops tags + collapses whitespace', () => {
  const out = stripHtml('<div class="x">  hello   <b>world</b>  </div>');
  assert.equal(out, 'hello world');
});

test('stripHtml drops script + style blocks', () => {
  const out = stripHtml('<p>keep</p><script>alert(1)</script><style>p{}</style>');
  assert.match(out, /keep/);
  assert.doesNotMatch(out, /alert/);
});

// ── Title TOC chapter discovery ─────────────────────────────────────────

test('discoverChapterTokens walks title-LXII fixture → ≥10 chapters', () => {
  const html = loadFixture('title-lxii-toc-sample.html');
  const tokens = discoverChapterTokens(html);
  assert.ok(tokens.length >= 10, `expected ≥10 chapters, got ${tokens.length}`);
  assert.ok(tokens.includes('625'));
  assert.ok(tokens.includes('630'));
});

test('discoverChapterTokens captures letter-suffixed chapter (632-A)', () => {
  const html = loadFixture('title-lxii-toc-sample.html');
  const tokens = discoverChapterTokens(html);
  assert.ok(tokens.includes('632-A'));
  assert.ok(tokens.includes('651-F'));
});

test('discoverChapterTokens dedupes', () => {
  const html = loadFixture('title-lxii-toc-sample.html');
  const tokens = discoverChapterTokens(html);
  const seen = new Set();
  for (const t of tokens) {
    assert.ok(!seen.has(t), `dup chapter: ${t}`);
    seen.add(t);
  }
});

test('discoverChapterTokens handles empty/short HTML', () => {
  assert.deepEqual(discoverChapterTokens(''), []);
  assert.deepEqual(discoverChapterTokens('<html></html>'), []);
});

// ── Per-chapter section discovery ───────────────────────────────────────

test('discoverSections walks chapter-630 fixture → ≥6 sections, includes 630:1', () => {
  const html = loadFixture('chapter-630-toc-sample.html');
  const descs = discoverSections(html, '630');
  assert.ok(descs.length >= 6, `expected ≥6 sections, got ${descs.length}`);
  assert.ok(descs.some((d) => d.sectionNum === '630:1'));
});

test('discoverSections filters out cross-chapter contamination (631:1 link)', () => {
  const html = loadFixture('chapter-630-toc-sample.html');
  const descs = discoverSections(html, '630');
  assert.ok(
    !descs.some((d) => d.sectionNum === '631:1'),
    'cross-chapter 631:1 must be filtered when discovering chapter 630',
  );
});

test('discoverSections captures sub-letter section (630:1-a)', () => {
  const html = loadFixture('chapter-630-toc-sample.html');
  const descs = discoverSections(html, '630');
  assert.ok(descs.some((d) => d.sectionNum === '630:1-a'));
});

test('discoverSections handles letter-suffixed chapter (632-A)', () => {
  const html = loadFixture('chapter-632-A-toc-sample.html');
  const descs = discoverSections(html, '632-A');
  assert.ok(descs.length >= 4, `expected ≥4 sections, got ${descs.length}`);
  assert.ok(descs.some((d) => d.sectionNum === '632-A:2'));
});

test('discoverSections all URLs are HTTPS gc.nh.gov', () => {
  const html = loadFixture('chapter-630-toc-sample.html');
  const descs = discoverSections(html, '630');
  for (const d of descs) {
    assert.match(d.sectionUrl, /^https:\/\/gc\.nh\.gov\/rsa\/html\/LXII\//);
  }
});

test('discoverSections dedupes', () => {
  const html = loadFixture('chapter-630-toc-sample.html');
  const descs = discoverSections(html, '630');
  const seen = new Set();
  for (const d of descs) {
    assert.ok(!seen.has(d.sectionUrl), `dup section URL: ${d.sectionUrl}`);
    seen.add(d.sectionUrl);
  }
});

test('discoverSections handles empty input', () => {
  assert.deepEqual(discoverSections('', '630'), []);
});

// ── Section parser ──────────────────────────────────────────────────────

test('parseSection extracts title + body from active 630:1 fixture', () => {
  const html = loadFixture('section-630-1-sample.html');
  const parsed = parseSection(html, '630:1');
  assert.ok(parsed, 'parser returned null on real active fixture');
  assert.match(parsed.titleText, /Capital Murder/i);
  assert.ok(parsed.bodyText.length >= 100);
  assert.match(parsed.bodyText, /capital murder/i);
  assert.equal(parsed.effectiveDate, null);
});

test('parseSection trims trailing dash/period decoration from headnote', () => {
  const html = loadFixture('section-630-1-sample.html');
  const parsed = parseSection(html, '630:1');
  assert.ok(parsed);
  // "Capital Murder. -" should strip to "Capital Murder"
  assert.equal(parsed.titleText.endsWith('.'), false);
  assert.equal(parsed.titleText.endsWith('-'), false);
});

test('parseSection drops Source block from body', () => {
  const html = loadFixture('section-630-1-sample.html');
  const parsed = parseSection(html, '630:1');
  assert.ok(parsed);
  // "1974, 34:8" appears in <b>Source.</b> block — should not be in body
  assert.doesNotMatch(parsed.bodyText, /1974, 34:8/);
});

test('parseSection extracts letter-suffixed chapter section (632-A:2)', () => {
  const html = loadFixture('section-632-A-2-sample.html');
  const parsed = parseSection(html, '632-A:2');
  assert.ok(parsed, 'parser returned null on 632-A:2 fixture');
  assert.match(parsed.titleText, /Aggravated Felonious Sexual Assault/i);
});

test('parseSection returns null on whole-section repealed', () => {
  const html = loadFixture('section-repealed-sample.html');
  const parsed = parseSection(html, '630:6');
  assert.equal(parsed, null, 'repealed section must return null');
});

test('parseSection returns null on too-short HTML (defensive)', () => {
  assert.equal(parseSection('<html></html>', '630:1'), null);
});

test('parseSection returns null when section number mismatches heading', () => {
  const html = loadFixture('section-630-1-sample.html');
  const parsed = parseSection(html, '630:99'); // wrong section num
  assert.equal(parsed, null, 'mismatched section num must return null');
});

test('parseSection output shape is {titleText, bodyText, effectiveDate}', () => {
  const html = loadFixture('section-630-1-sample.html');
  const parsed = parseSection(html, '630:1');
  assert.ok(parsed);
  assert.deepEqual(
    Object.keys(parsed).sort(),
    ['bodyText', 'effectiveDate', 'titleText'],
  );
});

// ── Adapter: bucketBDiscover ────────────────────────────────────────────

test('bucketBDiscover walks chapter-630 fixture → matches lib discoverSections count', () => {
  const html = loadFixture('chapter-630-toc-sample.html');
  const config = buildChapterConfig('630');
  const adapterDescs = bucketBDiscover(html, config);
  const libDescs = discoverSections(html, '630');
  assert.equal(adapterDescs.length, libDescs.length);
});

test('bucketBDiscover descriptors have required harness shape', () => {
  const html = loadFixture('chapter-630-toc-sample.html');
  const config = buildChapterConfig('630');
  const descs = bucketBDiscover(html, config);
  for (const d of descs.slice(0, 5)) {
    assert.ok(d.sectionNum, 'sectionNum missing');
    assert.ok(d.sectionUrl, 'sectionUrl missing');
    assert.ok(d.sectionUrl.startsWith('https://gc.nh.gov/'));
    assert.equal(d.chapterNum, '630');
  }
});

// ── Adapter: bucketBParse ──────────────────────────────────────────────

test('bucketBParse extracts title + body from active fixture', () => {
  const html = loadFixture('section-630-1-sample.html');
  const parsed = bucketBParse(html, '630:1');
  assert.ok(parsed);
  assert.ok(parsed.titleText);
  assert.ok(parsed.bodyText.length >= 30);
});

test('bucketBParse returns null on repealed shell', () => {
  const html = loadFixture('section-repealed-sample.html');
  const parsed = bucketBParse(html, '630:6');
  assert.equal(parsed, null);
});

test('bucketBParse output shape is {titleText, bodyText} (no effectiveDate leakage)', () => {
  const html = loadFixture('section-630-1-sample.html');
  const parsed = bucketBParse(html, '630:1');
  assert.ok(parsed);
  assert.deepEqual(Object.keys(parsed).sort(), ['bodyText', 'titleText']);
});
