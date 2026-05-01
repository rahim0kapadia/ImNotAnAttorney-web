// test-isolation-na: no Supabase writes — unit tests against real HTML fixtures
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  stripHtml,
  isChapterNotFound,
  parseChapter,
  buildSectionUrl,
} from '../lib/tx-html.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures', 'tx');

function loadHtmlFixture(name) {
  return readFileSync(path.join(FIXTURES, name), 'utf8');
}

const CH1_HTML  = loadHtmlFixture('tx-pe-ch1.html');

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------

describe('stripHtml', () => {
  it('removes all tags', () => {
    expect(stripHtml('<b>Hello</b> world')).toBe('Hello world');
  });

  it('collapses whitespace', () => {
    expect(stripHtml('  foo   bar  ')).toBe('foo bar');
  });

  it('decodes &amp;', () => {
    expect(stripHtml('A &amp; B')).toBe('A & B');
  });

  it('decodes &nbsp;', () => {
    expect(stripHtml('A&nbsp;B')).toBe('A B');
  });

  it('decodes &lt; and &gt; then strips resulting tag', () => {
    // &lt;tag&gt; decodes to <tag> which is then stripped by the second-pass tag remover
    const result = stripHtml('before &lt;tag&gt; after');
    expect(result).not.toContain('<tag>');
    expect(result).toContain('before');
    expect(result).toContain('after');
  });

  it('decodes numeric entity &#167; (section sign)', () => {
    expect(stripHtml('&#167;')).toBe('§');
  });

  it('decodes hex entity &#xa7; (section sign)', () => {
    expect(stripHtml('&#xa7;')).toBe('§');
  });

  it('strips script tags and content', () => {
    const result = stripHtml('<script>alert("x")</script>Hello');
    expect(result).not.toContain('alert');
    expect(result).toContain('Hello');
  });

  it('no-ops on empty input', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null)).toBe('');
  });

  it('handles <br> as space', () => {
    const result = stripHtml('line1<br>line2');
    expect(result).toMatch(/line1\s+line2|line1 line2/);
  });
});

// ---------------------------------------------------------------------------
// isChapterNotFound
// ---------------------------------------------------------------------------

describe('isChapterNotFound', () => {
  it('returns true for null', () => {
    expect(isChapterNotFound(null)).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(isChapterNotFound('')).toBe(true);
  });

  it('returns true for short string', () => {
    expect(isChapterNotFound('<html><body></body></html>')).toBe(true);
  });

  it('returns true for Next.js SPA shell containing __NEXT_DATA__', () => {
    const spa = '<html>' + 'x'.repeat(1000) + '__NEXT_DATA__' + 'y'.repeat(1000) + '</html>';
    expect(isChapterNotFound(spa)).toBe(true);
  });

  it('returns true for Next.js SPA shell containing /_next/static', () => {
    const spa = '<html>' + 'x'.repeat(1000) + '/_next/static' + 'y'.repeat(1000) + '</html>';
    expect(isChapterNotFound(spa)).toBe(true);
  });

  it('returns false for real chapter HTML', () => {
    expect(isChapterNotFound(CH1_HTML)).toBe(false);
  });

  it('returns true for HTML with no Sec. markers or name anchors', () => {
    const html = '<html><body>' + 'x'.repeat(1000) + '</body></html>';
    expect(isChapterNotFound(html)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildSectionUrl
// ---------------------------------------------------------------------------

describe('buildSectionUrl', () => {
  it('builds canonical TX PE URL for 49.04', () => {
    expect(buildSectionUrl('49', '49.04')).toBe(
      'https://statutes.capitol.texas.gov/Docs/PE/htm/PE.49.htm#49.04'
    );
  });

  it('builds URL for chapter 1, section 1.01', () => {
    expect(buildSectionUrl('1', '1.01')).toBe(
      'https://statutes.capitol.texas.gov/Docs/PE/htm/PE.1.htm#1.01'
    );
  });

  it('returns an HTTPS URL', () => {
    expect(buildSectionUrl('22', '22.01')).toMatch(/^https:\/\//);
  });

  it('embeds the section number as URL fragment', () => {
    const url = buildSectionUrl('19', '19.02');
    expect(url).toContain('#19.02');
  });

  it('uses statutes.capitol.texas.gov as host', () => {
    const url = buildSectionUrl('1', '1.01');
    expect(url).toContain('statutes.capitol.texas.gov');
  });
});

// ---------------------------------------------------------------------------
// parseChapter — chapter 1 real fixture (14 sections)
// ---------------------------------------------------------------------------

describe('parseChapter (chapter 1 real fixture)', () => {
  let sections;
  beforeAll(() => {
    sections = parseChapter(CH1_HTML, '1');
  });

  it('returns an array', () => {
    expect(Array.isArray(sections)).toBe(true);
  });

  it('extracts at least 10 sections', () => {
    expect(sections.length).toBeGreaterThanOrEqual(10);
  });

  it('all sections have chapterNum "1"', () => {
    for (const s of sections) {
      expect(s.chapterNum).toBe('1');
    }
  });

  it('section 1.01 SHORT TITLE is present', () => {
    const s = sections.find(x => x.sectionNum === '1.01');
    expect(s).toBeDefined();
    expect(s.titleText).toContain('SHORT TITLE');
  });

  it('section 1.07 DEFINITIONS is present', () => {
    const s = sections.find(x => x.sectionNum === '1.07');
    expect(s).toBeDefined();
    expect(s.titleText).toContain('DEFINITION');
  });

  it('all sections have non-empty sectionNum matching N.NN pattern', () => {
    for (const s of sections) {
      expect(s.sectionNum).toMatch(/^\d+\.[0-9A-Za-z]+$/);
    }
  });

  it('all sections have non-empty titleText', () => {
    for (const s of sections) {
      expect(s.titleText.length).toBeGreaterThan(2);
    }
  });

  it('all sections have non-empty bodyText', () => {
    for (const s of sections) {
      expect(s.bodyText.length).toBeGreaterThan(2);
    }
  });

  it('all sections have sourceUrl starting with https://statutes.capitol.texas.gov/', () => {
    for (const s of sections) {
      expect(s.sourceUrl).toMatch(/^https:\/\/statutes\.capitol\.texas\.gov\//);
    }
  });

  it('sourceUrl for 1.01 is correct canonical URL', () => {
    const s = sections.find(x => x.sectionNum === '1.01');
    expect(s.sourceUrl).toBe(
      'https://statutes.capitol.texas.gov/Docs/PE/htm/PE.1.htm#1.01'
    );
  });

  it('no section has legislative history in bodyText (Acts YYYY)', () => {
    for (const s of sections) {
      expect(s.bodyText).not.toMatch(/^Acts \d{4}/);
    }
  });

  it('no section bodyText exceeds 8000 chars', () => {
    for (const s of sections) {
      expect(s.bodyText.length).toBeLessThanOrEqual(8000);
    }
  });

  it('no section has raw HTML in titleText', () => {
    for (const s of sections) {
      expect(s.titleText).not.toContain('<');
    }
  });

  it('no section has raw HTML in bodyText', () => {
    for (const s of sections) {
      expect(s.bodyText).not.toContain('<p ');
      expect(s.bodyText).not.toContain('<a ');
    }
  });

  it('titleText for 1.01 does NOT include "Sec. 1.01." prefix', () => {
    const s = sections.find(x => x.sectionNum === '1.01');
    expect(s.titleText).not.toMatch(/^Sec\.\s+1\.01\./);
  });
});

// ---------------------------------------------------------------------------
// parseChapter — wrong chapter number returns empty
// ---------------------------------------------------------------------------

describe('parseChapter (chapter mismatch)', () => {
  it('returns empty array when chapter number does not match HTML content', () => {
    // ch1 HTML parsed as ch49 should yield nothing
    const sections = parseChapter(CH1_HTML, '49');
    expect(sections).toEqual([]);
  });

  it('returns empty array for null HTML', () => {
    expect(parseChapter(null, '1')).toEqual([]);
  });

  it('returns empty array for SPA shell HTML', () => {
    const spa = '<html>' + 'x'.repeat(600) + '__NEXT_DATA__</html>';
    expect(parseChapter(spa, '1')).toEqual([]);
  });
});
