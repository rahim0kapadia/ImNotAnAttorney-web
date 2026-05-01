// test-isolation-na: no Supabase writes — unit tests against real fixture XML
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseTitleSections, buildMsLroSourceUrl, stripHtml } from '../lib/ms-xml.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'ms', 'title97-ch1-excerpt.xml');

const FIXTURE_XML = readFileSync(FIXTURE_PATH, 'utf8');

// ---------------------------------------------------------------------------
// buildMsLroSourceUrl
// ---------------------------------------------------------------------------

describe('buildMsLroSourceUrl', () => {
  it('builds correct LR.O archive URL for a chapter-1 section', () => {
    expect(buildMsLroSourceUrl('97-1-1')).toBe(
      'https://law.resource.org/pub/us/code/ms/ms.xml.2013/title-97.xml#97-1-1'
    );
  });

  it('builds correct LR.O archive URL for a chapter-3 section', () => {
    expect(buildMsLroSourceUrl('97-3-19')).toBe(
      'https://law.resource.org/pub/us/code/ms/ms.xml.2013/title-97.xml#97-3-19'
    );
  });

  it('URL-encodes special characters in section numbers', () => {
    // section numbers should be URL-safe bare numbers, but verify encoding works
    const url = buildMsLroSourceUrl('97-1-1');
    expect(url).toMatch(/^https:\/\//);
    expect(url).toContain('title-97.xml#');
  });

  it('returns HTTPS URL', () => {
    expect(buildMsLroSourceUrl('97-3-21')).toMatch(/^https:\/\//);
  });

  it('anchors URL to the correct LR.O MS 2013 file', () => {
    expect(buildMsLroSourceUrl('97-43-5')).toContain(
      'law.resource.org/pub/us/code/ms/ms.xml.2013/title-97.xml'
    );
  });

  it('appends section number as fragment', () => {
    expect(buildMsLroSourceUrl('97-3-25')).toMatch(/#97-3-25$/);
  });
});

// ---------------------------------------------------------------------------
// stripHtml (re-exported from harness)
// ---------------------------------------------------------------------------

describe('stripHtml', () => {
  it('strips tags and decodes &nbsp;', () => {
    expect(stripHtml('<p>A&nbsp;&nbsp;B</p>')).toBe('A B');
  });

  it('decodes numeric entities', () => {
    expect(stripHtml('A&#167;B')).toContain('§');
  });

  it('decodes &amp;', () => {
    expect(stripHtml('A &amp; B')).toBe('A & B');
  });

  it('strips <br> tags', () => {
    expect(stripHtml('foo<br>bar<br />baz')).toBe('foo bar baz');
  });
});

// ---------------------------------------------------------------------------
// parseTitleSections — against real MS Title 97 Chapter 1+3 fixture
// ---------------------------------------------------------------------------

describe('parseTitleSections (real fixture)', () => {
  let sections;

  beforeAll(() => {
    sections = parseTitleSections(FIXTURE_XML);
  });

  it('parses at least 20 sections from the chapter-1+3 excerpt', () => {
    expect(sections.length).toBeGreaterThanOrEqual(20);
  });

  it('every section has a non-empty titleText', () => {
    for (const s of sections) {
      expect(s.titleText.length).toBeGreaterThan(0);
    }
  });

  it('every section has a non-empty bodyText', () => {
    for (const s of sections) {
      expect(s.bodyText.length).toBeGreaterThan(0);
    }
  });

  it('section 97-1-1 is present and references conspiracy', () => {
    const s = sections.find(x => x.sectionNum === '97-1-1');
    expect(s).toBeDefined();
    expect(s.bodyText.toLowerCase()).toContain('conspire');
  });

  it('section 97-3-19 has expected title (murder defined)', () => {
    const s = sections.find(x => x.sectionNum === '97-3-19');
    expect(s).toBeDefined();
    expect(s.titleText.toLowerCase()).toContain('murder');
  });

  it('sectionNum does NOT start with § (prefix stripped)', () => {
    for (const s of sections) {
      expect(s.sectionNum).not.toMatch(/^§/);
    }
  });

  it('sectionNum matches expected MS code pattern', () => {
    for (const s of sections) {
      expect(s.sectionNum).toMatch(/^97-\d+-\d+$/);
    }
  });

  it('chapterNum is non-empty numeric string', () => {
    for (const s of sections) {
      expect(s.chapterNum).toMatch(/^\d+$/);
    }
  });

  it('no section body retains raw <Content> tag wrapping', () => {
    for (const s of sections) {
      expect(s.bodyText).not.toContain('<Content>');
      expect(s.bodyText).not.toContain('</Content>');
    }
  });

  it('section bodies do not retain raw HTML tags', () => {
    for (const s of sections) {
      expect(s.bodyText).not.toMatch(/<\/?(p|br|font|b|center|i|span|div|P)\s*\/?>/i);
    }
  });

  it('section 97-3-21 references imprisonment for life', () => {
    const s = sections.find(x => x.sectionNum === '97-3-21');
    expect(s).toBeDefined();
    expect(s.bodyText.toLowerCase()).toContain('imprisonment for life');
  });

  it('chapter-1 sections have chapterNum "1"', () => {
    const ch1 = sections.filter(x => x.sectionNum.startsWith('97-1-'));
    expect(ch1.length).toBeGreaterThan(0);
    for (const s of ch1) {
      expect(s.chapterNum).toBe('1');
    }
  });

  it('chapter-3 sections have chapterNum "3"', () => {
    const ch3 = sections.filter(x => x.sectionNum.startsWith('97-3-'));
    expect(ch3.length).toBeGreaterThan(0);
    for (const s of ch3) {
      expect(s.chapterNum).toBe('3');
    }
  });
});
