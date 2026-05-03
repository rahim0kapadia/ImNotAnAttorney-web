// test-isolation-na: no Supabase writes — unit tests against real fixture HTML
//
// Tests for the NH Title LXII statute seeder using fixtures captured live from
// gc.nh.gov on 2026-05-02.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NH_HOST,
  NH_BASE_URL,
  NH_TITLE,
  buildChapterUrl,
  buildNHSourceUrl,
  canonicalSectionId,
  decodeEntities,
  stripHtml,
  discoverChapterTokens,
  discoverSections,
  parseSection,
  normalizeEffectiveDate,
} from '../lib/nh-html.mjs';

import {
  NH_COHORT_DEFAULT,
  NH_CHAPTER_DESCRIPTIONS,
  NH_TITLELXII_ROW_FLOOR,
  NH_CRAWL_DELAY_MS,
  NH_ALLOWED_HOSTS,
  parseCliFlags,
  buildNhConfig,
  bucketBDiscover,
  bucketBParse,
  buildSourceUrl,
  buildChapterConfig,
} from '../seed-statutes-nh-titlelxii.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXT = path.join(__dirname, 'fixtures', 'nh');

function readFixture(name) {
  return readFileSync(path.join(FIXT, name), 'utf-8');
}

// ─── Constants + cohort shape ─────────────────────────────────────────────────

describe('nh-html: NH_HOST / NH_BASE_URL / NH_TITLE', () => {
  it('NH_HOST is gc.nh.gov', () => {
    expect(NH_HOST).toBe('gc.nh.gov');
  });
  it('NH_BASE_URL is HTTPS gc.nh.gov', () => {
    expect(NH_BASE_URL).toBe('https://gc.nh.gov');
  });
  it('NH_TITLE is LXII (RSA criminal title)', () => {
    expect(NH_TITLE).toBe('LXII');
  });
});

describe('seed-statutes-nh-titlelxii: cohort constants', () => {
  it('NH_COHORT_DEFAULT contains at least 35 chapters', () => {
    expect(NH_COHORT_DEFAULT.length).toBeGreaterThanOrEqual(35);
  });
  it('cohort is uppercase letter-suffix tokens (e.g. 632-A) and bare numerics (e.g. 630)', () => {
    for (const tok of NH_COHORT_DEFAULT) {
      expect(tok).toMatch(/^\d+(?:-[A-Z])?$/);
    }
  });
  it('cohort includes 630 (Homicide) and 632-A (Sexual Assault)', () => {
    expect(NH_COHORT_DEFAULT).toContain('630');
    expect(NH_COHORT_DEFAULT).toContain('632-A');
    expect(NH_COHORT_DEFAULT).toContain('651-A');
  });
  it('cohort excludes 632 (whole chapter repealed in 1975)', () => {
    expect(NH_COHORT_DEFAULT).not.toContain('632');
  });
  it('NH_CHAPTER_DESCRIPTIONS covers every cohort chapter', () => {
    for (const tok of NH_COHORT_DEFAULT) {
      expect(NH_CHAPTER_DESCRIPTIONS[tok]).toBeTruthy();
    }
  });
  it('NH_TITLELXII_ROW_FLOOR is 250 (conservative — design est. 600-800)', () => {
    expect(NH_TITLELXII_ROW_FLOOR).toBe(250);
  });
  it('NH_CRAWL_DELAY_MS is 11000 (matches gc.nh.gov robots.txt)', () => {
    expect(NH_CRAWL_DELAY_MS).toBe(11000);
  });
  it('NH_ALLOWED_HOSTS contains exactly gc.nh.gov', () => {
    expect(NH_ALLOWED_HOSTS).toEqual(['gc.nh.gov']);
  });
});

// ─── CLI flag parsing ─────────────────────────────────────────────────────────

describe('parseCliFlags', () => {
  it('defaults to live, non-verbose, no chapter filter, no limit', () => {
    expect(parseCliFlags([])).toEqual({
      dryRun: false, verbose: false, chapters: null, limit: null,
    });
  });
  it('parses --dry-run / --verbose flags', () => {
    expect(parseCliFlags(['--dry-run'])).toMatchObject({ dryRun: true, verbose: false });
    expect(parseCliFlags(['--verbose'])).toMatchObject({ dryRun: false, verbose: true });
  });
  it('parses --chapters=A,B,C and uppercases', () => {
    expect(parseCliFlags(['--chapters=630,632-a,651'])).toMatchObject({
      chapters: ['630', '632-A', '651'],
    });
  });
  it('parses --limit=N as integer', () => {
    expect(parseCliFlags(['--limit=42'])).toMatchObject({ limit: 42 });
  });
});

// ─── Config builder ───────────────────────────────────────────────────────────

describe('buildNhConfig', () => {
  it('full cohort by default with 11s crawl delay and gc.nh.gov allowlist', () => {
    const c = buildNhConfig();
    expect(c.cohort).toEqual(NH_COHORT_DEFAULT);
    expect(c.stateCode).toBe('NH');
    expect(c.titleNum).toBe('LXII');
    expect(c.crawlDelayMs).toBe(11000);
    expect(c.allowedHosts).toEqual(['gc.nh.gov']);
  });
  it('filters cohort by --chapters and case-insensitively', () => {
    const c = buildNhConfig({ chapters: ['630', '632-A'] });
    expect(c.cohort).toEqual(['630', '632-A']);
  });
  it('respects --limit option (passed through)', () => {
    const c = buildNhConfig({ limit: 5 });
    expect(c.limit).toBe(5);
  });
});

// ─── URL builders + canonical id ──────────────────────────────────────────────

describe('buildChapterUrl', () => {
  it('builds chapter TOC URL for plain-numeric chapter', () => {
    expect(buildChapterUrl('630')).toBe('https://gc.nh.gov/rsa/html/NHTOC/NHTOC-LXII-630.htm');
  });
  it('builds chapter TOC URL for letter-suffix chapter', () => {
    expect(buildChapterUrl('632-A')).toBe('https://gc.nh.gov/rsa/html/NHTOC/NHTOC-LXII-632-A.htm');
  });
});

describe('buildNHSourceUrl', () => {
  it('builds section URL for plain-numeric chapter + numeric section', () => {
    expect(buildNHSourceUrl('630', '1')).toBe('https://gc.nh.gov/rsa/html/LXII/630/630-1.htm');
  });
  it('builds section URL for letter-suffix chapter + numeric section', () => {
    expect(buildNHSourceUrl('632-A', '2')).toBe('https://gc.nh.gov/rsa/html/LXII/632-A/632-A-2.htm');
  });
  it('builds section URL for sub-letter section like 1-a', () => {
    expect(buildNHSourceUrl('630', '1-a')).toBe('https://gc.nh.gov/rsa/html/LXII/630/630-1-a.htm');
  });
  it('always emits HTTPS gc.nh.gov', () => {
    expect(buildNHSourceUrl('651-A', '24')).toMatch(/^https:\/\/gc\.nh\.gov\//);
  });
});

describe('canonicalSectionId', () => {
  it('joins chapter + sec with colon (RSA citation form)', () => {
    expect(canonicalSectionId('630', '1')).toBe('630:1');
    expect(canonicalSectionId('632-A', '2')).toBe('632-A:2');
    expect(canonicalSectionId('651-A', '24')).toBe('651-A:24');
  });
  it('preserves internal dashes in sec ("1-a")', () => {
    expect(canonicalSectionId('630', '1-a')).toBe('630:1-a');
  });
});

describe('buildSourceUrl (RSA-cite to URL)', () => {
  it('round-trips plain-numeric cite', () => {
    expect(buildSourceUrl('630:1')).toBe('https://gc.nh.gov/rsa/html/LXII/630/630-1.htm');
  });
  it('round-trips letter-suffix cite', () => {
    expect(buildSourceUrl('632-A:2')).toBe('https://gc.nh.gov/rsa/html/LXII/632-A/632-A-2.htm');
  });
  it('round-trips sub-letter cite', () => {
    expect(buildSourceUrl('630:1-a')).toBe('https://gc.nh.gov/rsa/html/LXII/630/630-1-a.htm');
  });
});

describe('buildChapterConfig', () => {
  it('returns chapter, chapterUrl, description, crawl delay, allowlist', () => {
    const c = buildChapterConfig('630');
    expect(c.chapter).toBe('630');
    expect(c.chapterUrl).toBe('https://gc.nh.gov/rsa/html/NHTOC/NHTOC-LXII-630.htm');
    expect(c.description).toBe('Homicide');
    expect(c.crawlDelayMs).toBe(11000);
    expect(c.allowedHosts).toEqual(['gc.nh.gov']);
  });
  it('returns null description for unknown chapter', () => {
    const c = buildChapterConfig('999');
    expect(c.description).toBeNull();
  });
});

// ─── HTML helpers ────────────────────────────────────────────────────────────

describe('decodeEntities', () => {
  it('decodes basic HTML entities', () => {
    expect(decodeEntities('A &amp; B')).toBe('A & B');
    expect(decodeEntities('&lt;tag&gt;')).toBe('<tag>');
    expect(decodeEntities('it&#39;s')).toBe("it's");
    expect(decodeEntities('&nbsp;')).toBe(' ');
  });
  it('decodes the windows-1252 dash &#150; to "-"', () => {
    expect(decodeEntities('Capital Murder. &#150;')).toBe('Capital Murder. -');
  });
  it('decodes section-sign variants', () => {
    expect(decodeEntities('&sect;')).toBe('§');
    expect(decodeEntities('&#xa7;')).toBe('§');
    expect(decodeEntities('&#167;')).toBe('§');
  });
  it('drops C0 control chars', () => {
    expect(decodeEntities('a&#0;b')).toBe('ab');
    expect(decodeEntities('a&#7;b')).toBe('ab');
  });
});

describe('stripHtml', () => {
  it('strips tags and collapses whitespace within lines', () => {
    expect(stripHtml('<p>hello <b>world</b></p>')).toBe('hello world');
  });
  it('drops <script> and <style>', () => {
    expect(stripHtml('a<script>x()</script>b')).toBe('a b');
  });
  it('preserves <br>-derived line breaks', () => {
    expect(stripHtml('a<br>b<br>c')).toBe('a\nb\nc');
  });
  it('returns empty string for null/empty', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null)).toBe('');
  });
});

describe('normalizeEffectiveDate', () => {
  it('parses "Jan. 1, 2018" → "2018-01-01"', () => {
    expect(normalizeEffectiveDate('Jan. 1, 2018')).toBe('2018-01-01');
  });
  it('parses "July 1, 2011" → "2011-07-01"', () => {
    expect(normalizeEffectiveDate('July 1, 2011')).toBe('2011-07-01');
  });
  it('parses "5-30-2019" → "2019-05-30"', () => {
    expect(normalizeEffectiveDate('5-30-2019')).toBe('2019-05-30');
  });
  it('expands 2-digit year "1-1-24" → "2024-01-01"', () => {
    expect(normalizeEffectiveDate('1-1-24')).toBe('2024-01-01');
  });
  it('returns null for unparseable input', () => {
    expect(normalizeEffectiveDate('garbage')).toBeNull();
  });
});

// ─── discoverChapterTokens ────────────────────────────────────────────────────

describe('discoverChapterTokens', () => {
  it('extracts >= 35 chapter tokens from the title TOC fixture', () => {
    const html = readFixture('title-lxii-toc-sample.html');
    const tokens = discoverChapterTokens(html);
    expect(tokens.length).toBeGreaterThanOrEqual(35);
  });
  it('preserves document order + dedupes', () => {
    const html = readFixture('title-lxii-toc-sample.html');
    const tokens = discoverChapterTokens(html);
    expect(new Set(tokens).size).toBe(tokens.length);
    expect(tokens.indexOf('625')).toBeLessThan(tokens.indexOf('630'));
    expect(tokens.indexOf('630')).toBeLessThan(tokens.indexOf('632-A'));
  });
  it('captures letter-suffix tokens (632-A, 639-A, 651-A..F)', () => {
    const html = readFixture('title-lxii-toc-sample.html');
    const tokens = discoverChapterTokens(html);
    for (const tok of ['632-A', '639-A', '644-A', '649-A', '649-B', '650-A', '651-A', '651-F']) {
      expect(tokens).toContain(tok);
    }
  });
  it('returns [] for empty/non-string input', () => {
    expect(discoverChapterTokens('')).toEqual([]);
    expect(discoverChapterTokens(null)).toEqual([]);
  });
});

// ─── discoverSections ────────────────────────────────────────────────────────

describe('discoverSections (chapter 630)', () => {
  const html = readFixture('chapter-630-toc-sample.html');
  it('returns >= 6 active descriptors', () => {
    const sections = discoverSections(html, '630');
    expect(sections.length).toBeGreaterThanOrEqual(6);
  });
  it('includes 630:1 and 630:1-a (Capital Murder + First Degree Murder)', () => {
    const sections = discoverSections(html, '630');
    const ids = sections.map((s) => s.sectionId);
    expect(ids).toContain('630:1');
    expect(ids).toContain('630:1-a');
  });
  it('every descriptor URL is HTTPS gc.nh.gov', () => {
    const sections = discoverSections(html, '630');
    for (const s of sections) {
      expect(s.url).toMatch(/^https:\/\/gc\.nh\.gov\//);
    }
  });
  it('skips the merged-text 630-mrg.htm link', () => {
    const sections = discoverSections(html, '630');
    for (const s of sections) {
      expect(s.section).not.toBe('mrg');
      expect(s.url).not.toMatch(/630-mrg\.htm$/);
    }
  });
  it('dedupes within the chapter', () => {
    const sections = discoverSections(html, '630');
    expect(new Set(sections.map((s) => s.sectionId)).size).toBe(sections.length);
  });
});

describe('discoverSections (letter-suffix chapter 632-A)', () => {
  const html = readFixture('chapter-632-A-toc-sample.html');
  it('returns descriptors using citation form 632-A:N', () => {
    const sections = discoverSections(html, '632-A');
    expect(sections.length).toBeGreaterThanOrEqual(10);
    const ids = sections.map((s) => s.sectionId);
    expect(ids).toContain('632-A:1');
    expect(ids).toContain('632-A:2');
  });
  it('every URL points at LXII/632-A/632-A-... path', () => {
    const sections = discoverSections(html, '632-A');
    for (const s of sections) {
      expect(s.url).toMatch(/^https:\/\/gc\.nh\.gov\/rsa\/html\/LXII\/632-A\/632-A-/);
    }
  });
});

// ─── parseSection ─────────────────────────────────────────────────────────────

describe('parseSection: active section (630:1 Capital Murder)', () => {
  const html = readFixture('section-630-1-sample.html');
  it('returns a populated row', () => {
    const r = parseSection(html, '630:1');
    expect(r).not.toBeNull();
    expect(r.titleText).toBe('Capital Murder');
    expect(r.bodyText.length).toBeGreaterThan(500);
    expect(r.bodyText).toMatch(/capital murder/i);
  });
  it('extracts effective date from the source-note', () => {
    const r = parseSection(html, '630:1');
    expect(r.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('parseSection: section-number mismatch returns null', () => {
  const html = readFixture('section-630-1-sample.html');
  it('returns null when expected cite does not match heading', () => {
    expect(parseSection(html, '999:99')).toBeNull();
  });
});

describe('parseSection: repealed section returns null', () => {
  const html = readFixture('section-repealed-sample.html');
  it('returns null on Repealed-by heading', () => {
    expect(parseSection(html, '651:7')).toBeNull();
  });
});

describe('parseSection: too-short input returns null', () => {
  it('returns null for HTML under 200 chars', () => {
    expect(parseSection('<html><body>short</body></html>', '630:1')).toBeNull();
  });
  it('returns null for null/empty input', () => {
    expect(parseSection(null, '630:1')).toBeNull();
    expect(parseSection('', '630:1')).toBeNull();
  });
});

// ─── Bucket-B harness adapter shape ──────────────────────────────────────────

describe('bucketBDiscover (chapter, html) → descriptor[]', () => {
  it('accepts chapter as a string arg', () => {
    const html = readFixture('chapter-630-toc-sample.html');
    const out = bucketBDiscover(html, '630');
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeGreaterThanOrEqual(6);
    expect(out[0]).toMatchObject({ chapter: '630', sectionId: expect.any(String) });
  });
  it('accepts a config object with .chapter', () => {
    const html = readFixture('chapter-630-toc-sample.html');
    const out = bucketBDiscover(html, { chapter: '630' });
    expect(out.length).toBeGreaterThanOrEqual(6);
  });
  it('returns [] when chapter missing', () => {
    expect(bucketBDiscover('x', undefined)).toEqual([]);
  });
});

describe('bucketBParse (html, sectionRsaCite) → {titleText, bodyText}|null', () => {
  it('returns harness-shaped row (no effectiveDate)', () => {
    const html = readFixture('section-630-1-sample.html');
    const out = bucketBParse(html, '630:1');
    expect(out).not.toBeNull();
    expect(out).toHaveProperty('titleText');
    expect(out).toHaveProperty('bodyText');
    expect(out).not.toHaveProperty('effectiveDate');
  });
  it('returns null for repealed', () => {
    const html = readFixture('section-repealed-sample.html');
    expect(bucketBParse(html, '651:7')).toBeNull();
  });
});
