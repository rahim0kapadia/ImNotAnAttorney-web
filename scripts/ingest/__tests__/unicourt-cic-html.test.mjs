// Template: scripts/ingest/__tests__/seed-statutes-ar-title5.test.mjs
// test-isolation-na: pure unit tests against captured HTML fixtures, no DB writes
// Pattern: cl-bulk-data-defensive #18 (parser feeds shared unicourt-harness)
//
// Cross-state unit tests for the shared UniCourt cic-code-* HTML parser.
// Verifies the universal h3-section-id pattern works for every Wave 1A state
// (AK / KY / ND / RI / TN / VT — ID is excluded; covered separately by
// scripts/ingest/seed-statutes-id-title18.mjs which uses the LR.O XML harness).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseUnicourtTitle,
  parseSectionId,
  stripHtml,
  extractHeadingText,
  buildUnicourtFragmentUrl,
  findSectionAnchors,
  findCommentaryBoundary,
  findNextChapterBoundary,
  COMMENTARY_TOKENS,
} from '../lib/unicourt-cic-html.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures');

function loadFixture(slug) {
  return readFileSync(path.join(FIXTURE_DIR, slug, 'title-sample.html'), 'utf8');
}

// ---------------------------------------------------------------------------
// parseSectionId — universal id decoder
// ---------------------------------------------------------------------------

describe('parseSectionId', () => {
  it('parses AK section id (no part, dotted section)', () => {
    expect(parseSectionId('t11c05s11.05.010')).toEqual({
      title: '11', part: null, chapter: '05', section: '11.05.010',
    });
  });

  it('parses ID section id (no part, hyphen-letter section)', () => {
    expect(parseSectionId('t18c01s18-101A')).toEqual({
      title: '18', part: null, chapter: '01', section: '18-101A',
    });
  });

  it('parses KY section id (Title L = "0L")', () => {
    expect(parseSectionId('t0Lc500s500.010')).toEqual({
      title: '0L', part: null, chapter: '500', section: '500.010',
    });
  });

  it('parses ND section id (dotted title 12.1, hyphen chapter)', () => {
    expect(parseSectionId('t12.1c12.1-01s12.1-01-01')).toEqual({
      title: '12.1', part: null, chapter: '12.1-01', section: '12.1-01-01',
    });
  });

  it('parses RI section id', () => {
    expect(parseSectionId('t11c01s11-1-1')).toEqual({
      title: '11', part: null, chapter: '01', section: '11-1-1',
    });
  });

  it('parses TN section id', () => {
    expect(parseSectionId('t39c01s39-1-101')).toEqual({
      title: '39', part: null, chapter: '01', section: '39-1-101',
    });
  });

  it('parses VT section id (with part)', () => {
    expect(parseSectionId('t13p01c01s01')).toEqual({
      title: '13', part: '01', chapter: '01', section: '01',
    });
  });

  it('returns null for nav anchors (-snav suffix)', () => {
    expect(parseSectionId('t11c05s11.05.010-snav01')).toBeNull();
  });

  it('returns null for empty / non-string input', () => {
    expect(parseSectionId('')).toBeNull();
    expect(parseSectionId(null)).toBeNull();
    expect(parseSectionId(undefined)).toBeNull();
  });

  it('returns null for non-cic-code anchors (chapter, ToC, etc)', () => {
    expect(parseSectionId('chapter-1')).toBeNull();
    expect(parseSectionId('t11c05')).toBeNull(); // no s segment
  });
});

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------

describe('stripHtml', () => {
  it('removes all tags', () => {
    expect(stripHtml('<b>Hello</b> <p>World</p>')).toBe('Hello World');
  });
  it('decodes &lt; &gt; &amp; &nbsp; AFTER stripping tags (no tag re-emergence)', () => {
    // Order: strip tags first, decode entities after. This means `&lt;b&gt;`
    // — entity-encoded — becomes literal `<b>` text in OUTPUT, but that's only
    // because there's no real <b> tag context. Confirm:
    const r = stripHtml('a &lt;b&gt; &amp; c&nbsp;d');
    expect(r).toContain('<b>');     // entities decoded post-strip → literal text
    expect(r).toContain('& c');
  });

  it('does NOT re-emerge entity-encoded tags as live HTML (KY citation pattern)', () => {
    // Real-world KY/TN body: <pre>&lt;a href&gt;</pre> — should produce text,
    // not a live <a> tag in output (or worse, get re-stripped on a 2nd pass).
    const r = stripHtml('<p>See &lt;a href&gt;link&lt;/a&gt; here</p>');
    // After tag-strip the <p> wrapper is gone, then entities decode to literal text:
    expect(r).toContain('<a href>');
    expect(r).toContain('link');
    expect(r).not.toContain('<p>');
  });
  it('decodes § entity variants', () => {
    expect(stripHtml('See &#167; 18-101')).toContain('§');
    expect(stripHtml('See &sect; 18-101')).toContain('§');
  });
  it('drops C0 controls and DEL', () => {
    const r = stripHtml('a&#0;b&#7;c&#127;d');
    for (const ch of r) {
      const code = ch.charCodeAt(0);
      const bad = (code < 0x20 && code !== 0x09 && code !== 0x0A && code !== 0x0D) || code === 0x7F;
      expect(bad).toBe(false);
    }
  });
  it('collapses whitespace', () => {
    expect(stripHtml('  foo   bar  ')).toBe('foo bar');
  });
  it('returns empty for null / empty / undefined', () => {
    expect(stripHtml(null)).toBe('');
    expect(stripHtml('')).toBe('');
    expect(stripHtml(undefined)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// extractHeadingText — strip "§ " / "Sec. " / "Secs. " + leading section number
// ---------------------------------------------------------------------------

describe('extractHeadingText', () => {
  it('strips Sec. prefix and section number', () => {
    const t = extractHeadingText('<b> Sec. 11.05.010. Crimes defined. </b>', '11.05.010');
    expect(t).toBe('Crimes defined.');
  });

  it('strips § prefix variant (KY)', () => {
    // KY has no § but uses "500.010. Title."
    const t = extractHeadingText('<b> 500.010. Title. </b>', '500.010');
    expect(t).toBe('Title.');
  });

  it('strips § prefix variant (ID style)', () => {
    const t = extractHeadingText('§ 18-100. Title, effect of prior law.', '18-100');
    expect(t).toContain('Title, effect of prior law');
  });

  it('handles range-section heading (Secs. plural)', () => {
    const t = extractHeadingText('<b> Secs. 11.05.140 — 11.05.150. Imposition. </b>', '11.05.140');
    // Range remainder is preserved (legitimate source artifact)
    expect(t).toContain('Imposition');
  });
});

// ---------------------------------------------------------------------------
// buildUnicourtFragmentUrl
// ---------------------------------------------------------------------------

describe('buildUnicourtFragmentUrl', () => {
  it('builds canonical https fragment url (no part)', () => {
    const u = buildUnicourtFragmentUrl(
      'https://unicourt.github.io/cic-code-ak/transforms/ak/ocak/r78/gov.ak.code.title.11.html',
      '11', null, '05', '11.05.010',
    );
    expect(u).toBe(
      'https://unicourt.github.io/cic-code-ak/transforms/ak/ocak/r78/gov.ak.code.title.11.html#t11c05s11.05.010',
    );
  });

  it('builds canonical https fragment url (with part — VT)', () => {
    const u = buildUnicourtFragmentUrl(
      'https://unicourt.github.io/cic-code-vt/transforms/vt/ocvt/r81/gov.vt.vsa.title.13.html',
      '13', '01', '01', '01',
    );
    expect(u).toBe(
      'https://unicourt.github.io/cic-code-vt/transforms/vt/ocvt/r81/gov.vt.vsa.title.13.html#t13p01c01s01',
    );
  });

  it('always returns an https URL', () => {
    const u = buildUnicourtFragmentUrl('https://x.example/y.html', 'L', null, '500', '500.010');
    expect(u).toMatch(/^https:\/\//);
  });
});

// ---------------------------------------------------------------------------
// COMMENTARY_TOKENS — sanity
// ---------------------------------------------------------------------------

describe('COMMENTARY_TOKENS', () => {
  it('includes the canonical commentary suffixes', () => {
    expect(COMMENTARY_TOKENS).toContain('-history');
    expect(COMMENTARY_TOKENS).toContain('-CASENOTES');
    expect(COMMENTARY_TOKENS).toContain('-OPINIONSOFATTORNEYGENERAL');
    expect(COMMENTARY_TOKENS).toContain('-ANNOTATIONS');
  });
});

// ---------------------------------------------------------------------------
// Cross-state fixture parse — each state must yield ≥1 valid section
// ---------------------------------------------------------------------------

const STATE_FIXTURES = [
  { code: 'AK', slug: 'ak', titleId: '11', sectionPattern: /^11\./ },
  { code: 'KY', slug: 'ky', titleId: '0L', sectionPattern: /^\d{3}\./ },
  { code: 'ND', slug: 'nd', titleId: '12.1', sectionPattern: /^12\.1-/ },
  { code: 'RI', slug: 'ri', titleId: '11', sectionPattern: /^11-\d+-/ },
  { code: 'TN', slug: 'tn', titleId: '39', sectionPattern: /^39-\d+-/ },
  { code: 'VT', slug: 'vt', titleId: '13', sectionPattern: /^\d+[A-Za-z]*$/ },
];

describe('parseUnicourtTitle (per-state fixtures)', () => {
  for (const { code, slug, titleId, sectionPattern } of STATE_FIXTURES) {
    describe(code, () => {
      const html = loadFixture(slug);
      const sections = parseUnicourtTitle(html, { expectedTitle: titleId });

      it('parses ≥1 section from fixture', () => {
        expect(sections.length).toBeGreaterThan(0);
      });

      it('every section has non-empty titleText + bodyText', () => {
        for (const s of sections) {
          expect(s.titleText.length).toBeGreaterThan(0);
          expect(s.bodyText.length).toBeGreaterThan(0);
        }
      });

      it('every sectionNum matches state-specific pattern', () => {
        for (const s of sections) {
          expect(s.sectionNum).toMatch(sectionPattern);
        }
      });

      it('every chapterNum is non-empty', () => {
        for (const s of sections) {
          expect(s.chapterNum.length).toBeGreaterThan(0);
        }
      });

      it('bodyText does not contain real HTML structural tags', () => {
        // Note: entity-encoded snippets like `&lt;a href&gt;` may decode to
        // `<a href>` as PLAIN TEXT after tag-strip (our intentional order).
        // We forbid only structural tags that would mean tag-strip failed.
        for (const s of sections) {
          expect(s.bodyText).not.toMatch(/<\/(?:p|div|span|h[1-6]|li|ul|ol|table|tr|td|cite|b|i|em|strong|nav|article|section|header|footer)>/i);
        }
      });

      it('titleText does not contain real HTML structural tags', () => {
        for (const s of sections) {
          expect(s.titleText).not.toMatch(/<\/(?:p|div|span|h[1-6]|li|ul|ol|table|tr|td|cite|b|i|em|strong|nav|article|section|header|footer)>/i);
        }
      });

      it('bodyText is not absurdly long (≤4000 chars)', () => {
        for (const s of sections) {
          expect(s.bodyText.length).toBeLessThanOrEqual(4000);
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// findSectionAnchors — count check on AK fixture
// ---------------------------------------------------------------------------

describe('findSectionAnchors (AK fixture)', () => {
  it('returns ordered list with monotonically increasing openIdx', () => {
    const html = loadFixture('ak');
    const anchors = findSectionAnchors(html);
    expect(anchors.length).toBeGreaterThan(0);
    for (let i = 1; i < anchors.length; i++) {
      expect(anchors[i].openIdx).toBeGreaterThan(anchors[i - 1].openIdx);
    }
  });
});

// ---------------------------------------------------------------------------
// findCommentaryBoundary
// ---------------------------------------------------------------------------

describe('findCommentaryBoundary', () => {
  it('finds the first commentary <h4> in a synthetic doc', () => {
    const html =
      '<h3 id="t1c1s1-1"><b>Test</b></h3>' +
      '<p>Statute body text.</p>' +
      '<div><h4 id="t1c1s1-1-history"><b>History</b></h4>' +
      '<p>Old amendments.</p></div>';
    const idx = findCommentaryBoundary(html, 0);
    expect(idx).toBeGreaterThan(-1);
    expect(html.slice(idx, idx + 4)).toBe('<h4 ');
  });

  it('returns -1 when no commentary tag is present', () => {
    const html = '<h3 id="t1c1s1-1"><b>Test</b></h3><p>Just statute text.</p>';
    expect(findCommentaryBoundary(html, 0)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// findNextChapterBoundary — h2 chapter divider stops body bleed
// ---------------------------------------------------------------------------

describe('findNextChapterBoundary', () => {
  it('locates next <h2 ... id="t..c..">', () => {
    const html =
      '<h3 id="t11c05s11.05.140"><b>Test</b></h3>' +
      '<p></p>' +
      '<h2 class="oneh2" id="t11c10"><b>Chapter 10</b></h2>';
    const idx = findNextChapterBoundary(html, 0);
    expect(idx).toBeGreaterThan(-1);
    expect(html.slice(idx, idx + 4)).toBe('<h2 ');
  });

  it('returns -1 when no chapter h2 follows', () => {
    const html = '<h3 id="t11c05s11.05.140"><b>Test</b></h3><p>body</p>';
    expect(findNextChapterBoundary(html, 0)).toBe(-1);
  });
});
