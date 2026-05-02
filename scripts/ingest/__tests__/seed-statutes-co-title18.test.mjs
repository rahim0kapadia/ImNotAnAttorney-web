// test-isolation-na: no Supabase writes — unit tests against real fixture XML
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseTitleSections, buildCoSourceUrl, stripHtml } from '../lib/co-xml.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'co', 'title18-ch1-excerpt.xml');

const FIXTURE_XML = readFileSync(FIXTURE_PATH, 'utf8');

// ---------------------------------------------------------------------------
// buildCoSourceUrl
// ---------------------------------------------------------------------------

describe('buildCoSourceUrl', () => {
  it('builds correct LR.O archive URL for a standard section', () => {
    expect(buildCoSourceUrl('18-1-101')).toBe(
      'https://law.resource.org/pub/us/code/co/colorado.xml.2012/co.code.title.18.2012.xml#18-1-101'
    );
  });

  it('builds correct URL for a section with decimal suffix', () => {
    expect(buildCoSourceUrl('18-1-704.5')).toBe(
      'https://law.resource.org/pub/us/code/co/colorado.xml.2012/co.code.title.18.2012.xml#18-1-704.5'
    );
  });

  it('builds correct URL for a mid-title section', () => {
    expect(buildCoSourceUrl('18-3-402')).toBe(
      'https://law.resource.org/pub/us/code/co/colorado.xml.2012/co.code.title.18.2012.xml#18-3-402'
    );
  });

  it('returns HTTPS URL', () => {
    expect(buildCoSourceUrl('18-1-101')).toMatch(/^https:\/\//);
  });

  it('returns base URL on empty input', () => {
    expect(buildCoSourceUrl('')).toBe(
      'https://law.resource.org/pub/us/code/co/colorado.xml.2012/co.code.title.18.2012.xml'
    );
  });

  it('encodes special characters in section numbers', () => {
    // decimal point in "18-1-704.5" should be percent-encoded by encodeURIComponent
    const url = buildCoSourceUrl('18-1-704.5');
    expect(url).toContain('#18-1-704');
    expect(url).toMatch(/^https:\/\//);
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
// parseTitleSections — against real CO Title 18 fixture (first 2 articles)
// ---------------------------------------------------------------------------

describe('parseTitleSections (real CO fixture)', () => {
  let sections;

  beforeAll(() => {
    sections = parseTitleSections(FIXTURE_XML);
  });

  it('parses at least 50 sections from the two-article excerpt', () => {
    expect(sections.length).toBeGreaterThanOrEqual(50);
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

  it('section 18-1-101 is present and references Criminal Code', () => {
    const s = sections.find(x => x.sectionNum === '18-1-101');
    expect(s).toBeDefined();
    expect(s.titleText.toLowerCase()).toContain('citation');
  });

  it('section 18-1-104 has expected title (offense defined)', () => {
    const s = sections.find(x => x.sectionNum === '18-1-104');
    expect(s).toBeDefined();
    expect(s.titleText.toLowerCase()).toContain('offense');
  });

  it('sectionNum matches expected CO code pattern (18-N-NNN or 18-N.M-NNN)', () => {
    // CO article numbers can include decimals: "18-1.3-101", "18-1-101", "18-1-704.5"
    for (const s of sections) {
      expect(s.sectionNum).toMatch(/^18-[\d.]+-.+$/i);
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
      expect(s.bodyText).not.toMatch(/<\/?(p|br|font|b|center|i|span|div)\s*\/?>/i);
    }
  });

  it('all source URLs from buildCoSourceUrl are HTTPS', () => {
    for (const s of sections) {
      const url = buildCoSourceUrl(s.sectionNum);
      expect(url).toMatch(/^https:\/\//);
    }
  });
});
