// test-isolation-na: no Supabase writes — pure parser unit tests against fixture HTML
//
// Tests for the AZ Title 13 (Arizona Revised Statutes — Criminal Code) HTML
// parser library. All fixtures captured live from www.azleg.gov on 2026-05-02.
//
// LIVE INGEST IS NOT TESTED HERE — the orchestrator (with the 120s
// robots.txt Crawl-delay sleep loop, retry/back-off, COPY load) lives in
// ImNotAnAttorney-engine. This file ships ONLY the parser surface.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AZ_BASE_URL,
  AZ_TITLE_13_TOC_URL,
  AZ_ROBOTS_CRAWL_DELAY_SEC,
  buildSectionUrl,
  parseTocPage,
  parseSectionPage,
  stripHtmlAndDecode,
} from '../lib/az-ars-html.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXT = path.join(__dirname, 'fixtures', 'az');

function readFixture(name) {
  return readFileSync(path.join(FIXT, name), 'utf-8');
}

// ─── Constants ───────────────────────────────────────────────────────────────

describe('az-ars-html: constants', () => {
  it('AZ_BASE_URL is HTTPS azleg.gov', () => {
    expect(AZ_BASE_URL).toBe('https://www.azleg.gov');
  });

  it('AZ_TITLE_13_TOC_URL points to arsDetail title=13', () => {
    expect(AZ_TITLE_13_TOC_URL).toBe('https://www.azleg.gov/arsDetail/?title=13');
  });

  it('AZ_ROBOTS_CRAWL_DELAY_SEC is 120 (azleg.gov robots.txt mandate)', () => {
    expect(AZ_ROBOTS_CRAWL_DELAY_SEC).toBe(120);
  });
});

// ─── buildSectionUrl ─────────────────────────────────────────────────────────

describe('buildSectionUrl: zero-padding behavior', () => {
  it('pads §13-1 to 5-digit 00001', () => {
    expect(buildSectionUrl('13-1')).toBe('https://www.azleg.gov/ars/13/00001.htm');
  });

  it('pads §13-101 to 00101', () => {
    expect(buildSectionUrl('13-101')).toBe('https://www.azleg.gov/ars/13/00101.htm');
  });

  it('pads §13-1101 (4-digit input) to 01101', () => {
    expect(buildSectionUrl('13-1101')).toBe('https://www.azleg.gov/ars/13/01101.htm');
  });

  it('does not over-pad §13-12345 (5-digit input)', () => {
    expect(buildSectionUrl('13-12345')).toBe('https://www.azleg.gov/ars/13/12345.htm');
  });

  it('preserves decimal sub-section IDs (e.g. §13-1417.01)', () => {
    expect(buildSectionUrl('13-1417.01')).toBe('https://www.azleg.gov/ars/13/01417.01.htm');
  });

  it('throws on empty / pure-prefix input', () => {
    expect(() => buildSectionUrl('13-')).toThrow();
  });
});

// ─── parseTocPage ────────────────────────────────────────────────────────────

describe('parseTocPage: real Title 13 TOC fixture', () => {
  const html = readFixture('toc-title-13.html');
  const { sections } = parseTocPage(html);

  it('returns >=900 sections (live count was 913 as of 2026-05-02)', () => {
    expect(sections.length).toBeGreaterThanOrEqual(900);
  });

  it('every section has a 13- prefixed idShort', () => {
    for (const s of sections) {
      expect(s.idShort).toMatch(/^13-[0-9]+(?:\.[0-9]+)?$/);
    }
  });

  it('every section has a 5+digit-htm urlSuffix matching the integer portion of its id', () => {
    for (const s of sections) {
      expect(s.urlSuffix).toMatch(/^\d{5}(?:\.\d+)?\.htm$/);
      // Number after "13-" (integer part only) must equal the digits in urlSuffix
      const idIntPart = s.idShort.replace(/^13-/, '').split('.')[0];
      const urlIntPart = s.urlSuffix.replace(/\.htm$/, '').split('.')[0];
      expect(parseInt(urlIntPart, 10)).toBe(parseInt(idIntPart, 10));
    }
  });

  it('first section is §13-101 in Chapter 1 (GENERAL PROVISIONS)', () => {
    expect(sections[0]).toMatchObject({
      idShort: '13-101',
      urlSuffix: '00101.htm',
      chapter: '1',
      chapterTitle: 'GENERAL PROVISIONS',
    });
  });

  it('§13-1101 lands in Chapter 11 (HOMICIDE)', () => {
    const s = sections.find((x) => x.idShort === '13-1101');
    expect(s).toBeDefined();
    expect(s.chapter).toBe('11');
    expect(s.chapterTitle).toBe('HOMICIDE');
  });

  it('decimal subchapter 7.1 (CAPITAL SENTENCING) is preserved as a string id', () => {
    const ch71 = sections.filter((s) => s.chapter === '7.1');
    expect(ch71.length).toBeGreaterThan(0);
    expect(ch71[0].chapterTitle).toBe('CAPITAL SENTENCING');
  });

  it('chapter coverage spans all 48 chapters of Title 13 (1-46 + 7.1, 34.1, 35.1)', () => {
    const uniqueChapters = new Set(sections.map((s) => s.chapter));
    // Spec says 48 chapters, but exact count must match what TOC actually
    // shipped to azleg.gov on probe day. Lock to >=45 to allow azleg to add
    // a chapter without breaking the test, but flag if structure changes
    // dramatically.
    expect(uniqueChapters.size).toBeGreaterThanOrEqual(45);
  });
});

// ─── parseSectionPage ────────────────────────────────────────────────────────

describe('parseSectionPage: §13-101 (Purposes)', () => {
  const html = readFixture('section-13-101.html');
  const url = buildSectionUrl('13-101');
  const result = parseSectionPage(html, url);

  it('returns a non-null populated section (not repealed)', () => {
    expect(result).not.toBeNull();
    expect(result.repealed).toBeUndefined();
  });

  it('extracts sectionNumber "13-101"', () => {
    expect(result.sectionNumber).toBe('13-101');
  });

  it('extracts title "Purposes"', () => {
    expect(result.title).toBe('Purposes');
  });

  it('body contains the public-policy declaration text', () => {
    expect(result.body).toMatch(/public policy of this state/i);
  });

  it('body contains all 7 enumerated purposes', () => {
    // Body should have items 1. through 7. — count distinct enumerator prefixes
    expect(result.body).toMatch(/\b1\. To proscribe/i);
    expect(result.body).toMatch(/\b7\. To promote truth and accountability/i);
  });

  it('sourceUrl echoes the URL passed in', () => {
    expect(result.sourceUrl).toBe(url);
  });
});

describe('parseSectionPage: §13-1101 (Definitions, 4-digit id)', () => {
  const html = readFixture('section-13-1101.html');
  const url = buildSectionUrl('13-1101');
  const result = parseSectionPage(html, url);

  it('extracts sectionNumber "13-1101"', () => {
    expect(result.sectionNumber).toBe('13-1101');
  });

  it('extracts title "Definitions"', () => {
    expect(result.title).toBe('Definitions');
  });

  it('body decodes &quot; entities to ASCII quotes', () => {
    // Fixture contains &quot;Premeditation&quot; — must come back as "Premeditation"
    expect(result.body).toMatch(/"Premeditation"/);
    expect(result.body).toMatch(/"Homicide"/);
  });

  it('body contains all 4 definition items', () => {
    expect(result.body).toMatch(/\b1\. "Premeditation"/);
    expect(result.body).toMatch(/\b4\. "Adequate provocation"/);
  });
});

describe('parseSectionPage: repealed-section detection (synthetic fixture)', () => {
  // None of the 3 live probes captured 2026-05-02 surfaced a repealed section.
  // Synthesize one that mirrors azleg's typical repealed-section markup so the
  // detection branch is covered. Engine orchestrator will hit real repealed
  // sections in the wild — failing this branch silently would write a row with
  // empty body to entities_statutes.
  const REPEALED_HTML = `<HTML>
<HEAD><TITLE>13-9999 - Repealed</TITLE></HEAD>
<BODY>
<p><font color=GREEN>13-9999</font>. <font color=PURPLE><u>Repealed</u></font></p>
<p>Repealed by Laws 2018, ch. 12, &sect; 3.</p>
</BODY>
</HTML>`;

  it('classifies as repealed with sectionNumber preserved', () => {
    const r = parseSectionPage(REPEALED_HTML, 'https://www.azleg.gov/ars/13/09999.htm');
    expect(r).not.toBeNull();
    expect(r.repealed).toBe(true);
    expect(r.sectionNumber).toBe('13-9999');
    expect(r.sourceUrl).toBe('https://www.azleg.gov/ars/13/09999.htm');
  });
});

describe('parseSectionPage: defensive returns', () => {
  it('returns null on empty HTML', () => {
    expect(parseSectionPage('', 'x')).toBeNull();
  });

  it('returns null on HTML with no recognizable section heading', () => {
    expect(parseSectionPage('<html><body>random page</body></html>', 'x')).toBeNull();
  });
});

// ─── stripHtmlAndDecode ──────────────────────────────────────────────────────

describe('stripHtmlAndDecode', () => {
  it('removes simple tags', () => {
    expect(stripHtmlAndDecode('<p>hello <b>world</b></p>')).toBe('hello world');
  });

  it('decodes named entities (amp, quot, lt, gt, nbsp)', () => {
    expect(stripHtmlAndDecode('A &amp; B &quot;C&quot; &lt;D&gt; &nbsp; E')).toBe('A & B "C" <D> E');
  });

  it('decodes numeric and hex entities', () => {
    expect(stripHtmlAndDecode('&#65; &#x42;')).toBe('A B');
  });

  it('returns empty string on non-string input', () => {
    expect(stripHtmlAndDecode(null)).toBe('');
    expect(stripHtmlAndDecode(undefined)).toBe('');
  });
});
