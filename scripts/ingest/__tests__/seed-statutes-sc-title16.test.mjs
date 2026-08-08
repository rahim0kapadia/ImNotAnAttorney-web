// test-isolation-na: no Supabase writes — unit tests against real fixture HTML
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseScChapter,
  parseScChapters,
  buildScSourceUrl,
  buildScChapterUrl,
  isValidScSectionNum,
  stripHtml,
  SC_TITLE16_CHAPTERS,
} from '../lib/sc-html.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'sc', 't16c001-sample.html');
const FIXTURE_HTML = readFileSync(FIXTURE_PATH, 'utf8');

// ---------------------------------------------------------------------------
// buildScSourceUrl
// ---------------------------------------------------------------------------

describe('buildScSourceUrl', () => {
  it('builds canonical URL for ch1 section', () => {
    expect(buildScSourceUrl('16-1-10')).toBe(
      'https://www.scstatehouse.gov/code/t16c001.php#16-1-10'
    );
  });

  it('builds canonical URL for double-digit chapter section', () => {
    expect(buildScSourceUrl('16-23-50')).toBe(
      'https://www.scstatehouse.gov/code/t16c023.php#16-23-50'
    );
  });

  it('builds canonical URL for chapter 27 section', () => {
    expect(buildScSourceUrl('16-27-30')).toBe(
      'https://www.scstatehouse.gov/code/t16c027.php#16-27-30'
    );
  });

  it('returns an HTTPS URL', () => {
    expect(buildScSourceUrl('16-1-10')).toMatch(/^https:\/\//);
  });

  it('contains the section number in the URL fragment', () => {
    expect(buildScSourceUrl('16-3-20')).toContain('#16-3-20');
  });

  it('uses scstatehouse.gov host', () => {
    expect(buildScSourceUrl('16-1-10')).toContain('www.scstatehouse.gov');
  });
});

// ---------------------------------------------------------------------------
// buildScChapterUrl
// ---------------------------------------------------------------------------

describe('buildScChapterUrl', () => {
  it('zero-pads single-digit chapters to 3 digits', () => {
    expect(buildScChapterUrl('1')).toBe('https://www.scstatehouse.gov/code/t16c001.php');
  });

  it('zero-pads two-digit chapters to 3 digits', () => {
    expect(buildScChapterUrl('27')).toBe('https://www.scstatehouse.gov/code/t16c027.php');
  });

  it('accepts numeric chapter argument', () => {
    expect(buildScChapterUrl(11)).toBe('https://www.scstatehouse.gov/code/t16c011.php');
  });
});

// ---------------------------------------------------------------------------
// SC_TITLE16_CHAPTERS
// ---------------------------------------------------------------------------

describe('SC_TITLE16_CHAPTERS', () => {
  it('contains exactly 17 chapters', () => {
    expect(SC_TITLE16_CHAPTERS).toHaveLength(17);
  });

  it('starts with chapter 1 and ends with chapter 27', () => {
    expect(SC_TITLE16_CHAPTERS[0]).toBe('1');
    expect(SC_TITLE16_CHAPTERS[SC_TITLE16_CHAPTERS.length - 1]).toBe('27');
  });

  it('contains expected criminal-code chapters', () => {
    // Spot-check key chapters: 1 (felonies), 3 (homicide), 11 (forgery), 25 (DV)
    for (const ch of ['1', '3', '11', '25']) {
      expect(SC_TITLE16_CHAPTERS).toContain(ch);
    }
  });
});

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    expect(stripHtml('<b>Hello</b> <p>World</p>')).toBe('Hello World');
  });

  it('decodes &lt; and &gt; entities', () => {
    const result = stripHtml('&lt;br /&gt;text');
    expect(result).not.toContain('&lt;');
    expect(result).toContain('text');
  });

  it('decodes &amp;', () => {
    expect(stripHtml('A &amp; B')).toContain('A & B');
  });

  it('decodes &nbsp; to whitespace', () => {
    const result = stripHtml('text&nbsp;here');
    expect(result).not.toContain('&nbsp;');
    expect(result).toContain('text');
    expect(result).toContain('here');
  });

  it('decodes § entity', () => {
    expect(stripHtml('See &#167; 16-1-10')).toContain('§');
  });

  it('collapses whitespace', () => {
    expect(stripHtml('  foo   bar  ')).toBe('foo bar');
  });
});

// ---------------------------------------------------------------------------
// isValidScSectionNum
// ---------------------------------------------------------------------------

describe('isValidScSectionNum', () => {
  it('accepts canonical 16-X-N format', () => {
    expect(isValidScSectionNum('16-1-10')).toBe(true);
    expect(isValidScSectionNum('16-27-50')).toBe(true);
  });

  it('accepts amended sections with trailing alpha', () => {
    expect(isValidScSectionNum('16-3-20a')).toBe(true);
  });

  it('rejects sections from other titles', () => {
    expect(isValidScSectionNum('17-1-10')).toBe(false);
  });

  it('rejects malformed inputs', () => {
    expect(isValidScSectionNum('')).toBe(false);
    expect(isValidScSectionNum(null)).toBe(false);
    expect(isValidScSectionNum('bad')).toBe(false);
    expect(isValidScSectionNum('16-1')).toBe(false);
    expect(isValidScSectionNum('16-1-10-5')).toBe(false);
    expect(isValidScSectionNum('16-a-10')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseScChapter — against real fixture HTML
// ---------------------------------------------------------------------------

describe('parseScChapter (real fixture)', () => {
  let sections;

  beforeAll(() => {
    sections = parseScChapter(FIXTURE_HTML, '1');
  });

  it('parses at least 5 sections from ch1 fixture', () => {
    expect(sections.length).toBeGreaterThanOrEqual(5);
  });

  it('section 16-1-10 is present', () => {
    const s = sections.find(x => x.sectionNum === '16-1-10');
    expect(s).toBeDefined();
  });

  it('section 16-1-10 titleText mentions felonies', () => {
    const s = sections.find(x => x.sectionNum === '16-1-10');
    expect(s.titleText.toLowerCase()).toContain('felon');
  });

  it('section 16-1-10 body mentions classes of felonies', () => {
    const s = sections.find(x => x.sectionNum === '16-1-10');
    expect(s.bodyText).toContain('Class A');
  });

  it('all sections have non-empty titleText', () => {
    for (const s of sections) {
      expect(s.titleText.length).toBeGreaterThan(0);
    }
  });

  it('all sections have non-empty bodyText', () => {
    for (const s of sections) {
      expect(s.bodyText.length).toBeGreaterThan(0);
    }
  });

  it('chapterNum is "1" for every fixture section', () => {
    for (const s of sections) {
      expect(s.chapterNum).toBe('1');
    }
  });

  it('every sectionNum matches SC pattern', () => {
    for (const s of sections) {
      expect(isValidScSectionNum(s.sectionNum)).toBe(true);
    }
  });

  it('bodyText does not contain raw HTML tags', () => {
    for (const s of sections) {
      expect(s.bodyText).not.toMatch(/<[a-z]+/i);
    }
  });

  it('bodyText does not contain unresolved HTML entities', () => {
    for (const s of sections) {
      expect(s.bodyText).not.toContain('&lt;');
      expect(s.bodyText).not.toContain('&gt;');
      expect(s.bodyText).not.toContain('&amp;');
      expect(s.bodyText).not.toContain('&nbsp;');
    }
  });

  it('bodyText does not contain HISTORY: trailer', () => {
    for (const s of sections) {
      expect(s.bodyText).not.toContain('HISTORY:');
    }
  });

  it('source URL for each section is HTTPS scstatehouse.gov URL', () => {
    for (const s of sections) {
      const url = buildScSourceUrl(s.sectionNum);
      expect(url).toMatch(/^https:\/\/www\.scstatehouse\.gov\//);
      expect(url).toContain(s.sectionNum);
    }
  });
});

// ---------------------------------------------------------------------------
// parseScChapters — multi-chapter aggregation
// ---------------------------------------------------------------------------

describe('parseScChapters', () => {
  it('aggregates sections across multiple chapter docs', () => {
    const docs = [
      { chapterNum: '1', html: FIXTURE_HTML },
      { chapterNum: '1', html: FIXTURE_HTML }, // duplicate input — exercises the loop
    ];
    const sections = parseScChapters(docs);
    expect(sections.length).toBeGreaterThan(0);
    // Same fixture twice → 2× the per-chapter count
    const single = parseScChapter(FIXTURE_HTML, '1');
    expect(sections.length).toBe(single.length * 2);
  });

  it('returns empty array for empty input', () => {
    expect(parseScChapters([])).toEqual([]);
  });

  it('skips chapters that yield zero sections without erroring', () => {
    const docs = [
      { chapterNum: '99', html: '<html><body>nothing here</body></html>' },
      { chapterNum: '1', html: FIXTURE_HTML },
    ];
    const sections = parseScChapters(docs);
    const single = parseScChapter(FIXTURE_HTML, '1');
    expect(sections.length).toBe(single.length);
  });
});
