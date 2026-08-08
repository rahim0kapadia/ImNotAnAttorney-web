// test-isolation-na: no Supabase writes — unit tests against fixture HTML
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseCtChapter,
  discoverCtChapters,
  buildCtSourceUrl,
  buildCtChapterUrl,
  buildCtTitleUrl,
  isValidCtSectionNum,
  stripHtml,
  CT_TITLE_53A_CHAPTERS,
  CT_CHAPTER_DESCRIPTIONS,
} from '../lib/ct-html.mjs';
import {
  parseCliFlags,
  CT_CONFIG,
} from '../seed-statutes-ct-title53a.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX_DIR = path.join(__dirname, 'fixtures', 'ct');
const FIX_TOC = readFileSync(path.join(FIX_DIR, 'title_53a-toc-sample.html'), 'utf8');
const FIX_950 = readFileSync(path.join(FIX_DIR, 'chap_950-short.html'), 'utf8');
const FIX_952_SUBS = readFileSync(path.join(FIX_DIR, 'chap_952-subsections.html'), 'utf8');
const FIX_952_REP = readFileSync(path.join(FIX_DIR, 'chap_952-repealed.html'), 'utf8');

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

describe('buildCtSourceUrl', () => {
  it('builds canonical chapter#anchor URL with lowercase fragment', () => {
    expect(buildCtSourceUrl('53a-1', '950')).toBe(
      'https://www.cga.ct.gov/current/pub/chap_950.htm#sec_53a-1'
    );
  });
  it('returns HTTPS', () => {
    expect(buildCtSourceUrl('53a-54a', '952')).toMatch(/^https:\/\//);
  });
  it('uses cga.ct.gov host', () => {
    expect(buildCtSourceUrl('53a-100', '952')).toContain('www.cga.ct.gov');
  });
  it('uses lowercase #sec_ fragment (mirrors live cga.ct.gov)', () => {
    expect(buildCtSourceUrl('53a-24', '952')).toMatch(/#sec_53a-24$/);
  });
  it('throws when chapterNum is missing', () => {
    expect(() => buildCtSourceUrl('53a-1')).toThrow(/chapterNum/);
  });
});

describe('buildCtChapterUrl', () => {
  it('builds chapter URL for 950', () => {
    expect(buildCtChapterUrl('950')).toBe('https://www.cga.ct.gov/current/pub/chap_950.htm');
  });
  it('handles trailing-letter chapters', () => {
    // The cohort is 950/951/952 today, but the parser/url builder must remain
    // tolerant of any future trailing-letter chapter the live TOC may add.
    expect(buildCtChapterUrl('952c')).toBe('https://www.cga.ct.gov/current/pub/chap_952c.htm');
  });
});

describe('buildCtTitleUrl', () => {
  it('returns the Title 53a TOC URL', () => {
    expect(buildCtTitleUrl()).toBe('https://www.cga.ct.gov/current/pub/title_53a.htm');
  });
});

// ---------------------------------------------------------------------------
// Section number validation
// ---------------------------------------------------------------------------

describe('isValidCtSectionNum', () => {
  it('accepts standard section numbers', () => {
    expect(isValidCtSectionNum('53a-1')).toBe(true);
    expect(isValidCtSectionNum('53a-54')).toBe(true);
    expect(isValidCtSectionNum('53a-100')).toBe(true);
    expect(isValidCtSectionNum('53a-323')).toBe(true);
  });
  it('accepts trailing alpha suffix (amendments)', () => {
    expect(isValidCtSectionNum('53a-46a')).toBe(true);
    expect(isValidCtSectionNum('53a-103a')).toBe(true);
    expect(isValidCtSectionNum('53a-54a')).toBe(true);
  });
  it('rejects invalid shapes', () => {
    expect(isValidCtSectionNum('')).toBe(false);
    expect(isValidCtSectionNum(null)).toBe(false);
    expect(isValidCtSectionNum('53b-1')).toBe(false);
    expect(isValidCtSectionNum('53a-')).toBe(false);
    expect(isValidCtSectionNum('1-53a')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------

describe('stripHtml', () => {
  it('strips tags and decodes entities', () => {
    expect(stripHtml('<p>hello &amp; goodbye</p>')).toBe('hello & goodbye');
  });
  it('decodes nbsp and section-sign entities', () => {
    expect(stripHtml('foo&nbsp;bar &sect; 1')).toBe('foo bar § 1');
  });
  it('removes script blocks', () => {
    expect(stripHtml('a<script>evil()</script>b')).toBe('a b');
  });
  it('collapses whitespace', () => {
    expect(stripHtml('<p>  hello\n\n  world  </p>')).toBe('hello world');
  });
});

// ---------------------------------------------------------------------------
// discoverCtChapters
// ---------------------------------------------------------------------------

describe('discoverCtChapters', () => {
  it('extracts EXACTLY the 3 Title 53a chapters from the TOC', () => {
    const chapters = discoverCtChapters(FIX_TOC);
    const nums = chapters.map((c) => c.chapterNum);
    expect(nums).toEqual(['950', '951', '952']);
  });
  it('preserves chapter URL host', () => {
    const chapters = discoverCtChapters(FIX_TOC);
    for (const c of chapters) {
      expect(c.chapterUrl).toContain('www.cga.ct.gov');
      expect(c.chapterUrl).toMatch(/chap_\d{3}[a-z]?\.htm$/);
    }
  });
  it('dedupes when the TOC repeats links', () => {
    const dup = FIX_TOC + FIX_TOC;
    const chapters = discoverCtChapters(dup);
    const nums = chapters.map((c) => c.chapterNum);
    const unique = new Set(nums);
    expect(nums.length).toBe(unique.size);
  });
});

// ---------------------------------------------------------------------------
// parseCtChapter — fixture-driven
// ---------------------------------------------------------------------------

describe('parseCtChapter (chap 950 short)', () => {
  it('emits 2 sections (TOC links ignored, only catchln-span bodies counted)', () => {
    const sections = parseCtChapter(FIX_950, '950');
    expect(sections.length).toBe(2);
  });
  it('parses Sec. 53a-1 catchline + body', () => {
    const sections = parseCtChapter(FIX_950, '950');
    const s = sections.find((x) => x.sectionNum === '53a-1');
    expect(s).toBeTruthy();
    expect(s.titleText).toMatch(/Short title/i);
    expect(s.bodyText).toMatch(/Penal Code/);
    expect(s.chapterNum).toBe('950');
  });
  it('parses Sec. 53a-2 catchline + body', () => {
    const sections = parseCtChapter(FIX_950, '950');
    const s = sections.find((x) => x.sectionNum === '53a-2');
    expect(s).toBeTruthy();
    expect(s.titleText).toMatch(/Applicability/i);
    expect(s.bodyText).toMatch(/October 1, 1971/);
  });
  it('does NOT count the toc_catchln links as section bodies', () => {
    const sections = parseCtChapter(FIX_950, '950');
    // Even though `<a href="#sec_53a-3">Sec. 53a-3. Definitions.</a>` appears
    // in the TOC, no body anchor exists for it in the fixture — must NOT emit.
    expect(sections.find((x) => x.sectionNum === '53a-3')).toBeUndefined();
  });
});

describe('parseCtChapter (chap 952 multi-paragraph subsections)', () => {
  it('emits sections with multi-paragraph bodies preserved', () => {
    const sections = parseCtChapter(FIX_952_SUBS, '952');
    expect(sections.length).toBe(2);
    const murder = sections.find((x) => x.sectionNum === '53a-54a');
    expect(murder).toBeTruthy();
    expect(murder.titleText).toBe('Murder');
    expect(murder.bodyText).toMatch(/\(a\) A person is guilty of murder/);
    expect(murder.bodyText).toMatch(/\(b\) Evidence/);
    expect(murder.bodyText).toMatch(/\(c\) Murder is punishable/);
  });
  it('handles section numbers with alpha suffix (53a-54a)', () => {
    const sections = parseCtChapter(FIX_952_SUBS, '952');
    expect(sections.find((x) => x.sectionNum === '53a-54a')).toBeTruthy();
  });
  it('cross-reference href targets are not emitted as separate sections', () => {
    // Section 53a-54a body contains a cross-ref `<a href="...#sec_53a-35a">`.
    // The parser must NOT treat it as a body anchor.
    const sections = parseCtChapter(FIX_952_SUBS, '952');
    expect(sections.find((x) => x.sectionNum === '53a-35a')).toBeUndefined();
  });
});

describe('parseCtChapter (chap 952 with repealed section)', () => {
  it('still emits the repealed section row (signal preserved)', () => {
    const sections = parseCtChapter(FIX_952_REP, '952');
    const repealed = sections.find((x) => x.sectionNum === '53a-103a');
    expect(repealed).toBeTruthy();
    expect(repealed.titleText).toMatch(/Repealed/i);
    expect(repealed.bodyText).toMatch(/repealed/i);
  });
  it('emits the active sections alongside the repealed one', () => {
    const sections = parseCtChapter(FIX_952_REP, '952');
    const nums = sections.map((s) => s.sectionNum);
    expect(nums).toContain('53a-100');
    expect(nums).toContain('53a-101');
    expect(nums).toContain('53a-103a');
  });
});

// ---------------------------------------------------------------------------
// CT_TITLE_53A_CHAPTERS / descriptions
// ---------------------------------------------------------------------------

describe('CT_TITLE_53A_CHAPTERS', () => {
  it('contains EXACTLY the 3 Title 53a chapters', () => {
    expect(CT_TITLE_53A_CHAPTERS).toEqual(['950', '951', '952']);
  });
  it('every chapter has a description', () => {
    for (const ch of CT_TITLE_53A_CHAPTERS) {
      expect(CT_CHAPTER_DESCRIPTIONS[ch]).toBeTruthy();
      expect(typeof CT_CHAPTER_DESCRIPTIONS[ch]).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

describe('parseCliFlags', () => {
  it('defaults to live, non-verbose, no-limit', () => {
    expect(parseCliFlags([])).toEqual({
      dryRun: false,
      verbose: false,
      limit: null,
      skipDiscovery: false,
    });
  });
  it('parses --dry-run', () => {
    expect(parseCliFlags(['--dry-run']).dryRun).toBe(true);
  });
  it('parses --verbose', () => {
    expect(parseCliFlags(['--verbose']).verbose).toBe(true);
  });
  it('parses --limit=N', () => {
    expect(parseCliFlags(['--limit=3']).limit).toBe(3);
  });
  it('parses --skip-discovery', () => {
    expect(parseCliFlags(['--skip-discovery']).skipDiscovery).toBe(true);
  });
  it('combines flags', () => {
    const f = parseCliFlags(['--dry-run', '--limit=5', '--verbose']);
    expect(f).toEqual({ dryRun: true, verbose: true, limit: 5, skipDiscovery: false });
  });
});

// ---------------------------------------------------------------------------
// CT_CONFIG sanity
// ---------------------------------------------------------------------------

describe('CT_CONFIG', () => {
  it('uses 2-letter stateCode', () => {
    expect(CT_CONFIG.stateCode).toBe('CT');
  });
  it('targets Title 53a', () => {
    expect(CT_CONFIG.titleNum).toBe('53a');
  });
  it('only allows cga.ct.gov hosts', () => {
    expect(CT_CONFIG.allowedHosts.has('www.cga.ct.gov')).toBe(true);
    expect(CT_CONFIG.allowedHosts.has('cga.ct.gov')).toBe(true);
    expect(CT_CONFIG.allowedHosts.has('justia.com')).toBe(false);
  });
  it('has a defensive crawl delay (>=1s)', () => {
    expect(CT_CONFIG.crawlDelayMs).toBeGreaterThanOrEqual(1000);
  });
});
