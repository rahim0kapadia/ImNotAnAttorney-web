// Template: scripts/ingest/__tests__/pji-ingest.test.mjs (pattern source)
// Expert: openstates-team
// Pattern: cl-bulk-data-defensive #17 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — self-contained unit test, synthetic fixtures
//
// Unit tests for scripts/ingest/seed-statutes-fl.mjs. No network, no DB — uses
// mock HTML fixtures and an injected fetch implementation. Validates the five
// OpenStates rules encoded in the script:
//   1. Chapter→range hardcoded lookup (FL_CHAPTERS)
//   2. Zod row-contract rejects-before-INSERT
//   3. Rate model — fetchWithRetry retries and surfaces final error
//   4. FLLawDL dead-end — encoded as csv-bulk-checked marker (meta, not here)
//   5. Weekly hash-diff refresh — text_hash deterministic per body_text
//
// Usage: node --test scripts/ingest/__tests__/seed-statutes-fl.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  FL_CHAPTERS,
  StatuteRowSchema,
  parseCliFlags,
  buildChapterIndexUrl,
  buildChapterPageUrl,
  buildSectionUrl,
  buildRow,
  textArrayLiteral,
  fetchWithRetry,
  _resetBreakerForTests,
  isSectionNotFound,
  stripHtml,
  extractSectionNumbers,
  parseSectionPage,
  seedFL,
} from '../seed-statutes-fl.mjs';

// ── Fixtures ────────────────────────────────────────────────────────────────
// Synthetic HTML mimicking FL Online Sunshine page structure enough to exercise
// the parser. Not byte-identical to production HTML — tests verify parse logic,
// not page fidelity.

const FIXTURE_316_INDEX = `<html><head><title>Chapter 316 Contents Index</title></head>
<body>
  <h1>2025 Florida Statutes, Chapter 316</h1>
  <ul>
    <li><a href="/statutes/index.cfm?App_mode=Display_Statute&URL=0300-0399/0316/Sections/316.193.html">316.193 — DUI</a></li>
    <li><a href="/statutes/index.cfm?App_mode=Display_Statute&URL=0300-0399/0316/Sections/316.1932.html">316.1932 — Implied consent</a></li>
    <li><a href="/statutes/index.cfm?App_mode=Display_Statute&URL=0300-0399/0316/Sections/316.003.html">316.003 — Definitions</a></li>
  </ul>
</body></html>`;

const FIXTURE_316_193 = `<html><head><title>316.193 Driving under the influence; penalties.</title></head>
<body>
<div class="SectionBody">
<p>316.193 Driving under the influence; penalties.—A person is guilty of the offense of driving under the influence if the person is driving or in actual physical control of a vehicle within this state and:</p>
<p>(a) The person is under the influence of alcoholic beverages, any chemical substance set forth in s. 877.111, or any substance controlled under chapter 893, when affected to the extent that the person's normal faculties are impaired;</p>
<p>(b) The person has a blood-alcohol level of 0.08 or more grams of alcohol per 100 milliliters of blood; or</p>
<p>(c) The person has a breath-alcohol level of 0.08 or more grams of alcohol per 210 liters of breath.</p>
<p>History.—s. 1, ch. 71-135; s. 2, ch. 73-331; Effective 7/1/2024.</p>
</div>
</body></html>`;

const FIXTURE_893_13 = `<html><head><title>893.13 Prohibited acts; penalties. - Florida Statutes</title></head>
<body>
<div class="SectionBody">
<p>893.13 Prohibited acts; penalties.—</p>
<p>(1)(a) Except as authorized by this chapter and chapter 499, a person may not sell, manufacture, or deliver, or possess with intent to sell, manufacture, or deliver, a controlled substance.</p>
<p>History.—Effective 10/1/2022.</p>
</div>
</body></html>`;

const FIXTURE_NOT_FOUND = `<html><head><title>Online Sunshine</title></head>
<body>
<p>The Statute you requested does not exist.</p>
</body></html>`;

const FIXTURE_THIN = `<html><body><p>short</p></body></html>`;

// ── URL construction ───────────────────────────────────────────────────────

test('FL_CHAPTERS covers Phase 1 target chapters', () => {
  for (const ch of [316, 775, 784, 810, 812, 893]) {
    assert.ok(FL_CHAPTERS[ch], `chapter ${ch} missing`);
    assert.match(FL_CHAPTERS[ch].range, /^\d{4}-\d{4}$/);
  }
});

test('buildChapterIndexUrl produces canonical FL Online Sunshine URL (HTTPS)', () => {
  const u = buildChapterIndexUrl(316);
  assert.ok(u.startsWith('https://'), 'must be HTTPS for integrity: ' + u);
  assert.ok(u.includes('leg.state.fl.us'));
  assert.ok(u.includes('0300-0399/0316/0316ContentsIndex.html'));
});

test('buildChapterPageUrl uses hardcoded range prefix', () => {
  const u = buildChapterPageUrl(893);
  assert.ok(u.includes('0800-0899/0893/0893.html'));
});

test('buildSectionUrl uses padded chapter in section filename', () => {
  const u = buildSectionUrl(316, '316.193');
  // FL serves real content only at /Sections/0316.193.html (padded); the
  // unpadded form returns a generic fallback page (200 OK but wrong body).
  assert.ok(u.includes('0300-0399/0316/Sections/0316.193.html'), 'got: ' + u);
});

test('buildChapterIndexUrl throws for unknown chapter', () => {
  assert.throws(() => buildChapterIndexUrl(999), /not in FL_CHAPTERS/);
});

// ── CLI flags ──────────────────────────────────────────────────────────────

test('parseCliFlags handles --dry-run and --chapters', () => {
  const f = parseCliFlags(['--dry-run', '--chapters=316,893']);
  assert.equal(f.dryRun, true);
  assert.deepEqual(f.chapters, [316, 893]);
});

test('parseCliFlags defaults are sensible', () => {
  const f = parseCliFlags([]);
  assert.equal(f.dryRun, false);
  assert.equal(f.chapters, null);
  assert.equal(f.limitSections, null);
});

// ── 404 detection ──────────────────────────────────────────────────────────

test('isSectionNotFound detects "does not exist" 200-page', () => {
  assert.equal(isSectionNotFound(FIXTURE_NOT_FOUND), true);
});

test('isSectionNotFound flags thin pages', () => {
  assert.equal(isSectionNotFound(FIXTURE_THIN), true);
});

test('isSectionNotFound passes valid section pages', () => {
  assert.equal(isSectionNotFound(FIXTURE_316_193), false);
  assert.equal(isSectionNotFound(FIXTURE_893_13), false);
});

// ── Section discovery ─────────────────────────────────────────────────────

test('extractSectionNumbers finds sorted unique sections', () => {
  const s = extractSectionNumbers(FIXTURE_316_INDEX, 316);
  assert.ok(s.includes('316.193'));
  assert.ok(s.includes('316.003'));
  assert.ok(s.includes('316.1932'));
  // Ascending sort.
  const idxA = s.indexOf('316.003');
  const idxB = s.indexOf('316.193');
  assert.ok(idxA < idxB, 'ascending sort broken');
});

test('extractSectionNumbers returns [] for HTML without matching chapter', () => {
  const s = extractSectionNumbers('<html><body>nothing here</body></html>', 316);
  assert.deepEqual(s, []);
});

// ── Section page parse ────────────────────────────────────────────────────

test('parseSectionPage extracts title and body', () => {
  const p = parseSectionPage(FIXTURE_316_193, 316, '316.193');
  assert.ok(p, 'parse returned null');
  assert.ok(p.titleText.length > 0);
  assert.ok(p.bodyText.length > 80);
  assert.ok(!p.bodyText.includes('History.—'), 'history notes not trimmed');
});

test('parseSectionPage strips " - Florida Statutes" suffix', () => {
  const p = parseSectionPage(FIXTURE_893_13, 893, '893.13');
  assert.ok(p.titleText);
  assert.ok(!p.titleText.includes('Florida Statutes'), 'suffix not stripped: ' + p.titleText);
});

test('parseSectionPage extracts effective_date when present', () => {
  const p = parseSectionPage(FIXTURE_316_193, 316, '316.193');
  assert.equal(p.effectiveDate, '2024-07-01');
});

test('parseSectionPage returns null for 404 page', () => {
  const p = parseSectionPage(FIXTURE_NOT_FOUND, 316, '316.999');
  assert.equal(p, null);
});

// ── stripHtml ─────────────────────────────────────────────────────────────

test('stripHtml removes tags and decodes entities', () => {
  const s = stripHtml('<p>Hello&nbsp;<b>world</b></p>');
  assert.equal(s, 'Hello world');
});

test('stripHtml decodes numeric entities', () => {
  const s = stripHtml('&#167;&#x2014;section');
  assert.equal(s, '§—section');
});

test('stripHtml strips tags materialized from decoded entities (XSS defense)', () => {
  // SEC-W3 from 2026-04-24 security audit: decoded `&#60;script&#62;` must
  // not re-materialize as executable <script> tags in the output.
  const s = stripHtml('clean &#60;script&#62;alert(1)&#60;/script&#62; end');
  assert.ok(!s.includes('<script'), 'decoded script tag leaked: ' + s);
  assert.ok(!s.includes('</script'), 'decoded closing script tag leaked: ' + s);
});

test('stripHtml drops NUL and other C0 control bytes (hash integrity)', () => {
  // SEC-W4: NUL bytes would be stripped by csvEscape during COPY, producing
  // a hash/data mismatch. Strip at parse layer so hash and stored text agree.
  const s = stripHtml('before&#0;after&#8;more');
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const isControl = (c < 0x20 && c !== 0x09 && c !== 0x0A && c !== 0x0D) || c === 0x7F;
    assert.ok(!isControl, "control byte 0x" + c.toString(16) + " survived at position " + i);
  }
});

// ── Row builder ──────────────────────────────────────────────────────────

test('buildRow produces deterministic text_hash over section_text', () => {
  const r1 = buildRow({
    chapter: 316,
    section: '316.193',
    titleText: 'DUI',
    bodyText: 'Driving under the influence is prohibited.',
    effectiveDate: '2024-07-01',
    sourceUrl: 'https://www.leg.state.fl.us/statutes/foo',
    scrapedAt: '2026-04-23T12:00:00.000Z',
  });
  const expected = crypto.createHash('sha256')
    .update('DUI\n\nDriving under the influence is prohibited.')
    .digest('hex');
  assert.equal(r1.text_hash, expected);
});

test('buildRow omits canonical_id (DB auto-generates UUID)', () => {
  const r = buildRow({
    chapter: 316, section: '316.193',
    titleText: 'DUI', bodyText: 'long enough body text to pass zod',
    effectiveDate: null, sourceUrl: 'https://www.leg.state.fl.us/x',
  });
  assert.equal(r.canonical_id, undefined, 'canonical_id must be absent — DB gen_random_uuid() supplies it');
  assert.equal(r.jurisdiction, 'FL');
  assert.equal(r.title, '316');
  assert.equal(r.subsection, null);
  assert.equal(r.is_current, true);
  assert.ok(r.section_text.startsWith('DUI\n\n'), 'section_text merges title + body with blank line');
  assert.ok(Array.isArray(r.source_urls));
  assert.equal(r.source_urls.length, 1);
});

// ── Zod contract (rule 2 — reject-before-INSERT) ────────────────────────

test('StatuteRowSchema accepts a valid row', () => {
  const r = buildRow({
    chapter: 316, section: '316.193',
    titleText: 'DUI', bodyText: 'Driving under the influence is prohibited.',
    effectiveDate: null, sourceUrl: 'https://www.leg.state.fl.us/statutes/foo',
    scrapedAt: '2026-04-23T12:00:00.000Z',
  });
  const check = StatuteRowSchema.safeParse(r);
  assert.ok(check.success, JSON.stringify(check.error?.issues));
});

test('StatuteRowSchema rejects empty source_urls', () => {
  const r = buildRow({
    chapter: 316, section: '316.193',
    titleText: 'DUI', bodyText: 'Driving under the influence is prohibited.',
    effectiveDate: null, sourceUrl: 'https://www.leg.state.fl.us/x',
    scrapedAt: '2026-04-23T12:00:00.000Z',
  });
  r.source_urls = [];
  const check = StatuteRowSchema.safeParse(r);
  assert.equal(check.success, false);
});

test('StatuteRowSchema rejects non-leg.state.fl.us primary URL', () => {
  const r = buildRow({
    chapter: 316, section: '316.193',
    titleText: 'DUI', bodyText: 'Driving under the influence is prohibited.',
    effectiveDate: null, sourceUrl: 'https://law.justia.com/codes/florida/chapter-316/section-316-193/',
    scrapedAt: '2026-04-23T12:00:00.000Z',
  });
  const check = StatuteRowSchema.safeParse(r);
  assert.equal(check.success, false);
});

test('StatuteRowSchema host check rejects substring spoofing', () => {
  // A URL containing "leg.state.fl.us" as a path segment but on an attacker
  // host must NOT pass. (SEC-W7 from 2026-04-24 security audit.)
  const r = buildRow({
    chapter: 316, section: '316.193',
    titleText: 'DUI', bodyText: 'Driving under the influence is prohibited.',
    effectiveDate: null, sourceUrl: 'https://attacker.example.com/leg.state.fl.us/fake',
    scrapedAt: '2026-04-23T12:00:00.000Z',
  });
  const check = StatuteRowSchema.safeParse(r);
  assert.equal(check.success, false, 'substring host spoof must be rejected');
});

test('StatuteRowSchema rejects invalid calendar date in effective_date', () => {
  const r = buildRow({
    chapter: 316, section: '316.193',
    titleText: 'DUI', bodyText: 'Driving under the influence is prohibited.',
    effectiveDate: '2024-02-30', // Feb 30 doesn't exist
    sourceUrl: 'https://www.leg.state.fl.us/x',
    scrapedAt: '2026-04-23T12:00:00.000Z',
  });
  const check = StatuteRowSchema.safeParse(r);
  assert.equal(check.success, false);
});

test('StatuteRowSchema rejects short section_text', () => {
  const r = buildRow({
    chapter: 316, section: '316.193',
    titleText: 't', bodyText: 'x',
    effectiveDate: null, sourceUrl: 'https://www.leg.state.fl.us/x',
    scrapedAt: '2026-04-23T12:00:00.000Z',
  });
  const check = StatuteRowSchema.safeParse(r);
  assert.equal(check.success, false);
});

test('StatuteRowSchema rejects malformed section', () => {
  const r = buildRow({
    chapter: 316, section: 'not-a-section',
    titleText: 'DUI', bodyText: 'Driving under the influence is prohibited.',
    effectiveDate: null, sourceUrl: 'https://www.leg.state.fl.us/x',
    scrapedAt: '2026-04-23T12:00:00.000Z',
  });
  const check = StatuteRowSchema.safeParse(r);
  assert.equal(check.success, false);
});

// ── TEXT[] literal ──────────────────────────────────────────────────────

test('textArrayLiteral produces Postgres-compatible TEXT[]', () => {
  const lit = textArrayLiteral(['http://a.example/x', 'https://b.example/y']);
  assert.equal(lit, '{"http://a.example/x","https://b.example/y"}');
});

test('textArrayLiteral escapes quotes and backslashes', () => {
  const lit = textArrayLiteral(['a"b\\c']);
  assert.equal(lit, '{"a\\"b\\\\c"}');
});

test('textArrayLiteral handles empty array', () => {
  assert.equal(textArrayLiteral([]), '{}');
});

test('textArrayLiteral escapes CR and LF (prevents CSV row breakage)', () => {
  const lit = textArrayLiteral(['https://x/a\nb\rc']);
  assert.ok(!lit.includes('\n'), 'LF leaked: ' + JSON.stringify(lit));
  assert.ok(!lit.includes('\r'), 'CR leaked: ' + JSON.stringify(lit));
});

test('StatuteRowSchema rejects source_urls with 11 entries (cap enforced)', () => {
  const r = buildRow({
    chapter: 316, section: '316.193',
    titleText: 'DUI', bodyText: 'Driving under the influence is prohibited.',
    effectiveDate: null, sourceUrl: 'https://www.leg.state.fl.us/x',
    scrapedAt: '2026-04-23T12:00:00.000Z',
  });
  r.source_urls = Array.from({ length: 11 }, (_, i) => 'https://www.leg.state.fl.us/' + i);
  const check = StatuteRowSchema.safeParse(r);
  assert.equal(check.success, false);
});

test('StatuteRowSchema rejects source_urls with URL longer than 2048 chars', () => {
  const r = buildRow({
    chapter: 316, section: '316.193',
    titleText: 'DUI', bodyText: 'Driving under the influence is prohibited.',
    effectiveDate: null, sourceUrl: 'https://www.leg.state.fl.us/x',
    scrapedAt: '2026-04-23T12:00:00.000Z',
  });
  r.source_urls = ['https://www.leg.state.fl.us/' + 'a'.repeat(2100)];
  const check = StatuteRowSchema.safeParse(r);
  assert.equal(check.success, false);
});

test('StatuteRowSchema accepts effective_date: null', () => {
  const r = buildRow({
    chapter: 316, section: '316.193',
    titleText: 'DUI', bodyText: 'Driving under the influence is prohibited.',
    effectiveDate: null, sourceUrl: 'https://www.leg.state.fl.us/x',
    scrapedAt: '2026-04-23T12:00:00.000Z',
  });
  const check = StatuteRowSchema.safeParse(r);
  assert.ok(check.success, 'valid effective_date:null should pass');
});

// ── fetchWithRetry (rule 3) ─────────────────────────────────────────────

test('fetchWithRetry returns body on first success', async () => {
  _resetBreakerForTests();
  const fetchImpl = async (_url) => ({
    ok: true, status: 200,
    async text() { return 'hello'; },
  });
  const out = await fetchWithRetry('http://x/', { fetchImpl });
  assert.equal(out, 'hello');
});

test('fetchWithRetry retries on 500 then succeeds', async () => {
  _resetBreakerForTests();
  let calls = 0;
  const fetchImpl = async (_url) => {
    calls += 1;
    if (calls === 1) return { ok: false, status: 500, async text() { return ''; } };
    return { ok: true, status: 200, async text() { return 'ok-' + calls; } };
  };
  const out = await fetchWithRetry('http://x/', { fetchImpl });
  assert.equal(out, 'ok-2');
  assert.equal(calls, 2);
});

test('fetchWithRetry surfaces final error after exhausting retries', async () => {
  _resetBreakerForTests();
  const fetchImpl = async () => { throw new Error('ECONN'); };
  await assert.rejects(() => fetchWithRetry('http://x/', { fetchImpl }), /ECONN/);
});

test('fetchWithRetry does NOT retry on 404 (non-retryable) — single call', async () => {
  _resetBreakerForTests();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: false, status: 404, async text() { return 'not found'; } };
  };
  await assert.rejects(() => fetchWithRetry('http://x/', { fetchImpl }), /HTTP 404/);
  assert.equal(calls, 1, '404 must not trigger retry');
});

// ── seedFL orchestrator smoke (dry-run, injected fetch) ─────────────────

test('seedFL dry-run parses fixtures end-to-end', async () => {
  _resetBreakerForTests();
  const responseByUrl = (url) => {
    if (url.includes('ContentsIndex')) return FIXTURE_316_INDEX;
    if (url.includes('316.193')) return FIXTURE_316_193;
    if (url.includes('316.1932')) return FIXTURE_316_193.replace('316.193', '316.1932');
    if (url.includes('316.003')) return FIXTURE_316_193.replace('316.193', '316.003');
    return FIXTURE_NOT_FOUND;
  };
  const fetchImpl = async (url) => {
    const body = responseByUrl(url);
    return {
      ok: true, status: 200,
      async text() { return body; },
    };
  };

  const out = await seedFL({
    dryRun: true,
    chapters: [316],
    limitSections: 3,
    fetchImpl,
  });

  assert.ok(out.rows.length >= 1, `expected at least 1 row, got ${out.rows.length}`);
  for (const r of out.rows) {
    const check = StatuteRowSchema.safeParse(r);
    assert.ok(check.success, 'row failed schema: ' + JSON.stringify(check.error?.issues));
    assert.ok(r.source_urls[0].includes('leg.state.fl.us'));
    assert.equal(r.canonical_id, undefined, 'canonical_id must not be set pre-INSERT');
    assert.equal(r.subsection, null);
    assert.ok(r.section_text.length >= 20);
  }
});

test('seedFL dry-run rejects rows that fail schema (regression guard)', async () => {
  _resetBreakerForTests();
  // Every section resolves to a "not found" page.
  const fetchImpl = async (_url) => ({
    ok: true, status: 200,
    async text() { return FIXTURE_NOT_FOUND; },
  });
  const out = await seedFL({
    dryRun: true,
    chapters: [316],
    limitSections: 2,
    fetchImpl,
  });
  assert.equal(out.rows.length, 0, 'expected zero rows when every section is a 404');
});

test('seedFL non-dry-run with zero rows throws WITHOUT touching dbFactory', async () => {
  // W7 regression lock: process.exit was replaced with throw; factory must
  // never be called when there are no rows.
  _resetBreakerForTests();
  const fetchImpl = async (_url) => ({
    ok: true, status: 200,
    async text() { return FIXTURE_NOT_FOUND; },
  });
  let factoryCalls = 0;
  const dbFactory = async () => { factoryCalls += 1; throw new Error('factory should not be called'); };
  await assert.rejects(
    () => seedFL({ dryRun: false, chapters: [316], limitSections: 2, fetchImpl, dbFactory }),
    /no rows parsed/,
  );
  assert.equal(factoryCalls, 0);
});
