// test-isolation-na: no Supabase writes — unit tests against real fixture HTML
//
// Tests for the Justia per-section harness using MA as the proof state.
// Fixtures captured live from malegislature.gov on 2026-05-01.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MA_CHAPTER_LABELS,
  MA_BASE_URL,
  decodeEntities,
  stripHtml,
  buildChapterUrl,
  buildSectionUrl,
  sectionIdFromUrl,
  discoverSectionUrls,
  parseSection,
} from '../lib/ma-html.mjs';
import {
  StatuteRowSchema,
  isAllowedSourceUrl,
  computeSectionHash,
  buildSectionRow,
  textArrayLiteral,
  fetchWithRetry,
  ingestStateBySections,
  _resetBreakerForTests,
} from '../../lib/justia-harness.mjs';
import { buildMaConfig, parseCliFlags } from '../seed-statutes-ma-justia.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXT = path.join(__dirname, 'fixtures', 'ma');

function readFixture(name) {
  return readFileSync(path.join(FIXT, name), 'utf-8');
}

// ─── ma-html.mjs primitives ─────────────────────────────────────────────────

describe('ma-html: decodeEntities', () => {
  it('decodes basic HTML entities', () => {
    expect(decodeEntities('A &amp; B')).toBe('A & B');
    expect(decodeEntities('&lt;tag&gt;')).toBe('<tag>');
    expect(decodeEntities('it&#39;s')).toBe("it's");
  });
  it('decodes section sign variants', () => {
    expect(decodeEntities('&sect;')).toBe('§');
    expect(decodeEntities('&#xa7;')).toBe('§');
    expect(decodeEntities('&#167;')).toBe('§');
  });
});

describe('ma-html: stripHtml', () => {
  it('strips tags and collapses whitespace', () => {
    expect(stripHtml('<p>hello <b>world</b></p>')).toBe('hello world');
  });
  it('drops script and style blocks', () => {
    expect(stripHtml('a<script>evil()</script>b')).toBe('a b');
    expect(stripHtml('a<style>.x{}</style>b')).toBe('a b');
  });
  it('returns empty string for null/empty input', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null)).toBe('');
  });
  it('drops C0 control chars except whitespace', () => {
    expect(stripHtml('a\x00b\x07c')).toBe('abc');
  });
});

describe('ma-html: buildChapterUrl', () => {
  it('builds numeric chapter URL', () => {
    expect(buildChapterUrl(265)).toBe(`${MA_BASE_URL}/Laws/GeneralLaws/PartIV/TitleI/Chapter265`);
  });
  it('builds suffixed chapter URL', () => {
    expect(buildChapterUrl('268A')).toBe(`${MA_BASE_URL}/Laws/GeneralLaws/PartIV/TitleI/Chapter268A`);
  });
});

describe('ma-html: buildSectionUrl', () => {
  it('builds simple section URL', () => {
    expect(buildSectionUrl(265, '1')).toBe(`${MA_BASE_URL}/Laws/GeneralLaws/PartIV/TitleI/Chapter265/Section1`);
  });
  it('builds suffixed section URL', () => {
    expect(buildSectionUrl(265, '13A')).toBe(`${MA_BASE_URL}/Laws/GeneralLaws/PartIV/TitleI/Chapter265/Section13A`);
  });
});

describe('ma-html: sectionIdFromUrl', () => {
  it('extracts simple section id', () => {
    expect(sectionIdFromUrl('https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter265/Section1')).toBe('265-1');
  });
  it('extracts suffixed section id', () => {
    expect(sectionIdFromUrl('https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter265/Section13A')).toBe('265-13A');
  });
  it('decodes %20 (space) and underscores it', () => {
    expect(sectionIdFromUrl('https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter265/Section6%20to%208')).toBe('265-6_to_8');
  });
  it('handles 268A chapter suffix', () => {
    expect(sectionIdFromUrl('https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter268A/Section1')).toBe('268A-1');
  });
  it('throws on unparseable URL', () => {
    expect(() => sectionIdFromUrl('https://malegislature.gov/some/other/path')).toThrow();
  });
});

describe('ma-html: MA_CHAPTER_LABELS', () => {
  it('contains all 12 Title I chapters', () => {
    expect(MA_CHAPTER_LABELS).toEqual(['263', '264', '265', '266', '267', '268', '268A', '269', '270', '271', '272', '274']);
  });
});

// ─── ma-html.mjs against real fixtures ──────────────────────────────────────

describe('discoverSectionUrls (real Chapter 265 fixture)', () => {
  let urls;
  beforeAll(() => {
    const html = readFixture('chapter-265.html');
    const chapterUrl = `${MA_BASE_URL}/Laws/GeneralLaws/PartIV/TitleI/Chapter265`;
    urls = discoverSectionUrls(html, chapterUrl);
  });

  it('finds at least 30 section URLs', () => {
    expect(urls.length).toBeGreaterThanOrEqual(30);
  });
  it('every URL is absolute https://malegislature.gov/...', () => {
    for (const u of urls) {
      expect(u).toMatch(/^https:\/\/malegislature\.gov\/Laws\/GeneralLaws\/PartIV\/TitleI\/Chapter265\/Section/);
    }
  });
  it('contains Chapter265/Section1', () => {
    expect(urls).toContain(`${MA_BASE_URL}/Laws/GeneralLaws/PartIV/TitleI/Chapter265/Section1`);
  });
  it('dedupes within a page', () => {
    const set = new Set(urls);
    expect(set.size).toBe(urls.length);
  });
  it('does NOT pick up sibling-chapter URLs (different chapter)', () => {
    const html = readFixture('chapter-265.html');
    const wrongChapter = discoverSectionUrls(html, `${MA_BASE_URL}/Laws/GeneralLaws/PartIV/TitleI/Chapter999`);
    expect(wrongChapter.length).toBe(0);
  });
});

describe('parseSection (real Chapter 265 Section 1 fixture)', () => {
  it('parses Section 1 (Murder defined)', () => {
    const html = readFixture('chapter-265-section-1.html');
    const out = parseSection(html, { sectionId: '265-1', sectionUrl: '' });
    expect(out).not.toBeNull();
    expect(out.titleText.toLowerCase()).toContain('murder');
    expect(out.bodyText.length).toBeGreaterThan(100);
    expect(out.bodyText.toLowerCase()).toContain('premeditated');
    expect(out.bodyText.toLowerCase()).toContain('first degree');
    expect(out.effectiveDate).toBeNull();
  });

  it('parses Section 13A (assault) — suffixed section ID', () => {
    const html = readFixture('chapter-265-section-13A.html');
    const out = parseSection(html, { sectionId: '265-13A', sectionUrl: '' });
    expect(out).not.toBeNull();
    expect(out.bodyText.length).toBeGreaterThan(50);
  });

  it('parses Chapter 268 Section 13B (different chapter)', () => {
    const html = readFixture('chapter-268-section-13B.html');
    const out = parseSection(html, { sectionId: '268-13B', sectionUrl: '' });
    expect(out).not.toBeNull();
    expect(out.bodyText.length).toBeGreaterThan(50);
  });

  it('returns null on empty / too-short input', () => {
    expect(parseSection('', { sectionId: '', sectionUrl: '' })).toBeNull();
    expect(parseSection('<html></html>', { sectionId: '', sectionUrl: '' })).toBeNull();
  });
});

// ─── justia-harness.mjs primitives ──────────────────────────────────────────

describe('justia-harness: isAllowedSourceUrl', () => {
  const allowed = new Set(['malegislature.gov']);
  it('accepts HTTPS on allowlisted host', () => {
    expect(isAllowedSourceUrl('https://malegislature.gov/foo', allowed)).toBe(true);
  });
  it('rejects HTTP on allowlisted host', () => {
    expect(isAllowedSourceUrl('http://malegislature.gov/foo', allowed)).toBe(false);
  });
  it('rejects HTTPS on non-allowlisted host', () => {
    expect(isAllowedSourceUrl('https://evil.tld/foo', allowed)).toBe(false);
  });
  it('rejects malformed URL', () => {
    expect(isAllowedSourceUrl('not-a-url', allowed)).toBe(false);
  });
});

describe('justia-harness: computeSectionHash', () => {
  it('produces 64-char hex SHA-256', () => {
    const h = computeSectionHash('A', 'B');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });
  it('is deterministic', () => {
    expect(computeSectionHash('foo', 'bar')).toBe(computeSectionHash('foo', 'bar'));
  });
  it('differs on different inputs', () => {
    expect(computeSectionHash('A', 'B')).not.toBe(computeSectionHash('A', 'C'));
  });
});

describe('justia-harness: textArrayLiteral', () => {
  it('handles simple array', () => {
    expect(textArrayLiteral(['https://a/'])).toBe('{"https://a/"}');
  });
  it('handles empty array', () => {
    expect(textArrayLiteral([])).toBe('{}');
    expect(textArrayLiteral(null)).toBe('{}');
  });
  it('escapes embedded quotes and backslashes', () => {
    expect(textArrayLiteral(['a"b'])).toBe('{"a\\"b"}');
    expect(textArrayLiteral(['a\\b'])).toBe('{"a\\\\b"}');
  });
});

describe('justia-harness: StatuteRowSchema', () => {
  const validRow = {
    jurisdiction: 'MA',
    title: 'I',
    section: '265-1',
    subsection: null,
    section_text: 'Murder defined\n\nMurder committed with deliberately premeditated malice aforethought.',
    is_current: true,
    source_urls: ['https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter265/Section1'],
    text_hash: 'a'.repeat(64),
    effective_date: null,
    scraped_at: '2026-05-01T12:00:00.000Z',
  };
  it('accepts a valid row', () => {
    expect(StatuteRowSchema.safeParse(validRow).success).toBe(true);
  });
  it('rejects 3-letter jurisdiction', () => {
    const r = StatuteRowSchema.safeParse({ ...validRow, jurisdiction: 'MAS' });
    expect(r.success).toBe(false);
  });
  it('rejects empty source_urls', () => {
    const r = StatuteRowSchema.safeParse({ ...validRow, source_urls: [] });
    expect(r.success).toBe(false);
  });
  it('rejects malformed text_hash', () => {
    const r = StatuteRowSchema.safeParse({ ...validRow, text_hash: 'short' });
    expect(r.success).toBe(false);
  });
  it('rejects effective_date in non-ISO format', () => {
    const r = StatuteRowSchema.safeParse({ ...validRow, effective_date: '5/1/2026' });
    expect(r.success).toBe(false);
  });
});

describe('justia-harness: buildSectionRow', () => {
  const cfg = {
    stateCode: 'MA',
    titleNum: 'I',
    allowedHosts: ['malegislature.gov'],
  };
  it('builds a valid row from a parsed section', () => {
    const url = 'https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter265/Section1';
    const { row, errors } = buildSectionRow(cfg, '265-1', url, {
      titleText: 'Murder defined',
      bodyText: 'Murder committed with deliberately premeditated malice aforethought is murder in the first degree.',
    });
    expect(errors).toEqual([]);
    expect(row.jurisdiction).toBe('MA');
    expect(row.title).toBe('I');
    expect(row.section).toBe('265-1');
    expect(row.source_urls[0]).toBe(url);
    expect(row.text_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.section_text).toContain('Murder defined');
    expect(row.section_text).toContain('premeditated');
  });
  it('rejects empty body', () => {
    const url = 'https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter265/Section1';
    const { row, errors } = buildSectionRow(cfg, '265-1', url, { titleText: 'x', bodyText: '' });
    expect(row).toBeNull();
    expect(errors[0]).toMatch(/bodyText/);
  });
  it('rejects URL not on allowlist', () => {
    const { row, errors } = buildSectionRow(cfg, '265-1', 'https://evil.tld/x', {
      titleText: 'a', bodyText: 'b'.repeat(50),
    });
    expect(row).toBeNull();
    expect(errors[0]).toMatch(/allowlist/);
  });
});

describe('justia-harness: fetchWithRetry (mocked fetch)', () => {
  beforeAll(() => _resetBreakerForTests());

  it('returns body on 200 OK', async () => {
    const fakeFetch = async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'hello' });
    const out = await fetchWithRetry('https://malegislature.gov/x', {
      allowedHosts: ['malegislature.gov'],
      crawlDelayMs: 0,
      fetchImpl: fakeFetch,
    });
    expect(out).toBe('hello');
  });

  it('throws fast on 404 (non-retryable)', async () => {
    const fakeFetch = async () => ({ ok: false, status: 404, statusText: 'Not Found', text: async () => '' });
    await expect(fetchWithRetry('https://malegislature.gov/x', {
      allowedHosts: ['malegislature.gov'],
      crawlDelayMs: 0,
      fetchImpl: fakeFetch,
    })).rejects.toThrow(/HTTP 404/);
  });

  it('rejects non-allowlisted host before fetching', async () => {
    let called = false;
    const fakeFetch = async () => { called = true; return { ok: true, status: 200, text: async () => '' }; };
    await expect(fetchWithRetry('https://evil.tld/x', {
      allowedHosts: ['malegislature.gov'],
      crawlDelayMs: 0,
      fetchImpl: fakeFetch,
    })).rejects.toThrow(/allowlist/);
    expect(called).toBe(false);
  });
});

// ─── ingestStateBySections — integration with mocked fetch ──────────────────

describe('ingestStateBySections (real fixtures, mocked fetch, dry-run)', () => {
  beforeAll(() => _resetBreakerForTests());

  it('discovers + parses + builds rows from Chapter 265 fixture', async () => {
    const ch265Url = `${MA_BASE_URL}/Laws/GeneralLaws/PartIV/TitleI/Chapter265`;
    const ch265Html = readFixture('chapter-265.html');
    const sec1Html = readFixture('chapter-265-section-1.html');
    const sec13aHtml = readFixture('chapter-265-section-13A.html');

    // Fake fetch: chapter URL returns chapter HTML; sections return their fixture; rest return Sec1 (best-effort).
    const fakeFetch = async (url) => {
      let body;
      if (url === ch265Url) body = ch265Html;
      else if (url.endsWith('/Section13A')) body = sec13aHtml;
      else body = sec1Html;
      return { ok: true, status: 200, statusText: 'OK', text: async () => body };
    };

    const cfg = buildMaConfig({ chapters: ['265'], maxSections: 5 });
    const result = await ingestStateBySections(cfg, {
      dryRun: true,
      fetchImpl: fakeFetch,
    });

    expect(result.rowCount).toBeGreaterThan(0);
    expect(result.rowCount).toBeLessThanOrEqual(5);
    expect(result.errorCount).toBe(0);
  }, 30_000);
});

// ─── seed-statutes-ma-justia.mjs CLI / config ───────────────────────────────

describe('seed-statutes-ma-justia: parseCliFlags', () => {
  it('parses --dry-run', () => {
    expect(parseCliFlags(['--dry-run'])).toEqual({
      dryRun: true, verbose: false, chapters: null, maxSections: null,
    });
  });
  it('parses --chapters and --max-sections', () => {
    expect(parseCliFlags(['--chapters=265,268', '--max-sections=10'])).toEqual({
      dryRun: false, verbose: false, chapters: ['265', '268'], maxSections: 10,
    });
  });
});

describe('seed-statutes-ma-justia: buildMaConfig', () => {
  it('defaults to all 12 Title I chapters', () => {
    const cfg = buildMaConfig({});
    expect(cfg.chapterRootUrls.length).toBe(12);
    expect(cfg.stateCode).toBe('MA');
    expect(cfg.titleNum).toBe('I');
    expect(cfg.allowedHosts).toEqual(['malegislature.gov']);
  });
  it('honors chapter sub-selection', () => {
    const cfg = buildMaConfig({ chapters: ['265', '268A'] });
    expect(cfg.chapterRootUrls.length).toBe(2);
    expect(cfg.chapterRootUrls[0]).toContain('Chapter265');
    expect(cfg.chapterRootUrls[1]).toContain('Chapter268A');
  });
});
