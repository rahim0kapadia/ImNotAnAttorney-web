// test-isolation-na: pure parser unit tests against on-disk fixture text — no DB writes.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseTitle21,
  buildOkSourceUrl,
  OK_TITLE21_PDF_URL,
  OK_CONFIG,
} from '../lib/ok-title21-pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'ok', 'title21-sample.txt');
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, 'utf8');

describe('OK_CONFIG', () => {
  it('has OK state code', () => {
    expect(OK_CONFIG.state).toBe('OK');
  });
  it('has a sectionRe regex', () => {
    expect(OK_CONFIG.sectionRe).toBeInstanceOf(RegExp);
  });
});

describe('buildOkSourceUrl', () => {
  it('returns the title-level PDF URL for any section', () => {
    expect(buildOkSourceUrl('21-1')).toBe(OK_TITLE21_PDF_URL);
    expect(buildOkSourceUrl('21-540A')).toBe(OK_TITLE21_PDF_URL);
    expect(buildOkSourceUrl('21-13.1v1')).toBe(OK_TITLE21_PDF_URL);
  });

  it('URL is HTTPS', () => {
    expect(buildOkSourceUrl('21-1')).toMatch(/^https:\/\//);
  });

  it('URL points at oklegislature.gov', () => {
    expect(buildOkSourceUrl('21-1')).toContain('oklegislature.gov');
  });
});

describe('parseTitle21 (real fixture, body slice past TOC)', () => {
  let sections;

  beforeAll(() => {
    sections = parseTitle21(FIXTURE_TEXT);
  });

  it('parses at least 4 sections from fixture', () => {
    expect(sections.length).toBeGreaterThanOrEqual(4);
  });

  it('first section is § 21-1', () => {
    expect(sections[0].sectionNum).toBe('21-1');
  });

  it('§ 21-1 title says Title of code', () => {
    expect(sections[0].title).toContain('Title of code');
  });

  it('§ 21-1 body mentions penal code of the State of Oklahoma', () => {
    expect(sections[0].body).toMatch(/penal code of the State of\s+Oklahoma/);
  });

  it('every parsed section has non-empty body', () => {
    for (const s of sections) {
      expect(s.body.length).toBeGreaterThanOrEqual(20);
    }
  });

  it('every parsed section has the OK title-prefix "21-" in sectionNum', () => {
    for (const s of sections) {
      expect(s.sectionNum).toMatch(/^21-/);
    }
  });

  it('body is stripped of page-break artifact lines', () => {
    for (const s of sections) {
      expect(s.body).not.toMatch(/^--\s+\d+\s+of\s+\d+\s+--$/m);
    }
  });

  it('preserves R.L. legislative cite stamps in body', () => {
    // OK body retains "R.L.1910, § 2082." style cites.
    const sec1 = sections.find((s) => s.sectionNum === '21-1');
    expect(sec1).toBeDefined();
    expect(sec1.body).toMatch(/R\.L\.?\s*1910/);
  });
});
