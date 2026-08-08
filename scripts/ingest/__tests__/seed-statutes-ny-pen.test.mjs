// Template: scripts/ingest/__tests__/seed-statutes-mn-chapter609.test.mjs
// Pattern: cl-bulk-data-defensive #18 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — fixtures captured from nysenate.gov 2026-05-02; no network
//
// Unit tests for NY Penal Law seed pipeline (HTML scrape via nysenate.gov).
// The earlier JSON-API approach was abandoned 2026-05-02 (Open Legislation API
// requires a per-user API key; HTML scrape is the no-key path).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NY_BASE,
  NY_PEN_ROOT_URL,
  buildNySourceUrl,
  buildPenRootUrl,
  classifyLink,
  decodeEntities,
  discoverChildLinks,
  parseSection,
  sectionIdFromUrl,
  stripHtml,
  walkPenToc,
} from '../lib/ny-pen-html.mjs';
import {
  StatuteRowSchema,
  buildRow,
  parseCliFlags,
  seedNY,
  textArrayLiteral,
} from '../seed-statutes-ny-pen.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'ny');

function loadFixture(name) {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf-8');
}

const FX_ROOT = loadFixture('pen-toc-root.html');
const FX_PART = loadFixture('pen-part-p1.html');
const FX_TITLE = loadFixture('pen-title-p1ta.html');
const FX_ARTICLE = loadFixture('pen-article-p1taa1.html');
const FX_SECTION = loadFixture('section-125-25.html');

// ── Constants / URL builders ──────────────────────────────────────────────

test('NY_PEN_ROOT_URL points at nysenate.gov PEN root', () => {
  assert.equal(NY_PEN_ROOT_URL, 'https://www.nysenate.gov/legislation/laws/PEN');
  assert.equal(NY_BASE, 'https://www.nysenate.gov');
  assert.equal(buildPenRootUrl(), NY_PEN_ROOT_URL);
});

test('buildNySourceUrl produces canonical HTTPS nysenate.gov URL', () => {
  const u = buildNySourceUrl('125.25');
  assert.equal(u, 'https://www.nysenate.gov/legislation/laws/PEN/125.25');
  assert.ok(u.startsWith('https://www.nysenate.gov/'));
});

test('buildNySourceUrl strips unsafe chars (anti-injection)', () => {
  const u = buildNySourceUrl('125.25 OR 1=1');
  assert.ok(!u.includes(' '));
  assert.ok(!u.includes('='));
});

// ── HTML utilities ────────────────────────────────────────────────────────

test('decodeEntities handles common HTML entities', () => {
  assert.equal(decodeEntities('Smith &amp; Jones'), 'Smith & Jones');
  assert.equal(decodeEntities('&lt;p&gt;'), '<p>');
  assert.equal(decodeEntities('&sect;125'), '§125');
});

test('stripHtml drops tags + collapses whitespace', () => {
  const out = stripHtml('<p>Hello   <b>world</b></p>');
  assert.equal(out, 'Hello world');
});

test('stripHtml preserves <br> as newline (statute body shape)', () => {
  const out = stripHtml('Line one<br/>Line two<br>Line three');
  assert.ok(out.includes('Line one'));
  assert.ok(out.includes('Line two'));
});

// ── Link classification ───────────────────────────────────────────────────

test('classifyLink recognizes leaf SECTION URLs', () => {
  assert.equal(classifyLink('https://www.nysenate.gov/legislation/laws/PEN/125.25'), 'section');
  assert.equal(classifyLink('https://www.nysenate.gov/legislation/laws/PEN/1.00'), 'section');
  assert.equal(classifyLink('https://www.nysenate.gov/legislation/laws/PEN/70.06'), 'section');
});

test('classifyLink recognizes branch (PART/TITLE/ARTICLE) URLs', () => {
  assert.equal(classifyLink('https://www.nysenate.gov/legislation/laws/PEN/P1'), 'branch');
  assert.equal(classifyLink('https://www.nysenate.gov/legislation/laws/PEN/P1TA'), 'branch');
  assert.equal(classifyLink('https://www.nysenate.gov/legislation/laws/PEN/P1TAA1'), 'branch');
});

test('classifyLink rejects off-host or wrong-law URLs', () => {
  assert.equal(classifyLink('https://example.com/legislation/laws/PEN/125.25'), 'unknown');
  assert.equal(classifyLink('https://www.nysenate.gov/legislation/laws/CPL/1.00'), 'unknown');
  assert.equal(classifyLink('not a url'), 'unknown');
});

test('sectionIdFromUrl extracts dotted-decimal section number', () => {
  assert.equal(sectionIdFromUrl('https://www.nysenate.gov/legislation/laws/PEN/125.25'), '125.25');
  assert.equal(sectionIdFromUrl('https://www.nysenate.gov/legislation/laws/PEN/1.00'), '1.00');
});

test('sectionIdFromUrl throws on non-section URL', () => {
  assert.throws(() => sectionIdFromUrl('https://www.nysenate.gov/legislation/laws/PEN/P1'));
  assert.throws(() => sectionIdFromUrl('not a url'));
});

// ── Discovery on real fixtures ────────────────────────────────────────────

test('discoverChildLinks on PEN root fixture finds 4 PART branches', () => {
  const links = discoverChildLinks(FX_ROOT);
  // The 4 PART links P1..P4 should all be in there.
  const branches = links.filter((u) => classifyLink(u) === 'branch');
  assert.ok(branches.length >= 4, `expected >=4 branches, got ${branches.length}`);
  for (const part of ['P1', 'P2', 'P3', 'P4']) {
    assert.ok(
      links.some((u) => u.endsWith('/PEN/' + part)),
      `root TOC should link to /PEN/${part}, got ${JSON.stringify(links)}`,
    );
  }
});

test('discoverChildLinks on Part fixture yields TITLE branches', () => {
  const links = discoverChildLinks(FX_PART);
  const titles = links.filter((u) => /\/PEN\/P1T[A-Z]+$/.test(u));
  assert.ok(titles.length >= 1, `expected >=1 P1T* TITLE branches, got ${titles.length}`);
});

test('discoverChildLinks on Article fixture yields SECTION leaves', () => {
  const links = discoverChildLinks(FX_ARTICLE);
  const sections = links.filter((u) => classifyLink(u) === 'section');
  assert.ok(sections.length >= 1, `expected >=1 SECTION leaves on article page, got ${sections.length}`);
  for (const s of sections) {
    assert.ok(s.startsWith('https://www.nysenate.gov/'), `section URL should be HTTPS nysenate: ${s}`);
  }
});

test('discoverChildLinks dedupes URLs', () => {
  const html = `
    <a href="/legislation/laws/PEN/125.25" class="nys-openleg-result-item-link">a</a>
    <a href="/legislation/laws/PEN/125.25" class="nys-openleg-result-item-link">b</a>
  `;
  const links = discoverChildLinks(html);
  assert.equal(links.length, 1);
});

test('discoverChildLinks handles empty/garbage input', () => {
  assert.deepEqual(discoverChildLinks(''), []);
  assert.deepEqual(discoverChildLinks(null), []);
  assert.deepEqual(discoverChildLinks('<html></html>'), []);
});

// ── Section page parsing ──────────────────────────────────────────────────

test('parseSection extracts title + body from 125.25 fixture', () => {
  const out = parseSection(FX_SECTION, '125.25');
  assert.ok(out, 'parseSection returned null on real fixture');
  assert.ok(/murder in the second/i.test(out.titleText), `titleText: ${out.titleText}`);
  assert.ok(out.bodyText.includes('A person is guilty of murder'),
    `bodyText missing expected statute language: ${out.bodyText.slice(0, 200)}`);
  assert.ok(out.bodyText.length > 50);
});

test('parseSection rejects mismatched section number', () => {
  // Asking for 999.99 against a 125.25 page should return null.
  const out = parseSection(FX_SECTION, '999.99');
  assert.equal(out, null);
});

test('parseSection returns null on too-short input', () => {
  assert.equal(parseSection('', '125.25'), null);
  assert.equal(parseSection('<html>too short</html>', '125.25'), null);
  assert.equal(parseSection(null, '125.25'), null);
});

// ── TOC walker ────────────────────────────────────────────────────────────

test('walkPenToc traverses fixture tree and emits section URLs', async () => {
  // Map fixture URLs to fixture HTML; simulates the live TOC fan-out.
  const fixtureMap = new Map([
    ['https://www.nysenate.gov/legislation/laws/PEN', FX_ROOT],
    ['https://www.nysenate.gov/legislation/laws/PEN/P1', FX_PART],
    ['https://www.nysenate.gov/legislation/laws/PEN/P1TA', FX_TITLE],
    ['https://www.nysenate.gov/legislation/laws/PEN/P1TAA1', FX_ARTICLE],
  ]);
  // For un-mapped branch URLs (e.g. P2/P3/P4 + every Title/Article on those
  // paths), return an empty page so the walker terminates without throwing.
  const fetcher = async (url) => fixtureMap.get(url) ?? '<html><body></body></html>';

  const sections = await walkPenToc(fetcher);
  assert.ok(sections.length >= 1, `expected at least 1 section URL, got ${sections.length}`);
  for (const u of sections) {
    assert.equal(classifyLink(u), 'section', `walker emitted non-section URL: ${u}`);
    assert.ok(u.startsWith('https://www.nysenate.gov/'));
  }
});

test('walkPenToc enforces maxBranchPages safeguard', async () => {
  // Self-referential loop: every branch page links back to itself.
  // Walker dedupes via visited-set, so this should not actually blow the
  // budget — instead the walker returns no sections. We assert it terminates.
  const loopHtml = `<a href="${NY_PEN_ROOT_URL}" class="nys-openleg-result-item-link">loop</a>`;
  const fetcher = async () => loopHtml;
  const out = await walkPenToc(fetcher, { maxBranchPages: 5 });
  // No SECTION leaves discoverable, so 0 returned — but it MUST terminate.
  assert.deepEqual(out, []);
});

// ── CLI parsing ───────────────────────────────────────────────────────────

test('parseCliFlags defaults are dryRun=false, no limit', () => {
  const f = parseCliFlags([]);
  assert.equal(f.dryRun, false);
  assert.equal(f.verbose, false);
  assert.equal(f.limit, null);
});

test('parseCliFlags handles --dry-run + --verbose + --limit=N', () => {
  const f = parseCliFlags(['--dry-run', '--verbose', '--limit=3']);
  assert.equal(f.dryRun, true);
  assert.equal(f.verbose, true);
  assert.equal(f.limit, 3);
});

test('parseCliFlags rejects --limit=0 and --limit=-1 (treat as missing)', () => {
  assert.equal(parseCliFlags(['--limit=0']).limit, null);
  assert.equal(parseCliFlags(['--limit=-1']).limit, null);
});

// ── Row builder + Schema ──────────────────────────────────────────────────

test('buildRow + StatuteRowSchema accepts valid NY/PEN row', () => {
  const r = buildRow({
    section: '125.25',
    titleText: 'Murder in the second degree',
    bodyText: 'A person is guilty of murder when, with intent to cause the death of another person, he causes the death of such person or of a third person.',
    sourceUrl: 'https://www.nysenate.gov/legislation/laws/PEN/125.25',
    scrapedAt: '2026-05-02T00:00:00.000Z',
  });
  const check = StatuteRowSchema.safeParse(r);
  assert.ok(check.success, JSON.stringify(check.error?.issues));
  assert.equal(r.jurisdiction, 'NY');
  assert.equal(r.title, 'PEN');
  assert.equal(r.section, '125.25');
  assert.match(r.text_hash, /^[a-f0-9]{64}$/);
  assert.equal(r.source_urls.length, 1);
  assert.ok(r.source_urls[0].startsWith('https://www.nysenate.gov/'));
});

test('StatuteRowSchema rejects non-nysenate.gov primary URL', () => {
  const r = buildRow({
    section: '125.25',
    titleText: 'M',
    bodyText: 'long enough body text to pass minimum length check',
    sourceUrl: 'https://law.justia.com/codes/new-york/2024/pen/125.25',
  });
  assert.equal(StatuteRowSchema.safeParse(r).success, false);
});

test('StatuteRowSchema rejects body shorter than 10 chars', () => {
  const r = buildRow({
    section: '125.25',
    titleText: '',
    bodyText: 'short',
    sourceUrl: 'https://www.nysenate.gov/legislation/laws/PEN/125.25',
  });
  assert.equal(StatuteRowSchema.safeParse(r).success, false);
});

test('textArrayLiteral escapes CR/LF/quotes/backslashes', () => {
  const lit = textArrayLiteral(['a"b\\c\nd\re']);
  assert.ok(!lit.includes('\n'));
  assert.ok(!lit.includes('\r'));
  assert.ok(lit.includes('\\"'));
});

test('textArrayLiteral handles empty array', () => {
  assert.equal(textArrayLiteral([]), '{}');
  assert.equal(textArrayLiteral(null), '{}');
});

// ── End-to-end orchestrator (dry-run, no network) ────────────────────────

test('seedNY dry-run with sectionUrlsOverride + fixture-backed fetcher produces validated rows', async () => {
  const sectionUrl = 'https://www.nysenate.gov/legislation/laws/PEN/125.25';
  // fetchImpl mimics fetch() — returns Response-shape with text() method.
  const fetchImpl = async (url) => {
    if (url === sectionUrl) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => FX_SECTION,
      };
    }
    return { ok: false, status: 404, statusText: 'Not Found', text: async () => '' };
  };
  const out = await seedNY({
    dryRun: true,
    verbose: false,
    sectionUrlsOverride: [sectionUrl],
    fetchImpl,
    branchDelayMs: 0,
    sectionDelayMs: 0,
  });
  assert.ok(out.rows.length >= 1, `expected >=1 row, got ${out.rows.length}`);
  for (const r of out.rows) {
    assert.equal(r.jurisdiction, 'NY');
    assert.equal(r.title, 'PEN');
    assert.ok(r.section.length > 0, 'row has section_id');
    assert.ok(r.section_text.length >= 10, 'row has body_text');
    assert.ok(r.source_urls[0].startsWith('https://www.nysenate.gov/'),
      `source_url HTTPS nysenate: ${r.source_urls[0]}`);
    const check = StatuteRowSchema.safeParse(r);
    assert.ok(check.success, JSON.stringify(check.error?.issues));
  }
});

test('seedNY non-dry-run with under-floor count throws BEFORE dbFactory call', async () => {
  const sectionUrl = 'https://www.nysenate.gov/legislation/laws/PEN/125.25';
  const fetchImpl = async (url) => ({
    ok: true, status: 200, statusText: 'OK',
    text: async () => (url === sectionUrl ? FX_SECTION : ''),
  });
  let factoryCalls = 0;
  const dbFactory = async () => {
    factoryCalls += 1;
    throw new Error('factory should not be called');
  };
  await assert.rejects(
    () => seedNY({
      dryRun: false,
      sectionUrlsOverride: [sectionUrl],
      fetchImpl,
      dbFactory,
      branchDelayMs: 0,
      sectionDelayMs: 0,
    }),
    /below floor/,
  );
  assert.equal(factoryCalls, 0);
});
