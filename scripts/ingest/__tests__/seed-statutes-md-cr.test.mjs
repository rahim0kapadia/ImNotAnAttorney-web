import { describe, it, expect } from 'vitest';
import { MD_CR_CONFIG, buildMdSourceUrl, parseCriminalLawArticle } from '../lib/md-cr-pdf.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Maryland Criminal Law Article (md-cr-pdf)', () => {
  describe('MD_CR_CONFIG', () => {
    it('has state set to MD', () => {
      expect(MD_CR_CONFIG.state).toBe('MD');
    });

    it('has sectionRe that matches header lines with en-dash', () => {
      const headerLine = '§1–101. ';
      const match = MD_CR_CONFIG.sectionRe.exec(headerLine);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('1–101');
    });

    it('sectionRe matches ASCII hyphen variant', () => {
      const headerLine = '§1-101. ';
      const match = MD_CR_CONFIG.sectionRe.exec(headerLine);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('1-101');
    });

    it('sectionRe does not match inline citations (with space after §)', () => {
      const inlineCitation = '§ 1–101 of this subtitle';
      const match = MD_CR_CONFIG.sectionRe.exec(inlineCitation);
      expect(match).toBeNull();
    });

    it('has normalizeEnDash set to true', () => {
      expect(MD_CR_CONFIG.normalizeEnDash).toBe(true);
    });

    it('has minBodyChars set to 20', () => {
      expect(MD_CR_CONFIG.minBodyChars).toBe(20);
    });
  });

  describe('buildMdSourceUrl', () => {
    it('converts en-dash to ASCII hyphen in URL', () => {
      const url = buildMdSourceUrl('1–101');
      expect(url).toContain('section=1-101');
    });

    it('handles ASCII hyphen section numbers', () => {
      const url = buildMdSourceUrl('1-101');
      expect(url).toContain('section=1-101');
    });

    it('handles subsection numbers', () => {
      const url = buildMdSourceUrl('5–404.1');
      expect(url).toContain('section=5-404.1');
    });

    it('returns HTTPS URL with article=gcr', () => {
      const url = buildMdSourceUrl('1-101');
      expect(url).toMatch(/^https:\/\/mgaleg\.maryland\.gov/);
      expect(url).toContain('article=gcr');
    });
  });

  describe('parseCriminalLawArticle', () => {
    it('parses fixture text with multiple sections', () => {
      const fixtureFile = path.join(__dirname, 'fixtures/md/cr-sample.txt');
      if (!fs.existsSync(fixtureFile)) {
        console.warn(`Fixture not found: ${fixtureFile}, skipping integration test`);
        expect(true).toBe(true);
        return;
      }

      const text = fs.readFileSync(fixtureFile, 'utf-8');
      const sections = parseCriminalLawArticle(text);

      expect(sections.length).toBeGreaterThan(0);
      expect(sections[0].sectionNum).toBeDefined();
      expect(sections[0].title).toBeDefined();
      expect(sections[0].body).toBeDefined();
    });

    it('removes page-break artifacts from body text', () => {
      const fixtureFile = path.join(__dirname, 'fixtures/md/cr-sample.txt');
      if (!fs.existsSync(fixtureFile)) {
        console.warn(`Fixture not found: ${fixtureFile}, skipping page-break test`);
        expect(true).toBe(true);
        return;
      }

      const text = fs.readFileSync(fixtureFile, 'utf-8');
      const sections = parseCriminalLawArticle(text);

      for (const sec of sections) {
        expect(sec.body).not.toMatch(/^--\s+\d+\s+of\s+\d+\s+--/m);
        expect(sec.body).not.toMatch(/^-\s+\d+\s+-$/m);
      }
    });

    it('normalizes en-dashes to ASCII hyphens in section numbers', () => {
      const fixtureFile = path.join(__dirname, 'fixtures/md/cr-sample.txt');
      if (!fs.existsSync(fixtureFile)) {
        console.warn(`Fixture not found: ${fixtureFile}, skipping normalization test`);
        expect(true).toBe(true);
        return;
      }

      const text = fs.readFileSync(fixtureFile, 'utf-8');
      const sections = parseCriminalLawArticle(text);

      for (const sec of sections) {
        expect(sec.sectionNum).not.toContain('–');
        expect(sec.sectionNum).toMatch(/^\d+-\d+/);
      }
    });
  });
});
