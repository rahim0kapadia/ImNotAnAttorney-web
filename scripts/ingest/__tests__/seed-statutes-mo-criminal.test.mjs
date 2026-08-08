// test-isolation-na: no Supabase writes — unit tests against fixture HTML
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseMoSection,
  discoverMoSectionUrls,
  buildMoSourceUrl,
  buildMoChapterUrl,
  isValidMoSectionNum,
  stripHtml,
  MO_CHAPTERS,
  MO_CHAPTER_DESCRIPTIONS,
} from '../lib/mo-html.mjs';
import {
  parseCliFlags,
  buildChapterConfig,
  MO_COHORT_DEFAULT,
} from '../seed-statutes-mo-criminal.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX_DIR = path.join(__dirname, 'fixtures', 'mo');
const FIX_565020 = readFileSync(path.join(FIX_DIR, 'OneSection-565020-sample.html'), 'utf8');
const FIX_575030 = readFileSync(path.join(FIX_DIR, 'OneSection-575030-repealed.html'), 'utf8');
const FIX_577010 = readFileSync(path.join(FIX_DIR, 'OneSection-577010-subsections.html'), 'utf8');
const FIX_CH565 = readFileSync(path.join(FIX_DIR, 'OneChapter-565-sample.html'), 'utf8');

// ---------------------------------------------------------------------------
// buildMoSourceUrl
// ---------------------------------------------------------------------------

describe('buildMoSourceUrl', () => {
  it('builds canonical OneSection.aspx URL', () => {
    expect(buildMoSourceUrl('565.020')).toBe(
      'https://revisor.mo.gov/main/OneSection.aspx?section=565.020'
    );
  });
  it('returns HTTPS', () => {
    expect(buildMoSourceUrl('566.030')).toMatch(/^https:\/\//);
  });
  it('uses revisor.mo.gov host', () => {
    expect(buildMoSourceUrl('577.010')).toContain('revisor.mo.gov');
  });
  it('does NOT include the bid query parameter', () => {
    expect(buildMoSourceUrl('565.020')).not.toContain('bid=');
  });
});

// ---------------------------------------------------------------------------
// buildMoChapterUrl
// ---------------------------------------------------------------------------

describe('buildMoChapterUrl', () => {
  it('builds OneChapter.aspx URL for numeric chapter', () => {
    expect(buildMoChapterUrl('565')).toBe('https://revisor.mo.gov/main/OneChapter.aspx?chapter=565');
  });
  it('accepts numeric chapter argument', () => {
    expect(buildMoChapterUrl(195)).toBe('https://revisor.mo.gov/main/OneChapter.aspx?chapter=195');
  });
});

// ---------------------------------------------------------------------------
// MO_CHAPTERS / MO_CHAPTER_DESCRIPTIONS
// ---------------------------------------------------------------------------

describe('MO_CHAPTERS', () => {
  it('contains the 8 cohort chapters', () => {
    expect(MO_CHAPTERS).toEqual(['195', '565', '566', '569', '570', '571', '575', '577']);
  });
  it('every cohort chapter has a description', () => {
    for (const ch of MO_CHAPTERS) {
      expect(MO_CHAPTER_DESCRIPTIONS[ch]).toBeTruthy();
      expect(typeof MO_CHAPTER_DESCRIPTIONS[ch]).toBe('string');
    }
  });
  it('descriptions name expected criminal categories', () => {
    expect(MO_CHAPTER_DESCRIPTIONS['565']).toMatch(/Person/i);
    expect(MO_CHAPTER_DESCRIPTIONS['566']).toMatch(/Sexual/i);
    expect(MO_CHAPTER_DESCRIPTIONS['571']).toMatch(/Weapon/i);
    expect(MO_CHAPTER_DESCRIPTIONS['577']).toMatch(/Public Safety/i);
  });
});

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    expect(stripHtml('<b>Hi</b> <p>there</p>')).toBe('Hi there');
  });
  it('decodes &mdash; to hyphen', () => {
    expect(stripHtml('A &mdash; B')).toBe('A - B');
  });
  it('decodes &amp;', () => {
    expect(stripHtml('A &amp; B')).toContain('A & B');
  });
  it('decodes &nbsp; to whitespace', () => {
    const r = stripHtml('foo&nbsp;bar');
    expect(r).toContain('foo');
    expect(r).toContain('bar');
    expect(r).not.toContain('&nbsp;');
  });
  it('decodes section sign', () => {
    expect(stripHtml('See &sect; 565.020')).toContain('§');
  });
  it('collapses whitespace', () => {
    expect(stripHtml('  foo   bar  ')).toBe('foo bar');
  });
  it('strips script blocks fully', () => {
    expect(stripHtml('keep <script>var x=1;</script> end')).toBe('keep end');
  });
});

// ---------------------------------------------------------------------------
// isValidMoSectionNum
// ---------------------------------------------------------------------------

describe('isValidMoSectionNum', () => {
  it('accepts canonical N.NNN format', () => {
    expect(isValidMoSectionNum('565.020')).toBe(true);
    expect(isValidMoSectionNum('195.211')).toBe(true);
    expect(isValidMoSectionNum('1.010')).toBe(true);
  });
  it('accepts amended sections with trailing alpha', () => {
    expect(isValidMoSectionNum('565.020a')).toBe(true);
  });
  it('rejects malformed inputs', () => {
    expect(isValidMoSectionNum('')).toBe(false);
    expect(isValidMoSectionNum(null)).toBe(false);
    expect(isValidMoSectionNum(undefined)).toBe(false);
    expect(isValidMoSectionNum('565')).toBe(false);
    expect(isValidMoSectionNum('565.020.5')).toBe(false);
    expect(isValidMoSectionNum('aaa.020')).toBe(false);
    expect(isValidMoSectionNum('565.aaa')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// discoverMoSectionUrls
// ---------------------------------------------------------------------------

describe('discoverMoSectionUrls (real chapter fixture)', () => {
  let descs;
  beforeAll(() => {
    descs = discoverMoSectionUrls(FIX_CH565, '565');
  });

  it('discovers at least 6 unique sections in the fixture', () => {
    expect(descs.length).toBeGreaterThanOrEqual(6);
  });

  it('every descriptor has chapterNum / sectionNum / sectionUrl', () => {
    for (const d of descs) {
      expect(d.chapterNum).toBe('565');
      expect(d.sectionNum).toMatch(/^565\.\d{3}/);
      expect(d.sectionUrl).toMatch(/^https:\/\/revisor\.mo\.gov\/main\/OneSection\.aspx\?section=565\./);
    }
  });

  it('discovers the murder section 565.020', () => {
    const m = descs.find(d => d.sectionNum === '565.020');
    expect(m).toBeDefined();
  });

  it('de-duplicates repeated section links', () => {
    const counts = new Map();
    for (const d of descs) counts.set(d.sectionNum, (counts.get(d.sectionNum) || 0) + 1);
    for (const [, c] of counts) expect(c).toBe(1);
  });

  it('filters out sections from other chapters (cross-refs)', () => {
    for (const d of descs) {
      expect(d.sectionNum.startsWith('565.')).toBe(true);
    }
    // The fixture includes a "999.999" link — it must NOT be in output
    expect(descs.find(d => d.sectionNum === '999.999')).toBeUndefined();
  });

  it('canonical URLs do not include bid', () => {
    for (const d of descs) expect(d.sectionUrl).not.toContain('bid=');
  });

  it('returns empty array for HTML with no PageSelect links', () => {
    expect(discoverMoSectionUrls('<html><body>nothing</body></html>', '565')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseMoSection — real fixture (565.020 first-degree murder)
// ---------------------------------------------------------------------------

describe('parseMoSection 565.020 (real fixture)', () => {
  let parsed;
  beforeAll(() => {
    parsed = parseMoSection(FIX_565020, '565.020');
  });

  it('returns non-null', () => expect(parsed).not.toBeNull());

  it('titleText starts with "First degree murder"', () => {
    expect(parsed.titleText).toMatch(/^First degree murder/);
  });

  it('titleText does NOT start with the section number prefix', () => {
    expect(parsed.titleText.startsWith('565.020')).toBe(false);
  });

  it('titleText does NOT end with em-dash separator', () => {
    expect(parsed.titleText).not.toMatch(/[—–-]\s*$/);
  });

  it('bodyText mentions deliberation', () => {
    expect(parsed.bodyText).toMatch(/deliberation/i);
  });

  it('bodyText mentions class A felony', () => {
    expect(parsed.bodyText.toLowerCase()).toContain('class a felony');
  });

  it('bodyText does NOT contain raw HTML tags', () => {
    expect(parsed.bodyText).not.toMatch(/<[a-z]+/i);
  });

  it('bodyText does NOT contain unresolved entities', () => {
    expect(parsed.bodyText).not.toContain('&lt;');
    expect(parsed.bodyText).not.toContain('&amp;');
    expect(parsed.bodyText).not.toContain('&nbsp;');
    expect(parsed.bodyText).not.toContain('&mdash;');
  });

  it('bodyText excludes history trailer (no S.B. / H.B. revision codes)', () => {
    expect(parsed.bodyText).not.toMatch(/A\.L\.\s*\d{4}/);
    expect(parsed.bodyText).not.toMatch(/CROSS REFERENCE/i);
  });

  it('bodyText excludes "Effective" footnote', () => {
    expect(parsed.bodyText).not.toMatch(/Effective\s+\d/);
  });
});

// ---------------------------------------------------------------------------
// parseMoSection — DWI subsections fixture
// ---------------------------------------------------------------------------

describe('parseMoSection 577.010 (subsection list)', () => {
  let parsed;
  beforeAll(() => { parsed = parseMoSection(FIX_577010, '577.010'); });

  it('parses cleanly', () => expect(parsed).not.toBeNull());
  it('titleText is "Driving while intoxicated"', () => {
    expect(parsed.titleText).toBe('Driving while intoxicated.');
  });
  it('bodyText preserves all 3 subsection markers (1) (2) (3)', () => {
    expect(parsed.bodyText).toContain('(1)');
    expect(parsed.bodyText).toContain('(2)');
    expect(parsed.bodyText).toContain('(3)');
  });
  it('bodyText keeps the cross-reference text but strips anchor tags', () => {
    expect(parsed.bodyText).toContain('577.023');
    expect(parsed.bodyText).not.toMatch(/<a /);
  });
  it('bodyText excludes the foot section', () => {
    expect(parsed.bodyText).not.toMatch(/A\.L\.\s*\d{4}/);
    expect(parsed.bodyText).not.toMatch(/Effective\s+\d/);
  });
});

// ---------------------------------------------------------------------------
// parseMoSection — repealed section fixture
// ---------------------------------------------------------------------------

describe('parseMoSection 575.030 (repealed)', () => {
  it('does NOT crash on repealed section without body', () => {
    const parsed = parseMoSection(FIX_575030, '575.030');
    expect(parsed).not.toBeNull();
    expect(parsed.titleText.toLowerCase()).toContain('repealed');
  });
});

// ---------------------------------------------------------------------------
// parseMoSection — degenerate inputs
// ---------------------------------------------------------------------------

describe('parseMoSection (degenerate inputs)', () => {
  it('returns null for empty string', () => {
    expect(parseMoSection('', '565.020')).toBeNull();
  });
  it('returns null for HTML missing the body div', () => {
    expect(parseMoSection('<html><body>nothing</body></html>', '565.020')).toBeNull();
  });
  it('returns null for HTML where section number does not match', () => {
    expect(parseMoSection(FIX_565020, '999.999')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseCliFlags
// ---------------------------------------------------------------------------

describe('parseCliFlags', () => {
  it('defaults all flags off', () => {
    const f = parseCliFlags([]);
    expect(f).toEqual({ dryRun: false, verbose: false, limit: null, chapters: null });
  });
  it('parses --dry-run', () => {
    expect(parseCliFlags(['--dry-run']).dryRun).toBe(true);
  });
  it('parses --verbose', () => {
    expect(parseCliFlags(['--verbose']).verbose).toBe(true);
  });
  it('parses --limit=5', () => {
    expect(parseCliFlags(['--limit=5']).limit).toBe(5);
  });
  it('rejects garbage --limit values (stays null)', () => {
    expect(parseCliFlags(['--limit=abc']).limit).toBe(null);
  });
  it('parses --chapters=565,566', () => {
    expect(parseCliFlags(['--chapters=565,566']).chapters).toEqual(['565', '566']);
  });
  it('drops invalid chapter labels (e.g. "abc")', () => {
    expect(parseCliFlags(['--chapters=565,abc,566']).chapters).toEqual(['565', '566']);
  });
  it('returns null chapters when none valid', () => {
    expect(parseCliFlags(['--chapters=,,abc']).chapters).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// buildChapterConfig
// ---------------------------------------------------------------------------

describe('buildChapterConfig', () => {
  it('produces a complete BucketBStateConfig for chapter 565', () => {
    const cfg = buildChapterConfig('565');
    expect(cfg.stateCode).toBe('MO');
    expect(cfg.stateName).toBe('Missouri');
    expect(cfg.titleNum).toBe('565');
    expect(cfg.titleLabel).toMatch(/Person/);
    expect(cfg.chapterListUrl).toBe('https://revisor.mo.gov/main/OneChapter.aspx?chapter=565');
    expect(typeof cfg.discoverSections).toBe('function');
    expect(typeof cfg.parseSection).toBe('function');
    expect(typeof cfg.buildSourceUrl).toBe('function');
    expect(cfg.crawlDelayMs).toBeGreaterThanOrEqual(1500);
    expect(cfg.allowedHosts.has('revisor.mo.gov')).toBe(true);
  });

  it('discoverSections is bound to the chapter and filters cross-refs', () => {
    const cfg565 = buildChapterConfig('565');
    const desc565 = cfg565.discoverSections(FIX_CH565, cfg565);
    expect(desc565.length).toBeGreaterThan(0);
    for (const d of desc565) expect(d.sectionNum).toMatch(/^565\./);

    // Different chapter binding ignores 565.* links. Fixture has one planted
    // 999.999 link — that one IS a 999-prefixed link so the 999-bound config
    // legitimately discovers it (1 match expected). Any other chapter binding
    // (e.g. 566) yields 0 matches against the 565 fixture.
    const cfg566 = buildChapterConfig('566');
    const desc566 = cfg566.discoverSections(FIX_CH565, cfg566);
    expect(desc566.length).toBe(0);
  });

  it('parseSection bridges to parseMoSection', () => {
    const cfg = buildChapterConfig('565');
    const out = cfg.parseSection(FIX_565020, '565.020', cfg);
    expect(out).not.toBeNull();
    expect(out.titleText).toMatch(/^First degree murder/);
  });

  it('buildSourceUrl produces canonical OneSection.aspx URLs', () => {
    const cfg = buildChapterConfig('565');
    expect(cfg.buildSourceUrl('565.020')).toBe(
      'https://revisor.mo.gov/main/OneSection.aspx?section=565.020'
    );
  });
});

// ---------------------------------------------------------------------------
// MO_COHORT_DEFAULT export
// ---------------------------------------------------------------------------

describe('MO_COHORT_DEFAULT', () => {
  it('matches MO_CHAPTERS', () => {
    expect(MO_COHORT_DEFAULT).toEqual(MO_CHAPTERS);
  });
});
