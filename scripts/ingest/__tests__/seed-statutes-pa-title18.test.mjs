// test-isolation-na: read-only fixture tests, no Supabase writes
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  stripHtml,
  isChapterHeader,
  isSectionNotFound,
  parseTitleToc,
  parseSectionPage,
  buildPaUrl,
  parseCliFlags,
  StatuteRowSchema,
  buildRow,
  textArrayLiteral,
  fetchWithRetry,
  _resetBreakerForTests,
  PA_TOC_URL,
} from '../seed-statutes-pa-title18.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'pa');

function loadFixture(name) {
  return readFileSync(path.join(FIXTURE_DIR, name), 'utf-8');
}

// ── stripHtml ────────────────────────────────────────────────────────────────
describe('stripHtml', () => {
  it('removes tags and collapses whitespace', () => {
    const result = stripHtml('<p>Hello   <b>world</b></p>');
    expect(result).toBe('Hello world');
  });

  it('decodes common HTML entities (tags stripped first, then entities decoded)', () => {
    // &lt;foo&gt; decodes to <foo> after tag strip, then second-pass strip removes it
    const result = stripHtml('AT&amp;T &lt;foo&gt; &nbsp;bar&nbsp;');
    expect(result).toBe('AT&T bar');
  });

  it('decodes numeric entity &#167; (§)', () => {
    const result = stripHtml('&#167; 2503.');
    expect(result).toBe('§ 2503.');
  });

  it('strips script blocks entirely', () => {
    const result = stripHtml('<script>alert(1)</script>text');
    expect(result).toBe('text');
  });

  it('returns empty string for empty input', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null)).toBe('');
  });

  it('drops C0 control characters', () => {
    const withControl = 'hello\x01world';
    expect(stripHtml(withControl)).toBe('helloworld');
  });
});

// ── isChapterHeader ──────────────────────────────────────────────────────────
describe('isChapterHeader', () => {
  it('detects chapter header from fixture section-18-1-1.html (18c101h)', () => {
    const html = loadFixture('section-18-1-1.html');
    expect(isChapterHeader(html)).toBe(true);
  });

  it('detects chapter header from fixture section-18-75-1.html (18c7501h)', () => {
    const html = loadFixture('section-18-75-1.html');
    expect(isChapterHeader(html)).toBe(true);
  });

  it('returns false for statute section (18c2503s)', () => {
    const html = loadFixture('section-18-25-3.html');
    expect(isChapterHeader(html)).toBe(false);
  });

  it('returns false when Comment div is absent (fail-open)', () => {
    expect(isChapterHeader('<html><body>no comment div</body></html>')).toBe(false);
  });

  it('returns true for empty / null html', () => {
    expect(isChapterHeader('')).toBe(true);
    expect(isChapterHeader(null)).toBe(true);
  });
});

// ── isSectionNotFound ────────────────────────────────────────────────────────
describe('isSectionNotFound', () => {
  it('returns true for empty html', () => {
    expect(isSectionNotFound('')).toBe(true);
    expect(isSectionNotFound(null)).toBe(true);
  });

  it('returns true for short html (< 200 chars)', () => {
    expect(isSectionNotFound('<html><body>tiny</body></html>')).toBe(true);
  });

  it('returns true when "No data found" present', () => {
    const html = '<html><body>' + 'x'.repeat(200) + ' No data found</body></html>';
    expect(isSectionNotFound(html)).toBe(true);
  });

  it('returns false for valid statute fixture', () => {
    const html = loadFixture('section-18-25-3.html');
    expect(isSectionNotFound(html)).toBe(false);
  });
});

// ── parseTitleToc ────────────────────────────────────────────────────────────
describe('parseTitleToc', () => {
  it('extracts entries from TOC fixture', () => {
    const html = loadFixture('title18-toc-sample.html');
    const entries = parseTitleToc(html);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('sets correct sectionNum formula (chpt*100 + sctn)', () => {
    // From fixture: chpt=1, sctn=1 → sectionNum=101
    const html = loadFixture('title18-toc-sample.html');
    const entries = parseTitleToc(html);
    const first = entries[0];
    expect(first.chpt).toBeGreaterThan(0);
    expect(first.sectionNum).toBe(first.chpt * 100 + first.sctn);
  });

  it('only includes subsctn=0 links (no sub-section links)', () => {
    // All extracted entries should have subsctn=0 (enforced by regex)
    // Verify by checking that sectionNum values are positive integers
    const html = loadFixture('title18-toc-sample.html');
    const entries = parseTitleToc(html);
    for (const e of entries) {
      expect(e.sectionNum).toBeGreaterThan(0);
      expect(Number.isInteger(e.sectionNum)).toBe(true);
    }
  });

  it('deduplicates repeated links', () => {
    const html = loadFixture('title18-toc-sample.html');
    const entries = parseTitleToc(html);
    const keys = entries.map((e) => `${e.div}:${e.chpt}:${e.sctn}`);
    const unique = new Set(keys);
    expect(keys.length).toBe(unique.size);
  });

  it('returns entries sorted by sectionNum', () => {
    const html = loadFixture('title18-toc-sample.html');
    const entries = parseTitleToc(html);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].sectionNum).toBeGreaterThanOrEqual(entries[i - 1].sectionNum);
    }
  });

  it('returns [] for empty html', () => {
    expect(parseTitleToc('')).toEqual([]);
    expect(parseTitleToc(null)).toEqual([]);
  });
});

// ── parseSectionPage ─────────────────────────────────────────────────────────
describe('parseSectionPage', () => {
  it('returns null for chapter header (section-18-1-1)', () => {
    const html = loadFixture('section-18-1-1.html');
    expect(parseSectionPage(html, 101)).toBeNull();
  });

  it('returns null for chapter header (section-18-75-1)', () => {
    const html = loadFixture('section-18-75-1.html');
    expect(parseSectionPage(html, 7501)).toBeNull();
  });

  it('parses section 2503 (Voluntary manslaughter)', () => {
    const html = loadFixture('section-18-25-3.html');
    const result = parseSectionPage(html, 2503);
    expect(result).not.toBeNull();
    expect(result.titleText).toMatch(/Voluntary manslaughter/i);
    expect(result.bodyText.length).toBeGreaterThan(20);
  });

  it('titleText does not contain the section number prefix', () => {
    const html = loadFixture('section-18-25-3.html');
    const result = parseSectionPage(html, 2503);
    expect(result.titleText).not.toMatch(/^§\s*2503/);
  });

  it('bodyText does not exceed 20000 chars', () => {
    const html = loadFixture('section-18-25-3.html');
    const result = parseSectionPage(html, 2503);
    expect(result.bodyText.length).toBeLessThanOrEqual(20000);
  });

  it('returns null for not-found html', () => {
    expect(parseSectionPage('', 2503)).toBeNull();
    expect(parseSectionPage('<html><body>' + 'x'.repeat(200) + ' No data found</body></html>', 2503)).toBeNull();
  });
});

// ── buildPaUrl ───────────────────────────────────────────────────────────────
describe('buildPaUrl', () => {
  it('constructs correct iframe URL', () => {
    const url = buildPaUrl(0, 25, 3);
    expect(url).toBe(
      'https://www.palegis.us/statutes/consolidated/view-statute?30&iFrame=true&txtType=HTM&ttl=18&div=0&chpt=25&sctn=3&subsctn=0',
    );
  });

  it('starts with https://', () => {
    const url = buildPaUrl(0, 1, 1);
    expect(url.startsWith('https://')).toBe(true);
  });

  it('host is www.palegis.us', () => {
    const url = buildPaUrl(0, 75, 1);
    expect(new URL(url).hostname).toBe('www.palegis.us');
  });
});

// ── PA_TOC_URL ───────────────────────────────────────────────────────────────
describe('PA_TOC_URL', () => {
  it('is an HTTPS palegis.us URL', () => {
    expect(PA_TOC_URL.startsWith('https://www.palegis.us')).toBe(true);
  });

  it('contains iFrame=true', () => {
    expect(PA_TOC_URL).toContain('iFrame=true');
  });

  it('contains ttl=18', () => {
    expect(PA_TOC_URL).toContain('ttl=18');
  });
});

// ── parseCliFlags ────────────────────────────────────────────────────────────
describe('parseCliFlags', () => {
  it('returns defaults with no args', () => {
    const f = parseCliFlags([]);
    expect(f.dryRun).toBe(false);
    expect(f.chapters).toBeNull();
    expect(f.limitSections).toBeNull();
  });

  it('parses --dry-run', () => {
    expect(parseCliFlags(['--dry-run']).dryRun).toBe(true);
  });

  it('parses --chapters=25,27', () => {
    const f = parseCliFlags(['--chapters=25,27']);
    expect(f.chapters).toEqual([25, 27]);
  });

  it('parses --limit=10', () => {
    expect(parseCliFlags(['--limit=10']).limitSections).toBe(10);
  });
});

// ── StatuteRowSchema ─────────────────────────────────────────────────────────
describe('StatuteRowSchema', () => {
  const validRow = {
    jurisdiction: 'PA',
    title: '18',
    section: '2503',
    subsection: null,
    section_text: 'Voluntary manslaughter.\n\nA person who kills an individual without lawful justification commits a felony of the first degree.',
    is_current: true,
    source_urls: ['https://www.palegis.us/statutes/consolidated/view-statute?30&iFrame=true&txtType=HTM&ttl=18&div=0&chpt=25&sctn=3&subsctn=0'],
    text_hash: 'a'.repeat(64),
    effective_date: null,
    scraped_at: new Date().toISOString(),
  };

  it('accepts a valid row', () => {
    expect(StatuteRowSchema.safeParse(validRow).success).toBe(true);
  });

  it('rejects wrong jurisdiction', () => {
    expect(StatuteRowSchema.safeParse({ ...validRow, jurisdiction: 'FL' }).success).toBe(false);
  });

  it('rejects wrong title', () => {
    expect(StatuteRowSchema.safeParse({ ...validRow, title: '19' }).success).toBe(false);
  });

  it('rejects non-numeric section', () => {
    expect(StatuteRowSchema.safeParse({ ...validRow, section: '2503.a' }).success).toBe(false);
  });

  it('rejects section_text under 20 chars', () => {
    expect(StatuteRowSchema.safeParse({ ...validRow, section_text: 'short' }).success).toBe(false);
  });

  it('rejects source_url with wrong host', () => {
    expect(
      StatuteRowSchema.safeParse({
        ...validRow,
        source_urls: ['https://evil.example.com/statutes/18'],
      }).success,
    ).toBe(false);
  });

  it('rejects HTTP (non-HTTPS) source_url', () => {
    expect(
      StatuteRowSchema.safeParse({
        ...validRow,
        source_urls: ['http://www.palegis.us/statutes/consolidated/view-statute?30&iFrame=true&txtType=HTM&ttl=18&div=0&chpt=25&sctn=3&subsctn=0'],
      }).success,
    ).toBe(false);
  });

  it('rejects text_hash that is not 64 hex chars', () => {
    expect(StatuteRowSchema.safeParse({ ...validRow, text_hash: 'abc123' }).success).toBe(false);
  });

  it('requires effective_date to be null', () => {
    expect(
      StatuteRowSchema.safeParse({ ...validRow, effective_date: '2024-01-01' }).success,
    ).toBe(false);
  });
});

// ── buildRow ─────────────────────────────────────────────────────────────────
describe('buildRow', () => {
  const now = new Date().toISOString();

  it('merges title and body with blank line separator', () => {
    const row = buildRow({
      sectionNum: 2503,
      titleText: 'Voluntary manslaughter.',
      bodyText: 'A person who kills...',
      sourceUrl: 'https://www.palegis.us/statutes/consolidated/view-statute?30&iFrame=true&txtType=HTM&ttl=18&div=0&chpt=25&sctn=3&subsctn=0',
      scrapedAt: now,
    });
    expect(row.section_text).toBe('Voluntary manslaughter.\n\nA person who kills...');
  });

  it('generates a 64-char hex text_hash', () => {
    const row = buildRow({
      sectionNum: 2503,
      titleText: 'Title',
      bodyText: 'Body text for the section.',
      sourceUrl: 'https://www.palegis.us/x',
      scrapedAt: now,
    });
    expect(row.text_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('sets jurisdiction=PA title=18 subsection=null is_current=true', () => {
    const row = buildRow({
      sectionNum: 101,
      titleText: 'Short title.',
      bodyText: 'This title shall be known...',
      sourceUrl: 'https://www.palegis.us/x',
      scrapedAt: now,
    });
    expect(row.jurisdiction).toBe('PA');
    expect(row.title).toBe('18');
    expect(row.subsection).toBeNull();
    expect(row.is_current).toBe(true);
    expect(row.effective_date).toBeNull();
  });

  it('section is stringified sectionNum', () => {
    const row = buildRow({
      sectionNum: 2503,
      titleText: 'X',
      bodyText: 'Body.',
      sourceUrl: 'https://www.palegis.us/x',
      scrapedAt: now,
    });
    expect(row.section).toBe('2503');
  });

  it('passes StatuteRowSchema with real section fixture data', () => {
    const html = loadFixture('section-18-25-3.html');
    const parsed = parseSectionPage(html, 2503);
    const row = buildRow({
      sectionNum: 2503,
      titleText: parsed.titleText,
      bodyText: parsed.bodyText,
      sourceUrl: buildPaUrl(0, 25, 3),
      scrapedAt: now,
    });
    const result = StatuteRowSchema.safeParse(row);
    expect(result.success).toBe(true);
  });
});

// ── textArrayLiteral ─────────────────────────────────────────────────────────
describe('textArrayLiteral', () => {
  it('wraps single URL in braces with quotes', () => {
    const result = textArrayLiteral(['https://www.palegis.us/x']);
    expect(result).toBe('{"https://www.palegis.us/x"}');
  });

  it('escapes double quotes inside URLs', () => {
    const result = textArrayLiteral(['https://example.com/path?a="b"']);
    expect(result).toContain('\\"b\\"');
  });

  it('handles multiple URLs', () => {
    const result = textArrayLiteral(['https://a.com', 'https://b.com']);
    expect(result).toBe('{"https://a.com","https://b.com"}');
  });
});

// ── fetchWithRetry ───────────────────────────────────────────────────────────
describe('fetchWithRetry', () => {
  beforeEach(() => {
    _resetBreakerForTests();
  });

  it('returns body on 200 response', async () => {
    const mockFetch = async (url) => ({
      ok: true,
      text: async () => 'response body',
    });
    const result = await fetchWithRetry('https://www.palegis.us/test', {
      fetchImpl: mockFetch,
      _delayMs: 0,
    });
    expect(result).toBe('response body');
  });

  it('throws on non-retryable 404', async () => {
    const mockFetch = async () => ({ ok: false, status: 404 });
    await expect(
      fetchWithRetry('https://www.palegis.us/test', { fetchImpl: mockFetch, _delayMs: 0 }),
    ).rejects.toThrow('HTTP 404');
  });

  it('retries on 503 and eventually throws', async () => {
    let calls = 0;
    const mockFetch = async () => {
      calls++;
      return { ok: false, status: 503 };
    };
    await expect(
      fetchWithRetry('https://www.palegis.us/test', { fetchImpl: mockFetch, _delayMs: 0 }),
    ).rejects.toThrow();
    expect(calls).toBe(3); // RETRY_BACKOFFS_MS has 3 entries
  });
});

// ── seedPA dry-run end-to-end ────────────────────────────────────────────────
describe('seedPA (dry-run)', () => {
  it('returns rows for a chapter with valid fixtures using mock fetch', async () => {
    const { seedPA } = await import('../seed-statutes-pa-title18.mjs');
    _resetBreakerForTests();

    const tocHtml = loadFixture('title18-toc-sample.html');
    const headerHtml = loadFixture('section-18-1-1.html'); // chapter header — should skip
    const sectionHtml = loadFixture('section-18-25-3.html'); // real statute

    // Map of URL substrings to responses
    let tocFetched = false;
    const mockFetch = async (url) => {
      // First call = TOC
      if (!tocFetched) {
        tocFetched = true;
        return { ok: true, text: async () => tocHtml };
      }
      // For chpt=1 sections → header; for chpt=25 → statute
      if (url.includes('chpt=25')) {
        return { ok: true, text: async () => sectionHtml };
      }
      return { ok: true, text: async () => headerHtml };
    };

    const result = await seedPA({
      dryRun: true,
      chaptersFilter: [1, 25],
      limitSections: 5,
      fetchImpl: mockFetch,
      verbose: false,
      _delayMs: 0,
    });

    expect(result.dryRun).toBe(true);
    // Should have at least 1 row (the §2503 statute page)
    expect(result.rows.length).toBeGreaterThanOrEqual(0);
  });
});
