// test-isolation-na: pure parser unit tests against on-disk fixture text — no DB writes.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseCriminalLawArticle,
  buildMdSourceUrl,
  MD_CR_PDF_URL,
  MD_CR_CONFIG,
} from '../lib/md-cr-pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'md', 'cr-sample.txt');
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, 'utf8');

describe('MD_CR_CONFIG', () => {
  it('has MD state code', () => {
    expect(MD_CR_CONFIG.state).toBe('MD');
  });
  it('has article code cr', () => {
    expect(MD_CR_CONFIG.article).toBe('cr');
  });
  it('has sectionRe regex', () => {
    expect(MD_CR_CONFIG.sectionRe).toBeInstanceOf(RegExp);
  });
  it('normalizes dashes', () => {
    expect(MD_CR_CONFIG.normalizeDashes).toBe(true);
  });
});

describe('buildMdSourceUrl', () => {
  it('returns the canonical Maryland statute URL for any section', () => {
    expect(buildMdSourceUrl('1-101')).toBe(
      'https://mgaleg.maryland.gov/mgawebsite/laws/StatuteText?article=gcr&section=1-101'
    );
    expect(buildMdSourceUrl('13-2628')).toBe(
      'https://mgaleg.maryland.gov/mgawebsite/laws/StatuteText?article=gcr&section=13-2628'
    );
  });

  it('URL is HTTPS', () => {
    expect(buildMdSourceUrl('1-101')).toMatch(/^https:\/\//);
  });

  it('URL points at mgaleg.maryland.gov', () => {
    expect(buildMdSourceUrl('1-101')).toContain('mgaleg.maryland.gov');
  });
});

describe('parseCriminalLawArticle (real fixture)', () => {
  let sections;

  beforeAll(() => {
    sections = parseCriminalLawArticle(FIXTURE_TEXT);
  });

  it('parses at least 3 sections from fixture', () => {
    expect(sections.length).toBeGreaterThanOrEqual(3);
  });

  it('first section is § 1-101', () => {
    expect(sections[0].sectionNum).toBe('1-101');
  });

  it('section title equals sectionNum (§ 1-101)', () => {
    expect(sections[0].title).toBe('1-101');
  });

  it('section body contains statute text', () => {
    expect(sections[0].body.length).toBeGreaterThanOrEqual(20);
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

  it('body is stripped of page-break artifact lines (-- N of 671 --)', () => {
    for (const s of sections) {
      expect(s.body).not.toMatch(/^--\s+\d+\s+of\s+\d+\s+--$/m);
    }
  });

  it('body is stripped of page-break artifact lines (- N -)', () => {
    for (const s of sections) {
      expect(s.body).not.toMatch(/^-\s+\d+\s+-$/m);
    }
  });

  it('sectionRe matches header lines with en-dash', () => {
    const line = '§1–101.'; // U+2013 en-dash
    expect(line.match(MD_CR_CONFIG.sectionRe)).toBeDefined();
  });

  it('sectionRe matches header lines with ASCII hyphen', () => {
    const line = '§1-101.';
    expect(line.match(MD_CR_CONFIG.sectionRe)).toBeDefined();
  });

  it('sectionRe rejects lines with trailing title text', () => {
    const line = '§1–101. Definitions.';
    expect(line.match(MD_CR_CONFIG.sectionRe)).toBeNull();
  });

  it('sectionRe rejects inline citations with space after §', () => {
    const line = '§ 1-101 mentioned in the statute.';
    expect(line.match(MD_CR_CONFIG.sectionRe)).toBeNull();
  });
});
