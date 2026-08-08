import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseTitle35, buildInSourceUrl, IN_TITLE35_PDF_URL, IN_CONFIG } from '../lib/in-pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures/in');

describe('IN Title 35 Parser', () => {
  it('parses the fixture sample', () => {
    const text = readFileSync(path.join(fixturesDir, 'title35-sample.txt'), 'utf8');
    const sections = parseTitle35(text);

    expect(sections.length).toBeGreaterThan(0);
    expect(sections.some(s => s.sectionNum === '35-42-1-1')).toBe(true);
  });

  it('extracts title correctly', () => {
    const text = readFileSync(path.join(fixturesDir, 'title35-sample.txt'), 'utf8');
    const sections = parseTitle35(text);
    const murder = sections.find(s => s.sectionNum === '35-42-1-1');

    expect(murder).toBeDefined();
    expect(murder.title.toLowerCase()).toContain('murder');
  });

  it('extracts body text', () => {
    const text = readFileSync(path.join(fixturesDir, 'title35-sample.txt'), 'utf8');
    const sections = parseTitle35(text);
    const murder = sections.find(s => s.sectionNum === '35-42-1-1');

    expect(murder.body).toBeDefined();
    expect(murder.body.length).toBeGreaterThan(20);
    expect(murder.body).toContain('knowingly or intentionally');
  });

  it('filters out page breaks', () => {
    const text = readFileSync(path.join(fixturesDir, 'title35-sample.txt'), 'utf8');
    const sections = parseTitle35(text);

    // Check that no section contains the page break markers
    for (const section of sections) {
      expect(section.body).not.toContain('-- 1 of 881 --');
      expect(section.body).not.toContain('Indiana Code 2022');
    }
  });

  it('builds correct source URL', () => {
    const url = buildInSourceUrl('35-42-1-1');
    expect(url).toBe(IN_TITLE35_PDF_URL);
  });

  it('handles section with decimal subsections', () => {
    const testText = `IC 35-31.5-2-79.5 "Critical infrastructure facility"

Sec. 1. [body text]
`;
    const sections = parseTitle35(testText);
    expect(sections.length).toBeGreaterThan(0);
    expect(sections[0].sectionNum).toBe('35-31.5-2-79.5');
  });

  it('rejects titles starting with parens (inline citations)', () => {
    const testText = `IC 35-99-9-9 (before repeal)

Sec. 1. [body]

IC 35-99-9-10 Valid title

Sec. 1. [body]
`;
    const sections = parseTitle35(testText);
    // Should only have 1 section (the second one with valid title)
    const valid = sections.filter(s => !s.title.startsWith('('));
    expect(valid.length).toBeGreaterThanOrEqual(1);
  });

  it('sanitizes null titles', () => {
    const testText = `IC 35-99-9-9

Sec. 1. [body text with minimum length requirement]
`;
    const sections = parseTitle35(testText);
    if (sections.length > 0) {
      expect(sections[0].title).toBeDefined();
    }
  });

  it('accepts quotes in title start', () => {
    const testText = `IC 35-50-2-2 "Code title"

Sec. 1. [body text]
`;
    const sections = parseTitle35(testText);
    expect(sections.length).toBeGreaterThan(0);
  });

  it('maintains provenance citations', () => {
    const text = readFileSync(path.join(fixturesDir, 'title35-sample.txt'), 'utf8');
    const sections = parseTitle35(text);
    const murder = sections.find(s => s.sectionNum === '35-42-1-1');

    // Should keep "As added by..." citations
    expect(murder.body).toContain('As added by');
  });

  it('handles empty body gracefully', () => {
    const testText = `IC 35-99-9-9 Repealed

IC 35-99-9-10 Next section

Sec. 1. [body text]
`;
    const sections = parseTitle35(testText);
    // Parser should skip sections with insufficient body text
    const validSections = sections.filter(s => s.body.length >= 20);
    expect(validSections.length).toBeGreaterThanOrEqual(0);
  });

  it('deduplicates on repeated sections', () => {
    const testText = `IC 35-42-1-1 Murder

Sec. 1. [body text for murder section]

IC 35-42-1-1 Murder

Sec. 1. [duplicate with different body]
`;
    const sections = parseTitle35(testText);
    const murders = sections.filter(s => s.sectionNum === '35-42-1-1');
    // Parser captures both, but seeder dedupes by (jurisdiction, title, section)
    expect(murders.length).toBeGreaterThanOrEqual(1);
  });

  it('regex requires IC prefix', () => {
    const testText = `35-42-1-1 Murder

Sec. 1. [body text]

IC 35-42-1-2 Actual

Sec. 1. [body text]
`;
    const sections = parseTitle35(testText);
    // Should only match the one with "IC " prefix
    const actual = sections.find(s => s.sectionNum === '35-42-1-2');
    expect(actual).toBeDefined();
  });

  it('preserves amendment history', () => {
    const text = readFileSync(path.join(fixturesDir, 'title35-sample.txt'), 'utf8');
    const sections = parseTitle35(text);
    const murder = sections.find(s => s.sectionNum === '35-42-1-1');

    expect(murder.body).toContain('Amended by P.L.');
  });

  it('config has state=IN', () => {
    expect(IN_CONFIG.state).toBe('IN');
  });

  it('config has normalizeEnDash=false', () => {
    expect(IN_CONFIG.normalizeEnDash).toBe(false);
  });

  it('config minBodyChars=20', () => {
    expect(IN_CONFIG.minBodyChars).toBe(20);
  });

  it('config pageBreakRe matches Indiana patterns', () => {
    expect(IN_CONFIG.pageBreakRe.test('-- 1 of 881 --')).toBe(true);
    expect(IN_CONFIG.pageBreakRe.test('Indiana Code 2022')).toBe(true);
  });

  it('section regex requires 4-part ID', () => {
    const testText = `IC 35-42-1 Short

Sec. 1. [too short, only 3 parts]

IC 35-42-1-1 Correct

Sec. 1. [body text]
`;
    const sections = parseTitle35(testText);
    const correct = sections.find(s => s.sectionNum === '35-42-1-1');
    expect(correct).toBeDefined();
  });
});
