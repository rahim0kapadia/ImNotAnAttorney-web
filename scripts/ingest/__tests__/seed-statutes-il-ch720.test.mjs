// test-isolation-na: no Supabase writes — unit tests against real fixture HTML
//
// Tests for the IL Chapter 720 statute seeder using real ilga.gov fixtures.
// Fixtures captured live from www.ilga.gov on 2026-05-01.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IL_ACTS,
  IL_STATIC_BASE,
  buildStaticUrl,
  buildSectionDbId,
  decodeEntities,
  stripHtml,
  isSectionNotFound,
  parseSection,
} from '../lib/il-html.mjs';
import {
  isAllowedSourceUrl,
  computeSectionHash,
  buildSectionRow,
  textArrayLiteral,
  fetchWithRetry,
  _resetBreakerForTests,
} from '../../lib/justia-harness.mjs';
import {
  parseCliFlags,
  buildIlConfig,
  buildSectionColumn,
  collectRows,
} from '../seed-statutes-il-ch720.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXT = path.join(__dirname, 'fixtures', 'il');

function readFixture(name) {
  return readFileSync(path.join(FIXT, name), 'utf-8');
}

// ─── il-html.mjs: constants ──────────────────────────────────────────────────

describe('il-html: IL_STATIC_BASE', () => {
  it('points to HTTPS www.ilga.gov static path', () => {
    expect(IL_STATIC_BASE).toMatch(/^https:\/\/www\.ilga\.gov\/documents\/legislation\/ilcs\/documents/);
  });
});

describe('il-html: IL_ACTS structure', () => {
  it('contains exactly 3 acts', () => {
    expect(IL_ACTS).toHaveLength(3);
  });
  it('act codes are 5, 570, 646', () => {
    expect(IL_ACTS.map((a) => a.actCode)).toEqual(['5', '570', '646']);
  });
  it('act 5 has >=150 sections', () => {
    const act5 = IL_ACTS.find((a) => a.actCode === '5');
    expect(act5.sections.length).toBeGreaterThanOrEqual(150);
  });
  it('act 570 sections include 401 and 402', () => {
    const act570 = IL_ACTS.find((a) => a.actCode === '570');
    expect(act570.sections).toContain('401');
    expect(act570.sections).toContain('402');
  });
  it('act 646 has 15 sections', () => {
    const act646 = IL_ACTS.find((a) => a.actCode === '646');
    expect(act646.sections).toHaveLength(15);
  });
  it('act 5 sections include 9-1 (first degree murder)', () => {
    const act5 = IL_ACTS.find((a) => a.actCode === '5');
    expect(act5.sections).toContain('9-1');
  });
  it('act 5 sections include 9-1.2 (intentional homicide of unborn child)', () => {
    const act5 = IL_ACTS.find((a) => a.actCode === '5');
    expect(act5.sections).toContain('9-1.2');
  });
  it('act 5 sections include 24-1 (unlawful use of weapons)', () => {
    const act5 = IL_ACTS.find((a) => a.actCode === '5');
    expect(act5.sections).toContain('24-1');
  });
  it('each act has non-empty docPrefix', () => {
    for (const act of IL_ACTS) {
      expect(act.docPrefix).toMatch(/^\d{9}$/);
    }
  });
});

// ─── il-html.mjs: URL builders ───────────────────────────────────────────────

describe('il-html: buildStaticUrl', () => {
  it('builds URL for 720 ILCS 5/9-1', () => {
    const url = buildStaticUrl('072000050', '9-1');
    expect(url).toBe('https://www.ilga.gov/documents/legislation/ilcs/documents/072000050K9-1.htm');
  });
  it('builds URL for 720 ILCS 570/401', () => {
    const url = buildStaticUrl('072005700', '401');
    expect(url).toBe('https://www.ilga.gov/documents/legislation/ilcs/documents/072005700K401.htm');
  });
  it('builds URL for decimal section 12-3.05', () => {
    const url = buildStaticUrl('072000050', '12-3.05');
    expect(url).toBe('https://www.ilga.gov/documents/legislation/ilcs/documents/072000050K12-3.05.htm');
  });
  it('is always HTTPS www.ilga.gov', () => {
    const url = buildStaticUrl('072006460', '5');
    expect(url).toMatch(/^https:\/\/www\.ilga\.gov\//);
  });
});

describe('il-html: buildSectionDbId', () => {
  it('formats IL-actCode-sectionId', () => {
    expect(buildSectionDbId('5', '9-1')).toBe('IL-5-9-1');
    expect(buildSectionDbId('570', '401')).toBe('IL-570-401');
  });
});

// ─── il-html.mjs: HTML helpers ───────────────────────────────────────────────

describe('il-html: decodeEntities', () => {
  it('decodes basic HTML entities', () => {
    expect(decodeEntities('A &amp; B')).toBe('A & B');
    expect(decodeEntities('&lt;tag&gt;')).toBe('<tag>');
    expect(decodeEntities('it&#39;s')).toBe("it's");
    expect(decodeEntities('&nbsp;')).toBe(' ');
  });
  it('decodes section sign variants', () => {
    expect(decodeEntities('&sect;')).toBe('§');
    expect(decodeEntities('&#xa7;')).toBe('§');
    expect(decodeEntities('&#167;')).toBe('§');
  });
  it('drops C0 control chars', () => {
    expect(decodeEntities('a&#0;b')).toBe('ab');
    expect(decodeEntities('a&#7;b')).toBe('ab');
  });
  it('passes through surrogate-code-point entities as empty', () => {
    expect(decodeEntities('&#xD800;')).toBe('');
  });
});

describe('il-html: stripHtml', () => {
  it('strips tags and collapses whitespace', () => {
    expect(stripHtml('<p>hello <b>world</b></p>')).toBe('hello world');
  });
  it('drops script and style blocks', () => {
    expect(stripHtml('a<script>evil()</script>b')).toBe('a b');
    expect(stripHtml('a<style>.x{color:red}</style>b')).toBe('a b');
  });
  it('returns empty string for null/empty input', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null)).toBe('');
  });
  it('drops C0 control chars except whitespace', () => {
    expect(stripHtml('a\x00b\x07c')).toBe('abc');
  });
  it('converts <br> to space (then collapses)', () => {
    expect(stripHtml('foo<br>bar')).toBe('foo bar');
  });
});

// ─── il-html.mjs: isSectionNotFound ─────────────────────────────────────────

describe('il-html: isSectionNotFound', () => {
  it('returns true for empty string', () => {
    expect(isSectionNotFound('')).toBe(true);
  });
  it('returns true for short string', () => {
    expect(isSectionNotFound('<html></html>')).toBe(true);
  });
  it('returns true for error page (no Courier New)', () => {
    const html = '<html><body><h1>Error</h1><p>Page not found</p></body></html>';
    // Pad to 200+ bytes
    expect(isSectionNotFound(html.padEnd(300, ' '))).toBe(true);
  });
  it('returns false for valid section page (has Courier New)', () => {
    const html = readFixture('il-static-9-1.htm');
    expect(isSectionNotFound(html)).toBe(false);
  });
});

// ─── il-html.mjs: parseSection against real fixtures ────────────────────────

describe('il-html: parseSection (720 ILCS 5/9-1 — First degree murder)', () => {
  let html;
  let out;
  beforeAll(() => {
    html = readFixture('il-static-9-1.htm');
    out = parseSection(html, { sectionId: '9-1', sectionUrl: 'https://www.ilga.gov/documents/legislation/ilcs/documents/072000050K9-1.htm' });
  });

  it('returns non-null result', () => {
    expect(out).not.toBeNull();
  });
  it('titleText contains "murder" (case-insensitive)', () => {
    expect(out.titleText.toLowerCase()).toContain('murder');
  });
  it('bodyText has meaningful content', () => {
    expect(out.bodyText.length).toBeGreaterThan(100);
  });
  it('bodyText contains "without lawful justification"', () => {
    expect(out.bodyText.toLowerCase()).toContain('without lawful justification');
  });
  it('effectiveDate is ISO-formatted (2024 amendment)', () => {
    // Source: P.A. 103-51, eff. 1-1-24; 103-605, eff. 7-1-24.
    expect(out.effectiveDate).toMatch(/^20\d{2}-\d{2}-\d{2}$/);
  });
  it('bodyText does NOT contain "(720 ILCS" citation marker', () => {
    expect(out.bodyText).not.toContain('(720 ILCS');
  });
  it('bodyText does NOT contain "(from Ch."', () => {
    expect(out.bodyText).not.toContain('(from Ch.');
  });
  it('bodyText does NOT contain "(Source:"', () => {
    expect(out.bodyText).not.toContain('(Source:');
  });
});

describe('il-html: parseSection (720 ILCS 570/401 — drug manufacture/delivery)', () => {
  let html;
  let out;
  beforeAll(() => {
    html = readFixture('il-static-570-401.htm');
    out = parseSection(html, { sectionId: '401', sectionUrl: 'https://www.ilga.gov/documents/legislation/ilcs/documents/072005700K401.htm' });
  });

  it('returns non-null result', () => {
    expect(out).not.toBeNull();
  });
  it('titleText is non-empty', () => {
    expect(out.titleText.length).toBeGreaterThan(0);
  });
  it('bodyText is substantial (CSA 570/401 is a long section)', () => {
    expect(out.bodyText.length).toBeGreaterThan(500);
  });
  it('effectiveDate is ISO-formatted or null', () => {
    if (out.effectiveDate !== null) {
      expect(out.effectiveDate).toMatch(/^20\d{2}-\d{2}-\d{2}$/);
    }
  });
});

describe('il-html: parseSection — invalid inputs', () => {
  it('returns null for empty input', () => {
    expect(parseSection('', { sectionId: '', sectionUrl: '' })).toBeNull();
  });
  it('returns null for error-page HTML (no Courier New)', () => {
    const errorHtml = '<html><body><h1>Error</h1><p>'.padEnd(300, 'x') + '</p></body></html>';
    expect(parseSection(errorHtml, { sectionId: '', sectionUrl: '' })).toBeNull();
  });
});

// ─── justia-harness.mjs: IL allowlist ───────────────────────────────────────

describe('justia-harness: isAllowedSourceUrl (IL allowlist)', () => {
  const allowed = new Set(['www.ilga.gov']);
  it('accepts HTTPS www.ilga.gov', () => {
    expect(isAllowedSourceUrl('https://www.ilga.gov/documents/legislation/ilcs/documents/072000050K9-1.htm', allowed)).toBe(true);
  });
  it('rejects HTTP', () => {
    expect(isAllowedSourceUrl('http://www.ilga.gov/foo', allowed)).toBe(false);
  });
  it('rejects a different host', () => {
    expect(isAllowedSourceUrl('https://ilga.gov/foo', allowed)).toBe(false);
  });
  it('rejects non-allowlisted host', () => {
    expect(isAllowedSourceUrl('https://evil.tld/foo', allowed)).toBe(false);
  });
});

// ─── justia-harness.mjs: buildSectionRow (IL) ───────────────────────────────

describe('justia-harness: buildSectionRow (IL)', () => {
  const cfg = {
    stateCode: 'IL',
    titleNum: '720',
    allowedHosts: ['www.ilga.gov'],
  };

  it('builds a valid row for 5/9-1', () => {
    const url = 'https://www.ilga.gov/documents/legislation/ilcs/documents/072000050K9-1.htm';
    const { row, errors } = buildSectionRow(cfg, '5/9-1', url, {
      titleText: 'First degree murder',
      bodyText: 'A person who kills an individual without lawful justification commits first degree murder.',
      effectiveDate: '2024-01-01',
    });
    expect(errors).toEqual([]);
    expect(row.jurisdiction).toBe('IL');
    expect(row.title).toBe('720');
    expect(row.section).toBe('5/9-1');
    expect(row.source_urls[0]).toBe(url);
    expect(row.text_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.section_text).toContain('First degree murder');
    expect(row.section_text).toContain('without lawful justification');
    expect(row.effective_date).toBe('2024-01-01');
  });

  it('rejects empty bodyText', () => {
    const url = 'https://www.ilga.gov/documents/legislation/ilcs/documents/072000050K9-1.htm';
    const { row, errors } = buildSectionRow(cfg, '5/9-1', url, { titleText: 'x', bodyText: '' });
    expect(row).toBeNull();
    expect(errors[0]).toMatch(/bodyText/);
  });

  it('rejects URL not on allowlist', () => {
    const { row, errors } = buildSectionRow(cfg, '5/9-1', 'https://evil.tld/foo', {
      titleText: 'a', bodyText: 'b'.repeat(50),
    });
    expect(row).toBeNull();
    expect(errors[0]).toMatch(/allowlist/);
  });
});

// ─── harness: fetchWithRetry (mocked, IL host) ───────────────────────────────

describe('justia-harness: fetchWithRetry (IL mocked)', () => {
  beforeAll(() => _resetBreakerForTests());

  it('returns body on 200 OK from www.ilga.gov', async () => {
    const fakeFetch = async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'ok-body' });
    const out = await fetchWithRetry('https://www.ilga.gov/documents/legislation/ilcs/documents/072000050K9-1.htm', {
      allowedHosts: ['www.ilga.gov'],
      crawlDelayMs: 0,
      fetchImpl: fakeFetch,
    });
    expect(out).toBe('ok-body');
  });

  it('throws fast on 404', async () => {
    const fakeFetch = async () => ({ ok: false, status: 404, statusText: 'Not Found', text: async () => '' });
    await expect(fetchWithRetry('https://www.ilga.gov/documents/legislation/ilcs/documents/072000050K9-BOGUS.htm', {
      allowedHosts: ['www.ilga.gov'],
      crawlDelayMs: 0,
      fetchImpl: fakeFetch,
    })).rejects.toThrow(/HTTP 404/);
  });

  it('rejects www.ilga.gov (no www) — not on allowlist', async () => {
    let called = false;
    const fakeFetch = async () => { called = true; return { ok: true, status: 200, text: async () => '' }; };
    await expect(fetchWithRetry('https://ilga.gov/foo', {
      allowedHosts: ['www.ilga.gov'],
      crawlDelayMs: 0,
      fetchImpl: fakeFetch,
    })).rejects.toThrow(/allowlist/);
    expect(called).toBe(false);
  });
});

// ─── seed-statutes-il-ch720.mjs: CLI / config ───────────────────────────────

describe('seed-statutes-il-ch720: parseCliFlags', () => {
  it('parses --dry-run', () => {
    expect(parseCliFlags(['--dry-run'])).toEqual({
      dryRun: true, verbose: false, acts: null, maxSections: null,
    });
  });
  it('parses --acts and --max-sections', () => {
    expect(parseCliFlags(['--acts=5,570', '--max-sections=10'])).toEqual({
      dryRun: false, verbose: false, acts: ['5', '570'], maxSections: 10,
    });
  });
  it('parses --verbose', () => {
    expect(parseCliFlags(['--verbose'])).toMatchObject({ verbose: true });
  });
});

describe('seed-statutes-il-ch720: buildIlConfig', () => {
  it('defaults to all 3 acts', () => {
    const cfg = buildIlConfig({});
    expect(cfg.targetActs).toHaveLength(3);
    expect(cfg.stateCode).toBe('IL');
    expect(cfg.titleNum).toBe('720');
    expect(cfg.allowedHosts).toEqual(['www.ilga.gov']);
  });
  it('honors act sub-selection', () => {
    const cfg = buildIlConfig({ acts: ['5', '570'] });
    expect(cfg.targetActs).toHaveLength(2);
    expect(cfg.targetActs.map((a) => a.actCode)).toEqual(['5', '570']);
  });
  it('single act selection', () => {
    const cfg = buildIlConfig({ acts: ['646'] });
    expect(cfg.targetActs).toHaveLength(1);
    expect(cfg.targetActs[0].actCode).toBe('646');
  });
  it('sets maxSections when provided', () => {
    const cfg = buildIlConfig({ maxSections: 5 });
    expect(cfg.maxSections).toBe(5);
  });
  it('has crawlDelayMs of 1500', () => {
    expect(buildIlConfig({}).crawlDelayMs).toBe(1500);
  });
});

describe('seed-statutes-il-ch720: buildSectionColumn', () => {
  it('formats actCode/sectionId', () => {
    expect(buildSectionColumn('5', '9-1')).toBe('5/9-1');
    expect(buildSectionColumn('570', '401')).toBe('570/401');
    expect(buildSectionColumn('646', '25')).toBe('646/25');
  });
});

// ─── collectRows — integration with mocked fetch ─────────────────────────────

describe('seed-statutes-il-ch720: collectRows (real fixtures, mocked fetch)', () => {
  beforeAll(() => _resetBreakerForTests());

  it('collects rows for act 5 sections 9-1 and 9-2 from fixtures', async () => {
    const sec91Html = readFixture('il-static-9-1.htm');
    // For sections where we don't have a fixture, return a not-found-like response.
    // 9-1 is at index ~73 in act 5's section list; use crawlDelayMs:0 + maxSections:80
    // to reach it without network delay.
    const fakeFetch = async (url) => {
      if (url.includes('072000050K9-1.htm')) return { ok: true, status: 200, text: async () => sec91Html };
      // Return 404 for other sections so they are skipped cleanly
      return { ok: false, status: 404, statusText: 'Not Found', text: async () => '' };
    };

    const cfg = buildIlConfig({ acts: ['5'], maxSections: 80 });
    cfg.crawlDelayMs = 0; // eliminate delay for unit tests
    const { rows, skipCount, errorCount } = await collectRows(cfg, {
      verbose: false,
      fetchImpl: fakeFetch,
    });

    // At minimum we should get the 9-1 row (404s are graceful skips)
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // The 9-1 row should parse correctly
    const row91 = rows.find((r) => r.section === '5/9-1');
    expect(row91).toBeDefined();
    expect(row91.jurisdiction).toBe('IL');
    expect(row91.title).toBe('720');
    expect(row91.section).toBe('5/9-1');
    expect(row91.source_urls[0]).toContain('072000050K9-1.htm');
    expect(row91.text_hash).toMatch(/^[a-f0-9]{64}$/);
    // 404 sections become skips, not errors
    expect(errorCount).toBe(0);
  }, 30_000);

  it('respects maxSections cap', async () => {
    const sec91Html = readFixture('il-static-9-1.htm');
    const fakeFetch = async () => ({ ok: true, status: 200, text: async () => sec91Html });

    const cfg = buildIlConfig({ acts: ['5'], maxSections: 2 });
    const { rows } = await collectRows(cfg, { verbose: false, fetchImpl: fakeFetch });
    expect(rows.length).toBeLessThanOrEqual(2);
  }, 30_000);

  it('handles act 570 sections with CSA fixture', async () => {
    const sec401Html = readFixture('il-static-570-401.htm');
    // 401 is at index 12 in act 570's section list; use crawlDelayMs:0 + maxSections:15
    // so we reach it without any network delay.
    const fakeFetch = async (url) => {
      if (url.includes('072005700K401.htm')) return { ok: true, status: 200, text: async () => sec401Html };
      return { ok: false, status: 404, statusText: 'Not Found', text: async () => '' };
    };

    const cfg = buildIlConfig({ acts: ['570'], maxSections: 15 });
    cfg.crawlDelayMs = 0; // eliminate delay for unit tests
    const { rows } = await collectRows(cfg, { verbose: false, fetchImpl: fakeFetch });

    const row401 = rows.find((r) => r.section === '570/401');
    expect(row401).toBeDefined();
    expect(row401.jurisdiction).toBe('IL');
    expect(row401.title).toBe('720');
    expect(row401.source_urls[0]).toContain('072005700K401.htm');
    expect(row401.section_text.length).toBeGreaterThan(200);
  }, 30_000);
});

// ─── harness primitives (shared, quick) ─────────────────────────────────────

describe('justia-harness: computeSectionHash', () => {
  it('produces 64-char hex SHA-256', () => {
    expect(computeSectionHash('A', 'B')).toMatch(/^[a-f0-9]{64}$/);
  });
  it('is deterministic', () => {
    expect(computeSectionHash('foo', 'bar')).toBe(computeSectionHash('foo', 'bar'));
  });
  it('differs on different inputs', () => {
    expect(computeSectionHash('A', 'B')).not.toBe(computeSectionHash('A', 'C'));
  });
});

describe('justia-harness: textArrayLiteral', () => {
  it('handles simple array', () => {
    expect(textArrayLiteral(['https://www.ilga.gov/x'])).toBe('{"https://www.ilga.gov/x"}');
  });
  it('handles empty array', () => {
    expect(textArrayLiteral([])).toBe('{}');
    expect(textArrayLiteral(null)).toBe('{}');
  });
  it('escapes embedded quotes', () => {
    expect(textArrayLiteral(['a"b'])).toBe('{"a\\"b"}');
  });
});
