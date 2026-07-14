// test-isolation-na: pure parser unit tests against on-disk fixture text — no DB writes.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseChapter,
  buildWiSourceUrl,
  buildWiChapterPdfUrl,
  buildWiSectionRe,
  buildWiConfig,
  WI_CRIMINAL_CHAPTERS,
} from '../lib/wi-criminal-pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CH940_PATH = path.join(__dirname, 'fixtures', 'wi', 'chapter-940-sample.txt');
const CH943_PATH = path.join(__dirname, 'fixtures', 'wi', 'chapter-943-sample.txt');
const CH940_TEXT = readFileSync(CH940_PATH, 'utf8');
const CH943_TEXT = readFileSync(CH943_PATH, 'utf8');

describe('WI_CRIMINAL_CHAPTERS', () => {
  it('contains the modern criminal-code cohort 939-948', () => {
    expect(WI_CRIMINAL_CHAPTERS).toEqual([
      '939', '940', '941', '942', '943',
      '944', '945', '946', '947', '948',
    ]);
  });
});

describe('buildWiChapterPdfUrl', () => {
  it('builds the canonical per-chapter PDF URL', () => {
    expect(buildWiChapterPdfUrl('940')).toBe(
      'https://docs.legis.wisconsin.gov/statutes/statutes/940.pdf',
    );
  });
  it('accepts numeric chapter input', () => {
    expect(buildWiChapterPdfUrl(943)).toBe(
      'https://docs.legis.wisconsin.gov/statutes/statutes/943.pdf',
    );
  });
  it('rejects non-numeric chapter', () => {
    expect(() => buildWiChapterPdfUrl('abc')).toThrow(/invalid chapterNum/);
  });
});

describe('buildWiSourceUrl', () => {
  it('returns the chapter PDF URL derived from the section number', () => {
    expect(buildWiSourceUrl('940.01')).toBe(buildWiChapterPdfUrl('940'));
    expect(buildWiSourceUrl('943.10')).toBe(buildWiChapterPdfUrl('943'));
  });
  it('URL is HTTPS', () => {
    expect(buildWiSourceUrl('940.01')).toMatch(/^https:\/\//);
  });
  it('URL points at docs.legis.wisconsin.gov', () => {
    expect(buildWiSourceUrl('940.01')).toContain('docs.legis.wisconsin.gov');
  });
  it('rejects malformed sectionNum', () => {
    expect(() => buildWiSourceUrl('abc.01')).toThrow(/malformed sectionNum/);
  });
});

describe('buildWiSectionRe', () => {
  it('matches a chapter-940 header line', () => {
    const re = buildWiSectionRe('940');
    const m = '940.01 First-degree intentional homicide.'.match(re);
    expect(m).not.toBeNull();
    expect(m[1]).toBe('940.01');
    expect(m[2]).toBe('First-degree intentional homicide');
  });
  it('does NOT match a different chapter header (chapter scoping)', () => {
    const re = buildWiSectionRe('940');
    const m = '943.01 Damage to property.'.match(re);
    expect(m).toBeNull();
  });
  it('does NOT match a body-text cross-reference like "see 940.01"', () => {
    const re = buildWiSectionRe('940');
    expect('see 940.01 for the offense'.match(re)).toBeNull();
  });
  it('rejects invalid chapter input', () => {
    expect(() => buildWiSectionRe('abc')).toThrow(/invalid chapterNum/);
  });
});

describe('buildWiConfig', () => {
  it('returns a config with state=WI and a sectionRe regex', () => {
    const cfg = buildWiConfig('940');
    expect(cfg.state).toBe('WI');
    expect(cfg.sectionRe).toBeInstanceOf(RegExp);
    expect(cfg.minBodyChars).toBe(30);
    expect(cfg.normalizeEnDash).toBe(false);
  });
});

describe('parseChapter — chapter 940 (real fixture)', () => {
  let sections;

  beforeAll(() => {
    sections = parseChapter(CH940_TEXT, '940');
  });

  it('parses at least 3 sections from fixture', () => {
    expect(sections.length).toBeGreaterThanOrEqual(3);
  });

  it('first section is 940.01 (First-degree intentional homicide)', () => {
    expect(sections[0].sectionNum).toBe('940.01');
    expect(sections[0].title).toContain('First-degree intentional homicide');
  });

  it('second section is 940.02 (First-degree reckless homicide)', () => {
    expect(sections[1].sectionNum).toBe('940.02');
    expect(sections[1].title).toContain('First-degree reckless homicide');
  });

  it('every parsed section has non-empty body', () => {
    for (const s of sections) {
      expect(s.body.length).toBeGreaterThanOrEqual(30);
    }
  });

  it('every parsed section has a 940.* sectionNum', () => {
    for (const s of sections) {
      expect(s.sectionNum).toMatch(/^940\./);
    }
  });

  it('preserves History footer in body', () => {
    const sec01 = sections.find((s) => s.sectionNum === '940.01');
    expect(sec01).toBeDefined();
    expect(sec01.body).toContain('History:');
  });

  it('strips page-break artifact lines from body', () => {
    for (const s of sections) {
      expect(s.body).not.toMatch(/^--\s+\d+\s+of\s+\d+\s+--$/m);
    }
  });
});

describe('parseChapter — chapter 943 (cross-chapter regex isolation)', () => {
  let sections;

  beforeAll(() => {
    sections = parseChapter(CH943_TEXT, '943');
  });

  it('parses at least 3 sections from fixture', () => {
    expect(sections.length).toBeGreaterThanOrEqual(3);
  });

  it('first section is 943.01 (Damage to property)', () => {
    expect(sections[0].sectionNum).toBe('943.01');
    expect(sections[0].title).toContain('Damage to property');
  });

  it('every parsed section has a 943.* sectionNum (no chapter bleed)', () => {
    for (const s of sections) {
      expect(s.sectionNum).toMatch(/^943\./);
    }
  });

  it('parsing the 943 fixture with chapter=940 returns zero sections (regex scoping)', () => {
    const wrong = parseChapter(CH943_TEXT, '940');
    expect(wrong.length).toBe(0);
  });
});
