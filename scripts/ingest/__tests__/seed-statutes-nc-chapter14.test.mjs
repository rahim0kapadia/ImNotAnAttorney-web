// test-isolation-na: no Supabase writes — unit tests against synthetic + captured real-HTML fixtures only
// Template: scripts/ingest/__tests__/seed-statutes-ga.test.mjs (vitest-included sibling)
// Pattern: cl-bulk-data-defensive #17 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists - fixtures only, no live network
//
// Unit tests for NC state statutes seed pipeline.

import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'nc');
import {
  NC_CHAPTERS,
  StatuteRowSchema,
  parseCliFlags,
  buildChapterUrl,
  buildSectionUrl,
  buildRow,
  textArrayLiteral,
  fetchWithRetry,
  CloudflareAbortError,
  _resetBreakerForTests,
  isSectionNotFound,
  isChapterNotFound,
  isRepealed,
  stripHtml,
  extractSectionNumbers,
  parseSectionPage,
  parseSectionFromChapter,
  seedNC,
} from '../seed-statutes-nc-chapter14.mjs';

// ──────────────── Synthetic fixtures ────────────────
// Mirror real ncleg.gov XHTML 1.0 Transitional shape: cs<hex>-classed spans,
// densely concatenated paragraphs, &sect; entity for §, &nbsp; for spaces.
// IMPORTANT: ncleg chapter pages contain ALL sections inline — no per-section
// fetches. These fixtures mirror that structure.

const FIXTURE_NOT_FOUND = `<html><body><h1>Page not found</h1><p>The page you requested does not exist.</p></body></html>`;

// Chapter 14 inline fixture: 14-1, 14-3 (repealed), 14-17, 14-18.1
const FIXTURE_CHAPTER_14_INLINE = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 14</title></head>
<body>
<h4 class="cs2E44D3A6"><span class="cs8448B574">Subchapter I. General Provisions.</span></h4>
<p class="cs8E357F70"><span class="cs72F7C9C5">&sect; 14-1.&nbsp; Felonies and misdemeanors defined.</span> <span class="cs9D249CCB">A felony is a crime which is or may be punishable by either death or imprisonment in the State's prison.</span></p>
<p class="cs8E357F70"><span class="cs72F7C9C5">&sect; 14-3.&nbsp;</span> <span class="cs9D249CCB">Repealed by Session Laws 1973, c. 47, s. 2.</span></p>
<h4 class="cs2E86D3A6"><span class="cs8448B574">Subchapter III. Offenses Against the Person.</span></h4>
<p class="cs2E44D3A6"><span class="cs9D249CCB">Article 6. Homicide.</span></p>
<p class="cs8E357F70"><span class="cs72F7C9C5">&sect; 14-17.&nbsp; First-degree murder; punishment.</span> <span class="cs9D249CCB">(a) A murder which shall be perpetrated by means of a nuclear, biological, or chemical weapon of mass destruction shall be deemed to be murder in the first degree, a Class A felony.</span></p>
<p class="cs8E357F70"><span class="cs9D249CCB">(1893, c. 281, s. 1; Rev., s. 3271; C.S., s. 4200; 1949, c. 299.)</span></p>
<p class="cs8E357F70"><span class="cs72F7C9C5">&sect; 14-18.1.&nbsp; Murder by poisoning.</span> <span class="cs9D249CCB">A person who commits murder by poisoning shall be punished as a Class B1 felon. This section does not preclude prosecution under any other statute.</span></p>
</body></html>`;

// Chapter 20 inline fixture: 20-138.1 (DWI, decimal-suffixed)
const FIXTURE_CHAPTER_20_INLINE = `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 20</title></head>
<body>
<h4 class="cs2E44D3A6"><span class="cs8448B574">Article 2A. Motor Vehicle Driver's Licenses.</span></h4>
<p class="cs8E357F70"><span class="cs72F7C9C5">&sect; 20-138.1.&nbsp; Impaired driving.</span> <span class="cs9D249CCB">(a) Offense. A person commits the offense of impaired driving if he drives any vehicle upon any highway, any street, or any public vehicular area within this State while under the influence of an impairing substance.</span></p>
<p class="cs8E357F70"><span class="cs9D249CCB">(1983, c. 435, s. 24; 1989, c. 691, s. 1.)</span></p>
<p class="cs8E357F70"><span class="cs72F7C9C5">&sect; 20-141.&nbsp; Speed restrictions.</span> <span class="cs9D249CCB">No person shall drive a vehicle on a highway at a speed greater than is reasonable and prudent under the conditions then existing.</span></p>
</body></html>`;

// Chapter 15A inline fixture: 15A-1340.16 (lettered chapter)
const FIXTURE_CHAPTER_15A_INLINE = `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 15A</title></head>
<body>
<p class="cs8E357F70"><span class="cs72F7C9C5">&sect; 15A-1340.16.&nbsp; Aggravated and mitigated sentences.</span> <span class="cs9D249CCB">The court shall consider evidence of aggravating or mitigating factors present in the offense that make an aggravated or mitigated sentence appropriate, and shall consider the request of any party that an aggravated or mitigated sentence be imposed.</span></p>
<p class="cs8E357F70"><span class="cs72F7C9C5">&sect; 15A-1340.17.&nbsp; Punishment limits for each class of offense and prior record level.</span> <span class="cs9D249CCB">(a) Offense Classification; Default Classifications. The offense classes are A, B1, B2, C, D, E, F, G, H, and I.</span></p>
</body></html>`;

// ──────────────── Sanity checks ────────────────

describe('NC_CHAPTERS', () => {
  it('covers the 7 in-scope chapters', () => {
    for (const c of ['14', '15A', '20', '50B', '74C', '74E', '90']) {
      expect(NC_CHAPTERS[c]).toBeTruthy();
      expect(NC_CHAPTERS[c].description.length).toBeGreaterThan(0);
    }
  });
});

describe('buildChapterUrl', () => {
  it('produces canonical NC URL (HTTPS, www.ncleg.gov)', () => {
    const u = buildChapterUrl('14');
    expect(u.startsWith('https://')).toBe(true);
    expect(u.includes('www.ncleg.gov')).toBe(true);
    expect(u.endsWith('/EnactedLegislation/Statutes/HTML/ByChapter/Chapter_14.html')).toBe(true);
  });

  it('handles lettered chapter id (15A)', () => {
    const u = buildChapterUrl('15A');
    expect(u.endsWith('/Chapter_15A.html')).toBe(true);
  });

  it('throws for unknown chapter', () => {
    expect(() => buildChapterUrl('999')).toThrow(/not in NC_CHAPTERS/);
  });
});

describe('buildSectionUrl', () => {
  it('uses chapter + section path (decimal-suffixed)', () => {
    const u = buildSectionUrl('20', '138.1');
    expect(u.startsWith('https://')).toBe(true);
    expect(u.endsWith('/BySection/Chapter_20/GS_20-138.1.html')).toBe(true);
  });

  it('handles lettered chapter (15A)', () => {
    const u = buildSectionUrl('15A', '1340.16');
    expect(u.endsWith('/BySection/Chapter_15A/GS_15A-1340.16.html')).toBe(true);
  });
});

describe('parseCliFlags', () => {
  it('handles --dry-run + --chapters + --limit + --verbose', () => {
    const f = parseCliFlags(['--dry-run', '--chapters=14,20', '--limit=10', '--verbose']);
    expect(f.dryRun).toBe(true);
    expect(f.verbose).toBe(true);
    expect(f.chapters).toEqual(['14', '20']);
    expect(f.limitSections).toBe(10);
  });

  it('accepts lettered chapters', () => {
    const f = parseCliFlags(['--chapters=14,15A,74C']);
    expect(f.chapters).toEqual(['14', '15A', '74C']);
  });
});

// ──────────────── isSectionNotFound + isRepealed ────────────────

describe('isChapterNotFound', () => {
  it('detects "Page not found"', () => {
    expect(isChapterNotFound(FIXTURE_NOT_FOUND, '14')).toBe(true);
  });

  it('passes valid chapter pages with §-literals', () => {
    expect(isChapterNotFound(FIXTURE_CHAPTER_14_INLINE, '14')).toBe(false);
    expect(isChapterNotFound(FIXTURE_CHAPTER_20_INLINE, '20')).toBe(false);
  });

  it('rejects empty / too-short', () => {
    expect(isChapterNotFound('', '14')).toBe(true);
    expect(isChapterNotFound('<html></html>', '14')).toBe(true);
  });

  it('isSectionNotFound is alias of isChapterNotFound (backward-compat)', () => {
    expect(isSectionNotFound(FIXTURE_NOT_FOUND, '14')).toBe(true);
  });
});

describe('isRepealed', () => {
  it('detects "Repealed by …" tombstone', () => {
    expect(isRepealed('Repealed by Session Laws 1973, c. 47, s. 2.')).toBe(true);
    expect(isRepealed('A normal statute body that does not mention repeal at all goes here.')).toBe(false);
  });
});

// ──────────────── stripHtml ────────────────

describe('stripHtml', () => {
  it('decodes &sect; to §', () => {
    const s = stripHtml('<p>&sect; 14-17. First-degree murder.</p>');
    expect(s.includes('§ 14-17')).toBe(true);
  });

  it('drops C0 controls + DEL', () => {
    const s = stripHtml('a&#0;b&#8;c&#127;d');
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      const bad = (c < 0x20 && c !== 0x09 && c !== 0x0A && c !== 0x0D) || c === 0x7F;
      expect(bad).toBe(false);
    }
  });

  it('strips tags materialized from decoded entities', () => {
    const s = stripHtml('clean &#60;script&#62;alert(1)&#60;/script&#62; end');
    expect(s.includes('<script')).toBe(false);
  });
});

// ──────────────── extractSectionNumbers ────────────────

describe('extractSectionNumbers', () => {
  it('extracts §<chapter>-<num> literals from chapter HTML (chapter 14)', () => {
    const s = extractSectionNumbers(FIXTURE_CHAPTER_14_INLINE, '14');
    expect(s.includes('1')).toBe(true);
    expect(s.includes('17')).toBe(true);
    expect(s.includes('18.1')).toBe(true);
  });

  it('filters out cross-references to other chapters (§14- only, no §20-)', () => {
    // Chapter 14 fixture mentions no §20- literals; chapter 20 fixture has §20-138.1.
    const s14 = extractSectionNumbers(FIXTURE_CHAPTER_20_INLINE, '14');
    expect(s14.length).toBe(0); // no §14- in chapter 20 page
    const s20 = extractSectionNumbers(FIXTURE_CHAPTER_20_INLINE, '20');
    expect(s20.includes('138.1')).toBe(true);
    expect(s20.includes('141')).toBe(true);
  });

  it('handles decimal-suffixed sections (20-138.1, 14-18.1)', () => {
    const s14 = extractSectionNumbers(FIXTURE_CHAPTER_14_INLINE, '14');
    expect(s14.includes('18.1')).toBe(true);
  });

  it('handles lettered chapter (15A)', () => {
    const s = extractSectionNumbers(FIXTURE_CHAPTER_15A_INLINE, '15A');
    expect(s.includes('1340.16')).toBe(true);
    expect(s.includes('1340.17')).toBe(true);
  });

  it('returns sorted by numeric base', () => {
    // Synthetic — three §-literals, out of order.
    const html = '&sect; 14-100. Big.&sect; 14-2. Two.&sect; 14-17. Murder.';
    const s = extractSectionNumbers(html, '14');
    expect(s).toEqual(['2', '17', '100']);
  });
});

// ──────────────── parseSectionPage ────────────────

describe('parseSectionFromChapter', () => {
  it('extracts title from §-anchor inside chapter HTML (14-17 first-degree murder)', () => {
    const p = parseSectionFromChapter(FIXTURE_CHAPTER_14_INLINE, '14', '17');
    expect(p).toBeTruthy();
    expect(p.titleText.includes('First-degree murder')).toBe(true);
  });

  it('extracts body for the requested section, slicing to the NEXT § anchor', () => {
    const p = parseSectionFromChapter(FIXTURE_CHAPTER_14_INLINE, '14', '17');
    expect(p.bodyText.includes('weapon of mass destruction')).toBe(true);
    // Must NOT bleed into the next section's body (§14-18.1 "Murder by poisoning")
    expect(p.bodyText.includes('Murder by poisoning')).toBe(false);
    expect(p.bodyText.includes('Class B1 felon')).toBe(false);
  });

  it('trims trailing legislative-history block', () => {
    const p = parseSectionFromChapter(FIXTURE_CHAPTER_14_INLINE, '14', '17');
    expect(p.bodyText.includes('1893, c. 281')).toBe(false);
  });

  it('handles decimal-suffixed section (20-138.1 DWI) inside a chapter page', () => {
    const p = parseSectionFromChapter(FIXTURE_CHAPTER_20_INLINE, '20', '138.1');
    expect(p).toBeTruthy();
    expect(p.titleText.toLowerCase().includes('impaired')).toBe(true);
    expect(p.bodyText.includes('influence of an impairing substance')).toBe(true);
    expect(p.bodyText.includes('Speed restrictions')).toBe(false); // doesn't bleed into §20-141
  });

  it('handles lettered-chapter section (15A-1340.16)', () => {
    const p = parseSectionFromChapter(FIXTURE_CHAPTER_15A_INLINE, '15A', '1340.16');
    expect(p).toBeTruthy();
    expect(p.titleText.toLowerCase().includes('aggravated')).toBe(true);
    expect(p.bodyText.includes('Punishment limits')).toBe(false); // doesn't bleed into §15A-1340.17
  });

  it('returns null for repealed sections (skipped, not seeded)', () => {
    const p = parseSectionFromChapter(FIXTURE_CHAPTER_14_INLINE, '14', '3');
    expect(p).toBe(null);
  });

  it('returns null when section anchor not found in chapter HTML', () => {
    expect(parseSectionFromChapter(FIXTURE_CHAPTER_14_INLINE, '14', '999')).toBe(null);
  });

  it('parseSectionPage is alias of parseSectionFromChapter (backward-compat)', () => {
    expect(parseSectionPage(FIXTURE_CHAPTER_14_INLINE, '14', '17')).toBeTruthy();
  });
});

// ──────────────── buildRow + textArrayLiteral ────────────────

describe('buildRow', () => {
  it('produces deterministic text_hash over section_text', () => {
    const r = buildRow({
      chapter: '14',
      section: '17',
      titleText: 'First-degree murder.',
      bodyText: 'A murder shall be deemed to be murder in the first degree.',
      sourceUrl: 'https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_14/GS_14-17.html',
      scrapedAt: '2026-05-02T12:00:00.000Z',
    });
    const expected = crypto.createHash('sha256')
      .update('First-degree murder.\n\nA murder shall be deemed to be murder in the first degree.')
      .digest('hex');
    expect(r.text_hash).toBe(expected);
  });

  it('shapes section as <chapter>-<num>, jurisdiction NC', () => {
    const r = buildRow({
      chapter: '20',
      section: '138.1',
      titleText: 'Impaired driving.',
      bodyText: 'long enough body text to pass zod min length',
      sourceUrl: 'https://www.ncleg.gov/x',
    });
    expect(r.jurisdiction).toBe('NC');
    expect(r.title).toBe('20');
    expect(r.section).toBe('20-138.1');
    expect(r.subsection).toBe(null);
    expect(r.is_current).toBe(true);
  });
});

describe('textArrayLiteral', () => {
  it('escapes CR/LF/quotes/backslashes', () => {
    const lit = textArrayLiteral(['a"b\\c\nd\re']);
    expect(lit.includes('\n')).toBe(false);
    expect(lit.includes('\r')).toBe(false);
    expect(lit.includes('\\"')).toBe(true);
    expect(lit.includes('\\\\')).toBe(true);
  });
});

// ──────────────── StatuteRowSchema ────────────────

describe('StatuteRowSchema', () => {
  it('accepts a valid NC row', () => {
    const r = buildRow({
      chapter: '14',
      section: '17',
      titleText: 'First-degree murder.',
      bodyText: 'A murder shall be deemed to be murder in the first degree.',
      sourceUrl: 'https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_14/GS_14-17.html',
      scrapedAt: '2026-05-02T12:00:00.000Z',
    });
    const check = StatuteRowSchema.safeParse(r);
    expect(check.success).toBe(true);
  });

  it('accepts decimal-suffixed section (20-138.1)', () => {
    const r = buildRow({
      chapter: '20',
      section: '138.1',
      titleText: 'Impaired driving.',
      bodyText: 'long enough body text for zod minimum length',
      sourceUrl: 'https://www.ncleg.gov/x',
    });
    expect(StatuteRowSchema.safeParse(r).success).toBe(true);
  });

  it('accepts lettered-chapter section (15A-1340.16)', () => {
    const r = buildRow({
      chapter: '15A',
      section: '1340.16',
      titleText: 'Aggravated and mitigated sentences.',
      bodyText: 'long enough body text for zod minimum length',
      sourceUrl: 'https://www.ncleg.gov/x',
    });
    expect(StatuteRowSchema.safeParse(r).success).toBe(true);
  });

  it('rejects non-www.ncleg.gov primary URL', () => {
    const r = buildRow({
      chapter: '14',
      section: '17',
      titleText: 'P.',
      bodyText: 'long enough body text to pass zod minimum',
      sourceUrl: 'https://law.justia.com/codes/north-carolina/2024/14-17',
    });
    expect(StatuteRowSchema.safeParse(r).success).toBe(false);
  });

  it('rejects HTTP (non-HTTPS)', () => {
    const r = buildRow({
      chapter: '14',
      section: '17',
      titleText: 'P.',
      bodyText: 'long enough body text to pass zod minimum',
      sourceUrl: 'http://www.ncleg.gov/x',
    });
    expect(StatuteRowSchema.safeParse(r).success).toBe(false);
  });
});

// ──────────────── fetchWithRetry + Cloudflare abort ────────────────

describe('fetchWithRetry', () => {
  it('rejects non-allowed host', async () => {
    _resetBreakerForTests();
    await expect(fetchWithRetry('https://evil.example.com/x', {
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => '' }),
    })).rejects.toThrow(/Host not allowed/);
  });

  it('rejects HTTP non-HTTPS', async () => {
    _resetBreakerForTests();
    await expect(fetchWithRetry('http://www.ncleg.gov/x', {
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => '' }),
    })).rejects.toThrow(/Host not allowed/);
  });

  it('returns body on first success', async () => {
    _resetBreakerForTests();
    const out = await fetchWithRetry('https://www.ncleg.gov/x', {
      fetchImpl: async () => ({ ok: true, status: 200, async text() { return 'hello'; } }),
    });
    expect(out).toBe('hello');
  });

  it('does NOT retry on 404', async () => {
    _resetBreakerForTests();
    let calls = 0;
    await expect(fetchWithRetry('https://www.ncleg.gov/x', {
      fetchImpl: async () => { calls += 1; return { ok: false, status: 404, async text() { return ''; } }; },
    })).rejects.toThrow(/HTTP 404/);
    expect(calls).toBe(1);
  });

  it('aborts after threshold consecutive Cloudflare 403s (J5)', async () => {
    _resetBreakerForTests();
    let aborted = false;
    try {
      for (let i = 0; i < 10; i++) {
        try {
          await fetchWithRetry('https://www.ncleg.gov/x', {
            fetchImpl: async () => ({ ok: false, status: 403, async text() { return ''; } }),
          });
        } catch (e) {
          if (e instanceof CloudflareAbortError) { aborted = true; throw e; }
          // HTTP 403 from exhausted retries — keep looping until threshold trips
        }
      }
    } catch (e) {
      if (!(e instanceof CloudflareAbortError)) throw e;
    }
    expect(aborted).toBe(true);
  }, 180000); // 3min — fetchWithRetry uses real backoff sleeps (rate-min 2s + 5s + 30s + 120s)
});

// ──────────────── seedNC end-to-end with synthetic fixtures ────────────────

// ──────────────── Captured real-HTML fixtures (5 from live ncleg.gov 2026-05-02) ────────────────

describe('captured real ncleg.gov fixtures (regression)', () => {
  it('parses §14-1 (Felonies and misdemeanors defined) from real chapter HTML', () => {
    const html = fs.readFileSync(path.join(FIXTURE_DIR, 'nc-chapter14-slice-sec1-to-2.4.html'), 'utf8');
    const p = parseSectionFromChapter(html, '14', '1');
    expect(p).toBeTruthy();
    expect(p.titleText).toContain('Felonies and misdemeanors');
    expect(p.bodyText.length).toBeGreaterThan(100);
  });

  it('parses §14-17 (Murder in the first and second degree) from real chapter HTML', () => {
    const html = fs.readFileSync(path.join(FIXTURE_DIR, 'nc-chapter14-slice-sec17-murder.html'), 'utf8');
    const p = parseSectionFromChapter(html, '14', '17');
    expect(p).toBeTruthy();
    expect(p.titleText.toLowerCase()).toContain('murder');
    expect(p.bodyText.length).toBeGreaterThan(500);
    // Ensure no §14-18 bleed-through
    expect(p.bodyText).not.toMatch(/§\s*14-18/);
  });

  it('parses §20-138.1 (Impaired driving / DWI) from real chapter HTML', () => {
    const html = fs.readFileSync(path.join(FIXTURE_DIR, 'nc-chapter20-slice-sec138.1-dwi.html'), 'utf8');
    const p = parseSectionFromChapter(html, '20', '138.1');
    expect(p).toBeTruthy();
    expect(p.titleText.toLowerCase()).toContain('impaired');
    expect(p.bodyText.length).toBeGreaterThan(200);
  });

  it('parses §15A-1340.16 (Aggravated and mitigated sentences) from real lettered-chapter HTML', () => {
    const html = fs.readFileSync(path.join(FIXTURE_DIR, 'nc-chapter15A-slice-sec1340.16-aggravated.html'), 'utf8');
    const p = parseSectionFromChapter(html, '15A', '1340.16');
    expect(p).toBeTruthy();
    expect(p.titleText.toLowerCase()).toContain('aggravat');
    expect(p.bodyText.length).toBeGreaterThan(500);
  });

  it('extractSectionNumbers on first 100KB of real chapter 14 finds dozens of sections', () => {
    const html = fs.readFileSync(path.join(FIXTURE_DIR, 'nc-chapter14-first-100kb.html'), 'utf8');
    const sections = extractSectionNumbers(html, '14');
    expect(sections.length).toBeGreaterThanOrEqual(20);
    // §14-1 must appear (it's the first section)
    expect(sections.includes('1')).toBe(true);
  });
});

describe('seedNC dry-run', () => {
  it('parses ch14 fixtures end-to-end (chapter-inline, 1 fetch)', async () => {
    _resetBreakerForTests();
    const fetchImpl = async (url) => {
      const u = String(url);
      if (u.endsWith('/Chapter_14.html')) {
        return { ok: true, status: 200, async text() { return FIXTURE_CHAPTER_14_INLINE; } };
      }
      // No per-section fetches — chapter HTML is the source of truth.
      return { ok: false, status: 404, async text() { return FIXTURE_NOT_FOUND; } };
    };
    const out = await seedNC({
      dryRun: true,
      chapters: ['14'],
      limitSections: 5,
      fetchImpl,
    });
    // §14-1, §14-17, §14-18.1 should parse; §14-3 (repealed) should be skipped.
    expect(out.rows.length).toBeGreaterThanOrEqual(2);
    for (const r of out.rows) {
      expect(StatuteRowSchema.safeParse(r).success).toBe(true);
      expect(r.source_urls[0].includes('www.ncleg.gov')).toBe(true);
      // source_urls should be the per-section permalink even though we never fetched it
      expect(r.source_urls[0].includes('/BySection/Chapter_14/GS_14-')).toBe(true);
    }
    // Verify we picked up the right sections
    const sections = out.rows.map((r) => r.section).sort();
    expect(sections.includes('14-17')).toBe(true);
    expect(sections.includes('14-18.1')).toBe(true);
    // §14-3 was repealed → must NOT be in output
    expect(sections.includes('14-3')).toBe(false);
  }, 30000);

  it('handles multi-chapter (14 + 20 + 15A) in one run', async () => {
    _resetBreakerForTests();
    const fetchImpl = async (url) => {
      const u = String(url);
      if (u.endsWith('/Chapter_14.html')) return { ok: true, status: 200, async text() { return FIXTURE_CHAPTER_14_INLINE; } };
      if (u.endsWith('/Chapter_20.html')) return { ok: true, status: 200, async text() { return FIXTURE_CHAPTER_20_INLINE; } };
      if (u.endsWith('/Chapter_15A.html')) return { ok: true, status: 200, async text() { return FIXTURE_CHAPTER_15A_INLINE; } };
      return { ok: false, status: 404, async text() { return FIXTURE_NOT_FOUND; } };
    };
    const out = await seedNC({
      dryRun: true,
      chapters: ['14', '20', '15A'],
      fetchImpl,
    });
    const titles = new Set(out.rows.map((r) => r.title));
    expect(titles.has('14')).toBe(true);
    expect(titles.has('20')).toBe(true);
    expect(titles.has('15A')).toBe(true);
  }, 30000);

  it('non-dry-run with zero rows throws WITHOUT touching dbFactory', async () => {
    _resetBreakerForTests();
    const fetchImpl = async () => ({ ok: true, status: 200, async text() { return FIXTURE_NOT_FOUND; } });
    let factoryCalls = 0;
    const dbFactory = async () => { factoryCalls += 1; throw new Error('factory should not be called'); };
    await expect(
      seedNC({ dryRun: false, chapters: ['14'], limitSections: 2, fetchImpl, dbFactory }),
    ).rejects.toThrow(/no rows parsed/);
    expect(factoryCalls).toBe(0);
  }, 30000);
});
