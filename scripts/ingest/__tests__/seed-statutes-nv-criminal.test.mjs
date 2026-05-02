// test-isolation-na: no Supabase writes — unit tests against real fixture HTML
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseNVChapter,
  parseNVChapters,
  buildNVSourceUrl,
  buildNVChapterUrl,
  isValidNvSectionNum,
  stripHtml,
  NV_CHAPTERS,
} from '../lib/nv-html.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'nv', 'NRS-200-sample.html');
const FIXTURE_HTML = readFileSync(FIXTURE_PATH, 'utf8');

// ---------------------------------------------------------------------------
// buildNVSourceUrl
// ---------------------------------------------------------------------------

describe('buildNVSourceUrl', () => {
  it('builds canonical URL for ch200 section', () => {
    expect(buildNVSourceUrl('200.010')).toBe(
      'https://www.leg.state.nv.us/NRS/NRS-200.html#NRS200Sec010'
    );
  });

  it('builds canonical URL for ch484C (numeric+letter chapter)', () => {
    expect(buildNVSourceUrl('484C.030')).toBe(
      'https://www.leg.state.nv.us/NRS/NRS-484C.html#NRS484CSec030'
    );
  });

  it('builds canonical URL for 4-digit section number', () => {
    expect(buildNVSourceUrl('200.5099')).toBe(
      'https://www.leg.state.nv.us/NRS/NRS-200.html#NRS200Sec5099'
    );
  });

  it('returns an HTTPS URL', () => {
    expect(buildNVSourceUrl('200.010')).toMatch(/^https:\/\//);
  });

  it('contains the section anchor in the URL fragment', () => {
    expect(buildNVSourceUrl('205.060')).toContain('#NRS205Sec060');
  });

  it('uses leg.state.nv.us host', () => {
    expect(buildNVSourceUrl('200.010')).toContain('www.leg.state.nv.us');
  });

  it('falls back to index.html for malformed sectionNum without dot', () => {
    expect(buildNVSourceUrl('badformat')).toContain('index.html');
  });
});

// ---------------------------------------------------------------------------
// buildNVChapterUrl
// ---------------------------------------------------------------------------

describe('buildNVChapterUrl', () => {
  it('builds URL for numeric chapter', () => {
    expect(buildNVChapterUrl('200')).toBe('https://www.leg.state.nv.us/NRS/NRS-200.html');
  });

  it('builds URL for numeric+letter chapter', () => {
    expect(buildNVChapterUrl('484C')).toBe('https://www.leg.state.nv.us/NRS/NRS-484C.html');
  });

  it('accepts numeric chapter argument', () => {
    expect(buildNVChapterUrl(207)).toBe('https://www.leg.state.nv.us/NRS/NRS-207.html');
  });
});

// ---------------------------------------------------------------------------
// NV_CHAPTERS
// ---------------------------------------------------------------------------

describe('NV_CHAPTERS', () => {
  it('contains exactly 9 chapters', () => {
    expect(NV_CHAPTERS).toHaveLength(9);
  });

  it('starts with chapter 200', () => {
    expect(NV_CHAPTERS[0]).toBe('200');
  });

  it('contains expected criminal-code chapters', () => {
    // 200 (homicide/assault), 205 (property), 207 (misc), 453 (drugs), 484C (DUI)
    for (const ch of ['200', '205', '207', '453', '484C']) {
      expect(NV_CHAPTERS).toContain(ch);
    }
  });

  it('includes the 484A-E DUI/traffic cohort', () => {
    expect(NV_CHAPTERS).toContain('484A');
    expect(NV_CHAPTERS).toContain('484B');
    expect(NV_CHAPTERS).toContain('484C');
    expect(NV_CHAPTERS).toContain('484D');
    expect(NV_CHAPTERS).toContain('484E');
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

  it('decodes &#8194; en-space (NV MS-Word artifact) to whitespace', () => {
    const result = stripHtml('NRS&#8194;200.010');
    expect(result).not.toContain('&#8194;');
    expect(result).toContain('NRS');
    expect(result).toContain('200.010');
  });

  it('decodes &#8212; em-dash to ASCII dash', () => {
    expect(stripHtml('text&#8212;more')).toContain('-');
  });

  it('decodes § entity', () => {
    expect(stripHtml('See &#167; 200.010')).toContain('§');
  });

  it('drops unicode replacement chars from charset mismatch', () => {
    expect(stripHtml('Murder�defined')).not.toContain('�');
  });

  it('collapses whitespace', () => {
    expect(stripHtml('  foo   bar  ')).toBe('foo bar');
  });
});

// ---------------------------------------------------------------------------
// isValidNvSectionNum
// ---------------------------------------------------------------------------

describe('isValidNvSectionNum', () => {
  it('accepts canonical chapter.section format', () => {
    expect(isValidNvSectionNum('200.010')).toBe(true);
    expect(isValidNvSectionNum('200.5099')).toBe(true);
  });

  it('accepts numeric+letter chapter (484A.005)', () => {
    expect(isValidNvSectionNum('484A.005')).toBe(true);
    expect(isValidNvSectionNum('484C.030')).toBe(true);
  });

  it('accepts trailing alpha on section digits', () => {
    expect(isValidNvSectionNum('200.030a')).toBe(true);
  });

  it('rejects malformed inputs', () => {
    expect(isValidNvSectionNum('')).toBe(false);
    expect(isValidNvSectionNum(null)).toBe(false);
    expect(isValidNvSectionNum('bad')).toBe(false);
    expect(isValidNvSectionNum('200')).toBe(false);
    expect(isValidNvSectionNum('200..010')).toBe(false);
    expect(isValidNvSectionNum('200.010.5')).toBe(false);
    expect(isValidNvSectionNum('abc.def')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseNVChapter — against real fixture HTML
// ---------------------------------------------------------------------------

describe('parseNVChapter (real fixture)', () => {
  let sections;

  beforeAll(() => {
    sections = parseNVChapter(FIXTURE_HTML, '200');
  });

  it('parses at least 5 sections from ch200 fixture', () => {
    expect(sections.length).toBeGreaterThanOrEqual(5);
  });

  it('section 200.010 is present', () => {
    const s = sections.find(x => x.sectionNum === '200.010');
    expect(s).toBeDefined();
  });

  it('section 200.010 titleText mentions Murder', () => {
    const s = sections.find(x => x.sectionNum === '200.010');
    expect(s.titleText).toMatch(/Murder/i);
  });

  it('section 200.010 body mentions unlawful killing', () => {
    const s = sections.find(x => x.sectionNum === '200.010');
    expect(s.bodyText.toLowerCase()).toContain('unlawful killing');
  });

  it('section 200.020 is present (Malice)', () => {
    const s = sections.find(x => x.sectionNum === '200.020');
    expect(s).toBeDefined();
    expect(s.titleText.toLowerCase()).toContain('malice');
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

  it('chapterNum is "200" for every fixture section', () => {
    for (const s of sections) {
      expect(s.chapterNum).toBe('200');
    }
  });

  it('every sectionNum matches NV pattern', () => {
    for (const s of sections) {
      expect(isValidNvSectionNum(s.sectionNum)).toBe(true);
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
      expect(s.bodyText).not.toContain('&#8194;');
    }
  });

  it('bodyText does not contain SourceNote/history bracket markers', () => {
    // Source notes start with `[1911 C&P` or similar bracketed legislative history.
    // Stripping is bracket-aware: we drop the entire <p class="SourceNote"> paragraph
    // before tag-stripping, so the bracket itself should never reach bodyText.
    for (const s of sections) {
      expect(s.bodyText).not.toMatch(/^\s*\[\d{4}/);
    }
  });

  it('source URL for each section is HTTPS leg.state.nv.us URL', () => {
    for (const s of sections) {
      const url = buildNVSourceUrl(s.sectionNum);
      expect(url).toMatch(/^https:\/\/www\.leg\.state\.nv\.us\//);
      expect(url).toContain(`NRS-${s.chapterNum}.html`);
    }
  });

  it('returns empty array for non-NV HTML', () => {
    expect(parseNVChapter('<html><body>not NV</body></html>', '200')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseNVChapters — multi-chapter aggregation
// ---------------------------------------------------------------------------

describe('parseNVChapters', () => {
  it('aggregates sections across multiple chapter docs', () => {
    const docs = [
      { chapterNum: '200', html: FIXTURE_HTML },
      { chapterNum: '200', html: FIXTURE_HTML }, // duplicate input — exercises the loop
    ];
    const sections = parseNVChapters(docs);
    expect(sections.length).toBeGreaterThan(0);
    const single = parseNVChapter(FIXTURE_HTML, '200');
    expect(sections.length).toBe(single.length * 2);
  });

  it('returns empty array for empty input', () => {
    expect(parseNVChapters([])).toEqual([]);
  });

  it('skips chapters that yield zero sections without erroring', () => {
    const docs = [
      { chapterNum: '999', html: '<html><body>nothing here</body></html>' },
      { chapterNum: '200', html: FIXTURE_HTML },
    ];
    const sections = parseNVChapters(docs);
    const single = parseNVChapter(FIXTURE_HTML, '200');
    expect(sections.length).toBe(single.length);
  });
});
