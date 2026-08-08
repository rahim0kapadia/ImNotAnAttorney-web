// test-isolation-na: pure parser unit tests against on-disk fixture text — no DB writes.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseTitle13A,
  buildAlSourceUrl,
  AL_TITLE13A_PDF_URL,
  AL_CONFIG,
} from '../lib/al-ag-pdf.mjs';
import { parseStatuteSections } from '../../lib/pdf-statute-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'al', 'title13a-sample.txt');
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, 'utf8');

describe('AL_CONFIG', () => {
  it('has AL state code', () => {
    expect(AL_CONFIG.state).toBe('AL');
  });

  it('has a sectionRe regex', () => {
    expect(AL_CONFIG.sectionRe).toBeInstanceOf(RegExp);
  });

  it('has normalizeEnDash enabled (AL section IDs use U+2013)', () => {
    expect(AL_CONFIG.normalizeEnDash).toBe(true);
  });

  it('drops bodies under 20 chars (Reserved/Repealed fragments)', () => {
    expect(AL_CONFIG.minBodyChars).toBe(20);
  });
});

describe('buildAlSourceUrl', () => {
  it('returns the AG bulk PDF URL for any section', () => {
    expect(buildAlSourceUrl('13A-1-1')).toBe(AL_TITLE13A_PDF_URL);
    expect(buildAlSourceUrl('13A-6-139.1')).toBe(AL_TITLE13A_PDF_URL);
    expect(buildAlSourceUrl('13A-12-230')).toBe(AL_TITLE13A_PDF_URL);
  });

  it('URL is HTTPS', () => {
    expect(buildAlSourceUrl('13A-1-1')).toMatch(/^https:\/\//);
  });

  it('URL points at alabamaag.gov', () => {
    expect(buildAlSourceUrl('13A-1-1')).toContain('alabamaag.gov');
  });

  it('URL points at the AG criminal-laws PDF specifically', () => {
    expect(buildAlSourceUrl('13A-1-1')).toContain('AL_CRIM_-LAWS_2024_Edition.pdf');
  });
});

describe('AL_SECTION_RE (regex shape)', () => {
  // Verify the regex shape AFTER normalizeEnDash has converted U+2013 -> ASCII hyphen.
  // The regex itself uses ASCII hyphens; en-dash forms are normalized upstream.
  const re = AL_CONFIG.sectionRe;

  it('matches simple 3-segment section ID (post-normalize)', () => {
    const m = '§ 13A-1-1. \tShort title.'.match(re);
    expect(m).not.toBeNull();
    expect(m[1]).toBe('13A-1-1');
    expect(m[2]).toBe('Short title.');
  });

  it('matches section with sub-decimal (.1)', () => {
    const m = '§ 13A-6-139.1. \tCertain offenses re killing.'.match(re);
    expect(m).not.toBeNull();
    expect(m[1]).toBe('13A-6-139.1');
  });

  it('matches section with trailing letter', () => {
    const m = '§ 13A-8-2A. \tSome provision.'.match(re);
    expect(m).not.toBeNull();
    expect(m[1]).toBe('13A-8-2A');
  });

  it('matches chapters with letter suffix (5A, 9B)', () => {
    const m = '§ 32-5A-1. \tDefinitions.'.match(re);
    expect(m).not.toBeNull();
    expect(m[1]).toBe('32-5A-1');
  });

  it('does not match without trailing period', () => {
    expect('§ 13A-1-1 Short title'.match(re)).toBeNull();
  });

  it('does not match without space between § and number', () => {
    expect('§13A-1-1. Short title.'.match(re)).toBeNull();
  });

  it('does not match TOC entries (no leading §)', () => {
    expect('Chapter 1. General Provisions, §§ 13A-1-1 through'.match(re)).toBeNull();
  });
});

describe('parseTitle13A (real fixture)', () => {
  let sections;

  beforeAll(() => {
    sections = parseTitle13A(FIXTURE_TEXT);
  });

  it('parses at least 10 sections from fixture', () => {
    // Fixture spans § 13A-1-1 through § 13A-2-4 = ~15 sections
    expect(sections.length).toBeGreaterThanOrEqual(10);
  });

  it('first section is § 13A-1-1', () => {
    expect(sections[0].sectionNum).toBe('13A-1-1');
  });

  it('§ 13A-1-1 title says Short title', () => {
    expect(sections[0].title).toContain('Short title');
  });

  it('§ 13A-1-1 body mentions Alabama Criminal Code', () => {
    expect(sections[0].body).toContain('Alabama Criminal');
  });

  it('every parsed section has non-empty body (>= 20 chars)', () => {
    for (const s of sections) {
      expect(s.body.length).toBeGreaterThanOrEqual(20);
    }
  });

  it('every parsed section starts with 13A- prefix (Title-13A filter)', () => {
    for (const s of sections) {
      expect(s.sectionNum).toMatch(/^13A-/);
    }
  });

  it('section IDs use ASCII hyphens (en-dash normalized)', () => {
    for (const s of sections) {
      expect(s.sectionNum).not.toContain('–');
    }
  });

  it('body is stripped of page-break artifact lines', () => {
    for (const s of sections) {
      expect(s.body).not.toMatch(/^--\s+\d+\s+of\s+\d+\s+--$/m);
    }
  });

  it('preserves citation footers in body', () => {
    // AL format: "(Acts 1977, No. 607, p. 812, § 101.)" — should remain.
    const sec1 = sections.find((s) => s.sectionNum === '13A-1-1');
    expect(sec1).toBeDefined();
    expect(sec1.body).toContain('Acts');
  });

  it('parses § 13A-1-2 Definitions section', () => {
    const def = sections.find((s) => s.sectionNum === '13A-1-2');
    expect(def).toBeDefined();
    expect(def.title).toContain('Definitions');
  });

  it('parses § 13A-2-1 (Chapter 2 first section, post-chapter-break)', () => {
    const sec = sections.find((s) => s.sectionNum === '13A-2-1');
    expect(sec).toBeDefined();
  });
});

describe('parseStatuteSections en-dash normalization', () => {
  it('normalizes U+2013 in input text before regex matching', () => {
    // Synthetic input with literal U+2013 between section number segments.
    const text = [
      '§ 13A–1–1. \tShort title.',
      'This is the body of the section. It is at least twenty characters long.',
      '(Acts 1977, No. 607.)',
      '§ 13A–1–2. \tDefinitions.',
      'Another body. This one is also at least twenty characters long, easily.',
    ].join('\n');
    const sections = parseStatuteSections(text, AL_CONFIG);
    expect(sections).toHaveLength(2);
    expect(sections[0].sectionNum).toBe('13A-1-1');
    expect(sections[1].sectionNum).toBe('13A-1-2');
  });
});

describe('parseStatuteSections body-min filter', () => {
  it('drops Reserved-style sections with empty body', () => {
    const text = [
      '§ 13A–12–230. \tReserved',
      '§ 13A–12–231. \tNext real section.',
      'Body of next real section, with at least twenty chars of content.',
      '(Cite.)',
    ].join('\n');
    const sections = parseStatuteSections(text, AL_CONFIG);
    expect(sections).toHaveLength(1);
    expect(sections[0].sectionNum).toBe('13A-12-231');
  });

  it('drops sections with body shorter than minBodyChars (e.g. just a date)', () => {
    const text = [
      '§ 13A–6–139.1. \tHeader.',
      'May 23, 2019.',
      '§ 13A–6–140. \tNext section.',
      'A real body of substantial length describing offense elements clearly.',
    ].join('\n');
    const sections = parseStatuteSections(text, AL_CONFIG);
    expect(sections).toHaveLength(1);
    expect(sections[0].sectionNum).toBe('13A-6-140');
  });
});

describe('Section-ID dedup contract', () => {
  // The seeder dedupes on (jurisdiction, title, section). Confirm parsed
  // section IDs are unique within Title 13A in the fixture.
  it('fixture sections are unique by sectionNum', () => {
    const sections = parseTitle13A(FIXTURE_TEXT);
    const ids = sections.map((s) => s.sectionNum);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
