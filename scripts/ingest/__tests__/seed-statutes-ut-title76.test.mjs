// test-isolation-na: pure parser + URL-builder unit tests against on-disk fixture text — no DB writes.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseTitle76Chapter,
  buildUtChapterShellUrl,
  buildUtChapterPdfUrl,
  buildUtSentinelPdfUrl,
  buildUtSourceUrl,
  extractVersionStemFromShell,
  UT_CONFIG,
  UT_TITLE76_CHAPTERS,
} from '../lib/ut-title76-pdf.mjs';
import { parseCliFlags, resolveChapterPdfUrl } from '../seed-statutes-ut-title76.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'ut', 'chapter5-sample.txt');
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, 'utf8');

describe('UT_TITLE76_CHAPTERS', () => {
  it('lists 13 chapter slugs', () => {
    expect(UT_TITLE76_CHAPTERS.length).toBe(13);
  });
  it('includes letter-suffix slugs 5a, 5b, 6a', () => {
    expect(UT_TITLE76_CHAPTERS).toContain('5a');
    expect(UT_TITLE76_CHAPTERS).toContain('5b');
    expect(UT_TITLE76_CHAPTERS).toContain('6a');
  });
  it('does NOT contain bogus slug 3a (verified 404 live)', () => {
    expect(UT_TITLE76_CHAPTERS).not.toContain('3a');
  });
  it('every slug matches digits + optional lowercase letter', () => {
    for (const ch of UT_TITLE76_CHAPTERS) {
      expect(ch).toMatch(/^\d{1,2}[a-z]?$/);
    }
  });
});

describe('UT_CONFIG', () => {
  it('has UT state code', () => {
    expect(UT_CONFIG.state).toBe('UT');
  });
  it('has a sectionRe regex', () => {
    expect(UT_CONFIG.sectionRe).toBeInstanceOf(RegExp);
  });
  it('section regex matches simple section', () => {
    const m = '76-5-101 Definitions.'.match(UT_CONFIG.sectionRe);
    expect(m).not.toBeNull();
    expect(m[1]).toBe('76-5-101');
    expect(m[2]).toBe('Definitions.');
  });
  it('section regex matches section with decimal', () => {
    const m = '76-5-102.1 Amended text'.match(UT_CONFIG.sectionRe);
    expect(m).not.toBeNull();
    expect(m[1]).toBe('76-5-102.1');
  });
  it('section regex rejects cross-ref like "76-5-418, next"', () => {
    const m = '76-5-418, 76-5-419 or'.match(UT_CONFIG.sectionRe);
    expect(m).toBeNull();
  });
  it('section regex rejects lines without section number', () => {
    const m = 'Just some body text'.match(UT_CONFIG.sectionRe);
    expect(m).toBeNull();
  });
});

describe('parseTitle76Chapter', () => {
  let sections = [];

  beforeAll(() => {
    sections = parseTitle76Chapter(FIXTURE_TEXT);
  });

  it('parses at least 8 sections from chapter 5 fixture', () => {
    expect(sections.length).toBeGreaterThanOrEqual(8);
  });

  it('first section has sectionNum "76-5-101"', () => {
    const first = sections[0];
    expect(first.sectionNum).toBe('76-5-101');
  });

  it('first section has non-empty title', () => {
    const first = sections[0];
    expect(first.title).toBeTruthy();
    expect(first.title.length).toBeGreaterThan(0);
  });

  it('first section has non-empty body', () => {
    const first = sections[0];
    expect(first.body).toBeTruthy();
    expect(first.body.length).toBeGreaterThan(20);
  });

  it('all sections have sectionNum matching regex', () => {
    for (const s of sections) {
      expect(s.sectionNum).toMatch(/^76-\d{1,2}[a-z]?-\d{1,4}(?:\.\d{1,4})?(?:-\d{1,4})?$/);
    }
  });

  it('title field never contains page-break artifacts', () => {
    for (const s of sections) {
      expect(s.title).not.toMatch(/^Utah\s+Code$/);
      expect(s.title).not.toMatch(/^Page\s+\d+$/);
      expect(s.title).not.toMatch(/^--\s*\d+\s+of\s+\d+\s*--$/);
    }
  });
});

describe('buildUtChapterShellUrl', () => {
  it('builds correct URL for chapter 5', () => {
    const url = buildUtChapterShellUrl('5');
    expect(url).toBe('https://le.utah.gov/xcode/Title76/Chapter5/76-5.html');
  });

  it('builds correct URL for chapter 5a', () => {
    const url = buildUtChapterShellUrl('5a');
    expect(url).toBe('https://le.utah.gov/xcode/Title76/Chapter5a/76-5a.html');
  });
});

describe('buildUtChapterPdfUrl', () => {
  it('builds correct PDF URL with version stem', () => {
    const url = buildUtChapterPdfUrl('5', 'C76-5_2022050420220504');
    expect(url).toBe('https://le.utah.gov/xcode/Title76/Chapter5/C76-5_2022050420220504.pdf');
  });
});

describe('buildUtSentinelPdfUrl', () => {
  it('builds sentinel URL for chapter 6a (empty versionArr)', () => {
    const url = buildUtSentinelPdfUrl('6a');
    expect(url).toContain('C76-6a_1800010118000101.pdf');
  });
});

describe('extractVersionStemFromShell', () => {
  it('extracts stem from valid HTML', () => {
    const html = `
      var versionArr = [ ['C76-5_2022050420220504.html','Current Version','C76-5_2022050420220504'] ];
    `;
    const stem = extractVersionStemFromShell(html);
    expect(stem).toBe('C76-5_2022050420220504');
  });

  it('returns null when versionArr is empty', () => {
    const html = `
      var versionArr = [ ];
    `;
    const stem = extractVersionStemFromShell(html);
    expect(stem).toBeNull();
  });

  it('returns null when no versionArr present', () => {
    const html = '<html><body>No versionArr here</body></html>';
    const stem = extractVersionStemFromShell(html);
    expect(stem).toBeNull();
  });
});

describe('buildUtSourceUrl', () => {
  it('returns the PDF URL as-is', () => {
    const sectionNum = '76-5-101';
    const pdfUrl = 'https://le.utah.gov/xcode/Title76/Chapter5/C76-5_2022050420220504.pdf';
    const source = buildUtSourceUrl(sectionNum, pdfUrl);
    expect(source).toBe(pdfUrl);
  });
});

describe('parseCliFlags', () => {
  it('parses --dry-run flag', () => {
    const flags = parseCliFlags(['--dry-run']);
    expect(flags.dryRun).toBe(true);
  });

  it('parses --chapters=5,5a,6', () => {
    const flags = parseCliFlags(['--chapters=5,5a,6']);
    expect(flags.chapters).toEqual(['5', '5a', '6']);
  });

  it('filters invalid chapter slugs from --chapters', () => {
    const flags = parseCliFlags(['--chapters=5,99,5a']);
    expect(flags.chapters).toEqual(['5', '5a']);
    expect(flags.chapters).not.toContain('99');
  });

  it('parses --verbose flag', () => {
    const flags = parseCliFlags(['--verbose']);
    expect(flags.verbose).toBe(true);
  });

  it('parses --limit=10', () => {
    const flags = parseCliFlags(['--limit=10']);
    expect(flags.limit).toBe(10);
  });

  it('combines multiple flags', () => {
    const flags = parseCliFlags(['--dry-run', '--chapters=5', '--verbose']);
    expect(flags.dryRun).toBe(true);
    expect(flags.chapters).toEqual(['5']);
    expect(flags.verbose).toBe(true);
  });
});
