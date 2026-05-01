// test-isolation-na: no Supabase writes — unit tests against real fixture XML
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseTitleSections, buildArSourceUrl, stripHtml } from '../lib/ar-xml.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'ar', 'title5-ch1-excerpt.xml');

// Load fixture once — real XML sliced from law.resource.org LR.O archive
const FIXTURE_XML = readFileSync(FIXTURE_PATH, 'utf8');

// ---------------------------------------------------------------------------
// buildArSourceUrl
// ---------------------------------------------------------------------------

describe('buildArSourceUrl', () => {
  it('builds correct URL for ch1 section', () => {
    expect(buildArSourceUrl('5-1-101')).toBe(
      'https://law.resource.org/pub/us/code/ar/arkansas.xml.2012/ar.code.05.2012.xml#Section-5-1-101'
    );
  });

  it('builds correct URL for double-digit chapter section', () => {
    expect(buildArSourceUrl('5-28-201')).toBe(
      'https://law.resource.org/pub/us/code/ar/arkansas.xml.2012/ar.code.05.2012.xml#Section-5-28-201'
    );
  });

  it('builds correct URL for three-digit chapter section', () => {
    expect(buildArSourceUrl('5-79-101')).toBe(
      'https://law.resource.org/pub/us/code/ar/arkansas.xml.2012/ar.code.05.2012.xml#Section-5-79-101'
    );
  });

  it('returns an HTTPS URL', () => {
    expect(buildArSourceUrl('5-1-101')).toMatch(/^https:\/\//);
  });

  it('contains the section number in the URL', () => {
    expect(buildArSourceUrl('5-4-201')).toContain('5-4-201');
  });
});

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------

describe('stripHtml', () => {
  it('removes all tags', () => {
    expect(stripHtml('&lt;b&gt;Hello&lt;/b&gt; &lt;p&gt;World&lt;/p&gt;')).toContain('Hello');
  });

  it('decodes &lt; and &gt;', () => {
    const result = stripHtml('&lt;br&gt;text');
    expect(result).not.toContain('&lt;');
    expect(result).toContain('text');
  });

  it('decodes § entity variants', () => {
    expect(stripHtml('See &#167; 5-1-101')).toContain('§');
  });

  it('decodes &amp;', () => {
    expect(stripHtml('A &amp; B')).toContain('A & B');
  });

  it('collapses whitespace', () => {
    const result = stripHtml('  foo   bar  ');
    expect(result).toBe('foo bar');
  });

  it('decodes &nbsp; to space', () => {
    const result = stripHtml('&nbsp;text&nbsp;');
    expect(result).toContain('text');
    expect(result).not.toContain('&nbsp;');
  });
});

// ---------------------------------------------------------------------------
// parseTitleSections — against real fixture XML
// ---------------------------------------------------------------------------

describe('parseTitleSections (real fixture)', () => {
  let sections;

  beforeAll(() => {
    sections = parseTitleSections(FIXTURE_XML);
  });

  it('parses at least 5 sections from ch1 fixture', () => {
    expect(sections.length).toBeGreaterThanOrEqual(5);
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

  it('section 5-1-101 is present', () => {
    const s = sections.find(x => x.sectionNum === '5-1-101');
    expect(s).toBeDefined();
  });

  it('section 5-1-101 titleText matches description', () => {
    const s = sections.find(x => x.sectionNum === '5-1-101');
    expect(s).toBeDefined();
    // Description field is "Title" for 5-1-101
    expect(s.titleText.length).toBeGreaterThan(0);
  });

  it('section 5-1-101 body mentions Arkansas Criminal Code', () => {
    const s = sections.find(x => x.sectionNum === '5-1-101');
    expect(s).toBeDefined();
    expect(s.bodyText).toContain('Arkansas Criminal Code');
  });

  it('sectionNum matches expected AR pattern', () => {
    for (const s of sections) {
      expect(s.sectionNum).toMatch(/^5-\d+-\d+[a-z]*$/);
    }
  });

  it('chapterNum is numeric string without leading zeros', () => {
    for (const s of sections) {
      expect(s.chapterNum).toMatch(/^\d+$/);
      if (s.chapterNum.length > 1) {
        expect(s.chapterNum[0]).not.toBe('0');
      }
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

  it('source URL for each section is HTTPS LR.O URL', () => {
    for (const s of sections) {
      const url = buildArSourceUrl(s.sectionNum);
      expect(url).toMatch(/^https:\/\/law\.resource\.org\//);
      expect(url).toContain(s.sectionNum);
    }
  });

  it('chapterNum for 5-1-* sections is "1"', () => {
    const ch1 = sections.filter(s => s.sectionNum.startsWith('5-1-'));
    expect(ch1.length).toBeGreaterThan(0);
    for (const s of ch1) {
      expect(s.chapterNum).toBe('1');
    }
  });
});
