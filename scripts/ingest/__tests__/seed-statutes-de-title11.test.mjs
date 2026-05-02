// test-isolation-na: pure parser unit tests against on-disk fixture text — no DB writes.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseTitle11,
  buildDeSourceUrl,
  DE_TITLE11_PDF_URL,
  DE_CONFIG,
} from '../lib/de-title11-pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'de', 'title11-sample.txt');
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, 'utf8');

describe('DE_CONFIG', () => {
  it('has DE state code', () => {
    expect(DE_CONFIG.state).toBe('DE');
  });
  it('has a sectionRe regex', () => {
    expect(DE_CONFIG.sectionRe).toBeInstanceOf(RegExp);
  });
});

describe('buildDeSourceUrl', () => {
  it('returns the title-level PDF URL for any section', () => {
    expect(buildDeSourceUrl('101')).toBe(DE_TITLE11_PDF_URL);
    expect(buildDeSourceUrl('1448A')).toBe(DE_TITLE11_PDF_URL);
  });

  it('URL is HTTPS', () => {
    expect(buildDeSourceUrl('101')).toMatch(/^https:\/\//);
  });

  it('URL points at delcode.delaware.gov', () => {
    expect(buildDeSourceUrl('101')).toContain('delcode.delaware.gov');
  });
});

describe('parseTitle11 (real fixture)', () => {
  let sections;

  beforeAll(() => {
    sections = parseTitle11(FIXTURE_TEXT);
  });

  it('parses at least 3 sections from fixture', () => {
    expect(sections.length).toBeGreaterThanOrEqual(3);
  });

  it('first section is § 101', () => {
    expect(sections[0].sectionNum).toBe('101');
  });

  it('§ 101 title says Short title', () => {
    expect(sections[0].title).toContain('Short title');
  });

  it('§ 101 body mentions Delaware Criminal Code', () => {
    expect(sections[0].body).toContain('Delaware Criminal Code');
  });

  it('every parsed section has non-empty body', () => {
    for (const s of sections) {
      expect(s.body.length).toBeGreaterThanOrEqual(20);
    }
  });

  it('every parsed section has a numeric-prefix sectionNum', () => {
    for (const s of sections) {
      expect(s.sectionNum).toMatch(/^\d/);
    }
  });

  it('body is stripped of page-break artifact lines', () => {
    for (const s of sections) {
      // No "-- N of M --" lines should survive
      expect(s.body).not.toMatch(/^--\s+\d+\s+of\s+\d+\s+--$/m);
    }
  });

  it('preserves citation footers in body', () => {
    // DE format keeps "(11 Del. C. 1953, § ...; ...)" — those should remain.
    const sec101 = sections.find((s) => s.sectionNum === '101');
    expect(sec101).toBeDefined();
    expect(sec101.body).toContain('Del. C.');
  });
});
