// test-isolation-na: no Supabase writes — unit tests against real fixture HTML
//
// Tests for the LA Title 14 (Criminal Law) bucket-B seeder + parser.
// Fixtures captured live from legis.la.gov on 2026-05-02:
//   - title-14-toc.html                     (Title 14 TOC, ~712 anchor rows)
//   - section-14-30-first-degree-murder.html  (active, multi-subsection)
//   - section-14-67-theft.html              (active, longer subsection list)
//   - section-14-32_10-repealed.html        (repealed shell)

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LA_BASE,
  LA_TITLE14_TOC_URL,
  decodeEntities,
  stripHtml,
  buildTitleTocUrl,
  buildSectionFetchUrl,
  buildLASourceUrl,
  docIdFromUrl,
  parseRsCitation,
  parseSectionHeading,
  discoverSectionDescriptors,
  discoverSections,
  parseSection,
} from '../lib/la-html.mjs';

import {
  parseCliFlags,
  buildTitleConfig,
  bucketBParse,
  discoverSectionsAndIndex,
  buildSourceUrl,
  LA_TITLE14,
  LA_TITLE14_ROW_FLOOR,
} from '../seed-statutes-la-title14.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXT = path.join(__dirname, 'fixtures', 'la');

function readFixture(name) {
  return readFileSync(path.join(FIXT, name), 'utf-8');
}

// ─── la-html: low-level primitives ─────────────────────────────────────────

describe('la-html: decodeEntities', () => {
  it('decodes basic HTML entities', () => {
    expect(decodeEntities('A &amp; B')).toBe('A & B');
    expect(decodeEntities('&lt;tag&gt;')).toBe('<tag>');
  });
  it('decodes section sign variants', () => {
    expect(decodeEntities('&sect;30')).toBe('§30');
    expect(decodeEntities('&#xa7;30')).toBe('§30');
    expect(decodeEntities('&#167;30')).toBe('§30');
  });
  it('decodes &nbsp; to ASCII space; &#160; preserves U+00A0 (matches sibling parsers)', () => {
    expect(decodeEntities('A&nbsp;B')).toBe('A B');
    // Numeric entity 160 decodes to actual NBSP codepoint (U+00A0) — stripHtml
    // collapses it during whitespace normalization downstream.
    expect(decodeEntities('&#160;X').charCodeAt(0)).toBe(0xA0);
    expect(stripHtml('<p>&#160;X</p>')).toBe('X');
  });
});

describe('la-html: stripHtml', () => {
  it('strips tags and collapses whitespace', () => {
    expect(stripHtml('<p>hello <b>world</b></p>')).toBe('hello world');
  });
  it('drops script and style blocks', () => {
    expect(stripHtml('a<script>evil()</script>b')).toBe('a b');
    expect(stripHtml('a<style>.x{}</style>b')).toBe('a b');
  });
  it('returns empty string for null/empty', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null)).toBe('');
  });
});

describe('la-html: URL builders', () => {
  it('buildTitleTocUrl', () => {
    expect(buildTitleTocUrl()).toBe(`${LA_BASE}/legis/Laws_Toc.aspx?folder=88&title=14`);
    expect(buildTitleTocUrl()).toBe(LA_TITLE14_TOC_URL);
  });
  it('buildSectionFetchUrl', () => {
    expect(buildSectionFetchUrl(78397)).toBe(`${LA_BASE}/legis/Law.aspx?d=78397`);
    expect(buildSectionFetchUrl('78397')).toBe(`${LA_BASE}/legis/Law.aspx?d=78397`);
  });
  it('buildLASourceUrl matches buildSectionFetchUrl', () => {
    expect(buildLASourceUrl(78397)).toBe(buildSectionFetchUrl(78397));
  });
  it('docIdFromUrl extracts opaque id', () => {
    expect(docIdFromUrl('https://www.legis.la.gov/legis/Law.aspx?d=78397')).toBe('78397');
    expect(docIdFromUrl('Law.aspx?d=451830')).toBe('451830');
  });
  it('docIdFromUrl throws on unparseable URL', () => {
    expect(() => docIdFromUrl('https://www.legis.la.gov/legis/Other.aspx')).toThrow();
  });
});

describe('la-html: parseRsCitation', () => {
  it('parses simple "RS 14:30"', () => {
    expect(parseRsCitation('RS 14:30')).toBe('30');
  });
  it('parses dotted citation "RS 14:32.10"', () => {
    expect(parseRsCitation('RS 14:32.10')).toBe('32.10');
  });
  it('parses multi-dot citation "RS 14:95.1.4"', () => {
    expect(parseRsCitation('RS 14:95.1.4')).toBe('95.1.4');
  });
  it('handles "R.S. 14:30" punctuated form', () => {
    expect(parseRsCitation('R.S. 14:30')).toBe('30');
  });
  it('tolerates leading/trailing whitespace', () => {
    expect(parseRsCitation('  RS 14:30  ')).toBe('30');
  });
  it('rejects title-level "RS 14"', () => {
    expect(parseRsCitation('RS 14')).toBeNull();
  });
  it('rejects sibling title "RS 15:1"', () => {
    expect(parseRsCitation('RS 15:1')).toBeNull();
  });
  it('returns null for empty / non-citation text', () => {
    expect(parseRsCitation('')).toBeNull();
    expect(parseRsCitation('TITLE 14. CRIMINAL LAW')).toBeNull();
    expect(parseRsCitation('Repealed by Acts 2022, No. 545')).toBeNull();
  });
});

describe('la-html: parseSectionHeading', () => {
  it('parses "§30. First degree murder"', () => {
    const r = parseSectionHeading('§30. First degree murder');
    expect(r.sectionSuffix).toBe('30');
    expect(r.headnote).toBe('First degree murder');
  });
  it('parses dotted heading with double-spaces', () => {
    const r = parseSectionHeading('§32.10.  Repealed by Acts 2022, No. 545, §4.');
    expect(r.sectionSuffix).toBe('32.10');
    expect(r.headnote).toMatch(/^Repealed/);
  });
  it('parses §67. Theft', () => {
    const r = parseSectionHeading('§67. Theft');
    expect(r.sectionSuffix).toBe('67');
    expect(r.headnote).toBe('Theft');
  });
  it('returns null shape on garbage input', () => {
    expect(parseSectionHeading('').sectionSuffix).toBeNull();
    expect(parseSectionHeading('TITLE 14').sectionSuffix).toBeNull();
  });
});

// ─── la-html: TOC discovery against real fixture ──────────────────────────

describe('discoverSectionDescriptors (real Title 14 TOC)', () => {
  let descriptors;
  beforeAll(() => {
    const html = readFixture('title-14-toc.html');
    descriptors = discoverSectionDescriptors(html);
  });

  it('discovers a substantial number of sections (>= 400)', () => {
    expect(descriptors.length).toBeGreaterThanOrEqual(400);
  });

  it('every descriptor has a parseable Law.aspx?d=N URL', () => {
    for (const d of descriptors) {
      expect(d.sectionUrl).toMatch(/^https:\/\/www\.legis\.la\.gov\/legis\/Law\.aspx\?d=\d+$/);
      expect(d.docId).toMatch(/^\d+$/);
    }
  });

  it('every descriptor has a non-empty section suffix matching RS 14 grammar', () => {
    for (const d of descriptors) {
      expect(d.sectionSuffix).toMatch(/^\d+(\.\d+)*[A-Z]?$/);
    }
  });

  it('contains §30 (First degree murder)', () => {
    const m = descriptors.find((d) => d.sectionSuffix === '30');
    expect(m).toBeDefined();
    expect(m.docId).toBe('78397');
  });

  it('contains §67 (Theft)', () => {
    const m = descriptors.find((d) => d.sectionSuffix === '67');
    expect(m).toBeDefined();
    expect(m.docId).toBe('78605');
  });

  it('dedupes by docId', () => {
    const ids = new Set(descriptors.map((d) => d.docId));
    expect(ids.size).toBe(descriptors.length);
  });

  it('drops repealed entries (§32.10 should NOT appear)', () => {
    // §32.10 is repealed per fixture; right-cell anchor reads "Repealed by Acts ..."
    const m = descriptors.find((d) => d.sectionSuffix === '32.10');
    expect(m).toBeUndefined();
  });

  it('drops blank-range markers ("To 384 Blank")', () => {
    // §381-384 are blank — no descriptor for §381 since right cell says "To 384 Blank"
    const m = descriptors.find((d) => d.sectionSuffix === '381');
    expect(m).toBeUndefined();
  });

  it('drops the title-level "RS 14" parent entry', () => {
    // Anchor text "RS 14" without colon should not match parseRsCitation.
    const ids = descriptors.map((d) => d.docId);
    // Title-level entry uses docId 78223 in fixture; sections start with 14:1 (78224).
    // Without colon it should be filtered; with colon it's a valid section.
    const has78223 = ids.includes('78223');
    expect(has78223).toBe(false);
  });
});

describe('discoverSections (harness adapter)', () => {
  it('returns BucketB descriptor shape with chapterNum=14', () => {
    const html = readFixture('title-14-toc.html');
    const out = discoverSections(html, { titleNum: '14' });
    expect(out.length).toBeGreaterThanOrEqual(400);
    const sec30 = out.find((d) => d.sectionNum === '30');
    expect(sec30).toBeDefined();
    expect(sec30.chapterNum).toBe('14');
    expect(sec30.sectionUrl).toBe('https://www.legis.la.gov/legis/Law.aspx?d=78397');
  });
});

// ─── la-html: section page parser ──────────────────────────────────────────

describe('parseSection (real Section 14:30 fixture — First degree murder)', () => {
  it('parses heading and body', () => {
    const html = readFixture('section-14-30-first-degree-murder.html');
    const out = parseSection(html, '30');
    expect(out).not.toBeNull();
    expect(out.titleText).toBe('First degree murder');
    expect(out.bodyText.length).toBeGreaterThan(500);
    expect(out.bodyText).toContain('killing of a human being');
    expect(out.effectiveDate).toBeNull();
  });

  it('preserves subsection markers in body text', () => {
    const html = readFixture('section-14-30-first-degree-murder.html');
    const out = parseSection(html, '30');
    expect(out.bodyText).toMatch(/A\./);
    expect(out.bodyText).toMatch(/\(1\)/);
  });

  it('returns null when descriptor section disagrees with heading', () => {
    const html = readFixture('section-14-30-first-degree-murder.html');
    // Pretend we discovered §31 but page is §30 — must reject.
    expect(parseSection(html, '31')).toBeNull();
  });
});

describe('parseSection (real Section 14:67 fixture — Theft)', () => {
  it('parses with multi-subsection body', () => {
    const html = readFixture('section-14-67-theft.html');
    const out = parseSection(html, '67');
    expect(out).not.toBeNull();
    expect(out.titleText.toLowerCase()).toContain('theft');
    expect(out.bodyText.length).toBeGreaterThan(500);
    // Theft has lettered subsections A, B, C, D...
    expect(out.bodyText).toMatch(/A\./);
  });
});

describe('parseSection (real Section 14:32.10 fixture — Repealed)', () => {
  it('returns null for a repealed-shell section', () => {
    const html = readFixture('section-14-32_10-repealed.html');
    const out = parseSection(html, '32.10');
    expect(out).toBeNull();
  });
});

describe('parseSection edge cases', () => {
  it('returns null on empty / too-short input', () => {
    expect(parseSection('', '30')).toBeNull();
    expect(parseSection('<html></html>', '30')).toBeNull();
  });
});

// ─── seed-statutes-la-title14.mjs CLI / config ─────────────────────────────

describe('seed-statutes-la-title14: parseCliFlags', () => {
  it('parses --dry-run', () => {
    expect(parseCliFlags(['--dry-run'])).toEqual({
      dryRun: true, verbose: false, limit: null,
    });
  });
  it('parses --verbose and --limit', () => {
    expect(parseCliFlags(['--verbose', '--limit=5'])).toEqual({
      dryRun: false, verbose: true, limit: 5,
    });
  });
  it('rejects non-positive --limit', () => {
    expect(parseCliFlags(['--limit=0']).limit).toBeNull();
    expect(parseCliFlags(['--limit=abc']).limit).toBeNull();
  });
});

describe('seed-statutes-la-title14: buildTitleConfig', () => {
  it('emits canonical LA Title 14 config', () => {
    const cfg = buildTitleConfig();
    expect(cfg.stateCode).toBe('LA');
    expect(cfg.stateName).toBe('Louisiana');
    expect(cfg.titleNum).toBe('14');
    expect(cfg.chapterListUrl).toBe(LA_TITLE14_TOC_URL);
    expect(cfg.crawlDelayMs).toBeGreaterThanOrEqual(1000);
    expect(cfg.allowedHosts.has('www.legis.la.gov')).toBe(true);
    expect(cfg.allowedHosts.has('legis.la.gov')).toBe(true);
    expect(typeof cfg.discoverSections).toBe('function');
    expect(typeof cfg.parseSection).toBe('function');
    expect(typeof cfg.buildSourceUrl).toBe('function');
  });
});

describe('seed-statutes-la-title14: discoverSectionsAndIndex + buildSourceUrl', () => {
  it('priming discovery enables source-url lookup', () => {
    const html = readFixture('title-14-toc.html');
    const descriptors = discoverSectionsAndIndex(html, { titleNum: '14' });
    expect(descriptors.length).toBeGreaterThanOrEqual(400);
    // After priming, buildSourceUrl should resolve known sections.
    expect(buildSourceUrl('30')).toBe('https://www.legis.la.gov/legis/Law.aspx?d=78397');
    expect(buildSourceUrl('67')).toBe('https://www.legis.la.gov/legis/Law.aspx?d=78605');
  });

  it('throws on unindexed section number (defensive)', () => {
    // After the previous test the index has §30/§67 indexed; an unseen suffix
    // must throw rather than silently building a wrong URL.
    expect(() => buildSourceUrl('99999.xyz')).toThrow();
  });
});

describe('seed-statutes-la-title14: bucketBParse adapter', () => {
  it('returns null for repealed', () => {
    const html = readFixture('section-14-32_10-repealed.html');
    expect(bucketBParse(html, '32.10', { titleNum: '14' })).toBeNull();
  });
  it('returns titleText/bodyText for active', () => {
    const html = readFixture('section-14-30-first-degree-murder.html');
    const r = bucketBParse(html, '30', { titleNum: '14' });
    expect(r).not.toBeNull();
    expect(r.titleText).toBe('First degree murder');
    expect(r.bodyText).toContain('killing of a human being');
  });
});

describe('seed-statutes-la-title14: floor + constants', () => {
  it('LA_TITLE14 is "14"', () => {
    expect(LA_TITLE14).toBe('14');
  });
  it('row floor is conservative but non-trivial', () => {
    expect(LA_TITLE14_ROW_FLOOR).toBeGreaterThanOrEqual(250);
    expect(LA_TITLE14_ROW_FLOOR).toBeLessThanOrEqual(700);
  });
});
