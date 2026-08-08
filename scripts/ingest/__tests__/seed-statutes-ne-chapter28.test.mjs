// test-isolation-na: no Supabase writes — unit tests against real fixture HTML
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseNEChapter28, buildNESourceUrl, stripHtml } from '../lib/ne-html.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'ne', 'chap28-sample.html');

// Load fixture once — real HTML sliced from nebraskalegislature.gov chap28-full.html
const FIXTURE_HTML = readFileSync(FIXTURE_PATH, 'utf8');

// ---------------------------------------------------------------------------
// buildNESourceUrl
// ---------------------------------------------------------------------------

describe('buildNESourceUrl', () => {
  it('builds correct URL for basic section', () => {
    expect(buildNESourceUrl('28-101')).toBe(
      'https://nebraskalegislature.gov/laws/statutes.php?statute=28-101',
    );
  });

  it('builds correct URL for sub-numbered section', () => {
    expect(buildNESourceUrl('28-105.01')).toBe(
      'https://nebraskalegislature.gov/laws/statutes.php?statute=28-105.01',
    );
  });

  it('builds correct URL for triple-digit-section', () => {
    expect(buildNESourceUrl('28-1701')).toBe(
      'https://nebraskalegislature.gov/laws/statutes.php?statute=28-1701',
    );
  });

  it('returns an HTTPS URL', () => {
    expect(buildNESourceUrl('28-201')).toMatch(/^https:\/\//);
  });
});

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------

describe('stripHtml', () => {
  it('removes all tags', () => {
    expect(stripHtml('<strong>Hello</strong> <p>World</p>')).toBe('Hello World');
  });

  it('collapses whitespace incl newlines and tabs', () => {
    expect(stripHtml('  foo \n\t  bar  ')).toBe('foo bar');
  });

  it('decodes § entity variants', () => {
    expect(stripHtml('See &#xa7; 28-201')).toContain('§');
    expect(stripHtml('See &sect; 28-201')).toContain('§');
    expect(stripHtml('See &#167; 28-201')).toContain('§');
  });

  it('decodes &amp;', () => {
    expect(stripHtml('A &amp; B')).toBe('A & B');
  });

  it('decodes &nbsp; to plain space', () => {
    expect(stripHtml('A&nbsp;B')).toBe('A B');
  });
});

// ---------------------------------------------------------------------------
// parseNEChapter28 — against real fixture HTML
// ---------------------------------------------------------------------------

describe('parseNEChapter28 (real fixture)', () => {
  let sections;

  beforeAll(() => {
    sections = parseNEChapter28(FIXTURE_HTML);
  });

  it('parses at least 6 valid sections (excludes repealed)', () => {
    // Fixture has 8 headings: 28-101..28-105, 28-105.01, 28-311.09 (repealed), 28-201
    // Repealed has no <p> body so harness drops it → 7 valid.
    expect(sections.length).toBeGreaterThanOrEqual(6);
  });

  it('drops repealed sections (no <p> body)', () => {
    const repealed = sections.find(s => s.sectionNum === '28-311.09');
    expect(repealed).toBeUndefined();
  });

  it('parses sub-numbered section 28-105.01', () => {
    const s = sections.find(x => x.sectionNum === '28-105.01');
    expect(s).toBeDefined();
    expect(s.titleText).toContain('death');
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

  it('section 28-101 has correct title', () => {
    const s = sections.find(x => x.sectionNum === '28-101');
    expect(s).toBeDefined();
    expect(s.titleText.toLowerCase()).toContain('code, how cited');
  });

  it('section 28-101 body references Nebraska Criminal Code', () => {
    const s = sections.find(x => x.sectionNum === '28-101');
    expect(s.bodyText).toContain('Nebraska Criminal Code');
  });

  it('sectionNum matches expected NE Chapter 28 pattern', () => {
    for (const s of sections) {
      expect(s.sectionNum).toMatch(/^28-\d+(?:\.\d+)?[a-z]?$/);
    }
  });

  it('chapterNum is always "28"', () => {
    for (const s of sections) {
      expect(s.chapterNum).toBe('28');
    }
  });

  it('title does not include the section number prefix', () => {
    for (const s of sections) {
      // "Code, how cited." not "28-101. Code, how cited."
      expect(s.titleText).not.toMatch(new RegExp(`^${s.sectionNum.replace('.', '\\.')}\\.`));
    }
  });

  it('body excludes legislative history (Source: Laws ...)', () => {
    for (const s of sections) {
      // The <div class="source"> should be stopped before reaching body
      expect(s.bodyText).not.toMatch(/^Source:/i);
      // No "Effective Date:" string — that lives inside <div class="source">
      expect(s.bodyText).not.toContain('Effective Date:');
    }
  });

  it('body excludes annotations (case law) and cross-references', () => {
    const s105 = sections.find(x => x.sectionNum === '28-105');
    expect(s105.bodyText).not.toContain('State v. Ramirez');  // anno block

    const s201 = sections.find(x => x.sectionNum === '28-201');
    expect(s201.bodyText).not.toContain('Cross References');  // cross block
  });

  it('section 28-102 has substantial body (>100 chars)', () => {
    const s = sections.find(x => x.sectionNum === '28-102');
    expect(s).toBeDefined();
    expect(s.bodyText.length).toBeGreaterThan(100);
  });
});
