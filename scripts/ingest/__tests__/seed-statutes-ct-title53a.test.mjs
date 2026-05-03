// test-isolation-na: no Supabase writes — unit tests against real fixture HTML
//
// Tests for the CT Title 53a statute seeder using real cga.ct.gov fixtures.
// Fixtures captured live from www.cga.ct.gov on 2026-05-02.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CT_BASE_URL,
  CT_CHAPTER_BASE,
  CT_TITLE,
  CT_CHAPTERS,
  buildChapterUrl,
  buildSectionUrl,
  buildSectionDbId,
  decodeEntities,
  stripHtml,
  isRepealedSection,
  parseChapterSections,
  parseEffectiveDate,
  ctHttpsFetch,
} from '../lib/ct-cga-html.mjs';

import {
  parseCliFlags,
  buildCtConfig,
  buildSectionColumn,
  buildSectionRow,
  computeSectionHash,
  textArrayLiteral,
  StatuteRowSchema,
  collectRows,
} from '../seed-statutes-ct-title53a.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXT = path.join(__dirname, 'fixtures', 'ct');

function readFixture(name) {
  return readFileSync(path.join(FIXT, name), 'utf-8');
}

// ─── ct-cga-html.mjs: constants ─────────────────────────────────────────────

describe('ct-cga-html: constants', () => {
  it('CT_BASE_URL is HTTPS cga.ct.gov', () => {
    expect(CT_BASE_URL).toBe('https://www.cga.ct.gov');
  });
  it('CT_CHAPTER_BASE points to /current/pub', () => {
    expect(CT_CHAPTER_BASE).toBe('https://www.cga.ct.gov/current/pub');
  });
  it('CT_TITLE is "53a"', () => {
    expect(CT_TITLE).toBe('53a');
  });
  it('CT_CHAPTERS contains exactly 3 chapters: 950, 951, 952', () => {
    expect(CT_CHAPTERS.map((c) => c.num)).toEqual(['950', '951', '952']);
  });
});

// ─── URL builders ────────────────────────────────────────────────────────────

describe('ct-cga-html: buildChapterUrl', () => {
  it('builds chapter 950 URL', () => {
    expect(buildChapterUrl('950')).toBe('https://www.cga.ct.gov/current/pub/chap_950.htm');
  });
  it('builds chapter 952 URL', () => {
    expect(buildChapterUrl('952')).toBe('https://www.cga.ct.gov/current/pub/chap_952.htm');
  });
});

describe('ct-cga-html: buildSectionUrl', () => {
  it('appends #sec_53a-1 anchor', () => {
    expect(buildSectionUrl('950', '53a-1')).toBe('https://www.cga.ct.gov/current/pub/chap_950.htm#sec_53a-1');
  });
  it('handles letter suffix sections', () => {
    expect(buildSectionUrl('952', '53a-217c')).toBe('https://www.cga.ct.gov/current/pub/chap_952.htm#sec_53a-217c');
  });
});

describe('ct-cga-html: buildSectionDbId', () => {
  it('returns the bare section id', () => {
    expect(buildSectionDbId('53a-1')).toBe('53a-1');
    expect(buildSectionDbId('53a-217c')).toBe('53a-217c');
  });
});

// ─── HTML helpers ────────────────────────────────────────────────────────────

describe('ct-cga-html: decodeEntities', () => {
  it('decodes named entities', () => {
    expect(decodeEntities('A &amp; B')).toBe('A & B');
    expect(decodeEntities('Penal &#x201C;Code&#x201D;')).toBe('Penal "Code"');
  });
  it('decodes numeric entities', () => {
    expect(decodeEntities('&#167; 53a-1')).toBe('§ 53a-1');
  });
  it('strips control codepoints', () => {
    expect(decodeEntities('&#0;abc')).toBe('abc');
  });
});

describe('ct-cga-html: stripHtml', () => {
  it('strips tags and collapses whitespace', () => {
    // Tags are replaced with spaces then collapsed; "53a-1." gets a space before "."
    // because </b> -> space. This matches the IL parser convention.
    expect(stripHtml('<p>Sec. <b>53a-1</b>.   Title.</p>')).toMatch(/Sec\. 53a-1\s?\. Title\./);
  });
  it('drops scripts and styles', () => {
    expect(stripHtml('<script>x()</script>Body<style>p{}</style>')).toBe('Body');
  });
});

// ─── isRepealedSection ───────────────────────────────────────────────────────

describe('ct-cga-html: isRepealedSection', () => {
  it('detects "Section repealed"', () => {
    expect(isRepealedSection('Section repealed by P.A. 71-79.')).toBe(true);
  });
  it('detects "(Repealed by ...)"', () => {
    expect(isRepealedSection('(Repealed by P.A. 22-26, S. 4.)')).toBe(true);
  });
  it('detects "Sections 53a-50 and 53a-51 repealed"', () => {
    expect(isRepealedSection('Sections 53a-50 and 53a-51 repealed by P.A. 73-639, S. 21.')).toBe(true);
  });
  it('does NOT match arbitrary text mentioning "repealed"', () => {
    expect(isRepealedSection('A defendant convicted under this section may be repealed of nothing.')).toBe(false);
  });
});

// ─── parseEffectiveDate ──────────────────────────────────────────────────────

describe('ct-cga-html: parseEffectiveDate', () => {
  it('returns null for session-year sources', () => {
    expect(parseEffectiveDate('(1969, P.A. 828, S. 1.)')).toBeNull();
    expect(parseEffectiveDate('(P.A. 79-570, S. 5.)')).toBeNull();
  });
  it('parses explicit eff. M-D-YY', () => {
    expect(parseEffectiveDate('(P.A. 24-12, eff. 7-1-24)')).toBe('2024-07-01');
  });
});

// ─── parseChapterSections (real fixture) ─────────────────────────────────────

describe('ct-cga-html: parseChapterSections (chap_950 fixture)', () => {
  const html = readFixture('chap_950.htm');
  const sections = parseChapterSections(html, '950');

  it('parses exactly 3 sections', () => {
    expect(sections).toHaveLength(3);
  });

  it('section ids are 53a-1, 53a-2, 53a-3', () => {
    expect(sections.map((s) => s.sectionId)).toEqual(['53a-1', '53a-2', '53a-3']);
  });

  it('first section title contains "Short title"', () => {
    expect(sections[0].titleText).toMatch(/Short title/i);
  });

  it('first section body mentions "Penal Code"', () => {
    expect(sections[0].bodyText).toMatch(/Penal Code/);
  });

  it('first section sourceLine is captured', () => {
    expect(sections[0].sourceLine).toMatch(/1969/);
    expect(sections[0].sourceLine).toMatch(/P\.A\./);
  });

  it('second section body mentions "title shall apply"', () => {
    expect(sections[1].bodyText).toMatch(/title shall apply/i);
  });

  it('all sections have sectionUrl pointing to chap_950 with #anchor', () => {
    for (const s of sections) {
      expect(s.sectionUrl).toMatch(/^https:\/\/www\.cga\.ct\.gov\/current\/pub\/chap_950\.htm#sec_53a-/);
    }
  });

  it('no section is marked repealed', () => {
    for (const s of sections) expect(s.repealed).toBe(false);
  });
});

describe('ct-cga-html: parseChapterSections (chap_952 fixture, large)', () => {
  const html = readFixture('chap_952_full.htm');
  const sections = parseChapterSections(html, '952');

  it('parses >= 380 sections', () => {
    expect(sections.length).toBeGreaterThanOrEqual(380);
  });

  it('detects at least some repealed sections', () => {
    const repealed = sections.filter((s) => s.repealed);
    expect(repealed.length).toBeGreaterThan(0);
  });

  it('section 53a-54a (murder) is parsed with body text', () => {
    const murder = sections.find((s) => s.sectionId === '53a-54a');
    expect(murder).toBeDefined();
    expect(murder.bodyText.length).toBeGreaterThan(50);
  });

  it('every parsed non-repealed section has body text >= 12 chars OR is repealed', () => {
    const tooShort = sections.filter((s) => !s.repealed && (!s.bodyText || s.bodyText.length < 12));
    expect(tooShort).toHaveLength(0);
  });

  it('section ids use 53a- prefix', () => {
    for (const s of sections) {
      expect(s.sectionId).toMatch(/^53a-/);
    }
  });
});

// ─── ctHttpsFetch (TLS workaround invocation surface) ────────────────────────

describe('ctHttpsFetch: TLS workaround function exists', () => {
  it('is a function', () => {
    expect(typeof ctHttpsFetch).toBe('function');
  });
  it('returns a Promise', () => {
    // Don't actually fetch — just verify shape (avoid network in unit tests)
    const p = ctHttpsFetch('https://www.cga.ct.gov/current/pub/chap_950.htm', { timeoutMs: 1 });
    expect(p).toBeInstanceOf(Promise);
    // Swallow rejection (timeout) to avoid unhandled promise warning
    p.catch(() => {});
  });
});

// ─── seed-statutes-ct-title53a.mjs: CLI ──────────────────────────────────────

describe('seed: parseCliFlags', () => {
  it('defaults to no flags', () => {
    expect(parseCliFlags([])).toEqual({ dryRun: false, verbose: false, chapters: null, limit: null });
  });
  it('parses --dry-run', () => {
    expect(parseCliFlags(['--dry-run'])).toMatchObject({ dryRun: true });
  });
  it('parses --chapters=950,952', () => {
    expect(parseCliFlags(['--chapters=950,952'])).toMatchObject({ chapters: ['950', '952'] });
  });
  it('parses --limit=5', () => {
    expect(parseCliFlags(['--limit=5'])).toMatchObject({ limit: 5 });
  });
});

describe('seed: buildCtConfig', () => {
  it('defaults to all 3 chapters', () => {
    const c = buildCtConfig({});
    expect(c.targetChapters.map((x) => x.num)).toEqual(['950', '951', '952']);
    expect(c.stateCode).toBe('CT');
    expect(c.titleNum).toBe('53a');
    expect(c.allowedHosts).toEqual(['www.cga.ct.gov']);
  });
  it('filters by --chapters', () => {
    const c = buildCtConfig({ chapters: ['950'] });
    expect(c.targetChapters.map((x) => x.num)).toEqual(['950']);
  });
});

describe('seed: buildSectionColumn', () => {
  it('returns the bare section id (chapter prefix omitted)', () => {
    expect(buildSectionColumn('950', '53a-1')).toBe('53a-1');
    expect(buildSectionColumn('952', '53a-217c')).toBe('53a-217c');
  });
});

// ─── computeSectionHash + textArrayLiteral ───────────────────────────────────

describe('seed: computeSectionHash', () => {
  it('returns deterministic hex', () => {
    const h = computeSectionHash('Title', 'Body');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(h).toBe(computeSectionHash('Title', 'Body'));
  });
});

describe('seed: textArrayLiteral', () => {
  it('formats string array as PG text[]', () => {
    expect(textArrayLiteral(['https://example.com'])).toBe('{"https://example.com"}');
  });
  it('escapes embedded quotes and backslashes', () => {
    expect(textArrayLiteral(['a"b\\c'])).toBe('{"a\\"b\\\\c"}');
  });
  it('returns {} for empty array', () => {
    expect(textArrayLiteral([])).toBe('{}');
    expect(textArrayLiteral(null)).toBe('{}');
  });
});

// ─── buildSectionRow (validates schema) ──────────────────────────────────────

describe('seed: buildSectionRow', () => {
  const config = buildCtConfig({});

  it('builds a valid row from a parsed section', () => {
    const parsed = {
      sectionId: '53a-1',
      titleText: 'Short title: Penal Code',
      bodyText: 'This title shall be known as the "Penal Code".',
      sourceLine: '(1969, P.A. 828, S. 1.)',
      sectionUrl: 'https://www.cga.ct.gov/current/pub/chap_950.htm#sec_53a-1',
      repealed: false,
    };
    const { row, errors } = buildSectionRow(config, '950', parsed);
    expect(errors).toEqual([]);
    expect(row.jurisdiction).toBe('CT');
    expect(row.title).toBe('53a');
    expect(row.section).toBe('53a-1');
    expect(row.source_urls).toEqual([parsed.sectionUrl]);
    expect(row.text_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.is_current).toBe(true);
  });

  it('rejects repealed sections', () => {
    const parsed = {
      sectionId: '53a-50',
      titleText: 'Repealed',
      bodyText: 'Section repealed by P.A. 71-79.',
      sourceLine: null,
      sectionUrl: 'https://www.cga.ct.gov/current/pub/chap_952.htm#sec_53a-50',
      repealed: true,
    };
    const { row, errors } = buildSectionRow(config, '952', parsed);
    expect(row).toBeNull();
    expect(errors[0]).toMatch(/repealed/);
  });

  it('rejects bodyText too short', () => {
    const parsed = {
      sectionId: '53a-99',
      titleText: 'Short',
      bodyText: 'tiny',
      sourceLine: null,
      sectionUrl: 'https://www.cga.ct.gov/current/pub/chap_952.htm#sec_53a-99',
      repealed: false,
    };
    const { row, errors } = buildSectionRow(config, '952', parsed);
    expect(row).toBeNull();
    expect(errors[0]).toMatch(/too short/);
  });

  it('rejects non-HTTPS source URLs', () => {
    const parsed = {
      sectionId: '53a-1',
      titleText: 'Test',
      bodyText: 'Long enough body text here for validation purposes.',
      sourceLine: null,
      sectionUrl: 'http://www.cga.ct.gov/current/pub/chap_950.htm#sec_53a-1',
      repealed: false,
    };
    const { row, errors } = buildSectionRow(config, '950', parsed);
    expect(row).toBeNull();
    expect(errors[0]).toMatch(/allowlist|HTTPS/);
  });

  it('rejects off-allowlist hosts', () => {
    const parsed = {
      sectionId: '53a-1',
      titleText: 'Test',
      bodyText: 'Long enough body text here for validation purposes.',
      sourceLine: null,
      sectionUrl: 'https://malicious.tld/x',
      repealed: false,
    };
    const { row, errors } = buildSectionRow(config, '950', parsed);
    expect(row).toBeNull();
  });
});

// ─── StatuteRowSchema sanity ─────────────────────────────────────────────────

describe('StatuteRowSchema', () => {
  it('accepts a valid row', () => {
    const row = {
      jurisdiction: 'CT',
      title: '53a',
      section: '53a-1',
      subsection: null,
      section_text: 'Title\n\nBody text long enough to pass validation.',
      is_current: true,
      source_urls: ['https://www.cga.ct.gov/current/pub/chap_950.htm#sec_53a-1'],
      text_hash: 'a'.repeat(64),
      effective_date: null,
      scraped_at: new Date().toISOString(),
    };
    expect(StatuteRowSchema.safeParse(row).success).toBe(true);
  });
  it('rejects empty source_urls', () => {
    const row = {
      jurisdiction: 'CT',
      title: '53a',
      section: '53a-1',
      subsection: null,
      section_text: 'Title\n\nBody text long enough to pass validation.',
      is_current: true,
      source_urls: [],
      text_hash: 'a'.repeat(64),
      effective_date: null,
      scraped_at: new Date().toISOString(),
    };
    expect(StatuteRowSchema.safeParse(row).success).toBe(false);
  });
});

// ─── collectRows with mocked fetch ───────────────────────────────────────────

describe('seed: collectRows (mocked fetch via fixtures)', () => {
  it('parses chapter 950 fixture into 3 rows', async () => {
    const html950 = readFixture('chap_950.htm');
    const config = buildCtConfig({ chapters: ['950'] });
    config.crawlDelayMs = 0;
    const fetchImpl = async (url) => {
      if (url.endsWith('chap_950.htm')) return html950;
      throw new Error('unexpected url ' + url);
    };
    const { rows, errorCount, repealedCount } = await collectRows(config, { fetchImpl, verbose: false });
    expect(rows).toHaveLength(3);
    expect(errorCount).toBe(0);
    expect(repealedCount).toBe(0);
    expect(rows[0].section).toBe('53a-1');
    expect(rows[0].jurisdiction).toBe('CT');
  });

  it('respects --limit', async () => {
    const html952 = readFixture('chap_952_full.htm');
    const config = buildCtConfig({ chapters: ['952'], limit: 5 });
    config.crawlDelayMs = 0;
    const fetchImpl = async () => html952;
    const { rows } = await collectRows(config, { fetchImpl });
    expect(rows.length).toBeLessThanOrEqual(5);
  });
});
