// test-isolation-na: no Supabase writes — unit tests against real fixture HTML
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  decodeEntities,
  stripHtml,
  padChapter,
  padSectionPart,
  buildChapterUrl,
  buildSectionUrl,
  buildHiSourceUrl,
  discoverSections,
  parseSection,
  HI_CHAPTER_VOLUMES,
} from '../lib/hi-html.mjs';

import {
  buildChapterConfig,
  parseCliFlags,
  HI_COHORT_DEFAULT,
  HI_CHAPTER_DESCRIPTIONS,
  HI_MIN_FLOOR_ROWS,
} from '../seed-statutes-hi-title37.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = (name) => path.join(__dirname, 'fixtures', 'hi', name);

const TOC_701   = readFileSync(FIX('toc-ch701.html'), 'utf8');
const TOC_134   = readFileSync(FIX('toc-ch134.html'), 'utf8');
const TOC_712A  = readFileSync(FIX('toc-ch712A.html'), 'utf8');
const SEC_707_701 = readFileSync(FIX('section-707-701.html'), 'utf8');
const SEC_134_1   = readFileSync(FIX('section-134-1.html'), 'utf8');
const SEC_134_2_5 = readFileSync(FIX('section-134-2_5.html'), 'utf8');
const SEC_712A_1  = readFileSync(FIX('section-712A-1.html'), 'utf8');

// padChapter

describe('padChapter', () => {
  it('pads 134 to 0134', () => {
    expect(padChapter('134')).toBe('0134');
  });

  it('pads 707 to 0707', () => {
    expect(padChapter('707')).toBe('0707');
  });

  it('pads 712A to 0712A (alpha suffix retained)', () => {
    expect(padChapter('712A')).toBe('0712A');
  });

  it('pads 708A to 0708A', () => {
    expect(padChapter('708A')).toBe('0708A');
  });

  it('throws on non-numeric chapter', () => {
    expect(() => padChapter('abc')).toThrow(/invalid HI chapter/);
  });
});

// padSectionPart

describe('padSectionPart', () => {
  it('pads 1 to 0001', () => {
    expect(padSectionPart('1')).toBe('0001');
  });

  it('pads 316 to 0316', () => {
    expect(padSectionPart('316')).toBe('0316');
  });

  it('pads 9 to 0009', () => {
    expect(padSectionPart('9')).toBe('0009');
  });

  it('throws on non-numeric part', () => {
    expect(() => padSectionPart('5A')).toThrow(/section part not numeric/);
  });
});

// URL builders

describe('buildChapterUrl', () => {
  it('builds the 707 chapter ToC URL under Vol14', () => {
    expect(buildChapterUrl('707')).toBe(
      'https://www.capitol.hawaii.gov/hrscurrent/Vol14_Ch0701-0853/HRS0707/HRS_0707-.htm'
    );
  });

  it('builds the 134 chapter ToC URL under Vol03', () => {
    expect(buildChapterUrl('134')).toBe(
      'https://www.capitol.hawaii.gov/hrscurrent/Vol03_Ch0121-0200D/HRS0134/HRS_0134-.htm'
    );
  });

  it('builds the 712A chapter ToC URL with alpha-suffix dir', () => {
    expect(buildChapterUrl('712A')).toBe(
      'https://www.capitol.hawaii.gov/hrscurrent/Vol14_Ch0701-0853/HRS0712A/HRS_0712A-.htm'
    );
  });

  it('throws when chapter not in volume map', () => {
    expect(() => buildChapterUrl('999')).toThrow(/HI_CHAPTER_VOLUMES map/);
  });
});

describe('buildSectionUrl', () => {
  it('builds an integer section URL: 707-701', () => {
    expect(buildSectionUrl('707-701')).toBe(
      'https://www.capitol.hawaii.gov/hrscurrent/Vol14_Ch0701-0853/HRS0707/HRS_0707-0701.htm'
    );
  });

  it('builds an integer section URL with leading zero pad: 134-1', () => {
    expect(buildSectionUrl('134-1')).toBe(
      'https://www.capitol.hawaii.gov/hrscurrent/Vol03_Ch0121-0200D/HRS0134/HRS_0134-0001.htm'
    );
  });

  it('builds a decimal section URL: 134-2.5 -> 0134-0002_0005.htm', () => {
    expect(buildSectionUrl('134-2.5')).toBe(
      'https://www.capitol.hawaii.gov/hrscurrent/Vol03_Ch0121-0200D/HRS0134/HRS_0134-0002_0005.htm'
    );
  });

  it('builds an alpha-chapter section URL: 712A-1', () => {
    expect(buildSectionUrl('712A-1')).toBe(
      'https://www.capitol.hawaii.gov/hrscurrent/Vol14_Ch0701-0853/HRS0712A/HRS_0712A-0001.htm'
    );
  });

  it('builds an alpha-chapter decimal section URL: 712A-5.5', () => {
    expect(buildSectionUrl('712A-5.5')).toBe(
      'https://www.capitol.hawaii.gov/hrscurrent/Vol14_Ch0701-0853/HRS0712A/HRS_0712A-0005_0005.htm'
    );
  });

  it('throws on malformed section number', () => {
    expect(() => buildSectionUrl('xyz')).toThrow(/invalid HI section number/);
  });

  it('throws when chapter portion not in volume map', () => {
    expect(() => buildSectionUrl('999-1')).toThrow(/HI_CHAPTER_VOLUMES map/);
  });

  it('always returns HTTPS', () => {
    expect(buildSectionUrl('707-701')).toMatch(/^https:\/\//);
  });

  it('buildHiSourceUrl returns same as buildSectionUrl', () => {
    expect(buildHiSourceUrl('707-701')).toBe(buildSectionUrl('707-701'));
  });
});

// HI_CHAPTER_VOLUMES coverage

describe('HI_CHAPTER_VOLUMES map', () => {
  it('contains all 15 cohort chapters', () => {
    const expected = [
      '134',
      '701', '702', '703', '704', '705', '706',
      '707', '708', '708A',
      '709', '710', '711',
      '712', '712A',
    ];
    for (const ch of expected) {
      expect(HI_CHAPTER_VOLUMES[ch]).toBeTruthy();
    }
  });

  it('routes 134 to Vol03', () => {
    expect(HI_CHAPTER_VOLUMES['134']).toBe('Vol03_Ch0121-0200D');
  });

  it('routes Title 37 chapters to Vol14', () => {
    for (const ch of ['701', '702', '707', '708A', '712A']) {
      expect(HI_CHAPTER_VOLUMES[ch]).toBe('Vol14_Ch0701-0853');
    }
  });
});

// stripHtml + decodeEntities

describe('decodeEntities', () => {
  it('decodes &nbsp; to space', () => {
    expect(decodeEntities('A&nbsp;B')).toBe('A B');
  });

  it('decodes &amp; to ampersand', () => {
    expect(decodeEntities('A &amp; B')).toBe('A & B');
  });

  it('decodes &sect; to section sign', () => {
    expect(decodeEntities('Foo &sect;707-701')).toContain('§');
  });

  it('decodes &#167; (numeric) to section sign', () => {
    expect(decodeEntities('Foo &#167;707-701')).toContain('§');
  });

  it('decodes hex numeric &#x27; to apostrophe', () => {
    expect(decodeEntities('it&#x27;s')).toBe("it's");
  });

  it('drops control character codepoints from numeric refs', () => {
    expect(decodeEntities('foo&#1;bar')).toBe('foobar');
  });
});

describe('stripHtml', () => {
  it('strips a simple <p> tag', () => {
    expect(stripHtml('<p>hello</p>')).toBe('hello');
  });

  it('strips a <b> tag', () => {
    expect(stripHtml('<b>bold</b> rest')).toBe('bold rest');
  });

  it('strips <script> blocks fully', () => {
    expect(stripHtml('a<script>alert(1)</script>b')).toBe('a b');
  });

  it('strips <style> blocks fully', () => {
    expect(stripHtml('a<style>.x{color:red}</style>b')).toBe('a b');
  });

  it('strips HTML comments', () => {
    expect(stripHtml('a<!-- note -->b')).toBe('a b');
  });

  it('collapses whitespace runs', () => {
    expect(stripHtml('<p>a    b</p>')).toBe('a b');
  });
});

// discoverSections — TOC parsing

describe('discoverSections (TOC ch701)', () => {
  it('emits all 20 listed sections (701-100 through 701-118 plus 701-119 Repealed)', () => {
    const out = discoverSections(TOC_701, '701');
    // ToC lists 701-100, 701-101, 701-102, 701-103, 701-104, 701-105, 701-106,
    // 701-107, 701-108, 701-109, 701-110, 701-111, 701-112, 701-113, 701-114,
    // 701-115, 701-116, 701-117, 701-118, 701-119 — 20 entries (incl. Repealed).
    expect(out.length).toBeGreaterThanOrEqual(19);
    const nums = out.map(d => d.sectionNum);
    expect(nums).toContain('701-100');
    expect(nums).toContain('701-118');
    expect(nums).toContain('701-119');
  });

  it('discovered sections all carry HTTPS URLs to capitol.hawaii.gov', () => {
    const out = discoverSections(TOC_701, '701');
    for (const d of out) {
      expect(d.sectionUrl).toMatch(/^https:\/\/www\.capitol\.hawaii\.gov\/hrscurrent\//);
    }
  });

  it('descriptors carry the chapterNum field', () => {
    const out = discoverSections(TOC_701, '701');
    expect(out[0].chapterNum).toBe('701');
  });

  it('does not duplicate section IDs', () => {
    const out = discoverSections(TOC_701, '701');
    const set = new Set(out.map(d => d.sectionNum));
    expect(set.size).toBe(out.length);
  });
});

describe('discoverSections (TOC ch134, decimal sections)', () => {
  let out;
  beforeAllHi();
  function beforeAllHi() {
    out = discoverSections(TOC_134, '134');
  }

  it('emits at least 25 sections (chapter 134 has roughly 30 active sections plus decimal subsections)', () => {
    expect(out.length).toBeGreaterThanOrEqual(25);
  });

  it('captures decimal sections like 134-2.5', () => {
    const nums = out.map(d => d.sectionNum);
    expect(nums).toContain('134-2.5');
  });

  it('captures decimal sections like 134-7.3 and 134-7.5', () => {
    const nums = out.map(d => d.sectionNum);
    expect(nums).toContain('134-7.3');
    expect(nums).toContain('134-7.5');
  });

  it('captures integer sections like 134-1', () => {
    const nums = out.map(d => d.sectionNum);
    expect(nums).toContain('134-1');
  });

  it('does not cross-pollute with 707- or other-chapter section numbers', () => {
    for (const d of out) {
      expect(d.sectionNum.startsWith('134-')).toBe(true);
    }
  });
});

describe('discoverSections (TOC ch712A, alpha-suffix chapter)', () => {
  it('emits at least 14 sections (712A has approximately 14-16 sections)', () => {
    const out = discoverSections(TOC_712A, '712A');
    expect(out.length).toBeGreaterThanOrEqual(14);
  });

  it('captures decimal sections like 712A-5.5', () => {
    const out = discoverSections(TOC_712A, '712A');
    const nums = out.map(d => d.sectionNum);
    expect(nums).toContain('712A-5.5');
  });

  it('every descriptor has chapter prefix 712A-', () => {
    const out = discoverSections(TOC_712A, '712A');
    for (const d of out) {
      expect(d.sectionNum.startsWith('712A-')).toBe(true);
    }
  });

  it('emits no false positives like 712-A or 712-5', () => {
    // The chapter-anchored regex requires literal "712A-".
    const out = discoverSections(TOC_712A, '712A');
    const nums = out.map(d => d.sectionNum);
    expect(nums.some(n => n.startsWith('712-'))).toBe(false);
  });

  it('returns empty when chapter is missing from input', () => {
    expect(discoverSections('', '712A')).toEqual([]);
  });

  it('throws when chapter argument is missing', () => {
    expect(() => discoverSections(TOC_712A, '')).toThrow(/chapter is required/);
  });
});

// parseSection — integer section

describe('parseSection (707-701 Murder in the first degree)', () => {
  let parsed;
  parsed = parseSection(SEC_707_701, '707-701');

  it('returns a non-null result', () => {
    expect(parsed).not.toBeNull();
  });

  it('extracts the title text "Murder in the first degree"', () => {
    expect(parsed.titleText).toContain('Murder in the first degree');
  });

  it('title text does not include the section sign', () => {
    expect(parsed.titleText).not.toContain('§');
  });

  it('title text does not include surrounding brackets', () => {
    expect(parsed.titleText).not.toContain('[');
    expect(parsed.titleText).not.toContain(']');
  });

  it('body text contains substantive statute language', () => {
    expect(parsed.bodyText.length).toBeGreaterThan(200);
    expect(parsed.bodyText.toLowerCase()).toContain('murder');
  });

  it('body text does NOT include XNotes editorial commentary', () => {
    // The COMMENTARY ON §707-701 block is editorial and must be stripped.
    expect(parsed.bodyText).not.toMatch(/COMMENTARY ON/i);
    expect(parsed.bodyText).not.toMatch(/Cross References/i);
  });

  it('body text includes the alphabetical sub-paragraphs (a) (b) (c) (d) (e)', () => {
    expect(parsed.bodyText).toContain('(a)');
    expect(parsed.bodyText).toContain('(b)');
    expect(parsed.bodyText).toContain('(c)');
    expect(parsed.bodyText).toContain('(d)');
    expect(parsed.bodyText).toContain('(e)');
  });
});

// parseSection — decimal section under bracketed title

describe('parseSection (134-2.5 bracketed-title decimal section)', () => {
  let parsed;
  parsed = parseSection(SEC_134_2_5, '134-2.5');

  it('returns a non-null result for bracketed [§134-2.5 ...] title format', () => {
    expect(parsed).not.toBeNull();
  });

  it('extracts the title without leading [ or trailing ]', () => {
    expect(parsed.titleText).not.toContain('[');
    expect(parsed.titleText).not.toContain(']');
    expect(parsed.titleText).toContain('Permits for motion picture');
  });

  it('body text contains lettered sub-paragraphs', () => {
    expect(parsed.bodyText).toContain('(a)');
    expect(parsed.bodyText).toContain('(b)');
  });

  it('body text contains the fee mention from sub-paragraph (d)', () => {
    expect(parsed.bodyText).toMatch(/\$50/);
  });
});

// parseSection — integer section in chapter 134

describe('parseSection (134-1 Definitions)', () => {
  let parsed;
  parsed = parseSection(SEC_134_1, '134-1');

  it('returns a non-null result', () => {
    expect(parsed).not.toBeNull();
  });

  it('extracts a Definitions title', () => {
    expect(parsed.titleText).toMatch(/definitions/i);
  });

  it('body text is substantial (definitions section runs long)', () => {
    expect(parsed.bodyText.length).toBeGreaterThan(500);
  });
});

// parseSection — alpha-chapter section

describe('parseSection (712A-1 Definitions, alpha chapter)', () => {
  let parsed;
  parsed = parseSection(SEC_712A_1, '712A-1');

  it('returns a non-null result for alpha-chapter section', () => {
    expect(parsed).not.toBeNull();
  });

  it('extracts a Definitions title', () => {
    expect(parsed.titleText).toMatch(/definitions/i);
  });

  it('body text is substantial', () => {
    expect(parsed.bodyText.length).toBeGreaterThan(200);
  });
});

// parseSection — null cases

describe('parseSection null cases', () => {
  it('returns null for empty input', () => {
    expect(parseSection('', '707-701')).toBeNull();
    expect(parseSection(null, '707-701')).toBeNull();
  });

  it('returns null when sectionNum is missing', () => {
    expect(parseSection(SEC_707_701, '')).toBeNull();
  });

  it('returns null when section number does not match the page', () => {
    // SEC_707_701 has the title for §707-701, not §707-999
    expect(parseSection(SEC_707_701, '707-999')).toBeNull();
  });

  it('returns null on a "Repealed" stub HTML', () => {
    const html = `
      <div class="WordSection1">
        <p class="RegularParagraphs"><b>§701-119  Repealed.</b></p>
      </div>
      <div id="pageLinks"></div>`;
    expect(parseSection(html, '701-119')).toBeNull();
  });

  it('returns null when body too short', () => {
    const html = `
      <div class="WordSection1">
        <p class="RegularParagraphs"><b>§707-999  Test title.</b> x</p>
      </div>
      <div id="pageLinks"></div>`;
    expect(parseSection(html, '707-999')).toBeNull();
  });
});

// CLI

describe('parseCliFlags', () => {
  it('defaults to live, no limit, no chapter filter', () => {
    expect(parseCliFlags([])).toEqual({ dryRun: false, verbose: false, limit: null, chapters: null });
  });

  it('parses --dry-run', () => {
    expect(parseCliFlags(['--dry-run']).dryRun).toBe(true);
  });

  it('parses --verbose', () => {
    expect(parseCliFlags(['--verbose']).verbose).toBe(true);
  });

  it('parses --limit=N', () => {
    expect(parseCliFlags(['--limit=5']).limit).toBe(5);
  });

  it('rejects --limit=0 (not positive)', () => {
    expect(parseCliFlags(['--limit=0']).limit).toBeNull();
  });

  it('parses --chapters=707,708A and validates against HI_CHAPTER_VOLUMES', () => {
    expect(parseCliFlags(['--chapters=707,708A']).chapters).toEqual(['707', '708A']);
  });

  it('rejects unknown chapters', () => {
    expect(parseCliFlags(['--chapters=999,xxx']).chapters).toBeNull();
  });
});

// Config builder

describe('buildChapterConfig', () => {
  it('builds a config for chapter 707', () => {
    const cfg = buildChapterConfig('707');
    expect(cfg.stateCode).toBe('HI');
    expect(cfg.stateName).toBe('Hawaii');
    expect(cfg.titleNum).toBe('707');
    expect(cfg.chapterListUrl).toBe(buildChapterUrl('707'));
    expect(cfg.crawlDelayMs).toBeGreaterThanOrEqual(1500);
  });

  it('config includes Chrome User-Agent for Cloudflare pass-through', () => {
    const cfg = buildChapterConfig('707');
    expect(cfg.userAgent).toMatch(/Chrome\//);
    expect(cfg.userAgent).toMatch(/Mozilla\/5\.0/);
  });

  it('config restricts allowedHosts to capitol.hawaii.gov', () => {
    const cfg = buildChapterConfig('707');
    expect(cfg.allowedHosts.has('www.capitol.hawaii.gov')).toBe(true);
    expect(cfg.allowedHosts.has('capitol.hawaii.gov')).toBe(true);
  });

  it('throws on chapter not in volume map', () => {
    expect(() => buildChapterConfig('999')).toThrow(/HI_CHAPTER_VOLUMES map/);
  });
});

// Cohort + floor constants

describe('HI_COHORT_DEFAULT', () => {
  it('contains exactly 15 chapters', () => {
    expect(HI_COHORT_DEFAULT.length).toBe(15);
  });

  it('starts with 134', () => {
    expect(HI_COHORT_DEFAULT[0]).toBe('134');
  });

  it('contains all Title 37 chapters', () => {
    for (const ch of ['701', '702', '703', '704', '705', '706',
                       '707', '708', '708A', '709', '710', '711',
                       '712', '712A']) {
      expect(HI_COHORT_DEFAULT).toContain(ch);
    }
  });

  it('every cohort chapter has a description', () => {
    for (const ch of HI_COHORT_DEFAULT) {
      expect(HI_CHAPTER_DESCRIPTIONS[ch]).toBeTruthy();
    }
  });
});

describe('HI_MIN_FLOOR_ROWS', () => {
  it('is set to a conservative floor (>= 200)', () => {
    expect(HI_MIN_FLOOR_ROWS).toBeGreaterThanOrEqual(200);
  });
});
