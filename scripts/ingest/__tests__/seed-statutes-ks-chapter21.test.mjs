// test-isolation-na: no Supabase writes — unit tests against real fixture HTML
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  parseKSChapter21,
  filterActiveSections,
  parseKSSectionPage,
  buildKSSourceUrl,
  stripHtml,
} from '../lib/ks-html.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX_DIR = path.join(__dirname, 'fixtures', 'ks');

const INDEX_HTML = readFileSync(path.join(FIX_DIR, 'ksa_ch21-sample.html'), 'utf8');
const SEC_5401_HTML = readFileSync(path.join(FIX_DIR, '021_054_0001.html'), 'utf8');
const SEC_5101_HTML = readFileSync(path.join(FIX_DIR, '021_051_0001.html'), 'utf8');

// ---------------------------------------------------------------------------
// buildKSSourceUrl
// ---------------------------------------------------------------------------

describe('buildKSSourceUrl', () => {
  it('builds URL for a 4-digit modern code section', () => {
    expect(buildKSSourceUrl('21-5401')).toBe(
      'https://ksrevisor.gov/statutes/chapters/ch21/021_054_0001.html'
    );
  });

  it('builds URL for a different article', () => {
    expect(buildKSSourceUrl('21-5101')).toBe(
      'https://ksrevisor.gov/statutes/chapters/ch21/021_051_0001.html'
    );
  });

  it('builds URL for high-numbered section in same article', () => {
    expect(buildKSSourceUrl('21-5408')).toBe(
      'https://ksrevisor.gov/statutes/chapters/ch21/021_054_0008.html'
    );
  });

  it('builds URL for a 3-digit pre-2010 section (article 1, section 01)', () => {
    expect(buildKSSourceUrl('21-101')).toBe(
      'https://ksrevisor.gov/statutes/chapters/ch21/021_001_0001.html'
    );
  });

  it('returns HTTPS', () => {
    expect(buildKSSourceUrl('21-5401')).toMatch(/^https:\/\//);
  });

  it('contains the canonical /ch21/ path', () => {
    expect(buildKSSourceUrl('21-5503')).toContain('/statutes/chapters/ch21/');
  });

  it('throws on missing argument', () => {
    expect(() => buildKSSourceUrl('')).toThrow();
    expect(() => buildKSSourceUrl(null)).toThrow();
  });

  it('throws on bad shape', () => {
    expect(() => buildKSSourceUrl('20-5401')).toThrow();   // wrong chapter
    expect(() => buildKSSourceUrl('21-1')).toThrow();      // too short
    expect(() => buildKSSourceUrl('foo-bar')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------

describe('stripHtml', () => {
  it('removes tags', () => {
    expect(stripHtml('<b>Hello</b> <p>World</p>')).toBe('Hello World');
  });

  it('decodes &lt; and &gt; (then strips the resulting synthetic tag — defensive)', () => {
    // stripHtml is INTENDED to remove HTML; if entities resolve to a tag-like
    // construct, that construct gets stripped on the same pass. This matches
    // AR/GA harness behavior and is the safe default for body text storage.
    expect(stripHtml('&lt;tag&gt;')).toBe('');
    // Tag-internal text survives:
    expect(stripHtml('See &lt;b&gt;bold&lt;/b&gt; text')).toContain('bold');
    expect(stripHtml('See &lt;b&gt;bold&lt;/b&gt; text')).toContain('text');
  });

  it('decodes &sect; entity variants', () => {
    expect(stripHtml('See &sect; 21-5401')).toContain('§');
  });

  it('decodes &amp;', () => {
    expect(stripHtml('A &amp; B')).toContain('A & B');
  });

  it('decodes &nbsp; to space', () => {
    const out = stripHtml('foo&nbsp;bar');
    expect(out).toContain('foo');
    expect(out).toContain('bar');
    expect(out).not.toContain('&nbsp;');
  });

  it('decodes numeric entities', () => {
    expect(stripHtml('&#167;')).toBe('§');
  });

  it('collapses whitespace', () => {
    expect(stripHtml('  foo   bar  ')).toBe('foo bar');
  });

  it('handles empty input', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null)).toBe('');
    expect(stripHtml(undefined)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// parseKSChapter21 — against fixture
// ---------------------------------------------------------------------------

describe('parseKSChapter21 (fixture)', () => {
  let all;
  beforeAll(() => {
    all = parseKSChapter21(INDEX_HTML);
  });

  it('parses every <li>21-...</li> entry in the fixture', () => {
    // Fixture has 14 <li> entries
    expect(all.length).toBe(14);
  });

  it('every entry has sectionNum starting with "21-"', () => {
    for (const s of all) {
      expect(s.sectionNum).toMatch(/^21-\d+[a-z]*$/);
    }
  });

  it('every entry has an absolute HTTPS sectionUrl on ksrevisor.gov', () => {
    for (const s of all) {
      expect(s.sectionUrl).toMatch(/^https:\/\/ksrevisor\.gov\/statutes\/chapters\/ch21\//);
    }
  });

  it('every entry has a non-empty statusLabel', () => {
    for (const s of all) {
      expect(s.statusLabel.length).toBeGreaterThan(0);
    }
  });

  it('every entry has a numeric chapterNum (article)', () => {
    for (const s of all) {
      expect(s.chapterNum).toMatch(/^\d+$/);
    }
  });

  it('marks Repealed/Reserved/Transferred as inactive', () => {
    const repealed = all.find(s => s.sectionNum === '21-3401');
    const transferred = all.find(s => s.sectionNum === '21-3502');
    const reserved = all.find(s => s.sectionNum === '21-3524');
    expect(repealed.isActive).toBe(false);
    expect(transferred.isActive).toBe(false);
    expect(reserved.isActive).toBe(false);
  });

  it('marks active sections as isActive=true', () => {
    const cap = all.find(s => s.sectionNum === '21-5401');
    expect(cap).toBeDefined();
    expect(cap.isActive).toBe(true);
    // Link text in the index includes a trailing period; statusLabel preserves
    // it intact (the inactive-marker check trims+lowercases, so "Repealed."
    // matches even with the period).
    expect(cap.statusLabel).toBe('Capital murder.');
  });

  it('article 54 is derived correctly from href "/021_054_..."', () => {
    const cap = all.find(s => s.sectionNum === '21-5401');
    expect(cap.chapterNum).toBe('54');
  });
});

// ---------------------------------------------------------------------------
// filterActiveSections
// ---------------------------------------------------------------------------

describe('filterActiveSections (fixture)', () => {
  let all, active;
  beforeAll(() => {
    all = parseKSChapter21(INDEX_HTML);
    active = filterActiveSections(all);
  });

  it('drops every Repealed/Reserved/Transferred entry', () => {
    expect(active.find(s => s.statusLabel === 'Repealed')).toBeUndefined();
    expect(active.find(s => s.statusLabel === 'Reserved')).toBeUndefined();
    expect(active.find(s => s.statusLabel === 'Transferred')).toBeUndefined();
  });

  it('drops out-of-range articles (article 99 in fixture)', () => {
    expect(active.find(s => s.chapterNum === '99')).toBeUndefined();
  });

  it('drops pre-2010 article 35 entries (article < 51)', () => {
    expect(active.find(s => s.chapterNum === '35')).toBeUndefined();
  });

  it('keeps modern code sections in articles 51-63', () => {
    // Fixture has 3 art-51, 5 art-54, 2 art-55 = 10 active
    expect(active.length).toBe(10);
    for (const s of active) {
      const a = parseInt(s.chapterNum, 10);
      expect(a).toBeGreaterThanOrEqual(51);
      expect(a).toBeLessThanOrEqual(63);
    }
  });

  it('returns 21-5401 (Capital murder) as active', () => {
    expect(active.find(s => s.sectionNum === '21-5401')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// parseKSSectionPage — against fixture
// ---------------------------------------------------------------------------

describe('parseKSSectionPage (fixture)', () => {
  it('parses 21-5401 (Capital murder) from real fixture', () => {
    const out = parseKSSectionPage(SEC_5401_HTML, '21-5401');
    expect(out).not.toBeNull();
    expect(out.titleText).toBe('Capital murder');
    expect(out.bodyText.length).toBeGreaterThan(50);
    expect(out.bodyText).toContain('Capital murder');
    expect(out.bodyText).toContain('intentional');
  });

  it('strips HTML tags from body', () => {
    const out = parseKSSectionPage(SEC_5401_HTML, '21-5401');
    expect(out.bodyText).not.toMatch(/<[a-z]+/i);
  });

  it('strips footer artifacts (Print Version / Previous Section / Legislative Coordinating Council)', () => {
    const out = parseKSSectionPage(SEC_5401_HTML, '21-5401');
    expect(out.bodyText).not.toContain('Print Version');
    expect(out.bodyText).not.toContain('Previous Section');
    expect(out.bodyText).not.toContain('Legislative Coordinating Council');
  });

  it('decodes &sect; entity to §', () => {
    const out = parseKSSectionPage(SEC_5401_HTML, '21-5401');
    expect(out.bodyText).toContain('§');
  });

  it('parses 21-5101 short section', () => {
    const out = parseKSSectionPage(SEC_5101_HTML, '21-5101');
    expect(out).not.toBeNull();
    expect(out.titleText).toBe('Title; effective date');
    expect(out.bodyText).toContain('Kansas criminal code');
  });

  it('returns null on empty input', () => {
    expect(parseKSSectionPage('', '21-5401')).toBeNull();
    expect(parseKSSectionPage(null, '21-5401')).toBeNull();
  });

  it('returns null on HTML missing stat_caption', () => {
    expect(parseKSSectionPage('<html><body><p>no stat_caption here</p></body></html>', '21-5401')).toBeNull();
  });
});
