// test-isolation-na: no Supabase writes — unit tests against real fixture HTML
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseTitleSections, buildJustiaUrl, stripHtml } from '../lib/ga-html.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'ga', 'ga-title16-ch1-ch3-excerpt.html');

// Load fixture once — real HTML sliced from unicourt.github.io
const FIXTURE_HTML = readFileSync(FIXTURE_PATH, 'utf8');

// ---------------------------------------------------------------------------
// buildJustiaUrl
// ---------------------------------------------------------------------------

describe('buildJustiaUrl', () => {
  it('builds correct URL for simple section', () => {
    expect(buildJustiaUrl('16-1-1')).toBe('https://law.justia.com/codes/georgia/section/16-1-1/');
  });

  it('builds correct URL for double-digit chapter section', () => {
    expect(buildJustiaUrl('16-3-21')).toBe('https://law.justia.com/codes/georgia/section/16-3-21/');
  });

  it('builds correct URL for triple-digit section number', () => {
    expect(buildJustiaUrl('16-11-100')).toBe('https://law.justia.com/codes/georgia/section/16-11-100/');
  });

  it('returns an HTTPS URL', () => {
    expect(buildJustiaUrl('16-5-1')).toMatch(/^https:\/\//);
  });
});

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------

describe('stripHtml', () => {
  it('removes all tags', () => {
    expect(stripHtml('<b>Hello</b> <p>World</p>')).toBe('Hello World');
  });

  it('collapses whitespace', () => {
    expect(stripHtml('  foo   bar  ')).toBe('foo bar');
  });

  it('decodes § entity variants', () => {
    expect(stripHtml('See &#xa7; 16-3-21')).toContain('§');
    expect(stripHtml('See &sect; 16-3-21')).toContain('§');
    expect(stripHtml('See &#167; 16-3-21')).toContain('§');
  });

  it('decodes &amp;', () => {
    expect(stripHtml('A &amp; B')).toBe('A & B');
  });
});

// ---------------------------------------------------------------------------
// parseTitleSections — against real fixture HTML
// ---------------------------------------------------------------------------

describe('parseTitleSections (real fixture)', () => {
  let sections;

  beforeAll(() => {
    sections = parseTitleSections(FIXTURE_HTML);
  });

  it('parses at least 10 sections from ch1+ch3 fixture', () => {
    expect(sections.length).toBeGreaterThanOrEqual(10);
  });

  it('ch1 sections are present', () => {
    const ch1 = sections.filter(s => s.chapterNum === '1');
    expect(ch1.length).toBeGreaterThanOrEqual(10);
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

  it('section 16-1-1 has correct title', () => {
    const s = sections.find(x => x.sectionNum === '16-1-1');
    expect(s).toBeDefined();
    expect(s.titleText.toLowerCase()).toContain('short title');
  });

  it('section 16-1-1 body references Criminal Code of Georgia', () => {
    const s = sections.find(x => x.sectionNum === '16-1-1');
    expect(s.bodyText).toContain('Criminal Code of Georgia');
  });

  it('sectionNum matches expected OCGA pattern', () => {
    for (const s of sections) {
      expect(s.sectionNum).toMatch(/^16-\d+-\d+$/);
    }
  });

  it('chapterNum is numeric string without leading zeros', () => {
    for (const s of sections) {
      expect(s.chapterNum).toMatch(/^\d+$/);
      // No leading zeros — "01" should be "1"
      if (s.chapterNum.length > 1) {
        expect(s.chapterNum[0]).not.toBe('0');
      }
    }
  });

  it('no section body is only a history citation', () => {
    for (const s of sections) {
      // Body must not start with "(Code " or "(Ga. L. " (stripped history lines)
      expect(s.bodyText.trim()).not.toMatch(/^\((?:Code|Laws|Ga\. L\.)/);
    }
  });

  it('section 16-1-3 definitions section has substantial body (>200 chars)', () => {
    const s = sections.find(x => x.sectionNum === '16-1-3');
    if (s) {
      expect(s.bodyText.length).toBeGreaterThan(200);
    }
  });

  it('title does not include the section number prefix', () => {
    for (const s of sections) {
      // "Short title." not "16-1-1. Short title."
      expect(s.titleText).not.toMatch(new RegExp(`^${s.sectionNum}\\.`));
    }
  });
});
