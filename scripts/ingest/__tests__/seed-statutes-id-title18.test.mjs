// test-isolation-na: no Supabase writes — unit tests against real fixture XML
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseTitleSections, buildIdLegSourceUrl, stripHtml } from '../lib/id-xml.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'id', 'title18-ch1-excerpt.xml');

const FIXTURE_XML = readFileSync(FIXTURE_PATH, 'utf8');

// ---------------------------------------------------------------------------
// buildIdLegSourceUrl
// ---------------------------------------------------------------------------

describe('buildIdLegSourceUrl', () => {
  it('builds correct URL for short-section style (3-digit rest)', () => {
    expect(buildIdLegSourceUrl('18-100')).toBe(
      'https://legislature.idaho.gov/statutesrules/idstat/Title18/T18CH1/SECT18-100/'
    );
  });

  it('builds correct URL for chapter-15 section', () => {
    expect(buildIdLegSourceUrl('18-1501')).toBe(
      'https://legislature.idaho.gov/statutesrules/idstat/Title18/T18CH15/SECT18-1501/'
    );
  });

  it('builds correct URL for chapter-86 section', () => {
    expect(buildIdLegSourceUrl('18-8605')).toBe(
      'https://legislature.idaho.gov/statutesrules/idstat/Title18/T18CH86/SECT18-8605/'
    );
  });

  it('preserves trailing letter suffix in URL', () => {
    expect(buildIdLegSourceUrl('18-101A')).toBe(
      'https://legislature.idaho.gov/statutesrules/idstat/Title18/T18CH1/SECT18-101A/'
    );
  });

  it('returns HTTPS URL', () => {
    expect(buildIdLegSourceUrl('18-2603')).toMatch(/^https:\/\//);
  });

  it('returns title-level URL on unparseable input', () => {
    expect(buildIdLegSourceUrl('garbage')).toBe(
      'https://legislature.idaho.gov/statutesrules/idstat/Title18/'
    );
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
// parseTitleSections — against real ID Title 18 Chapter 1 fixture
// ---------------------------------------------------------------------------

describe('parseTitleSections (real fixture)', () => {
  let sections;

  beforeAll(() => {
    sections = parseTitleSections(FIXTURE_XML);
  });

  it('parses at least 20 sections from the chapter-1 excerpt', () => {
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

  it('section 18-100 is present and references Criminal Code', () => {
    const s = sections.find(x => x.sectionNum === '18-100');
    expect(s).toBeDefined();
    expect(s.bodyText).toContain('Criminal Code');
  });

  it('section 18-110 has expected title (GRADES OF CRIME)', () => {
    const s = sections.find(x => x.sectionNum === '18-110');
    expect(s).toBeDefined();
    expect(s.titleText.toUpperCase()).toContain('GRADES OF CRIME');
  });

  it('sectionNum matches expected ID code pattern', () => {
    for (const s of sections) {
      expect(s.sectionNum).toMatch(/^18-\d+[A-Z]?$/);
    }
  });

  it('chapterNum is non-empty numeric string', () => {
    for (const s of sections) {
      expect(s.chapterNum).toMatch(/^\d+$/);
    }
  });

  it('section 18-110 (short body) is correctly extracted', () => {
    const s = sections.find(x => x.sectionNum === '18-110');
    expect(s).toBeDefined();
    expect(s.bodyText.toLowerCase()).toContain('felonies');
    expect(s.bodyText.toLowerCase()).toContain('misdemeanors');
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
});
