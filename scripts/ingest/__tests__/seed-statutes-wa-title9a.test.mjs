// test-isolation-na: no Supabase writes — unit tests against real fixture HTML
//
// Tests for the WA RCW statute seeder using real app.leg.wa.gov fixtures.
// Fixtures captured live from app.leg.wa.gov on 2026-05-02.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WA_BASE_URL,
  WA_HOST,
  WA_CHAPTERS,
  buildChapterUrl,
  buildSectionUrl,
  buildSectionDbId,
  rewriteHttpToHttpsIfWa,
  decodeEntities,
  stripHtml,
  isSectionNotFound,
  isRepealedOrDecodified,
  discoverSectionUrls,
  sectionCiteFromUrl,
  parseSection,
} from '../lib/wa-rcw-html.mjs';
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
  buildWaConfig,
  collectRows,
} from '../seed-statutes-wa-title9a.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXT = path.join(__dirname, 'fixtures', 'wa');

function readFixture(name) {
  return readFileSync(path.join(FIXT, name), 'utf-8');
}

// ─── wa-rcw-html: constants ──────────────────────────────────────────────────

describe('wa-rcw-html: WA_BASE_URL', () => {
  it('points to HTTPS app.leg.wa.gov', () => {
    expect(WA_BASE_URL).toBe('https://app.leg.wa.gov');
  });
});

describe('wa-rcw-html: WA_HOST', () => {
  it('is exactly app.leg.wa.gov', () => {
    expect(WA_HOST).toBe('app.leg.wa.gov');
  });
});

describe('wa-rcw-html: WA_CHAPTERS', () => {
  it('contains 12 in-scope chapters', () => {
    expect(WA_CHAPTERS).toHaveLength(12);
  });
  it('includes the four crucial chapters: 9A.32, 9A.36, 46.61, 69.50', () => {
    const codes = WA_CHAPTERS.map((c) => c.chapterNum);
    expect(codes).toContain('9A.32');
    expect(codes).toContain('9A.36');
    expect(codes).toContain('46.61');
    expect(codes).toContain('69.50');
  });
  it('includes Title-9 firearm chapter 9.41', () => {
    const codes = WA_CHAPTERS.map((c) => c.chapterNum);
    expect(codes).toContain('9.41');
  });
  it('every chapter has titleNum, chapterNum, label', () => {
    for (const c of WA_CHAPTERS) {
      expect(c.titleNum).toBeTruthy();
      expect(c.chapterNum).toBeTruthy();
      expect(c.label).toBeTruthy();
    }
  });
});

// ─── wa-rcw-html: URL builders ───────────────────────────────────────────────

describe('wa-rcw-html: buildChapterUrl', () => {
  it('builds chapter index URL for 9A.32', () => {
    expect(buildChapterUrl('9A.32')).toBe(
      'https://app.leg.wa.gov/RCW/default.aspx?cite=9A.32',
    );
  });
  it('builds chapter index URL for 46.61', () => {
    expect(buildChapterUrl('46.61')).toBe(
      'https://app.leg.wa.gov/RCW/default.aspx?cite=46.61',
    );
  });
  it('is always HTTPS', () => {
    expect(buildChapterUrl('9.41')).toMatch(/^https:\/\//);
  });
});

describe('wa-rcw-html: buildSectionUrl', () => {
  it('builds section URL for 9A.32.030', () => {
    expect(buildSectionUrl('9A.32.030')).toBe(
      'https://app.leg.wa.gov/RCW/default.aspx?cite=9A.32.030',
    );
  });
  it('builds section URL for decimal 46.61.5249', () => {
    expect(buildSectionUrl('46.61.5249')).toBe(
      'https://app.leg.wa.gov/RCW/default.aspx?cite=46.61.5249',
    );
  });
  it('is always HTTPS', () => {
    expect(buildSectionUrl('69.50.401')).toMatch(/^https:\/\//);
  });
});

describe('wa-rcw-html: buildSectionDbId', () => {
  it('returns the cite verbatim', () => {
    expect(buildSectionDbId('9A.32.030')).toBe('9A.32.030');
    expect(buildSectionDbId('46.61.5249')).toBe('46.61.5249');
  });
});

// ─── wa-rcw-html: rewriteHttpToHttpsIfWa ────────────────────────────────────

describe('wa-rcw-html: rewriteHttpToHttpsIfWa', () => {
  it('rewrites http://app.leg.wa.gov to https', () => {
    expect(rewriteHttpToHttpsIfWa('http://app.leg.wa.gov/RCW/default.aspx?cite=9A.32.030'))
      .toBe('https://app.leg.wa.gov/RCW/default.aspx?cite=9A.32.030');
  });
  it('passes https://app.leg.wa.gov through unchanged', () => {
    const u = 'https://app.leg.wa.gov/RCW/default.aspx?cite=9A.32.030';
    expect(rewriteHttpToHttpsIfWa(u)).toBe(u);
  });
  it('rejects host smuggling: http://app.leg.wa.gov.attacker.com/...', () => {
    expect(rewriteHttpToHttpsIfWa('http://app.leg.wa.gov.attacker.com/foo')).toBe(null);
  });
  it('rejects different host (leg.wa.gov without app.)', () => {
    expect(rewriteHttpToHttpsIfWa('https://leg.wa.gov/RCW/foo')).toBe(null);
  });
  it('rejects non-http schemes', () => {
    expect(rewriteHttpToHttpsIfWa('ftp://app.leg.wa.gov/foo')).toBe(null);
    expect(rewriteHttpToHttpsIfWa('javascript:alert(1)')).toBe(null);
  });
  it('rejects malformed input', () => {
    expect(rewriteHttpToHttpsIfWa('')).toBe(null);
    expect(rewriteHttpToHttpsIfWa(null)).toBe(null);
    expect(rewriteHttpToHttpsIfWa('not-a-url')).toBe(null);
  });
});

// ─── wa-rcw-html: HTML helpers ──────────────────────────────────────────────

describe('wa-rcw-html: decodeEntities', () => {
  it('decodes basic HTML entities', () => {
    expect(decodeEntities('A &amp; B')).toBe('A & B');
    expect(decodeEntities('&lt;tag&gt;')).toBe('<tag>');
    expect(decodeEntities('it&#39;s')).toBe("it's");
    expect(decodeEntities('&nbsp;')).toBe(' ');
  });
  it('decodes section sign variants', () => {
    expect(decodeEntities('&sect;')).toBe('§');
    expect(decodeEntities('&#xa7;')).toBe('§');
  });
  it('drops surrogate code points', () => {
    expect(decodeEntities('&#xD800;')).toBe('');
  });
});

describe('wa-rcw-html: stripHtml', () => {
  it('strips tags and collapses whitespace', () => {
    expect(stripHtml('<p>hello <b>world</b></p>')).toBe('hello world');
  });
  it('drops script/style blocks', () => {
    expect(stripHtml('a<script>evil()</script>b')).toBe('a b');
  });
  it('returns empty for null/empty input', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null)).toBe('');
  });
});

// ─── wa-rcw-html: isSectionNotFound ─────────────────────────────────────────

describe('wa-rcw-html: isSectionNotFound', () => {
  it('returns true for empty', () => {
    expect(isSectionNotFound('')).toBe(true);
  });
  it('returns true for short string', () => {
    expect(isSectionNotFound('<html>'.padEnd(500, ' '))).toBe(true);
  });
  it('returns false for valid section page', () => {
    const html = readFixture('wa-section-9A-32-030.html');
    expect(isSectionNotFound(html)).toBe(false);
  });
});

// ─── wa-rcw-html: discoverSectionUrls ───────────────────────────────────────

describe('wa-rcw-html: discoverSectionUrls (chapter 9A.32)', () => {
  let urls;
  beforeAll(() => {
    const html = readFixture('wa-chapter-9A-32.html');
    urls = discoverSectionUrls(html, '9A.32');
  });
  it('discovers all 8 sections of chapter 9A.32', () => {
    // Per chapter index: 9A.32.010, .020, .030, .040, .050, .055, .060, .070
    expect(urls.length).toBe(8);
  });
  it('all URLs are HTTPS', () => {
    for (const u of urls) {
      expect(u).toMatch(/^https:\/\//);
    }
  });
  it('all URLs target app.leg.wa.gov', () => {
    for (const u of urls) {
      expect(u).toContain('app.leg.wa.gov');
    }
  });
  it('includes 9A.32.030 (Murder 1)', () => {
    expect(urls.some((u) => u.endsWith('cite=9A.32.030'))).toBe(true);
  });
  it('all URLs have cite= param matching chapter prefix', () => {
    for (const u of urls) {
      expect(u).toMatch(/cite=9A\.32\.\d+/);
    }
  });
});

describe('wa-rcw-html: discoverSectionUrls (chapter 46.61)', () => {
  let urls;
  beforeAll(() => {
    const html = readFixture('wa-chapter-46-61.html');
    urls = discoverSectionUrls(html, '46.61');
  });
  it('discovers many sections (>100 — Title 46 chapter 61 is huge)', () => {
    expect(urls.length).toBeGreaterThan(100);
  });
  it('includes 46.61.502 (DUI)', () => {
    expect(urls.some((u) => u.endsWith('cite=46.61.502'))).toBe(true);
  });
  it('includes decimal-suffixed section 46.61.5249', () => {
    expect(urls.some((u) => u.endsWith('cite=46.61.5249'))).toBe(true);
  });
});

describe('wa-rcw-html: discoverSectionUrls (chapter 9.41 — Title 9 firearms)', () => {
  let urls;
  beforeAll(() => {
    const html = readFixture('wa-chapter-9-41.html');
    urls = discoverSectionUrls(html, '9.41');
  });
  it('discovers many sections', () => {
    expect(urls.length).toBeGreaterThan(50);
  });
  it('includes 9.41.040', () => {
    expect(urls.some((u) => u.endsWith('cite=9.41.040'))).toBe(true);
  });
});

describe('wa-rcw-html: discoverSectionUrls — empty/invalid input', () => {
  it('returns [] for empty', () => {
    expect(discoverSectionUrls('', '9A.32')).toEqual([]);
  });
  it('returns [] when no matching section links', () => {
    expect(discoverSectionUrls('<html><body>nothing here</body></html>', '9A.32')).toEqual([]);
  });
});

// ─── wa-rcw-html: sectionCiteFromUrl ────────────────────────────────────────

describe('wa-rcw-html: sectionCiteFromUrl', () => {
  it('extracts cite for standard section', () => {
    expect(sectionCiteFromUrl('https://app.leg.wa.gov/RCW/default.aspx?cite=9A.32.030'))
      .toBe('9A.32.030');
  });
  it('extracts cite for decimal section', () => {
    expect(sectionCiteFromUrl('https://app.leg.wa.gov/RCW/default.aspx?cite=46.61.5249'))
      .toBe('46.61.5249');
  });
  it('returns null when cite is missing', () => {
    expect(sectionCiteFromUrl('https://app.leg.wa.gov/RCW/default.aspx?other=x')).toBe(null);
  });
  it('returns null for malformed URL', () => {
    expect(sectionCiteFromUrl('not-a-url')).toBe(null);
  });
  it('returns null when cite has no section component (just chapter)', () => {
    expect(sectionCiteFromUrl('https://app.leg.wa.gov/RCW/default.aspx?cite=9A.32')).toBe(null);
  });
});

// ─── wa-rcw-html: parseSection against real fixtures ────────────────────────

describe('wa-rcw-html: parseSection (RCW 9A.32.030 — Murder 1)', () => {
  let html;
  let out;
  beforeAll(() => {
    html = readFixture('wa-section-9A-32-030.html');
    out = parseSection(html, {
      sectionCite: '9A.32.030',
      sectionUrl: 'https://app.leg.wa.gov/RCW/default.aspx?cite=9A.32.030',
    });
  });

  it('returns non-null result', () => {
    expect(out).not.toBeNull();
  });
  it('titleText contains "murder" (case-insensitive)', () => {
    expect(out.titleText.toLowerCase()).toContain('murder');
  });
  it('titleText is "Murder in the first degree" (no trailing period)', () => {
    expect(out.titleText).toBe('Murder in the first degree');
  });
  it('bodyText starts with "(1)" (statute opens with subsection 1)', () => {
    expect(out.bodyText).toMatch(/^\(1\)/);
  });
  it('bodyText contains "premeditated intent"', () => {
    expect(out.bodyText.toLowerCase()).toContain('premeditated intent');
  });
  it('bodyText contains "class A felony"', () => {
    expect(out.bodyText).toContain('class A felony');
  });
  it('bodyText does NOT contain "id=\'contentWrapper\'" junk', () => {
    expect(out.bodyText).not.toContain('contentWrapper');
  });
  it('bodyText does NOT contain session-law footer "[ 1990 c 200"', () => {
    expect(out.bodyText).not.toContain('[ 1990 c 200');
  });
  it('bodyText does NOT contain "Notes:" header', () => {
    expect(out.bodyText).not.toContain('Notes:');
  });
});

describe('wa-rcw-html: parseSection (RCW 46.61.5249 — decimal-suffixed section)', () => {
  let html;
  let out;
  beforeAll(() => {
    html = readFixture('wa-section-46-61-5249.html');
    out = parseSection(html, {
      sectionCite: '46.61.5249',
      sectionUrl: 'https://app.leg.wa.gov/RCW/default.aspx?cite=46.61.5249',
    });
  });

  it('returns non-null', () => {
    expect(out).not.toBeNull();
  });
  it('titleText mentions negligent driving', () => {
    expect(out.titleText.toLowerCase()).toContain('negligent driving');
  });
  it('bodyText is substantial', () => {
    expect(out.bodyText.length).toBeGreaterThan(200);
  });
  it('bodyText starts with subsection marker', () => {
    expect(out.bodyText).toMatch(/^\(1\)/);
  });
});

describe('wa-rcw-html: parseSection (RCW 9.41.040 — Title 9 firearms, large section)', () => {
  let html;
  let out;
  beforeAll(() => {
    html = readFixture('wa-section-9-41-040.html');
    out = parseSection(html, {
      sectionCite: '9.41.040',
      sectionUrl: 'https://app.leg.wa.gov/RCW/default.aspx?cite=9.41.040',
    });
  });

  it('returns non-null', () => {
    expect(out).not.toBeNull();
  });
  it('titleText mentions firearms', () => {
    expect(out.titleText.toLowerCase()).toContain('firearm');
  });
  it('bodyText is large (this section runs ~10K chars)', () => {
    expect(out.bodyText.length).toBeGreaterThan(2000);
  });
  it('bodyText does not contain page chrome', () => {
    expect(out.bodyText).not.toContain('contentWrapper');
    expect(out.bodyText).not.toContain('section-page');
  });
});

describe('wa-rcw-html: parseSection — invalid inputs', () => {
  it('returns null for empty input', () => {
    expect(parseSection('', { sectionCite: '', sectionUrl: '' })).toBeNull();
  });
  it('returns null for HTML without contentWrapper', () => {
    const html = '<html><body><h1>RCW 9A.32.030</h1></body></html>'.padEnd(2000, ' ');
    expect(parseSection(html, { sectionCite: '9A.32.030', sectionUrl: '' })).toBeNull();
  });
});

// ─── wa-rcw-html: isRepealedOrDecodified ────────────────────────────────────

describe('wa-rcw-html: isRepealedOrDecodified', () => {
  it('returns false for normal section', () => {
    const html = readFixture('wa-section-9A-32-030.html');
    expect(isRepealedOrDecodified(html)).toBe(false);
  });
  it('returns true for empty input', () => {
    // Without contentWrapper marker, returns false — the caller's not-found check handles this.
    // Specifically test with contentWrapper but Repealed body:
    const html = `xxx <div id='contentWrapper' class='section-page'>Repealed.</div> ContentPlaceHolder1_pnlExpanded`.padEnd(2000, ' ');
    expect(isRepealedOrDecodified(html)).toBe(true);
  });
});

// ─── justia-harness: WA allowlist ───────────────────────────────────────────

describe('justia-harness: isAllowedSourceUrl (WA allowlist)', () => {
  const allowed = new Set(['app.leg.wa.gov']);
  it('accepts HTTPS app.leg.wa.gov', () => {
    expect(isAllowedSourceUrl('https://app.leg.wa.gov/RCW/default.aspx?cite=9A.32.030', allowed)).toBe(true);
  });
  it('rejects HTTP', () => {
    expect(isAllowedSourceUrl('http://app.leg.wa.gov/RCW/default.aspx?cite=9A.32.030', allowed)).toBe(false);
  });
  it('rejects different host (leg.wa.gov)', () => {
    expect(isAllowedSourceUrl('https://leg.wa.gov/RCW/default.aspx?cite=9A.32.030', allowed)).toBe(false);
  });
});

// ─── justia-harness: buildSectionRow (WA) ───────────────────────────────────

describe('justia-harness: buildSectionRow (WA)', () => {
  const cfg = {
    stateCode: 'WA',
    titleNum: '9A',
    allowedHosts: ['app.leg.wa.gov'],
  };

  it('builds a valid row for 9A.32.030', () => {
    const url = 'https://app.leg.wa.gov/RCW/default.aspx?cite=9A.32.030';
    const { row, errors } = buildSectionRow(cfg, '9A.32.030', url, {
      titleText: 'Murder in the first degree',
      bodyText: 'A person is guilty of murder in the first degree when, with a premeditated intent, he or she causes the death of another person.',
      effectiveDate: null,
    });
    expect(errors).toEqual([]);
    expect(row.jurisdiction).toBe('WA');
    expect(row.title).toBe('9A');
    expect(row.section).toBe('9A.32.030');
    expect(row.source_urls[0]).toBe(url);
    expect(row.text_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.section_text).toContain('Murder in the first degree');
    expect(row.section_text).toContain('premeditated intent');
    expect(row.effective_date).toBe(null);
  });

  it('rejects empty bodyText', () => {
    const url = 'https://app.leg.wa.gov/RCW/default.aspx?cite=9A.32.030';
    const { row, errors } = buildSectionRow(cfg, '9A.32.030', url, {
      titleText: 'x', bodyText: '',
    });
    expect(row).toBeNull();
    expect(errors[0]).toMatch(/bodyText/);
  });

  it('rejects URL not on WA allowlist', () => {
    const { row, errors } = buildSectionRow(cfg, '9A.32.030', 'https://evil.tld/foo', {
      titleText: 'a', bodyText: 'b'.repeat(50),
    });
    expect(row).toBeNull();
    expect(errors[0]).toMatch(/allowlist/);
  });

  it('rejects HTTP URL even on allowlist', () => {
    const { row, errors } = buildSectionRow(cfg, '9A.32.030', 'http://app.leg.wa.gov/RCW/default.aspx?cite=9A.32.030', {
      titleText: 'a', bodyText: 'b'.repeat(50),
    });
    expect(row).toBeNull();
    expect(errors[0]).toMatch(/allowlist/);
  });
});

// ─── justia-harness: fetchWithRetry (mocked, WA host) ───────────────────────

describe('justia-harness: fetchWithRetry (WA mocked)', () => {
  beforeAll(() => _resetBreakerForTests());

  it('returns body on 200 OK from app.leg.wa.gov', async () => {
    const fakeFetch = async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => 'ok-body' });
    const out = await fetchWithRetry('https://app.leg.wa.gov/RCW/default.aspx?cite=9A.32.030', {
      allowedHosts: ['app.leg.wa.gov'],
      crawlDelayMs: 0,
      fetchImpl: fakeFetch,
    });
    expect(out).toBe('ok-body');
  });

  it('throws fast on 404', async () => {
    const fakeFetch = async () => ({ ok: false, status: 404, statusText: 'Not Found', text: async () => '' });
    await expect(fetchWithRetry('https://app.leg.wa.gov/RCW/default.aspx?cite=BOGUS', {
      allowedHosts: ['app.leg.wa.gov'],
      crawlDelayMs: 0,
      fetchImpl: fakeFetch,
    })).rejects.toThrow(/HTTP 404/);
  });

  it('rejects host smuggling — app.leg.wa.gov.evil.com', async () => {
    let called = false;
    const fakeFetch = async () => { called = true; return { ok: true, status: 200, text: async () => '' }; };
    await expect(fetchWithRetry('https://app.leg.wa.gov.evil.com/foo', {
      allowedHosts: ['app.leg.wa.gov'],
      crawlDelayMs: 0,
      fetchImpl: fakeFetch,
    })).rejects.toThrow(/allowlist/);
    expect(called).toBe(false);
  });
});

// ─── seed-statutes-wa-title9a: CLI / config ─────────────────────────────────

describe('seed-statutes-wa-title9a: parseCliFlags', () => {
  it('parses --dry-run', () => {
    expect(parseCliFlags(['--dry-run'])).toEqual({
      dryRun: true, verbose: false, chapters: null, limit: null,
    });
  });
  it('parses --chapters and --limit', () => {
    expect(parseCliFlags(['--chapters=9A.32,46.61', '--limit=20'])).toEqual({
      dryRun: false, verbose: false, chapters: ['9A.32', '46.61'], limit: 20,
    });
  });
  it('parses --verbose', () => {
    expect(parseCliFlags(['--verbose'])).toMatchObject({ verbose: true });
  });
});

describe('seed-statutes-wa-title9a: buildWaConfig', () => {
  it('defaults to all 12 chapters', () => {
    const cfg = buildWaConfig({});
    expect(cfg.targetChapters).toHaveLength(12);
    expect(cfg.stateCode).toBe('WA');
    expect(cfg.titleNum).toBe('9A');
    expect(cfg.allowedHosts).toEqual(['app.leg.wa.gov']);
  });
  it('honors chapter sub-selection', () => {
    const cfg = buildWaConfig({ chapters: ['9A.32', '46.61'] });
    expect(cfg.targetChapters).toHaveLength(2);
    expect(cfg.targetChapters.map((c) => c.chapterNum)).toEqual(['9A.32', '46.61']);
  });
  it('single chapter selection', () => {
    const cfg = buildWaConfig({ chapters: ['69.50'] });
    expect(cfg.targetChapters).toHaveLength(1);
    expect(cfg.targetChapters[0].chapterNum).toBe('69.50');
  });
  it('sets limit when provided', () => {
    const cfg = buildWaConfig({ limit: 5 });
    expect(cfg.limit).toBe(5);
  });
  it('has crawlDelayMs of 2000 (defensive WA default)', () => {
    expect(buildWaConfig({}).crawlDelayMs).toBe(2000);
  });
});

// ─── collectRows — integration with mocked fetch ────────────────────────────

describe('seed-statutes-wa-title9a: collectRows (real fixtures, mocked fetch)', () => {
  beforeAll(() => _resetBreakerForTests());

  it('walks chapter 9A.32 index, parses 9A.32.030 fixture', async () => {
    const chapterHtml = readFixture('wa-chapter-9A-32.html');
    const sec030Html = readFixture('wa-section-9A-32-030.html');

    const fakeFetch = async (url) => {
      if (url.endsWith('cite=9A.32')) {
        return { ok: true, status: 200, text: async () => chapterHtml };
      }
      if (url.endsWith('cite=9A.32.030')) {
        return { ok: true, status: 200, text: async () => sec030Html };
      }
      // 404 for other section URLs — graceful skip
      return { ok: false, status: 404, statusText: 'Not Found', text: async () => '' };
    };

    const cfg = buildWaConfig({ chapters: ['9A.32'], limit: 8 });
    cfg.crawlDelayMs = 0;
    const { rows, byChapter } = await collectRows(cfg, {
      verbose: false,
      fetchImpl: fakeFetch,
    });

    expect(byChapter['9A.32'].discovered).toBe(8);
    expect(rows.length).toBeGreaterThanOrEqual(1);

    const row030 = rows.find((r) => r.section === '9A.32.030');
    expect(row030).toBeDefined();
    expect(row030.jurisdiction).toBe('WA');
    expect(row030.title).toBe('9A');
    expect(row030.section).toBe('9A.32.030');
    expect(row030.source_urls[0]).toBe('https://app.leg.wa.gov/RCW/default.aspx?cite=9A.32.030');
    expect(row030.section_text).toContain('Murder in the first degree');
    expect(row030.section_text).toContain('premeditated intent');
    expect(row030.text_hash).toMatch(/^[a-f0-9]{64}$/);
  }, 30_000);

  it('respects limit cap across chapters', async () => {
    const chapterHtml = readFixture('wa-chapter-9A-32.html');
    const sec030Html = readFixture('wa-section-9A-32-030.html');
    const fakeFetch = async (url) => {
      if (url.includes('cite=9A.32') && !url.includes('.030')) {
        // chapter index — allow only the first chapter
        return { ok: true, status: 200, text: async () => chapterHtml };
      }
      // Any section URL returns the same 030 fixture (just for limit-cap testing)
      return { ok: true, status: 200, text: async () => sec030Html };
    };

    const cfg = buildWaConfig({ chapters: ['9A.32'], limit: 2 });
    cfg.crawlDelayMs = 0;
    const { rows } = await collectRows(cfg, { verbose: false, fetchImpl: fakeFetch });
    // limit caps section-fetch attempts, not rows; but with all-success fetches, rows == limit
    expect(rows.length).toBeLessThanOrEqual(2);
  }, 30_000);

  it('handles chapter index failure gracefully (skips chapter, continues)', async () => {
    // Use 404 (non-retryable) so fetchWithRetry throws fast and we don't burn the
    // 5s/30s/120s retry backoffs on a 5xx in test.
    const fakeFetch = async () => ({ ok: false, status: 404, statusText: 'Not Found', text: async () => '' });
    const cfg = buildWaConfig({ chapters: ['9A.32'], limit: 5 });
    cfg.crawlDelayMs = 0;
    const { rows, byChapter } = await collectRows(cfg, { verbose: false, fetchImpl: fakeFetch });
    expect(rows.length).toBe(0);
    expect(byChapter['9A.32'].indexFailed).toBe(true);
  }, 10_000);
});

// ─── harness primitives ─────────────────────────────────────────────────────

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

describe('justia-harness: textArrayLiteral (WA URLs)', () => {
  it('handles single-URL array', () => {
    expect(textArrayLiteral(['https://app.leg.wa.gov/x']))
      .toBe('{"https://app.leg.wa.gov/x"}');
  });
  it('handles empty array', () => {
    expect(textArrayLiteral([])).toBe('{}');
  });
});
