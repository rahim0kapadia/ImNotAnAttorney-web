// Template: scripts/ingest/__tests__/seed-statutes-oh.test.mjs (Phase 2 first state)
// Expert: openstates-team
// Pattern: cl-bulk-data-defensive #17 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists - synthetic fixtures, no network
//
// Unit tests for VA state statutes seed pipeline.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  VA_TITLE,
  VA_CHAPTERS,
  StatuteRowSchema,
  parseCliFlags,
  buildChapterUrl,
  buildSectionUrl,
  buildRow,
  textArrayLiteral,
  fetchWithRetry,
  _resetBreakerForTests,
  isSectionNotFound,
  stripHtml,
  extractSectionNumbers,
  parseSectionPage,
  seedVA,
} from '../seed-statutes-va.mjs';

// Synthetic VA section page mimicking law.lis.virginia.gov real markup.
const FIXTURE_18_2_266 = `<html><head><title>VA section 18.2-266</title></head>
<body>
<h1>Virginia Law</h1>
<header>page chrome</header>
<article id="vacode" class="content">
<span id='va_code' class="content">
<h2><span id='v0'>18.2-266</span>. Driving motor vehicle, engine, etc., while intoxicated, etc.</h2>
<section class='body editable' id='edit3280' data-table='CoV' data-field='body'>
<p>It shall be unlawful for any person to drive any motor vehicle while under the influence of alcohol.</p>
<p>1989, cc. 554, 574; 1992, c. 862; 1994, cc. 635, 682.</p>
</section>
</span>
</article>
</body></html>`;

const FIXTURE_CHAPTER_7 = `<html><body>
<a href="/vacode/title18.2/chapter7/section18.2-265.21/">18.2-265.21</a>
<a href="/vacode/title18.2/chapter7/section18.2-266/">18.2-266</a>
<a href="/vacode/title18.2/chapter7/section18.2-266.1/">18.2-266.1</a>
<!-- cross-reference to chapter 4 should NOT be picked up -->
<p>See also <a href="/vacode/title18.2/chapter4/section18.2-50/">18.2-50</a>.</p>
</body></html>`;

const FIXTURE_NOT_FOUND = `<html><body><h1>Page not found</h1><p>The page you requested does not exist.</p></body></html>`;

test('VA_CHAPTERS covers Phase 2 VA target chapters', () => {
  for (const ch of [4, 5, 6, 7]) {
    assert.ok(VA_CHAPTERS[ch], 'missing chapter ' + ch);
    assert.ok(VA_CHAPTERS[ch].description.length > 0, 'missing description');
  }
});

test('VA_TITLE is 18.2 (Crimes and Offenses Generally)', () => {
  assert.equal(VA_TITLE, '18.2');
});

test('buildChapterUrl produces canonical VA URL (HTTPS)', () => {
  const u = buildChapterUrl(7);
  assert.ok(u.startsWith('https://'), 'must be HTTPS');
  assert.ok(u.includes('law.lis.virginia.gov'));
  assert.ok(u.endsWith('/vacode/title18.2/chapter7/'));
});

test('buildSectionUrl uses title + chapter + section path', () => {
  const u = buildSectionUrl(7, '18.2-266');
  assert.ok(u.startsWith('https://'));
  assert.ok(u.endsWith('/vacode/title18.2/chapter7/section18.2-266/'));
});

test('buildChapterUrl throws for unknown chapter', () => {
  assert.throws(() => buildChapterUrl(999), /not in VA_CHAPTERS/);
});

test('parseCliFlags handles --dry-run + --chapters + --limit', () => {
  const f = parseCliFlags(['--dry-run', '--chapters=4,7', '--limit=10']);
  assert.equal(f.dryRun, true);
  assert.deepEqual(f.chapters, [4, 7]);
  assert.equal(f.limitSections, 10);
});

test('isSectionNotFound detects VA "not found" + missing va_code', () => {
  assert.equal(isSectionNotFound(FIXTURE_NOT_FOUND), true);
});

test('isSectionNotFound passes valid section pages', () => {
  assert.equal(isSectionNotFound(FIXTURE_18_2_266), false);
});

test('extractSectionNumbers filters to chapter-prefix only', () => {
  const s = extractSectionNumbers(FIXTURE_CHAPTER_7, '18.2', 7);
  assert.ok(s.includes('18.2-266'), 'missing 18.2-266');
  assert.ok(s.includes('18.2-266.1'), 'missing 18.2-266.1');
  // cross-reference to chapter 4 (18.2-50) must be excluded
  assert.ok(!s.includes('18.2-50'), '18.2-50 should be filtered out (chapter mismatch)');
});

test('parseSectionPage extracts title from h2 (separator strip)', () => {
  const p = parseSectionPage(FIXTURE_18_2_266, '18.2-266');
  assert.ok(p, 'parse returned null');
  assert.ok(p.titleText.includes('Driving motor vehicle'), 'got: ' + p.titleText);
});

test('parseSectionPage extracts body scoped to body editable section', () => {
  const p = parseSectionPage(FIXTURE_18_2_266, '18.2-266');
  assert.ok(p.bodyText.includes('drive any motor vehicle'));
  // legislative history block should be trimmed
  assert.ok(!p.bodyText.includes('1989, cc.'), 'history block leaked into body');
});

test('parseSectionPage returns null for 404 page', () => {
  assert.equal(parseSectionPage(FIXTURE_NOT_FOUND, '18.2-999'), null);
});

test('stripHtml strips tags materialized from decoded entities', () => {
  const s = stripHtml('clean &#60;script&#62;alert(1)&#60;/script&#62; end');
  assert.ok(!s.includes('<script'));
  assert.ok(!s.includes('</script'));
});

test('stripHtml drops C0 controls + DEL', () => {
  const s = stripHtml('a&#0;b&#8;c&#127;d');
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const bad = (c < 0x20 && c !== 0x09 && c !== 0x0A && c !== 0x0D) || c === 0x7F;
    assert.ok(!bad, 'control byte ' + c.toString(16) + ' survived');
  }
});

test('buildRow produces deterministic text_hash over section_text', () => {
  const r = buildRow({
    section: '18.2-266',
    titleText: 'DUI.',
    bodyText: 'No person shall drive while intoxicated.',
    sourceUrl: 'https://law.lis.virginia.gov/vacode/title18.2/chapter7/section18.2-266/',
    scrapedAt: '2026-04-24T12:00:00.000Z',
  });
  const expected = crypto.createHash('sha256')
    .update('DUI.\n\nNo person shall drive while intoxicated.')
    .digest('hex');
  assert.equal(r.text_hash, expected);
});

test('buildRow omits canonical_id (DB auto-generates UUID), uses VA_TITLE', () => {
  const r = buildRow({
    section: '18.2-266',
    titleText: 'DUI.',
    bodyText: 'long enough body text to pass zod min length',
    sourceUrl: 'https://law.lis.virginia.gov/x',
  });
  assert.equal(r.canonical_id, undefined);
  assert.equal(r.jurisdiction, 'VA');
  assert.equal(r.title, '18.2');
  assert.equal(r.subsection, null);
  assert.equal(r.is_current, true);
});

test('StatuteRowSchema accepts a valid VA row', () => {
  const r = buildRow({
    section: '18.2-266',
    titleText: 'DUI.',
    bodyText: 'No person shall drive while intoxicated.',
    sourceUrl: 'https://law.lis.virginia.gov/vacode/title18.2/chapter7/section18.2-266/',
    scrapedAt: '2026-04-24T12:00:00.000Z',
  });
  const check = StatuteRowSchema.safeParse(r);
  assert.ok(check.success, JSON.stringify(check.error?.issues));
});

test('StatuteRowSchema accepts subsection-numbered VA section (18.2-266.1)', () => {
  const r = buildRow({
    section: '18.2-266.1',
    titleText: 'Persons under age 21.',
    bodyText: 'long enough body text for zod minimum length',
    sourceUrl: 'https://law.lis.virginia.gov/x',
  });
  const check = StatuteRowSchema.safeParse(r);
  assert.ok(check.success, JSON.stringify(check.error?.issues));
});

test('StatuteRowSchema rejects non-law.lis.virginia.gov primary URL', () => {
  const r = buildRow({
    section: '18.2-266',
    titleText: 'P.',
    bodyText: 'long enough body text to pass zod minimum',
    sourceUrl: 'https://law.justia.com/codes/virginia/2024/18.2-266',
  });
  const check = StatuteRowSchema.safeParse(r);
  assert.equal(check.success, false);
});

test('StatuteRowSchema host check rejects substring spoofing', () => {
  const r = buildRow({
    section: '18.2-266',
    titleText: 'P.',
    bodyText: 'long enough body text to pass zod minimum',
    sourceUrl: 'https://attacker.example.com/law.lis.virginia.gov/fake',
  });
  assert.equal(StatuteRowSchema.safeParse(r).success, false);
});

test('textArrayLiteral escapes CR/LF/quotes/backslashes', () => {
  const lit = textArrayLiteral(['a"b\\c\nd\re']);
  assert.ok(!lit.includes('\n'));
  assert.ok(!lit.includes('\r'));
  assert.ok(lit.includes('\\"'));
  assert.ok(lit.includes('\\\\'));
});

test('fetchWithRetry rejects non-allowed host', async () => {
  _resetBreakerForTests();
  await assert.rejects(() => fetchWithRetry('https://evil.example.com/x', {
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => '' }),
  }), /Host not allowed/);
});

test('fetchWithRetry returns body on first success', async () => {
  _resetBreakerForTests();
  const out = await fetchWithRetry('https://law.lis.virginia.gov/x', {
    fetchImpl: async () => ({ ok: true, status: 200, async text() { return 'hello'; } }),
  });
  assert.equal(out, 'hello');
});

test('fetchWithRetry does NOT retry on 404', async () => {
  _resetBreakerForTests();
  let calls = 0;
  await assert.rejects(() => fetchWithRetry('https://law.lis.virginia.gov/x', {
    fetchImpl: async () => { calls += 1; return { ok: false, status: 404, async text() { return ''; } }; },
  }), /HTTP 404/);
  assert.equal(calls, 1);
});

test('seedVA dry-run parses fixtures end-to-end', async () => {
  _resetBreakerForTests();
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.endsWith('/chapter7/')) return { ok: true, status: 200, async text() { return FIXTURE_CHAPTER_7; } };
    return { ok: true, status: 200, async text() { return FIXTURE_18_2_266; } };
  };
  const out = await seedVA({
    dryRun: true,
    chapters: [7],
    limitSections: 3,
    fetchImpl,
  });
  assert.ok(out.rows.length > 0, 'expected at least 1 row, got ' + out.rows.length);
  for (const r of out.rows) {
    const check = StatuteRowSchema.safeParse(r);
    assert.ok(check.success, 'row failed schema: ' + JSON.stringify(check.error?.issues));
    assert.ok(r.source_urls[0].includes('law.lis.virginia.gov'));
  }
});

test('seedVA non-dry-run with zero rows throws WITHOUT touching dbFactory', async () => {
  _resetBreakerForTests();
  const fetchImpl = async () => ({ ok: true, status: 200, async text() { return FIXTURE_NOT_FOUND; } });
  let factoryCalls = 0;
  const dbFactory = async () => { factoryCalls += 1; throw new Error('factory should not be called'); };
  await assert.rejects(
    () => seedVA({ dryRun: false, chapters: [7], limitSections: 2, fetchImpl, dbFactory }),
    /no rows parsed/,
  );
  assert.equal(factoryCalls, 0);
});
