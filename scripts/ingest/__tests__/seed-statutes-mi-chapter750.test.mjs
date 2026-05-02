// test-isolation-na: pure parser unit tests against on-disk fixture text — no DB writes.
// Template: scripts/ingest/__tests__/seed-statutes-de-title11.test.mjs
// Pattern: cl-bulk-data-defensive #19 — single full-Title PDF fixture
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseChapter750,
  buildMiSourceUrl,
  MI_CHAPTER750_PDF_URL,
  MI_CONFIG,
} from '../lib/mi-pdf.mjs';
import { MI_CHAPTER750_FLOOR, MI_ALLOWED_HOSTS } from '../seed-statutes-mi-chapter750.mjs';

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

  it('has a custom pageBreakRe that strips MI Rendered/Courtesy footers', () => {
    expect(MI_CONFIG.pageBreakRe).toBeInstanceOf(RegExp);
    // Default "-- N of M --" page markers
    expect(MI_CONFIG.pageBreakRe.test('-- 1 of 459 --')).toBe(true);
    // MI-specific Rendered footer line
    expect(
      MI_CONFIG.pageBreakRe.test(
        'Rendered Saturday, May 2, 2026 \tPage 1 of 459 \tMichigan Compiled Laws Complete Through PA 9 of 2026',
      ),
    ).toBe(true);
    // MI-specific Courtesy footer line
    expect(MI_CONFIG.pageBreakRe.test('Courtesy of legislature.mi.gov')).toBe(true);
    // Real body text must NOT match
    expect(MI_CONFIG.pageBreakRe.test('Sec. 1.')).toBe(false);
    expect(MI_CONFIG.pageBreakRe.test('History: 1931, Act 328')).toBe(false);
  });
});

describe('MI_CHAPTER750_PDF_URL', () => {
  it('is HTTPS', () => {
    expect(MI_CHAPTER750_PDF_URL).toMatch(/^https:\/\//);
  });

  it('points at legislature.mi.gov (the official Michigan Legislature host)', () => {
    expect(MI_CHAPTER750_PDF_URL).toContain('legislature.mi.gov');
  });

  it('targets the chap750 PDF', () => {
    expect(MI_CHAPTER750_PDF_URL).toContain('mcl-chap750.pdf');
  });
});

describe('buildMiSourceUrl', () => {
  it('returns the chapter-level PDF URL (no per-section anchor)', () => {
    const url = buildMiSourceUrl('750.316');
    expect(url).toBe(MI_CHAPTER750_PDF_URL);
  });

  it('returns the same URL regardless of section number', () => {
    const urls = [
      buildMiSourceUrl('750.1'),
      buildMiSourceUrl('750.316'),
      buildMiSourceUrl('750.520b'),
    ];
    expect(new Set(urls).size).toBe(1);
  });
});

describe('parseChapter750 (parser against fixture)', () => {
  let sections;

  beforeAll(() => {
    sections = parseChapter750(FIXTURE_TEXT);
  });

  it('parses at least one section from the fixture', () => {
    expect(sections.length).toBeGreaterThan(0);
  });

  it('each section has required shape', () => {
    for (const sec of sections) {
      expect(sec).toHaveProperty('sectionNum');
      expect(sec).toHaveProperty('title');
      expect(sec).toHaveProperty('body');
      expect(typeof sec.sectionNum).toBe('string');
      expect(typeof sec.title).toBe('string');
      expect(typeof sec.body).toBe('string');
    }
  });

  it('section numbers match the MI format (750.N[letter])', () => {
    for (const sec of sections) {
      expect(sec.sectionNum).toMatch(/^750\.\d+[a-z]?$/);
    }
  });

  it('sections have non-empty body text', () => {
    for (const sec of sections) {
      expect(sec.body.length).toBeGreaterThan(0);
    }
  });
});

describe('MI_ALLOWED_HOSTS', () => {
  it('contains legislature.mi.gov', () => {
    expect(MI_ALLOWED_HOSTS.has('legislature.mi.gov')).toBe(true);
  });

  it('is a Set', () => {
    expect(MI_ALLOWED_HOSTS).toBeInstanceOf(Set);
  });
});

describe('MI_CHAPTER750_FLOOR', () => {
  it('is a positive integer', () => {
    expect(typeof MI_CHAPTER750_FLOOR).toBe('number');
    expect(MI_CHAPTER750_FLOOR).toBeGreaterThan(0);
  });

  it('is at least 600 (conservative floor for ~878 live sections)', () => {
    expect(MI_CHAPTER750_FLOOR).toBeGreaterThanOrEqual(600);
  });
});

describe('MI section regex captures', () => {
  const { sectionRe } = MI_CONFIG;

  it('captures valid section headers', () => {
    const matches = [
      '750.1 Short title',
      '750.316 First degree murder',
      '750.520b Criminal sexual conduct',
      '750.81d Some section',
    ];
    for (const m of matches) {
      const match = sectionRe.exec(m);
      expect(match).not.toBeNull(`Failed to capture: ${m}`);
      expect(match[1]).toMatch(/^750\.\d+[a-z]?$/);
    }
  });

  it('rejects range headers with commas', () => {
    const ranges = [
      '750.11, 750.12 Repealed',
      '750.1, 750.2 Repealed',
    ];
    for (const r of ranges) {
      expect(sectionRe.exec(r)).toBeNull(`Should reject: ${r}`);
    }
  });

  it('rejects range headers with hyphens', () => {
    const ranges = [
      '750.19-750.24 Repealed',
      '750.1-750.5 Repealed',
    ];
    for (const r of ranges) {
      expect(sectionRe.exec(r)).toBeNull(`Should reject: ${r}`);
    }
  });
});
