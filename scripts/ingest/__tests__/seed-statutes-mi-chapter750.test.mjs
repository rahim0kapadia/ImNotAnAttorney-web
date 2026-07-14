// test-isolation-na: pure parser unit tests against on-disk fixture text — no DB writes.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseChapter750,
  buildMiSourceUrl,
  isRepealedTitle,
  MI_CHAPTER750_PDF_URL,
  MI_CONFIG,
} from '../lib/mi-pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'mi', 'chapter750-sample.txt');
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, 'utf8');

describe('MI_CONFIG', () => {
  it('has MI state code', () => {
    expect(MI_CONFIG.state).toBe('MI');
  });
  it('has a sectionRe regex', () => {
    expect(MI_CONFIG.sectionRe).toBeInstanceOf(RegExp);
  });
  it('has a custom pageBreakRe (overrides harness default)', () => {
    expect(MI_CONFIG.pageBreakRe).toBeInstanceOf(RegExp);
  });
  it('does NOT normalize en-dashes (MI uses ASCII hyphens)', () => {
    expect(MI_CONFIG.normalizeEnDash).toBe(false);
  });
});

describe('buildMiSourceUrl', () => {
  it('returns the chapter-level PDF URL for any section', () => {
    expect(buildMiSourceUrl('1')).toBe(MI_CHAPTER750_PDF_URL);
    expect(buildMiSourceUrl('316')).toBe(MI_CHAPTER750_PDF_URL);
    expect(buildMiSourceUrl('10a')).toBe(MI_CHAPTER750_PDF_URL);
  });

  it('URL is HTTPS', () => {
    expect(buildMiSourceUrl('1')).toMatch(/^https:\/\//);
  });

  it('URL points at legislature.mi.gov', () => {
    expect(buildMiSourceUrl('1')).toContain('legislature.mi.gov');
  });

  it('URL ends in .pdf', () => {
    expect(buildMiSourceUrl('1')).toMatch(/\.pdf$/);
  });
});

describe('isRepealedTitle', () => {
  it('flags titles starting with "Repealed."', () => {
    expect(isRepealedTitle('Repealed. 2023, Act 11, Eff. Feb. 13, 2024')).toBe(true);
  });
  it('flags titles starting with "Transferred."', () => {
    expect(isRepealedTitle('Transferred. 1968, Act 39')).toBe(true);
  });
  it('does NOT flag normal titles', () => {
    expect(isRepealedTitle('Michigan penal code; short title.')).toBe(false);
    expect(isRepealedTitle('First degree murder; punishment.')).toBe(false);
  });
  it('does NOT flag titles that merely mention the word repealed mid-string', () => {
    expect(isRepealedTitle('Provisions affecting the repealed sections of …')).toBe(false);
  });
  it('handles empty / null defensively', () => {
    expect(isRepealedTitle('')).toBe(false);
    expect(isRepealedTitle(null)).toBe(false);
    expect(isRepealedTitle(undefined)).toBe(false);
  });
  it('is case-insensitive on the leading verb', () => {
    expect(isRepealedTitle('REPEALED. 1990, Act 1')).toBe(true);
    expect(isRepealedTitle('repealed. 1990, Act 1')).toBe(true);
  });
});

describe('parseChapter750 (real fixture)', () => {
  let sections;

  beforeAll(() => {
    sections = parseChapter750(FIXTURE_TEXT);
  });

  it('parses at least 5 sections from fixture', () => {
    expect(sections.length).toBeGreaterThanOrEqual(5);
  });

  it('first section is § 1', () => {
    expect(sections[0].sectionNum).toBe('1');
  });

  it('§ 1 title contains "short title"', () => {
    expect(sections[0].title.toLowerCase()).toContain('short title');
  });

  it('§ 1 body mentions "Michigan Penal Code"', () => {
    expect(sections[0].body).toContain('Michigan Penal Code');
  });

  it('parses an alpha-suffix section (§ 10a)', () => {
    const sec10a = sections.find((s) => s.sectionNum === '10a');
    expect(sec10a).toBeDefined();
    expect(sec10a.title.toLowerCase()).toContain('sexually delinquent');
  });

  it('parses § 316 (First degree murder)', () => {
    const sec316 = sections.find((s) => s.sectionNum === '316');
    expect(sec316).toBeDefined();
    expect(sec316.title.toLowerCase()).toContain('first degree murder');
  });

  it('preserves a repealed section header (filtering happens at seeder level)', () => {
    const sec14 = sections.find((s) => s.sectionNum === '14');
    expect(sec14).toBeDefined();
    expect(isRepealedTitle(sec14.title)).toBe(true);
  });

  it('every parsed section has non-empty body above floor', () => {
    for (const s of sections) {
      expect(s.body.length).toBeGreaterThanOrEqual(20);
    }
  });

  it('every parsed section has a sectionNum starting with a digit', () => {
    for (const s of sections) {
      expect(s.sectionNum).toMatch(/^\d/);
    }
  });

  it('section numbers match the documented MI shape (digits + optional single lowercase letter)', () => {
    for (const s of sections) {
      expect(s.sectionNum).toMatch(/^\d{1,4}[a-z]?$/);
    }
  });

  it('body is stripped of "-- N of M --" page-break marker lines', () => {
    for (const s of sections) {
      expect(s.body).not.toMatch(/^--\s+\d+\s+of\s+\d+\s+--$/m);
    }
  });

  it('body is stripped of MI per-page footer ("Rendered ... Page N of M ... Michigan Compiled Laws ...")', () => {
    for (const s of sections) {
      expect(s.body).not.toMatch(/^Rendered\b.*Page\s+\d+\s+of\s+\d+.*Michigan Compiled Laws/m);
    }
  });

  it('body is stripped of "Courtesy of legislature.mi.gov" footer', () => {
    for (const s of sections) {
      expect(s.body).not.toMatch(/^Courtesy of legislature\.mi\.gov$/m);
    }
  });

  it('preserves "History:" line in section bodies', () => {
    const sec1 = sections.find((s) => s.sectionNum === '1');
    expect(sec1.body).toContain('History:');
  });

  it('preserves "Sec. N" in-body line (not double-matched as a header)', () => {
    const sec1 = sections.find((s) => s.sectionNum === '1');
    expect(sec1.body).toContain('Sec. 1.');
  });

  it('section regex does NOT match range-repealed lines like "750.19-750.24 Repealed."', () => {
    // Construct a synthetic range-repealed input and confirm 0 matches
    const rangeText = '750.19-750.24 Repealed. 1968, Act 39, Eff. Jan. 1, 1969.\nSome notes here long enough to pass floor xx';
    const out = parseChapter750(rangeText);
    expect(out.length).toBe(0);
  });

  it('section regex does NOT match range-repealed lines like "750.11, 750.12 Repealed."', () => {
    const rangeText = '750.11, 750.12 Repealed. 2010, Act 102, Imd. Eff. June 25, 2010.\nSome notes here long enough to pass floor xx';
    const out = parseChapter750(rangeText);
    expect(out.length).toBe(0);
  });

  it('returns sections in document order', () => {
    // First few should be § 1, § 2, then later (post-jump) § 7, § 8, § 10a, § 14, § 316
    const nums = sections.map((s) => s.sectionNum);
    expect(nums.indexOf('1')).toBeLessThan(nums.indexOf('2'));
    expect(nums.indexOf('2')).toBeLessThan(nums.indexOf('316'));
  });

  it('does not produce duplicate (sectionNum) entries within fixture', () => {
    const seen = new Set();
    for (const s of sections) {
      expect(seen.has(s.sectionNum)).toBe(false);
      seen.add(s.sectionNum);
    }
  });
});
