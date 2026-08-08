// Vitest harness for the WV Chapter 61 seeder. Uses captured fixtures (sitemap
// fragment + 2 article PDFs + parsed text gold for art-1) to validate the parser
// + URL builders + orchestrator-level row contract end-to-end without network.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import {
  parseArticleUrlsFromSitemap,
  buildArticlePdfUrl,
  buildCanonicalSectionUrl,
  parseArticlePdfText,
  parseHeading,
  stripPageChrome,
} from '../lib/wv-code-pdf.mjs';
import {
  buildSectionColumn,
  buildWvConfig,
  collectRows,
  parseCliFlags,
} from '../seed-statutes-wv-chapter61.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.resolve(__dirname, 'fixtures/wv');

function readFix(name) {
  return fs.readFileSync(path.join(FIX, name));
}

describe('parseArticleUrlsFromSitemap', () => {
  const sitemapXml = readFix('sitemap-ch61.xml').toString('utf8');

  it('extracts article URLs (no chapter root, no sections)', () => {
    const urls = parseArticleUrlsFromSitemap(sitemapXml, '61');
    expect(urls.length).toBeGreaterThanOrEqual(30);
    expect(urls.length).toBeLessThan(40); // Ch61 has 35 articles
    // chapter root /61/ excluded
    expect(urls).not.toContain('https://code.wvlegislature.gov/61/');
    // every URL is article-shape: 61-<art>/
    for (const u of urls) {
      const segs = new URL(u).pathname.replace(/\/$/, '').split('/').filter(Boolean);
      expect(segs.length).toBe(1);
      const parts = segs[0].split('-');
      expect(parts.length).toBe(2);
      expect(parts[0]).toBe('61');
    }
  });

  it('returns empty array for non-string input', () => {
    expect(parseArticleUrlsFromSitemap(null, '61')).toEqual([]);
    expect(parseArticleUrlsFromSitemap(undefined, '61')).toEqual([]);
  });

  it('rejects non-https and wrong-host URLs', () => {
    const dirty = `<?xml version="1.0"?><urlset>
      <url><loc>http://code.wvlegislature.gov/61-99/</loc></url>
      <url><loc>https://malicious.tld/61-99/</loc></url>
      <url><loc>https://code.wvlegislature.gov/61-99/</loc></url>
    </urlset>`;
    const out = parseArticleUrlsFromSitemap(dirty, '61');
    expect(out).toEqual(['https://code.wvlegislature.gov/61-99/']);
  });
});

describe('buildArticlePdfUrl', () => {
  it('rewrites article HTML URL to PDF URL', () => {
    expect(buildArticlePdfUrl('https://code.wvlegislature.gov/61-2/'))
      .toBe('https://code.wvlegislature.gov/pdf/61-2/');
    expect(buildArticlePdfUrl('https://code.wvlegislature.gov/61-3A/'))
      .toBe('https://code.wvlegislature.gov/pdf/61-3A/');
  });

  it('throws on a non-article URL', () => {
    expect(() => buildArticlePdfUrl('https://code.wvlegislature.gov/61-2-1/'))
      .toThrow();
    expect(() => buildArticlePdfUrl('https://code.wvlegislature.gov/'))
      .toThrow();
  });
});

describe('buildCanonicalSectionUrl', () => {
  it('produces an HTTPS URL on the right host', () => {
    expect(buildCanonicalSectionUrl('61', '2', '1'))
      .toBe('https://code.wvlegislature.gov/61-2-1/');
    expect(buildCanonicalSectionUrl('61', '8B', '12'))
      .toBe('https://code.wvlegislature.gov/61-8B-12/');
  });
});

describe('buildSectionColumn', () => {
  it('joins chapter + article + section with dashes (matches URL slug)', () => {
    expect(buildSectionColumn('2', '1')).toBe('61-2-1');
    expect(buildSectionColumn('2', '5a')).toBe('61-2-5a');
    expect(buildSectionColumn('8B', '12')).toBe('61-8B-12');
    expect(buildSectionColumn('2', '1', '61')).toBe('61-2-1');
  });
});

describe('parseHeading', () => {
  it('parses a normal heading line', () => {
    const out = parseHeading('§61-2-1. First and second degree murder defined.');
    expect(out).toEqual({
      chapter: '61',
      articleCode: '2',
      sectionId: '1',
      headingTail: 'First and second degree murder defined.',
    });
  });

  it('lowercases section id with letter suffix', () => {
    const out = parseHeading('§61-2-5a. Concealment of deceased human body; penalty.');
    expect(out.sectionId).toBe('5a');
  });

  it('handles letter article codes', () => {
    const out = parseHeading('§61-8B-12. Some heading.');
    expect(out.articleCode).toBe('8B');
  });

  it('returns null for non-heading lines', () => {
    expect(parseHeading('Murder by poison, lying in wait, ...')).toBeNull();
    expect(parseHeading('WV Legislature')).toBeNull();
    expect(parseHeading('West Virginia Code §61-2')).toBeNull();
  });
});

describe('stripPageChrome', () => {
  it('removes running headers, page-of-N footers, article cover lines', () => {
    const lines = [
      'West Virginia Code §61-2',
      'May 3, 2026 Page 1 of 60 §61-2',
      'WEST VIRGINIA CODE CHAPTER 61',
      'ARTICLE 2',
      'WV Legislature',
      '',
      '-- 1 of 60 --',
      '',
      '§61-2-1. Murder defined.',
      'Body line one.',
      'Body line two.',
    ];
    const out = stripPageChrome(lines);
    expect(out).toEqual(['§61-2-1. Murder defined.', 'Body line one.', 'Body line two.']);
  });
});

describe('parseArticlePdfText (synthesized art-1 gold)', () => {
  // Use the captured pdf-parse text output as gold so the test stays
  // hermetic (no PDFParse dependency in the test).
  const goldText = readFix('art-61-1.text.txt').toString('utf8');

  it('parses all 9 sections from art 61-1', () => {
    const sections = parseArticlePdfText(goldText, { chapter: '61', articleCode: '1' });
    expect(sections.length).toBe(9);
    expect(sections.map((s) => s.sectionId))
      .toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    for (const s of sections) {
      expect(s.chapter).toBe('61');
      expect(s.articleCode).toBe('1');
      expect(s.titleText).toMatch(/^§61-1-/);
      expect(s.bodyText.length).toBeGreaterThan(20);
      expect(s.bodyText).not.toMatch(/^WV Legislature/);
      expect(s.bodyText).not.toMatch(/-- \d+ of \d+ --/);
    }
  });

  it('parses §61-1-1 heading and body correctly (treason)', () => {
    const sections = parseArticlePdfText(goldText, { chapter: '61', articleCode: '1' });
    const s = sections[0];
    expect(s.sectionId).toBe('1');
    expect(s.titleText).toContain('Treason defined');
    expect(s.bodyText.toLowerCase()).toContain('treason');
    expect(s.bodyText.toLowerCase()).toContain('two witnesses');
  });

  it('skips heading hint mismatch (returns 0)', () => {
    const sections = parseArticlePdfText(goldText, { chapter: '99', articleCode: '1' });
    expect(sections.length).toBe(0);
  });

  it('returns empty for empty input', () => {
    expect(parseArticlePdfText('')).toEqual([]);
    expect(parseArticlePdfText(null)).toEqual([]);
  });
});

describe('parseCliFlags', () => {
  it('parses defaults', () => {
    const f = parseCliFlags([]);
    expect(f).toEqual({ dryRun: false, verbose: false, articles: null, limit: null });
  });

  it('parses --dry-run --verbose --articles=2,3A --limit=5', () => {
    const f = parseCliFlags(['--dry-run', '--verbose', '--articles=2,3A', '--limit=5']);
    expect(f.dryRun).toBe(true);
    expect(f.verbose).toBe(true);
    expect(f.articles).toEqual(['2', '3A']);
    expect(f.limit).toBe(5);
  });
});

describe('collectRows (orchestrator end-to-end with injected fixtures)', () => {
  const sitemapXml = readFix('sitemap-ch61.xml').toString('utf8');
  const goldArt1Text = readFix('art-61-1.text.txt').toString('utf8');
  const goldArt2PdfBuf = readFix('art-61-2.pdf');

  // Stub fetchImpl: serves PDFs from disk, fails for any unexpected URL.
  function makeFetch() {
    return async (url, _opts) => {
      const u = String(url);
      if (u === 'https://code.wvlegislature.gov/pdf/61-1/') {
        return {
          ok: true, status: 200, statusText: 'OK',
          headers: new Map([['content-type', 'application/pdf']]),
          arrayBuffer: async () => readFix('art-61-1.pdf').buffer,
          text: async () => '',
        };
      }
      if (u === 'https://code.wvlegislature.gov/pdf/61-2/') {
        return {
          ok: true, status: 200, statusText: 'OK',
          headers: new Map([['content-type', 'application/pdf']]),
          arrayBuffer: async () => goldArt2PdfBuf.buffer,
          text: async () => '',
        };
      }
      throw new Error(`unexpected fetch: ${u}`);
    };
  }

  // Stub PDF extractor: instead of running pdf-parse on a Buffer, just
  // recognize the buffer by length and return canned text. Keeps test fast and
  // independent of pdf-parse's binary contract.
  function makePdfExtractor() {
    return async (buf) => {
      if (buf.length === readFix('art-61-1.pdf').length) {
        return goldArt1Text;
      }
      // For art-2, run pdf-parse for real (small enough; covers integration).
      const { createRequire } = await import('node:module');
      const req = createRequire(import.meta.url);
      const { PDFParse } = req('pdf-parse');
      const result = await new PDFParse({ data: buf }).getText();
      return String(result?.text ?? '');
    };
  }

  it('collects rows from articles 1 + 2 via injected fixtures', async () => {
    const cfg = buildWvConfig();
    const { rows, skipCount, errorCount } = await collectRows(cfg, {
      articles: ['1', '2'],
      fetchImpl: makeFetch(),
      pdfExtractor: makePdfExtractor(),
      sitemapXml,
      verbose: false,
    });
    expect(skipCount).toBe(0);
    expect(errorCount).toBe(0);
    // art-1 = 9 sections, art-2 = 50 sections → 59 rows
    expect(rows.length).toBeGreaterThanOrEqual(58);
    expect(rows.length).toBeLessThanOrEqual(60);
    // Spot-check schema contract.
    for (const r of rows) {
      expect(r.jurisdiction).toBe('WV');
      expect(r.title).toBe('61');
      expect(r.section).toMatch(/^61-[0-9A-Za-z]+-[0-9a-z]+$/);
      expect(r.section_text.length).toBeGreaterThan(20);
      expect(r.source_urls.length).toBe(1);
      expect(r.source_urls[0]).toMatch(/^https:\/\/code\.wvlegislature\.gov\/61-/);
      expect(r.text_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(r.is_current).toBe(true);
      expect(r.subsection).toBeNull();
    }
    // Murder section present and traceable.
    const murder = rows.find((r) => r.section === '61-2-1');
    expect(murder).toBeDefined();
    expect(murder.source_urls[0]).toBe('https://code.wvlegislature.gov/61-2-1/');
    expect(murder.section_text.toLowerCase()).toContain('murder');
  }, 30_000);

  it('respects --limit=1', async () => {
    const cfg = buildWvConfig();
    const { rows } = await collectRows(cfg, {
      limit: 1,
      fetchImpl: makeFetch(),
      pdfExtractor: makePdfExtractor(),
      sitemapXml,
    });
    // First article in sitemap order = 61-1 = 9 sections
    expect(rows.length).toBe(9);
  }, 15_000);
});
