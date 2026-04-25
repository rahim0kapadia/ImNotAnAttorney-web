// Template: scripts/ingest/__tests__/seed-statutes-fl.test.mjs
// Expert: openstates-team + Cornell LII pattern parity
// Pattern: cl-bulk-data-defensive #17 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — synthetic fixtures, no network
//
// Unit tests for OH state statutes seed pipeline.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  OH_CHAPTERS,
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
  seedOH,
} from '../seed-statutes-oh.mjs';

// ── Fixtures ─────────────────────────────────────────────────────────────
// Synthetic OH page mimicking codes.ohio.gov real markup: <h1> with section
// number + name + separator, <div class="laws-body"> with <p> paragraphs,
// then <div class="laws-section-info"> module below.

const FIXTURE_2925_11 = `<html lang="en"><head><title>Section 2925.11 - Ohio Revised Code</title></head>
<body>
<main>
<h1>Section 2925.11 <span class='codes-separator'>|</span> Possession of controlled substances.</h1>
<div class="content-layout-body">
<div class="laws-body">
<span><p>(A) No person shall knowingly obtain, possess, or use a controlled substance or a controlled substance analog.</p>
<p>(B)(1) This section does not apply to manufacturers, licensed health professionals, pharmacists, owners of pharmacies.</p></span>
</div>
<div class="laws-section-info">
<p>Effective Date: 09/30/2024</p>
</div>
</main>
</body></html>`;

const FIXTURE_CHAPTER_2925 = `<html><body>
<a href="/ohio-revised-code/section-2925.01">2925.01</a>
<a href="/ohio-revised-code/section-2925.03">2925.03</a>
<a href="/ohio-revised-code/section-2925.11">2925.11</a>
<!-- cross-references that should NOT be picked up: -->
<p>See also <a href="/ohio-revised-code/section-2913.01">2913.01</a> for theft offenses.</p>
<p>And <a href="/ohio-revised-code/section-3719.01">3719.01</a> for separate definitions.</p>
</body></html>`;

const FIXTURE_NOT_FOUND = `<html><body><h1>Page not found</h1><p>The section you requested does not exist.</p></body></html>`;

// ── OH_CHAPTERS coverage ─────────────────────────────────────────────────

test('OH_CHAPTERS covers Phase 2 OH target chapters', () => {
  for (const ch of [2903, 2911, 2913, 2923, 2925, 4511]) {
    assert.ok(OH_CHAPTERS[ch], 'missing chapter ' + ch);
    assert.ok(OH_CHAPTERS[ch].description.length > 0, 'missing description for ' + ch);
  }
});

// ── URL construction ────────────────────────────────────────────────────

test('buildChapterUrl produces canonical OH URL (HTTPS)', () => {
  const u = buildChapterUrl(2925);
  assert.ok(u.startsWith('https://'), 'must be HTTPS: ' + u);
  assert.ok(u.includes('codes.ohio.gov'));
  assert.ok(u.endsWith('/chapter-2925'));
});

test('buildSectionUrl uses section path', () => {
  const u = buildSectionUrl('2925.11');
  assert.ok(u.startsWith('https://'), 'must be HTTPS');
  assert.ok(u.endsWith('/section-2925.11'));
});

test('buildChapterUrl throws for unknown chapter', () => {
  assert.throws(() => buildChapterUrl(9999), /not in OH_CHAPTERS/);
});

// ── CLI flags ────────────────────────────────────────────────────────────

test('parseCliFlags handles --dry-run + --chapters + --limit', () => {
  const f = parseCliFlags(['--dry-run', '--chapters=2925,4511', '--limit=10']);
  assert.equal(f.dryRun, true);
  assert.deepEqual(f.chapters, [2925, 4511]);
  assert.equal(f.limitSections, 10);
});

// ── 404 detection ────────────────────────────────────────────────────────

test('isSectionNotFound detects OH "not found" + missing laws-body', () => {
  assert.equal(isSectionNotFound(FIXTURE_NOT_FOUND), true);
});

test('isSectionNotFound passes valid section pages', () => {
  assert.equal(isSectionNotFound(FIXTURE_2925_11), false);
});

// ── Section discovery ──────────────────────────────────────────────────

test('extractSectionNumbers filters to chapter-prefix only (rejects cross-refs)', () => {
  const s = extractSectionNumbers(FIXTURE_CHAPTER_2925, 2925);
  assert.deepEqual(s, ['2925.01', '2925.03', '2925.11']);
  // Confirm cross-references to chapters 2913 + 3719 were rejected.
  assert.ok(!s.some((x) => x.startsWith('2913.')));
  assert.ok(!s.some((x) => x.startsWith('3719.')));
});

// ── Section page parse ──────────────────────────────────────────────────

test('parseSectionPage extracts title via h1 separator-strip', () => {
  const p = parseSectionPage(FIXTURE_2925_11, 2925, '2925.11');
  assert.equal(p.titleText, 'Possession of controlled substances.');
});

test('parseSectionPage extracts body scoped to laws-body class', () => {
  const p = parseSectionPage(FIXTURE_2925_11, 2925, '2925.11');
  assert.ok(p.bodyText.includes('controlled substance'));
  assert.ok(!p.bodyText.includes('Effective Date'), 'effective-date module leaked into body');
});

test('parseSectionPage extracts effective_date from laws-section-info', () => {
  const p = parseSectionPage(FIXTURE_2925_11, 2925, '2925.11');
  assert.equal(p.effectiveDate, '2024-09-30');
});

test('parseSectionPage returns null for 404 page', () => {
  assert.equal(parseSectionPage(FIXTURE_NOT_FOUND, 2925, '2925.99'), null);
});

// ── stripHtml XSS + control-char defense ────────────────────────────────

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

// ── Row builder ──────────────────────────────────────────────────────────

test('buildRow produces deterministic text_hash over section_text', () => {
  const r = buildRow({
    chapter: 2925, section: '2925.11',
    titleText: 'Possession.', bodyText: 'No person shall knowingly possess a controlled substance.',
    effectiveDate: '2024-09-30',
    sourceUrl: 'https://codes.ohio.gov/ohio-revised-code/section-2925.11',
    scrapedAt: '2026-04-24T12:00:00.000Z',
  });
  const expected = crypto.createHash('sha256')
    .update('Possession.\n\nNo person shall knowingly possess a controlled substance.')
    .digest('hex');
  assert.equal(r.text_hash, expected);
});

test('buildRow omits canonical_id (DB auto-generates UUID)', () => {
  const r = buildRow({
    chapter: 2925, section: '2925.11',
    titleText: 'Possession.', bodyText: 'long enough body text to pass zod min length',
    effectiveDate: null,
    sourceUrl: 'https://codes.ohio.gov/ohio-revised-code/section-2925.11',
  });
  assert.equal(r.canonical_id, undefined);
  assert.equal(r.jurisdiction, 'OH');
  assert.equal(r.title, '2925');
  assert.equal(r.subsection, null);
  assert.equal(r.is_current, true);
});

// ── Zod contract ─────────────────────────────────────────────────────────

test('StatuteRowSchema accepts a valid OH row', () => {
  const r = buildRow({
    chapter: 2925, section: '2925.11',
    titleText: 'Possession.', bodyText: 'No person shall knowingly possess a controlled substance.',
    effectiveDate: '2024-09-30',
    sourceUrl: 'https://codes.ohio.gov/ohio-revised-code/section-2925.11',
    scrapedAt: '2026-04-24T12:00:00.000Z',
  });
  const check = StatuteRowSchema.safeParse(r);
  assert.ok(check.success, JSON.stringify(check.error?.issues));
});

test('StatuteRowSchema rejects non-codes.ohio.gov primary URL', () => {
  const r = buildRow({
    chapter: 2925, section: '2925.11',
    titleText: 'P.', bodyText: 'long enough body text to pass zod minimum',
    effectiveDate: null,
    sourceUrl: 'https://law.justia.com/codes/ohio/2925.11',
  });
  const check = StatuteRowSchema.safeParse(r);
  assert.equal(check.success, false);
});

test('StatuteRowSchema rejects invalid calendar date in effective_date', () => {
  const r = buildRow({
    chapter: 2925, section: '2925.11',
    titleText: 'P.', bodyText: 'long enough body text to pass zod minimum',
    effectiveDate: '2024-02-30', // Feb 30 doesn't exist
    sourceUrl: 'https://codes.ohio.gov/x',
  });
  assert.equal(StatuteRowSchema.safeParse(r).success, false);
});

test('StatuteRowSchema host check rejects substring spoofing', () => {
  const r = buildRow({
    chapter: 2925, section: '2925.11',
    titleText: 'P.', bodyText: 'long enough body text to pass zod minimum',
    effectiveDate: null,
    sourceUrl: 'https://attacker.example.com/codes.ohio.gov/fake',
  });
  assert.equal(StatuteRowSchema.safeParse(r).success, false);
});

// ── TEXT[] literal ──────────────────────────────────────────────────────

test('textArrayLiteral escapes CR/LF/quotes/backslashes', () => {
  const lit = textArrayLiteral(['a"b\\c\nd\re']);
  assert.ok(!lit.includes('\n'));
  assert.ok(!lit.includes('\r'));
  assert.ok(lit.includes('\\"'));
  assert.ok(lit.includes('\\\\'));
});

// ── fetchWithRetry ──────────────────────────────────────────────────────

test('fetchWithRetry rejects non-allowed host', async () => {
  _resetBreakerForTests();
  await assert.rejects(() => fetchWithRetry('https://evil.example.com/x', { fetchImpl: async () => ({ ok: true, status: 200, text: async () => '' }) }), /Host not allowed/);
});

test('fetchWithRetry returns body on first success', async () => {
  _resetBreakerForTests();
  const out = await fetchWithRetry('https://codes.ohio.gov/x', {
    fetchImpl: async () => ({ ok: true, status: 200, async text() { return 'hello'; } }),
  });
  assert.equal(out, 'hello');
});

test('fetchWithRetry does NOT retry on 404', async () => {
  _resetBreakerForTests();
  let calls = 0;
  await assert.rejects(() => fetchWithRetry('https://codes.ohio.gov/x', {
    fetchImpl: async () => { calls += 1; return { ok: false, status: 404, async text() { return ''; } }; },
  }), /HTTP 404/);
  assert.equal(calls, 1);
});

// ── seedOH orchestrator smoke ──────────────────────────────────────────

test('seedOH dry-run parses fixtures end-to-end', async () => {
  _resetBreakerForTests();
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('chapter-2925')) return { ok: true, status: 200, async text() { return FIXTURE_CHAPTER_2925; } };
    return { ok: true, status: 200, async text() { return FIXTURE_2925_11; } };
  };
  const out = await seedOH({
    dryRun: true,
    chapters: [2925],
    limitSections: 3,
    fetchImpl,
  });
  assert.equal(out.rows.length, 3);
  for (const r of out.rows) {
    const check = StatuteRowSchema.safeParse(r);
    assert.ok(check.success, 'row failed schema');
    assert.ok(r.source_urls[0].includes('codes.ohio.gov'));
  }
});

test('seedOH non-dry-run with zero rows throws WITHOUT touching dbFactory', async () => {
  _resetBreakerForTests();
  const fetchImpl = async () => ({ ok: true, status: 200, async text() { return FIXTURE_NOT_FOUND; } });
  let factoryCalls = 0;
  const dbFactory = async () => { factoryCalls += 1; throw new Error('factory should not be called'); };
  await assert.rejects(
    () => seedOH({ dryRun: false, chapters: [2925], limitSections: 2, fetchImpl, dbFactory }),
    /no rows parsed/,
  );
  assert.equal(factoryCalls, 0);
});
