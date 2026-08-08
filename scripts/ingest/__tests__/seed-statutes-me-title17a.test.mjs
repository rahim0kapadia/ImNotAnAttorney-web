// test-isolation-na: pure parser unit tests against on-disk fixture text — no DB writes.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseTitle17A,
  buildMeSourceUrl,
  ME_TITLE17A_PDF_URL,
  ME_CONFIG,
} from '../lib/me-title17a-pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'me', 'title17a-sample.txt');
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, 'utf8');

describe('ME_CONFIG', () => {
  it('has ME state code', () => {
    expect(ME_CONFIG.state).toBe('ME');
  });
  it('has a sectionRe regex', () => {
    expect(ME_CONFIG.sectionRe).toBeInstanceOf(RegExp);
  });
  it('normalizeEnDash is true (en-dash variants observed in ME source)', () => {
    expect(ME_CONFIG.normalizeEnDash).toBe(true);
  });
});

describe('buildMeSourceUrl', () => {
  it('returns the title-level PDF URL for any section', () => {
    expect(buildMeSourceUrl('1')).toBe(ME_TITLE17A_PDF_URL);
    expect(buildMeSourceUrl('4-A')).toBe(ME_TITLE17A_PDF_URL);
  });

  it('URL is HTTPS', () => {
    expect(buildMeSourceUrl('1')).toMatch(/^https:\/\//);
  });

  it('URL points at legislature.maine.gov', () => {
    expect(buildMeSourceUrl('1')).toContain('legislature.maine.gov');
  });
});

describe('parseTitle17A (real fixture)', () => {
  let sections;

  beforeAll(() => {
    sections = parseTitle17A(FIXTURE_TEXT);
  });

  it('parses at least 2 sections from fixture', () => {
    expect(sections.length).toBeGreaterThanOrEqual(2);
  });

  it('first section is § 1', () => {
    expect(sections[0].sectionNum).toBe('1');
  });

  it('§ 1 title contains the word Title (heading is "Title; effective date; severability")', () => {
    expect(sections[0].title).toContain('Title');
  });

  it('§ 1 body mentions Maine Criminal Code', () => {
    expect(sections[0].body).toContain('Maine Criminal Code');
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

  it('body retains [PL ...] legislative cite blocks (canonical statute history)', () => {
    // ME body text always carries cite stamps like "[PL 1975, c. 499, §1 (NEW).]"
    const hasCite = sections.some((s) => /\[PL\s+\d{4}/.test(s.body));
    expect(hasCite).toBe(true);
  });

  it('body does not retain page-header artifacts ("MRS Title 17-A. ...")', () => {
    for (const s of sections) {
      // The "MRS Title 17-A. MAINE CRIMINAL CODE" page header should not appear
      // at the start of any body — body starts with subsection text.
      expect(s.body.startsWith('MRS Title 17-A')).toBe(false);
    }
  });
});
