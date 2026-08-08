// test-isolation-na: no Supabase writes — unit tests against real fixture HTML
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSDTitle22, buildSDSourceUrl, stripHtml } from '../lib/sd-html.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'sd', 'title22-sample.html');

// Fixture is a slice of the real SD Title 22 dump (saved as UTF-8) covering:
//   doc[0]  — title-level TOC (TITLE 22 + chapter list) — must be skipped
//   doc[1]  — chapter 22-1 TOC — must be skipped
//   doc[2]  — section 22-1-1 (modern shape, short body)
//   doc[3]  — section 22-1-2 Definitions (modern shape, long body)
//   doc[4]  — section 22-1-3 (legacy Wp2Html shape, "Repealed by SL 2005…")
//   doc[5]  — section 22-1-4 (modern shape, "Felony and misdemeanor distinguished")
const FIXTURE_HTML = readFileSync(FIXTURE_PATH, 'utf8');

// ---------------------------------------------------------------------------
// buildSDSourceUrl
// ---------------------------------------------------------------------------

describe('buildSDSourceUrl', () => {
  it('builds correct URL for ch1 simple section', () => {
    expect(buildSDSourceUrl('22-1-1')).toBe(
      'https://sdlegislature.gov/Statutes/Codified_Laws/DisplayStatute.aspx?Type=Statute&Statute=22-1-1',
    );
  });

  it('builds correct URL for letter-suffixed chapter', () => {
    expect(buildSDSourceUrl('22-10A-3')).toBe(
      'https://sdlegislature.gov/Statutes/Codified_Laws/DisplayStatute.aspx?Type=Statute&Statute=22-10A-3',
    );
  });

  it('builds correct URL for decimal-section number', () => {
    expect(buildSDSourceUrl('22-24A-2.1')).toBe(
      'https://sdlegislature.gov/Statutes/Codified_Laws/DisplayStatute.aspx?Type=Statute&Statute=22-24A-2.1',
    );
  });

  it('returns an HTTPS URL', () => {
    expect(buildSDSourceUrl('22-1-1')).toMatch(/^https:\/\//);
  });

  it('contains the section number in the URL', () => {
    expect(buildSDSourceUrl('22-4-2')).toContain('22-4-2');
  });
});

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------

describe('stripHtml', () => {
  it('removes all tags', () => {
    expect(stripHtml('<b>Hello</b> <p>World</p>')).toContain('Hello');
    expect(stripHtml('<b>Hello</b> <p>World</p>')).toContain('World');
    expect(stripHtml('<b>Hello</b>')).not.toContain('<');
  });

  it('decodes &amp;', () => {
    expect(stripHtml('A &amp; B')).toBe('A & B');
  });

  it('decodes &lt; and &gt;', () => {
    expect(stripHtml('&lt;span&gt;text&lt;/span&gt;')).toContain('<span>text</span>');
  });

  it('decodes numeric entity for §', () => {
    expect(stripHtml('See &#167; 22-1-1')).toContain('§');
  });

  it('decodes named &sect; to §', () => {
    expect(stripHtml('See &sect; 22-1-1')).toContain('§');
  });

  it('decodes hex entity', () => {
    expect(stripHtml('&#xA7; 22-1-1')).toContain('§');
  });

  it('collapses internal whitespace', () => {
    expect(stripHtml('  foo   bar  ')).toBe('foo bar');
  });

  it('strips script and style blocks', () => {
    expect(stripHtml('<style>.x{}</style><p>keep</p>')).toBe('keep');
    expect(stripHtml('<script>evil()</script><p>keep</p>')).toBe('keep');
  });

  it('returns empty string for empty input', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null)).toBe('');
    expect(stripHtml(undefined)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// parseSDTitle22 — against real fixture HTML
// ---------------------------------------------------------------------------

describe('parseSDTitle22 (real fixture)', () => {
  let sections;

  beforeAll(() => {
    sections = parseSDTitle22(FIXTURE_HTML);
  });

  it('parses at least 1 section from the fixture', () => {
    expect(sections.length).toBeGreaterThanOrEqual(1);
  });

  it('skips the title-level TOC document', () => {
    // Title TOC has TITLE 22 / CRIMES headings — none of those should appear
    // as a section title.
    for (const s of sections) {
      expect(s.titleText).not.toBe('CRIMES');
      expect(s.titleText).not.toBe('TITLE');
    }
  });

  it('skips per-chapter TOC documents', () => {
    // Chapter TOCs use HG4 / HG4C class suffixes, not SENU + CL,
    // so they should not produce sections at all.
    for (const s of sections) {
      // Chapter TOC headings would be e.g. "DEFINITIONS AND GENERAL PROVISIONS"
      // — but a section heading "Definitions." is a legitimate § 22-1-2 title.
      // Defensive check: section number must match the expected SD pattern.
      expect(s.sectionNum).toMatch(/^22-\d+[A-Z]?-\d+(?:\.\d+)?[A-Z]?$/);
    }
  });

  it('section 22-1-1 is present', () => {
    const s = sections.find((x) => x.sectionNum === '22-1-1');
    expect(s).toBeDefined();
  });

  it('section 22-1-1 titleText matches the heading', () => {
    const s = sections.find((x) => x.sectionNum === '22-1-1');
    expect(s).toBeDefined();
    expect(s.titleText).toContain('Common-law rule');
  });

  it('section 22-1-1 bodyText mentions "penal statutes"', () => {
    const s = sections.find((x) => x.sectionNum === '22-1-1');
    expect(s).toBeDefined();
    expect(s.bodyText.toLowerCase()).toContain('penal statutes');
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

  it('chapterNum is a non-empty string with no leading zeros', () => {
    for (const s of sections) {
      expect(s.chapterNum.length).toBeGreaterThan(0);
      expect(s.chapterNum).toMatch(/^\d+[A-Z]?$/);
      if (/^\d{2,}$/.test(s.chapterNum)) {
        expect(s.chapterNum[0]).not.toBe('0');
      }
    }
  });

  it('sectionNum starts with the SD title prefix "22-"', () => {
    for (const s of sections) {
      expect(s.sectionNum.startsWith('22-')).toBe(true);
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
    }
  });

  it('source URL for each section is HTTPS sdlegislature.gov DisplayStatute', () => {
    for (const s of sections) {
      const url = buildSDSourceUrl(s.sectionNum);
      expect(url).toMatch(/^https:\/\/sdlegislature\.gov\//);
      expect(url).toContain(`Statute=${encodeURIComponent(s.sectionNum)}`);
    }
  });

  it('does not produce duplicate section numbers', () => {
    const seen = new Set();
    for (const s of sections) {
      expect(seen.has(s.sectionNum)).toBe(false);
      seen.add(s.sectionNum);
    }
  });

  it('chapterNum for 22-1-* sections is "1"', () => {
    const ch1 = sections.filter((s) => s.sectionNum.startsWith('22-1-'));
    if (ch1.length > 0) {
      for (const s of ch1) {
        expect(s.chapterNum).toBe('1');
      }
    }
  });

  it('titleText does not begin with the section number itself', () => {
    // Defensive: SENU span holds the number, CL span holds the heading.
    // If parser accidentally pulled SENU instead of CL, titleText would
    // look like "22-1-1" — fail loudly.
    for (const s of sections) {
      expect(s.titleText).not.toBe(s.sectionNum);
      expect(s.titleText.startsWith(s.sectionNum + '.')).toBe(false);
    }
  });

  it('captures legacy Wp2Html-shape sections (e.g. § 22-1-3 Repealed)', () => {
    // doc[4] in the fixture is the legacy Wp2Html shape — older repealed
    // section bodies that the SDLRC service still serves alongside the
    // modern PowerTools-for-OpenXML output.
    const s = sections.find((x) => x.sectionNum === '22-1-3');
    expect(s).toBeDefined();
    expect(s.bodyText.toLowerCase()).toContain('repealed');
  });

  it('parses a modern long section (§ 22-1-2 Definitions) without truncating below 200 chars', () => {
    const s = sections.find((x) => x.sectionNum === '22-1-2');
    expect(s).toBeDefined();
    // Definitions section has multiple sub-numbered paragraphs; bodyText
    // should comfortably exceed the short-section threshold.
    expect(s.bodyText.length).toBeGreaterThan(200);
  });

  it('produces both modern and legacy sections in the fixture (mixed shapes)', () => {
    // Fixture deliberately mixes both shapes so this guard fails loudly if a
    // future refactor stops handling either path.
    expect(sections.length).toBeGreaterThanOrEqual(4);
  });
});
